import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { QUESTIONS } from '../js/questions-bank.js';
import { auditQuestionBank } from '../scripts/question-bank-audit.mjs';

const execFileAsync = promisify(execFile);

function countBy(values) {
  const counts = new Map();
  for (const value of values) counts.set(String(value), (counts.get(String(value)) || 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right, 'zh-CN')));
}

test('默认命令审计应用当前实际加载的完整题库', async () => {
  const { stdout } = await execFileAsync(process.execPath, ['scripts/audit-question-bank.mjs'], {
    cwd: new URL('..', import.meta.url),
    maxBuffer: 4 * 1024 * 1024,
  });
  const report = JSON.parse(stdout);
  assert.match(report.input, /[\\/]js[\\/]questions-bank\.js$/);
  assert.equal(report.exportName, 'QUESTIONS');
  assert.equal(report.questionCount, QUESTIONS.length);
  assert.equal(report.errorCount, 0);
});

test('完整审计动态报告当前年份、题型和题组覆盖', () => {
  const report = auditQuestionBank(QUESTIONS);
  const expectedYears = countBy(QUESTIONS.map(question => question.id.match(/^(\d{4})/)?.[1] ?? '(无法识别)'));
  const expectedTypes = countBy(QUESTIONS.map(question => question.type || '(缺失)'));
  const grouped = QUESTIONS.filter(question => question.groupId);
  assert.equal(report.questionCount, QUESTIONS.length);
  assert.deepEqual(report.years, expectedYears);
  assert.deepEqual(report.types, expectedTypes);
  assert.equal(report.groups.groupCount, new Set(grouped.map(question => question.groupId)).size);
  assert.equal(report.groups.groupedQuestionCount, grouped.length);
  assert.equal(report.groups.byType.A3.questions, grouped.filter(question => question.type === 'A3').length);
  assert.equal(report.groups.byType.B1.questions, grouped.filter(question => question.type === 'B1').length);
  assert.equal(report.errorCount, 0);
  assert.ok(!report.issues.some(issue => issue.id === '2021-U3-046' && issue.kind === 'ocr-symbol'));

  const expectedPlaceholders = QUESTIONS
    .filter(question => /^(?:原文件未提供解析。?|略。?|实记题。?|\d{1,3})$/.test(question.explanation.trim()))
    .map(question => question.id)
    .sort();
  const reportedPlaceholders = report.issues
    .filter(issue => issue.kind === 'placeholder-explanation')
    .map(issue => issue.id)
    .sort();
  assert.deepEqual(reportedPlaceholders, expectedPlaceholders);
});

test('内容警告能识别略、OCR 水印、域名和下一题题号', () => {
  const base = {
    unit: 1,
    type: 'A1/A2',
    options: { A: '甲', B: '乙', C: '丙', D: '丁', E: '戊' },
    answer: 'A',
  };
  const sample = [
    { ...base, id: '2099-U1-001', number: 1, stem: '测试题一', explanation: '略。' },
    { ...base, id: '2099-U1-002', number: 2, stem: '测试题二', explanation: '正常内容。3. 【一点笔记】。' },
    { ...base, id: '2099-U1-003', number: 3, stem: '测试题三', explanation: '正常内容。 iji.com。' },
    { ...base, id: '2099-U1-004', number: 4, stem: '测试题四', explanation: 'D略。【一点笔记】。' },
    { ...base, id: '2099-U1-005', number: 5, stem: '测试题五', explanation: '霍乱O139血清型。' },
    { ...base, id: '2099-U1-006', number: 6, stem: '测试题六', explanation: '正常内容 O 异常字符。' },
  ];
  const report = auditQuestionBank(sample);
  const kinds = new Set(report.issues.map(issue => issue.kind));
  assert.equal(report.errorCount, 0);
  assert.ok(kinds.has('placeholder-explanation'));
  assert.ok(kinds.has('unusable-explanation'));
  assert.ok(kinds.has('watermark'));
  assert.ok(kinds.has('ocr-symbol'));
  assert.ok(kinds.has('merged-question-anchor'));
  assert.ok(!report.issues.some(issue => issue.id === '2099-U1-005' && issue.kind === 'ocr-symbol'));
  assert.ok(report.issues.some(issue => issue.id === '2099-U1-006' && issue.kind === 'ocr-symbol'));
});

test('结构错误会失败而不会被降级为警告', () => {
  const report = auditQuestionBank([{
    id: '2099-U1-001',
    unit: 1,
    number: 1,
    type: 'B1',
    stem: '',
    options: { A: '甲' },
    answer: 'Z',
    explanation: '',
  }]);
  const kinds = new Set(report.issues.filter(issue => issue.severity === 'error').map(issue => issue.kind));
  for (const expected of [
    'missing-stem',
    'invalid-option-keys',
    'missing-option',
    'invalid-answer',
    'empty-explanation',
    'missing-group-id',
    'missing-group-prompt',
    'invalid-shared-options',
  ]) {
    assert.ok(kinds.has(expected), `应报告 ${expected}`);
  }
});
