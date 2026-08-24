import { QUESTIONS_2024, QUESTION_BANK_SOURCE as QUESTION_BANK_2024_SOURCE } from './questions-2024.js';
import {
  QUESTIONS_2023,
  QUESTION_BANK_2023_SOURCES,
  QUESTION_BANK_2023_STATS
} from './questions-2023.js';
import {
  QUESTIONS_2018_2022,
  QUESTION_BANK_2018_2022_SOURCES,
  QUESTION_BANK_2018_2022_STATS
} from './questions-2018-2022.js';

export const QUESTION_BANK_VERSION = '2018-2024-pdf-docx-dedup-grouped-v4';
export const QUESTION_BANK_SOURCES = [
  QUESTION_BANK_2024_SOURCE,
  ...QUESTION_BANK_2023_SOURCES,
  ...QUESTION_BANK_2018_2022_SOURCES
];
export const QUESTION_BANK_STATS = {
  questions2024: QUESTIONS_2024.length,
  questions2023Added: QUESTIONS_2023.length,
  questions2023RemovedAsDuplicates: QUESTION_BANK_2023_STATS.removedDuplicateCount,
  questions2018To2022Added: QUESTIONS_2018_2022.length,
  questions2018To2022RemovedAsDuplicates: QUESTION_BANK_2018_2022_STATS.removedDuplicateCount,
  questions2018To2022RemovedAsGroupCompanions: QUESTION_BANK_2018_2022_STATS.removedGroupCompanionCount,
  questions2018To2022ExcludedAsIncomplete:
    QUESTION_BANK_2018_2022_STATS.sourceQuestionCount
    - QUESTION_BANK_2018_2022_STATS.builtBeforeDedup
};
export const QUESTIONS = [...QUESTIONS_2024, ...QUESTIONS_2023, ...QUESTIONS_2018_2022];

const UNIT_NAMES = ['一', '二', '三', '四'];
export const PAPER_FORMAT_VERSION = 'grouped-types-v1';
export const EXAM_BLUEPRINT_VERSION = '2023-source-paper-v2';
export const QUESTION_TYPE_ORDER = ['A1/A2', 'A3', 'B1'];
export const QUESTION_TYPE_LABELS = {
  'A1/A2': 'A1/A2型题',
  A3: 'A3型题',
  B1: 'B1型题'
};
export const EXAM_UNIT_BLUEPRINTS = [
  { unit: 1, sections: [{ type: 'A1/A2', count: 110 }, { type: 'B1', count: 40 }] },
  { unit: 2, sections: [{ type: 'A1/A2', count: 95 }, { type: 'A3', count: 17 }, { type: 'B1', count: 38 }] },
  { unit: 3, sections: [{ type: 'A1/A2', count: 87 }, { type: 'A3', count: 33 }, { type: 'B1', count: 30 }] },
  { unit: 4, sections: [{ type: 'A1/A2', count: 80 }, { type: 'A3', count: 36 }, { type: 'B1', count: 34 }] }
];

export const EXAM_UNITS = UNIT_NAMES.map((name, index) => ({
  unit: index + 1,
  name: `第${name}单元`,
  count: 150
}));

const QUESTION_BY_ID = new Map(QUESTIONS.map(question => [question.id, question]));

export function getQuestionById(id) {
  return QUESTION_BY_ID.get(id) || null;
}

export function getQuestionsForUnit(unit) {
  return QUESTIONS.filter(question => question.unit === unit);
}

function shuffled(values, random) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

export function createQuestionBlocks(questions) {
  const blocks = new Map();
  for (const question of questions) {
    const key = question.groupId || question.id;
    if (!blocks.has(key)) blocks.set(key, { id: key, type: question.type, questions: [] });
    blocks.get(key).questions.push(question);
  }
  return [...blocks.values()];
}

function chooseWholeBlocks(blocks, targetCount, random) {
  const candidates = shuffled(blocks, random);
  const paths = Array(targetCount + 1).fill(null);
  paths[0] = [];
  for (const block of candidates) {
    const size = block.questions.length;
    for (let count = targetCount - size; count >= 0; count -= 1) {
      if (paths[count] && !paths[count + size]) paths[count + size] = [...paths[count], block];
    }
  }
  if (!paths[targetCount]) throw new Error(`无法在不拆分题组的情况下组成 ${targetCount} 题`);
  return shuffled(paths[targetCount], random);
}

export function createExamPaper(unit, random = Math.random) {
  const blueprint = EXAM_UNIT_BLUEPRINTS.find(item => item.unit === unit);
  if (!blueprint) throw new RangeError(`不存在第 ${unit} 单元`);

  return blueprint.sections.flatMap(section => {
    const pool = QUESTIONS.filter(question => question.unit === unit && question.type === section.type);
    if (pool.length < section.count) {
      throw new Error(`第 ${unit} 单元 ${section.type} 型题不足 ${section.count} 道`);
    }
    const blocks = createQuestionBlocks(pool);
    return chooseWholeBlocks(blocks, section.count, random).flatMap(block => block.questions);
  });
}

export function createReviewPaper(count, random = Math.random) {
  const safeCount = Math.max(1, Math.min(QUESTIONS.length, Number(count) || 10));
  const selected = chooseWholeBlocks(createQuestionBlocks(QUESTIONS), safeCount, random);
  const typeIndex = new Map(QUESTION_TYPE_ORDER.map((type, index) => [type, index]));
  selected.sort((left, right) => typeIndex.get(left.type) - typeIndex.get(right.type));
  return selected.flatMap(block => block.questions);
}

export function createQuestionPages(questions, pageSize = 10) {
  const pages = [];
  let current = null;
  for (const block of createQuestionBlocks(questions)) {
    const needsNewPage = !current
      || current.type !== block.type
      || current.questions.length + block.questions.length > pageSize;
    if (needsNewPage) {
      current = { type: block.type, questions: [] };
      pages.push(current);
    }
    current.questions.push(...block.questions);
  }
  return pages;
}
