import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  QUESTIONS,
  EXAM_UNITS,
  EXAM_BLUEPRINT_VERSION,
  EXAM_UNIT_BLUEPRINTS,
  PAPER_FORMAT_VERSION,
  QUESTION_BANK_VERSION,
  QUESTION_BANK_SOURCES,
  QUESTION_BANK_STATS,
  createExamPaper,
  createReviewPaper,
  createQuestionPages,
  getQuestionById,
  getQuestionsForUnit
} from '../js/questions-bank.js';
import { QUESTION_BANK_2023_STATS } from '../js/questions-2023.js';
import { QUESTION_BANK_2018_2022_STATS } from '../js/questions-2018-2022.js';
import { createSyncPayload, mergeSyncPayload } from '../js/sync.js';
import { backupPayload, validateBackup } from '../js/db.js';

test('2018 至 2024 年题库去重合并后的总数和四单元分配准确', () => {
  assert.equal(QUESTION_BANK_VERSION, '2018-2024-pdf-docx-dedup-grouped-v3');
  assert.equal(QUESTIONS.length, 3496);
  assert.deepEqual(EXAM_UNITS.map(item => item.count), [150, 150, 150, 150]);
  assert.deepEqual(QUESTION_BANK_STATS, {
    questions2024: 391,
    questions2023Added: 599,
    questions2023RemovedAsDuplicates: 1,
    questions2018To2022Added: 2506,
    questions2018To2022RemovedAsDuplicates: 20,
    questions2018To2022ExcludedAsIncomplete: 12
  });
  assert.equal(QUESTION_BANK_2023_STATS.sourceQuestionCount, 600);
  assert.equal(QUESTION_BANK_2023_STATS.removedDuplicateCount, 1);
  assert.equal(QUESTION_BANK_SOURCES.length, 13);
  assert.equal(QUESTION_BANK_2018_2022_STATS.sourceQuestionCount, 2538);
  assert.equal(QUESTION_BANK_2018_2022_STATS.builtBeforeDedup, 2526);
  assert.equal(QUESTION_BANK_2018_2022_STATS.addedQuestionCount, 2506);
  assert.equal(QUESTION_BANK_2018_2022_STATS.removedDuplicateCount, 20);
  assert.deepEqual(
    Object.fromEntries(Object.entries(QUESTION_BANK_2018_2022_STATS.perYear).map(([year, stats]) => [year, stats.answerConflicts])),
    { 2018: [], 2019: [], 2020: [], 2021: [], 2022: [] }
  );
  for (const { unit } of EXAM_UNITS) {
    const questions = getQuestionsForUnit(unit);
    assert.ok(questions.every(question => question.unit === unit));
  }
});

test('考试按 2023 年原卷题型配额随机组成四个 150 题单元', () => {
  assert.equal(PAPER_FORMAT_VERSION, 'grouped-types-v1');
  assert.equal(EXAM_BLUEPRINT_VERSION, '2023-source-paper-v2');
  assert.deepEqual(EXAM_UNIT_BLUEPRINTS.map(item => item.sections), [
    [{ type: 'A1/A2', count: 110 }, { type: 'B1', count: 40 }],
    [{ type: 'A1/A2', count: 95 }, { type: 'A3', count: 17 }, { type: 'B1', count: 38 }],
    [{ type: 'A1/A2', count: 87 }, { type: 'A3', count: 33 }, { type: 'B1', count: 30 }],
    [{ type: 'A1/A2', count: 80 }, { type: 'A3', count: 36 }, { type: 'B1', count: 34 }]
  ]);

  for (const blueprint of EXAM_UNIT_BLUEPRINTS) {
    const paper = createExamPaper(blueprint.unit, () => 0.375);
    assert.equal(paper.length, 150);
    assert.equal(new Set(paper.map(question => question.id)).size, 150);
    assert.ok(paper.every(question => question.unit === blueprint.unit));
    const expectedTypes = blueprint.sections.flatMap(section => Array(section.count).fill(section.type));
    assert.deepEqual(paper.map(question => question.type), expectedTypes);
    const pages = createQuestionPages(paper);
    assert.ok(pages.every(page => page.questions.length <= 10));
    assert.ok(pages.every(page => new Set(page.questions.map(question => question.type)).size === 1));
    for (const groupId of new Set(paper.map(question => question.groupId).filter(Boolean))) {
      assert.equal(pages.filter(page => page.questions.some(question => question.groupId === groupId)).length, 1);
      assert.equal(
        paper.filter(question => question.groupId === groupId).length,
        QUESTIONS.filter(question => question.groupId === groupId).length
      );
    }
  }

  const firstDraw = createExamPaper(1, () => 0).map(question => question.id);
  const secondDraw = createExamPaper(1, () => 0.999999).map(question => question.id);
  assert.notDeepEqual(firstDraw, secondDraw);
});

test('复习组卷题量准确，题型不混页且不拆分 A3、B1 题组', () => {
  for (const count of [10, 17, 50, 100, QUESTIONS.length]) {
    const paper = createReviewPaper(count, () => 0.625);
    const pages = createQuestionPages(paper);
    assert.equal(paper.length, count);
    assert.equal(new Set(paper.map(question => question.id)).size, count);
    assert.ok(pages.every(page => page.questions.length <= 10));
    assert.ok(pages.every(page => new Set(page.questions.map(question => question.type)).size === 1));
    for (const groupId of new Set(paper.map(question => question.groupId).filter(Boolean))) {
      assert.equal(pages.filter(page => page.questions.some(question => question.groupId === groupId)).length, 1);
      assert.equal(
        paper.filter(question => question.groupId === groupId).length,
        QUESTIONS.filter(question => question.groupId === groupId).length
      );
    }
  }
});

test('每题 ID 唯一，题干、选项、答案和解析结构完整', () => {
  assert.equal(new Set(QUESTIONS.map(question => question.id)).size, QUESTIONS.length);
  const normalizedQuestions = QUESTIONS.map(question => (
    question.stem + Object.values(question.options).join('')
  ).normalize('NFKC').replace(/[^0-9A-Za-z\u3400-\u9fff]/g, '').toLowerCase());
  assert.equal(new Set(normalizedQuestions).size, QUESTIONS.length);
  for (const question of QUESTIONS) {
    assert.equal(getQuestionById(question.id), question);
    assert.ok(question.stem, `${question.id} 缺少题干`);
    assert.deepEqual(Object.keys(question.options), ['A', 'B', 'C', 'D', 'E']);
    assert.ok(Object.values(question.options).every(Boolean), `${question.id} 存在空选项`);
    assert.match(question.answer, /^[A-E]$/);
    assert.ok(question.options[question.answer]);
    assert.ok(question.explanation, `${question.id} 缺少解析`);
    assert.ok(['A1/A2', 'A3', 'B1'].includes(question.type), `${question.id} 题型异常`);
    if (question.type === 'A3' || question.type === 'B1') {
      assert.ok(question.groupId, `${question.id} 缺少题组编号`);
      assert.ok(question.prompt, `${question.id} 缺少题组内问题`);
      if (question.type === 'A3') assert.ok(question.sharedStem, `${question.id} 缺少共用题干`);
      if (question.type === 'B1') assert.deepEqual(Object.keys(question.sharedOptions), ['A', 'B', 'C', 'D', 'E']);
    }
    assert.doesNotMatch(question.stem, /答案[：:]|解析[：:]|型题/);
    assert.ok(Object.values(question.options).every(text => !/答案[：:]|解析[：:]|型题/.test(text)));
  }
  const repairedGroup = ['2024-U4-059', '2024-U4-060', '2024-U4-061'].map(getQuestionById);
  assert.ok(repairedGroup.every(question => question.type === 'A3'));
  assert.equal(new Set(repairedGroup.map(question => question.groupId)).size, 1);
  assert.doesNotMatch(repairedGroup[0].options.B, /^B[.．、]/);

  const importedPdfQuestions = QUESTIONS.filter(question => {
    const year = Number(question.id.slice(0, 4));
    return year >= 2018 && year <= 2022;
  });
  for (const question of importedPdfQuestions) {
    const year = Number(question.id.slice(0, 4));
    const globalNumber = year === 2018 ? question.number : (question.unit - 1) * 150 + question.number;
    const unitCounts2021 = [150, 150, 150, 126];
    const expectedNextNumber = year === 2021
      ? question.number < unitCounts2021[question.unit - 1]
        ? question.number + 1
        : question.unit < 4 ? 1 : null
      : globalNumber < (year === 2018 ? 162 : 600) ? globalNumber + 1 : null;
    const trailingToken = question.explanation.match(/([0-9IL&]{1,3})[.．、,，]?$/i)?.[1];
    if (!trailingToken) continue;
    const normalizedNumber = Number(
      trailingToken.toUpperCase().replaceAll('I', '1').replaceAll('L', '1').replaceAll('&', '8')
    );
    assert.notEqual(normalizedNumber, expectedNextNumber, `${question.id} 解析末尾混入下一题编号`);
  }
  assert.ok(importedPdfQuestions.every(question => !/第[一二三四]单元$/.test(question.explanation)));
  assert.doesNotMatch(getQuestionById('2022-U2-080').explanation, /23L$/);
  assert.doesNotMatch(getQuestionById('2022-U4-068').explanation, /519$/);
  assert.doesNotMatch(getQuestionById('2021-U3-150').explanation, /第四单元$/);
  assert.match(getQuestionById('2018-U0-060').explanation, /=96。$/);

  const groups = new Map();
  for (const question of QUESTIONS.filter(item => item.groupId)) {
    if (!groups.has(question.groupId)) groups.set(question.groupId, []);
    groups.get(question.groupId).push(question);
  }
  for (const [groupId, members] of groups) {
    assert.ok(members.length === 2 || members.length === 3, `${groupId} 题组大小异常`);
    assert.equal(new Set(members.map(question => question.type)).size, 1);
    assert.equal(new Set(members.map(question => question.groupStart)).size, 1);
    assert.equal(new Set(members.map(question => question.groupEnd)).size, 1);
    assert.equal(members[0].groupStart, Math.min(...members.map(question => question.number)));
    assert.equal(members[0].groupEnd, Math.max(...members.map(question => question.number)));
  }
});

test('同步合并保留两端独立记录，不整库覆盖', () => {
  const base = { schemaVersion:1, deviceId:'a', settings:{version:1,updatedAt:'2026-01-01'}, attempts:{local:{id:'local',version:1,updatedAt:'2026-01-01'}}, wrongs:{}, favorites:{}, important:{}, later:{}, knowledge:{}, sessions:{}, exams:{}, reinforcementQueue:[] };
  const remoteState = { ...structuredClone(base), deviceId:'b', attempts:{remote:{id:'remote',version:1,updatedAt:'2026-01-02'}} };
  const merged = mergeSyncPayload(base, createSyncPayload(remoteState));
  assert.ok(merged.attempts.local);
  assert.ok(merged.attempts.remote);
});

test('同步携带当前练习位置并按较新会话恢复游标', () => {
  const base = { schemaVersion:1, deviceId:'a', settings:{version:1,updatedAt:'2026-01-01'}, attempts:{}, wrongs:{}, favorites:{}, important:{}, later:{}, knowledge:{}, sessions:{local:{id:'local',version:1,updatedAt:'2026-01-01',completed:false}}, currentSessionId:'local', exams:{}, currentExamId:null, reinforcementQueue:[] };
  const remoteState = structuredClone(base);
  remoteState.sessions.remote = {id:'remote',version:2,updatedAt:'2026-01-02',completed:false,page:3};
  remoteState.currentSessionId = 'remote';
  const merged = mergeSyncPayload(base, createSyncPayload(remoteState));
  assert.equal(merged.currentSessionId, 'remote');
  assert.equal(merged.sessions.remote.page, 3);
});

test('备份不导出同步密码哈希且可通过格式验证', () => {
  const state = { schemaVersion:1, deviceId:'a', settings:{theme:'system'}, attempts:{}, wrongs:{}, favorites:{}, important:{}, later:{}, knowledge:{}, sessions:{}, currentSessionId:null, exams:{}, currentExamId:null, reinforcementQueue:[], activity:[], sync:{code:'ABCDE-FGHIJ',passwordHash:'secret-hash',lastSyncedAt:null,backend:'not-configured'} };
  const backup = backupPayload(state);
  assert.equal(backup.data.sync.passwordHash, null);
  assert.equal(validateBackup(backup).sync.passwordHash, null);
});

test('首页主要内容只有复习模式和考试模式两个按钮', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const mainMarkup = html.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '';
  const buttons = [...mainMarkup.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map(match => match[1].trim());
  assert.deepEqual(buttons, ['复习模式', '考试模式']);
  assert.match(html, /<dialog id="review-count-dialog" aria-labelledby="review-count-heading">/);
  assert.match(html, /data-review-count="10"/);
  assert.match(html, /data-review-count="50"/);
  assert.match(html, /data-review-count="100"/);
  assert.match(html, /data-show-custom-count/);
  assert.match(html, /aria-live="polite"/);
  for (const removed of ['设置', '科目', '难度', '错题本', '收藏', '重点题']) {
    assert.doesNotMatch(mainMarkup, new RegExp(removed));
  }
});

test('复习题把选项框、正文和状态合并为一个无障碍名称，不弹出对错提示', async () => {
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /const prompt = question\.prompt \|\| question\.stem/);
  assert.match(app, /\$\{sequence\}\. \$\{esc\(prompt\)\}（ ）/);
  assert.match(app, /type="radio"/);
  assert.match(app, /aria-label="\$\{esc\(accessibleName\)\}"/);
  assert.match(app, /<span aria-hidden="true">\$\{esc\(visibleName\)\}<\/span>/);
  assert.match(app, /optionResults/);
  assert.match(app, /正确' : '错误'/);
  assert.match(app, /<summary>本题讲解<\/summary>/);
  assert.match(app, /answer\.firstCorrect === false/);
  assert.match(app, /共用题干/);
  assert.match(app, /共用备选答案/);
  assert.match(app, /createReviewPaper\(safeCount\)/);
  assert.doesNotMatch(app, /<legend/);
  assert.doesNotMatch(app, /请选择一个答案/);
  assert.doesNotMatch(app, /answer-feedback/);
  for (const control of ['跳到页首', '上一页', '下一页', '跳到页尾', '输入页数', '跳转']) {
    assert.match(app, new RegExp(control));
  }
  assert.doesNotMatch(app, /addEventListener\(['"]keydown['"]/);
  assert.doesNotMatch(app, /key\s*===\s*['"][A-E]/);
});

test('考试按四单元出题，交卷前不显示反馈或讲解，交卷后展示错题解析', async () => {
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /EXAM_UNITS\.map/);
  assert.match(app, /createExamPaper\(unit\)/);
  assert.match(app, /blueprintVersion: EXAM_BLUEPRINT_VERSION/);
  assert.match(app, /paperFormatVersion: PAPER_FORMAT_VERSION/);
  assert.match(app, /mode === 'review'/);
  assert.match(app, /进入\$\{nextTypeLabel\}后，将不能返回或修改/);
  assert.match(app, /data-confirm-type-transition/);
  assert.match(app, /lockedTypes/);
  assert.match(app, /答对 \$\{exam\.result\.correct\} 题，答错 \$\{exam\.result\.wrong\} 题/);
  assert.match(app, /错题和解析/);
  assert.match(app, /wrongIds/);
  assert.doesNotMatch(app, /<ul class="common-options"/);
  assert.doesNotMatch(app, /<ul class="result-options"/);
});

test('Service Worker 离线缓存包含新题库和当前资源版本', async () => {
  const worker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(worker, /questions-bank\.js/);
  assert.match(worker, /questions-2023\.js/);
  assert.match(worker, /questions-2024\.js/);
  assert.match(worker, /questions-2018-2022\.js/);
  for (const year of [2018, 2019, 2020, 2021, 2022]) {
    assert.match(worker, new RegExp(`questions-${year}\\.js`));
  }
  assert.match(worker, /app\.js\?v=15/);
  assert.match(worker, /styles\.css\?v=9/);
});
