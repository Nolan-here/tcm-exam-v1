#!/usr/bin/env python3
"""将 2023 年题干 Word 与答案解析 Word 合并为网页题库。

两个源文件只读。题干文档包含双栏和浮动文本框，XML 顺序与视觉顺序
并不完全一致；脚本按“单元 + 原题号”重建顺序，并对已核实的跨栏片段
进行显式修复。答案文档中缺失的 9 个答案字母来自同版 PDF 的逐页核验。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn


UNIT_RE = re.compile(r"^第([一二三四])单元$")
QUESTION_RE = re.compile(r"(?<![\dA-Za-z])([1-9]\d{0,2})[.．、](?!\d)")
OPTION_RE = re.compile(r"(?<![A-Za-z])([A-E])[.．、]\s*")
RANGE_RE = re.compile(
    r"[（(](\d{1,3})\s*[～~\-—]\s*(\d{1,3})\s*题共用(题干|备选答案)[）)]"
)
UNIT_MAP = {"一": 1, "二": 2, "三": 3, "四": 4}

BOILERPLATE = (
    "www.yidianbiji.com",
    "万题宝",
    "历年考题卷",
    "2024中医医考",
    "何必三更眠",
    "何必三更起",
)

# 答案 Word 中以下题目只保留了解析，答案字母由同版
# 《考题2023+答案.pdf》逐页视觉核验补齐。
MISSING_ANSWER_REPAIRS = {
    1: {64: "A"},
    2: {37: "B", 95: "D", 115: "A"},
    4: {40: "A", 50: "D", 62: "D", 106: "C", 139: "D"},
}


def clean(text: str) -> str:
    text = text.replace("\u3000", " ")
    text = re.sub(r"\s+", " ", text).strip(" \n\r\t")
    return re.sub(r"\s*(?:A[l1]/A2|A3/A4|B1?)型选择题\s*$", "", text)


def is_boilerplate(text: str) -> bool:
    compact = re.sub(r"\s+", "", text)
    return any(re.sub(r"\s+", "", marker) in compact for marker in BOILERPLATE)


def own_text(paragraph, text_node) -> bool:
    node = text_node.getparent()
    while node is not None and node.tag != qn("w:p"):
        node = node.getparent()
    return node is paragraph


def raw_paragraphs(path: Path, *, filter_boilerplate: bool = True) -> list[str]:
    """读取正文、表格与浮动文本框中的所有独立段落。"""
    document = Document(path)
    result = []
    for paragraph in document.element.body.xpath(".//w:p"):
        text = "".join(
            node.text or ""
            for node in paragraph.xpath(".//w:t")
            if own_text(paragraph, node)
        ).strip()
        if text and (not filter_boilerplate or not is_boilerplate(text)):
            result.append(text)
    return result


def unit_chunks(paragraphs: list[str]) -> dict[int, str]:
    starts = [
        (index, UNIT_MAP[match.group(1)])
        for index, text in enumerate(paragraphs)
        if (match := UNIT_RE.fullmatch(clean(text)))
    ]
    if [unit for _, unit in starts] != [1, 2, 3, 4]:
        raise ValueError(f"单元标题异常：{starts}")
    result = {}
    for offset, (start, unit) in enumerate(starts):
        end = starts[offset + 1][0] if offset + 1 < len(starts) else len(paragraphs)
        result[unit] = "\n".join(paragraphs[start + 1 : end])
    return result


def split_option_chunks(text: str) -> list[dict[str, str]]:
    matches = list(OPTION_RE.finditer(text))
    if not matches:
        return []
    chunks: list[list] = []
    current = []
    previous = ""
    for match in matches:
        letter = match.group(1)
        if current and letter <= previous:
            chunks.append(current)
            current = []
        current.append(match)
        previous = letter
    if current:
        chunks.append(current)

    result = []
    for chunk_index, chunk in enumerate(chunks):
        options = {}
        for index, match in enumerate(chunk):
            if index + 1 < len(chunk):
                end = chunk[index + 1].start()
            elif chunk_index + 1 < len(chunks):
                end = chunks[chunk_index + 1][0].start()
            else:
                end = len(text)
            options[match.group(1)] = clean(text[match.end() : end])
        result.append(options)
    return result


def merge_options(*parts: dict[str, str]) -> dict[str, str]:
    merged = {}
    for part in parts:
        merged.update(part)
    return merged


def extract_ranges(chunk: str, questions: list[re.Match]) -> list[dict]:
    matches = list(RANGE_RE.finditer(chunk))
    ranges = []
    for index, match in enumerate(matches):
        next_question = next(
            (question for question in questions if question.start() > match.end()), None
        )
        stops = [len(chunk)]
        if next_question is not None:
            stops.append(next_question.start())
        if index + 1 < len(matches):
            stops.append(matches[index + 1].start())
        ranges.append(
            {
                "start": int(match.group(1)),
                "end": int(match.group(2)),
                "kind": match.group(3),
                "body": chunk[match.end() : min(stops)],
            }
        )
    return ranges


def extract_question_records(question_path: Path) -> list[dict]:
    chunks = unit_chunks(raw_paragraphs(question_path))
    all_questions = []
    raw_by_unit: dict[int, dict[int, dict]] = {}

    for unit, chunk in chunks.items():
        matches = [
            match
            for match in QUESTION_RE.finditer(chunk)
            if 1 <= int(match.group(1)) <= 150
        ]
        if len(matches) != 150 or len({int(match.group(1)) for match in matches}) != 150:
            raise ValueError(f"第 {unit} 单元题号不完整：共 {len(matches)} 个")
        ranges = extract_ranges(chunk, matches)
        shared_stems = {}
        shared_options = {}
        for item in ranges:
            kind = "A3" if item["kind"] == "题干" else "B1"
            group = {
                "id": f"2023-U{unit}-{kind}-{item['start']:03d}-{item['end']:03d}",
                "start": item["start"],
                "end": item["end"],
            }
            if item["kind"] == "题干":
                group["text"] = clean(item["body"])
                target = shared_stems
            else:
                chunks_found = split_option_chunks(item["body"])
                group["options"] = chunks_found[0] if chunks_found else {}
                target = shared_options
            for number in range(item["start"], item["end"] + 1):
                target[number] = group

        records = {}
        for index, match in enumerate(matches):
            number = int(match.group(1))
            end = matches[index + 1].start() if index + 1 < len(matches) else len(chunk)
            body = chunk[match.end() : end]
            range_match = RANGE_RE.search(body)
            if range_match:
                body = body[: range_match.start()]
            option_match = OPTION_RE.search(body)
            stem = clean(body[: option_match.start()] if option_match else body)
            records[number] = {
                "body": body,
                "stem": stem,
                "optionChunks": split_option_chunks(body),
                "sharedStemGroup": shared_stems.get(number),
                "sharedOptions": shared_options.get(number),
            }
        raw_by_unit[unit] = records

    apply_cross_column_repairs(raw_by_unit)

    for unit in range(1, 5):
        for number in range(1, 151):
            raw = raw_by_unit[unit][number]
            shared_stem_group = raw["sharedStemGroup"]
            shared_options_group = raw["sharedOptions"]
            options = (shared_options_group or {}).get("options") or raw.get("options")
            if options is None:
                options = raw["optionChunks"][0] if raw["optionChunks"] else {}
            shared_stem = (shared_stem_group or {}).get("text", "")
            question = {
                "id": f"2023-U{unit}-{number:03d}",
                "unit": unit,
                "number": number,
                "type": "B1" if shared_options_group else "A3" if shared_stem_group else "A1/A2",
                "stem": clean(f"{shared_stem} {raw['stem']}"),
                "options": {letter: clean(options.get(letter, "")) for letter in "ABCDE"},
            }
            group = shared_options_group or shared_stem_group
            if group:
                question.update(
                    {
                        "prompt": raw["stem"],
                        "groupId": group["id"],
                        "groupStart": group["start"],
                        "groupEnd": group["end"],
                    }
                )
                if shared_stem_group:
                    question["sharedStem"] = shared_stem
                else:
                    question["sharedOptions"] = {
                        letter: clean(options.get(letter, "")) for letter in "ABCDE"
                    }
            all_questions.append(question)
    return all_questions


def apply_cross_column_repairs(units: dict[int, dict[int, dict]]):
    """按已核对的题号修复浮动文本框造成的选项交叉。"""
    def chunk(unit: int, number: int, index: int) -> dict[str, str]:
        return units[unit][number]["optionChunks"][index]

    def select(options: dict[str, str], letters: str) -> dict[str, str]:
        return {letter: options[letter] for letter in letters}

    # 第一单元：68、83、91 题的选项被左右栏交叉。
    units[1][68]["options"] = chunk(1, 91, 1)
    units[1][83]["options"] = merge_options(chunk(1, 83, 0), chunk(1, 68, 0))
    units[1][91]["options"] = merge_options(chunk(1, 91, 0), chunk(1, 83, 1))

    # 第二单元：22、35、42 题的选项被左右栏交叉。
    units[2][22]["options"] = chunk(2, 42, 1)
    units[2][35]["options"] = chunk(2, 35, 0)
    units[2][42]["options"] = merge_options(chunk(2, 42, 0), chunk(2, 35, 1))

    # 第三单元：46、67、74 题的选项被左右栏交叉。
    units[3][46]["options"] = merge_options(chunk(3, 46, 0), chunk(3, 74, 1))
    units[3][67]["options"] = merge_options(
        select(chunk(3, 67, 0), "A"), chunk(3, 46, 1)
    )
    units[3][74]["options"] = merge_options(
        chunk(3, 74, 0), select(chunk(3, 67, 0), "DE")
    )

    # 第四单元：24 题 E 选项漏印句点；其余为左右栏交叉。
    q24 = dict(chunk(4, 24, 0))
    q24["E"] = "凉血地黄汤"
    units[4][24]["options"] = q24
    units[4][49]["options"] = chunk(4, 49, 0)
    units[4][64]["options"] = chunk(4, 49, 1)
    units[4][70]["options"] = merge_options(chunk(4, 70, 0), chunk(4, 64, 0))
    units[4][77]["options"] = merge_options(chunk(4, 77, 0), chunk(4, 96, 1))
    units[4][90]["options"] = merge_options(chunk(4, 90, 0), chunk(4, 77, 1))
    units[4][96]["options"] = chunk(4, 96, 0)


def answer_candidate(text: str) -> str | None:
    compact = re.sub(r"\s+", "", text)
    match = re.search(r"(?:答案(?:解析)?|案)[】\]]*[：:]?([A-E])", compact)
    if not match:
        match = re.match(r"^[【\[]?([A-E])(?:略|[。. ]|$)", compact)
    return match.group(1) if match else None


def find_missing_answer_anchor(paragraphs: list[str], number: int) -> int:
    pattern = re.compile(rf"^{number}\s*[.．、]\s*$")
    indexes = [index for index, text in enumerate(paragraphs) if pattern.match(clean(text))]
    if len(indexes) != 1:
        raise ValueError(f"缺失答案题 {number} 的题号锚点异常：{indexes}")
    return indexes[0]


def clean_explanation(text: str) -> str:
    text = clean(text)
    marker = re.search(r"[【\[]*\s*解\s*析\s*[】\]]*[：:]?\s*", text)
    if marker:
        text = text[marker.end() :]
    else:
        # 有些段落把“答案”和“解析”合并，先移除答案部分。
        text = re.sub(r"^.*?(?:答案(?:解析)?|案)[】\]]*[：:]?[A-E]", "", text)
    text = re.sub(r"(?:一点笔记|dianbiji\.com|www\.yidianbiji\.com).*", "", text)
    text = re.sub(r"\s*\d{1,3}\s*[.．、]\s*$", "", text)
    text = clean(text).strip("。 ")
    return f"{text}。" if text else "略。"


def extract_answer_records(answer_path: Path) -> dict[tuple[int, int], dict[str, str]]:
    chunks = unit_chunks(raw_paragraphs(answer_path, filter_boilerplate=False))
    result = {}
    for unit, chunk in chunks.items():
        paragraphs = [line for line in chunk.splitlines() if clean(line)]
        actual = [
            (index, answer)
            for index, text in enumerate(paragraphs)
            if (answer := answer_candidate(text))
        ]
        missing = MISSING_ANSWER_REPAIRS.get(unit, {})
        expected_actual = 150 - len(missing)
        if len(actual) != expected_actual:
            raise ValueError(
                f"第 {unit} 单元可读答案应为 {expected_actual} 个，实际 {len(actual)} 个"
            )

        anchors = []
        actual_index = 0
        for number in range(1, 151):
            if number in missing:
                anchor = find_missing_answer_anchor(paragraphs, number)
                anchors.append((number, anchor, missing[number]))
            else:
                anchor, answer = actual[actual_index]
                actual_index += 1
                anchors.append((number, anchor, answer))
        if [anchor for _, anchor, _ in anchors] != sorted(anchor for _, anchor, _ in anchors):
            raise ValueError(f"第 {unit} 单元答案锚点顺序异常")

        for index, (number, anchor, answer) in enumerate(anchors):
            end = anchors[index + 1][1] if index + 1 < len(anchors) else len(paragraphs)
            explanation = clean_explanation(" ".join(paragraphs[anchor:end]))
            result[(unit, number)] = {"answer": answer, "explanation": explanation}
    return result


def validate(questions: list[dict]) -> list[str]:
    errors = []
    if len(questions) != 600:
        errors.append(f"总题数应为 600，实际为 {len(questions)}")
    counts = Counter(question["unit"] for question in questions)
    if counts != Counter({1: 150, 2: 150, 3: 150, 4: 150}):
        errors.append(f"单元题数异常：{dict(sorted(counts.items()))}")
    for question in questions:
        missing = [letter for letter in "ABCDE" if not question["options"].get(letter)]
        if not question["stem"]:
            errors.append(f"{question['id']} 缺少题干")
        if missing:
            errors.append(f"{question['id']} 缺少选项 {','.join(missing)}")
        if question.get("answer") not in "ABCDE":
            errors.append(f"{question['id']} 缺少有效答案")
        if not question.get("explanation"):
            errors.append(f"{question['id']} 缺少解析")
    return errors


def normalize_for_duplicate(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).lower()
    return "".join(character for character in text if character.isalnum())


def read_existing_questions(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    match = re.search(
        r"export const QUESTIONS_2024 = (\[.*?\]);\nexport const EXAM_UNITS",
        text,
        re.S,
    )
    if not match:
        raise ValueError(f"无法读取现有题库：{path}")
    return json.loads(match.group(1))


def deduplicate(new_questions: list[dict], existing_questions: list[dict]):
    existing_stems = {
        normalize_for_duplicate(question["stem"]): question["id"]
        for question in existing_questions
    }
    seen_new = {}
    kept = []
    removed = []
    for question in new_questions:
        signature = normalize_for_duplicate(question["stem"])
        duplicate_of = existing_stems.get(signature) or seen_new.get(signature)
        if signature and duplicate_of:
            removed.append({"id": question["id"], "duplicateOf": duplicate_of})
            continue
        seen_new[signature] = question["id"]
        kept.append(question)

    # 只报告高相似候选，不自动删除，避免把同一知识点的不同题误删。
    near = []
    existing_pairs = [
        (question["id"], normalize_for_duplicate(question["stem"]))
        for question in existing_questions
    ]
    for question in kept:
        signature = normalize_for_duplicate(question["stem"])
        if len(signature) < 12:
            continue
        best_id = ""
        best_ratio = 0.0
        for existing_id, existing_signature in existing_pairs:
            if abs(len(signature) - len(existing_signature)) > max(8, len(signature) * 0.2):
                continue
            ratio = SequenceMatcher(None, signature, existing_signature).ratio()
            if ratio > best_ratio:
                best_ratio, best_id = ratio, existing_id
        if best_ratio >= 0.94:
            near.append(
                {"id": question["id"], "similarTo": best_id, "ratio": round(best_ratio, 4)}
            )
    return kept, removed, near


def write_javascript(
    path: Path,
    questions: list[dict],
    question_source: str,
    answer_source: str,
    removed: list[dict],
    near: list[dict],
):
    payload = json.dumps(questions, ensure_ascii=False, separators=(",", ":"))
    stats = {
        "sourceQuestionCount": 600,
        "addedQuestionCount": len(questions),
        "removedDuplicateCount": len(removed),
        "removedDuplicates": removed,
        "nearDuplicateCandidates": near,
    }
    text = (
        "// 此文件由 scripts/import_2023_docx.py 生成，请勿手工编辑。\n"
        f"export const QUESTION_BANK_2023_SOURCES = {json.dumps([question_source, answer_source], ensure_ascii=False)};\n"
        f"export const QUESTION_BANK_2023_STATS = {json.dumps(stats, ensure_ascii=False, separators=(',', ':'))};\n"
        f"export const QUESTIONS_2023 = {payload};\n"
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("question_source", type=Path)
    parser.add_argument("answer_source", type=Path)
    parser.add_argument("existing_bank", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--report-only", action="store_true")
    args = parser.parse_args()
    for source in (args.question_source, args.answer_source, args.existing_bank):
        if not source.is_file():
            print(f"找不到文件：{source}", file=sys.stderr)
            return 2

    questions = extract_question_records(args.question_source)
    answers = extract_answer_records(args.answer_source)
    for question in questions:
        answer = answers[(question["unit"], question["number"])]
        question.update(answer)

    errors = validate(questions)
    if errors:
        print(f"发现 {len(errors)} 个完整性问题：", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    existing = read_existing_questions(args.existing_bank)
    kept, removed, near = deduplicate(questions, existing)
    print("2023 源题：600；完整性验证：通过")
    print(f"与现有题库精确重复：{len(removed)}；去重后新增：{len(kept)}")
    print(f"高相似但未自动删除的候选：{len(near)}")
    for item in near:
        print(f"- {item['id']} ~ {item['similarTo']}：{item['ratio']}")
    if not args.report_only:
        write_javascript(
            args.output,
            kept,
            args.question_source.name,
            args.answer_source.name,
            removed,
            near,
        )
        print(f"已生成：{args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
