import assert from 'node:assert/strict';
import test from 'node:test';
import { SUBJECT_QUESTIONS } from '../js/questions-subjects.js';
import { auditSubjectQuality } from '../scripts/audit-subject-quality.mjs';

test('专项质量审计覆盖全部题目、B1/A3题组及已处置候选', async () => {
  const report = await auditSubjectQuality();
  assert.equal(report.scope.subjects, 11);
  assert.equal(report.scope.questions, 1017);
  assert.deepEqual(report.scope.types, { 'A1/A2': 785, A3: 51, B1: 181 });
  assert.deepEqual(report.scope.groupsByType, { A3: 16, B1: 88 });
  assert.equal(report.scope.groups, 104);
  assert.deepEqual(report.restoredLegacyB1, { groups: 13, questions: 29 });
  assert.equal(report.candidates.placeholderStem, 0);
  assert.equal(report.candidates.explicitAnswerExplanationConflicts, 0);
  assert.equal(report.candidates.duplicateAnswerConflicts, 0);
  assert.equal(report.candidates.adjacentShift, 0);
  assert.equal(report.candidates.answerExplanationHeuristic, 29);
  assert.equal(report.candidates.repeatedExplanationAcrossGroups, 2);
  assert.equal(report.candidates.manualReview, 1);
  assert.equal(report.candidates.unreviewed, 0);
  assert.deepEqual(report.errors, []);
});

test('每个B1子题和A3子题保持完整题组语义与连续部署', () => {
  const indexById = new Map(SUBJECT_QUESTIONS.map((question, index) => [question.id, index]));
  const groups = new Map();
  for (const question of SUBJECT_QUESTIONS.filter(item => item.groupId)) {
    if (!groups.has(question.groupId)) groups.set(question.groupId, []);
    groups.get(question.groupId).push(question);
  }
  for (const members of groups.values()) {
    assert.ok(members.length >= 2);
    const indexes = members.map(question => indexById.get(question.id));
    assert.ok(indexes.every((value, index) => index === 0 || value === indexes[index - 1] + 1));
    if (members[0].type === 'B1') {
      const options = JSON.stringify(members[0].sharedOptions);
      assert.ok(members.every(question => question.prompt.trim()));
      assert.ok(members.every(question => JSON.stringify(question.sharedOptions) === options));
      assert.ok(members.every(question => question.options[question.answer]));
    }
    if (members[0].type === 'A3') {
      const sharedStem = members[0].sharedStem;
      assert.ok(sharedStem.trim());
      assert.ok(members.every(question => question.sharedStem === sharedStem));
      assert.ok(members.every(question => question.prompt.trim()));
    }
  }
});
