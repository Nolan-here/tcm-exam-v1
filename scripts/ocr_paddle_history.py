"""使用 PaddleOCR PP-OCRv6 复核 2018—2022 年高分辨率 OCR 图块。

原始 PDF 及其 300 DPI 图块保持只读。每个图块单独保存结果，支持中断后续跑；
同时生成与 import_scanned_history.py 兼容的 ocr.json。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT_ROOT = ROOT / "tmp" / "pdf-ocr-highres"
DEFAULT_OUTPUT_ROOT = ROOT / "tmp" / "pdf-ocr-paddle-v6"
IMAGE_RE = re.compile(r"p(?P<page>\d+)-c(?P<column>\d+)-r(?P<row>\d+)\.png$")


def read_record(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def image_metadata(path: Path) -> dict:
    match = IMAGE_RE.fullmatch(path.name)
    if not match:
        raise ValueError(f"无法解析图块文件名：{path}")
    return {key: int(value) for key, value in match.groupdict().items()}


def source_metadata(input_group: Path) -> tuple[str, str, int]:
    current = json.loads((input_group / "ocr.json").read_text(encoding="utf-8"))
    return current["source"], current["kind"], current["dpi"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-root", type=Path, default=DEFAULT_INPUT_ROOT)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--cache-root", type=Path, default=ROOT / "tmp" / "paddleocr-cache")
    parser.add_argument("--groups", nargs="*", help="只处理指定目录，例如 2019-answers")
    args = parser.parse_args()

    input_root = args.input_root.resolve(strict=True)
    output_root = args.output_root.resolve()
    cache_root = args.cache_root.resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    cache_root.mkdir(parents=True, exist_ok=True)

    os.environ.setdefault("PADDLE_PDX_CACHE_HOME", str(cache_root))
    os.environ.setdefault("PADDLE_PDX_MODEL_SOURCE", "BOS")
    os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "1")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    from paddleocr import PaddleOCR

    engine = PaddleOCR(
        lang="ch",
        ocr_version="PP-OCRv6",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        device="cpu",
        engine="onnxruntime",
    )

    groups = sorted(path for path in input_root.iterdir() if path.is_dir())
    if args.groups:
        requested = set(args.groups)
        groups = [path for path in groups if path.name in requested]
        missing = requested - {path.name for path in groups}
        if missing:
            raise ValueError(f"不存在的 OCR 目录：{sorted(missing)}")

    total_images = sum(len(list((group / "columns").glob("*.png"))) for group in groups)
    completed = 0
    print(f"准备复核 {len(groups)} 个来源、{total_images} 个图块。", flush=True)

    for group in groups:
        source, kind, dpi = source_metadata(group)
        output_group = output_root / group.name
        record_root = output_group / "records"
        images = sorted((group / "columns").glob("*.png"))
        records = []

        for index, image in enumerate(images, start=1):
            record_path = record_root / f"{image.stem}.json"
            if record_path.exists():
                record = read_record(record_path)
            else:
                result = next(iter(engine.predict(str(image))))
                payload = result.json["res"]
                record = {
                    **image_metadata(image),
                    "lines": [text.strip() for text in payload["rec_texts"] if text.strip()],
                    "scores": [round(float(score), 6) for score in payload["rec_scores"]],
                    "engine": "PaddleOCR 3.7.0 PP-OCRv6 medium ONNX",
                }
                write_json(record_path, record)
            records.append(record)
            completed += 1
            print(
                f"{group.name} {index}/{len(images)}，总进度 {completed}/{total_images}",
                flush=True,
            )

        write_json(
            output_group / "ocr.json",
            {
                "source": source,
                "kind": kind,
                "dpi": dpi,
                "engine": "PaddleOCR 3.7.0 PP-OCRv6 medium ONNX",
                "records": records,
            },
        )

    print(f"PaddleOCR 复核完成：{output_root}", flush=True)


if __name__ == "__main__":
    main()
