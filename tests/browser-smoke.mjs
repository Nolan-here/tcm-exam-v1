import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:4173/';
const executablePath = process.env.BROWSER_EXECUTABLE || chromium.executablePath();
const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(message.text());
});

try {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  const reviewPanel = page.locator('[data-review-panel]');
  const reviewSummary = page.locator('[data-review-summary]');
  const subjectPanel = page.locator('[data-subject-panel]');
  const subjectSummary = subjectPanel.locator('summary');
  assert.equal(await reviewPanel.getAttribute('open'), null);
  await reviewSummary.focus();
  await page.keyboard.press('Enter');
  assert.equal(await reviewPanel.getAttribute('open'), '');
  await page.keyboard.press('Space');
  assert.equal(await reviewPanel.getAttribute('open'), null);
  await page.keyboard.press('Space');
  assert.equal(await reviewPanel.getAttribute('open'), '');
  assert.equal(await subjectPanel.getAttribute('open'), null);
  await subjectSummary.focus();
  await page.keyboard.press('Enter');
  assert.equal(await subjectPanel.getAttribute('open'), '');
  const expectedSubjects = await page.evaluate(async () => (await import('./js/questions-bank.js')).SUBJECTS.map(item => item.name));
  assert.deepEqual((await page.locator('[data-subject-id]').allTextContents()).map(text => text.trim()), expectedSubjects);
  assert.equal(await page.locator('dialog').isVisible(), false);

  await page.getByRole('button', { name: '随机出题' }).click();
  assert.equal(await page.getByRole('dialog').isVisible(), true);
  await page.getByRole('button', { name: '10 题', exact: true }).click();
  await page.locator('.question-card').first().waitFor();
  assert.ok(await page.locator('.question-card').count() <= 10);
  assert.ok(await page.locator('.question-card').count() >= 2);
  assert.match(await page.locator('.question-card h3').first().innerText(), /^1\. .+（ ）$/s);

  const firstCard = page.locator('.question-card').first();
  const firstId = await firstCard.getAttribute('data-question-id');
  const firstAnswer = await page.evaluate(async questionId => {
    const module = await import('./js/questions-bank.js');
    return module.getQuestionById(questionId).answer;
  }, firstId);
  const wrongLetter = 'ABCDE'.split('').find(letter => letter !== firstAnswer);
  const wrongInput = firstCard.locator(`input[value="${wrongLetter}"]`);
  const liveBeforeAnswer = await page.locator('#live-status').innerText();
  await wrongInput.focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(element => element.getAttribute('aria-label')?.endsWith('。错误'), await wrongInput.elementHandle());
  assert.equal(await firstCard.getByRole('radio', { name: new RegExp(`^${wrongLetter}\\. .+。错误$`) }).count(), 1);
  assert.equal(await page.locator('#live-status').innerText(), liveBeforeAnswer);
  assert.equal(await firstCard.locator('.selected-wrong').count(), 1);
  assert.equal(await firstCard.locator('.selected-correct').count(), 0);
  assert.equal(await firstCard.locator('details').getAttribute('open'), '');

  const correctInput = firstCard.locator(`input[value="${firstAnswer}"]`);
  await correctInput.focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(element => element.getAttribute('aria-label')?.endsWith('。正确'), await correctInput.elementHandle());
  assert.equal(await firstCard.getByRole('radio', { name: new RegExp(`^${firstAnswer}\\. .+。正确$`) }).count(), 1);
  assert.equal(await firstCard.locator('.selected-correct').count(), 1);
  assert.equal(await firstCard.locator('.selected-wrong').count(), 1);
  assert.equal(await firstCard.locator('details').getAttribute('open'), '');

  const secondCard = page.locator('.question-card').nth(1);
  const secondId = await secondCard.getAttribute('data-question-id');
  const secondAnswer = await page.evaluate(async questionId => {
    const module = await import('./js/questions-bank.js');
    return module.getQuestionById(questionId).answer;
  }, secondId);
  const secondCorrectInput = secondCard.locator(`input[value="${secondAnswer}"]`);
  await secondCorrectInput.focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(element => element.getAttribute('aria-label')?.endsWith('。正确'), await secondCorrectInput.elementHandle());
  assert.equal(await secondCard.locator('details').getAttribute('open'), null);

  await page.getByRole('button', { name: '返回首页' }).click();
  await page.getByRole('button', { name: '随机出题' }).click();
  await page.getByRole('button', { name: '自定义数量' }).click();
  await page.getByLabel('自定义题量，1 到 3492 题').fill('3492');
  await page.getByRole('button', { name: '开始复习' }).click();
  await page.locator('.question-card').first().waitFor();
  const reviewTypePages = await page.evaluate(async () => {
    const state = await new Promise((resolve, reject) => {
      const request = indexedDB.open('tcm-exam-v1');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const get = database.transaction('app', 'readonly').objectStore('app').get('state');
        get.onerror = () => reject(get.error);
        get.onsuccess = () => { resolve(get.result); database.close(); };
      };
    });
    const bank = await import('./js/questions-bank.js');
    const session = state.sessions[state.currentSessionId];
    const pages = bank.createQuestionPages(session.questionIds.map(bank.getQuestionById));
    return Object.fromEntries(['A3', 'B1'].map(type => [type, pages.findIndex(item => item.type === type) + 1]));
  });
  assert.ok(reviewTypePages.A3 > 0);
  assert.ok(reviewTypePages.B1 > reviewTypePages.A3);

  await page.getByLabel(/输入页数/).fill(String(reviewTypePages.A3));
  await page.locator('[data-page-jump]').getByRole('button', { name: '跳转' }).click();
  await page.getByRole('heading', { name: 'A3型题', exact: true }).waitFor();
  assert.ok(await page.getByRole('heading', { name: /共用题干/ }).count() > 0);
  assert.equal(await page.locator('.question-card').count() <= 10, true);

  await page.getByLabel(/输入页数/).fill(String(reviewTypePages.B1));
  await page.locator('[data-page-jump]').getByRole('button', { name: '跳转' }).click();
  await page.getByRole('heading', { name: 'B1型题', exact: true }).waitFor();
  assert.ok(await page.getByRole('heading', { name: /共用备选答案/ }).count() > 0);
  assert.equal(await page.locator('.common-options').first().locator('p').count(), 5);
  assert.equal(await page.locator('.common-options').first().locator('li').count(), 0);
  assert.match(await page.locator('.question-card input[type="radio"]').first().getAttribute('aria-label'), /^A\. .+/);
  const b1Groups = page.locator('.question-group');
  const b1GroupCount = await b1Groups.count();
  assert.ok(b1GroupCount > 0);
  assert.equal(await page.locator('.question-card details').count(), 0);
  assert.equal(await page.locator('details.group-explanation').count(), b1GroupCount);
  assert.equal(await page.getByText('本组讲解', { exact: true }).count(), b1GroupCount);

  const firstB1Group = b1Groups.first();
  const firstB1Card = firstB1Group.locator('.question-card').first();
  const firstB1Id = await firstB1Card.getAttribute('data-question-id');
  const firstB1Answer = await page.evaluate(async questionId => {
    const module = await import('./js/questions-bank.js');
    return module.getQuestionById(questionId).answer;
  }, firstB1Id);
  const firstB1WrongLetter = 'ABCDE'.split('').find(letter => letter !== firstB1Answer);
  const firstB1WrongInput = firstB1Card.locator(`input[value="${firstB1WrongLetter}"]`);
  await firstB1WrongInput.focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(element => element.getAttribute('aria-label')?.endsWith('。错误'), await firstB1WrongInput.elementHandle());
  assert.equal(await firstB1Group.locator('details.group-explanation').getAttribute('open'), '');

  await page.getByRole('button', { name: '返回首页' }).click();
  const verifySubjectSession = async expectedSubject => page.evaluate(async subjectName => {
    const state = await new Promise((resolve, reject) => {
      const request = indexedDB.open('tcm-exam-v1');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const get = database.transaction('app', 'readonly').objectStore('app').get('state');
        get.onerror = () => reject(get.error);
        get.onsuccess = () => { resolve(get.result); database.close(); };
      };
    });
    const bank = await import('./js/questions-bank.js');
    const session = state.sessions[state.currentSessionId];
    const questions = session.questionIds.map(bank.getQuestionById);
    return {
      configuredSubject: session.config.subjectName,
      count: questions.length,
      unique: new Set(questions.map(question => question.id)).size,
      subjects: [...new Set(questions.map(question => question.sourceSubject))],
      allMatch: questions.every(question => question.subject === subjectName && question.sourceSubject === subjectName),
    };
  }, expectedSubject);

  const firstSubjectName = expectedSubjects[0];
  await page.getByRole('button', { name: firstSubjectName, exact: true }).click();
  await page.getByRole('heading', { name: `选择${firstSubjectName}题量` }).waitFor();
  await page.getByRole('button', { name: '50 题', exact: true }).click();
  await page.getByRole('heading', { name: `复习模式：${firstSubjectName}` }).waitFor();
  const firstSubjectSession = await verifySubjectSession(firstSubjectName);
  assert.equal(firstSubjectSession.configuredSubject, firstSubjectName);
  assert.equal(firstSubjectSession.count, firstSubjectSession.unique);
  assert.deepEqual(firstSubjectSession.subjects, [firstSubjectName]);
  assert.equal(firstSubjectSession.allMatch, true);

  await page.getByRole('button', { name: '返回首页' }).click();
  await page.waitForFunction(subjectName => document.activeElement?.textContent?.trim() === subjectName, firstSubjectName);
  const secondSubjectName = expectedSubjects[1];
  await page.getByRole('button', { name: secondSubjectName, exact: true }).click();
  await page.getByRole('button', { name: '100 题', exact: true }).click();
  await page.getByRole('heading', { name: `复习模式：${secondSubjectName}` }).waitFor();
  const secondSubjectSession = await verifySubjectSession(secondSubjectName);
  assert.equal(secondSubjectSession.count, secondSubjectSession.unique);
  assert.deepEqual(secondSubjectSession.subjects, [secondSubjectName]);
  assert.equal(secondSubjectSession.allMatch, true);
  assert.ok(secondSubjectSession.count <= 100);

  await page.getByRole('button', { name: '返回首页' }).click();
  await page.getByRole('button', { name: '考试模式' }).click();
  const units = await page.locator('[data-exam-unit]').allTextContents();
  assert.deepEqual(units.map(text => text.trim()), [
    '第一单元，150 题', '第二单元，150 题', '第三单元，150 题', '第四单元，150 题'
  ]);
  await page.getByRole('button', { name: '第二单元，150 题' }).click();
  await page.locator('.question-card').first().waitFor();
  assert.equal(await page.locator('.question-card').count(), 10);
  assert.equal(await page.locator('.question-card details').count(), 0);
  assert.equal(await page.locator('.answer-feedback').count(), 0);

  const answerCurrentType = async () => {
    const progress = await page.locator('.pagination p').innerText();
    const pageCount = Number(progress.match(/共 (\d+) 页/)?.[1]);
    assert.ok(pageCount > 0);
    for (let typePage = 1; typePage <= pageCount; typePage += 1) {
      const cards = page.locator('.question-card');
      const count = await cards.count();
      assert.ok(count > 0 && count <= 10);
      for (let index = 0; index < count; index += 1) {
        await cards.nth(index).locator('input[value="A"]').check();
      }
      if (typePage < pageCount) {
        await page.getByRole('button', { name: '下一页' }).click();
        await page.getByText(`本题型第 ${typePage + 1} 页，共 ${pageCount} 页`, { exact: true }).waitFor();
      }
    }
  };

  await page.getByRole('heading', { name: '考试模式，第 2 单元，A1/A2型题' }).waitFor();
  await answerCurrentType();
  await page.getByRole('button', { name: '完成本题型并进入确认' }).click();
  await page.getByRole('heading', { name: '确认进入A3型题' }).waitFor();
  assert.match(await page.locator('.transition-confirmation').innerText(), /未作答 0 题/);
  await page.getByRole('button', { name: '确认并进入A3型题' }).click();
  await page.getByRole('heading', { name: '考试模式，第 2 单元，A3型题' }).waitFor();

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '考试模式' }).click();
  const resumeExam = page.locator('[data-resume-exam]');
  await resumeExam.waitFor();
  assert.equal((await resumeExam.innerText()).trim(), '继续第 2 单元，A3型题');
  await resumeExam.click();
  await page.getByRole('heading', { name: '考试模式，第 2 单元，A3型题' }).waitFor();
  assert.equal(await page.getByRole('button', { name: /A1\/A2/ }).count(), 0);
  assert.ok(await page.getByRole('heading', { name: /共用题干/ }).count() > 0);
  await answerCurrentType();
  await page.getByRole('button', { name: '完成本题型并进入确认' }).click();
  await page.getByRole('button', { name: '确认并进入B1型题' }).click();

  await page.getByRole('heading', { name: '考试模式，第 2 单元，B1型题' }).waitFor();
  assert.ok(await page.getByRole('heading', { name: /共用备选答案/ }).count() > 0);
  await answerCurrentType();
  await page.getByRole('button', { name: '完成本单元并准备交卷' }).click();
  await page.getByRole('heading', { name: '确认提交本单元考试' }).waitFor();
  await page.getByRole('button', { name: '确认交卷' }).click();
  await page.getByRole('heading', { name: '第 2 单元考试结果' }).waitFor();
  assert.match(await page.locator('.result-summary').innerText(), /答对 \d+ 题，答错 \d+ 题/);
  assert.ok(await page.locator('.wrong-question').count() > 0);
  assert.equal(await page.getByRole('heading', { name: '错题和解析' }).count(), 1);
  assert.equal(await page.locator('.result-options li').count(), 0);
  assert.ok(await page.locator('.wrong-question-group').count() > 0);
  assert.equal(
    await page.locator('.wrong-question-group .group-result-explanation').count(),
    await page.locator('.wrong-question-group').count()
  );
  assert.equal(await page.locator('.wrong-question-group .wrong-question .result-options').count(), 0);
  assert.equal(await page.locator('.wrong-question-group .wrong-question h4').count(), 0);

  const offlineContext = await browser.newContext();
  const offlinePage = await offlineContext.newPage();
  await offlinePage.goto(baseURL, { waitUntil: 'networkidle' });
  await offlinePage.evaluate(() => navigator.serviceWorker.ready);
  await offlinePage.reload({ waitUntil: 'networkidle' });
  await offlinePage.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await offlineContext.setOffline(true);
  await offlinePage.reload({ waitUntil: 'domcontentloaded' });
  assert.equal((await offlinePage.locator('[data-review-summary]').innerText()).trim(), '复习模式');
  assert.equal((await offlinePage.getByRole('button', { name: '考试模式' }).innerText()).trim(), '考试模式');
  await offlinePage.locator('[data-review-summary]').click();
  assert.equal(await offlinePage.getByRole('button', { name: '随机出题' }).isVisible(), true);
  await offlineContext.close();

  assert.deepEqual(errors, []);
  console.log('浏览器冒烟测试通过：首页折叠、随机与按科目隔离、复习题组反馈、考试题型锁定、交卷结果与离线重载均正常。');
} finally {
  await browser.close();
}
