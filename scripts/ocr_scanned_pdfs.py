#!/usr/bin/env python3
"""Render and column-crop image-only PDFs, then run Windows Chinese OCR.

Source PDFs are opened read-only. Generated page images and OCR text are placed
under the caller-selected output directory, normally tmp/pdf-ocr.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OCR_SCRIPT = ROOT / "scripts" / "ocr_directory_windows.ps1"


def find_pdftoppm() -> Path:
    system_path = shutil.which("pdftoppm")
    if system_path:
        return Path(system_path)
    bundled = (
        Path.home()
        / ".cache"
        / "codex-runtimes"
        / "codex-primary-runtime"
        / "dependencies"
        / "native"
        / "poppler"
        / "Library"
        / "bin"
        / "pdftoppm.exe"
    )
    if bundled.exists():
        return bundled
    raise FileNotFoundError("未找到 pdftoppm，请通过 PATH 提供 Poppler 后重试")


def render(pdf: Path, output: Path, dpi: int) -> list[Path]:
    pages = output / "pages"
    pages.mkdir(parents=True, exist_ok=True)
    existing = sorted(pages.glob("page-*.png"))
    if existing:
        return existing
    subprocess.run(
        [str(find_pdftoppm()), "-png", "-r", str(dpi), str(pdf), str(pages / "page")],
        check=True,
    )
    return sorted(pages.glob("page-*.png"))


def crop_columns(pages: list[Path], output: Path, kind: str) -> Path:
    columns = output / "columns"
    columns.mkdir(parents=True, exist_ok=True)
    count = 4 if kind == "questions" else 2
    for page_number, page_path in enumerate(pages, 1):
        with Image.open(page_path) as image:
            width, height = image.size
            top = round(height * (0.015 if kind == "questions" else 0.01))
            bottom = round(height * 0.995)
            for column_number in range(1, count + 1):
                if kind == "questions":
                    page_margin = width * 0.015
                    content_width = width - 2 * page_margin
                    left = round(page_margin + content_width * (column_number - 1) / count)
                    right = round(page_margin + content_width * column_number / count)
                elif column_number == 1:
                    left, right = round(width * 0.045), round(width * 0.49)
                else:
                    left, right = round(width * 0.51), round(width * 0.955)
                vertical_parts = 2 if bottom - top > 2500 else 1
                for row_number in range(1, vertical_parts + 1):
                    row_height = (bottom - top) / vertical_parts
                    overlap = round(height * 0.008) if vertical_parts > 1 else 0
                    row_top = round(top + row_height * (row_number - 1))
                    row_bottom = round(top + row_height * row_number)
                    if row_number > 1:
                        row_top -= overlap
                    if row_number < vertical_parts:
                        row_bottom += overlap
                    suffix = f"-r{row_number}" if vertical_parts > 1 else ""
                    target = columns / f"p{page_number:03d}-c{column_number}{suffix}.png"
                    if target.exists():
                        continue
                    image.crop((left, row_top, right, row_bottom)).save(target, optimize=True)
    return columns


def run_ocr(columns: Path) -> None:
    subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(OCR_SCRIPT),
            "-InputDirectory",
            str(columns),
        ],
        check=True,
    )


def combine(columns: Path, output: Path, source: Path, kind: str, dpi: int) -> None:
    records = []
    for text_path in sorted(columns.glob("p*-c*.txt")):
        stem = text_path.stem
        page_text, remainder = stem.split("-c")
        column_text, _, row_text = remainder.partition("-r")
        records.append(
            {
                "page": int(page_text[1:]),
                "column": int(column_text),
                "row": int(row_text) if row_text else 1,
                "lines": text_path.read_text(encoding="utf-8-sig").splitlines(),
            }
        )
    payload = {
        "source": source.name,
        "kind": kind,
        "dpi": dpi,
        "records": records,
    }
    (output / "ocr.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--kind", choices=("questions", "answers"), required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--dpi", type=int, default=180)
    parser.add_argument("--fresh", action="store_true")
    args = parser.parse_args()

    pdf = args.pdf.resolve(strict=True)
    output = args.output.resolve()
    if args.fresh and output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True, exist_ok=True)
    pages = render(pdf, output, args.dpi)
    columns = crop_columns(pages, output, args.kind)
    run_ocr(columns)
    combine(columns, output, pdf, args.kind, args.dpi)
    print(f"{pdf.name}: {len(pages)} pages, OCR saved to {output / 'ocr.json'}")


if __name__ == "__main__":
    main()
