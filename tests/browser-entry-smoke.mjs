import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:4173/';
const executablePath = process.env.BROWSER_EXECUTABLE || chromium.executablePath();
const screenshotRoot = process.env.SCREENSHOT_DIR || '';
const browser = await chromium.launch({ headless: true, executablePath });

const profiles = [
  { name: 'desktop', viewport: { width: 1366, height: 768 }, isMobile: false, hasTouch: false },
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

async function screenshot(page, profile, name) {
  if (!screenshotRoot || profile.name !== 'desktop') return;
  await mkdir(screenshotRoot, { recursive: true });
  await page.screenshot({ path: path.join(screenshotRoot, `${name}.png`), fullPage: true });
}

async function ensureOpen(locator) {
  if (await locator.getAttribute('open') === null) await locator.locator(':scope > summary').click();
  assert.equal(await locator.getAttribute('open'), '');
}

async function assertQuestionPage(page, heading) {
  await page.getByRole('heading', { name: heading }).waitFor();
  const firstCard = page.locator('.question-card').first();
  await firstCard.waitFor();
  await expectVisible(firstCard);
  assert.match(await firstCard.locator('h3').innerText(), /^1\. .+（ ）$/s);
  assert.equal(await firstCard.getByRole('radio').count(), 5);
  assert.match(await page.locator('.type-progress').innerText(), /当前显示(?:总题号)?第 1 至 \d+ 题/);
}

async function expectVisible(locator) {
  assert.equal(await locator.isVisible(), true);
  const box = await locator.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0);
  const style = await locator.evaluate(element => {
    const computed = getComputedStyle(element);
    return {
      display: computed.display,
      visibility: computed.visibility,
      opacity: computed.opacity,
    };
  });
  assert.notEqual(style.display, 'none');
  assert.notEqual(style.visibility, 'hidden');
  assert.notEqual(style.opacity, '0');
}

async function runProfile(profile) {
  const context = await browser.newContext(profile);
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

    if (profile.name === 'desktop') {
      await reviewSummary.focus();
      await page.keyboard.press('Enter');
      assert.equal(await reviewPanel.getAttribute('open'), '');
      await page.keyboard.press('Space');
      assert.equal(await reviewPanel.getAttribute('open'), null);
      await page.keyboard.press('Space');
      assert.equal(await reviewPanel.getAttribute('open'), '');
    } else {
      await ensureOpen(reviewPanel);
    }
    await expectVisible(page.getByRole('button', { name: '随机出题' }));
    await expectVisible(page.getByRole('button', { name: '考试模式' }));
    await expectVisible(page.getByRole('button', { name: '错题本' }));
    await screenshot(page, profile, 'homepage-modes');

    await page.getByRole('button', { name: '错题本' }).click();
    await page.getByRole('heading', { name: '错题本', exact: true }).waitFor();
    assert.match(await page.locator('.notice').innerText(), /目前没有错题/);
    await page.getByRole('button', { name: '返回首页' }).click();
    await page.waitForFunction(() => document.activeElement?.matches('[data-open-wrong-book]'));
    await ensureOpen(page.locator('[data-review-panel]'));

    if (profile.name === 'desktop') {
      const currentReviewSummary = page.locator('[data-review-summary]');
      await currentReviewSummary.focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('[data-open-review]').evaluate(element => document.activeElement === element), true);
      await page.keyboard.press('Shift+Tab');
      assert.equal(await currentReviewSummary.evaluate(element => document.activeElement === element), true);
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
    } else {
      await page.getByRole('button', { name: '随机出题' }).click();
    }
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: '10 题', exact: true }).click();
    await assertQuestionPage(page, '复习模式：随机出题');
    await screenshot(page, profile, 'random-first-question');

    await page.getByRole('button', { name: '返回首页' }).click();
    await ensureOpen(page.locator('[data-review-panel]'));
    const subjectPanel = page.locator('[data-subject-panel]');
    await ensureOpen(subjectPanel);
    const expectedSubjects = await page.evaluate(async () => (
      await import('./js/questions-bank.js')
    ).SUBJECTS.map(subject => subject.name));
    const subjectButtons = page.locator('[data-subject-id]');
    assert.equal(await subjectButtons.count(), 11);
    for (let index = 0; index < 11; index += 1) await expectVisible(subjectButtons.nth(index));
    assert.deepEqual((await subjectButtons.allTextContents()).map(text => text.trim()), expectedSubjects);

    const cdp = await context.newCDPSession(page);
    await cdp.send('Accessibility.enable');
    const accessibilityTree = await cdp.send('Accessibility.getFullAXTree');
    const accessibleButtons = accessibilityTree.nodes
      .filter(node => node.role?.value === 'button')
      .map(node => node.name?.value)
      .filter(name => expectedSubjects.includes(name));
    assert.deepEqual(accessibleButtons.sort(), [...expectedSubjects].sort());
    assert.ok(accessibilityTree.nodes.some(node => (
      node.role?.value === 'region' && node.name?.value === '选择科目'
    )));
    await screenshot(page, profile, 'subjects-visible');

    const subjectName = expectedSubjects[0];
    await page.getByRole('button', { name: subjectName, exact: true }).click();
    await page.getByRole('button', { name: '10 题', exact: true }).click();
    await assertQuestionPage(page, `复习模式：${subjectName}`);
    const subjectState = await page.evaluate(async expectedName => {
      const bank = await import('./js/questions-bank.js');
      const cards = [...document.querySelectorAll('[data-question-id]')];
      return cards.every(card => {
        const question = bank.getQuestionById(card.dataset.questionId);
        return question?.subject === expectedName && question?.sourceSubject === expectedName;
      });
    }, subjectName);
    assert.equal(subjectState, true);

    await page.getByRole('button', { name: '返回首页' }).click();
    await page.getByRole('button', { name: '考试模式' }).click();
    await page.getByRole('button', { name: '第一单元，150 题' }).click();
    await assertQuestionPage(page, '考试模式，第 1 单元，A1/A2型题');
    assert.equal(await page.locator('.question-card').count(), 10);
    await screenshot(page, profile, 'exam-first-question');

    assert.deepEqual(errors, []);
    return { profile: profile.name, subjects: expectedSubjects.length, errors: errors.length };
  } finally {
    await context.close();
  }
}

try {
  const results = [];
  for (const profile of profiles) results.push(await runProfile(profile));
  console.log(`首页真实浏览器冒烟测试通过：${JSON.stringify(results)}`);
} finally {
  await browser.close();
}
