import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyWrongBook,
  createShuffledWrongBookIds,
  markWrongBookEntryCorrect,
  needsWrongBookRemovalConfirmation,
  normalizeWrongBook,
  recordWrongBookEntry,
  removeWrongBookEntry,
  WRONG_BOOK_VERSION
} from '../js/wrong-book.js';

test('新错题本使用独立版本化数据，不迁移旧 wrongs 字段', () => {
  assert.deepEqual(normalizeWrongBook(undefined), {
    version: WRONG_BOOK_VERSION,
    entries: {}
  });
  assert.deepEqual(normalizeWrongBook({ version: 99, entries: { legacy: { questionId: 'legacy' } } }), {
    version: WRONG_BOOK_VERSION,
    entries: {}
  });
});

test('复习和考试错题按题目 ID 去重，并保留来源与未作答状态', () => {
  const wrongBook = createEmptyWrongBook();
  recordWrongBookEntry(wrongBook, 'Q-1', 'review', { at: '2026-08-31T01:00:00.000Z' });
  recordWrongBookEntry(wrongBook, 'Q-1', 'exam', {
    unanswered: true,
    at: '2026-08-31T02:00:00.000Z'
  });

  assert.deepEqual(Object.keys(wrongBook.entries), ['Q-1']);
  assert.deepEqual(wrongBook.entries['Q-1'].sources, { review: true, exam: true });
  assert.equal(wrongBook.entries['Q-1'].wrongCount, 2);
  assert.equal(wrongBook.entries['Q-1'].lastUnanswered, true);
  assert.equal(needsWrongBookRemovalConfirmation(wrongBook.entries['Q-1']), true);
});

test('错题本答对后可直接移出，移出后再次加入会重新要求确认', () => {
  const wrongBook = createEmptyWrongBook();
  recordWrongBookEntry(wrongBook, 'Q-2', 'review', { at: '2026-08-31T01:00:00.000Z' });
  markWrongBookEntryCorrect(wrongBook, 'Q-2', '2026-08-31T02:00:00.000Z');
  assert.equal(needsWrongBookRemovalConfirmation(wrongBook.entries['Q-2']), false);

  assert.equal(removeWrongBookEntry(wrongBook, 'Q-2'), true);
  recordWrongBookEntry(wrongBook, 'Q-2', 'exam', { at: '2026-08-31T03:00:00.000Z' });
  assert.equal(wrongBook.entries['Q-2'].correctInWrongBook, false);
  assert.equal(needsWrongBookRemovalConfirmation(wrongBook.entries['Q-2']), true);
});

test('错题顺序按题组块打乱，A3 和 B1 的错题成员保持相邻与原题号顺序', () => {
  const questions = new Map([
    ['A-2', { id: 'A-2', type: 'A3', groupId: 'A', number: 2 }],
    ['S-1', { id: 'S-1', type: 'A1/A2', number: 1 }],
    ['A-1', { id: 'A-1', type: 'A3', groupId: 'A', number: 1 }],
    ['B-2', { id: 'B-2', type: 'B1', groupId: 'B', number: 2 }],
    ['B-1', { id: 'B-1', type: 'B1', groupId: 'B', number: 1 }]
  ]);
  const shuffled = createShuffledWrongBookIds(
    ['A-2', 'S-1', 'A-1', 'B-2', 'B-1', 'missing', 'S-1'],
    questionId => questions.get(questionId),
    () => 0
  );

  assert.deepEqual(new Set(shuffled), new Set(['A-1', 'A-2', 'B-1', 'B-2', 'S-1']));
  assert.equal(Math.abs(shuffled.indexOf('A-1') - shuffled.indexOf('A-2')), 1);
  assert.equal(Math.abs(shuffled.indexOf('B-1') - shuffled.indexOf('B-2')), 1);
  assert.ok(shuffled.indexOf('A-1') < shuffled.indexOf('A-2'));
  assert.ok(shuffled.indexOf('B-1') < shuffled.indexOf('B-2'));
});
