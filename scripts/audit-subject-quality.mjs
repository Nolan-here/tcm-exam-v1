import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBJECT_QUESTIONS, SUBJECTS } from '../js/questions-subjects.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const PLACEHOLDER_STEM_RE = /^(?:[【[]?\s*配伍题\s*[】\]]?|A[1234](?:\s*\/\s*A4)?型题|B1型题)[（(]?\s*[)）]?$/u;

const clean = value => String(value ?? '').trim();
const normalize = value => clean(value).normalize('NFKC').replace(/[\s，。；：、（）()《》"“”‘’？?！!]/gu, '');
const optionSignature = question => LETTERS.map(letter => normalize(question.options?.[letter])).join('|');

function repeatedExplanationCandidates(questions) {
  const buckets = new Map();
  for (const question of questions) {
    const key = normalize(question.explanation);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(question);
  }
  return [...buckets.values()]
    .filter(items => items.length > 1 && new Set(items.map(question => question.groupId || question.id)).size > 1)
    .map(items => items.map(question => question.id).sort());
}

function answerExplanationCandidates(questions) {
  const candidates = [];
  for (const question of questions) {
    const explanation = normalize(question.explanation);
    const answerText = normalize(question.options?.[question.answer]);
    const mentionedOtherOptions = Object.entries(question.options || {})
      .filter(([letter, text]) => letter !== question.answer && normalize(text).length >= 2 && explanation.includes(normalize(text)))
      .map(([letter]) => letter);
    if (answerText.length >= 2 && !explanation.includes(answerText) && mentionedOtherOptions.length) {
      candidates.push(question.id);
    }
  }
  return candidates.sort();
}

function adjacentShiftCandidates(questions) {
  const bigrams = value => {
    const text = normalize(value);
    const output = new Set();
    for (let index = 0; index < text.length - 1; index += 1) output.add(text.slice(index, index + 2));
    return output;
  };
  const score = (question, explanation) => {
    const expected = bigrams(`${question.stem}${question.options?.[question.answer] || ''}`);
    const actual = bigrams(explanation);
    if (!expected.size) return 0;
    let matches = 0;
    for (const item of expected) if (actual.has(item)) matches += 1;
    return matches / expected.size;
  };
  const candidates = [];
  for (let index = 1; index < questions.length - 1; index += 1) {
    const question = questions[index];
    if (question.groupId) continue;
    const own = score(question, question.explanation);
    const previous = questions[index - 1].subjectId === question.subjectId ? score(questions[index - 1], question.explanation) : 0;
    const next = questions[index + 1].subjectId === question.subjectId ? score(questions[index + 1], question.explanation) : 0;
    if (own < 0.08 && Math.max(previous, next) > own + 0.12) candidates.push(question.id);
  }
  return candidates;
}

export async function auditSubjectQuality(questions = SUBJECT_QUESTIONS, subjects = SUBJECTS) {
  const review = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'data/subject-bank-quality-review.json'), 'utf8'));
  const errors = [];
  const warnings = [];
  const ids = new Set();
  const groups = new Map();

  for (const question of questions) {
    if (ids.has(question.id)) errors.push(`题目 ID 重复：${question.id}`);
    ids.add(question.id);
    if (!clean(question.stem)) errors.push(`${question.id} 题干为空`);
    if (PLACEHOLDER_STEM_RE.test(clean(question.stem))) errors.push(`${question.id} 题干只有题型占位文字`);
    if (LETTERS.some(letter => !clean(question.options?.[letter]))) errors.push(`${question.id} 缺少 A—E 选项`);
    if (!LETTERS.includes(question.answer) || !clean(question.options?.[question.answer])) errors.push(`${question.id} 答案没有对应选项`);
    if (!clean(question.explanation)) errors.push(`${question.id} 解析为空`);
    for (const match of clean(question.explanation).matchAll(/(?:正确答案|答案|故|本题)(?:应|当|为|是|选|选择|选用|应该选择)*[：:，,。；; ]*([A-E])(?=[^A-Za-z]|$)/giu)) {
      if (match[1].toUpperCase() !== question.answer) errors.push(`${question.id} 解析明示答案 ${match[1].toUpperCase()}，与字段 ${question.answer} 冲突`);
    }
    if (question.groupId) {
      if (!groups.has(question.groupId)) groups.set(question.groupId, []);
      groups.get(question.groupId).push(question);
    }
  }

  const questionIndexes = new Map(questions.map((question, index) => [question.id, index]));
  for (const [groupId, members] of groups) {
    const indexes = members.map(member => questionIndexes.get(member.id));
    if (indexes.some((value, index) => index && value !== indexes[index - 1] + 1)) errors.push(`${groupId} 的成员在部署数组中不连续`);
    if (members.length < 2) errors.push(`${groupId} 少于两个子题`);
    if (members[0].type === 'B1') {
      const signature = optionSignature(members[0]);
      if (members.some(member => optionSignature(member) !== signature || optionSignature({ options: member.sharedOptions }) !== signature)) {
        errors.push(`${groupId} 的 B1 共用选项不一致`);
      }
      if (members.some(member => !clean(member.prompt) || PLACEHOLDER_STEM_RE.test(clean(member.prompt)))) errors.push(`${groupId} 存在无实际语义的 B1 子题`);
      const subNumbers = members.map(member => member.sourceSubQuestionNumber).filter(Number.isFinite);
      if (subNumbers.length && JSON.stringify(subNumbers) !== JSON.stringify(Array.from({ length: members.length }, (_, index) => index + 1))) {
        errors.push(`${groupId} 的旧格式 B1 子题号不连续`);
      }
    }
    if (members[0].type === 'A3') {
      const sharedStem = clean(members[0].sharedStem);
      if (!sharedStem || members.some(member => clean(member.sharedStem) !== sharedStem)) errors.push(`${groupId} 的 A3 共用病例缺失或不一致`);
      if (members.some(member => !clean(member.prompt))) errors.push(`${groupId} 存在空 A3 子题`);
    }
  }

  const sameQuestionBuckets = new Map();
  for (const question of questions) {
    const key = `${normalize(question.stem)}\u0000${optionSignature(question)}`;
    if (!sameQuestionBuckets.has(key)) sameQuestionBuckets.set(key, []);
    sameQuestionBuckets.get(key).push(question);
  }
  const conflictingDuplicates = [...sameQuestionBuckets.values()].filter(items => (
    items.length > 1 && new Set(items.map(question => normalize(question.options?.[question.answer]))).size > 1
  ));
  for (const items of conflictingDuplicates) errors.push(`重复题答案正文冲突：${items.map(question => question.id).join('、')}`);

  const heuristicCandidates = answerExplanationCandidates(questions);
  const reviewedConsistent = [...review.answerExplanationHeuristic.internallyConsistentQuestionIds].sort();
  const manualIds = review.manualReviewCandidates.map(candidate => candidate.questionId).sort();
  const reviewedCandidates = [...reviewedConsistent, ...manualIds].sort();
  if (JSON.stringify(heuristicCandidates) !== JSON.stringify(reviewedCandidates)) {
    errors.push('答案/解析启发式候选集合与人工处置记录不一致');
  }

  const repeated = repeatedExplanationCandidates(questions).map(items => items.join('|')).sort();
  const reviewedRepeated = review.repeatedExplanationReview.map(item => [...item.questionIds].sort().join('|')).sort();
  if (JSON.stringify(repeated) !== JSON.stringify(reviewedRepeated)) errors.push('跨题组重复解析候选与人工处置记录不一致');

  const adjacent = adjacentShiftCandidates(questions);
  if (adjacent.length) errors.push(`发现 ${adjacent.length} 道疑似相邻解析整体偏移题：${adjacent.join('、')}`);
  if (manualIds.length) warnings.push(`${manualIds.length} 道版本口径或证据不足题保留待人工复核`);

  const typeCounts = Object.fromEntries(['A1/A2', 'A3', 'B1'].map(type => [type, questions.filter(question => question.type === type).length]));
  const groupTypeCounts = Object.fromEntries(['A3', 'B1'].map(type => [type, [...groups.values()].filter(members => members[0].type === type).length]));
  const legacyGroups = [...groups.values()].filter(members => members[0].groupId.includes('-B1-LEGACY-'));
  return {
    scope: { subjects: subjects.length, questions: questions.length, types: typeCounts, groups: groups.size, groupsByType: groupTypeCounts },
    restoredLegacyB1: { groups: legacyGroups.length, questions: legacyGroups.reduce((total, members) => total + members.length, 0) },
    candidates: {
      placeholderStem: questions.filter(question => PLACEHOLDER_STEM_RE.test(clean(question.stem))).length,
      explicitAnswerExplanationConflicts: errors.filter(error => error.includes('解析明示答案')).length,
      duplicateAnswerConflicts: conflictingDuplicates.length,
      adjacentShift: adjacent.length,
      answerExplanationHeuristic: heuristicCandidates.length,
      repeatedExplanationAcrossGroups: repeated.length,
      manualReview: manualIds.length,
      unreviewed: errors.filter(error => error.includes('候选集合与人工处置记录不一致')).length,
    },
    candidateIds: {
      answerExplanationHeuristic: heuristicCandidates,
      repeatedExplanationAcrossGroups: repeated,
      adjacentShift: adjacent,
    },
    manualReviewCandidates: review.manualReviewCandidates,
    errors,
    warnings,
  };
}

async function main() {
  const report = await auditSubjectQuality();
  console.log(`专项质量审计：${report.scope.subjects} 科，${report.scope.questions} 题`);
  console.log(`题型：A1/A2 ${report.scope.types['A1/A2']}；A3 ${report.scope.types.A3}；B1 ${report.scope.types.B1}`);
  console.log(`题组：${report.scope.groups}（A3 ${report.scope.groupsByType.A3}；B1 ${report.scope.groupsByType.B1}）`);
  console.log(`恢复旧格式 B1：${report.restoredLegacyB1.groups} 组，${report.restoredLegacyB1.questions} 题`);
  console.log(`占位题干：${report.candidates.placeholderStem}；答案/解析明示冲突：${report.candidates.explicitAnswerExplanationConflicts}；重复题答案冲突：${report.candidates.duplicateAnswerConflicts}`);
  console.log(`相邻解析偏移候选：${report.candidates.adjacentShift}；答案/解析启发式候选：${report.candidates.answerExplanationHeuristic}；跨题组重复解析候选：${report.candidates.repeatedExplanationAcrossGroups}`);
  console.log(`待人工复核：${report.candidates.manualReview}；未处置候选：${report.candidates.unreviewed}`);
  console.log(`错误：${report.errors.length}；警告：${report.warnings.length}`);
  for (const warning of report.warnings) console.log(`warning: ${warning}`);
  for (const error of report.errors) console.error(`error: ${error}`);
  if (report.errors.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
