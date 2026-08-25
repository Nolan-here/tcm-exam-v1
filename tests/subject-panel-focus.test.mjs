import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { SUBJECTS } from '../js/questions-subjects.js';
import { setupSubjectPanelFocus } from '../js/subject-panel-focus.js';

function createPage() {
  const subjectItems = SUBJECTS.map(subject => (
    `<li><button type="button" data-subject-id="${subject.id}">${subject.name}</button></li>`
  )).join('');
  const dom = new JSDOM(`<!doctype html><body>
    <details data-subject-panel>
      <summary data-subject-summary>按科目</summary>
      <section data-subject-list tabindex="-1" aria-label="选择科目">
        <ul>${subjectItems}</ul>
      </section>
    </details>
    <button type="button" data-outside>考试模式</button>
  </body>`, { pretendToBeVisual: true });
  setupSubjectPanelFocus(dom.window.document);
  return dom;
}

function dispatchClick(window, summary, pointerType = '') {
  const event = new window.MouseEvent('click', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  summary.dispatchEvent(event);
}

function dispatchKeyboardActivation(window, summary, key) {
  const keyEvent = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  assert.equal(summary.dispatchEvent(keyEvent), true, `${key} 不应被业务代码拦截`);
  dispatchClick(window, summary);
}

function dispatchToggle(window, panel) {
  panel.dispatchEvent(new window.Event('toggle'));
}

async function nextFrame(window) {
  await new Promise(resolve => window.requestAnimationFrame(resolve));
}

test('科目区域使用命名区域和11项真实列表，且不加入正常Tab顺序', () => {
  const dom = createPage();
  const { document } = dom.window;
  const panel = document.querySelector('[data-subject-panel]');
  const listRegion = document.querySelector('[data-subject-list]');
  assert.equal(panel.open, false);
  assert.equal(listRegion.tabIndex, -1);
  assert.equal(listRegion.getAttribute('aria-label'), '选择科目');
  assert.equal(listRegion.querySelector('ul').tagName, 'UL');
  assert.equal(listRegion.querySelectorAll(':scope > ul > li').length, 11);
  assert.deepEqual(
    [...listRegion.querySelectorAll('[data-subject-id]')].map(button => button.textContent),
    SUBJECTS.map(subject => subject.name),
  );
});

for (const activation of ['Enter', 'Space', '鼠标']) {
  test(`${activation}主动展开后在toggle完成的下一帧聚焦科目区域`, async () => {
    const dom = createPage();
    const { document } = dom.window;
    const panel = document.querySelector('[data-subject-panel]');
    const summary = document.querySelector('[data-subject-summary]');
    const listRegion = document.querySelector('[data-subject-list]');
    summary.focus();
    if (activation === '鼠标') dispatchClick(dom.window, summary, 'mouse');
    else dispatchKeyboardActivation(dom.window, summary, activation === 'Enter' ? 'Enter' : ' ');
    panel.open = true;
    dispatchToggle(dom.window, panel);
    await nextFrame(dom.window);
    await nextFrame(dom.window);
    assert.equal(panel.open, true);
    assert.equal(document.activeElement, listRegion);
    assert.equal(listRegion.querySelectorAll('[data-subject-id]').length, 11);
  });
}

test('收起后焦点安全返回summary，并可连续重新展开', async () => {
  const dom = createPage();
  const { document } = dom.window;
  const panel = document.querySelector('[data-subject-panel]');
  const summary = document.querySelector('[data-subject-summary]');
  const listRegion = document.querySelector('[data-subject-list]');

  for (let cycle = 0; cycle < 3; cycle += 1) {
    summary.focus();
    dispatchClick(dom.window, summary, 'mouse');
    panel.open = true;
    dispatchToggle(dom.window, panel);
    await nextFrame(dom.window);
    assert.equal(document.activeElement, listRegion);

    panel.open = false;
    dispatchToggle(dom.window, panel);
    assert.equal(document.activeElement, summary);
  }
});

test('初始化或程序化展开不会抢焦点，触摸激活保留原生浏览位置', async () => {
  const dom = createPage();
  const { document } = dom.window;
  const panel = document.querySelector('[data-subject-panel]');
  const summary = document.querySelector('[data-subject-summary]');
  const listRegion = document.querySelector('[data-subject-list]');
  const outside = document.querySelector('[data-outside]');

  outside.focus();
  panel.open = true;
  dispatchToggle(dom.window, panel);
  await nextFrame(dom.window);
  assert.equal(document.activeElement, outside);

  panel.open = false;
  dispatchToggle(dom.window, panel);
  summary.focus();
  dispatchClick(dom.window, summary, 'touch');
  panel.open = true;
  dispatchToggle(dom.window, panel);
  await nextFrame(dom.window);
  assert.equal(document.activeElement, summary);
  assert.notEqual(document.activeElement, listRegion);
});
