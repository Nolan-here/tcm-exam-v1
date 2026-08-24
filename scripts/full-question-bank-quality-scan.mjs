#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUESTIONS } from '../js/questions-bank.js';
import { auditQuestionBank } from './question-bank-audit.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E'];
const WATERMARK_RE = /(?:yidianbiji|anbiji|(?:一\s*)?点\s*笔\s*记|万\s*题|历\s*年\s*考\s*题\s*卷|202[0-4]\s*中\s*医\s*医\s*考|何\s*必\s*三\s*更|苟\s*有\s*恒|www\s*[.．]|[A-Za-z0-9-]+\s*[.．]\s*(?:com|cn)\b)/iu;
const SOURCE_NOISE_RE = /(?:OCR\s*工具|扫描全能王|第\s*[一二三四]\s*单元\s*$|第\s*\d+\s*页\s*$)/iu;
const REPLACEMENT_RE = /[�□]|(?:锟斤拷|烫烫烫|屯屯屯)/u;
const OCR_SYMBOL_RE = /[丿訂〖〗@&•●▪]|解析[】〗]|(?:^|[^A-Za-z0-9])O(?:$|[^A-Za-z0-9])/u;
const TRAILING_OCR_GARBAGE_RE = /(?:\b(?:EOoH|ar|di)\b|(?:^|[。；;，,）])\s*[dmX]\s*[。．.]?$)/u;
const TYPE_LABEL_RE = /(?:^|[。；;：:\s])(?:A1|A2|A3|A4|A3\s*\/\s*A4|B1|AE|A三|A四|A二)(?:型)?(?:题|选择题)?(?:$|[。；;：:\s])/iu;
const MISSING_EXPLANATION_RE = /^(?:略[。．.]?|无[。．.]?|暂无[。．.]?|未提供[。．.]?|原文件未提供(?:解析)?[。．.]?|待补充[。．.]?|占位(?:符)?[。．.]?)$/u;
const UNUSABLE_EXPLANATION_RE = /^(?:[A-E]\s*)?(?:略|无|暂无|未提供|原文件未提供(?:解析)?|待补充)?\s*[。．.]?\s*(?:[【〖][^】〗]*[】〗]\s*[。．.]?)?$/iu;
const SUSPICIOUS_TERM_PATTERNS = [
  ['possible-bian-character-confusion', /(?:辩证|辩病|辨病辩证)/u, '“辨证/辨病”相关文字疑似把“辨”误作“辩”'],
  ['possible-feiwei-character-confusion', /肺瘘/u, '中医病名疑似把“肺痿”误作“肺瘘”'],
];

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function yearOf(question) {
  const match = cleanText(question?.id).match(/^(\d{4})/u);
  return match ? Number(match[1]) : null;
}

function sourcesFor(question) {
  const year = yearOf(question);
  if (year === 2024) return ['2024年中医执业医师（一试）题目整理.docx'];
  if (year === 2023) return ['考题2023-全集.docx', '考题2023+答案.docx'];
  if (year >= 2018 && year <= 2022) {
    const questionName = year === 2018 ? '考题2018-精选.1.pdf' : year === 2021 ? '考题2021-精选.pdf' : `考题${year}-全集.pdf`;
    return [questionName, `考题${year}年答案-解析.pdf`];
  }
  return [];
}

function textFields(question) {
  const fields = [
    ['stem', question.stem],
    ['explanation', question.explanation],
  ];
  for (const letter of OPTION_LETTERS) fields.push([`option-${letter}`, question.options?.[letter]]);
  if ('prompt' in question) fields.push(['prompt', question.prompt]);
  if ('sharedStem' in question) fields.push(['sharedStem', question.sharedStem]);
  if ('sharedOptions' in question) {
    for (const letter of OPTION_LETTERS) fields.push([`shared-option-${letter}`, question.sharedOptions?.[letter]]);
  }
  return fields.map(([field, value]) => [field, cleanText(value)]);
}

function sourceNumber(question) {
  const year = yearOf(question);
  if (!Number.isInteger(question?.number)) return null;
  if (year >= 2019 && year <= 2022 && Number.isInteger(question?.unit)) {
    return (question.unit - 1) * 150 + question.number;
  }
  return question.number;
}

function fieldGroup(field) {
  if (field === 'explanation') return 'explanation';
  if (field.startsWith('option-') || field.startsWith('shared-option-')) return 'option';
  return 'stem';
}

function normalizeContent(value) {
  return cleanText(value).normalize('NFKC').replace(/[^0-9A-Za-z\u3400-\u9fff]/gu, '').toLowerCase();
}

function normalizeOptionSet(question) {
  return OPTION_LETTERS.map(letter => normalizeContent(question.options?.[letter])).sort().join('|');
}

function correctAnswerText(question) {
  return normalizeContent(question.options?.[cleanText(question.answer)]);
}

function hasUnbalancedBrackets(text) {
  const pairs = [['（', '）'], ['(', ')'], ['【', '】'], ['〖', '〗'], ['[', ']']];
  return pairs.some(([left, right]) => {
    let depth = 0;
    for (const character of text) {
      if (character === left) depth += 1;
      if (character === right) depth -= 1;
      if (depth < 0) return true;
    }
    return depth !== 0;
  });
}

function makeCandidate(question, field, issueType, text, reason, confidence = 'medium') {
  return {
    id: cleanText(question.id),
    year: yearOf(question),
    unit: question.unit ?? null,
    number: question.number ?? null,
    field,
    fieldGroup: fieldGroup(field),
    issueType,
    before: text,
    after: null,
    reason,
    originalSources: sourcesFor(question),
    onlineChecked: false,
    networkSources: [],
    confidence,
    requiresManualReview: true,
  };
}

function deduplicateCandidates(candidates) {
  const seen = new Set();
  return candidates.filter(candidate => {
    const key = `${candidate.id}\u0000${candidate.field}\u0000${candidate.issueType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function issueCounts(candidates, property) {
  const counts = new Map();
  for (const candidate of candidates) {
    const key = candidate[property];
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right, 'zh-CN')));
}

function answerConflictCandidates(questions) {
  const buckets = new Map();
  for (const question of questions) {
    const key = `${normalizeContent(question.stem)}\u0000${normalizeOptionSet(question)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(question);
  }
  const candidates = [];
  for (const members of buckets.values()) {
    if (members.length < 2) continue;
    const correctTexts = new Set(members.map(correctAnswerText));
    if (correctTexts.size < 2) continue;
    candidates.push({
      issueType: 'same-question-conflicting-correct-answer',
      ids: members.map(question => question.id),
      answers: members.map(question => ({
        id: question.id,
        answer: question.answer,
        answerText: question.options?.[question.answer] || '',
      })),
      reason: '规范化题干和选项集合相同，但正确答案正文不同，必须回到原始资料核对',
      confidence: 'high',
      requiresManualReview: true,
    });
  }
  return candidates;
}

export function scanFullQuestionBank(questions = QUESTIONS) {
  const structural = auditQuestionBank(questions, { source: 'js/questions-bank.js' });
  const candidates = [];
  const missingExplanations = [];
  const highRiskOriginalChecks = [];

  for (const question of questions) {
    const explanation = cleanText(question.explanation);
    if (!explanation || MISSING_EXPLANATION_RE.test(explanation) || UNUSABLE_EXPLANATION_RE.test(explanation)) {
      const classification = !explanation ? 'empty' : MISSING_EXPLANATION_RE.test(explanation) ? 'placeholder' : 'unusable';
      missingExplanations.push(makeCandidate(
        question,
        'explanation',
        `missing-explanation-${classification}`,
        explanation,
        classification === 'unusable' ? '解析只有占位、水印、题号或乱码，无法解释答案' : '解析缺失或属于任务定义的占位内容',
        'high',
      ));
    }

    const highRiskFields = textFields(question).filter(([field, text]) => (
      text && /(?:不包括|不属于|错误的是|不正确|除外|剂量|\d+(?:\.\d+)?\s*(?:mg|g|ml|mL|毫克|克|毫升|寸|度)|首选|最佳|禁忌)/iu.test(text)
      && ['stem', 'prompt', 'sharedStem', 'explanation'].includes(field)
    ));
    for (const [field, text] of highRiskFields) {
      highRiskOriginalChecks.push(makeCandidate(
        question,
        field,
        'high-risk-original-wording-check',
        text,
        '包含否定词、剂量、数字、首选或禁忌等高风险文字，应优先对照原文；这不等于已发现错误',
        'review-priority',
      ));
    }

    for (const [field, text] of textFields(question)) {
      if (!text) continue;
      if (WATERMARK_RE.test(text)) {
        candidates.push(makeCandidate(question, field, 'watermark-or-source-noise', text, '检测到域名、机构水印、历年卷页眉或推广语', 'high'));
      }
      if (SOURCE_NOISE_RE.test(text)) {
        candidates.push(makeCandidate(question, field, 'header-footer-or-ocr-tool-noise', text, '检测到页眉、页脚、页码或 OCR 工具残留', 'high'));
      }
      if (REPLACEMENT_RE.test(text)) {
        candidates.push(makeCandidate(question, field, 'replacement-or-mojibake-character', text, '检测到替换字符、方框或典型乱码', 'high'));
      }
      if (OCR_SYMBOL_RE.test(text)) {
        candidates.push(makeCandidate(question, field, 'suspicious-ocr-symbol', text, '检测到罕见 OCR 符号、旧式括号或孤立字母 O', 'medium'));
      }
      if (TYPE_LABEL_RE.test(text) || /(?:AI|Al|A三|A四|A二|AE)型题/iu.test(text.replace(/\s+/gu, ''))) {
        candidates.push(makeCandidate(question, field, 'embedded-question-type-label', text, '字段中疑似混入 A1/A2/A3/A4/B1/AE 等题型标签或 OCR 变体', 'medium'));
      }
      if (/[\u3400-\u9fff]\s+[\u3400-\u9fff]/u.test(text)) {
        candidates.push(makeCandidate(question, field, 'internal-cjk-whitespace', text, '连续中文词语之间存在空格，可能是 OCR 断裂，也可能是原文分隔，需对照原文', 'medium'));
      }
      if (/\s{2,}/u.test(text)) {
        candidates.push(makeCandidate(question, field, 'repeated-whitespace', text, '检测到连续空白字符', 'medium'));
      }
      if (hasUnbalancedBrackets(text)) {
        candidates.push(makeCandidate(question, field, 'unbalanced-brackets', text, '圆括号、方括号或书名式括号数量/顺序不平衡', 'medium'));
      }
      if (/[\u3400-\u9fff][lOo][\u3400-\u9fff]/u.test(text)) {
        candidates.push(makeCandidate(question, field, 'embedded-latin-letter-confusion', text, '中文词语内部混入 l/O/o，疑似字符误识别', 'high'));
      }
      if (TRAILING_OCR_GARBAGE_RE.test(text)) {
        candidates.push(makeCandidate(question, field, 'trailing-ocr-garbage', text, '字段末尾或括号附近存在无法解释的短英文片段，疑似 OCR 残留', 'medium'));
      }
      for (const [issueType, pattern, reason] of SUSPICIOUS_TERM_PATTERNS) {
        if (pattern.test(text)) candidates.push(makeCandidate(question, field, issueType, text, reason, 'medium'));
      }

      const next = sourceNumber(question);
      if (Number.isInteger(next)) {
        const expected = next + 1;
        const nextQuestionPattern = new RegExp(`(?:^|[。；;，,\\s])${expected}(?:[IL])?[.．、](?:\\s|$|[【〖\\u3400-\\u9fff])`, 'iu');
        if (nextQuestionPattern.test(text)) {
          candidates.push(makeCandidate(question, field, 'possible-next-question-number', text, `检测到疑似下一题题号 ${expected}`, 'high'));
        }
      }
    }
  }

  const uniqueCandidates = deduplicateCandidates(candidates);
  const uniqueMissing = deduplicateCandidates(missingExplanations);
  const uniqueHighRisk = deduplicateCandidates(highRiskOriginalChecks);
  const answerCandidates = answerConflictCandidates(questions);
  const fieldGroupCounts = issueCounts(uniqueCandidates, 'fieldGroup');
  const affectedQuestionIds = new Set(uniqueCandidates.map(candidate => candidate.id));

  return {
    generatedAt: new Date().toISOString(),
    scope: {
      formalEntry: 'js/questions-bank.js',
      questionCount: questions.length,
      years: structural.years,
      types: structural.types,
      groups: structural.groups,
    },
    structuralBaseline: {
      errorCount: structural.errorCount,
      warningCount: structural.warningCount,
      affectedQuestions: structural.affectedQuestions,
      counts: structural.counts,
    },
    scanSummary: {
      candidateCount: uniqueCandidates.length,
      affectedQuestionCount: affectedQuestionIds.size,
      byIssueType: issueCounts(uniqueCandidates, 'issueType'),
      byFieldGroup: {
        stem: fieldGroupCounts.stem || 0,
        option: fieldGroupCounts.option || 0,
        explanation: fieldGroupCounts.explanation || 0,
      },
      missingOrUnusableExplanationCount: uniqueMissing.length,
      answerConflictCandidateCount: answerCandidates.length,
      highRiskOriginalWordingCheckCount: uniqueHighRisk.length,
    },
    candidates: uniqueCandidates,
    missingOrUnusableExplanations: uniqueMissing,
    answerConflictCandidates: answerCandidates,
    highRiskOriginalWordingChecks: uniqueHighRisk,
    limitations: [
      '候选扫描只用于发现和分流，不能替代 PDF/DOCX 原文、页面图像或权威医学资料核对。',
      '字段内中文空格、题型字符串、数字和括号在部分医学语境中可能合法，未核对原文前不得自动替换或删除。',
      '答案冲突扫描只能发现结构上可比较的重复题冲突，0 个候选不代表医学答案正确。',
    ],
  };
}

async function main() {
  const outputIndex = process.argv.indexOf('--output');
  const outputArgument = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
  if (outputIndex >= 0 && !outputArgument) throw new Error('--output 后必须提供路径');
  const report = scanFullQuestionBank();
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (outputArgument) {
    const outputPath = path.resolve(PROJECT_ROOT, outputArgument);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, text, 'utf8');
    console.error(`完整题库质量扫描报告已写入：${outputPath}`);
  }
  process.stdout.write(text);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
