const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E'];
const VALID_TYPES = new Set(['A1/A2', 'A3', 'B1']);
const GROUPED_TYPES = new Set(['A3', 'B1']);
const STRICT_HISTORY_YEARS = new Set([2018, 2019, 2020, 2021, 2022]);

const CONTENT_CHECKS = [
  ['watermark', /(?:yidianbiji|anbiji|一\s*点\s*笔\s*记|万题|何必|历年考题卷|202[0-4]中医医考|www[.-]|[A-Za-z0-9-]+\.(?:com|cn)\b)/i],
  ['ocr-symbol', /[丿訂〖〗【】@&•●▪]|解析[】〗]|(?:^|[^A-Za-z0-9])O(?:$|[^A-Za-z0-9])/],
  ['replacement-character', /[�□]/],
  ['unit-footer', /[【〖]?\s*第[一二三四]单元\s*$/],
  ['source-placeholder', /待补充/],
];

const STRICT_HISTORY_OCR = /原文件未提供解析|[•●▪〖〗【】]|·209|原7|訂|www\.|\.com|anbiji|yidianbiji|苟有恒|最无益|丿L|待补充|A1\/A2型选择题/;
const PLACEHOLDER_EXPLANATION = /^(?:原文件未提供解析。?|略。?|实记题。?|\d{1,3})$/;
const UNUSABLE_EXPLANATION = /^[A-E]?\s*略\s*[。．.]?(?:\s*[【〖][^】〗]*[】〗]\s*[。．.]?)?$/i;

function textForOcrAudit(id, field, text) {
  if (id === '2021-U3-046' && field === 'explanation') {
    return text.replaceAll('【主治】', '');
  }
  return text;
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getYear(question) {
  const match = cleanText(question?.id).match(/^(\d{4})(?:-|$)/);
  return match ? Number(match[1]) : null;
}

function mapToSortedObject(map, numeric = false) {
  return Object.fromEntries([...map.entries()].sort(([left], [right]) => (
    numeric ? Number(left) - Number(right) : String(left).localeCompare(String(right), 'zh-CN')
  )));
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function optionSignature(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return '';
  return OPTION_LETTERS.map(letter => `${letter}:${cleanText(options[letter])}`).join('|');
}

function questionSignature(question) {
  const content = `${cleanText(question?.stem)}${OPTION_LETTERS.map(letter => cleanText(question?.options?.[letter])).join('')}`;
  return content.normalize('NFKC').replace(/[^0-9A-Za-z\u3400-\u9fff]/g, '').toLowerCase();
}

function excerpt(text) {
  const normalized = cleanText(text).replace(/\s+/g, ' ');
  return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized;
}

function historicalSourceNumbers(question, year) {
  if (!STRICT_HISTORY_YEARS.has(year) || !Number.isInteger(question.number)) {
    return { current: null, next: null };
  }
  const current = year === 2018
    ? question.number
    : (Number(question.unit) - 1) * 150 + question.number;
  let next = null;
  if (year === 2021) {
    const unitCounts = [150, 150, 150, 126];
    const unit = Number(question.unit);
    if (unit >= 1 && unit <= unitCounts.length) {
      next = question.number < unitCounts[unit - 1]
        ? question.number + 1
        : unit < 4 ? 1 : null;
    }
  } else if (current < (year === 2018 ? 162 : 600)) {
    next = current + 1;
  }
  return { current, next };
}

function issueCounts(issues, severity) {
  const counts = new Map();
  for (const issue of issues) {
    if (issue.severity === severity) increment(counts, issue.kind);
  }
  return mapToSortedObject(counts);
}

export function auditQuestionBank(questions, options = {}) {
  if (!Array.isArray(questions)) throw new TypeError('题库导出必须是数组');

  const issues = [];
  const years = new Map();
  const types = new Map();
  const idOwners = new Map();
  const contentOwners = new Map();
  const groups = new Map();
  const numbersByYearUnit = new Map();

  const addIssue = ({ severity = 'error', kind, id, field = null, message, text = '' }) => {
    issues.push({ severity, kind, id, field, message, excerpt: excerpt(text) });
  };

  for (const question of questions) {
    const year = getYear(question);
    if (year !== null && Number.isInteger(question?.unit) && Number.isInteger(question?.number)) {
      const key = `${year}|${question.unit}`;
      if (!numbersByYearUnit.has(key)) numbersByYearUnit.set(key, new Set());
      numbersByYearUnit.get(key).add(question.number);
    }
  }

  questions.forEach((question, index) => {
    const rawId = cleanText(question?.id);
    const id = rawId || `(索引 ${index})`;
    const year = getYear(question);
    const type = cleanText(question?.type) || '(缺失)';
    increment(years, year === null ? '(无法识别)' : String(year));
    increment(types, type);

    if (!rawId) {
      addIssue({ kind: 'missing-id', id, field: 'id', message: '题目 ID 缺失' });
    } else if (idOwners.has(rawId)) {
      addIssue({ kind: 'duplicate-id', id, field: 'id', message: `题目 ID 与索引 ${idOwners.get(rawId)} 重复` });
    } else {
      idOwners.set(rawId, index);
    }

    const signature = questionSignature(question);
    if (signature) {
      if (contentOwners.has(signature)) {
        addIssue({ kind: 'duplicate-question-content', id, message: `题干和选项与 ${contentOwners.get(signature)} 重复` });
      } else {
        contentOwners.set(signature, id);
      }
    }

    if (!cleanText(question?.stem)) {
      addIssue({ kind: 'missing-stem', id, field: 'stem', message: '题干缺失或为空' });
    }

    const optionKeys = question?.options && typeof question.options === 'object' && !Array.isArray(question.options)
      ? Object.keys(question.options)
      : [];
    const sortedOptionKeys = [...optionKeys].sort();
    if (sortedOptionKeys.join(',') !== OPTION_LETTERS.join(',')) {
      addIssue({ kind: 'invalid-option-keys', id, field: 'options', message: `选项键应为 A—E，实际为 ${sortedOptionKeys.join(',') || '空'}` });
    }
    for (const letter of OPTION_LETTERS) {
      if (!cleanText(question?.options?.[letter])) {
        addIssue({ kind: 'missing-option', id, field: `option-${letter}`, message: `${letter} 选项缺失或为空` });
      }
    }

    const answer = cleanText(question?.answer);
    if (!/^[A-E]$/.test(answer) || !cleanText(question?.options?.[answer])) {
      addIssue({ kind: 'invalid-answer', id, field: 'answer', message: `答案必须指向现有的 A—E 选项，实际为 ${answer || '空'}` });
    }

    const explanation = cleanText(question?.explanation);
    if (!explanation) {
      addIssue({ kind: 'empty-explanation', id, field: 'explanation', message: '解析字段缺失或为空' });
    }

    if (!VALID_TYPES.has(type)) {
      addIssue({ kind: 'invalid-type', id, field: 'type', message: `不支持的题型：${type}` });
    }

    if (GROUPED_TYPES.has(type)) {
      if (!cleanText(question?.groupId)) {
        addIssue({ kind: 'missing-group-id', id, field: 'groupId', message: `${type} 题缺少题组标识` });
      }
      if (!cleanText(question?.prompt)) {
        addIssue({ kind: 'missing-group-prompt', id, field: 'prompt', message: `${type} 题缺少题组内问题` });
      }
      if (type === 'A3' && !cleanText(question?.sharedStem)) {
        addIssue({ kind: 'missing-shared-stem', id, field: 'sharedStem', message: 'A3 题缺少共用题干' });
      }
      if (type === 'B1') {
        const sharedKeys = question?.sharedOptions && typeof question.sharedOptions === 'object'
          ? Object.keys(question.sharedOptions).sort()
          : [];
        if (sharedKeys.join(',') !== OPTION_LETTERS.join(',')
          || OPTION_LETTERS.some(letter => !cleanText(question?.sharedOptions?.[letter]))) {
          addIssue({ kind: 'invalid-shared-options', id, field: 'sharedOptions', message: 'B1 共用选项必须完整包含非空 A—E' });
        }
      }
    } else if (cleanText(question?.groupId)) {
      addIssue({ kind: 'unexpected-group-id', id, field: 'groupId', message: `${type} 题不应使用题组标识` });
    }

    if (/答案[：:]|解析[：:]|型题/.test(cleanText(question?.stem))) {
      addIssue({ kind: 'embedded-answer-marker', id, field: 'stem', message: '题干混入答案、解析或题型标记', text: question.stem });
    }
    for (const letter of OPTION_LETTERS) {
      const value = cleanText(question?.options?.[letter]);
      if (/答案[：:]|解析[：:]|型题/.test(value)) {
        addIssue({ kind: 'embedded-answer-marker', id, field: `option-${letter}`, message: '选项混入答案、解析或题型标记', text: value });
      }
    }

    if (explanation) {
      const strictHistory = STRICT_HISTORY_YEARS.has(year);
      if (PLACEHOLDER_EXPLANATION.test(explanation)) {
        addIssue({
          severity: strictHistory ? 'error' : 'warning',
          kind: 'placeholder-explanation',
          id,
          field: 'explanation',
          message: '解析是缺失占位内容',
          text: explanation,
        });
      } else if (UNUSABLE_EXPLANATION.test(explanation)) {
        addIssue({ severity: 'warning', kind: 'unusable-explanation', id, field: 'explanation', message: '解析内容明显不可用', text: explanation });
      }
    }

    const fields = [
      ['stem', cleanText(question?.stem)],
      ['explanation', explanation],
      ...OPTION_LETTERS.map(letter => [`option-${letter}`, cleanText(question?.options?.[letter])]),
    ];
    const strictHistory = STRICT_HISTORY_YEARS.has(year);
    const localNumbers = year !== null ? numbersByYearUnit.get(`${year}|${question?.unit}`) : null;
    const localNext = Number.isInteger(question?.number) && localNumbers?.has(question.number + 1)
      ? question.number + 1
      : null;
    const historical = historicalSourceNumbers(question, year);
    const anchorNumbers = [...new Set([question?.number, localNext, historical.current, historical.next].filter(Number.isInteger))];
    const nextNumbers = [...new Set([localNext, historical.next].filter(Number.isInteger))];
    const anchorPattern = anchorNumbers.length
      ? new RegExp(`(?:[·•]\\s*(?:${anchorNumbers.join('|')})(?=\\s*[（(]|$)|(?:^|[^\\d])(?:${anchorNumbers.join('|')})[.．、]\\s*(?:(?:[【〖]\\s*)?(?:解析|一\\s*点\\s*笔\\s*记)|患者|患儿|下列|上述|治疗|诊断|某|女性|男性))`)
      : null;
    const trailingPattern = nextNumbers.length
      ? new RegExp(`(?:^|[·。；;，,\\s])(?:${nextNumbers.join('|')})(?:[IL])?[.．、]?\\s*$`, 'i')
      : null;

    for (const [field, text] of fields) {
      if (!text) continue;
      const auditedText = textForOcrAudit(id, field, text);
      for (const [kind, pattern] of CONTENT_CHECKS) {
        if (pattern.test(auditedText)) {
          addIssue({ severity: strictHistory ? 'error' : 'warning', kind, id, field, message: `检测到 ${kind} 内容`, text });
        }
      }
      if (strictHistory && STRICT_HISTORY_OCR.test(auditedText)) {
        addIssue({ kind: 'history-source-ocr', id, field, message: '2018—2022 来源专项规则检测到 OCR 污染', text });
      }
      if (anchorPattern?.test(text)) {
        addIssue({ severity: strictHistory ? 'error' : 'warning', kind: 'merged-question-anchor', id, field, message: '疑似混入当前题或下一题的题号锚点', text });
      }
      if (trailingPattern?.test(text)) {
        addIssue({ severity: strictHistory ? 'error' : 'warning', kind: 'trailing-next-question-anchor', id, field, message: '字段末尾疑似混入下一题题号', text });
      }
    }

    const groupId = cleanText(question?.groupId);
    if (groupId) {
      if (!groups.has(groupId)) groups.set(groupId, []);
      groups.get(groupId).push({ question, id, year, type });
    }
  });

  const groupTypes = new Map();
  let groupedQuestionCount = 0;
  for (const [groupId, members] of groups) {
    groupedQuestionCount += members.length;
    const memberTypes = new Set(members.map(member => member.type));
    const memberYears = new Set(members.map(member => member.year));
    const memberUnits = new Set(members.map(member => member.question.unit));
    const type = members[0]?.type || '(缺失)';
    if (!groupTypes.has(type)) groupTypes.set(type, { groups: 0, questions: 0 });
    groupTypes.get(type).groups += 1;
    groupTypes.get(type).questions += members.length;

    if (memberTypes.size !== 1 || !GROUPED_TYPES.has(type)) {
      addIssue({ kind: 'group-type-conflict', id: groupId, field: 'groupId', message: `题组成员题型冲突：${[...memberTypes].join(',')}` });
    }
    if (memberYears.size !== 1 || memberUnits.size !== 1) {
      addIssue({ kind: 'group-scope-conflict', id: groupId, field: 'groupId', message: '同一题组标识跨年份或跨单元使用' });
    }

    const starts = new Set(members.map(member => member.question.groupStart));
    const ends = new Set(members.map(member => member.question.groupEnd));
    const numbers = members.map(member => member.question.number).filter(Number.isInteger).sort((a, b) => a - b);
    if (starts.size !== 1 || ends.size !== 1
      || !Number.isInteger(members[0]?.question.groupStart)
      || !Number.isInteger(members[0]?.question.groupEnd)) {
      addIssue({ kind: 'group-range-conflict', id: groupId, field: 'groupStart/groupEnd', message: '题组起止编号缺失或成员间不一致' });
    } else {
      const start = members[0].question.groupStart;
      const end = members[0].question.groupEnd;
      const expected = Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
      if (start > end || numbers.length !== members.length || JSON.stringify(numbers) !== JSON.stringify(expected)) {
        addIssue({ kind: 'incomplete-group-members', id: groupId, field: 'groupStart/groupEnd', message: `题组成员不完整；声明范围 ${start}—${end}，实际题号 ${numbers.join(',')}` });
      }
    }

    if (type === 'A3') {
      const stems = new Set(members.map(member => cleanText(member.question.sharedStem)));
      if (stems.size !== 1 || stems.has('')) {
        addIssue({ kind: 'shared-stem-conflict', id: groupId, field: 'sharedStem', message: 'A3 题组共用题干缺失或不一致' });
      }
    }
    if (type === 'B1') {
      const options = new Set(members.map(member => optionSignature(member.question.sharedOptions)));
      if (options.size !== 1 || options.has('')) {
        addIssue({ kind: 'shared-options-conflict', id: groupId, field: 'sharedOptions', message: 'B1 题组共用选项缺失或不一致' });
      }
    }
  }

  const errors = issues.filter(issue => issue.severity === 'error');
  const warnings = issues.filter(issue => issue.severity === 'warning');
  return {
    source: options.source || null,
    questionCount: questions.length,
    years: mapToSortedObject(years, true),
    types: mapToSortedObject(types),
    groups: {
      groupCount: groups.size,
      groupedQuestionCount,
      byType: mapToSortedObject(groupTypes),
    },
    errorCount: errors.length,
    warningCount: warnings.length,
    affectedQuestions: {
      errors: new Set(errors.map(issue => issue.id)).size,
      warnings: new Set(warnings.map(issue => issue.id)).size,
    },
    counts: {
      errors: issueCounts(issues, 'error'),
      warnings: issueCounts(issues, 'warning'),
    },
    issues,
  };
}
