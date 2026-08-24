#!/usr/bin/env node
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { auditQuestionBank } from './question-bank-audit.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2];
const absolute = input
  ? path.resolve(input)
  : path.join(projectRoot, 'js', 'questions-bank.js');
const module = await import(`${pathToFileURL(absolute).href}?audit=${Date.now()}`);

let exportName = null;
let questions = null;
if (Array.isArray(module.QUESTIONS)) {
  exportName = 'QUESTIONS';
  questions = module.QUESTIONS;
} else {
  const candidates = Object.entries(module).filter(([name, value]) => /^QUESTIONS_/.test(name) && Array.isArray(value));
  if (candidates.length === 1) {
    [exportName, questions] = candidates[0];
  } else if (candidates.length > 1) {
    throw new Error(`题库模块存在多个候选导出，无法自动确定审计范围：${candidates.map(([name]) => name).join(', ')}`);
  }
}

if (!questions) throw new Error(`题库模块没有可识别的 QUESTIONS 或 QUESTIONS_* 数组导出：${absolute}`);

const report = auditQuestionBank(questions, { source: absolute });
console.log(JSON.stringify({ input: absolute, exportName, ...report }, null, 2));
if (report.errorCount > 0) process.exitCode = 1;
