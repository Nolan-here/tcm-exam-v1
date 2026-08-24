#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const input = process.argv[2] || 'js/questions-2018-2022.js';
const absolute = path.resolve(input);
const module = await import(`${pathToFileURL(absolute).href}?audit=${Date.now()}`);
const questions = module.QUESTIONS_2018_2022
  || Object.entries(module).find(([name, value]) => /^QUESTIONS_/.test(name) && Array.isArray(value))?.[1]
  || [];

const checks = [
  ['missing-explanation', text => text === '原文件未提供解析。'],
  ['watermark', text => /(?:yidianbiji|anbiji|一点笔记|万题|何必|历年考题卷|202[0-4]中医医考|www\.)/i.test(text)],
  ['ocr-symbol', text => /[丿訂〖〗@&]|(?:^|[^A-Za-z])O(?:$|[^A-Za-z])/.test(text)],
  ['replacement-character', text => /[�□]/.test(text)],
  ['unit-footer', text => /[【〖]?\s*第[一二三四]单元\s*$/.test(text)],
  ['source-placeholder', text => /待补充/.test(text)],
];

const issues = [];
for (const question of questions) {
  const year = Number(question.id.slice(0, 4));
  const sourceNumber = year === 2018 || year === 2021
    ? question.number
    : (question.unit - 1) * 150 + question.number;
  const nextSourceNumber = year === 2021
    ? question.number < [150, 150, 150, 126][question.unit - 1]
      ? question.number + 1
      : question.unit < 4 ? 1 : null
    : sourceNumber < (year === 2018 ? 162 : 600) ? sourceNumber + 1 : null;
  const suspiciousNumbers = [sourceNumber, nextSourceNumber].filter(Number.isInteger).join('|');
  const mergedQuestion = suspiciousNumbers
    ? new RegExp(`(?:[·•]\\s*(?:${suspiciousNumbers})(?=\\s*[（(]|$)|(?:^|[^\\d])(?:${suspiciousNumbers})[.．、]\\s*(?:[【〖]?解析|患者|患儿|下列|上述|治疗|诊断|某|女性|男性))`)
    : null;
  const trailingAnchor = nextSourceNumber === null
    ? null
    : new RegExp(`(?:[·。；;，,]|\\s)${nextSourceNumber}(?:[IL])?\\s*$`, 'i');
  const fields = [
    ['stem', question.stem || ''],
    ['explanation', question.explanation || ''],
    ...Object.entries(question.options || {}).map(([letter, value]) => [`option-${letter}`, value || '']),
  ];
  for (const [field, text] of fields) {
    for (const [kind, matches] of checks) {
      if (matches(text)) issues.push({ id: question.id, field, kind, text });
    }
    if (mergedQuestion?.test(text)) issues.push({ id: question.id, field, kind: 'merged-question-anchor', text });
    if (trailingAnchor?.test(text)) issues.push({ id: question.id, field, kind: 'trailing-next-question-anchor', text });
  }
}

const counts = Object.fromEntries(
  [...new Set(issues.map(issue => issue.kind))].sort().map(kind => [kind, issues.filter(issue => issue.kind === kind).length]),
);
console.log(JSON.stringify({ input: absolute, questionCount: questions.length, counts, issues }, null, 2));
