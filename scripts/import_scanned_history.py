#!/usr/bin/env python3
"""Build the 2018-2022 question bank from locally generated OCR JSON.

The OCR JSON is produced by ocr_scanned_pdfs.py. This importer deliberately
fails on structural uncertainty instead of guessing answers or silently
publishing incomplete questions.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OCR_ROOT = ROOT / "tmp" / "pdf-ocr-final2"
HIGHRES_OCR_ROOT = ROOT / "tmp" / "pdf-ocr-highres"
LETTERS = "ABCDE"
OPTION_RE = re.compile(r"^([A-Fa-f])[.．、,，:：]\s*(.*)$")
NUMBER_RE = re.compile(r"^[（(]?([1-9]\d{0,2})[.．、,，]\s*(.*)$")
RANGE_RE = re.compile(
    r"[（(〈]?([1-9]\d{0,2})\s*[、～~至-]\s*([1-9]\d{0,2})[^0-9]{0,8}共用(题干|[各备]选答(?:案|秦)?)"
)
UNIT_RE = re.compile(r"第([一二三四])单元")
ANSWER_RE = re.compile(r"[答荅][案秦].*?([A-E])(?:\b|$)", re.IGNORECASE)
ANSWER_LINE_RE = re.compile(
    r"^(?:[&]|[0-9IL]{1,3}[.．、,，]?)?[〖【\[(（]*[答荅][案秦]",
    re.IGNORECASE,
)

BOILERPLATE = (
    "www.yidianbiji",
    "万题宝",
    "历年考题卷",
    "何必三更",
    "一点笔记",
    "2024中医医考",
    "真题",
)

EXPECTED = {
    2018: {"counts": [162], "global": False},
    2019: {"counts": [150, 150, 150, 150], "global": True},
    2020: {"counts": [150, 150, 150, 150], "global": True},
    2021: {"counts": [150, 150, 150, 126], "global": False},
    2022: {"counts": [150, 150, 150, 150], "global": True},
}

# Two OCR passes were compared. These entries were then read directly from the
# rendered source pages because one or more option labels crossed a column edge.
OPTION_REPAIRS = {
    (2018, 4): {"A": "肾", "B": "肺", "C": "肝", "D": "心", "E": "脾"},
    (2018, 103): {"A": "肺", "B": "肾", "C": "肝", "D": "心", "E": "脾"},
    (2018, 117): {"A": "怒", "B": "喜", "C": "悲", "D": "思", "E": "恐"},
    (2018, 147): {"A": "三七", "B": "地榆", "C": "槐花", "D": "仙鹤草", "E": "白茅根"},
    (2019, 80): {"A": "心、脾", "B": "肺、肾", "C": "肺、肝", "D": "心、肾", "E": "肝、胃"},
    (2019, 187): {"A": "木", "B": "火", "C": "土", "D": "金", "E": "水"},
    (2019, 305): {"A": "心、肺", "B": "肺、肾", "C": "心、肾", "D": "脾、肾", "E": "肺、脾"},
    (2019, 328): {"A": "心", "B": "肝", "C": "肺", "D": "脾", "E": "肾"},
    (2019, 336): {"A": "肺、脾", "B": "心、肾", "C": "肺、肾", "D": "脾、肾", "E": "心、肺"},
    (2019, 337): {"A": "心、肾", "B": "心、肺", "C": "肺、肾", "D": "脾、肾", "E": "肝、肾"},
    (2019, 370): {"A": "井", "B": "荥", "C": "输", "D": "经", "E": "合"},
    (2019, 415): {"A": "足三里、脾俞、太冲", "B": "命门、三阴交、足三里", "C": "关元、三阴交、血海", "D": "气海、三阴交、归来", "E": "关元、三阴交、肝俞"},
    (2019, 453): {"A": "火", "B": "风", "C": "气", "D": "郁结", "E": "虚"},
    (2020, 5): {"A": "肝", "B": "胆", "C": "筋", "D": "春季", "E": "长夏"},
    (2020, 6): {"A": "肝", "B": "心", "C": "脾", "D": "胆", "E": "肾"},
    (2020, 9): {"A": "肝", "B": "心", "C": "脾", "D": "肺", "E": "肾"},
    (2020, 13): {"A": "肝", "B": "心", "C": "脾", "D": "胃", "E": "肾"},
    (2020, 18): {"A": "神", "B": "魂", "C": "魄", "D": "意", "E": "志"},
    (2020, 99): {"A": "心", "B": "肝", "C": "脾", "D": "肺", "E": "肾"},
    (2020, 151): {"A": "心", "B": "肺", "C": "肝", "D": "肾", "E": "脾"},
    (2020, 306): {"A": "口", "B": "鼻", "C": "耳", "D": "目内眦", "E": "目外眦"},
    (2020, 334): {"A": "肺、脾", "B": "肝、肾", "C": "心、肾", "D": "肺、肾", "E": "肺、心"},
    (2020, 597): {"A": "心、脾", "B": "肝、脾", "C": "脾、胃", "D": "脾、肾", "E": "心、肝"},
    (2021, 22): {"A": "杏苏散", "B": "清燥救肺汤", "C": "桑杏汤", "D": "麦门冬汤", "E": "养阴清肺汤"},
    (2021, 31): {"A": "心", "B": "脾", "C": "肺", "D": "肝", "E": "肾"},
    (2021, 84): {"A": "肝", "B": "心", "C": "脾", "D": "肺", "E": "肾"},
    (2021, 145): {"A": "忧", "B": "思", "C": "悲", "D": "恐", "E": "惊"},
    (2021, 141): {"A": "肝", "B": "心", "C": "脾", "D": "肺", "E": "肾"},
    (2021, 302): {"A": "5寸", "B": "4寸", "C": "3寸", "D": "2寸", "E": "1寸"},
    (2021, 314): {"A": "肝", "B": "心", "C": "肺", "D": "肾", "E": "脾"},
    (2021, 360): {"A": "肝", "B": "心", "C": "脾", "D": "肺", "E": "肾"},
    (2021, 404): {"A": "枸杞、女贞子、山茱萸", "B": "知母、黄柏", "C": "当归、熟地黄、何首乌", "D": "炮附子、益智仁、葱白", "E": "党参、黄芪、白术"},
    (2021, 516): {"A": "肝", "B": "肾", "C": "脾", "D": "心", "E": "肺"},
    (2022, 29): {"A": "肝", "B": "肾", "C": "心", "D": "肺", "E": "脾"},
    (2022, 34): {"A": "黑", "B": "青", "C": "红", "D": "白", "E": "黄"},
    (2022, 38): {"A": "精", "B": "气", "C": "血", "D": "津液", "E": "神"},
    (2022, 90): {
        "A": "独活为“风药中之燥剂”，羌活则为“风药中之润剂”",
        "B": "羌活的解表力弱，独活的解表力强",
        "C": "羌活能够治疗阳明头痛，独活能够治疗少阳头痛",
        "D": "独活善于治疗下半身的寒湿痹痛，羌活善于治疗上半身的寒湿痹痛",
        "E": "独活既可治疗风寒表证，也可治疗风热表证",
    },
    (2022, 95): {"A": "怒", "B": "喜", "C": "思", "D": "悲", "E": "恐"},
    (2022, 127): {"A": "肝", "B": "心", "C": "脾", "D": "肺", "E": "肾"},
    (2022, 139): {"A": "怒", "B": "喜", "C": "忧", "D": "思", "E": "恐"},
    (2022, 463): {"A": "肝", "B": "心", "C": "胃", "D": "肺", "E": "肾"},
    (2022, 481): {"A": "内痔", "B": "息肉痔", "C": "锁肛痔", "D": "脱肛", "E": "肛裂"},
    (2022, 513): {"A": "蕲蛇", "B": "川乌", "C": "秦艽", "D": "防己", "E": "威灵仙"},
}

# These prompts were read directly from the rendered source pages after OCR
# dropped a question number, split a line at a column edge, or merged the
# prompt into the preceding option set.
PROMPT_REPAIRS = {
    (2018, 4): "下列各项，具有统血功能的是",
    (2019, 4): "为人体气血化生之源的脏是",
    (2019, 121): "“娇脏”是指",
    (2019, 122): "“刚脏”是指",
    (2019, 329): "与石淋的发病关系最为密切的病机是",
    (2019, 371): "用背俞穴治疗耳聋，应首选",
    (2019, 427): "患者泄泻腹痛，泻下急迫，粪色黄褐，气味臭秽，肛门灼热，烦热口渴，舌质红，苔黄腻，脉滑数。治疗应首选",
    (2019, 453): "外科辨肿，肿势平坦，根盘散漫，其成因是",
    (2020, 7): "五脏生理特点及临床意义正确的是",
    (2020, 10): "关于脾的生理功能正确的是",
    (2020, 13): "下列喜燥恶湿的脏腑是",
    (2020, 19): "气随津脱说明",
    (2020, 99): "主涎的是",
    (2020, 100): "主唾的是",
    (2021, 17): "针对“阳虚则寒”产生的虚寒证治疗应",
    (2021, 32): "口疮患儿心火上炎证应用",
    (2021, 55): "功能凉血退蒸，善治有汗骨蒸的药物是",
    (2021, 85): "气滞多见于以下哪几个脏腑",
    (2021, 303): "治疗膏淋实证，应首选",
    (2022, 9): "劳神过度，易伤",
    (2022, 16): "下列具有“致病广泛，变化多端”特点的是",
    (2022, 76): "竹叶石膏汤的组成中不含有的药物是",
    (2022, 86): "中医治疗血虚证时，常加入一定量的补气药，其根据是",
    (2022, 91): "下列不属于七情致病的一般规律的是",
    (2022, 94): "气机升降指的是",
    (2022, 96): "具有“喜润恶燥”生理特性的是",
    (2022, 139): "肺对应的五志是",
    (2022, 140): "肝对应的五志是",
    (2022, 453): "侏儒身高低于正常身高平均值的",
    (2022, 454): "子宫宫颈达到处女膜缘，咳嗽时容易脱出，属于",
    (2022, 582): "颈前一侧有一肿物柔韧而圆，随吞咽动作而上下移动。诊断为",
}

SHARED_STEM_REPAIRS = {
    "2021-U4-A3-094-095": "患者，女，58岁。无意间发觉右乳内肿块，无明显不适。检查触及乳房内2cm大小肿块，质地坚硬，表面高低不平，推之不动，与皮肤粘连。诊断为乳岩。经手术和放化疗后食欲不振，神疲倦怠，恶心呕吐，肢肿倦怠；舌淡，苔薄，脉细弱。",
}

ANSWER_REPAIRS = {
    (2018, 12): "E",
    (2019, 72): "D",
    (2019, 268): "B",
    (2019, 578): "D",
    (2020, 133): "C",
    (2020, 134): "D",
    (2020, 135): "C",
    (2020, 136): "D",
    (2020, 137): "A",
    # The source answer line is blank, but the supplied paired explanation maps
    # question 107's "湿性趋下" to option D.
    (2020, 107): "D",
    # The source answer line is blank; its explanation explicitly requires 20%
    # mannitol, which is option C on the supplied question page.
    (2020, 505): "C",
    (2021, 9): "C",
    (2021, 555): "A",
}

ANSWER_EXPLANATION_REPAIRS = {
    (2020, 107): "湿性趋下，重浊黏腻，易袭阴位，多伤及人体下部。",
    (2020, 505): "流行性乙型脑炎患者出现瞳孔不等大、呼吸不规则，提示颅内压增高、出现脑疝，应立即应用20%甘露醇快速静脉滴注，降低颅内压。",
}

# The supplied 2022 question page prints only A-D for question 75. It is kept
# out of the bank rather than inventing an E option.
SOURCE_EXCLUSIONS = {
    (2022, 75): "原题页仅有A-D四个选项，结构不完整",
    (2022, 509): "原题页只印有选项，缺少题号和题干",
    (2022, 514): "原题页只印有选项，缺少题号和题干",
}


def sanitize_source_text(text: str) -> str:
    """Remove OCR fragments from recurring page headers, footers and watermarks."""
    if not text:
        return ""
    patterns = (
        r"[<〈,，]?第[^>〉,，。]{0,8}页[>〉冫)]?",
        r"三更眠五更起",
        r"日曝十日寒",
        r"荀有悵",
        r"最兄羔",
        r"英过一",
        r"何必",
        r"万题(?:宝|之考真)?",
        r"万宝",
        r"一点笔记",
        r"www\.?yidianbiji",
        r"真20(?:18|19|20|21|22)",
        r"·20(?:18|19|20|21|22|2|精|全)",
    )
    earliest = len(text)
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            earliest = min(earliest, match.start())
    return text[:earliest].strip(" .．、,，;；:：·-—<〈>〉冫")


def clean_line(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"\s+", "", text)
    return text.strip()


def useful(text: str) -> bool:
    lowered = text.lower()
    return bool(text) and not any(marker.lower() in lowered for marker in BOILERPLATE)


def load_lines(year: int, kind: str) -> list[dict]:
    payload = json.loads(
        (OCR_ROOT / f"{year}-{kind}" / "ocr.json").read_text(encoding="utf-8")
    )
    result = []
    previous_tail_by_region: dict[tuple[int, int], list[str]] = {}
    for record in payload["records"]:
        region = (record["page"], record["column"])
        row = record.get("row", 1)
        duplicate_candidates = previous_tail_by_region.get(region, []) if row > 1 else []
        record_texts = []
        for line_number, raw in enumerate(record["lines"], 1):
            text = clean_line(raw)
            if useful(text):
                if line_number <= 5 and text in duplicate_candidates:
                    continue
                result.append(
                    {
                        "text": text,
                        "page": record["page"],
                        "column": record["column"],
                        "row": record.get("row", 1),
                        "line": line_number,
                    }
                )
                record_texts.append(text)
        previous_tail_by_region[region] = record_texts[-5:]
    return result


def expected_sequence(year: int) -> list[tuple[int | None, int, int]]:
    config = EXPECTED[year]
    result = []
    global_number = 0
    for unit, count in enumerate(config["counts"], 1):
        for local_number in range(1, count + 1):
            global_number += 1
            result.append((None if year == 2018 else unit, local_number, global_number))
    return result


def parse_leading_number(text: str) -> tuple[int, str] | None:
    normalized = text.upper()
    match = re.match(r"^[（(]?([0-9IL&]{1,3})[.．、,，]?\s*(.*)$", normalized)
    if not match or not any(character.isdigit() for character in match.group(1)):
        return None
    token = match.group(1).replace("I", "1").replace("L", "1").replace("&", "8")
    number = int(token)
    if not 1 <= number <= 600:
        return None
    return number, match.group(2)


def nearby_number(lines: list[dict], index: int) -> int | None:
    current = parse_leading_number(lines[index]["text"])
    if current and ANSWER_LINE_RE.search(lines[index]["text"]):
        return current[0]
    if index:
        previous = parse_leading_number(lines[index - 1]["text"])
        if previous and not previous[1].strip("〖〗【】()（）"):
            return previous[0]
    return None


def align_records(observed: list[dict], expected: list[tuple[int | None, int, int]], year: int):
    rows, columns = len(observed) + 1, len(expected) + 1
    costs = [[0] * columns for _ in range(rows)]
    steps = [[None] * columns for _ in range(rows)]
    for index in range(1, rows):
        costs[index][0] = index * 3
        steps[index][0] = "skip-observed"
    for index in range(1, columns):
        costs[0][index] = index * 3
        steps[0][index] = "skip-expected"

    for observed_index in range(1, rows):
        recognized = observed[observed_index - 1].get("recognizedNumber")
        for expected_index in range(1, columns):
            unit, local_number, global_number = expected[expected_index - 1]
            target = global_number if EXPECTED[year]["global"] else local_number
            match_cost = 1 if recognized is None else 0 if recognized == target else 2
            choices = (
                (costs[observed_index - 1][expected_index - 1] + match_cost, "match"),
                (costs[observed_index - 1][expected_index] + 3, "skip-observed"),
                (costs[observed_index][expected_index - 1] + 3, "skip-expected"),
            )
            costs[observed_index][expected_index], steps[observed_index][expected_index] = min(choices)

    mapping = [None] * len(expected)
    skipped = []
    observed_index, expected_index = len(observed), len(expected)
    while observed_index or expected_index:
        step = steps[observed_index][expected_index]
        if step == "match":
            mapping[expected_index - 1] = observed[observed_index - 1]
            observed_index -= 1
            expected_index -= 1
        elif step == "skip-observed":
            skipped.append(observed[observed_index - 1])
            observed_index -= 1
        else:
            expected_index -= 1
    return mapping, list(reversed(skipped))


def parse_answers(year: int) -> tuple[list[dict], list[dict]]:
    lines = load_lines(year, "answers")
    raw = []
    pending_context: list[str] = []
    for index, line in enumerate(lines):
        text = line["text"].upper()
        if not ANSWER_LINE_RE.search(text):
            pending_context.append(line["text"])
            continue
        match = ANSWER_RE.search(text)
        raw.append(
            {
                "recognizedNumber": nearby_number(lines, index),
                "answer": match.group(1) if match else None,
                "context": pending_context,
                "source": {key: line[key] for key in ("page", "column", "row", "line")},
                "explanation": [],
            }
        )
        pending_context = []

    # Text preceding an answer belongs to the prior answer's explanation.
    for index in range(1, len(raw)):
        raw[index - 1]["explanation"] = raw[index]["context"]
    if raw:
        raw[-1]["explanation"] = pending_context

    expected = expected_sequence(year)
    issues = []
    if len(raw) != len(expected):
        issues.append(
            {
                "kind": "answer-count",
                "expected": len(expected),
                "actual": len(raw),
            }
        )

    aligned, skipped = align_records(raw, expected, year)
    for item in skipped:
        issues.append({"kind": "extra-answer-entry", "source": item["source"]})

    answers = []
    for index, (unit, number, global_number) in enumerate(expected):
        item = aligned[index]
        if item is None:
            issues.append({"kind": "missing-answer-entry", "globalNumber": global_number})
            continue
        if not item["answer"] or item["answer"] not in LETTERS:
            issues.append(
                {
                    "kind": "missing-answer-letter",
                    "globalNumber": global_number,
                    "recognizedNumber": item["recognizedNumber"],
                    "source": item["source"],
                }
            )
        answers.append(
            {
                "unit": unit,
                "number": number,
                "globalNumber": global_number,
                "answer": item["answer"],
                "explanation": "".join(item["explanation"]).strip("〖〗【】解析:："),
                "source": item["source"],
                "recognizedNumber": item["recognizedNumber"],
            }
        )
    return answers, issues


@dataclass
class OptionSet:
    context: list[dict]
    options: dict[str, list[str]] = field(default_factory=dict)
    source: dict | None = None
    after_context: list[dict] = field(default_factory=list)

    def normalized_options(self) -> dict[str, str]:
        return {letter: "".join(self.options.get(letter, [])).strip() for letter in LETTERS}

    def recognized_number(self) -> int | None:
        for line in reversed(self.context):
            range_match = RANGE_RE.search(line["text"])
            if range_match:
                return int(range_match.group(1))
            parsed = parse_leading_number(line["text"])
            if parsed:
                return parsed[0]
        return None


@dataclass(frozen=True)
class SetSpec:
    unit: int | None
    question_numbers: tuple[int, ...]
    global_numbers: tuple[int, ...]
    type: str
    group_id: str | None = None

    @property
    def first_local(self) -> int:
        return self.question_numbers[0]

    @property
    def first_global(self) -> int:
        return self.global_numbers[0]


def set_specs(year: int) -> list[SetSpec]:
    specs: list[SetSpec] = []

    def add_single(unit: int | None, local_number: int, global_number: int, kind: str, group_id=None):
        specs.append(SetSpec(unit, (local_number,), (global_number,), kind, group_id))

    def add_b1(unit: int | None, local_start: int, local_end: int, global_start: int):
        cursor = local_start
        while cursor <= local_end:
            size = 3 if year == 2021 and unit == 1 and cursor == 116 else 2
            local_numbers = tuple(range(cursor, min(cursor + size - 1, local_end) + 1))
            global_numbers = tuple(global_start + number - local_start for number in local_numbers)
            group_id = f"{year}-U{unit or 0}-B1-{local_numbers[0]:03d}-{local_numbers[-1]:03d}"
            specs.append(SetSpec(unit, local_numbers, global_numbers, "B1", group_id))
            cursor += size

    if year == 2018:
        for number in range(1, 92):
            add_single(None, number, number, "A1/A2")
        for start, end in ((92, 94), (95, 97), (98, 100)):
            group_id = f"2018-U0-A3-{start:03d}-{end:03d}"
            for number in range(start, end + 1):
                add_single(None, number, number, "A3", group_id)
        add_b1(None, 101, 162, 101)
        return specs

    type_ranges = {
        2019: {
            1: (120, None, 121, 150), 2: (120, None, 121, 150),
            3: (120, None, 121, 150), 4: (120, None, 121, 150),
        },
        2020: {
            1: (96, None, 97, 150), 2: (88, None, 89, 150),
            3: (120, None, 121, 150), 4: (106, None, 107, 150),
        },
        2021: {
            1: (107, None, 108, 150), 2: (112, (113, 118), 119, 150),
            3: (98, (99, 110), 111, 150), 4: (87, (88, 98), 99, 126),
        },
        2022: {
            1: (112, None, 113, 150), 2: (118, (119, 124), 125, 150),
            3: (79, (80, 112), 113, 150), 4: (94, (95, 124), 125, 150),
        },
    }[year]

    explicit_a3_groups = {
        # The 2021 source uses two-question A3 groups in unit 2 and one
        # two-question group in unit 4; treating every group as three questions
        # would attach the wrong shared stem and split real groups.
        (2021, 2): ((113, 114), (115, 116), (117, 118)),
        (2021, 3): ((99, 101), (102, 104), (105, 107), (108, 110)),
        (2021, 4): ((88, 90), (91, 93), (94, 95), (96, 98)),
    }

    global_offset = 0
    for unit, count in enumerate(EXPECTED[year]["counts"], 1):
        a12_end, a3_range, b1_start, b1_end = type_ranges[unit]
        for local_number in range(1, a12_end + 1):
            add_single(unit, local_number, global_offset + local_number, "A1/A2")
        if a3_range:
            start, end = a3_range
            groups = explicit_a3_groups.get(
                (year, unit),
                tuple((group_start, min(group_start + 2, end)) for group_start in range(start, end + 1, 3)),
            )
            for group_start, group_end in groups:
                group_id = f"{year}-U{unit}-A3-{group_start:03d}-{group_end:03d}"
                for local_number in range(group_start, group_end + 1):
                    add_single(unit, local_number, global_offset + local_number, "A3", group_id)
        add_b1(unit, b1_start, b1_end, global_offset + b1_start)
        global_offset += count
    return specs


def align_option_sets(year: int, observed: list[OptionSet]):
    specs = set_specs(year)
    records = [
        {"record": item, "recognizedNumber": item.recognized_number()}
        for item in observed
    ]
    expected = [(spec.unit, spec.first_local, spec.first_global) for spec in specs]
    aligned_wrapped, skipped_wrapped = align_records(records, expected, year)
    return (
        [(spec, wrapped["record"] if wrapped else None) for spec, wrapped in zip(specs, aligned_wrapped)],
        [wrapped["record"] for wrapped in skipped_wrapped],
    )


def source_snapshot(year: int, root: Path):
    global OCR_ROOT
    previous = OCR_ROOT
    OCR_ROOT = root
    try:
        answers, answer_issues = parse_answers(year)
        option_sets, option_issues = extract_option_sets(year)
        aligned_sets, skipped_sets = align_option_sets(year, option_sets)
    finally:
        OCR_ROOT = previous
    return answers, answer_issues, aligned_sets, option_issues, skipped_sets


def text_target(year: int, spec: SetSpec, local_number: int | None = None) -> int:
    if EXPECTED[year]["global"]:
        if local_number is None:
            return spec.first_global
        return spec.first_global + local_number - spec.first_local
    return local_number if local_number is not None else spec.first_local


def content_lines(lines: list[dict]) -> list[str]:
    result = []
    for line in lines:
        text = line["text"]
        if (
            UNIT_RE.search(text)
            or RANGE_RE.search(text)
            or "型题" in text
            or re.search(r"[〈<]第?\d+页[〉>]", text)
            or any(marker.lower() in text.lower() for marker in BOILERPLATE)
        ):
            continue
        result.append(text)
    return result


def prompt_from_context(year: int, spec: SetSpec, item: OptionSet | None) -> str:
    if item is None:
        return ""
    target = text_target(year, spec)
    for index in range(len(item.context) - 1, -1, -1):
        parsed = parse_leading_number(item.context[index]["text"])
        if parsed and parsed[0] == target:
            tail = [parsed[1], *content_lines(item.context[index + 1 :])]
            return "".join(part for part in tail if part).strip(".．、,，:：")
    candidates = content_lines(item.context)
    return "".join(candidates[-3:]).strip(".．、,，:：")


def shared_stem_from_context(year: int, spec: SetSpec, item: OptionSet | None) -> str:
    if item is None:
        return ""
    target = text_target(year, spec)
    number_index = None
    for index, line in enumerate(item.context):
        if "共用题干" in line["text"] or RANGE_RE.search(line["text"]):
            continue
        parsed = parse_leading_number(line["text"])
        if parsed and parsed[0] == target:
            number_index = index
            break
    if number_index is None:
        return ""
    prefix = item.context[:number_index]
    marker_index = None
    for index, line in enumerate(prefix):
        if "共用题干" in line["text"]:
            marker_index = index
    if marker_index is None:
        return ""
    first = prefix[marker_index]["text"]
    first = re.sub(r"^.*?共用题干[：:]?", "", first)
    remainder = [first, *content_lines(prefix[marker_index + 1 :])]
    shared = "".join(part for part in remainder if part).strip(".．、,，:：")
    return re.sub(r"^[)）]+", "", shared)


def b1_prompts(year: int, spec: SetSpec, item: OptionSet | None) -> dict[int, str]:
    if item is None:
        return {}
    result = {}
    lines = item.after_context
    for local_number in spec.question_numbers:
        target = text_target(year, spec, local_number)
        for index, line in enumerate(lines):
            parsed = parse_leading_number(line["text"])
            if not parsed or parsed[0] != target:
                continue
            parts = [parsed[1]]
            for following in lines[index + 1 :]:
                if parse_leading_number(following["text"]) or RANGE_RE.search(following["text"]):
                    break
                if option_marker(following["text"]):
                    break
                parts.extend(content_lines([following]))
            result[local_number] = "".join(parts).strip(".．、,，:：")
            break
    return result


def choose_text(low: str, high: str) -> tuple[str, float | None]:
    low = sanitize_source_text(low)
    high = sanitize_source_text(high)
    if not low:
        return high, None
    if not high:
        return low, None
    ratio = SequenceMatcher(None, low, high).ratio()
    # The 200-DPI pass has fewer duplicated boundary lines; use it as primary.
    return low, ratio


def fused_answer_map(year: int, low_answers: list[dict], high_answers: list[dict]):
    low_by_number = {item["globalNumber"]: item for item in low_answers}
    high_by_number = {item["globalNumber"]: item for item in high_answers}
    result = {}
    conflicts = []
    for unit, local_number, global_number in expected_sequence(year):
        low = low_by_number.get(global_number)
        high = high_by_number.get(global_number)
        low_answer = low.get("answer") if low else None
        high_answer = high.get("answer") if high else None
        repair = ANSWER_REPAIRS.get((year, global_number))
        if repair:
            answer = repair
        elif low_answer and high_answer and low_answer in LETTERS and high_answer in LETTERS and low_answer != high_answer:
            conflicts.append(global_number)
            answer = None
        else:
            answer = low_answer if low_answer and low_answer in LETTERS else high_answer if high_answer and high_answer in LETTERS else None
        explanation = ANSWER_EXPLANATION_REPAIRS.get((year, global_number), "")
        if not explanation:
            explanation = (low or {}).get("explanation") or (high or {}).get("explanation") or ""
        explanation = sanitize_source_text(explanation)
        result[global_number] = {"answer": answer, "explanation": explanation or "原文件未提供解析。"}
    return result, conflicts


def build_year(year: int):
    low = source_snapshot(year, ROOT / "tmp" / "pdf-ocr-final2")
    high = source_snapshot(year, HIGHRES_OCR_ROOT)
    answers, answer_conflicts = fused_answer_map(year, low[0], high[0])
    low_sets, high_sets = low[2], high[2]
    questions = []
    excluded = []
    ocr_disagreements = []
    shared_stems = {}

    for (spec, low_item), (_, high_item) in zip(low_sets, high_sets):
        repair = OPTION_REPAIRS.get((year, spec.first_global))
        low_options = low_item.normalized_options() if low_item else {}
        high_options = high_item.normalized_options() if high_item else {}
        options = {}
        for letter in LETTERS:
            if repair:
                options[letter] = repair[letter]
                continue
            value, ratio = choose_text(low_options.get(letter, ""), high_options.get(letter, ""))
            options[letter] = value
            if ratio is not None and ratio < 0.72:
                ocr_disagreements.append({"globalNumber": spec.first_global, "field": f"option-{letter}", "ratio": round(ratio, 3)})

        if any(not options[letter] for letter in LETTERS):
            for global_number in spec.global_numbers:
                excluded.append({"globalNumber": global_number, "reason": "选项结构无法闭合"})
            continue

        low_prompt = prompt_from_context(year, spec, low_item)
        high_prompt = prompt_from_context(year, spec, high_item)
        prompt, prompt_ratio = choose_text(low_prompt, high_prompt)
        if prompt_ratio is not None and prompt_ratio < 0.65:
            ocr_disagreements.append({"globalNumber": spec.first_global, "field": "prompt", "ratio": round(prompt_ratio, 3)})

        if spec.type == "A3" and spec.group_id not in shared_stems:
            low_shared = shared_stem_from_context(year, spec, low_item)
            high_shared = shared_stem_from_context(year, spec, high_item)
            shared_stems[spec.group_id] = SHARED_STEM_REPAIRS.get(
                spec.group_id,
                choose_text(low_shared, high_shared)[0],
            )

        low_b1 = b1_prompts(year, spec, low_item) if spec.type == "B1" else {}
        high_b1 = b1_prompts(year, spec, high_item) if spec.type == "B1" else {}

        for offset, (local_number, global_number) in enumerate(zip(spec.question_numbers, spec.global_numbers)):
            exclusion = SOURCE_EXCLUSIONS.get((year, global_number))
            if exclusion:
                excluded.append({"globalNumber": global_number, "reason": exclusion})
                continue
            if spec.type == "B1":
                prompt = choose_text(low_b1.get(local_number, ""), high_b1.get(local_number, ""))[0]
            elif offset:
                # A3 has one option set per question, so this branch is normally unused.
                prompt = prompt_from_context(year, spec, low_item) or prompt_from_context(year, spec, high_item)
            prompt = PROMPT_REPAIRS.get((year, global_number), prompt)
            if not prompt:
                excluded.append({"globalNumber": global_number, "reason": "题干无法可靠识别"})
                continue
            answer_data = answers[global_number]
            if not answer_data["answer"] or answer_data["answer"] not in LETTERS:
                excluded.append({"globalNumber": global_number, "reason": "答案字母无法可靠对应"})
                continue

            unit = spec.unit or 0
            question = {
                "id": f"{year}-U{unit}-{local_number:03d}",
                "unit": unit,
                "number": local_number,
                "type": spec.type,
                "stem": prompt,
                "options": options,
                "answer": answer_data["answer"],
                "explanation": answer_data["explanation"],
            }
            if spec.type == "A3":
                shared = shared_stems.get(spec.group_id, "")
                if not shared:
                    excluded.append({"globalNumber": global_number, "reason": "A3共用题干无法可靠识别"})
                    continue
                group_match = re.search(r"-(\d{3})-(\d{3})$", spec.group_id or "")
                group_start = int(group_match.group(1)) if group_match else local_number
                group_end = int(group_match.group(2)) if group_match else local_number
                question.update(
                    {
                        "stem": f"{shared} {prompt}".strip(),
                        "prompt": prompt,
                        "sharedStem": shared,
                        "groupId": spec.group_id,
                        "groupStart": group_start,
                        "groupEnd": group_end,
                    }
                )
            elif spec.type == "B1":
                question.update(
                    {
                        "prompt": prompt,
                        "sharedOptions": options,
                        "groupId": spec.group_id,
                        "groupStart": spec.question_numbers[0],
                        "groupEnd": spec.question_numbers[-1],
                    }
                )
            questions.append(question)

    return questions, {
        "sourceQuestionCount": len(expected_sequence(year)),
        "builtQuestionCount": len(questions),
        "excluded": excluded,
        "answerConflicts": answer_conflicts,
        "ocrDisagreementCount": len(ocr_disagreements),
        "ocrDisagreements": ocr_disagreements,
    }


def normalized_question_key(question: dict) -> str:
    combined = question["stem"] + "".join(question["options"].get(letter, "") for letter in LETTERS)
    return re.sub(r"[^0-9A-Za-z\u3400-\u9fff]", "", unicodedata.normalize("NFKC", combined)).lower()


def load_generated_array(path: Path, export_name: str) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    marker = f"export const {export_name} = "
    start = text.index(marker) + len(marker)
    return json.JSONDecoder().raw_decode(text[start:])[0]


def build_output(output: Path) -> dict:
    existing = [
        *load_generated_array(ROOT / "js" / "questions-2024.js", "QUESTIONS_2024"),
        *load_generated_array(ROOT / "js" / "questions-2023.js", "QUESTIONS_2023"),
    ]
    seen = {normalized_question_key(question): question["id"] for question in existing}
    combined = []
    generated_by_year = {}
    per_year = {}
    removed_duplicates = []
    for year in range(2018, 2023):
        questions, stats = build_year(year)
        added = []
        for question in questions:
            key = normalized_question_key(question)
            duplicate_of = seen.get(key)
            if duplicate_of:
                removed_duplicates.append({"id": question["id"], "duplicateOf": duplicate_of})
                continue
            seen[key] = question["id"]
            added.append(question)
            combined.append(question)
        stats["addedAfterDedup"] = len(added)
        stats["removedAsDuplicates"] = len(questions) - len(added)
        per_year[str(year)] = stats
        generated_by_year[year] = added

    sources = [
        "考题2018-精选.1.pdf", "考题2018年答案-解析.pdf",
        "考题2019-全集.pdf", "考题2019年答案-解析.pdf",
        "考题2020-全集.pdf", "考题2020年答案-解析.pdf",
        "考题2021-精选.pdf", "考题2021年答案-解析.pdf",
        "考题2022-全集.pdf", "考题2022年答案-解析.pdf",
    ]
    stats = {
        "sourceQuestionCount": sum(len(expected_sequence(year)) for year in range(2018, 2023)),
        "builtBeforeDedup": sum(item["builtQuestionCount"] for item in per_year.values()),
        "addedQuestionCount": len(combined),
        "removedDuplicateCount": len(removed_duplicates),
        "removedDuplicates": removed_duplicates,
        "perYear": per_year,
    }
    imports = []
    arrays = []
    for year, questions in generated_by_year.items():
        export_name = f"QUESTIONS_{year}"
        part_path = output.with_name(f"questions-{year}.js")
        part_path.write_text(
            "// 此文件由 scripts/import_scanned_history.py 生成，请勿手工编辑。\n"
            f"export const {export_name} = {json.dumps(questions, ensure_ascii=False, separators=(',', ':'))};\n",
            encoding="utf-8",
        )
        imports.append(f"import {{ {export_name} }} from './questions-{year}.js';")
        arrays.append(f"...{export_name}")
    output.write_text(
        "// 此文件由 scripts/import_scanned_history.py 生成，请勿手工编辑。\n"
        + "\n".join(imports)
        + "\n"
        + f"export const QUESTION_BANK_2018_2022_SOURCES = {json.dumps(sources, ensure_ascii=False, separators=(',', ':'))};\n"
        + f"export const QUESTION_BANK_2018_2022_STATS = {json.dumps(stats, ensure_ascii=False, separators=(',', ':'))};\n"
        + f"export const QUESTIONS_2018_2022 = [{','.join(arrays)}];\n",
        encoding="utf-8",
    )
    return stats


def option_marker(text: str) -> tuple[str, str] | None:
    match = OPTION_RE.match(text)
    if not match:
        return None
    letter = match.group(1).upper()
    return ("E" if letter == "F" else letter, match.group(2))


def extract_option_sets(year: int) -> tuple[list[OptionSet], list[dict]]:
    lines = load_lines(year, "questions")
    sets: list[OptionSet] = []
    issues: list[dict] = []
    context: list[dict] = []
    current: OptionSet | None = None
    current_letter: str | None = None

    def close_current() -> None:
        nonlocal current, current_letter, context
        if current is None:
            return
        missing = [letter for letter in LETTERS if not current.options.get(letter)]
        if missing:
            issues.append(
                {
                    "kind": "incomplete-options",
                    "set": len(sets) + 1,
                    "missing": missing,
                    "source": current.source,
                }
            )
        sets.append(current)
        current = None
        current_letter = None
        context = []

    for line in lines:
        marker = option_marker(line["text"])
        if marker:
            letter, body = marker
            if letter == "A":
                if current is not None:
                    close_current()
                if sets:
                    sets[-1].after_context = list(context)
                current = OptionSet(context=context, source={key: line[key] for key in ("page", "column", "row", "line")})
                context = []
                current.options["A"] = [body]
                current_letter = "A"
                continue
            if current is None:
                # A was misread. The line immediately before B is normally A's text.
                if sets:
                    sets[-1].after_context = list(context)
                a_text = context[-1]["text"] if context else ""
                stem_context = context[:-1] if context else []
                current = OptionSet(context=stem_context, source={key: line[key] for key in ("page", "column", "row", "line")})
                current.options["A"] = [a_text]
                current_letter = "A"
                context = []
            previous_index = LETTERS.index(current_letter) if current_letter in LETTERS else -1
            target_index = LETTERS.index(letter)
            if target_index <= previous_index:
                close_current()
                a_text = context[-1]["text"] if context else ""
                current = OptionSet(context=context[:-1], source={key: line[key] for key in ("page", "column", "row", "line")})
                current.options["A"] = [a_text]
                current_letter = "A"
                previous_index = 0
            gap = target_index - previous_index
            if gap > 1:
                previous_lines = current.options[current_letter]
                for missing_index in range(previous_index + 1, target_index):
                    missing_letter = LETTERS[missing_index]
                    if len(previous_lines) > 1:
                        current.options[missing_letter] = [previous_lines.pop()]
                    else:
                        current.options[missing_letter] = [""]
            current.options[letter] = [body]
            current_letter = letter
            if letter == "E":
                close_current()
            continue

        # Unit/type/range/question markers after E begin the next context.
        structural = bool(
            UNIT_RE.search(line["text"])
            or RANGE_RE.search(line["text"])
            or NUMBER_RE.match(line["text"])
            or "型题" in line["text"]
            or "共用题干" in line["text"]
        )
        if current is not None:
            current.options[current_letter].append(line["text"])
        else:
            context.append(line)
    close_current()
    if sets:
        sets[-1].after_context = list(context)
    return sets, issues


def diagnostic(year: int) -> dict:
    answers, answer_issues = parse_answers(year)
    option_sets, option_issues = extract_option_sets(year)
    aligned_sets, skipped_sets = align_option_sets(year, option_sets)
    return {
        "year": year,
        "expectedQuestions": len(expected_sequence(year)),
        "answerEntries": len(answers),
        "answerIssues": answer_issues,
        "optionSets": len(option_sets),
        "expectedOptionSets": len(aligned_sets),
        "missingOptionSets": sum(item is None for _, item in aligned_sets),
        "skippedOptionSets": len(skipped_sets),
        "completeOptionSets": sum(
            all(item.normalized_options().get(letter) for letter in LETTERS)
            for item in option_sets
        ),
        "optionIssues": option_issues,
        "optionSourcePages": Counter(item.source["page"] for item in option_sets if item.source),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, choices=range(2018, 2023))
    parser.add_argument("--report", type=Path)
    parser.add_argument("--build", type=Path)
    args = parser.parse_args()
    years = [args.year] if args.year else list(range(2018, 2023))
    if args.build:
        stats = build_output(args.build)
        print(json.dumps(stats, ensure_ascii=False, indent=2))
        return
    reports = [diagnostic(year) for year in years]
    serializable = json.loads(json.dumps(reports, ensure_ascii=False, default=dict))
    text = json.dumps(serializable, ensure_ascii=False, indent=2)
    if args.report:
        args.report.write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
