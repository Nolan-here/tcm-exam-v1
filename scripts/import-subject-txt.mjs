import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const QUESTION_RE = /^\s*(\d+)[.、]\s*(.+)$/;
const OPTION_RE = /^\s*([A-EＡ-Ｅ])[.、．:：]\s*(.*)$/i;
const ANSWER_RE = /^\s*正确答案[：:]\s*(.*)$/;
const EXPLANATION_RE = /^\s*解析[：:]\s*(.*)$/;
const SECTION_RE = /^\s*([一二三四五六七八九十百]+)[、.]\s*$/;
const GROUP_RE = /^\s*[（(]\s*(\d+)\s*[~～—\-至]\s*(\d+)\s*[)）]\s*(共用选项|共用题干单选)(.*)$/;
const SEPARATOR_RE = /^\s*=+\s*$/;

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeLetter(value) {
  return String(value ?? '')
    .replace(/[Ａ-Ｅ]/g, character => String.fromCharCode(character.charCodeAt(0) - 0xFEE0))
    .toUpperCase();
}

function normalizeContent(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').trim();
}

function stableSubjectId(subjectName) {
  return `subject-${createHash('sha256').update(subjectName, 'utf8').digest('hex').slice(0, 12)}`;
}

function parseChineseNumber(value) {
  const digits = new Map([
    ['一', 1], ['二', 2], ['三', 3], ['四', 4], ['五', 5],
    ['六', 6], ['七', 7], ['八', 8], ['九', 9],
  ]);
  if (value === '十') return 10;
  if (value === '百') return 100;
  if (value.includes('十')) {
    const [tens, ones] = value.split('十');
    return (tens ? digits.get(tens) : 1) * 10 + (ones ? digits.get(ones) : 0);
  }
  return digits.get(value) ?? null;
}

export function subjectNameFromFile(filePath) {
  const extension = path.extname(filePath);
  return path.basename(filePath, extension).trim();
}

function isIgnoredLine(line) {
  const text = normalizeContent(line);
  return !text
    || SEPARATOR_RE.test(text)
    || /^（?全文完）?$/.test(text)
    || /参考答案与解析$/.test(text)
    || /^（[^）]+）$/.test(text);
}

function parseOptions(lines, startIndex) {
  const options = {};
  let index = startIndex;
  while (index < lines.length) {
    const text = normalizeContent(lines[index]);
    if (!text) {
      index += 1;
      continue;
    }
    const match = text.match(OPTION_RE);
    if (!match) break;
    options[normalizeLetter(match[1])] = normalizeContent(match[2]);
    index += 1;
  }
  return { options, index };
}

function readExplanation(lines, answerIndex) {
  let index = answerIndex + 1;
  while (index < lines.length && !normalizeContent(lines[index])) index += 1;
  if (index >= lines.length) return { explanation: '', index };
  const first = normalizeContent(lines[index]).match(EXPLANATION_RE);
  if (!first) return { explanation: '', index };

  const parts = [normalizeContent(first[1])];
  index += 1;
  while (index < lines.length) {
    const text = normalizeContent(lines[index]);
    if (!text) {
      index += 1;
      break;
    }
    if (GROUP_RE.test(text) || SECTION_RE.test(text) || QUESTION_RE.test(text)) break;
    parts.push(text);
    index += 1;
  }
  return { explanation: parts.filter(Boolean).join('\n'), index };
}

function parseAnswerMappings(answerText) {
  const mappings = new Map();
  const mappingPattern = /(\d+)\s*[.、:]\s*([A-EＡ-Ｅ])/gi;
  for (const match of answerText.matchAll(mappingPattern)) {
    mappings.set(Number(match[1]), normalizeLetter(match[2]));
  }
  if (mappings.size) return mappings;
  const single = answerText.match(/([A-EＡ-Ｅ])/i);
  return single ? normalizeLetter(single[1]) : null;
}

function questionFingerprint(question) {
  return JSON.stringify([
    question.stem.replace(/\s+/g, ''),
    LETTERS.map(letter => question.options[letter]?.replace(/\s+/g, '') ?? ''),
  ]);
}

function fullQuestionFingerprint(question) {
  return JSON.stringify([
    questionFingerprint(question),
    question.answer,
    question.explanation.replace(/\s+/g, ''),
  ]);
}

export function parseSubjectText(text, {
  subjectName,
  sourceLabel = subjectName,
} = {}) {
  if (!subjectName) throw new Error('缺少科目名称');
  const lines = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const subjectId = stableSubjectId(subjectName);
  const parsed = [];
  const issues = [];
  let index = 0;
  let sectionPending = false;
  let pendingSectionNumber = null;
  let activeGroup = null;
  let groupSequence = 0;
  let current = null;
  let pendingGroupQuestions = [];

  const addIssue = (code, message, lineNumber = null) => {
    issues.push({ subject: subjectName, source: sourceLabel, code, message, lineNumber });
  };

  const validateAndCloseGroup = () => {
    if (!activeGroup) return;
    const members = parsed.filter(question => question.groupId === activeGroup.id);
    const actualNumbers = members.map(question => question.sourceQuestionNumber).filter(Number.isFinite);
    const expected = [];
    for (let number = activeGroup.declaredStart; number <= activeGroup.declaredEnd; number += 1) expected.push(number);
    if (JSON.stringify(actualNumbers) !== JSON.stringify(expected)) {
      addIssue(
        'group-range-mismatch',
        `题组标题声明 ${activeGroup.declaredStart}—${activeGroup.declaredEnd}，实际题号为 ${actualNumbers.join('、') || '无'}。`,
        activeGroup.lineNumber,
      );
    }
    activeGroup = null;
    pendingGroupQuestions = [];
  };

  const maybeCloseCompletedGroup = () => {
    if (!activeGroup) return;
    const members = parsed.filter(question => question.groupId === activeGroup.id);
    const lastNumber = members.at(-1)?.sourceQuestionNumber;
    if (Number.isFinite(lastNumber) && lastNumber >= activeGroup.declaredEnd) validateAndCloseGroup();
  };

  const buildQuestion = (draft, answer, explanation, answerLineNumber) => {
    const ordinal = parsed.length + 1;
    const options = activeGroup?.type === 'B1' ? activeGroup.sharedOptions : draft.options;
    const type = activeGroup?.type ?? 'A1/A2';
    const prompt = normalizeContent(draft.prompt);
    const stem = type === 'A3' ? `${activeGroup.sharedStem} ${prompt}`.trim() : prompt;
    const question = {
      id: `SUB-${subjectId.slice(-12)}-${String(ordinal).padStart(4, '0')}`,
      subjectId,
      subject: subjectName,
      sourceSubject: subjectName,
      number: ordinal,
      sourceQuestionNumber: Number.isFinite(draft.sourceQuestionNumber) ? draft.sourceQuestionNumber : null,
      sourceSectionNumber: Number.isFinite(draft.sourceSectionNumber) ? draft.sourceSectionNumber : null,
      type,
      stem,
      options: { ...options },
      answer,
      explanation: normalizeContent(explanation),
    };
    if (activeGroup) {
      question.prompt = prompt;
      question.groupId = activeGroup.id;
      if (type === 'B1') question.sharedOptions = { ...activeGroup.sharedOptions };
      if (type === 'A3') question.sharedStem = activeGroup.sharedStem;
    }

    const missingLetters = LETTERS.filter(letter => !normalizeContent(question.options[letter]));
    if (!prompt) addIssue('missing-stem', `第 ${ordinal} 道题缺少题干。`, draft.lineNumber);
    if (missingLetters.length) addIssue('missing-options', `第 ${ordinal} 道题缺少选项 ${missingLetters.join('、')}。`, draft.lineNumber);
    if (!answer || !LETTERS.includes(answer)) addIssue('missing-answer', `第 ${ordinal} 道题缺少有效答案。`, answerLineNumber);
    if (answer && !normalizeContent(question.options[answer])) addIssue('answer-option-missing', `第 ${ordinal} 道题的答案 ${answer} 没有对应选项。`, answerLineNumber);
    if (!question.explanation) addIssue('missing-explanation', `第 ${ordinal} 道题缺少解析。`, answerLineNumber);
    parsed.push(question);
    return question;
  };

  const startQuestion = (sourceQuestionNumber, prompt, lineNumber, sourceSectionNumber = null) => ({
    sourceQuestionNumber,
    sourceSectionNumber,
    prompt: normalizeContent(prompt),
    options: {},
    lineNumber,
  });

  while (index < lines.length) {
    const textLine = normalizeContent(lines[index]);
    if (!textLine) {
      index += 1;
      continue;
    }

    const sectionMatch = textLine.match(SECTION_RE);
    if (sectionMatch) {
      validateAndCloseGroup();
      current = null;
      sectionPending = true;
      pendingSectionNumber = parseChineseNumber(sectionMatch[1]);
      index += 1;
      continue;
    }

    const groupMatch = textLine.match(GROUP_RE);
    if (groupMatch) {
      validateAndCloseGroup();
      current = null;
      sectionPending = false;
      pendingSectionNumber = null;
      groupSequence += 1;
      const type = groupMatch[3] === '共用选项' ? 'B1' : 'A3';
      activeGroup = {
        id: `${subjectId}-${type}-G${String(groupSequence).padStart(3, '0')}`,
        type,
        declaredStart: Number(groupMatch[1]),
        declaredEnd: Number(groupMatch[2]),
        lineNumber: index + 1,
        sharedOptions: null,
        sharedStem: null,
      };
      index += 1;
      if (type === 'B1') {
        const result = parseOptions(lines, index);
        activeGroup.sharedOptions = result.options;
        index = result.index;
        const missing = LETTERS.filter(letter => !normalizeContent(activeGroup.sharedOptions[letter]));
        if (missing.length) addIssue('group-missing-options', `共用选项题组缺少 ${missing.join('、')}。`, activeGroup.lineNumber);
      } else {
        while (index < lines.length && !normalizeContent(lines[index])) index += 1;
        activeGroup.sharedStem = normalizeContent(lines[index]);
        if (!activeGroup.sharedStem) addIssue('group-missing-stem', '共用题干题组缺少共用题干。', activeGroup.lineNumber);
        index += 1;
      }
      continue;
    }

    const questionMatch = textLine.match(QUESTION_RE);
    if (questionMatch) {
      current = startQuestion(Number(questionMatch[1]), questionMatch[2], index + 1, pendingSectionNumber);
      if (activeGroup?.type === 'B1') pendingGroupQuestions.push(current);
      index += 1;
      if (activeGroup?.type !== 'B1') {
        const result = parseOptions(lines, index);
        current.options = result.options;
        index = result.index;
      }
      sectionPending = false;
      pendingSectionNumber = null;
      continue;
    }

    if (sectionPending && !isIgnoredLine(textLine)) {
      current = startQuestion(pendingSectionNumber, textLine, index + 1, pendingSectionNumber);
      index += 1;
      const result = parseOptions(lines, index);
      current.options = result.options;
      index = result.index;
      sectionPending = false;
      pendingSectionNumber = null;
      continue;
    }

    const answerMatch = textLine.match(ANSWER_RE);
    if (answerMatch) {
      const answerValue = parseAnswerMappings(answerMatch[1]);
      const explanationResult = readExplanation(lines, index);
      if (answerValue instanceof Map) {
        const drafts = activeGroup?.type === 'B1' ? pendingGroupQuestions : current ? [current] : [];
        const used = new Set();
        for (const draft of drafts) {
          const answer = answerValue.get(draft.sourceQuestionNumber);
          if (answer) {
            buildQuestion(draft, answer, explanationResult.explanation, index + 1);
            used.add(draft);
          }
        }
        for (const draft of drafts.filter(item => !used.has(item))) {
          buildQuestion(draft, null, explanationResult.explanation, index + 1);
        }
        pendingGroupQuestions = [];
        current = null;
        maybeCloseCompletedGroup();
      } else if (current) {
        buildQuestion(current, answerValue, explanationResult.explanation, index + 1);
        if (activeGroup?.type === 'B1') {
          pendingGroupQuestions = pendingGroupQuestions.filter(item => item !== current);
        }
        current = null;
        maybeCloseCompletedGroup();
      } else {
        addIssue('orphan-answer', '发现无法对应题目的答案行。', index + 1);
      }
      index = explanationResult.index;
      continue;
    }

    if (current && !Object.keys(current.options).length) {
      const option = textLine.match(OPTION_RE);
      if (option) {
        current.options[normalizeLetter(option[1])] = normalizeContent(option[2]);
        index += 1;
        continue;
      }
    }

    index += 1;
  }

  if (current) {
    buildQuestion(current, null, '', current.lineNumber);
  }
  for (const draft of pendingGroupQuestions) {
    if (draft !== current) buildQuestion(draft, null, '', draft.lineNumber);
  }
  validateAndCloseGroup();

  const groupRanges = new Map();
  for (const question of parsed) {
    if (!question.groupId) continue;
    if (!groupRanges.has(question.groupId)) groupRanges.set(question.groupId, []);
    groupRanges.get(question.groupId).push(question);
  }
  for (const members of groupRanges.values()) {
    const start = members[0].number;
    const end = members.at(-1).number;
    for (const question of members) {
      question.groupStart = start;
      question.groupEnd = end;
    }
  }

  const invalidCodes = new Set(['missing-stem', 'missing-options', 'missing-answer', 'answer-option-missing', 'missing-explanation']);
  const invalidOrdinals = new Set();
  for (const issue of issues.filter(item => invalidCodes.has(item.code))) {
    const match = issue.message.match(/第 (\d+) 道题/);
    if (match) invalidOrdinals.add(Number(match[1]));
  }
  const structurallyValid = parsed.filter(question => !invalidOrdinals.has(question.number));

  const blocks = [];
  const blockById = new Map();
  for (const question of structurallyValid) {
    const blockId = question.groupId || question.id;
    if (!blockById.has(blockId)) {
      const block = { id: blockId, questions: [] };
      blockById.set(blockId, block);
      blocks.push(block);
    }
    blockById.get(blockId).questions.push(question);
  }
  const seenBlocks = new Map();
  const duplicateBlocks = [];
  const questions = [];
  for (const block of blocks) {
    const fingerprint = JSON.stringify(block.questions.map(fullQuestionFingerprint).sort(compareText));
    const earlier = seenBlocks.get(fingerprint);
    if (earlier) {
      duplicateBlocks.push({
        keptIds: earlier.questions.map(question => question.id),
        excludedIds: block.questions.map(question => question.id),
      });
      continue;
    }
    seenBlocks.set(fingerprint, block);
    questions.push(...block.questions);
  }

  const fingerprints = new Map();
  for (const question of questions) {
    const fingerprint = fullQuestionFingerprint(question);
    if (!fingerprints.has(fingerprint)) fingerprints.set(fingerprint, []);
    fingerprints.get(fingerprint).push(question.id);
  }
  const duplicates = [...fingerprints.values()].filter(ids => ids.length > 1);

  return {
    subject: { id: subjectId, name: subjectName, count: questions.length },
    questions,
    parsedQuestionCount: parsed.length,
    invalidQuestionCount: parsed.length - structurallyValid.length,
    excludedDuplicateCount: duplicateBlocks.reduce((total, block) => total + block.excludedIds.length, 0),
    excludedDuplicateBlocks: duplicateBlocks,
    issues,
    duplicateGroups: duplicates,
  };
}

async function discoverTextFiles(sourceDirectory) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareText(left.name, right.name));
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(entryPath);
      else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.txt') files.push(entryPath);
    }
  }
  await visit(sourceDirectory);
  return files.sort(compareText);
}

function duplicateSummary(questions) {
  const fingerprints = new Map();
  for (const question of questions) {
    const fingerprint = fullQuestionFingerprint(question);
    if (!fingerprints.has(fingerprint)) fingerprints.set(fingerprint, []);
    fingerprints.get(fingerprint).push(question);
  }
  const groups = [...fingerprints.values()].filter(items => items.length > 1);
  return {
    groupCount: groups.length,
    extraQuestionCount: groups.reduce((total, items) => total + items.length - 1, 0),
    groups: groups.map(items => items.map(question => ({ id: question.id, subject: question.subject }))),
  };
}

function generatedModule(subjects, questions, version) {
  return `// 本文件由 scripts/import-subject-txt.mjs 生成。请勿手工修改。\n`
    + `export const SUBJECT_BANK_VERSION = ${JSON.stringify(version)};\n`
    + `export const SUBJECTS = ${JSON.stringify(subjects, null, 2)};\n`
    + `export const SUBJECT_QUESTIONS = ${JSON.stringify(questions, null, 2)};\n`;
}

export async function importSubjectDirectory(sourceDirectory, outputModule, outputReport) {
  const textFiles = await discoverTextFiles(sourceDirectory);
  const results = [];
  const failures = [];
  const decoder = new TextDecoder('utf-8', { fatal: true });

  for (const filePath of textFiles) {
    const subjectName = subjectNameFromFile(filePath);
    try {
      const buffer = await readFile(filePath);
      const text = decoder.decode(buffer);
      results.push(parseSubjectText(text, { subjectName, sourceLabel: subjectName }));
    } catch (error) {
      failures.push({ subject: subjectName, message: error.message });
    }
  }

  results.sort((left, right) => compareText(left.subject.name, right.subject.name));
  const duplicateNames = results
    .map(result => result.subject.name)
    .filter((name, index, names) => names.indexOf(name) !== index);
  if (duplicateNames.length) throw new Error(`科目名称重复：${[...new Set(duplicateNames)].join('、')}`);

  const subjects = results.map(result => result.subject);
  const questions = results.flatMap(result => result.questions);
  const duplicates = duplicateSummary(questions);
  const excludedDuplicateBlocks = results.flatMap(result => result.excludedDuplicateBlocks.map(block => ({
    subject: result.subject.name,
    ...block,
  })));
  const excludedDuplicateQuestions = results.reduce((total, result) => total + result.excludedDuplicateCount, 0);
  const sourceDigest = createHash('sha256');
  for (const result of results) {
    sourceDigest.update(result.subject.name);
    sourceDigest.update('\0');
    sourceDigest.update(JSON.stringify(result.questions));
    sourceDigest.update('\0');
  }
  const version = `subject-txt-${sourceDigest.digest('hex').slice(0, 16)}`;
  const issues = results.flatMap(result => result.issues);
  const report = {
    schemaVersion: 1,
    subjectBankVersion: version,
    discoveredTextFiles: textFiles.length,
    parsedFiles: results.length,
    failedFiles: failures.length,
    totalParsedQuestions: results.reduce((total, result) => total + result.parsedQuestionCount, 0),
    deployedQuestions: questions.length,
    missingAnswers: issues.filter(issue => issue.code === 'missing-answer').length,
    missingExplanations: issues.filter(issue => issue.code === 'missing-explanation').length,
    invalidQuestions: results.reduce((total, result) => total + result.invalidQuestionCount, 0),
    formatAnomalies: issues.filter(issue => !['missing-answer', 'missing-explanation'].includes(issue.code)).length,
    duplicateGroups: excludedDuplicateBlocks.length + duplicates.groupCount,
    duplicateQuestions: excludedDuplicateQuestions + duplicates.extraQuestionCount,
    subjects,
    failures,
    issues,
    duplicates: {
      excludedExactDuplicateBlocks: excludedDuplicateBlocks,
      remainingExactDuplicateGroups: duplicates.groups,
    },
  };

  await mkdir(path.dirname(outputModule), { recursive: true });
  await mkdir(path.dirname(outputReport), { recursive: true });
  await writeFile(outputModule, generatedModule(subjects, questions, version), 'utf8');
  await writeFile(outputReport, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

async function runCli() {
  const [sourceArgument, moduleArgument = 'js/questions-subjects.js', reportArgument = 'data/subject-bank-import-report.json'] = process.argv.slice(2);
  if (!sourceArgument) {
    throw new Error('用法：node scripts/import-subject-txt.mjs <TXT题库目录> [输出模块] [统计报告]');
  }
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sourceDirectory = path.resolve(sourceArgument);
  const outputModule = path.resolve(projectRoot, moduleArgument);
  const outputReport = path.resolve(projectRoot, reportArgument);
  for (const outputPath of [outputModule, outputReport]) {
    if (!outputPath.startsWith(`${projectRoot}${path.sep}`)) throw new Error(`拒绝写入项目目录之外：${outputPath}`);
  }
  const report = await importSubjectDirectory(sourceDirectory, outputModule, outputReport);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
