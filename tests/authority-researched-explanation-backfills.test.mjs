import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS_2023 } from '../js/questions-2023.js';
import { QUESTIONS, SOURCE_CONFIRMED_QUESTIONS } from '../js/questions-bank.js';
import {
  AUTHORITY_RESEARCHED_EXPLANATION_BACKFILLS,
  applyAuthorityResearchedExplanationBackfills,
} from '../js/authority-researched-explanation-backfills.js';
import {
  AUTHORITY_RESEARCHED_EXPLANATION_RECORDS,
  AUTHORITY_RESEARCH_SUMMARY,
} from '../data/authority-researched-explanations-2023.js';
import { AUTHORITY_RESEARCHED_EXPLANATION_DISPUTES_2023 } from '../data/authority-researched-explanation-disputes-2023.js';
import { scanFullQuestionBank } from '../scripts/full-question-bank-quality-scan.mjs';

const EXPECTED_TARGETS_BY_UNIT = {
  1: [17, 63, 95, 117, 118, 119, 120, 121, 125, 126, 137, 138, 145],
  2: [25, 27, 57, 65, 98, 107, 113, 115, 117, 119, 121, 123, 125, 127, 129, 131, 133, 135, 137, 139, 141, 143, 147, 149],
  3: [44, 94, 95, 106, 107, 118, 119, 125, 126, 135, 147, 148],
  4: [32, 56, 85, 88, 90, 91, 93, 94, 96, 97, 99, 100, 102, 103, 105, 106, 108, 109, 111, 114, 115, 133],
};

const EXPECTED_TARGET_IDS = Object.entries(EXPECTED_TARGETS_BY_UNIT).flatMap(([unit, numbers]) => (
  numbers.map(number => `2023-U${unit}-${String(number).padStart(3, '0')}`)
));
const DISPUTE_IDS = ['2023-U1-125', '2023-U2-139', '2023-U3-148', '2023-U4-094', '2023-U4-133'];
const EXPECTED_BACKFILL_IDS = EXPECTED_TARGET_IDS.filter(id => !DISPUTE_IDS.includes(id));
const raw2023ById = new Map(QUESTIONS_2023.map(question => [question.id, question]));
const beforeById = new Map(SOURCE_CONFIRMED_QUESTIONS.map(question => [question.id, question]));
const formalById = new Map(QUESTIONS.map(question => [question.id, question]));
const recordById = new Map(AUTHORITY_RESEARCHED_EXPLANATION_RECORDS.map(record => [record.questionId, record]));

function withoutExplanation(question) {
  const { explanation: _explanation, ...rest } = question;
  return rest;
}

test('2023年缺失或不可用解析集合固定为71题，66题回填且5题保留争议', () => {
  const actualTargets = QUESTIONS_2023
    .filter(question => question.explanation === '略。' || question.id === '2023-U4-056')
    .map(question => question.id)
    .sort();
  assert.deepEqual(actualTargets, [...EXPECTED_TARGET_IDS].sort());
  assert.equal(AUTHORITY_RESEARCHED_EXPLANATION_BACKFILLS.length, 66);
  assert.deepEqual(
    AUTHORITY_RESEARCHED_EXPLANATION_BACKFILLS.map(item => item.id).sort(),
    [...EXPECTED_BACKFILL_IDS].sort(),
  );
  assert.deepEqual(AUTHORITY_RESEARCH_SUMMARY, {
    targetCount: 71,
    backfilledCount: 66,
    disputeCount: 5,
    answerChangedCount: 0,
    uiContainsSourceUrls: false,
  });
});

test('权威回填层仅改动66道题的解析字段，答案、题组和其他年份均不变', () => {
  const changedIds = [];
  assert.equal(QUESTIONS.length, SOURCE_CONFIRMED_QUESTIONS.length);
  for (let index = 0; index < QUESTIONS.length; index += 1) {
    const before = SOURCE_CONFIRMED_QUESTIONS[index];
    const after = QUESTIONS[index];
    assert.equal(after.id, before.id);
    assert.equal(after.answer, before.answer, before.id);
    assert.deepEqual(withoutExplanation(after), withoutExplanation(before), before.id);
    if (after.explanation !== before.explanation) changedIds.push(after.id);
    if (!after.id.startsWith('2023-')) assert.deepEqual(after, before, before.id);
  }
  assert.deepEqual(changedIds.sort(), [...EXPECTED_BACKFILL_IDS].sort());
});

test('66条解析精确匹配前值、以标记结尾且不会把来源网址写入界面', () => {
  for (const backfill of AUTHORITY_RESEARCHED_EXPLANATION_BACKFILLS) {
    assert.equal(beforeById.get(backfill.id).explanation, backfill.before, backfill.id);
    assert.equal(formalById.get(backfill.id).explanation, backfill.after, backfill.id);
    assert.equal((backfill.after.match(/（由AI查询）/gu) || []).length, 1, backfill.id);
    assert.ok(backfill.after.endsWith('（由AI查询）'), backfill.id);
    assert.doesNotMatch(backfill.after, /(?:https?:\/\/|www[.．])/iu, backfill.id);
  }
});

test('证据库完整记录71题，并为每条已写解析保留可追溯的高质量来源', () => {
  assert.equal(AUTHORITY_RESEARCHED_EXPLANATION_RECORDS.length, 71);
  assert.equal(recordById.size, 71);
  assert.deepEqual([...recordById.keys()].sort(), [...EXPECTED_TARGET_IDS].sort());

  for (const id of EXPECTED_BACKFILL_IDS) {
    const record = recordById.get(id);
    const raw = raw2023ById.get(id);
    assert.equal(record.finalStatus, 'backfilled', id);
    assert.equal(record.writtenToQuestionBank, true, id);
    assert.equal(record.originalAnswer, raw.answer, id);
    assert.equal(record.currentAnswer, raw.answer, id);
    assert.equal(record.backfilledExplanation, formalById.get(id).explanation, id);
    assert.notEqual(record.confidence, 'low', id);
    assert.ok(record.sources.length >= 1, id);
    assert.ok(record.substantiveSources.length >= 1, id);
    assert.ok(record.sources.some(source => ['S', 'A', 'B'].includes(source.level)), id);
    assert.ok(record.substantiveSources.some(source => ['S', 'A', 'B', 'C'].includes(source.level)), id);
    assert.equal(record.semanticReviewStatus, 'passed', id);
    assert.equal(record.reverseReviewPassed, true, id);
    assert.equal(record.automatedSemanticValidation, false, id);
    assert.ok(record.semanticReviewNote, id);
    for (const source of record.sources) {
      assert.ok(source.sourceId, id);
      assert.ok(source.organization, id);
      assert.ok(source.title, id);
      assert.match(source.url, /^https:\/\//u, id);
      assert.equal(source.opened, true, id);
      assert.equal(source.accessedOn, '2026-08-24', id);
      assert.ok(source.coreSupport, id);
    }
  }
});

test('正式回填中标记为高风险的题均有两个独立机构的实质来源交叉核对', () => {
  const highRiskRecords = AUTHORITY_RESEARCHED_EXPLANATION_RECORDS.filter(record => (
    record.finalStatus === 'backfilled' && record.independentVerificationRequired
  ));
  assert.ok(highRiskRecords.length > 0);
  for (const record of highRiskRecords) {
    assert.ok(record.substantiveSources.length >= 2, record.questionId);
    assert.ok(new Set(record.substantiveSources.map(source => source.organization)).size >= 2, record.questionId);
    assert.equal(record.secondSourceVerified, true, record.questionId);
  }
});

test('5道答案争议均保留原答案和原始不可用解析，不强行写入', () => {
  assert.deepEqual(
    AUTHORITY_RESEARCHED_EXPLANATION_DISPUTES_2023.map(record => record.questionId).sort(),
    [...DISPUTE_IDS].sort(),
  );
  for (const id of DISPUTE_IDS) {
    const record = recordById.get(id);
    assert.equal(record.finalStatus, 'answer-dispute', id);
    assert.equal(record.writtenToQuestionBank, false, id);
    assert.equal(record.backfilledExplanation, null, id);
    assert.equal(record.originalAnswer, raw2023ById.get(id).answer, id);
    assert.equal(record.currentAnswer, raw2023ById.get(id).answer, id);
    assert.equal(record.currentAnswerText, raw2023ById.get(id).options[raw2023ById.get(id).answer], id);
    assert.equal(record.supportingCurrentAnswerSources[0].title, '考题2023+答案.docx', id);
    assert.ok(record.conflictReason, id);
    assert.equal(record.semanticReviewStatus, 'disputed', id);
    assert.equal(record.reverseReviewPassed, false, id);
    assert.equal(formalById.get(id).explanation, '略。', id);
    assert.equal(formalById.get(id).answer, beforeById.get(id).answer, id);
  }
  assert.equal(recordById.get('2023-U2-139').conflictingSources.length, 2);
  assert.equal(recordById.get('2023-U2-139').possibleTextbookVersionDifference, false);
});

test('正式题库质量扫描只剩5道争议题不可用解析，回填未引入网址或新扫描噪声', () => {
  const report = scanFullQuestionBank(QUESTIONS);
  assert.equal(report.scanSummary.missingOrUnusableExplanationCount, 5);
  assert.deepEqual(report.missingOrUnusableExplanations.map(item => item.id).sort(), [...DISPUTE_IDS].sort());
  assert.equal(report.scanSummary.candidateCount, 647);
  assert.deepEqual(report.scanSummary.byIssueType, {
    'internal-cjk-whitespace': 645,
    'unbalanced-brackets': 2,
  });
  assert.ok(!report.candidates.some(candidate => EXPECTED_BACKFILL_IDS.includes(candidate.id)
    && candidate.field === 'explanation'
    && candidate.issueType === 'watermark-or-source-noise'));
});

test('回填层遇到前值漂移、重复题号或缺失题号时立即失败', () => {
  const first = AUTHORITY_RESEARCHED_EXPLANATION_BACKFILLS[0];
  const drifted = SOURCE_CONFIRMED_QUESTIONS.map(question => question.id === first.id
    ? { ...question, explanation: `${question.explanation}漂移` }
    : question);
  assert.throws(() => applyAuthorityResearchedExplanationBackfills(drifted), /前值不匹配/);
  assert.throws(
    () => applyAuthorityResearchedExplanationBackfills(SOURCE_CONFIRMED_QUESTIONS.filter(question => question.id !== first.id)),
    /题目不存在/,
  );
  AUTHORITY_RESEARCHED_EXPLANATION_BACKFILLS.push({ ...first });
  try {
    assert.throws(() => applyAuthorityResearchedExplanationBackfills(SOURCE_CONFIRMED_QUESTIONS), /题目重复/);
  } finally {
    AUTHORITY_RESEARCHED_EXPLANATION_BACKFILLS.pop();
  }
});
