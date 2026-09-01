export const WRONG_BOOK_VERSION = 1;

export function createEmptyWrongBook() {
  return {
    version: WRONG_BOOK_VERSION,
    entries: {}
  };
}

export function normalizeWrongBook(value) {
  const normalized = createEmptyWrongBook();
  if (!value || value.version !== WRONG_BOOK_VERSION || !value.entries || Array.isArray(value.entries)) {
    return normalized;
  }

  for (const [questionId, entry] of Object.entries(value.entries)) {
    if (!entry || typeof entry !== 'object' || entry.questionId !== questionId) continue;
    normalized.entries[questionId] = {
      ...entry,
      questionId,
      sources: {
        review: Boolean(entry.sources?.review),
        exam: Boolean(entry.sources?.exam)
      },
      wrongCount: Math.max(1, Number(entry.wrongCount) || 1),
      correctInWrongBook: Boolean(entry.correctInWrongBook),
      correctAt: entry.correctInWrongBook ? entry.correctAt ?? null : null
    };
  }
  return normalized;
}

export function recordWrongBookEntry(wrongBook, questionId, source, {
  unanswered = false,
  at = new Date().toISOString()
} = {}) {
  if (!wrongBook?.entries || !questionId) throw new Error('错题本数据无效');
  if (source !== 'review' && source !== 'exam') throw new Error('错题来源无效');

  const previous = wrongBook.entries[questionId];
  const entry = {
    ...(previous ?? {}),
    questionId,
    sources: {
      review: Boolean(previous?.sources?.review || source === 'review'),
      exam: Boolean(previous?.sources?.exam || source === 'exam')
    },
    wrongCount: (Number(previous?.wrongCount) || 0) + 1,
    lastSource: source,
    lastUnanswered: Boolean(unanswered),
    correctInWrongBook: Boolean(previous?.correctInWrongBook),
    correctAt: previous?.correctInWrongBook ? previous.correctAt ?? null : null,
    createdAt: previous?.createdAt ?? at,
    updatedAt: at
  };
  wrongBook.entries[questionId] = entry;
  return entry;
}

export function markWrongBookEntryCorrect(wrongBook, questionId, at = new Date().toISOString()) {
  const entry = wrongBook?.entries?.[questionId];
  if (!entry) return null;
  entry.correctInWrongBook = true;
  entry.correctAt = at;
  entry.updatedAt = at;
  return entry;
}

export function removeWrongBookEntry(wrongBook, questionId) {
  if (!wrongBook?.entries?.[questionId]) return false;
  delete wrongBook.entries[questionId];
  return true;
}

export function needsWrongBookRemovalConfirmation(entry) {
  return Boolean(entry) && !entry.correctInWrongBook;
}

export function createShuffledWrongBookIds(questionIds, getQuestionById, random = Math.random) {
  const blocks = new Map();
  for (const questionId of [...new Set(questionIds)]) {
    const question = getQuestionById(questionId);
    if (!question) continue;
    const grouped = Boolean(question.groupId) && (question.type === 'A3' || question.type === 'B1');
    const key = grouped ? `${question.type}:${question.groupId}` : `question:${question.id}`;
    if (!blocks.has(key)) blocks.set(key, []);
    blocks.get(key).push(question);
  }

  const shuffledBlocks = [...blocks.values()].map(questions => questions.sort((left, right) => {
    const numberDifference = (Number(left.number) || 0) - (Number(right.number) || 0);
    return numberDifference || String(left.id).localeCompare(String(right.id), 'zh-CN');
  }));

  for (let index = shuffledBlocks.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffledBlocks[index], shuffledBlocks[target]] = [shuffledBlocks[target], shuffledBlocks[index]];
  }
  return shuffledBlocks.flatMap(questions => questions.map(question => question.id));
}
