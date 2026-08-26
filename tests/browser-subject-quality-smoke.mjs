import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:4173/';
const executablePath = process.env.BROWSER_EXECUTABLE || chromium.executablePath();
const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(message.text());
});

try {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.locator('[data-review-summary]').click();
  await page.locator('[data-subject-summary]').click();
  await page.getByRole('button', { name: '中医诊断学', exact: true }).click();
  await page.getByRole('button', { name: '100 题', exact: true }).click();
  await page.getByRole('heading', { name: '复习模式：中医诊断学' }).waitFor();

  const sample = await page.evaluate(async () => {
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
    const pages = bank.createQuestionPages(questions);
    const ids = ['SUB-2a05fbb70d6a-0029', 'SUB-2a05fbb70d6a-0029-S02'];
    return {
      sessionCount: questions.length,
      pageNumber: pages.findIndex(items => ids.every(id => items.questions.some(question => question.id === id))) + 1,
      ids,
    };
  });
  assert.equal(sample.sessionCount, 94);
  assert.ok(sample.pageNumber > 0);

  await page.getByLabel(/输入页数/).fill(String(sample.pageNumber));
  await page.locator('[data-page-jump]').getByRole('button', { name: '跳转' }).click();
  await page.getByRole('heading', { name: 'B1型题', exact: true }).waitFor();

  const first = page.locator(`[data-question-id="${sample.ids[0]}"]`);
  const second = page.locator(`[data-question-id="${sample.ids[1]}"]`);
  await first.waitFor();
  await second.waitFor();
  assert.match(await first.locator('h3').innerText(), /脾气虚弱的目态是/);
  assert.match(await second.locator('h3').innerText(), /脾肾两亏的目态是/);

  const group = first.locator('xpath=ancestor::*[contains(@class,"question-group")]');
  assert.equal(await group.locator('.question-card').count(), 2);
  const commonOptions = await group.locator('.common-options p').allTextContents();
  assert.ok(commonOptions.some(text => text.trim() === 'C. 昏睡露睛'));
  assert.ok(commonOptions.some(text => text.trim() === 'D. 双睑下垂'));
  assert.equal(commonOptions.some(text => text.includes('露晴')), false);

  await first.locator('input[value="A"]').check();
  const groupExplanation = group.locator('details.group-explanation');
  await groupExplanation.waitFor();
  await groupExplanation.evaluate(element => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('本组讲解未在限定时间内展开')), 3000);
    const check = () => {
      if (!element.open) return false;
      clearTimeout(timeout);
      resolve();
      return true;
    };
    if (check()) return;
    const observer = new MutationObserver(() => {
      if (check()) observer.disconnect();
    });
    observer.observe(element, { attributes: true, attributeFilter: ['open'] });
  }));
  assert.equal(await groupExplanation.evaluate(element => element.open), true);
  const explanation = await groupExplanation.innerText();
  assert.match(explanation, /昏睡露睛.*脾气虚弱/s);
  assert.match(explanation, /双睑下垂.*脾肾两亏/s);

  await first.locator('input[value="C"]').check();
  await second.locator('input[value="D"]').check();
  for (const [id, value] of [[sample.ids[0], 'C'], [sample.ids[1], 'D']]) {
    await page.waitForFunction(
      ([questionId, optionValue]) => document
        .querySelector(`[data-question-id="${questionId}"] input[value="${optionValue}"]`)
        ?.getAttribute('aria-label')
        ?.endsWith('正确'),
      [id, value],
    );
  }
  assert.match(await first.locator('input[value="C"]').getAttribute('aria-label'), /正确$/);
  assert.match(await second.locator('input[value="D"]').getAttribute('aria-label'), /正确$/);
  assert.deepEqual(errors, []);
  console.log(`指定科目修订题浏览器回归通过：${JSON.stringify(sample)}`);
} finally {
  await context.close();
  await browser.close();
}
