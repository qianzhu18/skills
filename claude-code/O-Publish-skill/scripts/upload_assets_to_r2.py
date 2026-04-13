#!/usr/bin/env python3
"""Upload local asset files to Cloudflare R2 and optionally rewrite Markdown links.

This script uses curl's AWS SigV4 support, so no extra Python dependencies are required.
"""

from __future__ import annotations

import argparse
import mimetypes
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote, urlparse


def normalize_public_base(url: str) -> str:
    return url.rstrip("/")


def build_api_base(endpoint: str, bucket: str | None) -> tuple[str, str]:
    raw = endpoint.rstrip("/")
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Invalid endpoint URL: {endpoint}")

    endpoint_root = f"{parsed.scheme}://{parsed.netloc}"
    path_bucket = parsed.path.strip("/").split("/")[0] if parsed.path.strip("/") else ""
    effective_bucket = bucket or path_bucket
    if not effective_bucket:
        raise ValueError(
            "Bucket is missing. Provide --bucket or use endpoint with /<bucket> path."
        )
    return f"{endpoint_root}/{effective_bucket}", effective_bucket


def collect_files(assets_dir: Path) -> list[Path]:
    files = []
    for p in assets_dir.rglob("*"):
        if p.is_file():
            files.append(p)
    return sorted(files)


def upload_one(
    *,
    file_path: Path,
    rel_key: str,
    api_base: str,
    access_key: str,
    secret_key: str,
    dry_run: bool,
) -> None:
    api_url = f"{api_base}/{quote(rel_key, safe='/')}"
    content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"

    cmd = [
        "curl",
        "-fsS",
        "--retry",
        "2",
        "--retry-delay",
        "1",
        "--aws-sigv4",
        "aws:amz:auto:s3",
        "-u",
        f"{access_key}:{secret_key}",
        "-X",
        "PUT",
        "-T",
        str(file_path),
        "-H",
        f"Content-Type: {content_type}",
        api_url,
    ]
    if dry_run:
        print(f"[DRY RUN] PUT {file_path} -> {api_url}")
        return

    result = subprocess.run(cmd, text=True, capture_output=True)
    if result.returncode != 0:
        msg = result.stderr.strip() or result.stdout.strip() or "unknown error"
        raise RuntimeError(f"Upload failed for {file_path}: {msg}")


def rewrite_markdown_links(md_text: str, assets_dir: str, public_base_url: str) -> str:
    # Keep logic aligned with replace_image_base_url.py
    import re

    img_re = re.compile(r"(!\[[^\]]*\]\()([^)]+)(\))")
    assets = assets_dir.strip() or "./assets"
    variants = [assets]
    if assets.startswith("./"):
        variants.append(assets[2:])
    else:
        variants.append(f"./{assets}")
    base = normalize_public_base(public_base_url)

    def repl(match: re.Match) -> str:
        prefix, path, suffix = match.groups()
        for v in variants:
            if path.startswith(v + "/"):
                rel = path[len(v) + 1 :]
                return f"{prefix}{base}/{quote(rel, safe='/')}{suffix}"
        return match.group(0)

    out = img_re.sub(repl, md_text)

    # Also rewrite YAML frontmatter cover field if present (useful for blog engines).
    lines = out.splitlines()
    if lines and lines[0].strip() == "---":
        end_idx = None
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                end_idx = i
                break
        if end_idx is not None:
            fm = lines[1:end_idx]
            cover_re = re.compile(r"^(\s*cover\s*:\s*)([\"']?)(.+?)\2\s*$")
            for i, raw in enumerate(fm):
                m = cover_re.match(raw)
                if not m:
                    continue
                prefix, q, path = m.groups()
                if path.startswith(("http://", "https://")):
                    continue
                for v in variants:
                    if path.startswith(v + "/"):
                        rel = path[len(v) + 1 :]
                        new_path = f"{base}/{quote(rel, safe='/')}"
                        fm[i] = f"{prefix}{q}{new_path}{q}"
                        break
            lines[1:end_idx] = fm
            out = "\n".join(lines)

    return out


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Upload ./assets to Cloudflare R2 and optionally rewrite Markdown image links."
    )
    parser.add_argument(
        "--assets-dir",
        default="./assets",
        help="Local assets directory to upload (default: ./assets)",
    )
    parser.add_argument(
        "--s3-endpoint",
        required=True,
        help=(
            "R2 S3 endpoint, e.g. https://<account>.r2.cloudflarestorage.com "
            "or https://<account>.r2.cloudflarestorage.com/<bucket>"
        ),
    )
    parser.add_argument("--bucket", help="Bucket name (optional if endpoint already includes it)")
    parser.add_argument(
        "--public-base-url",
        required=True,
        help="Public base URL, e.g. https://pub-xxxx.r2.dev",
    )
    parser.add_argument(
        "--prefix",
        default="",
        help="Optional object key prefix inside bucket, e.g. notes/2026-02/",
    )
    parser.add_argument(
        "--markdown",
        help="Optional Markdown file to rewrite local image links after upload",
    )
    parser.add_argument(
        "--rewrite-assets-prefix",
        help=(
            "Optional markdown image prefix to replace when rewriting links, "
            "e.g. ../assets (defaults to --assets-dir value)"
        ),
    )
    parser.add_argument(
        "--output-markdown",
        help="Output path for rewritten Markdown (default: <markdown>-hosted.md)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print actions only, no upload/write",
    )
    args = parser.parse_args()

    access_key = os.getenv("R2_ACCESS_KEY_ID") or os.getenv("AWS_ACCESS_KEY_ID")
    secret_key = os.getenv("R2_SECRET_ACCESS_KEY") or os.getenv("AWS_SECRET_ACCESS_KEY")
    if not access_key or not secret_key:
        sys.stderr.write(
            "Missing credentials. Set R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY "
            "or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY.\n"
        )
        return 2

    assets_dir = Path(args.assets_dir).expanduser().resolve()
    if not assets_dir.exists() or not assets_dir.is_dir():
        sys.stderr.write(f"Assets directory not found: {assets_dir}\n")
        return 3

    api_base, bucket = build_api_base(args.s3_endpoint, args.bucket)
    public_base = normalize_public_base(args.public_base_url)
    prefix = args.prefix.strip().strip("/")

    files = collect_files(assets_dir)
    if not files:
        print("No files found in assets directory.")
        return 0

    print(f"Bucket: {bucket}")
    print(f"API base: {api_base}")
    print(f"Public base: {public_base}")
    print(f"Files: {len(files)}")

    for f in files:
        rel = f.relative_to(assets_dir).as_posix()
        key = f"{prefix}/{rel}" if prefix else rel
        upload_one(
            file_path=f,
            rel_key=key,
            api_base=api_base,
            access_key=access_key,
            secret_key=secret_key,
            dry_run=args.dry_run,
        )

    print("Upload step complete.")

    if args.markdown:
        md_path = Path(args.markdown).expanduser().resolve()
        if not md_path.exists():
            sys.stderr.write(f"Markdown file not found: {md_path}\n")
            return 4
        out_path = (
            Path(args.output_markdown).expanduser().resolve()
            if args.output_markdown
            else md_path.with_name(f"{md_path.stem}-hosted{md_path.suffix}")
        )
        original = md_path.read_text(encoding="utf-8")
        # Markdown references local ./assets, while public URL references uploaded root.
        # If prefix is used, include it in public URL.
        public_for_md = f"{public_base}/{prefix}" if prefix else public_base
        rewrite_assets_prefix = args.rewrite_assets_prefix or args.assets_dir
        rewritten = rewrite_markdown_links(
            original,
            assets_dir=rewrite_assets_prefix,
            public_base_url=public_for_md,
        )
        if args.dry_run:
            print(f"[DRY RUN] would write rewritten markdown: {out_path}")
        else:
            out_path.write_text(rewritten, encoding="utf-8")
            print(f"Rewritten markdown: {out_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
