#!/usr/bin/env python3
import argparse
import mimetypes
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


IMG_RE = re.compile(r"!\[([^\]]*)\]\((https?://[^\s)]+)\)")


def infer_ext(url: str, content_type: str | None) -> str:
    path_ext = Path(urllib.parse.urlparse(url).path).suffix.lower()
    if path_ext in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}:
        return path_ext
    if content_type:
        ext = mimetypes.guess_extension(content_type.split(";")[0].strip())
        if ext:
            return ".jpg" if ext == ".jpe" else ext
    return ".bin"


def download(url: str, dst: Path, attempts: int = 4) -> Path:
    if dst.exists() and dst.stat().st_size > 0:
        return dst

    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "Mozilla/5.0 (x-article-auto-publisher)"}
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
                ctype = resp.headers.get("Content-Type")
            if dst.suffix == ".bin":
                dst = dst.with_suffix(infer_ext(url, ctype))
            dst.write_bytes(data)
            return dst
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = exc
            if attempt == attempts:
                break
            time.sleep(min(2 ** (attempt - 1), 8))
    raise RuntimeError(f"failed to download {url}: {last_error}") from last_error


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("markdown", help="Input markdown path")
    ap.add_argument(
        "--out-dir",
        default=".",
        help="Output directory for *_local.md and *_local_assets (default: current dir)",
    )
    args = ap.parse_args()

    input_md = Path(args.markdown).resolve()
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    stem = input_md.stem
    output_md = out_dir / f"{stem}_local.md"
    assets_dir = out_dir / f"{stem}_local_assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    text = input_md.read_text(encoding="utf-8")
    matches = list(IMG_RE.finditer(text))

    parts: list[str] = []
    last = 0
    for i, m in enumerate(matches, start=1):
        alt = m.group(1)
        url = m.group(2)
        name = f"{i:03d}{infer_ext(url, None)}"
        local = download(url, assets_dir / name)
        rel = Path(assets_dir.name) / local.name
        parts.append(text[last : m.start()])
        parts.append(f"\n\n![{alt}]({rel.as_posix()})\n\n")
        last = m.end()
        print(f"downloaded {i:03d} -> {local.name}")
    parts.append(text[last:])

    output_md.write_text("".join(parts), encoding="utf-8")
    print(f"local_markdown={output_md}")
    print(f"assets_dir={assets_dir}")


if __name__ == "__main__":
    main()
