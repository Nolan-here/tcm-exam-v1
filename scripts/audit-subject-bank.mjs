import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  QUESTIONS,
  SUBJECTS,
  SUBJECT_QUESTIONS,
  SUBJECT_BANK_VERSION,
} from '../js/questions-bank.js';
import { SUBJECT_SOURCE_METADATA } from './subject-metadata.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const report = JSON.parse(await readFile(path.join(projectRoot, 'data/subject-bank-import-report.json'), 'utf8'));
const letters = ['A', 'B', 'C', 'D', 'E'];
const errors = [];
const warnings = [];

const normalize = value => String(value ?? '').replace(/\s+/g, '');
const fingerprint = question => JSON.stringify([
  normalize(question.stem),
  letters.map(letter => normalize(question.options?.[letter])),
  question.answer,
  normalize(question.explanation),
]);

if (report.subjectBankVersion !== SUBJECT_BANK_VERSION) errors.push('导入报告与科目题库版本不一致');
if (report.deployedQuestions !== SUBJECT_QUESTIONS.length) errors.push('导入报告与实际部署题数不一致');
if (report.subjects.length !== SUBJECTS.length) errors.push('导入报告与实际科目数不一致');

const expectedOrder = SUBJECT_SOURCE_METADATA.map(subject => subject.subjectId);
if (JSON.stringify(SUBJECTS.map(subject => subject.id)) !== JSON.stringify(expectedOrder)) {
  errors.push('科目列表没有保持集中映射定义的确定性顺序');
}

const questionIds = new Set();
for (const subject of SUBJECTS) {
  const metadata = SUBJECT_SOURCE_METADATA.find(item => item.subjectId === subject.id);
  if (!metadata
    || subject.name !== metadata.subjectName
    || subject.sourceName !== metadata.sourceName
    || subject.sourceFileName !== metadata.sourceFileName
    || subject.order !== metadata.order) {
    errors.push(`${subject.id} 的原始文件、稳定 ID 与正式科目名称映射不一致`);
  }
  if (!subject.name || /\.txt$/i.test(subject.name) || /[\\/]/.test(subject.name)) {
    errors.push(`科目名称含扩展名或路径：${subject.name}`);
  }
  if (SUBJECT_SOURCE_METADATA.some(item => item.sourceName === subject.name)) {
    errors.push(`原始文件名噪声泄漏为显示名称：${subject.name}`);
  }
  const questions = SUBJECT_QUESTIONS.filter(question => question.subjectId === subject.id);
  if (questions.length !== subject.count) errors.push(`${subject.name} 的统计题数与实际题数不一致`);
  if (!questions.length) errors.push(`${subject.name} 没有有效题目`);
  for (const question of questions) {
    if (questionIds.has(question.id)) errors.push(`题目 ID 重复：${question.id}`);
    questionIds.add(question.id);
    if (question.subject !== subject.name || question.sourceSubject !== subject.name) {
      errors.push(`${question.id} 的科目绑定不一致`);
    }
    if (letters.some(letter => !normalize(question.options?.[letter]))) errors.push(`${question.id} 缺少 A—E 选项`);
    if (!letters.includes(question.answer) || !question.options?.[question.answer]) errors.push(`${question.id} 答案无效`);
    if (!normalize(question.stem)) errors.push(`${question.id} 题干为空`);
    if (!normalize(question.explanation)) errors.push(`${question.id} 解析为空`);
  }
}

const groups = new Map();
for (const question of SUBJECT_QUESTIONS.filter(item => item.groupId)) {
  if (!groups.has(question.groupId)) groups.set(question.groupId, []);
  groups.get(question.groupId).push(question);
}
for (const [groupId, members] of groups) {
  const starts = new Set(members.map(question => question.groupStart));
  const ends = new Set(members.map(question => question.groupEnd));
  if (starts.size !== 1 || ends.size !== 1) errors.push(`${groupId} 的题组范围不一致`);
  if (members[0].type === 'B1') {
    const options = JSON.stringify(members[0].sharedOptions);
    if (members.some(question => JSON.stringify(question.sharedOptions) !== options)) errors.push(`${groupId} 的共用选项不一致`);
  }
  if (members[0].type === 'A3') {
    const stem = members[0].sharedStem;
    if (members.some(question => question.sharedStem !== stem)) errors.push(`${groupId} 的共用题干不一致`);
  }
}

const subjectFingerprints = new Map();
for (const question of SUBJECT_QUESTIONS) {
  const key = fingerprint(question);
  if (!subjectFingerprints.has(key)) subjectFingerprints.set(key, []);
  subjectFingerprints.get(key).push(question.id);
}
const remainingDuplicates = [...subjectFingerprints.values()].filter(ids => ids.length > 1);
if (remainingDuplicates.length) warnings.push(`部署题库仍有 ${remainingDuplicates.length} 组完全相同题目`);

const annualFingerprints = new Set(QUESTIONS.map(fingerprint));
const annualOverlap = SUBJECT_QUESTIONS.filter(question => annualFingerprints.has(fingerprint(question))).length;
if (report.formatAnomalies) warnings.push(`原始 TXT 保留 ${report.formatAnomalies} 条格式异常记录`);
if (report.duplicateQuestions) warnings.push(`导入时识别并排除 ${report.duplicateQuestions} 道完全重复题`);

console.log(`科目题库版本：${SUBJECT_BANK_VERSION}`);
console.log(`科目：${SUBJECTS.length}；部署题目：${SUBJECT_QUESTIONS.length}；题组：${groups.size}`);
console.log(`缺少答案：${report.missingAnswers}；缺少解析：${report.missingExplanations}；无效题：${report.invalidQuestions}`);
console.log(`与年度题库完全相同的题目：${annualOverlap}（科目模式独立存储，未追加到年度随机题池）`);
console.log(`结构错误：${errors.length}；警告：${warnings.length}`);
for (const warning of warnings) console.log(`warning: ${warning}`);
for (const error of errors) console.error(`error: ${error}`);
if (errors.length) process.exitCode = 1;
