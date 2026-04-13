#!/usr/bin/env python3
"""Replace local asset image paths with a hosted base URL in Markdown."""

from __future__ import annotations

import argparse
import re
from pathlib import Path

IMG_RE = re.compile(r"(!\[[^\]]*\]\()([^)]+)(\))")


def normalize_base(base_url: str) -> str:
    if base_url.endswith('/'):
        return base_url[:-1]
    return base_url


def rewrite(md: str, assets_dir: str, base_url: str) -> str:
    base = normalize_base(base_url)
    assets = assets_dir.strip()
    if not assets:
        assets = "./assets"
    # Normalize assets prefix variants
    variants = [assets]
    if assets.startswith("./"):
        variants.append(assets[2:])
    else:
        variants.append(f"./{assets}")

    def repl(match: re.Match) -> str:
        prefix, path, suffix = match.groups()
        for v in variants:
            if path.startswith(v + "/"):
                rel = path[len(v) + 1 :]
                return f"{prefix}{base}/{rel}{suffix}"
        return match.group(0)

    return IMG_RE.sub(repl, md)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Replace local asset image links (e.g., ./assets/..) with a hosted base URL."
    )
    parser.add_argument("-i", "--input", required=True, help="Input Markdown file")
    parser.add_argument("-o", "--output", help="Output Markdown file")
    parser.add_argument(
        "--assets-dir",
        default="./assets",
        help="Assets directory prefix to replace (default: ./assets)",
    )
    parser.add_argument("--base-url", required=True, help="Hosted base URL")
    args = parser.parse_args()

    input_path = Path(args.input).expanduser().resolve()
    if not input_path.exists():
        raise SystemExit(f"Input file not found: {input_path}")

    out_path = (
        Path(args.output).expanduser().resolve()
        if args.output
        else input_path.with_name(f"{input_path.stem}-hosted{input_path.suffix}")
    )

    text = input_path.read_text(encoding="utf-8")
    rewritten = rewrite(text, assets_dir=args.assets_dir, base_url=args.base_url)
    out_path.write_text(rewritten, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
