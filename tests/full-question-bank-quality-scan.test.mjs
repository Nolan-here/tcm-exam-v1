import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS } from '../js/questions-bank.js';
import { scanFullQuestionBank } from '../scripts/full-question-bank-quality-scan.mjs';

const BASE = {
  unit: 1,
  type: 'A1/A2',
  options: { A: '甲', B: '乙', C: '丙', D: '丁', E: '戊' },
  answer: 'A',
};

test('全库质量扫描动态覆盖正式 QUESTIONS', () => {
  const report = scanFullQuestionBank(QUESTIONS);
  assert.equal(report.scope.questionCount, QUESTIONS.length);
  assert.deepEqual(report.scope.years, {
    2018: 162,
    2019: 592,
    2020: 598,
    2021: 565,
    2022: 585,
    2023: 599,
    2024: 391,
  });
  assert.equal(report.structuralBaseline.errorCount, 0);
  assert.deepEqual(
    report.candidates
      .filter(candidate => candidate.issueType === 'unbalanced-brackets')
      .map(candidate => candidate.id)
      .sort(),
    ['2021-U1-086', '2021-U3-046'],
  );
});

test('扫描能区分水印、下一题号、中文断裂空格和不可用解析', () => {
  const questions = [
    {
      ...BASE,
      id: '2099-U1-001',
      number: 1,
      stem: '医 学测试题',
      explanation: '正常解析。2. 【一点笔记】。',
    },
    {
      ...BASE,
      id: '2099-U1-002',
      number: 2,
      stem: '第二题',
      explanation: 'D略。【一点笔记】。',
    },
  ];
  const report = scanFullQuestionBank(questions);
  const kinds = new Set(report.candidates.map(candidate => candidate.issueType));
  assert.ok(kinds.has('watermark-or-source-noise'));
  assert.ok(kinds.has('possible-next-question-number'));
  assert.ok(kinds.has('internal-cjk-whitespace'));
  assert.equal(report.scanSummary.missingOrUnusableExplanationCount, 1);
});

test('答案冲突只报告同题同选项集合但正确答案正文不同的情况', () => {
  const questions = [
    { ...BASE, id: '2099-U1-001', number: 1, stem: '同一题', explanation: '解析一。' },
    { ...BASE, id: '2099-U1-002', number: 2, stem: '同一题', answer: 'B', explanation: '解析二。' },
  ];
  const report = scanFullQuestionBank(questions);
  assert.equal(report.scanSummary.answerConflictCandidateCount, 1);
  assert.deepEqual(report.answerConflictCandidates[0].ids, ['2099-U1-001', '2099-U1-002']);
});

test('O139等字母数字术语不作为孤立O，真正孤立O仍保留候选', () => {
  const questions = [
    { ...BASE, id: '2099-U1-001', number: 1, stem: '霍乱O139血清型', explanation: '正常解析。' },
    { ...BASE, id: '2099-U1-002', number: 2, stem: '异常 O 字符', explanation: '正常解析。' },
  ];
  const report = scanFullQuestionBank(questions);
  const suspiciousIds = report.candidates
    .filter(candidate => candidate.issueType === 'suspicious-ocr-symbol')
    .map(candidate => candidate.id);
  assert.deepEqual(suspiciousIds, ['2099-U1-002']);
});
