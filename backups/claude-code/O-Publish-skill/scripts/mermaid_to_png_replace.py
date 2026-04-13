#!/usr/bin/env python3
"""Convert Mermaid code blocks in a Markdown file to PNG images and replace blocks.

Uses smart-illustrator's mermaid-export.ts script.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

MERMAID_BLOCK_RE = re.compile(r"```mermaid\s*([\s\S]*?)\s*```", re.MULTILINE)


def resolve_smart_illustrator_dir() -> Path | None:
    env = os.getenv("SMART_ILLUSTRATOR_DIR")
    if env:
        p = Path(env).expanduser()
        if p.exists():
            return p
    candidates = [
        Path.home() / ".claude/skills/smart-illustrator",
        Path(__file__).resolve().parent.parent / "references/smart-illustrator",
    ]
    for c in candidates:
        if c.exists():
            return c
    return None


def export_mermaid(
    mermaid_export: Path,
    content: str,
    output_path: Path,
    theme: str | None,
    width: int | None,
    height: int | None,
) -> None:
    with tempfile.NamedTemporaryFile("w", suffix=".mmd", delete=False, encoding="utf-8") as tmp:
        tmp.write(content)
        temp_path = tmp.name

    try:
        cmd = [
            "npx",
            "-y",
            "bun",
            str(mermaid_export),
            "--input",
            temp_path,
            "--output",
            str(output_path),
        ]
        if theme:
            cmd += ["--theme", theme]
        if width:
            cmd += ["--width", str(width)]
        if height:
            cmd += ["--height", str(height)]

        result = subprocess.run(cmd, text=True, capture_output=True)
        if result.returncode != 0:
            sys.stderr.write("Mermaid export failed:\n")
            sys.stderr.write(result.stderr or result.stdout or "(no output)\n")
            raise RuntimeError("mermaid export failed")
    finally:
        try:
            Path(temp_path).unlink(missing_ok=True)
        except Exception:
            pass


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Replace Mermaid code blocks with PNG images for WeChat compatibility."
    )
    parser.add_argument("-i", "--input", required=True, help="Input Markdown file")
    parser.add_argument(
        "-o",
        "--output",
        help="Output Markdown file (default: input with -wx suffix)",
    )
    parser.add_argument(
        "--image-dir",
        help="Directory to store exported images (default: same dir as output)",
    )
    parser.add_argument("--theme", choices=["light", "dark"], default="light")
    parser.add_argument("--width", type=int, help="Export width in pixels")
    parser.add_argument("--height", type=int, help="Export height in pixels")
    args = parser.parse_args()

    input_path = Path(args.input).expanduser().resolve()
    if not input_path.exists():
        sys.stderr.write(f"Input file not found: {input_path}\n")
        return 2

    output_path = (
        Path(args.output).expanduser().resolve()
        if args.output
        else input_path.with_name(f"{input_path.stem}-wx{input_path.suffix}")
    )

    text = input_path.read_text(encoding="utf-8")
    matches = list(MERMAID_BLOCK_RE.finditer(text))
    if not matches:
        # Still write output for pipeline consistency
        output_path.write_text(text, encoding="utf-8")
        return 0

    smart_dir = resolve_smart_illustrator_dir()
    if not smart_dir:
        sys.stderr.write(
            "smart-illustrator not found. Set SMART_ILLUSTRATOR_DIR or install to ~/.claude/skills/smart-illustrator\n"
        )
        return 3

    mermaid_export = smart_dir / "scripts/mermaid-export.ts"
    if not mermaid_export.exists():
        sys.stderr.write(f"mermaid-export.ts not found at {mermaid_export}\n")
        return 4

    image_dir = (
        Path(args.image_dir).expanduser().resolve()
        if args.image_dir
        else output_path.parent
    )
    image_dir.mkdir(parents=True, exist_ok=True)

    parts: list[str] = []
    last_end = 0
    for idx, match in enumerate(matches, start=1):
        content = match.group(1).strip()
        image_name = f"{input_path.stem}-mermaid-{idx:02d}.png"
        image_path = image_dir / image_name

        export_mermaid(
            mermaid_export=mermaid_export,
            content=content,
            output_path=image_path,
            theme=args.theme,
            width=args.width,
            height=args.height,
        )

        rel_path = os.path.relpath(image_path, start=output_path.parent)
        image_md = f"![diagram]({rel_path})"

        parts.append(text[last_end : match.start()])
        parts.append(image_md)
        last_end = match.end()

    parts.append(text[last_end:])
    output_path.write_text("".join(parts), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
