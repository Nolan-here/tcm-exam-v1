import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS } from '../js/questions-bank.js';
import { QUESTIONS_2024 } from '../js/questions-2024.js';
import { QUESTIONS_2023 } from '../js/questions-2023.js';
import { QUESTIONS_2018_2022 } from '../js/questions-2018-2022.js';
import {
  SOURCE_CONFIRMED_QUESTION_REPAIRS,
  applySourceConfirmedQuestionRepairs,
} from '../js/source-confirmed-question-repairs.js';
import { scanFullQuestionBank } from '../scripts/full-question-bank-quality-scan.mjs';

function readField(question, field) {
  if (field.startsWith('option-')) return question.options?.[field.slice(-1)];
  if (field.startsWith('shared-option-')) return question.sharedOptions?.[field.slice(-1)];
  return question[field];
}

function flattenQuestion(question, prefix = '', result = new Map()) {
  if (question && typeof question === 'object' && !Array.isArray(question)) {
    for (const [key, value] of Object.entries(question)) {
      flattenQuestion(value, prefix ? `${prefix}.${key}` : key, result);
    }
  } else {
    result.set(prefix, JSON.stringify(question));
  }
  return result;
}

test('来源确认修复只覆盖批准的44题50字段', () => {
  const keys = SOURCE_CONFIRMED_QUESTION_REPAIRS.map(repair => `${repair.id}\u0000${repair.field}`);
  assert.equal(SOURCE_CONFIRMED_QUESTION_REPAIRS.length, 50);
  assert.equal(new Set(keys).size, 50);
  assert.equal(new Set(SOURCE_CONFIRMED_QUESTION_REPAIRS.map(repair => repair.id)).size, 44);
  assert.ok(SOURCE_CONFIRMED_QUESTION_REPAIRS.every(repair => !['answer', 'type', 'id', 'unit', 'year'].includes(repair.field)));
  assert.ok(!SOURCE_CONFIRMED_QUESTION_REPAIRS.some(repair => repair.id === '2023-U4-056'));
});

test('正式题库应用修复且底层生成题库仍与修复前值一致', () => {
  const rawQuestions = [...QUESTIONS_2024, ...QUESTIONS_2023, ...QUESTIONS_2018_2022];
  const rawById = new Map(rawQuestions.map(question => [question.id, question]));
  const formalById = new Map(QUESTIONS.map(question => [question.id, question]));
  for (const repair of SOURCE_CONFIRMED_QUESTION_REPAIRS) {
    assert.equal(readField(rawById.get(repair.id), repair.field), repair.before);
    assert.equal(readField(formalById.get(repair.id), repair.field), repair.after);
  }
  assert.deepEqual(
    QUESTIONS.map(question => [question.id, question.answer]),
    rawQuestions.map(question => [question.id, question.answer]),
  );
});

test('正式题库只产生批准的50个字段差异', () => {
  const rawQuestions = [...QUESTIONS_2024, ...QUESTIONS_2023, ...QUESTIONS_2018_2022];
  const actual = [];
  for (let index = 0; index < rawQuestions.length; index += 1) {
    const before = flattenQuestion(rawQuestions[index]);
    const after = flattenQuestion(QUESTIONS[index]);
    for (const field of new Set([...before.keys(), ...after.keys()])) {
      if (before.get(field) !== after.get(field)) actual.push(`${rawQuestions[index].id}\u0000${field}`);
    }
  }
  const expected = SOURCE_CONFIRMED_QUESTION_REPAIRS.map((repair) => {
    let field = repair.field;
    if (field.startsWith('option-')) field = `options.${field.slice(-1)}`;
    if (field.startsWith('shared-option-')) field = `sharedOptions.${field.slice(-1)}`;
    return `${repair.id}\u0000${field}`;
  });
  assert.deepEqual(actual.sort(), expected.sort());
});

test('两处证据边界纠偏保留原始编号、括号和主治标签', () => {
  assert.equal(
    QUESTIONS.find(question => question.id === '2021-U1-086').explanation,
    '本题是对气与脏腑相关理论掌握程度的考查。(1. 肾为生气之根(2. 脾胃为生气之源(3.肺为生气之主。',
  );
  const explanation = QUESTIONS.find(question => question.id === '2021-U3-046').explanation;
  assert.equal((explanation.match(/\(.*?【主治】/g) || []).length, 5);
  assert.doesNotMatch(explanation, /主治:/);
  assert.match(explanation, /\(大敦足厥阴肝经【主治】①/);
  assert.match(explanation, /\(厉兑足阳明胃经【主治】①/);
});

test('修复层对前值漂移、重复字段和缺失ID均立即失败', () => {
  const rawQuestions = [...QUESTIONS_2024, ...QUESTIONS_2023, ...QUESTIONS_2018_2022];
  const firstRepair = SOURCE_CONFIRMED_QUESTION_REPAIRS[0];
  const drifted = rawQuestions.map(question => question.id === firstRepair.id
    ? { ...question, [firstRepair.field]: `${question[firstRepair.field]}漂移` }
    : question);
  assert.throws(() => applySourceConfirmedQuestionRepairs(drifted), /修复前值不匹配/);
  assert.throws(
    () => applySourceConfirmedQuestionRepairs(rawQuestions.filter(question => question.id !== firstRepair.id)),
    /修复题目不存在/,
  );
  SOURCE_CONFIRMED_QUESTION_REPAIRS.push({ ...firstRepair });
  try {
    assert.throws(() => applySourceConfirmedQuestionRepairs(rawQuestions), /修复字段重复/);
  } finally {
    SOURCE_CONFIRMED_QUESTION_REPAIRS.pop();
  }
});

test('修复后不独立清理异常空格，并保留71道缺失解析和原答案冲突', () => {
  const report = scanFullQuestionBank(QUESTIONS);
  assert.equal(report.scanSummary.candidateCount, 649);
  assert.equal(report.scanSummary.affectedQuestionCount, 458);
  assert.deepEqual(report.scanSummary.byIssueType, {
    'internal-cjk-whitespace': 646,
    'unbalanced-brackets': 2,
    'watermark-or-source-noise': 1,
  });
  assert.equal(report.scanSummary.missingOrUnusableExplanationCount, 71);
  assert.equal(report.scanSummary.answerConflictCandidateCount, 1);
});

test('异常空格只随2023-U1-068整段水印删除减少一条，没有独立规范化', () => {
  const rawQuestions = [...QUESTIONS_2024, ...QUESTIONS_2023, ...QUESTIONS_2018_2022];
  const before = scanFullQuestionBank(rawQuestions).candidates
    .filter(candidate => candidate.issueType === 'internal-cjk-whitespace')
    .map(candidate => `${candidate.id}\u0000${candidate.field}`);
  const after = new Set(scanFullQuestionBank(QUESTIONS).candidates
    .filter(candidate => candidate.issueType === 'internal-cjk-whitespace')
    .map(candidate => `${candidate.id}\u0000${candidate.field}`));
  assert.deepEqual(before.filter(key => !after.has(key)), ['2023-U1-068\u0000explanation']);
});
