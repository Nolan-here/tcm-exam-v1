import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:4173/';
let browser;
before(async () => {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE || chromium.executablePath(),
  });
});
after(async () => { await browser?.close(); });

async function openPage(t, options = {}) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, [], '不应出现浏览器运行或资源错误');
  });
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('[data-subject-id]').length === 11);
  return { page, context };
}

async function readState(page) {
  return page.evaluate(async () => (await import('./js/db.js')).loadState());
}

async function startReview(page, count = '10') {
  if (await page.locator('[data-review-panel]').getAttribute('open') === null) {
    await page.locator('[data-review-summary]').click();
  }
  await page.locator('[data-open-review]').click();
  await page.locator(`[data-review-count="${count}"]`).click();
  await page.locator('.question-card').first().waitFor();
}

async function answerCard(page, card, correct) {
  const id = await card.getAttribute('data-question-id');
  const question = await page.evaluate(async questionId => (
    (await import('./js/questions-bank.js')).getQuestionById(questionId)
  ), id);
  const letter = correct ? question.answer : Object.keys(question.options).find(value => value !== question.answer);
  await card.locator(`input[value="${letter}"]`).focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(({ id, correct }) => {
    const card = document.querySelector(`[data-question-id="${id}"]`);
    return Boolean(card.querySelector(correct ? '.selected-correct' : '.selected-wrong'));
  }, { id, correct });
  return question;
}

async function assertHome(page, context, focusSelector, previousMessage) {
  await page.waitForFunction(selector => document.activeElement?.matches(selector), focusSelector);
  // 等待延迟通知和焦点回调，避免只检查切换的瞬间。
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator('#live-status').textContent(), '');
  assert.equal(await page.locator('#live-status').getAttribute('aria-live'), 'polite');
  assert.equal(await page.locator('#live-status').getAttribute('aria-atomic'), 'true');
  assert.equal(await page.locator('.question-card').count(), 0);
  assert.equal(await page.locator('[data-open-exam]').count(), 1);
  assert.equal(await page.locator('[data-open-wrong-book]').count(), 1);
  const cdp = await context.newCDPSession(page);
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  await cdp.detach();
  assert.equal(nodes.some(node => !node.ignored && node.name?.value === previousMessage), false,
    '首页无障碍树不能保留上页通知');
}

for (const profile of [
  { name: '桌面', viewport: { width: 1366, height: 768 } },
  { name: '移动视口', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
]) {
  test(`${profile.name}：三模式开始后、作答后和连续切换返回首页清除旧通知`, async t => {
    const { page, context } = await openPage(t, profile);
    for (const mode of ['review', 'exam', 'wrong-book']) {
      for (const answered of [false, true]) {
        if (mode === 'review') await startReview(page);
        if (mode === 'exam') {
          await page.locator('[data-open-exam]').click();
          await page.locator('[data-exam-unit="1"]').click();
          await page.locator('.question-card').first().waitFor();
        }
        if (mode === 'wrong-book') {
          await page.locator('[data-open-wrong-book]').click();
          await page.locator('.question-card').first().waitFor();
        }
        await page.waitForFunction(() => document.querySelector('#live-status').textContent.length > 0);
        if (answered) {
          if (mode === 'exam') await page.locator('.question-card input[value="A"]').first().check();
          else await answerCard(page, page.locator('.question-card').first(), false);
        }
        const message = await page.locator('#live-status').textContent();
        assert.ok(message.length > 0, '答题场景仍保留开始通知');
        if (mode === 'exam') await page.locator('[data-exam-units]').click();
        await page.locator('[data-home]').click();
        await assertHome(page, context, mode === 'review' ? '[data-open-review]' : `[data-open-${mode}]`, message);
      }
    }
    await page.locator('[data-open-exam]').click();
    assert.equal(await page.locator('[data-resume-exam]').count(), 1, '考试继续入口仍存在');
    await page.locator('[data-resume-exam]').click();
    assert.equal(await page.locator('.question-card input[value="A"]').first().isChecked(), true);
  });
}

test('同一帧快速返回首页时取消尚未写入的通知', async t => {
  const { page, context } = await openPage(t);
  await page.evaluate(() => {
    document.querySelector('[data-open-wrong-book]').click();
    document.querySelector('[data-home]').click();
  });
  await assertHome(page, context, '[data-open-wrong-book]', '错题本目前没有题目。');
});

test('翻页保存尚未完成时返回首页，不重新写入旧页提示或抢走焦点', async t => {
  const { page, context } = await openPage(t);
  await startReview(page, '50');
  const pageCount = (await page.locator('.pagination p').textContent()).match(/共 (\d+) 页/)[1];
  await page.evaluate(() => {
    document.querySelector('[data-go-page="2"]').click();
    document.querySelector('[data-home]').click();
  });
  // 再读同一存储，等待先前排队的写入完成。
  await readState(page);
  await assertHome(page, context, '[data-open-review]', `已到第 2 页，共 ${pageCount} 页。`);
});

async function seedWrongBook(page, ids) {
  await page.evaluate(async ids => {
    const db = await import('./js/db.js');
    const wrong = await import('./js/wrong-book.js');
    const state = await db.loadState();
    for (const id of ids) {
      wrong.recordWrongBookEntry(state.wrongBook, id, 'review');
      wrong.markWrongBookEntryCorrect(state.wrongBook, id);
    }
    await db.saveState(state);
  }, ids);
  // 固定本次独立测试的洗牌，只改变顺序，不改题库或正式状态。
  await page.addInitScript(() => { Math.random = () => 0.999999; });
  await page.reload({ waitUntil: 'networkidle' });
}

test('错题本移出分页末题后显示并聚焦下一题，末题与空状态焦点正确', async t => {
  const { page } = await openPage(t);
  const ids = ['2024-U1-001', '2024-U1-002', '2024-U1-101'];
  await seedWrongBook(page, ids);
  await page.locator('[data-open-wrong-book]').click();
  const second = page.locator(`[data-question-id="${ids[1]}"]`);
  await second.locator('summary').click();
  await second.locator('[data-remove-wrong]').click();
  await page.waitForFunction(id => document.activeElement?.id === `heading-${id}`, ids[2], { timeout: 3000 });
  assert.equal(await page.locator(`[data-question-id="${ids[2]}"]`).isVisible(), true);
  const last = page.locator(`[data-question-id="${ids[2]}"]`);
  await last.locator('summary').click();
  await last.locator('[data-remove-wrong]').click();
  await page.waitForFunction(id => document.activeElement?.id === `heading-${id}`, ids[0]);
  await page.locator('.question-card summary').click();
  await page.locator('[data-remove-wrong]').click();
  await page.waitForFunction(() => document.activeElement?.matches('.page-heading'));
  assert.equal(await page.locator('.question-card').count(), 0);
  assert.match(await page.locator('.notice').textContent(), /目前没有错题/);
  assert.equal(await page.locator('#live-status').textContent(), '本题已移出错题本。');
});

test('移出保存未完成时返回再进入错题本，旧操作不能覆盖新页面或通知', async t => {
  const { page, context } = await openPage(t);
  await seedWrongBook(page, ['2024-U1-001', '2024-U1-002']);
  await page.locator('[data-open-wrong-book]').click();
  await page.locator('.question-card summary').first().click();
  await page.evaluate(() => {
    document.querySelector('[data-remove-wrong]').click();
    document.querySelector('[data-home]').click();
  });
  await readState(page);
  await assertHome(page, context, '[data-open-wrong-book]', '本题已移出错题本。');
  await page.locator('[data-open-wrong-book]').click();
  await page.locator('.question-card summary').click();
  await page.evaluate(() => {
    document.querySelector('[data-remove-wrong]').click();
    document.querySelector('[data-home]').click();
    document.querySelector('[data-open-wrong-book]').click();
  });
  await readState(page);
  await page.waitForFunction(() => document.querySelector('#live-status').textContent === '错题本目前没有题目。');
  assert.equal(await page.locator('.question-card').count(), 0);
});

test('IndexedDB 请求成功后事务中止仍报告失败，后续排队保存能恢复', async t => {
  const { page } = await openPage(t);
  const result = await page.evaluate(async () => {
    const db = await import('./js/db.js');
    const state = await db.loadState();
    const originalPut = IDBObjectStore.prototype.put;
    let aborted = false;
    IDBObjectStore.prototype.put = function (...args) {
      const request = originalPut.apply(this, args);
      if (!aborted) {
        request.addEventListener('success', () => {
          aborted = true;
          this.transaction.abort();
        });
      }
      return request;
    };
    let outcome;
    try {
      state.activity = [{ id: 'isolated-aborted-save' }];
      outcome = await db.saveState(state).then(() => 'resolved', () => 'rejected');
    } finally { IDBObjectStore.prototype.put = originalPut; }
    const failedRead = await db.loadState();
    state.activity = [{ id: 'isolated-recovered-save' }];
    const first = db.saveState(state);
    state.activity = [{ id: 'isolated-final-save' }];
    const second = db.saveState(state);
    await Promise.all([first, second]);
    return { aborted, outcome, failedActivity: failedRead.activity, savedActivity: (await db.loadState()).activity };
  });
  assert.equal(result.aborted, true);
  assert.equal(result.outcome, 'rejected');
  assert.deepEqual(result.failedActivity, []);
  assert.deepEqual(result.savedActivity, [{ id: 'isolated-final-save' }]);
});

test('考试按最终答案收录错题和未答题，结果与错题本保留 A3/B1 上下文', async t => {
  const { page } = await openPage(t);
  await page.locator('[data-open-exam]').click();
  await page.locator('[data-exam-unit="2"]').click();
  await page.locator('.question-card').first().waitFor();
  const first = page.locator('.question-card').first();
  const firstId = await first.getAttribute('data-question-id');
  const firstAnswer = await page.evaluate(async id => (await import('./js/questions-bank.js')).getQuestionById(id).answer, firstId);
  await first.locator(`input[value="${firstAnswer === 'A' ? 'B' : 'A'}"]`).check();
  await first.locator(`input[value="${firstAnswer}"]`).check();
  const second = page.locator('.question-card').nth(1);
  const secondId = await second.getAttribute('data-question-id');
  const secondAnswer = await page.evaluate(async id => (await import('./js/questions-bank.js')).getQuestionById(id).answer, secondId);
  await second.locator(`input[value="${secondAnswer}"]`).check();
  await second.locator(`input[value="${secondAnswer === 'A' ? 'B' : 'A'}"]`).check();
  assert.equal(await first.locator('details, .selected-correct, .selected-wrong').count(), 0);
  assert.deepEqual((await readState(page)).wrongBook.entries, {});
  for (const type of ['A1/A2', 'A3', 'B1']) {
    await page.locator('.pagination [data-go-page]').last().click();
    await page.locator('[data-complete-exam-type]').click();
    await page.locator('[data-return-current-type]').click();
    await page.locator('[data-complete-exam-type]').click();
    assert.deepEqual((await readState(page)).wrongBook.entries, {}, '正式交卷前不入库');
    await page.locator('[data-confirm-type-transition]').click();
    if (type !== 'B1') await page.getByRole('heading', { name: /考试模式，第 2 单元/ }).waitFor();
  }
  await page.getByRole('heading', { name: '第 2 单元考试结果', exact: true }).waitFor();
  const state = await readState(page);
  const exam = state.exams[state.currentExamId];
  assert.equal(exam.result.correct, 1);
  assert.equal(exam.result.wrong, 149);
  assert.deepEqual(new Set(Object.keys(state.wrongBook.entries)), new Set(exam.result.wrongIds));
  assert.equal(state.wrongBook.entries[firstId], undefined);
  assert.equal(state.wrongBook.entries[secondId].lastUnanswered, false);
  assert.equal(Object.values(state.wrongBook.entries).filter(entry => entry.lastUnanswered).length, 148);
  assert.ok(Object.values(state.wrongBook.entries).every(entry => entry.wrongCount === 1));
  const grouped = await page.evaluate(async ids => {
    const bank = await import('./js/questions-bank.js');
    return bank.createQuestionBlocks(ids.map(bank.getQuestionById)).filter(block => block.type !== 'A1/A2');
  }, exam.questionIds);
  for (const block of grouped) {
    const group = page.locator(`[data-question-group="${block.id}"]`);
    assert.equal(await group.count(), 1, `${block.type} 结果应保留题组 ${block.id}`);
    if (block.type === 'A3') assert.ok((await group.textContent()).includes(block.questions[0].sharedStem));
    else assert.deepEqual(await group.locator('.common-options p').allTextContents(), Object.entries(block.questions[0].options).map(([letter, text]) => `${letter}. ${text}`));
  }
  await page.locator('[data-home]').click();
  await page.locator('[data-open-wrong-book]').click();
  assert.match(await page.locator('.type-progress').textContent(), /共 149 题/);
  const before = await readState(page);
  await answerCard(page, page.locator('.question-card').first(), true);
  assert.deepEqual((await readState(page)).exams, before.exams, '错题练习不能改写考试');
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(Object.keys((await readState(page)).wrongBook.entries).length, 149, '答对不自动移出，刷新后仍保留');
});

test('连续激活题型确认按钮只能前进一个题型', async t => {
  const { page } = await openPage(t);
  await page.locator('[data-open-exam]').click();
  await page.locator('[data-exam-unit="2"]').click();
  await page.locator('.question-card').first().waitFor();
  await page.locator('.pagination [data-go-page]').last().click();
  await page.locator('[data-complete-exam-type]').click();
  await page.evaluate(() => {
    const button = document.querySelector('[data-confirm-type-transition]');
    button.click();
    button.click();
  });
  await page.getByRole('heading', { name: '考试模式，第 2 单元，A3型题', exact: true }).waitFor();
  const state = await readState(page);
  const exam = state.exams[state.currentExamId];
  assert.equal(exam.currentTypeIndex, 1);
  assert.deepEqual(exam.lockedTypes, ['A1/A2']);
});

test('年度和科目 A3/B1 错题跨页保留原题干、选项和各自解析', async t => {
  const { page } = await openPage(t);
  const blocks = await page.evaluate(async () => {
    const bank = await import('./js/questions-bank.js');
    return [bank.QUESTIONS, bank.SUBJECT_QUESTIONS].flatMap(questions => {
      const blocks = bank.createQuestionBlocks(questions);
      return ['A3', 'B1'].map(type => blocks.find(block => block.type === type));
    });
  });
  await seedWrongBook(page, blocks.flatMap(block => block.questions.map(question => question.id)));
  await page.locator('[data-open-wrong-book]').click();
  const seen = new Set();
  while (true) {
    assert.ok(await page.locator('.question-card').count() <= 10);
    for (const block of blocks) {
      const group = page.locator(`[data-question-group="${block.id}"]`);
      if (!await group.count()) continue;
      assert.equal(await group.locator('.question-card').count(), block.questions.length, '同组错题不得跨页');
      seen.add(block.id);
      if (block.type === 'A3') assert.ok((await group.locator('.group-context').textContent()).includes(block.questions[0].sharedStem));
      else assert.deepEqual(await group.locator('.common-options p').allTextContents(), Object.entries(block.questions[0].sharedOptions || block.questions[0].options).map(([letter, text]) => `${letter}. ${text}`));
      for (const question of block.questions) {
        const card = group.locator(`[data-question-id="${question.id}"]`);
        assert.ok((await card.locator('h3').textContent()).includes(question.prompt || question.stem));
        for (const [letter, text] of Object.entries(question.options)) {
          assert.equal(await card.locator(`input[value="${letter}"]`).getAttribute('aria-label'), `${letter}. ${text}`);
        }
        await card.locator('summary').click();
        assert.deepEqual(await card.locator('.wrong-book-explanation p').allTextContents(), [
          `正确答案：${question.answer}. ${question.options[question.answer]}`, question.explanation,
        ]);
      }
    }
    const next = page.getByRole('button', { name: '下一页', exact: true });
    if (await next.isDisabled()) break;
    const previous = await page.locator('.pagination p').textContent();
    await next.click();
    await page.waitForFunction(text => document.querySelector('.pagination p').textContent !== text, previous);
  }
  assert.deepEqual(seen, new Set(blocks.map(block => block.id)));
});

test('隔离浏览器关闭再打开及离线复习，保留旧数据、错题和其他会话', async () => {
  const profileRoot = fileURLToPath(new URL('../tmp/maintenance-browser/', import.meta.url));
  await mkdir(profileRoot, { recursive: true });
  const userDataDir = await mkdtemp(path.join(profileRoot, 'profile-'));
  const launch = () => chromium.launchPersistentContext(userDataDir, {
    headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE || chromium.executablePath(),
  });
  let context;
  try {
    context = await launch();
    let page = await context.newPage();
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await startReview(page);
    const question = await answerCard(page, page.locator('.question-card').first(), false);
    await page.evaluate(async () => {
      const db = await import('./js/db.js');
      const state = await db.loadState();
      state.wrongs = { legacy: { questionId: 'legacy', value: 'retain' } };
      state.activity = [{ id: 'retained-legacy-activity' }];
      state.favorites = { legacy: { value: 'retain' } };
      await db.saveState(state);
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-open-exam]').click();
    await page.locator('[data-exam-unit="3"]').click();
    await page.locator('.question-card').first().waitFor();
    await page.locator('.question-card input[value="A"]').first().check();
    const before = await readState(page);
    assert.equal(before.wrongs.legacy.value, 'retain');
    assert.equal(before.activity[0].id, 'retained-legacy-activity');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await context.close();

    context = await launch();
    page = await context.newPage();
    await context.setOffline(true);
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-open-wrong-book]').click();
    await page.locator('.question-card').first().waitFor();
    assert.equal(await page.locator('.question-card').first().getAttribute('data-question-id'), question.id);
    const after = await readState(page);
    for (const key of ['wrongs', 'activity', 'favorites', 'sessions', 'exams', 'wrongBook']) {
      assert.deepEqual(after[key], before[key], `${key} 关闭重开后必须保留`);
    }
    await answerCard(page, page.locator('.question-card').first(), true);
    await page.locator('[data-home]').click();
    await page.locator('[data-open-wrong-book]').click();
    assert.equal(await page.locator('.question-card input:checked').count(), 0, '错题本本轮作答不恢复');
    const practiced = await readState(page);
    assert.equal(practiced.wrongBook.entries[question.id].correctInWrongBook, true);
    assert.deepEqual(practiced.sessions, before.sessions);
    assert.deepEqual(practiced.exams, before.exams);
  } finally {
    await context?.close();
    if (path.dirname(path.resolve(userDataDir)) !== path.resolve(profileRoot)) throw new Error('拒绝清理非本次隔离浏览器目录');
    await rm(userDataDir, { recursive: true, force: true });
  }
});
