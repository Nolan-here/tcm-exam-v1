import {
  QUESTIONS,
  SUBJECTS,
  SUBJECT_BANK_VERSION,
  EXAM_UNITS,
  EXAM_BLUEPRINT_VERSION,
  PAPER_FORMAT_VERSION,
  QUESTION_TYPE_LABELS,
  QUESTION_BANK_VERSION,
  createExamPaper,
  createReviewPaper,
  createSubjectReviewPaper,
  createQuestionBlocks,
  createQuestionPages,
  getQuestionById,
  getSubjectById,
  isSubjectBankVersionCompatible,
} from './questions-bank.js';
import { loadState, saveState, createSession } from './db.js';
import { setupSubjectPanelFocus } from './subject-panel-focus.js';
import {
  createShuffledWrongBookIds,
  markWrongBookEntryCorrect,
  needsWrongBookRemovalConfirmation,
  recordWrongBookEntry,
  removeWrongBookEntry,
  WRONG_BOOK_VERSION
} from './wrong-book.js';

const main = document.querySelector('#main-content');
const live = document.querySelector('#live-status');
const appTitle = document.querySelector('#app-title');
const reviewDialog = document.querySelector('#review-count-dialog');
const reviewCountHeading = document.querySelector('#review-count-heading');
const customCountForm = document.querySelector('#custom-count-form');
const customCountLabel = document.querySelector('#custom-count-label');
const customCountInput = document.querySelector('#custom-count');
const removeWrongDialog = document.querySelector('#remove-wrong-dialog');
const PAGE_SIZE = 10;

let state = await loadState();
let view = 'home';
let viewRevision = 0;
let announcementFrame = null;
let selectedSubjectId = null;
let homeReviewOpen = false;
let homeSubjectsOpen = false;
let lastHomeFocus = '[data-review-summary]';
let wrongBookSession = null;
let pendingWrongRemovalId = null;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
})[character]);

function clearAnnouncement() {
  if (announcementFrame !== null) cancelAnimationFrame(announcementFrame);
  announcementFrame = null;
  live.textContent = '';
}

function announce(message) {
  clearAnnouncement();
  const revision = viewRevision;
  announcementFrame = requestAnimationFrame(() => {
    announcementFrame = null;
    if (revision === viewRevision) live.textContent = message;
  });
}

function focusElement(selector) {
  const revision = viewRevision;
  requestAnimationFrame(() => {
    if (revision === viewRevision) document.querySelector(selector)?.focus();
  });
}

function focusPageHeading() {
  focusElement('.page-heading');
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function setView(nextView) {
  viewRevision += 1;
  clearAnnouncement();
  view = nextView;
  render();
  scrollToTop();
  if (view === 'home') focusElement(lastHomeFocus);
  else focusPageHeading();
}

function pageHeading(text) {
  return `<h2 class="page-heading" tabindex="-1">${esc(text)}</h2>`;
}

function renderHome() {
  clearAnnouncement();
  main.innerHTML = `<section class="home-actions" aria-label="选择答题模式">
    <details class="home-mode-panel" data-review-panel${homeReviewOpen ? ' open' : ''}>
      <summary class="mode-summary" data-review-summary>复习模式</summary>
      <div class="home-mode-content">
        <button class="mode-button" type="button" data-open-review>随机出题</button>
        <details class="subject-panel" data-subject-panel${homeSubjectsOpen ? ' open' : ''}>
          <summary class="category-summary" data-subject-summary>按科目</summary>
          <section class="subject-list-region" data-subject-list tabindex="-1" aria-label="选择科目">
            <ul class="subject-buttons">
              ${SUBJECTS.map(subject => `<li><button class="subject-button" type="button" data-subject-id="${subject.id}">${esc(subject.name)}</button></li>`).join('')}
            </ul>
          </section>
        </details>
      </div>
    </details>
    <button class="mode-button" type="button" data-open-exam>考试模式</button>
    <button class="mode-button" type="button" data-open-wrong-book>错题本</button>
  </section>`;
}

function currentReview() {
  const session = state.currentSessionId ? state.sessions[state.currentSessionId] : null;
  if (!session || session.mode !== 'review-2024' || session.config?.bankVersion !== QUESTION_BANK_VERSION) return null;
  if (session.config?.paperFormatVersion !== PAPER_FORMAT_VERSION) return null;
  if (session.config?.source === 'subject') {
    const subject = getSubjectById(session.config.subjectId);
    if (!subject || !isSubjectBankVersionCompatible(session.config.subjectBankVersion)) return null;
    if (!session.questionIds.every(questionId => getQuestionById(questionId)?.subjectId === subject.id)) return null;
  }
  if (!session.questionIds.every(questionId => getQuestionById(questionId))) return null;
  return session;
}

function currentExam() {
  const exam = state.currentExamId ? state.exams[state.currentExamId] : null;
  if (!exam || exam.mode !== 'exam-2024' || exam.config?.bankVersion !== QUESTION_BANK_VERSION) return null;
  if (exam.config?.blueprintVersion !== EXAM_BLUEPRINT_VERSION) return null;
  if (exam.config?.paperFormatVersion !== PAPER_FORMAT_VERSION) return null;
  if (!exam.questionIds.every(questionId => getQuestionById(questionId))) return null;
  return exam;
}

function currentWrongBook() {
  if (!wrongBookSession || wrongBookSession.mode !== 'wrong-book-v1') return null;
  if (wrongBookSession.config?.bankVersion !== QUESTION_BANK_VERSION) return null;
  if (wrongBookSession.config?.paperFormatVersion !== PAPER_FORMAT_VERSION) return null;
  wrongBookSession.questionIds = wrongBookSession.questionIds.filter(questionId => (
    state.wrongBook.entries[questionId] && getQuestionById(questionId)
  ));
  return wrongBookSession;
}

function hasImmediateFeedback(mode) {
  return mode === 'review' || mode === 'wrong-book';
}

function questionOptions(question, answer, mode, compact = false) {
  return Object.entries(question.options).map(([letter, text]) => {
    const selected = answer?.current === letter;
    const immediateFeedback = hasImmediateFeedback(mode);
    const legacyResult = immediateFeedback && selected && answer?.attempts
      ? answer.resolved ? 'correct' : 'wrong'
      : null;
    const revealedResult = answer?.resolved ? (letter === question.answer ? 'correct' : 'wrong') : null;
    const result = immediateFeedback ? revealedResult ?? answer?.optionResults?.[letter] ?? legacyResult : null;
    const resultClass = result ? ` selected-${result}` : '';
    const resultText = result === 'correct' ? '。正确' : result === 'wrong' ? '。错误' : '';
    const accessibleName = `${letter}. ${text}${resultText}`;
    const visibleName = compact ? `${letter}${resultText}` : accessibleName;
    const disabled = immediateFeedback && answer?.resolved ? ' disabled' : '';
    return `<label class="choice${resultClass}">
      <input type="radio" name="answer-${question.id}" value="${letter}" data-answer data-mode="${mode}" aria-label="${esc(accessibleName)}"${selected ? ' checked' : ''}${disabled}>
      <span aria-hidden="true">${esc(visibleName)}</span>
    </label>`;
  }).join('');
}

function wrongBookAbout(question, answer) {
  const removeButton = `<button class="wrong-book-remove" type="button" data-remove-wrong="${esc(question.id)}">移出错题本</button>`;
  const firstTryCorrect = answer?.firstCorrect === true;
  return `<details class="explanation wrong-book-about"${answer?.firstCorrect === false ? ' open' : ''}>
    <summary>关于本题</summary>
    ${firstTryCorrect ? removeButton : ''}
    <section class="wrong-book-explanation" aria-label="本题答案及解析">
      <p><strong>正确答案：${question.answer}. ${esc(question.options[question.answer])}</strong></p>
      <p>${esc(question.explanation)}</p>
    </section>
    ${firstTryCorrect ? '' : removeButton}
  </details>`;
}

function questionCard(question, sequence, answer, mode, compactOptions = false, showIndividualExplanation = true) {
  const explanation = mode === 'wrong-book'
    ? wrongBookAbout(question, answer)
    : mode === 'review' && showIndividualExplanation
      ? `<details class="explanation"${answer?.firstCorrect === false ? ' open' : ''}>
        <summary>本题讲解</summary>
        <p><strong>正确答案：${question.answer}. ${esc(question.options[question.answer])}</strong></p>
        <p>${esc(question.explanation)}</p>
      </details>`
      : '';
  const prompt = question.prompt || question.stem;
  return `<article class="card question-card" data-question-id="${question.id}" data-compact-options="${compactOptions}">
    <h3 id="heading-${question.id}" tabindex="-1">${sequence}. ${esc(prompt)}（ ）</h3>
    <fieldset aria-labelledby="heading-${question.id}">
      <div class="choice-list">${questionOptions(question, answer, mode, compactOptions)}</div>
    </fieldset>
    ${explanation}
  </article>`;
}

function questionSequence(session, question) {
  return session.questionIds.indexOf(question.id) + 1;
}

function questionRange(block, session) {
  const first = questionSequence(session, block.questions[0]);
  const last = questionSequence(session, block.questions.at(-1));
  return first === last ? `第 ${first} 题` : `第 ${first} 至 ${last} 题`;
}

function hasProvidedExplanation(question) {
  const explanation = String(question.explanation ?? '').trim();
  return Boolean(explanation) && explanation !== '原文件未提供解析。';
}

function b1GroupExplanationBody(block, session) {
  const answerLines = block.questions.map(question => {
    const sequence = questionSequence(session, question);
    return `<p><strong>第 ${sequence} 题正确答案：${question.answer}. ${esc(question.options[question.answer])}</strong></p>`;
  }).join('');
  const provided = block.questions.filter(hasProvidedExplanation);
  const uniqueExplanations = [...new Set(provided.map(question => String(question.explanation).trim()))];
  let explanationContent;

  if (!provided.length) {
    explanationContent = '<p>原文件未提供本组解析。</p>';
  } else if (provided.length < block.questions.length || uniqueExplanations.length === 1) {
    const label = provided.length < block.questions.length ? '原文件合并解析' : '共用解析';
    explanationContent = `<h4>${questionRange(block, session)}${label}</h4>${uniqueExplanations.map(text => `<p>${esc(text)}</p>`).join('')}`;
  } else {
    explanationContent = provided.map(question => {
      const sequence = questionSequence(session, question);
      return `<section aria-labelledby="explanation-${question.id}">
        <h4 id="explanation-${question.id}">第 ${sequence} 题解析</h4>
        <p>${esc(question.explanation)}</p>
      </section>`;
    }).join('');
  }

  return `${answerLines}${explanationContent}`;
}

function b1ReviewExplanation(block, session) {
  const open = block.questions.some(question => session.answers[question.id]?.firstCorrect === false);
  return `<details class="explanation group-explanation"${open ? ' open' : ''}>
    <summary>本组讲解</summary>
    ${b1GroupExplanationBody(block, session)}
  </details>`;
}

function groupContext(block, session) {
  if (!block.questions[0]?.groupId) return '';
  const range = questionRange(block, session);
  if (block.type === 'A3') {
    return `<section class="card group-context" aria-labelledby="group-${block.id}">
      <h3 id="group-${block.id}" tabindex="-1">${range}共用题干</h3>
      <p>${esc(block.questions[0].sharedStem)}</p>
    </section>`;
  }
  if (block.type === 'B1') {
    const options = block.questions[0].sharedOptions || block.questions[0].options;
    return `<section class="card group-context" aria-labelledby="group-${block.id}">
      <h3 id="group-${block.id}" tabindex="-1">${range}共用备选答案</h3>
      <div class="common-options">${Object.entries(options).map(([letter, text]) => `<p>${letter}. ${esc(text)}</p>`).join('')}</div>
    </section>`;
  }
  return '';
}

function renderQuestionPage(questions, session, mode) {
  return createQuestionBlocks(questions).map(block => {
    const isB1Group = block.type === 'B1' && Boolean(block.questions[0]?.groupId);
    const compactOptions = isB1Group;
    return `<section class="question-group" data-question-group="${esc(block.id)}">
      ${groupContext(block, session)}
      ${block.questions.map(question => {
        const sequence = session.questionIds.indexOf(question.id) + 1;
        return questionCard(question, sequence, session.answers[question.id], mode, compactOptions, !isB1Group);
      }).join('')}
      ${mode === 'review' && isB1Group ? b1ReviewExplanation(block, session) : ''}
    </section>`;
  }).join('');
}

function pagination(session, mode, pages) {
  const pageCount = pages.length;
  const progress = mode === 'exam'
    ? `本题型第 ${session.page} 页，共 ${pageCount} 页`
    : `第 ${session.page} 页，共 ${pageCount} 页`;
  return `<nav class="pagination" aria-label="答题分页">
    <button type="button" data-go-page="1" data-mode="${mode}"${session.page === 1 ? ' disabled' : ''}>跳到页首</button>
    <button type="button" data-go-page="${session.page - 1}" data-mode="${mode}"${session.page === 1 ? ' disabled' : ''}>上一页</button>
    <p aria-live="polite">${progress}</p>
    <button type="button" data-go-page="${session.page + 1}" data-mode="${mode}"${session.page === pageCount ? ' disabled' : ''}>下一页</button>
    <button type="button" data-go-page="${pageCount}" data-mode="${mode}"${session.page === pageCount ? ' disabled' : ''}>跳到页尾</button>
    <form class="page-jump" data-page-jump data-mode="${mode}">
      <label for="page-number-${mode}">输入页数，1 到 ${pageCount}</label>
      <input id="page-number-${mode}" name="page" type="number" min="1" max="${pageCount}" value="${session.page}" required>
      <button type="submit">跳转</button>
    </form>
  </nav>`;
}

function openReviewCountDialog(subjectId = null) {
  const subject = subjectId ? getSubjectById(subjectId) : null;
  selectedSubjectId = subject?.id ?? null;
  const maximum = subject?.count ?? QUESTIONS.length;
  reviewCountHeading.textContent = subject ? `选择${subject.name}题量` : '选择随机出题题量';
  customCountLabel.textContent = `自定义题量，1 到 ${maximum} 题`;
  customCountInput.max = String(maximum);
  customCountInput.value = String(Math.min(10, maximum));
  customCountForm.hidden = true;
  reviewDialog.showModal();
  focusElement('#review-count-heading');
}

async function startReview(count) {
  const revision = viewRevision;
  const subject = selectedSubjectId ? getSubjectById(selectedSubjectId) : null;
  const maximum = subject?.count ?? QUESTIONS.length;
  const requestedCount = Math.max(1, Math.min(maximum, Number(count) || 10));
  const questions = subject
    ? createSubjectReviewPaper(subject.id, requestedCount)
    : createReviewPaper(requestedCount);
  const actualCount = questions.length;
  const questionIds = questions.map(question => question.id);
  const session = createSession(questionIds, {
    count: actualCount,
    requestedCount,
    source: subject ? 'subject' : 'random',
    subjectId: subject?.id ?? null,
    subjectName: subject?.name ?? null,
    subjectBankVersion: subject ? SUBJECT_BANK_VERSION : null,
    bankVersion: QUESTION_BANK_VERSION,
    paperFormatVersion: PAPER_FORMAT_VERSION
  }, 'review-2024');
  state.sessions[session.id] = session;
  state.currentSessionId = session.id;
  await saveState(state);
  if (revision !== viewRevision || !reviewDialog.open) return;
  reviewDialog.close();
  setView('review');
  announce(`${subject ? `${subject.name}复习` : '随机出题'}已开始，共 ${actualCount} 题。`);
}

function renderReview() {
  const session = currentReview();
  if (!session) {
    renderHome();
    return;
  }
  const questions = session.questionIds.map(getQuestionById);
  const pages = createQuestionPages(questions, PAGE_SIZE);
  session.page = Math.max(1, Math.min(pages.length, session.page));
  const currentPage = pages[session.page - 1];
  const typeLabel = QUESTION_TYPE_LABELS[currentPage.type] || currentPage.type;
  const firstSequence = session.questionIds.indexOf(currentPage.questions[0].id) + 1;
  const lastSequence = session.questionIds.indexOf(currentPage.questions.at(-1).id) + 1;
  const subject = session.config.source === 'subject' ? getSubjectById(session.config.subjectId) : null;
  const reviewLabel = subject ? `复习模式：${subject.name}` : '复习模式：随机出题';
  main.innerHTML = `${pageHeading(reviewLabel)}
    <button class="back-button" type="button" data-home>返回首页</button>
    <section class="type-progress" aria-label="${esc(reviewLabel)}当前进度">
      <h3>${esc(typeLabel)}</h3>
      <p>当前显示第 ${firstSequence} 至 ${lastSequence} 题，共 ${session.questionIds.length} 题。</p>
    </section>
    <section aria-label="复习题目，${esc(typeLabel)}">
      ${renderQuestionPage(currentPage.questions, session, 'review')}
    </section>
    ${pagination(session, 'review', pages)}`;
}

function startWrongBook() {
  const questionIds = createShuffledWrongBookIds(
    Object.keys(state.wrongBook.entries),
    getQuestionById
  );
  wrongBookSession = createSession(questionIds, {
    wrongBookVersion: WRONG_BOOK_VERSION,
    bankVersion: QUESTION_BANK_VERSION,
    paperFormatVersion: PAPER_FORMAT_VERSION
  }, 'wrong-book-v1');
  setView('wrong-book');
  announce(questionIds.length ? `已进入错题本，共 ${questionIds.length} 题。` : '错题本目前没有题目。');
}

function renderWrongBook() {
  const session = currentWrongBook();
  if (!session) {
    wrongBookSession = null;
    renderHome();
    return;
  }
  if (!session.questionIds.length) {
    main.innerHTML = `${pageHeading('错题本')}
      <button class="back-button" type="button" data-home>返回首页</button>
      <p class="notice">目前没有错题。复习模式中选错的题，以及考试交卷后的答错题和未作答题，会加入这里。</p>`;
    return;
  }

  const questions = session.questionIds.map(getQuestionById);
  const pages = createQuestionPages(questions, PAGE_SIZE);
  session.page = Math.max(1, Math.min(pages.length, session.page));
  const currentPage = pages[session.page - 1];
  const typeLabel = QUESTION_TYPE_LABELS[currentPage.type] || currentPage.type;
  const firstSequence = session.questionIds.indexOf(currentPage.questions[0].id) + 1;
  const lastSequence = session.questionIds.indexOf(currentPage.questions.at(-1).id) + 1;
  main.innerHTML = `${pageHeading('错题本')}
    <button class="back-button" type="button" data-home>返回首页</button>
    <section class="type-progress" aria-label="错题本当前进度">
      <h3>${esc(typeLabel)}</h3>
      <p>当前显示第 ${firstSequence} 至 ${lastSequence} 题，共 ${session.questionIds.length} 题。</p>
    </section>
    <section aria-label="错题本题目，${esc(typeLabel)}">
      ${renderQuestionPage(currentPage.questions, session, 'wrong-book')}
    </section>
    ${pagination(session, 'wrong-book', pages)}`;
}

function renderExamUnits() {
  const resumable = currentExam();
  const resumeButton = resumable && !resumable.submitted
    ? `<button class="mode-button" type="button" data-resume-exam>继续第 ${resumable.config.unit} 单元，${esc(QUESTION_TYPE_LABELS[currentExamType(resumable)] || currentExamType(resumable))}</button>`
    : '';
  main.innerHTML = `${pageHeading('考试模式')}
    <div class="unit-buttons" aria-label="选择考试单元">
      ${resumeButton}
      ${EXAM_UNITS.map(item => `<button class="mode-button" type="button" data-exam-unit="${item.unit}">${esc(item.name)}，${item.count} 题</button>`).join('')}
    </div>
    <button class="back-button" type="button" data-home>返回首页</button>`;
}

async function startExam(unit) {
  const revision = viewRevision;
  const questions = createExamPaper(unit);
  const types = [...new Set(questions.map(question => question.type))];
  const exam = createSession(questions.map(question => question.id), {
    unit,
    count: questions.length,
    bankVersion: QUESTION_BANK_VERSION,
    blueprintVersion: EXAM_BLUEPRINT_VERSION,
    paperFormatVersion: PAPER_FORMAT_VERSION,
    types
  }, 'exam-2024');
  exam.submitted = false;
  exam.currentTypeIndex = 0;
  exam.lockedTypes = [];
  state.exams[exam.id] = exam;
  state.currentExamId = exam.id;
  await saveState(state);
  if (revision !== viewRevision) return;
  setView('exam');
  announce(`第 ${unit} 单元考试已开始，共 ${questions.length} 题。`);
}

function currentExamType(exam) {
  return exam.config.types[exam.currentTypeIndex];
}

function currentExamPages(exam) {
  const type = currentExamType(exam);
  const questions = exam.questionIds.map(getQuestionById).filter(question => question.type === type);
  return createQuestionPages(questions, PAGE_SIZE);
}

function renderExam() {
  const exam = currentExam();
  if (!exam) {
    renderExamUnits();
    return;
  }
  if (exam.submitted) {
    renderExamResult();
    return;
  }
  const type = currentExamType(exam);
  const typeLabel = QUESTION_TYPE_LABELS[type] || type;
  const pages = currentExamPages(exam);
  exam.page = Math.max(1, Math.min(pages.length, exam.page));
  const currentPage = pages[exam.page - 1];
  const firstSequence = exam.questionIds.indexOf(currentPage.questions[0].id) + 1;
  const lastSequence = exam.questionIds.indexOf(currentPage.questions.at(-1).id) + 1;
  const finalType = exam.currentTypeIndex === exam.config.types.length - 1;
  main.innerHTML = `${pageHeading(`考试模式，第 ${exam.config.unit} 单元，${typeLabel}`)}
    <button class="back-button" type="button" data-exam-units>返回单元选择</button>
    <section class="type-progress" aria-label="当前考试进度">
      <p>当前显示总题号第 ${firstSequence} 至 ${lastSequence} 题，共 150 题。</p>
    </section>
    <section aria-label="考试题目，${esc(typeLabel)}">
      ${renderQuestionPage(currentPage.questions, exam, 'exam')}
    </section>
    ${pagination(exam, 'exam', pages)}
    <div class="submit-area">
      ${exam.page === pages.length
        ? `<button class="primary" type="button" data-complete-exam-type>${finalType ? '完成本单元并准备交卷' : '完成本题型并进入确认'}</button>`
        : ''}
    </div>`;
}

function renderExamTransition() {
  const exam = currentExam();
  if (!exam || exam.submitted) {
    renderExamUnits();
    return;
  }
  const type = currentExamType(exam);
  const typeLabel = QUESTION_TYPE_LABELS[type] || type;
  const typeIds = exam.questionIds.filter(questionId => getQuestionById(questionId).type === type);
  const unansweredInType = typeIds.filter(questionId => !exam.answers[questionId]?.current).length;
  const totalUnanswered = exam.questionIds.filter(questionId => !exam.answers[questionId]?.current).length;
  const nextType = exam.config.types[exam.currentTypeIndex + 1];
  const nextTypeLabel = nextType ? QUESTION_TYPE_LABELS[nextType] || nextType : '';
  const heading = nextType ? `确认进入${nextTypeLabel}` : '确认提交本单元考试';
  const warning = nextType
    ? `进入${nextTypeLabel}后，将不能返回或修改${typeLabel}的答案。`
    : `提交后将公布成绩，并且不能继续修改答案。全卷目前还有 ${totalUnanswered} 题未作答。`;
  main.innerHTML = `${pageHeading(heading)}
    <section class="card transition-confirmation" aria-labelledby="transition-summary">
      <h3 id="transition-summary">${esc(typeLabel)}答题情况</h3>
      <p>本题型共 ${typeIds.length} 题，未作答 ${unansweredInType} 题。</p>
      <p><strong>${esc(warning)}</strong></p>
    </section>
    <div class="actions">
      <button type="button" data-return-current-type>返回检查本题型</button>
      <button class="primary" type="button" data-confirm-type-transition>${nextType ? `确认并进入${esc(nextTypeLabel)}` : '确认交卷'}</button>
    </div>`;
}

function wrongQuestionCard(question, sequence, answer, { showOptions = true, showExplanation = true } = {}) {
  const prompt = question.prompt || question.stem;
  return `<article class="card question-card wrong-question">
    <h3>${sequence}. ${esc(prompt)}（ ）</h3>
    ${showOptions ? `<div class="result-options">
      ${Object.entries(question.options).map(([letter, text]) => `<p>${letter}. ${esc(text)}</p>`).join('')}
    </div>` : ''}
    <p><strong>你的答案：${answer?.current ? `${answer.current}. ${esc(question.options[answer.current])}` : '未作答'}</strong></p>
    <p><strong>正确答案：${question.answer}. ${esc(question.options[question.answer])}</strong></p>
    ${showExplanation ? `<h4>本题解析</h4><p>${esc(question.explanation)}</p>` : ''}
  </article>`;
}

function renderWrongResults(exam, wrongIds) {
  const wrongSet = new Set(wrongIds);
  const handledGroups = new Set();
  return wrongIds.map(questionId => {
    const question = getQuestionById(questionId);
    if (!['A3', 'B1'].includes(question.type) || !question.groupId) {
      const sequence = questionSequence(exam, question);
      return wrongQuestionCard(question, sequence, exam.answers[question.id]);
    }
    if (handledGroups.has(question.groupId)) return '';
    handledGroups.add(question.groupId);
    const groupQuestions = exam.questionIds
      .map(getQuestionById)
      .filter(item => item.groupId === question.groupId);
    const block = { id: question.groupId, type: question.type, questions: groupQuestions };
    if (block.type === 'A3') {
      return `<section class="question-group" data-question-group="${esc(block.id)}">
        ${groupContext(block, exam)}
        ${groupQuestions.filter(item => wrongSet.has(item.id)).map(item => (
          wrongQuestionCard(item, questionSequence(exam, item), exam.answers[item.id])
        )).join('')}
      </section>`;
    }
    return `<section class="question-group wrong-question-group" data-question-group="${esc(block.id)}">
      ${groupContext(block, exam)}
      ${groupQuestions.filter(item => wrongSet.has(item.id)).map(item => (
        wrongQuestionCard(item, questionSequence(exam, item), exam.answers[item.id], {
          showOptions: false,
          showExplanation: false
        })
      )).join('')}
      <section class="card explanation group-result-explanation" aria-labelledby="result-explanation-${esc(block.id)}">
        <h4 id="result-explanation-${esc(block.id)}">本组讲解</h4>
        ${b1GroupExplanationBody(block, exam)}
      </section>
    </section>`;
  }).join('');
}

function renderExamResult() {
  const exam = currentExam();
  if (!exam?.submitted) {
    renderExamUnits();
    return;
  }
  const wrongIds = exam.result.wrongIds;
  main.innerHTML = `${pageHeading(`第 ${exam.config.unit} 单元考试结果`)}
    <section class="card result-summary" aria-label="答题结果">
      <p>共 ${exam.result.total} 题。</p>
      <p><strong>答对 ${exam.result.correct} 题，答错 ${exam.result.wrong} 题。</strong></p>
    </section>
    ${wrongIds.length
      ? `<section aria-labelledby="wrong-heading"><h3 id="wrong-heading">错题和解析</h3>${renderWrongResults(exam, wrongIds)}</section>`
      : '<p class="notice">本单元全部回答正确。</p>'}
    <div class="actions">
      <button type="button" data-exam-units>返回单元选择</button>
      <button type="button" data-home>返回首页</button>
    </div>`;
}

function render() {
  if (view === 'review') renderReview();
  else if (view === 'wrong-book') renderWrongBook();
  else if (view === 'exam-units') renderExamUnits();
  else if (view === 'exam-transition') renderExamTransition();
  else if (view === 'exam' || view === 'exam-result') renderExam();
  else renderHome();
}

function updateChoiceStatus(card, radio, question, result) {
  const label = radio.closest('.choice');
  label.classList.remove('selected-correct', 'selected-wrong');
  label.classList.add(`selected-${result}`);
  const optionText = `${radio.value}. ${question.options[radio.value]}。${result === 'correct' ? '正确' : '错误'}`;
  radio.setAttribute('aria-label', optionText);
  label.querySelector('span').textContent = card.dataset.compactOptions === 'true'
    ? `${radio.value}。${result === 'correct' ? '正确' : '错误'}`
    : optionText;
}

function updateWrongBookAbout(card, answer) {
  const about = card.querySelector('.wrong-book-about');
  const removeButton = about?.querySelector('[data-remove-wrong]');
  const explanation = about?.querySelector('.wrong-book-explanation');
  if (!about || !removeButton || !explanation) return;
  if (answer.firstCorrect === true) about.insertBefore(removeButton, explanation);
  else about.append(removeButton);
  about.open = answer.firstCorrect === false;
}

async function saveImmediateFeedbackAnswer(input, mode) {
  const session = mode === 'wrong-book' ? currentWrongBook() : currentReview();
  if (!session) return;
  const card = input.closest('.question-card');
  const questionId = card.dataset.questionId;
  const question = getQuestionById(questionId);
  const previous = session.answers[questionId];
  if (previous?.resolved) return;
  const correct = input.value === question.answer;
  const optionResults = { ...(previous?.optionResults ?? {}) };
  if (previous?.attempts && previous.current && !optionResults[previous.current]) {
    optionResults[previous.current] = previous.resolved ? 'correct' : 'wrong';
  }
  optionResults[input.value] = correct ? 'correct' : 'wrong';
  const answer = {
    current: input.value,
    attempts: (previous?.attempts ?? 0) + 1,
    firstCorrect: previous ? previous.firstCorrect : correct,
    resolved: correct,
    optionResults,
    updatedAt: new Date().toISOString()
  };
  session.answers[questionId] = answer;
  session.version = (session.version ?? 0) + 1;
  session.updatedAt = answer.updatedAt;
  if (mode === 'review' && !correct) {
    recordWrongBookEntry(state.wrongBook, questionId, 'review', { at: answer.updatedAt });
  }
  if (mode === 'wrong-book' && correct) {
    markWrongBookEntryCorrect(state.wrongBook, questionId, answer.updatedAt);
  }
  await saveState(state);

  if (correct) {
    card.querySelectorAll('input[type="radio"]').forEach(radio => {
      updateChoiceStatus(card, radio, question, radio.value === question.answer ? 'correct' : 'wrong');
      radio.disabled = true;
    });
  } else {
    updateChoiceStatus(card, input, question, 'wrong');
  }

  if (mode === 'wrong-book') {
    updateWrongBookAbout(card, answer);
  } else {
    const individualExplanation = card.querySelector('.explanation');
    const groupExplanation = card.closest('.question-group')?.querySelector('.group-explanation');
    if (individualExplanation) individualExplanation.open = answer.firstCorrect === false;
    if (groupExplanation) {
      const groupQuestionIds = [...card.closest('.question-group').querySelectorAll('.question-card')]
        .map(item => item.dataset.questionId);
      groupExplanation.open = groupQuestionIds.some(id => session.answers[id]?.firstCorrect === false);
    }
  }
}

async function saveReviewAnswer(input) {
  await saveImmediateFeedbackAnswer(input, 'review');
}

async function saveWrongBookAnswer(input) {
  await saveImmediateFeedbackAnswer(input, 'wrong-book');
}

async function saveExamAnswer(input) {
  const exam = currentExam();
  if (!exam || exam.submitted) return;
  const questionId = input.closest('.question-card').dataset.questionId;
  exam.answers[questionId] = {
    current: input.value,
    updatedAt: new Date().toISOString()
  };
  exam.version = (exam.version ?? 0) + 1;
  exam.updatedAt = exam.answers[questionId].updatedAt;
  await saveState(state);
}

async function goToPage(page, mode) {
  const revision = viewRevision;
  const session = mode === 'exam'
    ? currentExam()
    : mode === 'wrong-book'
      ? currentWrongBook()
      : currentReview();
  if (!session) return;
  const pages = mode === 'exam'
    ? currentExamPages(session)
    : createQuestionPages(session.questionIds.map(getQuestionById), PAGE_SIZE);
  const pageCount = pages.length;
  session.page = Math.max(1, Math.min(pageCount, Number(page) || 1));
  session.version = (session.version ?? 0) + 1;
  session.updatedAt = new Date().toISOString();
  await saveState(state);
  if (revision !== viewRevision) return;
  render();
  scrollToTop();
  focusElement('.group-context h3, .question-card h3');
  const prefix = mode === 'exam' ? '本题型' : mode === 'wrong-book' ? '错题本' : '';
  announce(`已到${prefix}第 ${session.page} 页，共 ${pageCount} 页。`);
}

async function confirmTypeTransition() {
  const revision = viewRevision;
  const exam = currentExam();
  if (!exam || exam.submitted) return;
  const currentType = currentExamType(exam);
  const nextType = exam.config.types[exam.currentTypeIndex + 1];
  if (nextType) {
    exam.lockedTypes = [...new Set([...(exam.lockedTypes ?? []), currentType])];
    exam.currentTypeIndex += 1;
    exam.page = 1;
    exam.version = (exam.version ?? 0) + 1;
    exam.updatedAt = new Date().toISOString();
    await saveState(state);
    if (revision !== viewRevision) return;
    setView('exam');
    announce(`已进入${QUESTION_TYPE_LABELS[nextType] || nextType}，不能返回上一题型。`);
    return;
  }
  await submitExam();
}

async function submitExam() {
  const revision = viewRevision;
  const exam = currentExam();
  if (!exam || exam.submitted) return;
  const wrongIds = exam.questionIds.filter(questionId =>
    exam.answers[questionId]?.current !== getQuestionById(questionId).answer
  );
  exam.submitted = true;
  exam.completed = true;
  exam.completedAt = new Date().toISOString();
  exam.result = {
    total: exam.questionIds.length,
    correct: exam.questionIds.length - wrongIds.length,
    wrong: wrongIds.length,
    wrongIds
  };
  exam.version = (exam.version ?? 0) + 1;
  exam.updatedAt = exam.completedAt;
  for (const questionId of wrongIds) {
    recordWrongBookEntry(state.wrongBook, questionId, 'exam', {
      unanswered: !exam.answers[questionId]?.current,
      at: exam.completedAt
    });
  }
  await saveState(state);
  if (revision !== viewRevision) return;
  setView('exam-result');
  announce(`考试已提交，答对 ${exam.result.correct} 题，答错 ${exam.result.wrong} 题。`);
}

function openWrongRemovalDialog(questionId) {
  pendingWrongRemovalId = questionId;
  removeWrongDialog.showModal();
  focusElement('[data-cancel-remove-wrong]');
}

async function removeCurrentWrong(questionId) {
  const revision = viewRevision;
  const session = currentWrongBook();
  const removedIndex = session?.questionIds.indexOf(questionId) ?? -1;
  if (!removeWrongBookEntry(state.wrongBook, questionId)) return;
  if (session && removedIndex >= 0) {
    session.questionIds.splice(removedIndex, 1);
    delete session.answers[questionId];
    session.version = (session.version ?? 0) + 1;
    session.updatedAt = new Date().toISOString();
  }
  const nextQuestionId = session?.questionIds[removedIndex] ?? session?.questionIds.at(-1);
  if (nextQuestionId) {
    const pages = createQuestionPages(session.questionIds.map(getQuestionById), PAGE_SIZE);
    session.page = pages.findIndex(page => page.questions.some(question => question.id === nextQuestionId)) + 1;
  }
  await saveState(state);
  if (revision !== viewRevision) return;
  renderWrongBook();
  scrollToTop();
  if (nextQuestionId) focusElement(`#heading-${nextQuestionId}`);
  else focusPageHeading();
  announce('本题已移出错题本。');
}

document.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;

  if (button.hasAttribute('data-open-review')) {
    lastHomeFocus = '[data-open-review]';
    openReviewCountDialog();
    return;
  }
  if (button.dataset.subjectId) {
    const subject = getSubjectById(button.dataset.subjectId);
    if (!subject) return;
    homeReviewOpen = true;
    homeSubjectsOpen = true;
    lastHomeFocus = `[data-subject-id="${subject.id}"]`;
    openReviewCountDialog(subject.id);
    return;
  }
  if (button.hasAttribute('data-close-review-dialog')) {
    reviewDialog.close();
    return;
  }
  if (button.hasAttribute('data-show-custom-count')) {
    customCountForm.hidden = false;
    focusElement('#custom-count');
    return;
  }
  if (button.dataset.reviewCount) {
    await startReview(Number(button.dataset.reviewCount));
    return;
  }
  if (button.hasAttribute('data-open-exam')) {
    lastHomeFocus = '[data-open-exam]';
    setView('exam-units');
    return;
  }
  if (button.hasAttribute('data-open-wrong-book')) {
    lastHomeFocus = '[data-open-wrong-book]';
    startWrongBook();
    return;
  }
  if (button.dataset.examUnit) {
    await startExam(Number(button.dataset.examUnit));
    return;
  }
  if (button.hasAttribute('data-resume-exam')) {
    setView('exam');
    return;
  }
  if (button.hasAttribute('data-home')) {
    setView('home');
    return;
  }
  if (button.hasAttribute('data-exam-units')) {
    setView('exam-units');
    return;
  }
  if (button.hasAttribute('data-complete-exam-type')) {
    setView('exam-transition');
    return;
  }
  if (button.hasAttribute('data-return-current-type')) {
    setView('exam');
    return;
  }
  if (button.hasAttribute('data-confirm-type-transition')) {
    button.disabled = true;
    try {
      await confirmTypeTransition();
    } finally {
      if (button.isConnected) button.disabled = false;
    }
    return;
  }
  if (button.dataset.removeWrong) {
    const entry = state.wrongBook.entries[button.dataset.removeWrong];
    if (!entry) return;
    if (needsWrongBookRemovalConfirmation(entry)) openWrongRemovalDialog(button.dataset.removeWrong);
    else await removeCurrentWrong(button.dataset.removeWrong);
    return;
  }
  if (button.hasAttribute('data-cancel-remove-wrong')) {
    removeWrongDialog.close();
    return;
  }
  if (button.hasAttribute('data-confirm-remove-wrong')) {
    const questionId = pendingWrongRemovalId;
    pendingWrongRemovalId = null;
    removeWrongDialog.close();
    if (questionId) await removeCurrentWrong(questionId);
    return;
  }
  if (button.dataset.goPage) {
    await goToPage(button.dataset.goPage, button.dataset.mode);
    return;
  }
});

document.addEventListener('change', async event => {
  const input = event.target;
  if (!input.matches('[data-answer]')) return;
  if (input.dataset.mode === 'review') await saveReviewAnswer(input);
  else if (input.dataset.mode === 'wrong-book') await saveWrongBookAnswer(input);
  else await saveExamAnswer(input);
});

document.addEventListener('submit', async event => {
  if (event.target.id === 'custom-count-form') {
    event.preventDefault();
    await startReview(new FormData(event.target).get('count'));
    return;
  }
  if (event.target.matches('[data-page-jump]')) {
    event.preventDefault();
    const page = new FormData(event.target).get('page');
    await goToPage(page, event.target.dataset.mode);
  }
});

reviewDialog.addEventListener('close', () => {
  if (view === 'home') focusElement(lastHomeFocus);
});

removeWrongDialog.addEventListener('close', () => {
  const questionId = pendingWrongRemovalId;
  pendingWrongRemovalId = null;
  if (view === 'wrong-book' && questionId && state.wrongBook.entries[questionId]) {
    focusElement(`[data-remove-wrong="${CSS.escape(questionId)}"]`);
  }
});

setupSubjectPanelFocus(document);

document.addEventListener('toggle', event => {
  if (event.target.matches('[data-review-panel]')) homeReviewOpen = event.target.open;
  if (event.target.matches('[data-subject-panel]')) homeSubjectsOpen = event.target.open;
}, true);

if (state.settings?.theme && state.settings.theme !== 'system') {
  document.documentElement.dataset.theme = state.settings.theme;
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

render();
requestAnimationFrame(() => appTitle.focus());
