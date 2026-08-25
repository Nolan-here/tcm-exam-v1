import { AUTHORITY_RESEARCHED_EXPLANATION_RECORDS } from './authority-researched-explanations-2023.js';

// 单独导出争议清单，便于后续答案专项任务读取；本文件不修改正式题库。
export const AUTHORITY_RESEARCHED_EXPLANATION_DISPUTES_2023 =
  AUTHORITY_RESEARCHED_EXPLANATION_RECORDS.filter(record => record.finalStatus === 'answer-dispute');

if (AUTHORITY_RESEARCHED_EXPLANATION_DISPUTES_2023.length !== 5) {
  throw new Error(`2023年权威后补解析争议数量异常：${AUTHORITY_RESEARCHED_EXPLANATION_DISPUTES_2023.length}`);
}
