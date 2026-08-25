// 科目显示名称以国家医学考试中心公布的中医执业医师考试科目为准。
// sourceName 只用于匹配原始 TXT 文件名主体；subjectId 必须保持稳定，以兼容已有会话。
export const SUBJECT_SOURCE_METADATA = Object.freeze([
  { order: 1, sourceName: '中医儿科学题', sourceFileName: '中医儿科学题.txt', subjectId: 'subject-886e0290c4c6', subjectName: '中医儿科学' },
  { order: 2, sourceName: '中医内科学题1', sourceFileName: '中医内科学题1 .txt', subjectId: 'subject-f8eb0c1c1d57', subjectName: '中医内科学' },
  { order: 3, sourceName: '中医基础理论题', sourceFileName: '中医基础理论题.txt', subjectId: 'subject-437640b320ee', subjectName: '中医基础理论' },
  { order: 4, sourceName: '中医外科学题', sourceFileName: '中医外科学题.txt', subjectId: 'subject-8fadaa1450e8', subjectName: '中医外科学' },
  { order: 5, sourceName: '中医妇科学题', sourceFileName: '中医妇科学题.txt', subjectId: 'subject-7d747b081087', subjectName: '中医妇科学' },
  { order: 6, sourceName: '中医诊断学题1', sourceFileName: '中医诊断学题1.txt', subjectId: 'subject-2a05fbb70d6a', subjectName: '中医诊断学' },
  { order: 7, sourceName: '中药学题', sourceFileName: '中药学题.txt', subjectId: 'subject-c7ee53845f8b', subjectName: '中药学' },
  { order: 8, sourceName: '方剂学提', sourceFileName: '方剂学提.txt', subjectId: 'subject-04ce7c00ab3a', subjectName: '方剂学' },
  { order: 9, sourceName: '西依诊断学题', sourceFileName: '西依诊断学题.txt', subjectId: 'subject-4aad384976f8', subjectName: '诊断学基础' },
  { order: 10, sourceName: '西医内科学题', sourceFileName: '西医内科学题.txt', subjectId: 'subject-0ceb3f008cc1', subjectName: '内科学' },
  { order: 11, sourceName: '针灸学题', sourceFileName: '针灸学题.txt', subjectId: 'subject-6506ca413a14', subjectName: '针灸学' },
]);

// 上一版与当前版的题目 ID、数量和题组结构相同，差异仅为正式显示名称。
export const LEGACY_COMPATIBLE_SUBJECT_BANK_VERSIONS = Object.freeze([
  'subject-txt-5c99dc87d7df90f3',
]);

const SUBJECT_BY_SOURCE_NAME = new Map(
  SUBJECT_SOURCE_METADATA.map(subject => [subject.sourceName, subject]),
);

export function getSubjectMetadata(sourceName) {
  const metadata = SUBJECT_BY_SOURCE_NAME.get(sourceName);
  if (!metadata) throw new Error(`没有为原始 TXT 建立科目映射：${sourceName}`);
  return metadata;
}
