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
PADDLE_OCR_ROOT = ROOT / "tmp" / "pdf-ocr-paddle-v6"
LETTERS = "ABCDE"
OPTION_RE = re.compile(r"^([A-Fa-f])[.．、,，:：]\s*(.*)$")
NUMBER_RE = re.compile(r"^[（(]?([1-9]\d{0,2})[.．、,，]\s*(.*)$")
RANGE_RE = re.compile(
    r"[（(〈]?([1-9]\d{0,2})\s*[、～~至-]\s*([1-9]\d{0,2})[^0-9]{0,8}共用(题干|[各备]选答(?:案|秦)?)"
)
UNIT_RE = re.compile(r"第([一二三四])单元")
ANSWER_RE = re.compile(r"[答荅][案秦].*?([A-E])(?:\b|$)", re.IGNORECASE)
ANSWER_LINE_RE = re.compile(
    r"^(?:(?:[0-9IL&]{1,3})[.．、,，·一—-]?|[&·一—-])?[〖【\[(（]*[答荅][案秦]",
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
    (2019, 311): {"A": "活血化瘀，涤痰镇静", "B": "安神定志，祛痰降火", "C": "降火豁痰，安神宁心", "D": "镇心涤痰，泻肝清火", "E": "滋阴降火，安神定志"},
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
    (2021, 147): {"A": "阳中之阳", "B": "阳中之阴", "C": "阴中之阳", "D": "阴中之阴", "E": "阴中之至阴"},
    (2021, 211): {"A": "赔偿责任、补偿责任、刑事责任", "B": "经济责任、民事责任、刑事责任", "C": "行政赔偿、民事赔偿、刑事赔偿", "D": "行政责任、民事责任、刑事责任", "E": "民事责任、经济责任、刑事责任"},
    (2021, 141): {"A": "肝", "B": "心", "C": "脾", "D": "肺", "E": "肾"},
    (2021, 302): {"A": "5寸", "B": "4寸", "C": "3寸", "D": "2寸", "E": "1寸"},
    (2021, 314): {"A": "肝", "B": "心", "C": "肺", "D": "肾", "E": "脾"},
    (2021, 360): {"A": "肝", "B": "心", "C": "脾", "D": "肺", "E": "肾"},
    (2021, 404): {"A": "枸杞、女贞子、山茱萸", "B": "知母、黄柏", "C": "当归、熟地黄、何首乌", "D": "炮附子、益智仁、葱白", "E": "党参、黄芪、白术"},
    (2021, 427): {"A": "胸部病", "B": "咽喉病", "C": "神志病", "D": "腹部病", "E": "前阴病"},
    (2021, 435): {
        "A": "胃脘下俞、肺俞、脾俞、肾俞、太溪、三阴交、风市、阳陵泉、解溪",
        "B": "胃脘下俞、肺俞、脾俞、肾俞、太溪、三阴交、太渊、少府",
        "C": "胃脘下俞、肺俞、脾俞、肾俞、太溪、三阴交、复溜、太冲",
        "D": "胃脘下俞、肺俞、脾俞、肾俞、太溪、三阴交、内庭、地机",
        "E": "胃脘下俞、肺俞、脾俞、肾俞、太溪、三阴交、风池、曲池、血海",
    },
    (2021, 495): {
        "A": "发病迅速，其肿宣浮",
        "B": "患部多青紫，不红不热，肿势散漫，痛有定处，得温则缓",
        "C": "患部肿胀、水疱、脓疱、糜烂流滋、作痒",
        "D": "患部干燥、枯槁、皲裂、脱屑",
        "E": "发病迅速，来势猛急，患部红灼热，肿势皮薄光泽，疼痛剧烈，易化脓腐烂",
    },
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
    (2022, 591): {"A": "肺部听诊两肺呼吸音粗糙", "B": "喘息气促，喉间哮鸣音，胸闷咳嗽", "C": "以咳嗽、咯痰为主症", "D": "发热，咳嗽，痰壅，气喘", "E": "反复发作，发作时喘促气急、喉间哮鸣、呼吸困难、张口抬肩、摇身撷肚"},
    (2018, 107): {"A": "胃", "B": "小肠", "C": "大肠", "D": "膀胱", "E": "三焦"},
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
    (2021, 150): "气机内阻，失于外达是指",
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
    # 抗Sm抗体是系统性红斑狼疮经典检查中诊断特异性最高者；
    # 原答案B（抗双链DNA抗体）与题干“特异性最高”不符。
    (2021, 151): "C",
}

ANSWER_EXPLANATION_REPAIRS = {
    (2020, 107): "湿性趋下，重浊黏腻，易袭阴位，多伤及人体下部。",
    (2020, 505): "流行性乙型脑炎患者出现瞳孔不等大、呼吸不规则，提示颅内压增高、出现脑疝，应立即应用20%甘露醇快速静脉滴注，降低颅内压。",
    (2022, 595): "一期梅毒主要表现为疳疮（硬下疳），通常发生于不洁性交后2～4周，本题以3周左右为代表，故选B。",
    (2022, 596): "二期梅毒的杨梅疮通常在感染后7～10周出现，本题以8周左右为代表，故选D。",
    # The source's group boundary attaches its “略” marker after answer fusion,
    # so keep this verified replacement at the higher-priority layer.
    (2021, 150): "气机郁闭于内、不能向外宣达称为气闭，常见突然昏厥、牙关紧闭等；与气脱的外泄不固不同，故选E。（由AI查询）",
    # The source OCR merged question 531 and its explanation onto the end of
    # question 530.  Keep only question 530's complete source explanation.
    (2022, 530): "凡堕胎或小产连续发生3次或3次以上者，称为“滑胎”，亦称“数堕胎”“屡孕屡堕”。",
    # A page footer was fused onto the otherwise complete source explanation.
    (2019, 358): "足厥阴肝经循行经过喉咙之后，上入颃颡，连目系，上出额，与督脉会于巅，故选A。",
}

# The paired source PDFs contain no usable explanation for these questions.
# Answers were checked against official health guidance or university teaching
# materials before the concise review notes below were written.  The marker is
# intentionally visible to learners so source OCR and AI-supplemented content
# are never confused.
AI_EXPLANATION_REPAIRS = {
    (2019, 16): "慢性乙型肝炎普通干扰素治疗通常需较长疗程，历史题库按至少1年掌握；聚乙二醇干扰素常用疗程为48周，因此本题选D。需要结合现行指南和患者应答情况个体化处理。（由AI查询）",
    (2019, 30): "婴儿胃容量小、服药困难，中药汤剂宜适当浓缩并少量多次服用；1岁以内每剂通常煎取60～100mL，故选E。（由AI查询）",
    (2019, 33): "猩红热病初可见舌苔白、舌乳头红肿并突出，外观如草莓，称草莓舌；随后白苔脱落可呈杨梅舌，故选C。（由AI查询）",
    (2019, 83): "气的防御作用表现为护卫肌表、抵御外邪。患者素体气虚而易受外邪，且咳嗽无力、肢倦，核心是卫外功能减退，故选C。（由AI查询）",
    (2019, 85): "火邪性炎上、易扰心神并伤津，常见高热、心烦失眠、狂躁、口燥咽干、便秘尿赤等表现，与题干一致，故选D。（由AI查询）",
    (2019, 168): "肾综合征出血热发热期的典型“三痛”为头痛、腰痛、眼眶痛，故选D；全身酸痛可以出现，但不属于这一固定组合。（由AI查询）",
    (2019, 177): "点刺舌是舌乳头增生、肿胀并突起的表现，多提示脏腑热盛或血分热盛；其余选项分别更多反映筋脉、气血亏虚或风痰等变化，故选C。（由AI查询）",
    (2019, 202): "医院感染强调在医院内获得的感染。创伤或非生物性因子刺激所致炎症不属于感染；其余各项均属于医院感染定义所涵盖的情形，故选B。（由AI查询）",
    (2019, 262): "题干有慢性肝病表现、肝脾受累且ALT持续明显升高，按该历史试题使用的旧分类符合慢性活动性肝炎，故选B。现行临床通常改按病因、炎症活动度和纤维化程度评估。（由AI查询）",
    (2019, 263): "患者有瘙痒、粪色变浅和梗阻性黄疸表现，但影像学未见结石、肿瘤或肝外胆管扩张，提示肝内胆汁淤积，按历史题目分类选淤胆型肝炎D。（由AI查询）",
    (2019, 265): "霍乱潜伏期按5日掌握。密切接触者应接受检疫或医学观察，并依规定进行预防性处置；题目组合中以严格检疫5天并给予预防性服药最完整，故选C。（由AI查询）",
    (2019, 268): "叠氮脱氧胸苷即齐多夫定（AZT），属于核苷类逆转录酶抑制剂，可抑制HIV逆转录过程，故选B；其余药物不是该题所问的直接抗HIV药物。（由AI查询）",
    (2019, 269): "HIV主要经血液、性接触和母婴传播，不需要饮食或呼吸道隔离；应落实标准预防，对血液、体液、排泄物及受污染器械规范管理和消毒，故本题选D。（由AI查询）",
    (2019, 311): "狂证日久火盛耗伤阴液，可见狂躁渐减而烦躁、失眠等阴伤表现，治宜滋阴降火、安神定志，故选E。（由AI查询）",
    (2019, 435): "痉证邪壅经络多由风寒湿邪阻滞，筋脉失养而拘急，治宜祛风散寒、燥湿和营，代表方为羌活胜湿汤，故选A。（由AI查询）",
    (2019, 436): "肝经热盛可热极生风，出现高热、抽搐、项强等，治宜清肝潜阳、息风镇痉，代表方为羚角钩藤汤，故选D。（由AI查询）",
    (2022, 193): "原卷只写“爬山后出现心悸，引起休克”，缺少休克类型，题干信息本身不完整；按原卷答案A所考知识点，肾上腺素是过敏性休克首选药。复习时不应把所有爬山后休克都等同于过敏性休克。（由AI查询）",
    (2022, 311): "雷火灸以艾绒和药物制成雷火灸条，点燃后利用灸条的热力和药力施灸，分类上属于艾条灸，故选A。（由AI查询）",
    (2022, 321): "肩髎是手少阳三焦经腧穴；肩井属足少阳胆经，内关属手厥阴心包经，通里属手少阴心经，公孙属足太阴脾经，故选A。（由AI查询）",
    (2022, 339): "眩晕耳鸣、头目胀痛、急躁易怒、口苦、舌红苔黄、脉弦数符合肝阳上亢、风火上扰，治宜平肝潜阳、清热息风，首选天麻钩藤饮，故选A。（由AI查询）",
    (2022, 345): "支正为手太阳小肠经络穴，传统主治除肘臂痛、头项强痛外还包括疣证，因此本题选E。（由AI查询）",
    (2022, 464): "缺铁性贫血时体内贮存铁耗竭，血清铁和铁蛋白降低，总铁结合力升高，转铁蛋白饱和度下降；应按题目中符合这一组合的B项作答。（由AI查询）",
}

# The supplied 2021 answer book explicitly prints only “略” for these items.
# They are treated as missing explanations rather than meaningful source text.
AI_EXPLANATION_REPAIRS.update({
    (2021, 6): "心主血脉，饮食水谷精微化生为血还需心阳温煦推动，使血液呈赤色，传统概括为心有“化赤”作用，故选C。（由AI查询）",
    (2021, 18): "肝主藏血，既能贮藏血液，又能随人体动静调节各部位血量；活动时血行于经脉，休息时血归于肝，故选D。（由AI查询）",
    (2021, 37): "一贯煎由北沙参、麦冬、生地黄、当归身、枸杞子、川楝子组成，功在滋阴疏肝，故选B；方中用生地黄而非熟地黄。（由AI查询）",
    (2021, 43): "情志过极可使气机骤然闭塞、神机失用，气闭最突出的表现是突然昏厥、不省人事，故选B。（由AI查询）",
    (2021, 55): "地骨皮甘寒，能凉血除蒸、清肺降火，尤善治阴虚有汗的骨蒸潮热，故选C；牡丹皮更常用于无汗骨蒸。（由AI查询）",
    (2021, 56): "痄腮以耳垂为中心出现一侧或两侧腮部漫肿，边缘不清，触之柔韧并常伴疼痛，符合题干表现，故选B。（由AI查询）",
    (2021, 94): "郁李仁既能润肠通便，又能利水消肿、下气，传统还用于痰饮喘咳和虫积腹痛，题干所列功用最完整地对应B。（由AI查询）",
    (2021, 104): "起初鼻塞流涕、恶寒发热属表证，继而出现发热不解、口渴、尿黄、舌红苔黄、脉数等里热表现，说明表邪已入里，故选E。（由AI查询）",
    (2021, 110): "昼属阳，夜属阴；昼日之中上午阳气渐盛，属于阳中之阳，下午则为阳中之阴，故选A。（由AI查询）",
    (2021, 112): "湿热痢气机壅滞、腹痛里急后重，木香行气止痛，芍药和营缓急，两药相配可调气和血，故选B。（由AI查询）",
    (2021, 113): "寒湿痢以寒湿困脾、气机不畅为主，木香行气止痛，藿香芳香化湿、和中止呕，两药相配符合其治法，故选C。（由AI查询）",
    (2021, 119): "猩红热属于法定乙类传染病；鼠疫、霍乱属于甲类，麻风病属于丙类，故选C。（由AI查询）",
    (2021, 121): "桑菊饮主治风温初起、表热轻证。桑叶与菊花均能疏散风热、清利头目，共作君药，故选B。（由AI查询）",
    (2021, 131): "结脉的典型特点是脉来缓慢而有不规则间歇，止无定数，故选A；数而时止为促脉，止有定数为代脉。（由AI查询）",
    (2021, 133): "《突发公共卫生事件应急条例》规定，应急工作方针是“预防为主、常备不懈”，故选B。（由AI查询）",
    (2021, 134): "突发事件应急工作贯彻统一领导、分级负责、反应及时、措施果断、依靠科学、加强合作的原则，故选D。（由AI查询）",
    (2021, 141): "肾主水，依靠肾阳蒸腾和肾气气化调节水液的生成、输布与排泄，因此“蒸腾气化水液”对应肾，故选E。（由AI查询）",
    (2021, 142): "脾主运化，不仅运化水谷精微，也运化水液，将水液转输至全身，故选C。（由AI查询）",
    (2021, 143): "川贝母苦、甘、微寒，长于清热化痰、润肺止咳，并能散结消肿，适合肺虚久咳及燥咳，故选A。（由AI查询）",
    (2021, 144): "浙贝母苦寒，清热化痰之力较强，又善散结消痈，符合题干功效，故选B。（由AI查询）",
    (2021, 145): "七情制约关系中“喜胜悲”，适度的喜悦可缓解悲忧所致气消，故选C。（由AI查询）",
    (2021, 147): "按五脏阴阳属性，肾属水、居下焦，为阴中之阴；心属火，为阳中之阳，故本题选D。（由AI查询）",
    (2021, 149): "气虚发展至极，气不能内守而大量亡失，出现面色苍白、汗出不止、脉微欲绝等，称为气脱，故选D。（由AI查询）",
    (2021, 150): "气机郁闭于内、不能向外宣达称为气闭，常见突然昏厥、牙关紧闭等；与气脱的外泄不固不同，故选E。（由AI查询）",
    (2021, 151): "抗Sm抗体敏感度不高，但对系统性红斑狼疮具有很高诊断特异性，在本组选项中应选C；抗双链DNA抗体也较特异，并常用于结合病情活动和肾脏受累评估。（由AI查询）",
    (2021, 211): "卫生法律责任按性质分为行政责任、民事责任和刑事责任，分别对应行政违法、民事损害和犯罪行为的法律后果，故选D。（由AI查询）",
    (2021, 213): "国务院依据宪法和法律制定、用于行政管理的规范性文件称行政法规；部门和地方政府制定的通常称行政规章，故选B。（由AI查询）",
    (2021, 230): "长期坚守抗疫一线体现医师对患者和社会承担职责的责任感，以及献身医疗事业的事业感，故选A。（由AI查询）",
    (2021, 258): "患儿在腹痛腹泻后突发高热、剧烈头痛、频繁呕吐、烦躁和惊厥，提示菌痢引起严重全身中毒及神经系统表现，符合中毒型菌痢，故选E。（由AI查询）",
    (2021, 271): "潜伏期是病原体侵入机体后到首次出现临床症状前的时期，故选A。（由AI查询）",
    (2021, 272): "恢复期是主要症状和体征基本消失、机体功能逐渐恢复的阶段，故选D；症状再度出现属于复发或再燃。（由AI查询）",
    (2021, 273): "胰头部肿瘤压迫胆总管可引起进行性梗阻性黄疸，并常伴食欲下降和消瘦，故选C。（由AI查询）",
    (2021, 275): "3级肌力表示肢体能克服重力抬离床面，但不能抵抗外加阻力，故选C。（由AI查询）",
    (2021, 276): "4级肌力表示肢体能对抗一定阻力完成运动，但力量低于正常；正常肌力为5级，故选D。（由AI查询）",
    (2021, 277): "非复杂性尿路感染多由肠道菌群逆行感染引起，最常见病原体是大肠埃希菌，故选C。（由AI查询）",
    (2021, 283): "房颤伴快速心室率且合并心功能不全时，毛花苷C可增强心肌收缩并减慢房室结传导，从而控制心室率，故选A。（由AI查询）",
    (2021, 284): "三度房室传导阻滞应尽快评估临时或永久起搏治疗；异丙肾上腺素可在等待起搏时提高逸搏频率，题目所问药物选C。（由AI查询）",
    (2021, 289): "同侧一过性黑蒙、Horner综合征与对侧偏瘫组合提示同侧颈内动脉供血区缺血，符合颈内动脉闭塞综合征，故选A。（由AI查询）",
    (2021, 291): "处方药必须凭执业医师或执业助理医师处方调配、购买和使用，故选B。（由AI查询）",
    (2021, 293): "医疗用毒性药品每次处方或购用量不得超过二日极量，防止蓄积中毒和误用，故选A。（由AI查询）",
    (2021, 295): "QT间期从QRS波群起点延续至T波终点，代表心室除极与复极的总时间，故选E。（由AI查询）",
    (2021, 297): "乙型肝炎病毒主要经血液及其他含病毒体液传播，也可经母婴和性接触传播；在本组选项中“体液传播”概括最完整，故选A。（由AI查询）",
    (2021, 299): "二尖瓣关闭不全使收缩期血液反流入左心房，长期造成左心房和左心室容量负荷增加，X线可见两者增大，故选E。（由AI查询）",
})

AI_EXPLANATION_REPAIRS.update({
    (2021, 316): "肺痿病位在肺，肺津的生成输布与脾胃运化、肾气蒸化密切相关，因此病变常与脾、胃、肾相关，故选B。（由AI查询）",
    (2021, 327): "痿证肺热伤津治宜清热润燥、养阴生津；尺泽清肺热，大椎泄热，适合作为主穴之外的加穴，故选A。（由AI查询）",
    (2021, 331): "漏出液由静水压或胶体渗透压改变形成，蛋白和细胞成分少，比重通常低于1.018，黏蛋白试验阴性且不易自凝，故选B。（由AI查询）",
    (2021, 349): "少商属于手太阴肺经；少府、少冲、少海和通里均属于手少阴心经，故不属于心经的是A。（由AI查询）",
    (2021, 352): "合谷属手阳明大肠经，内庭属足阳明胃经，两者为手足同名的阳明经配穴，故体现同名经配穴法，选A。（由AI查询）",
    (2021, 373): "鱼虾诱发片状风团和剧痒属于风疹表现。神阙穴禁针，临床可在该处拔罐以疏风止痒，故选B。（由AI查询）",
    (2021, 374): "月经周期提前7天以上属月经先期，针灸以关元调冲任、三阴交调肝脾肾、血海调血为基本组合，故选B。（由AI查询）",
    (2021, 399): "心悸气短、劳则加重、自汗、面色㿠白、舌淡、脉细弱提示心气不足；题目按虚劳辨证，故为虚劳心气虚证，选B。（由AI查询）",
    (2021, 400): "虚劳心气虚证治宜益气养心，七福饮以人参、熟地、当归等补益气血、宁心安神，符合本证，故选A。（由AI查询）",
    (2021, 403): "头痛隐隐、面色少华、心悸失眠、劳则加重、舌淡脉细弱为血虚头痛，治宜养血滋阴、和络止痛，选加味四物汤D。（由AI查询）",
    (2021, 405): "久痫不愈伴神疲、心悸、失眠、纳呆便溏、面色苍白、舌淡脉弱，显示心脾两虚、气血不足，故选D。（由AI查询）",
    (2021, 406): "痫证心脾两虚治宜补益气血、健脾宁心。六君子汤健脾益气化痰，归脾汤益气补血养心，合用符合本证，故选E。（由AI查询）",
    (2021, 408): "久喘呼多吸少、动则喘甚并见汗出肢冷、跗肿、脉微弱，属肺肾两虚并肾阳衰惫，取肺俞、膏肓、肾俞、太渊、太溪、足三里、定喘以补肺肾、纳气平喘，故选C。（由AI查询）",
    (2021, 409): "本证肾阳虚衰、摄纳无权，配关元可温补元阳、固本纳气，故选D。（由AI查询）",
    (2021, 411): "肝火犯肺日久可灼伤肺津，出现咽燥口干时应配北沙参、麦冬、天花粉养阴生津、润肺止咳，故选C。（由AI查询）",
    (2021, 415): "十二经脉中手三阴经从胸走手，足三阴经从足走腹并在胸部与手三阴经相接，所以阴经与阴经交接于胸部，故选C。（由AI查询）",
    (2021, 417): "冷秘由阴寒积滞、阳气不运所致，治宜温里散寒、通便止痛，代表方为温脾汤，故选C。（由AI查询）",
    (2021, 418): "阳虚秘以脾肾阳虚、肠道传送无力为主，治宜温阳通便，济川煎温肾益精、润肠通便，故选B。（由AI查询）",
    (2021, 419): "梁丘为足阳明胃经郄穴，位于髌底外侧端上2寸，股外侧肌与股直肌肌腱之间，故选A。（由AI查询）",
    (2021, 421): "斑秃病变表浅且范围常较广，皮肤针叩刺可刺激局部经络、促进气血运行，属于常用针刺方法，故选C。（由AI查询）",
    (2021, 423): "肺俞为肺的背俞穴，位于第3胸椎棘突下，后正中线旁开1.5寸，故选C。（由AI查询）",
    (2021, 425): "外关是手少阳三焦经络穴，并为八脉交会穴之一、通阳维脉；题目问所属特定穴，故选络穴B。（由AI查询）",
    (2021, 427): "手三阴经均起于胸部并循行上肢，因此共同主治以胸部病证为代表；不同经脉还各有本脏及循行部位病证，故选A。（由AI查询）",
    (2021, 431): "黄疸的关键病机是湿邪壅阻中焦，脾胃运化失健，胆汁不循常道而外溢肌肤，选项E最符合。（由AI查询）",
    (2021, 433): "痰饮按停聚部位分类，饮停胃肠、肠间沥沥有声称痰饮；支饮在胸肺，悬饮在胁下，溢饮在四肢，故选D。（由AI查询）",
    (2021, 435): "消渴上消以肺燥津伤为主，在消渴基本穴上配太渊以补肺、生津，配少府以清心火，故选B。（由AI查询）",
    (2021, 437): "肺胀早期病变首先在肺，久则子病及母、累及脾，进一步影响肾的纳气和水液气化，因此相关脏腑为肺、脾、肾，故选B。（由AI查询）",
    (2021, 439): "阴虚秘兼腰膝酸软提示肾阴不足，可用六味地黄丸滋补肾阴；再根据便秘情况配合养阴润肠药，故选A。（由AI查询）",
    (2021, 441): "噎膈痰气交阻若气郁化火、心烦口干，应在理气化痰基础上加山豆根、栀子清热利咽、泻火除烦，按本题配伍选A。（由AI查询）",
    (2021, 443): "风水相搏水肿起病较急，常先见眼睑浮肿，继而四肢及全身皆肿，并可伴恶风发热等表证，故选E。（由AI查询）",
    (2021, 446): "肺痈咳吐大量腥臭脓痰或脓血相兼，是痈脓破溃外泄的典型表现，属于溃脓期，故选C。（由AI查询）",
    (2021, 447): "正虚喘脱见喘促欲绝、汗出肢冷、脉微等阳气欲脱和肾不纳气表现，治宜扶阳固脱、镇摄肾气，故选D。（由AI查询）",
})

AI_EXPLANATION_REPAIRS.update({
    (2021, 452): "风寒咳嗽以咳嗽频作、声重咽痒、痰白清稀，并常伴鼻塞流清涕、恶寒无汗为特点，故选A。（由AI查询）",
    (2021, 453): "顿咳由时行疫邪犯肺，痰热互结、深伏气道，导致肺失清肃、肺气上逆而阵咳不止，故选A。（由AI查询）",
    (2021, 455): "乳岩久病或经手术、放化疗后可耗伤气血，气血两亏治宜益气养血、扶正培本，代表方为人参养荣汤，故选E。（由AI查询）",
    (2021, 458): "产后发热血虚证由产时失血、气血骤虚所致，治宜补益气血，八珍汤气血双补，故选A。（由AI查询）",
    (2021, 460): "鼠乳相当于疣类皮损，外治可用挑刺法疏通局部气血并去除病灶，题目所列方法中选E。（由AI查询）",
    (2021, 479): "肝肾不足、气血虚弱、阴虚血燥和脾虚血少均可使血海空虚而形成虚性闭经；痰湿阻滞属实邪闭阻冲任，故选B。（由AI查询）",
    (2021, 492): "头皮或皮肤油脂增多、发亮瘙痒，并有红斑白屑、反复脱生，符合白屑风的油性表现，故选C。（由AI查询）",
    (2021, 495): "火邪致病来势迅猛，患部红、肿、灼热、疼痛明显，肿势皮薄光泽并易化脓腐烂，故选E。（由AI查询）",
    (2021, 501): "血瘤治疗应结合数目、范围和部位选择冷冻、放射或手术。多个病变部位通常不宜一概手术切除，因此B项说法错误。（由AI查询）",
    (2021, 508): "本历史中医外科试题按传统教材分类，将蝮蛇列为兼有神经毒与血循毒表现的混合毒类，故依原考试答案选C；现代急救指南对部分蛇种分类口径可能不同，实际蛇伤应按当地指南和抗蛇毒血清方案处理。（由AI查询）",
    (2021, 544): "乳岩术后及放化疗后出现食欲不振、恶心呕吐、神疲肢肿、舌淡脉细弱，提示脾胃虚弱，治宜健脾和胃，可选参苓白术散或理中汤，故选E。（由AI查询）",
    (2021, 546): "入夏后长期发热，气温越高体温越高，少汗、口渴多饮、小便频数且秋凉自退，是小儿夏季热的典型特点，故选D。（由AI查询）",
    (2021, 547): "夏季热以暑热伤肺胃、气阴受损为主要病机，核心病位在肺胃，久病也可累及脾肾，故本题选B。（由AI查询）",
    (2021, 549): "小儿前囟通常在出生后12～18个月闭合，过早或延迟均需结合头围、发育和其他体征评估，故选D。（由AI查询）",
    (2021, 551): "足月新生儿出生时头围平均约34cm，通常略大于胸围，故选B。（由AI查询）",
    (2021, 555): "风寒咳嗽的典型表现是咳嗽频作、声重咽痒、咳痰清稀，故选A；痰黄黏稠多属风热或痰热。（由AI查询）",
    (2021, 557): "月经先期肾气虚证因肾气不固、冲任失摄，治宜补肾益气、固冲调经，代表方为固阴煎，故选B。（由AI查询）",
    (2021, 559): "妊娠中期腹部异常增大，并见胸膈满闷、遍身浮肿和喘息不得卧，属于胎水过多所致的“子满”，故选C。（由AI查询）",
    (2021, 561): "维生素B12或叶酸缺乏影响DNA合成，使红细胞核成熟障碍并形成巨幼细胞改变，表现为大细胞性贫血，故选B。（由AI查询）",
    (2021, 562): "缺铁使血红蛋白合成不足，红细胞体积变小、着色变浅，形成小细胞低色素性贫血，故选A。（由AI查询）",
    (2021, 563): "传染性单核细胞增多症气营两燔证见高热、咽喉肿痛、皮疹等气分与营分热盛表现，治宜清气凉营、解毒利咽，首选普济消毒饮，故选B。（由AI查询）",
    (2021, 565): "外科内治的补法用于溃疡后期正气亏虚、气血不足、疮口久不收敛者，以扶正生肌，故选E。（由AI查询）",
    (2021, 567): "不孕症肾阴虚证治宜滋肾养血、调补冲任，养精种玉汤为代表方，故选E。（由AI查询）",
    (2021, 569): "产后小便不通肾虚证因肾气不足、膀胱气化失司，治宜温肾助阳、化气行水，选济生肾气丸或金匮肾气丸B。（由AI查询）",
    (2021, 571): "阴痒肝经湿热证治宜清肝利湿、杀虫止痒，内服可用龙胆泻肝汤或萆薢渗湿汤，外用蛇床子散，故选D。（由AI查询）",
    (2021, 573): "紫癜风热伤络证多见发热、咽痛、皮肤紫癜色鲜红，治宜疏风清热、凉血止血，题目所列代表方选银翘散B。（由AI查询）",
    (2021, 575): "小儿疳气为疳证初期，重点在调和脾胃、益气助运，资生健脾丸最符合，故选A。（由AI查询）",
})

# A second full-bank audit found entries whose source text was not literally
# “略” but was still unusable as review material, for example “实记题”、
# “解析】略” and “略【”.  Treat them exactly like missing explanations.
AI_EXPLANATION_REPAIRS.update({
    (2021, 88): "酸枣仁能养心益肝、安神、敛汗，适用于心悸失眠、健忘多梦并见体虚多汗者，故选B。（由AI查询）",
    (2021, 96): "肾功能衰竭时尿素等代谢产物潴留，可使病室出现尿臊气或氨味；其余选项常有各自较有特征的气味，故选D。（由AI查询）",
    (2021, 108): "鹿茸能壮肾阳、益精血、强筋骨，常用于肾阳不足所致阳痿、宫冷不孕，故选C。（由AI查询）",
    (2021, 109): "菟丝子补益肝肾，并有固精缩尿作用，可用于肾虚所致小便频数、余沥不尽等，故选D。（由AI查询）",
    (2021, 212): "按本历史试题所依据的医师注册制度，取得医师资格后应向所在地县级以上人民政府卫生行政部门申请注册，故选C；实际办理应以现行法规和当地主管部门要求为准。（由AI查询）",
    (2021, 215): "心脏神经症的胸痛常与劳力无固定关系，活动或转移注意力后反可减轻；心绞痛通常由活动诱发、休息后缓解，故选D。（由AI查询）",
    (2021, 279): "医学人道论强调尊重、爱护患者，减轻疾病痛苦并维护健康，选项A最直接概括其核心要求，故选A。（由AI查询）",
    (2021, 280): "医学美德论重视医务人员的仁爱、同情、尊重和全心服务等道德品质，选项B最符合，故选B。（由AI查询）",
    (2021, 281): "热痉挛多因高温环境中大量出汗、盐分丢失而发生，典型表现为四肢或腹部肌肉阵发性痉挛和疼痛，故选B。（由AI查询）",
    (2021, 282): "热射病的核心表现是严重高体温和中枢神经系统功能障碍，可见意识改变；经典型患者还可少汗或无汗，故本题选E。（由AI查询）",
    (2021, 285): "猪是流行性乙型脑炎病毒的重要扩增宿主和主要传染源，蚊虫叮咬后可将病毒传播给人，故选D。（由AI查询）",
    (2021, 286): "流行性脑脊髓膜炎的传染源包括患者和带菌者，其中带菌者因数量多、症状不明显而在传播中十分重要；本组选项应选A。（由AI查询）",
    (2021, 287): "白三烯调节剂可减轻运动诱发的支气管收缩，按本历史试题的预防用药口径选C；临床还需依据现行哮喘指南、基础控制水平和个体反应选择方案。（由AI查询）",
    (2021, 365): "痿证肺热津伤治宜清热润燥、养阴生津。尺泽、肺俞清肺益肺，二间、大椎泄热，故选C。（由AI查询）",
    (2021, 371): "泄泻的基本病机是脾虚湿盛，导致肠道传导和分清泌浊功能失常；肝郁、湿热等可为具体证型因素，故选D。（由AI查询）",
    (2021, 402): "头痛隐隐、面色少华、心悸失眠、劳则加重，舌淡脉细弱，均提示血虚不能上荣头目，故诊断为血虚头痛，选D。（由AI查询）",
    (2021, 420): "蠡沟为足厥阴肝经络穴，位于小腿内侧、内踝尖上5寸、胫骨内侧面中央，故选D。（由AI查询）",
    (2021, 424): "大杼位于第1胸椎棘突下，后正中线旁开1.5寸；风门、肺俞、心俞、膈俞分别位于更低的胸椎水平，故选A。（由AI查询）",
    (2021, 426): "合谷是手阳明大肠经的原穴，也是常用腧穴；并非募穴、络穴、合穴或郄穴，故选D。（由AI查询）",
    (2021, 429): "喘证肾虚不纳由肾气亏虚、摄纳无权所致，治法重在补肾纳气，故选D。（由AI查询）",
    (2021, 430): "正虚喘脱见喘促欲绝、汗出肢冷、脉微等阳气欲脱表现，治宜扶阳固脱、镇摄肾气，故选E。（由AI查询）",
    (2021, 445): "壮热、振寒、胸痛、咳吐黄绿色浊痰而尚未大量咯出脓血，提示热毒壅肺、血瘀成痈，属于肺痈成痈期，故选B。（由AI查询）",
    (2021, 522): "皮肤红肿、疼痛剧烈并有大小不等水疱，水疱基底潮红，符合浅Ⅱ度烧伤累及表皮和真皮浅层的表现，故选B。（由AI查询）",
    (2021, 552): "足月新生儿出生时身长平均约50cm，故选D；约75cm通常是1岁左右儿童的参考身长。（由AI查询）",
    (2021, 553): "小儿痫病发作以痰气逆乱、蒙蔽心窍并引动肝风为关键病机，因而出现意识丧失、抽搐等，故选A。（由AI查询）",
    (2021, 554): "小儿急惊风多由外感时邪或热毒炽盛，邪陷厥阴、蒙蔽心窍并引动肝风，故选E。（由AI查询）",
    (2021, 556): "顿咳即百日咳，典型为阵发性痉挛性咳嗽，咳后可出现鸡鸣样吸气回声，故选D。（由AI查询）",
    (2022, 381): "尿中挟有砂石、排尿突然中断并见尿道刺痛、尿血，属于石淋，且舌红苔黄、脉弦数提示湿热下注，治宜清热利湿、排石通淋，故选A。（由AI查询）",
    (2022, 293): "医师可在专业判断和诊疗规范范围内，根据患者病情开具诊断证明，体现医务人员在诊疗活动中的自主权，故选B。（由AI查询）",
    (2022, 407): "眩晕虽见痰湿表现，但针灸治疗眩晕取穴以足厥阴肝经和督脉为主，可调肝息风、醒脑定眩，故选C；再随证配化痰祛湿穴。（由AI查询）",
    (2022, 408): "针灸治疗眩晕实证以百会、风池、太冲、内关为主穴，可平肝息风、醒脑定眩并调畅气机，故选C。（由AI查询）",
})

# The supplied 2022 question page prints only A-D for question 75. It is kept
# out of the bank rather than inventing an E option.
SOURCE_EXCLUSIONS = {
    (2022, 75): "原题页仅有A-D四个选项，结构不完整",
    (2022, 460): "原题页B-E均印为“待补充”，结构不完整",
    (2022, 490): "原题页C-E均印为“待补充”，结构不完整",
    (2022, 509): "原题页只印有选项，缺少题号和题干",
    (2022, 514): "原题页只印有选项，缺少题号和题干",
}


def sanitize_source_text(text: str, preserve_explanation_markup: bool = False) -> str:
    """Remove OCR fragments from recurring page headers, footers and watermarks."""
    if not text:
        return ""
    replacements = {
        "女于": "女子", "灭瞒": "灭螨", "艾灶灸": "艾炷灸", "疲痕灸": "瘢痕灸",
        "面色胱白": "面色㿠白", "濂疮": "臁疮", "湿锣音": "湿啰音",
        "瘢疮(硬下疳)": "疳疮（硬下疳）", "常发:生于": "常发生于",
        "疗是指发生在肌肤浅表": "疔是指发生在肌肤浅表", "红丝疗": "红丝疔",
        "mmo1": "mmol", "mmoI": "mmol", "μmo1": "μmol", "μmI": "μmol",
        "Pa02": "PaO2", "PaC02": "PaCO2", "C02": "CO2", "62G/L": "62g/L",
        "脉搏短点细": "脉搏短绌", "收缩庄": "收缩压", "肢体活功": "肢体活动",
        "阵发性刀割样疼痈": "阵发性刀割样疼痛", "颧膠": "颧髎",
        "瓜萎": "瓜蒌", "洗条法": "洗涤法", "廉疮": "臁疮",
    }
    for wrong, correct in replacements.items():
        text = text.replace(wrong, correct)
    text = re.sub(r"A1/A2型选择题\s*$", "", text).rstrip()
    text = re.sub(r"[【〖]?\s*第[一二三四]单元\s*$", "", text).rstrip()
    # The scanned books repeatedly overlay yidianbiji/anbiji watermarks in the
    # middle or at the end of otherwise valid lines.  Remove the token itself;
    # when it is preceded by a standalone source-question anchor, remove that
    # anchor as well.  Do not blanket-strip all trailing numbers because doses,
    # ratios, years and laboratory values are legitimate exam content.
    watermark = r"(?:www[-.]?vi(?:c)?|www\.?[a-z]{2,12}|(?:yidi|anbiji)\.com|anbiji|nbiji\.com|一点(?:笔记)?|万题(?:宝|之考真)?|何必)"
    text = re.sub(rf"(?:[。；;，,：:]?\d{{1,3}}[.．、·])?\s*{watermark}", "", text, flags=re.IGNORECASE)
    text = re.sub(r"(?:笔记】|毛址】|网址】)", "", text)
    patterns = (
        r"[<〈,，]?第[^>〉,，。]{0,8}页[>〉冫)]?",
        r"三更眠五更起",
        r"日曝十日寒",
        r"荀有悵",
        r"苟有恒",
        r"秃到秃头",
        r"最兄羔",
        r"最无益[，,]莫过一",
        r"英过一",
        r"万宝",
        r"真20(?:18|19|20|21|22)",
        r"·20(?:18|19|20|21|22|2|精|全)",
    )
    earliest = len(text)
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            earliest = min(earliest, match.start())
    text = text[:earliest].strip(" .．、,，;；:：·-—<〈>〉冫")
    text = re.sub(r"(?:[A-Za-z0-9íÍ]{0,16}\.)?com\b.*$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"w{1,3}\.?yid\w*.*$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"(?:nDILcon|nbilLcom|JIjL\.com).*$", "", text, flags=re.IGNORECASE)
    # Page/question anchors sometimes remain after a removed terminal
    # watermark.  They are safe to remove only after a completed sentence.
    text = re.sub(r"(?<=[。！？])\s*\d{1,3}[.．、·]?\s*$", "", text)
    if not preserve_explanation_markup:
        text = re.sub(r"[【】〖〗]", "", text)
    return text


def restore_explanation_punctuation(text: str) -> str:
    """Restore full stops that OCR confused with a Latin O after answer letters."""
    if not text:
        return ""
    text = re.sub(r"I\)[Oo](?=$|[^A-Za-z])", "D。", text)
    return re.sub(r"(?<=[A-E])[Oo](?=$|[^A-Za-z])", "。", text)


def strip_question_anchor(text: str, current_number: int, next_number: int | None) -> str:
    """Remove a merged current/next question block without harming real numbers."""
    if not text:
        return ""
    text = re.sub(r"^\s*[oOdD]?\d{1,3}[.．、]\s*[【〖]?解析[】〗]?", "", text)
    anchors = {current_number}
    if next_number is not None:
        anchors.add(next_number)
    for number in sorted(anchors):
        pattern = re.compile(rf"(?<!\d)[oOdD]?{number}[.．、](?=\s*(?:[【〖](?:解析)?|[\u3400-\u9fff]))")
        match = pattern.search(text)
        if match and match.start() > 0:
            text = text[:match.start()]
    text = re.sub(r"(?:\d{1,3}[.．、]?)?(?:(?:bij[ií]?|idi)\.com|\d{1,3}\.com|idi\d{1,3}\.www).*$", "", text, flags=re.IGNORECASE)
    return text.strip(" .．、,，;；:：·-—<〈>〉冫oO")


GROUP_MARKER_RE = re.compile(r"(?:〖|【|^|(?<=[。；;]))\s*([1-4])\s*(?:〗|】)")


def clean_explanation_markup(text: str) -> str:
    text = text or ""
    # OCR often duplicated a garbled sentence before a printed “解析】” label.
    # After question anchors have been stripped, the suffix after the final
    # label is the actual explanation.  This also normalizes “【解析】略”.
    markers = list(re.finditer(r"解析[〗】]", text))
    if markers:
        suffix = text[markers[-1].end():].strip()
        if suffix:
            text = suffix
    text = re.sub(r"[〖【]?解析[〗】]?", "", text)
    text = re.sub(r"(?:〖|【)?\s*[1-4]\s*(?:〗|】)", "", text)
    text = re.sub(r"[【】〖〗]", "", text)
    text = re.sub(r"\s+", "", text)
    return text.strip("。；;，,：:")


def is_missing_explanation(text: str) -> bool:
    normalized = clean_explanation_markup(text)
    normalized = re.sub(r"[。.．、；;，,：:\s]", "", normalized)
    return (
        normalized in {"", "略", "实记题", "原文件未提供解析"}
        or bool(re.fullmatch(r"\d{1,3}", normalized))
    )


def split_group_explanation(text: str, count: int) -> list[str]:
    """Split a combined B1/A3 source explanation into per-question text."""
    matches = list(GROUP_MARKER_RE.finditer(text or ""))
    by_index: dict[int, str] = {}
    for position, match in enumerate(matches):
        index = int(match.group(1)) - 1
        if not 0 <= index < count:
            continue
        end = matches[position + 1].start() if position + 1 < len(matches) else len(text)
        value = clean_explanation_markup(text[match.end():end])
        if value:
            by_index[index] = value
    return [by_index.get(index, "") for index in range(count)]


def focused_group_explanation(text: str, question: dict) -> str:
    """Choose the source sentence most relevant to one member of a group."""
    cleaned = clean_explanation_markup(text)
    sentences = [part.strip() for part in re.split(r"(?<=[。；;])", cleaned) if part.strip()]
    answer_text = question.get("options", {}).get(question.get("answer"), "")
    if answer_text:
        matched = [sentence for sentence in sentences if answer_text in sentence]
        if matched:
            return "".join(matched).strip("。；;")
    return cleaned


def distribute_group_explanations(questions: list[dict]) -> None:
    groups: dict[str, list[dict]] = {}
    for question in questions:
        if question.get("groupId"):
            groups.setdefault(question["groupId"], []).append(question)
    for members in groups.values():
        members.sort(key=lambda item: item["number"])
        sources = [item["explanation"] for item in members if item["explanation"] != "原文件未提供解析。"]
        if not sources:
            continue
        unique_sources = set(sources)
        if len(unique_sources) > 1 and not any(len(list(GROUP_MARKER_RE.finditer(source))) >= len(members) for source in unique_sources):
            # Distinct, already-specific manual/AI explanations must not be
            # replaced by another member's text.
            continue
        source = max(sources, key=len)
        split = split_group_explanation(source, len(members))
        for index, member in enumerate(members):
            replacement = split[index] or focused_group_explanation(source, member)
            if replacement:
                member["explanation"] = replacement.rstrip("。") + "。"


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


def normalized_ocr_number(token: str) -> int:
    return int(token.upper().replace("I", "1").replace("L", "1").replace("&", "8"))


def parse_leading_number(text: str) -> tuple[int, str] | None:
    normalized = text.upper()
    match = re.match(r"^[（(]?([0-9IL&]{1,3})[.．、,，·]?\s*(.*)$", normalized)
    if not match or not any(character.isdigit() for character in match.group(1)):
        return None
    number = normalized_ocr_number(match.group(1))
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


def context_without_answer_anchor(context: list[str], recognized_number: int | None) -> list[str]:
    """Exclude the current answer's standalone question number from the prior explanation."""
    if not context or recognized_number is None:
        return list(context)
    parsed = parse_leading_number(context[-1])
    if (
        parsed
        and parsed[0] == recognized_number
        and not parsed[1].strip("〖〗【】[]()（）")
    ):
        cleaned = context[:-1]
        if cleaned and UNIT_RE.search(cleaned[-1]):
            cleaned = cleaned[:-1]
        return cleaned
    return list(context)


def explanation_without_trailing_anchor(text: str, next_number: int | None) -> str:
    """Remove a merged next-question number only when it matches the source sequence."""
    if next_number is None:
        return text
    match = re.search(r"(?<![0-9A-Z])([0-9IL&]{1,3})[.．、,，·一—-]?\s*$", text, re.IGNORECASE)
    if (
        not match
        or not any(character.isdigit() for character in match.group(1))
        or normalized_ocr_number(match.group(1)) != next_number
    ):
        return text
    cleaned = text[: match.start()].rstrip()
    return re.sub(r"第[一二三四]单元\s*$", "", cleaned).rstrip()


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
        recognized_number = nearby_number(lines, index)
        raw.append(
            {
                "recognizedNumber": recognized_number,
                "answer": match.group(1) if match else None,
                "context": context_without_answer_anchor(pending_context, recognized_number),
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
        next_number = None
        next_unit = unit
        if index + 1 < len(expected):
            next_unit, next_local_number, next_global_number = expected[index + 1]
            next_number = next_global_number if EXPECTED[year]["global"] else next_local_number
        explanation = explanation_without_trailing_anchor(
            "".join(item["explanation"]).strip("〖〗【】解析:："),
            next_number,
        )
        if next_unit != unit:
            explanation = re.sub(r"第[一二三四]单元\s*$", "", explanation).rstrip()
        answers.append(
            {
                "unit": unit,
                "number": number,
                "globalNumber": global_number,
                "answer": item["answer"],
                "explanation": explanation,
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
        explanation = restore_explanation_punctuation(
            sanitize_source_text(explanation, preserve_explanation_markup=True)
        )
        anchor_number = global_number if EXPECTED[year]["global"] else local_number
        explanation = strip_question_anchor(explanation, anchor_number, anchor_number + 1)
        explanation = clean_explanation_markup(explanation)
        if is_missing_explanation(explanation):
            explanation = AI_EXPLANATION_REPAIRS.get((year, global_number), "")
        if explanation and not explanation.endswith(("。", "！", "？", "（由AI查询）")):
            explanation += "。"
        result[global_number] = {"answer": answer, "explanation": explanation or "原文件未提供解析。"}
    return result, conflicts


def build_year(year: int):
    low = source_snapshot(year, ROOT / "tmp" / "pdf-ocr-final2")
    high = source_snapshot(year, HIGHRES_OCR_ROOT)
    paddle = source_snapshot(year, PADDLE_OCR_ROOT)
    answers, answer_conflicts = fused_answer_map(year, paddle[0], low[0])
    low_sets, high_sets, paddle_sets = low[2], high[2], paddle[2]
    questions = []
    excluded = []
    ocr_disagreements = []
    shared_stems = {}

    for (spec, low_item), (_, high_item), (_, paddle_item) in zip(low_sets, high_sets, paddle_sets):
        repair = OPTION_REPAIRS.get((year, spec.first_global))
        low_options = low_item.normalized_options() if low_item else {}
        high_options = high_item.normalized_options() if high_item else {}
        paddle_options = paddle_item.normalized_options() if paddle_item else {}
        options = {}
        for letter in LETTERS:
            if repair:
                options[letter] = repair[letter]
                continue
            value, ratio = choose_text(paddle_options.get(letter, ""), low_options.get(letter, "") or high_options.get(letter, ""))
            option_anchor = spec.first_global if EXPECTED[year]["global"] else spec.first_local
            option_next = spec.global_numbers[-1] + 1 if EXPECTED[year]["global"] else spec.question_numbers[-1] + 1
            options[letter] = strip_question_anchor(value, option_anchor, option_next)
            if ratio is not None and ratio < 0.72:
                ocr_disagreements.append({"globalNumber": spec.first_global, "field": f"option-{letter}", "ratio": round(ratio, 3)})

        if any(not options[letter] for letter in LETTERS):
            for global_number in spec.global_numbers:
                excluded.append({"globalNumber": global_number, "reason": "选项结构无法闭合"})
            continue

        low_prompt = prompt_from_context(year, spec, low_item)
        high_prompt = prompt_from_context(year, spec, high_item)
        paddle_prompt = prompt_from_context(year, spec, paddle_item)
        prompt, prompt_ratio = choose_text(paddle_prompt, low_prompt or high_prompt)
        if prompt_ratio is not None and prompt_ratio < 0.65:
            ocr_disagreements.append({"globalNumber": spec.first_global, "field": "prompt", "ratio": round(prompt_ratio, 3)})

        if spec.type == "A3" and spec.group_id not in shared_stems:
            low_shared = shared_stem_from_context(year, spec, low_item)
            high_shared = shared_stem_from_context(year, spec, high_item)
            paddle_shared = shared_stem_from_context(year, spec, paddle_item)
            shared_stems[spec.group_id] = SHARED_STEM_REPAIRS.get(
                spec.group_id,
                choose_text(paddle_shared, low_shared or high_shared)[0],
            )

        low_b1 = b1_prompts(year, spec, low_item) if spec.type == "B1" else {}
        high_b1 = b1_prompts(year, spec, high_item) if spec.type == "B1" else {}
        paddle_b1 = b1_prompts(year, spec, paddle_item) if spec.type == "B1" else {}

        for offset, (local_number, global_number) in enumerate(zip(spec.question_numbers, spec.global_numbers)):
            exclusion = SOURCE_EXCLUSIONS.get((year, global_number))
            if exclusion:
                excluded.append({"globalNumber": global_number, "reason": exclusion})
                continue
            if spec.type == "B1":
                prompt = choose_text(paddle_b1.get(local_number, ""), low_b1.get(local_number, "") or high_b1.get(local_number, ""))[0]
            elif offset:
                # A3 has one option set per question, so this branch is normally unused.
                prompt = prompt_from_context(year, spec, low_item) or prompt_from_context(year, spec, high_item)
            prompt = PROMPT_REPAIRS.get((year, global_number), prompt)
            prompt_anchor = global_number if EXPECTED[year]["global"] else local_number
            prompt = strip_question_anchor(prompt, prompt_anchor, prompt_anchor + 1)
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

    distribute_group_explanations(questions)
    for question in questions:
        question["explanation"] = restore_explanation_punctuation(
            sanitize_source_text(question["explanation"])
        )
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
    removed_group_companions = []
    for year in range(2018, 2023):
        questions, stats = build_year(year)
        added = []
        blocks: dict[str, list[dict]] = {}
        for question in questions:
            blocks.setdefault(question.get("groupId") or question["id"], []).append(question)
        for block in blocks.values():
            duplicate_members = []
            for question in block:
                duplicate_of = seen.get(normalized_question_key(question))
                if duplicate_of:
                    duplicate_members.append((question, duplicate_of))
            if duplicate_members:
                duplicate_ids = {question["id"] for question, _ in duplicate_members}
                removed_duplicates.extend(
                    {"id": question["id"], "duplicateOf": duplicate_of}
                    for question, duplicate_of in duplicate_members
                )
                trigger = duplicate_members[0][0]["id"]
                removed_group_companions.extend(
                    {"id": question["id"], "groupId": question.get("groupId"), "removedWith": trigger}
                    for question in block
                    if question["id"] not in duplicate_ids
                )
                continue
            for question in block:
                seen[normalized_question_key(question)] = question["id"]
                added.append(question)
                combined.append(question)
        stats["addedAfterDedup"] = len(added)
        stats["removedAsDuplicates"] = sum(
            1 for item in removed_duplicates if item["id"].startswith(f"{year}-")
        )
        stats["removedAsGroupCompanions"] = sum(
            1 for item in removed_group_companions if item["id"].startswith(f"{year}-")
        )
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
        "removedGroupCompanionCount": len(removed_group_companions),
        "removedGroupCompanions": removed_group_companions,
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
