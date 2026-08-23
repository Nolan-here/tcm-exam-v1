#!/usr/bin/env python3
"""Create temporary visual audit crops for OCR records with missing options."""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
IMPORTER_PATH = ROOT / "scripts" / "import_scanned_history.py"
LAYOUT_SCRIPT = ROOT / "scripts" / "ocr_image_layout_windows.ps1"
OUTPUT = ROOT / "tmp" / "ocr-audit"


def load_importer():
    spec = importlib.util.spec_from_file_location("history_importer", IMPORTER_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def main() -> None:
    module = load_importer()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = []
    for year in range(2018, 2023):
        module.OCR_ROOT = module.ROOT / "tmp" / "pdf-ocr-final2"
        low_sets, _ = module.extract_option_sets(year)
        low_aligned, _ = module.align_option_sets(year, low_sets)
        module.OCR_ROOT = module.HIGHRES_OCR_ROOT
        high_sets, _ = module.extract_option_sets(year)
        high_aligned, _ = module.align_option_sets(year, high_sets)
        for (spec, low), (_, high) in zip(low_aligned, high_aligned):
            options = {}
            for letter in module.LETTERS:
                low_value = low.normalized_options()[letter] if low else ""
                high_value = high.normalized_options()[letter] if high else ""
                options[letter] = low_value or high_value
            missing = [letter for letter, value in options.items() if not value]
            if not missing:
                continue
            source_set = low or high
            source = source_set.source
            use_highres = low is None
            row_suffix = f"-r{source['row']}" if use_highres else ""
            source_root = module.HIGHRES_OCR_ROOT if use_highres else module.ROOT / "tmp" / "pdf-ocr-final2"
            image_path = (
                source_root
                / f"{year}-questions"
                / "columns"
                / f"p{source['page']:03d}-c{source['column']}{row_suffix}.png"
            )
            resolution = "high" if use_highres else "low"
            layout_path = OUTPUT / f"layout-{resolution}-{year}-p{source['page']:03d}-c{source['column']}{row_suffix}.json"
            if not layout_path.exists():
                subprocess.run(
                    [
                        "powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass",
                        "-File", str(LAYOUT_SCRIPT), "-ImagePath", str(image_path),
                        "-OutputPath", str(layout_path.relative_to(ROOT)),
                    ],
                    cwd=ROOT,
                    check=True,
                )
            lines = json.loads(layout_path.read_text(encoding="utf-8-sig"))
            anchor = lines[min(source["line"] - 1, len(lines) - 1)]
            with Image.open(image_path) as image:
                top = max(0, anchor["top"] - 260)
                bottom = min(image.height, anchor["bottom"] + 760)
                crop_path = OUTPUT / f"{year}-{spec.first_global:03d}.png"
                image.crop((0, top, image.width, bottom)).save(crop_path, optimize=True)
            manifest.append(
                {
                    "year": year,
                    "globalNumber": spec.first_global,
                    "type": spec.type,
                    "missing": missing,
                    "crop": str(crop_path),
                    "source": source,
                }
            )
    (OUTPUT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Created {len(manifest)} audit crops in {OUTPUT}")


if __name__ == "__main__":
    main()
