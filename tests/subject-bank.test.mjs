import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  QUESTIONS,
  SUBJECTS,
  SUBJECT_QUESTIONS,
  SUBJECT_BANK_VERSION,
  SUBJECT_BANK_COMPATIBLE_VERSIONS,
  createReviewPaper,
  createSubjectReviewPaper,
  getQuestionById,
  getQuestionsForSubject,
  isSubjectBankVersionCompatible,
} from '../js/questions-bank.js';
import {
  parseSubjectText,
  sourceNameFromFile,
  subjectNameFromFile,
} from '../scripts/import-subject-txt.mjs';
import { SUBJECT_SOURCE_METADATA } from '../scripts/subject-metadata.mjs';

const EXPECTED_SUBJECTS = [
  ['中医儿科学', 86],
  ['中医内科学', 76],
  ['中医基础理论', 82],
  ['中医外科学', 85],
  ['中医妇科学', 115],
  ['中医诊断学', 94],
  ['中药学', 100],
  ['方剂学', 100],
  ['诊断学基础', 100],
  ['内科学', 78],
  ['针灸学', 101],
];

test('TXT 文件名主体与正式科目名称分离且兼容 Windows 和 POSIX 路径', () => {
  assert.equal(sourceNameFromFile('D:\\题库\\中医内科学题1 .txt'), '中医内科学题1');
  assert.equal(subjectNameFromFile('D:\\题库\\中医内科学题1 .txt'), '中医内科学');
  assert.equal(subjectNameFromFile('/tmp/中医基础理论题.TXT'), '中医基础理论');
});

test('11个原始文件名集中映射到权威科目名称并保持既有 subjectId', () => {
  const expected = [
    ['中医儿科学题', 'subject-886e0290c4c6', '中医儿科学'],
    ['中医内科学题1', 'subject-f8eb0c1c1d57', '中医内科学'],
    ['中医基础理论题', 'subject-437640b320ee', '中医基础理论'],
    ['中医外科学题', 'subject-8fadaa1450e8', '中医外科学'],
    ['中医妇科学题', 'subject-7d747b081087', '中医妇科学'],
    ['中医诊断学题1', 'subject-2a05fbb70d6a', '中医诊断学'],
    ['中药学题', 'subject-c7ee53845f8b', '中药学'],
    ['方剂学提', 'subject-04ce7c00ab3a', '方剂学'],
    ['西依诊断学题', 'subject-4aad384976f8', '诊断学基础'],
    ['西医内科学题', 'subject-0ceb3f008cc1', '内科学'],
    ['针灸学题', 'subject-6506ca413a14', '针灸学'],
  ];
  assert.deepEqual(
    SUBJECT_SOURCE_METADATA.map(item => [item.sourceName, item.subjectId, item.subjectName]),
    expected,
  );
  assert.deepEqual(SUBJECT_BANK_COMPATIBLE_VERSIONS, [
    SUBJECT_BANK_VERSION,
    'subject-txt-5c99dc87d7df90f3',
  ]);
  assert.equal(isSubjectBankVersionCompatible('subject-txt-5c99dc87d7df90f3'), true);
  assert.equal(isSubjectBankVersionCompatible('unknown-version'), false);
});

test('TXT 解析兼容 BOM、CRLF、多行解析、B1 合并答案和 A3 共用题干', () => {
  const source = '\uFEFF测试科目参考答案与解析\r\n\r\n'
    + '1.普通题\r\nA.甲\r\nB.乙\r\nC.丙\r\nD.丁\r\nE.戊\r\n正确答案：B.乙\r\n解析：第一行\r\n第二行\r\n\r\n'
    + '(2~3)共用选项\r\nA.一\r\nB.二\r\nC.三\r\nD.四\r\nE.五\r\n2.题二\r\n3.题三\r\n正确答案：2.A 3.C\r\n解析：共用解析\r\n\r\n'
    + '(4~5)共用题干单选\r\n共同病例\r\n4.问题四\r\nA.甲\r\nB.乙\r\nC.丙\r\nD.丁\r\nE.戊\r\n正确答案：D\r\n解析：解析四\r\n\r\n'
    + '5.问题五\r\nA.甲\r\nB.乙\r\nC.丙\r\nD.丁\r\nE.戊\r\n正确答案：E\r\n解析：解析五';
  const result = parseSubjectText(source, { subjectName: '测试科目' });
  assert.equal(result.questions.length, 5);
  assert.deepEqual(result.questions.map(question => question.type), ['A1/A2', 'B1', 'B1', 'A3', 'A3']);
  assert.equal(result.questions[0].explanation, '第一行\n第二行');
  assert.equal(result.questions[1].answer, 'A');
  assert.equal(result.questions[2].answer, 'C');
  assert.equal(result.questions[3].sharedStem, '共同病例');
  assert.equal(result.questions[4].stem, '共同病例 问题五');
  assert.equal(result.invalidQuestionCount, 0);
  assert.deepEqual(result.issues, []);
});

test('TXT 解析恢复“配伍题 + 括号子题”旧格式并保留后续稳定 ID', () => {
  const source = '1.普通题\nA.甲\nB.乙\nC.丙\nD.丁\nE.戊\n正确答案：A\n解析：普通解析\n\n'
    + '2.【配伍题】\nA.甲\nB.乙\nC.丙\nD.丁\nE.戊\n'
    + '(1)第一子题\n(2)第二子题\n正确答案：(1)B.乙 (2)D.丁\n解析：(1)第一解析\n(2)第二解析\n\n'
    + '3.后续普通题\nA.甲\nB.乙\nC.丙\nD.丁\nE.戊\n正确答案：C\n解析：后续解析';
  const result = parseSubjectText(source, { subjectName: '测试科目' });
  assert.equal(result.questions.length, 4);
  assert.deepEqual(result.questions.map(question => question.type), ['A1/A2', 'B1', 'B1', 'A1/A2']);
  assert.deepEqual(result.questions.map(question => question.id), [
    'SUB-54d688ad4641-0001',
    'SUB-54d688ad4641-0002',
    'SUB-54d688ad4641-0002-S02',
    'SUB-54d688ad4641-0003',
  ]);
  assert.deepEqual(result.questions.slice(1, 3).map(question => question.prompt), ['第一子题', '第二子题']);
  assert.deepEqual(result.questions.slice(1, 3).map(question => question.answer), ['B', 'D']);
  assert.deepEqual(result.questions.slice(1, 3).map(question => question.sourceQuestionNumber), [2, 2]);
  assert.deepEqual(result.questions.slice(1, 3).map(question => question.sourceSubQuestionNumber), [1, 2]);
  assert.equal(result.questions[1].groupId, result.questions[2].groupId);
  assert.deepEqual(result.questions[1].sharedOptions, result.questions[2].sharedOptions);
  assert.equal(result.invalidQuestionCount, 0);
  assert.deepEqual(result.issues, []);
});

test('TXT 解析会报告题组范围异常并阻止缺答案题进入部署结果', () => {
  const source = '(2~3)共用选项\nA.甲\nB.乙\nC.丙\nD.丁\nE.戊\n'
    + '3.缺少前一题且没有答案\n解析：只有解析';
  const result = parseSubjectText(source, { subjectName: '异常测试科目' });
  assert.equal(result.parsedQuestionCount, 1);
  assert.equal(result.invalidQuestionCount, 1);
  assert.equal(result.questions.length, 0);
  assert.ok(result.issues.some(issue => issue.code === 'missing-answer'));
  assert.ok(result.issues.some(issue => issue.code === 'group-range-mismatch'));
});

test('科目题库统计、名称和文件归属与导入报告一致', async () => {
  const report = JSON.parse(await readFile(new URL('../data/subject-bank-import-report.json', import.meta.url), 'utf8'));
  assert.equal(SUBJECT_BANK_VERSION, report.subjectBankVersion);
  assert.equal(report.discoveredTextFiles, 11);
  assert.equal(report.parsedFiles, 11);
  assert.equal(report.failedFiles, 0);
  assert.equal(report.totalParsedQuestions, 1019);
  assert.equal(report.deployedQuestions, 1017);
  assert.equal(report.missingAnswers, 0);
  assert.equal(report.missingExplanations, 0);
  assert.equal(report.invalidQuestions, 0);
  assert.equal(report.formatAnomalies, 1);
  assert.equal(report.duplicateQuestions, 2);
  assert.equal(report.restoredLegacyB1Groups, 13);
  assert.equal(report.restoredLegacyB1Questions, 29);
  assert.equal(report.appliedVerifiedCorrections, 1);
  assert.equal(report.correctedQuestionFields, 2);
  assert.deepEqual(SUBJECTS.map(subject => [subject.name, subject.count]), EXPECTED_SUBJECTS);
  assert.equal(SUBJECT_QUESTIONS.length, 1017);

  for (const subject of SUBJECTS) {
    assert.doesNotMatch(subject.name, /\.txt$|[\\/]/i);
    assert.doesNotMatch(subject.name, /题1|学题|方剂学提|西依/);
    const metadata = SUBJECT_SOURCE_METADATA.find(item => item.subjectId === subject.id);
    assert.equal(subject.name, metadata.subjectName);
    assert.equal(subject.sourceName, metadata.sourceName);
    assert.equal(subject.sourceFileName, metadata.sourceFileName);
    const questions = getQuestionsForSubject(subject.id);
    assert.equal(questions.length, subject.count);
    assert.ok(questions.every(question => question.subjectId === subject.id));
    assert.ok(questions.every(question => question.subject === subject.name));
    assert.ok(questions.every(question => question.sourceSubject === subject.name));
  }
});

test('13个旧格式配伍题恢复为29个真实B1子题且示例映射完整', () => {
  const legacyGroups = new Map();
  for (const question of SUBJECT_QUESTIONS.filter(item => item.groupId?.includes('-B1-LEGACY-'))) {
    if (!legacyGroups.has(question.groupId)) legacyGroups.set(question.groupId, []);
    legacyGroups.get(question.groupId).push(question);
  }
  assert.equal(legacyGroups.size, 13);
  assert.equal([...legacyGroups.values()].reduce((total, members) => total + members.length, 0), 29);

  const sample = SUBJECT_QUESTIONS.filter(question => (
    question.subjectId === 'subject-2a05fbb70d6a'
    && question.sourceQuestionNumber === 29
  ));
  assert.deepEqual(sample.map(question => question.id), [
    'SUB-2a05fbb70d6a-0029',
    'SUB-2a05fbb70d6a-0029-S02',
  ]);
  assert.deepEqual(sample.map(question => question.prompt), ['脾气虚弱的目态是', '脾肾两亏的目态是']);
  assert.deepEqual(sample.map(question => question.answer), ['C', 'D']);
  assert.deepEqual(sample.map(question => question.options[question.answer]), ['昏睡露睛', '双睑下垂']);
  assert.ok(sample.every(question => question.explanation.includes('昏睡露睛')));
  assert.ok(sample.every(question => question.explanation.includes('双睑下垂')));
});

test('科目抽题严格隔离、题量不越界、不重复且不拆题组', () => {
  for (const subject of SUBJECTS) {
    const selected = createSubjectReviewPaper(subject.id, 50, () => 0.37);
    assert.ok(selected.length <= Math.min(50, subject.count));
    assert.ok(selected.length > 0);
    assert.equal(new Set(selected.map(question => question.id)).size, selected.length);
    assert.ok(selected.every(question => question.subjectId === subject.id));

    const selectedIds = new Set(selected.map(question => question.id));
    const poolGroups = new Map();
    for (const question of getQuestionsForSubject(subject.id).filter(question => question.groupId)) {
      if (!poolGroups.has(question.groupId)) poolGroups.set(question.groupId, []);
      poolGroups.get(question.groupId).push(question.id);
    }
    for (const memberIds of poolGroups.values()) {
      const selectedMembers = memberIds.filter(id => selectedIds.has(id));
      assert.ok(selectedMembers.length === 0 || selectedMembers.length === memberIds.length);
    }

    const all = createSubjectReviewPaper(subject.id, subject.count + 999, () => 0.61);
    assert.equal(all.length, subject.count);
    assert.ok(all.every(question => question.subjectId === subject.id));
  }
});

test('同一科目内部随机不会改变科目归属或制造重复', () => {
  const subject = SUBJECTS.find(item => item.name === '中药学');
  const first = createSubjectReviewPaper(subject.id, 50, () => 0);
  const second = createSubjectReviewPaper(subject.id, 50, () => 0.999999);
  assert.notDeepEqual(first.map(question => question.id), second.map(question => question.id));
  for (const paper of [first, second]) {
    assert.equal(new Set(paper.map(question => question.id)).size, paper.length);
    assert.ok(paper.every(question => question.subjectId === subject.id));
  }
});

test('综合随机题池保持原 3492 道年度题，不会混入科目 TXT', () => {
  assert.equal(QUESTIONS.length, 3492);
  const paper = createReviewPaper(100, () => 0.42);
  assert.equal(paper.length, 100);
  assert.ok(paper.every(question => !question.subjectId));
  const subjectQuestion = SUBJECT_QUESTIONS[0];
  assert.equal(getQuestionById(subjectQuestion.id), subjectQuestion);
});
