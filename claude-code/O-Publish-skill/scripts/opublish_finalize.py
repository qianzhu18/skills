#!/usr/bin/env python3
"""One-command finalize pipeline for O-Publish.

Pipeline:
1) Convert Mermaid blocks to PNG (for WeChat compatibility)
2) Optionally upload ./assets to Cloudflare R2
3) Rewrite markdown image links to public URLs
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

DEFAULT_VAULT_ROOT = Path("/Users/mac/qianzhu Vault/自媒体")
DEFAULT_CONTENT_SUBDIR = "02-内容生产"
LEGACY_PATH_HINTS = (
    "/.claude/obsidian/",
    "/qianzhu Vault/qianzhu Wiki/",
)
PLATFORM_ALIASES = {
    "wechat": {"wechat", "weixin", "mp", "公众号"},
    "xiaohongshu": {"xiaohongshu", "xhs", "rednote", "小红书"},
    "xiaolvshu": {"xiaolvshu", "xiaolvshu", "xiaolushu", "greenbook", "小绿书"},
}
SLOT_COMMENT_RE = re.compile(r"^\s*<!--\s*配图位置[：:].*?-->\s*$")


def run_cmd(cmd: list[str]) -> None:
    result = subprocess.run(cmd, text=True, capture_output=True)
    if result.returncode != 0:
        msg = (result.stderr or result.stdout or "").strip()
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\n{msg}")


def parse_opublish_block(md_text: str) -> dict[str, str]:
    lines = md_text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}
    end_idx = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end_idx = i
            break
    if end_idx is None:
        return {}
    fm = lines[1:end_idx]

    in_opublish = False
    opublish_indent = None
    out: dict[str, str] = {}
    for raw in fm:
        if not raw.strip():
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        line = raw.strip()
        if re.match(r"^opublish\s*:\s*$", line):
            in_opublish = True
            opublish_indent = indent
            continue
        if in_opublish and opublish_indent is not None and indent <= opublish_indent:
            in_opublish = False
        if not in_opublish:
            continue
        m = re.match(r"^([A-Za-z0-9_.-]+)\s*:\s*(.+?)\s*$", line)
        if not m:
            continue
        key = m.group(1)
        val = m.group(2).strip().strip('"').strip("'")
        out[key] = val
    return out


def parse_top_frontmatter(md_text: str) -> dict[str, str]:
    lines = md_text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}
    end_idx = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end_idx = i
            break
    if end_idx is None:
        return {}
    out: dict[str, str] = {}
    for raw in lines[1:end_idx]:
        indent = len(raw) - len(raw.lstrip(" "))
        line = raw.strip()
        if not line or ":" not in line:
            continue
        if indent != 0:
            continue
        m = re.match(r"^([A-Za-z0-9_.-]+)\s*:\s*(.+?)\s*$", line)
        if not m:
            continue
        key = m.group(1)
        val = m.group(2).strip().strip('"').strip("'")
        out[key] = val
    return out


def sync_cover_preview(md_text: str, platform: str) -> tuple[str, bool]:
    """Keep the article's top preview image aligned with frontmatter cover URL.

    This avoids stale manual preview images after hosted rewrite.
    """
    if platform == "xiaolvshu":
        return md_text, False

    top = parse_top_frontmatter(md_text)
    cover = (top.get("cover") or "").strip()
    if not cover:
        return md_text, False

    lines = md_text.splitlines()
    if not lines or lines[0].strip() != "---":
        return md_text, False

    fm_end = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            fm_end = i
            break
    if fm_end is None:
        return md_text, False

    body_start = fm_end + 1
    first_img_idx = None
    first_alt = ""
    first_path = ""
    img_pat = re.compile(r"^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$")
    for i in range(body_start, len(lines)):
        m = img_pat.match(lines[i])
        if not m:
            continue
        first_img_idx = i
        first_alt = (m.group(1) or "").strip()
        first_path = (m.group(2) or "").strip()
        break

    def should_replace() -> bool:
        if first_img_idx is None:
            return True
        if first_path == cover:
            return False
        if "封面" in first_alt:
            return True
        if "cover" in first_path.lower():
            return True
        # If first image appears very early, it is usually the hero/cover preview.
        return (first_img_idx - body_start) <= 20

    if not should_replace():
        return md_text, False

    if first_img_idx is None:
        insert_block = [f"![封面图]({cover})", ""]
        new_lines = lines[:body_start] + insert_block + lines[body_start:]
        return ("\n".join(new_lines).rstrip() + "\n"), True

    alt = first_alt or "封面图"
    lines[first_img_idx] = f"![{alt}]({cover})"
    return ("\n".join(lines).rstrip() + "\n"), True


def strip_slot_comments(md_text: str) -> tuple[str, bool]:
    lines = md_text.splitlines()
    filtered = [line for line in lines if not SLOT_COMMENT_RE.match(line)]
    changed = len(filtered) != len(lines)
    if not changed:
        return md_text, False
    return ("\n".join(filtered).rstrip() + "\n"), True


def bool_value(v: str | None, default: bool = False) -> bool:
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


def resolve_value(cli_val: str | None, fm: dict[str, str], fm_key: str, env_key: str) -> str | None:
    if cli_val:
        return cli_val
    if fm.get(fm_key):
        return fm[fm_key]
    return os.getenv(env_key)


def normalize_platform(raw: str | None) -> str:
    if not raw:
        return ""
    platform = raw.strip().lower()
    for canonical, aliases in PLATFORM_ALIASES.items():
        if platform in aliases:
            return canonical
    return platform


def assets_prefix_variants(assets_dir_raw: str) -> list[str]:
    assets = assets_dir_raw.strip() or "./assets"
    variants = [assets]
    if assets.startswith("./"):
        variants.append(assets[2:])
    else:
        variants.append(f"./{assets}")
    return variants


def find_missing_assets(md_text: str, assets_dir_raw: str, assets_path: Path) -> list[str]:
    """Return a list of missing local asset paths referenced from markdown.

    This keeps prompt-pack generation from creating extra files when assets are already present.
    """
    variants = assets_prefix_variants(assets_dir_raw)
    missing: list[str] = []

    # Markdown images: ![alt](path)
    for m in re.finditer(r"!\[[^\]]*\]\(([^)]+)\)", md_text):
        path = m.group(1).strip()
        if path.startswith(("http://", "https://")):
            continue
        for v in variants:
            if path.startswith(v + "/"):
                rel = path[len(v) + 1 :]
                p = (assets_path / rel).resolve()
                if not p.exists():
                    missing.append(path)
                break

    # Frontmatter cover field: cover: ./assets/xxx.png
    lines = md_text.splitlines()
    if lines and lines[0].strip() == "---":
        end_idx = None
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                end_idx = i
                break
        if end_idx is not None:
            cover_re = re.compile(r"^\s*cover\s*:\s*['\"]?([^'\"]+)['\"]?\s*$")
            for raw in lines[1:end_idx]:
                m = cover_re.match(raw)
                if not m:
                    continue
                path = m.group(1).strip()
                if path.startswith(("http://", "https://")):
                    continue
                for v in variants:
                    if path.startswith(v + "/"):
                        rel = path[len(v) + 1 :]
                        p = (assets_path / rel).resolve()
                        if not p.exists():
                            missing.append(path)
                        break
                break

    # De-dup while keeping order
    seen = set()
    out: list[str] = []
    for p in missing:
        if p in seen:
            continue
        seen.add(p)
        out.append(p)
    return out


def strip_frontmatter(md_text: str) -> str:
    lines = md_text.splitlines()
    if not lines or lines[0].strip() != "---":
        return md_text
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            return "\n".join(lines[i + 1 :])
    return md_text


def to_plain_text_xiaolvshu(md_text: str, max_chars: int = 1000) -> str:
    text = strip_frontmatter(md_text)
    text = re.sub(r"```[\s\S]*?```", "", text)
    text = re.sub(r"!\[[^\]]*]\([^)]+\)", "", text)
    text = re.sub(r"\[([^\]]+)]\([^)]+\)", r"\1", text)
    text = re.sub(r"^\s{0,3}#{1,6}\s*", "", text, flags=re.M)
    text = re.sub(r"^\s{0,3}>\s?", "", text, flags=re.M)
    text = re.sub(r"^\s*[-*+]\s+", "", text, flags=re.M)
    text = re.sub(r"^\s*\d+\.\s+", "", text, flags=re.M)
    text = text.replace("`", "")
    text = text.replace("*", "")
    text = text.replace("_", "")
    text = re.sub(r"\n{3,}", "\n\n", text).strip()

    count = 0
    out: list[str] = []
    for ch in text:
        if ch.isspace():
            out.append(ch)
            continue
        if count >= max_chars:
            break
        out.append(ch)
        count += 1
    return "".join(out).strip()


def is_subpath(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def vault_root() -> Path:
    raw = os.getenv("OPUBLISH_VAULT_ROOT")
    if raw:
        return Path(raw).expanduser().resolve()
    return DEFAULT_VAULT_ROOT


def ensure_supported_path(path: Path, *, label: str, root: Path) -> None:
    text = str(path)
    if any(token in text for token in LEGACY_PATH_HINTS):
        raise ValueError(f"{label} points to deprecated legacy path: {path}")
    if not is_subpath(path, root):
        raise ValueError(f"{label} must be under vault root `{root}`: {path}")


def detect_default_output_dir(root: Path) -> Path:
    return (root / DEFAULT_CONTENT_SUBDIR).resolve()


def resolve_output_dir(
    cli_output_dir: str | None,
    fm_output_dir: str | None,
    root: Path,
) -> Path:
    raw = cli_output_dir or fm_output_dir or os.getenv("OPUBLISH_OUTPUT_DIR")
    if raw:
        p = Path(raw).expanduser()
        if not p.is_absolute():
            p = (root / p).resolve()
        return p
    return detect_default_output_dir(root)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Finalize O-Publish output: Mermaid->PNG, R2 upload, URL rewrite."
    )
    parser.add_argument("-i", "--input", required=True, help="Input markdown path")
    parser.add_argument(
        "--assets-dir",
        help="Assets directory (default from frontmatter opublish.assets_dir or ./assets, relative to output-dir)",
    )
    parser.add_argument(
        "--output-dir",
        help=(
            "Output directory for generated markdown artifacts. "
            "Default: /Users/mac/qianzhu Vault/自媒体/02-内容生产"
        ),
    )
    parser.add_argument(
        "--wechat-compatible",
        action="store_true",
        help="Force Mermaid->PNG conversion regardless of frontmatter platform",
    )
    parser.add_argument("--skip-mermaid", action="store_true", help="Skip Mermaid conversion")
    parser.add_argument("--auto-upload", action="store_true", help="Force upload to R2")
    parser.add_argument("--skip-upload", action="store_true", help="Skip upload to R2")
    parser.add_argument("--r2-endpoint", help="R2 S3 endpoint")
    parser.add_argument(
        "--r2-bucket",
        help="R2 bucket name (required if endpoint does not include /<bucket>)",
    )
    parser.add_argument("--r2-public-base-url", help="R2 public base URL")
    parser.add_argument("--r2-prefix", default=None, help="Optional key prefix in bucket")
    parser.add_argument(
        "--skip-prompt-pack",
        action="store_true",
        help="Skip generating prompt-pack markdown",
    )
    parser.add_argument(
        "--prompt-pack-output",
        help="Prompt pack markdown output path (default: <output-dir>/<input>-prompt-pack.md)",
    )
    parser.add_argument(
        "--slotted-output",
        help="Optional slotted markdown output path",
    )
    parser.add_argument(
        "--output",
        help=(
            "Final output markdown path "
            "(default: <output-dir>/<input>-<platform>-hosted.md if uploaded, else <output-dir>/<input>-<platform>.md)"
        ),
    )
    parser.add_argument(
        "--skip-cover-sync",
        action="store_true",
        help="Skip syncing the top preview image with frontmatter cover",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print commands without executing")
    args = parser.parse_args()

    input_path = Path(args.input).expanduser().resolve()
    if not input_path.exists():
        sys.stderr.write(f"Input markdown not found: {input_path}\n")
        return 2

    root = vault_root()
    if any(token in str(input_path) for token in LEGACY_PATH_HINTS):
        sys.stderr.write(
            f"Input markdown is under deprecated legacy path: {input_path}\n"
            f"Please move to vault root: {root}\n"
        )
        return 3

    raw = input_path.read_text(encoding="utf-8")
    opublish = parse_opublish_block(raw)
    output_dir = resolve_output_dir(args.output_dir, opublish.get("output_dir"), root)
    try:
        ensure_supported_path(output_dir, label="Output directory", root=root)
    except ValueError as exc:
        sys.stderr.write(str(exc) + "\n")
        return 3
    output_dir.mkdir(parents=True, exist_ok=True)

    if args.assets_dir:
        assets_dir_raw = args.assets_dir
    else:
        assets_dir_raw = opublish.get("assets_dir") or "./assets"
    assets_base = output_dir
    assets_candidate = Path(assets_dir_raw).expanduser()
    assets_path = (
        assets_candidate.resolve()
        if assets_candidate.is_absolute()
        else (assets_base / assets_candidate).resolve()
    )
    try:
        ensure_supported_path(assets_path, label="Assets directory", root=root)
    except ValueError as exc:
        sys.stderr.write(str(exc) + "\n")
        return 3
    assets_path.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {output_dir}")
    print(f"Assets directory: {assets_path}")

    platform = normalize_platform(opublish.get("platform"))
    need_wechat = args.wechat_compatible or platform == "wechat"

    # Step 0: build consolidated prompt pack markdown only when needed.
    # Default behavior: generate prompt-pack when local assets are missing, or when user explicitly
    # requests custom output paths.
    missing_assets = find_missing_assets(raw, assets_dir_raw=assets_dir_raw, assets_path=assets_path)
    should_prompt_pack = (not args.skip_prompt_pack) and (
        bool(missing_assets) or bool(args.prompt_pack_output) or bool(args.slotted_output)
    )
    if should_prompt_pack:
        if missing_assets:
            print(f"[WARN] Missing local assets referenced in markdown: {len(missing_assets)}")
        prompt_pack_output = (
            Path(args.prompt_pack_output).expanduser().resolve()
            if args.prompt_pack_output
            else output_dir / f"{input_path.stem}-prompt-pack.md"
        )
        prompt_cmd = [
            "python3",
            str(Path(__file__).resolve().parent / "build_image_prompt_package.py"),
            "-i",
            str(input_path),
            "--assets-dir",
            str(assets_path),
            "--platform",
            platform or "wechat",
            "--cover-platform",
            platform or "wechat",
            "--prompt-pack-output",
            str(prompt_pack_output),
        ]
        if args.slotted_output:
            prompt_cmd += ["--slotted-output", str(Path(args.slotted_output).expanduser().resolve())]
        if args.dry_run:
            print("[DRY RUN]", " ".join(prompt_cmd))
        else:
            run_cmd(prompt_cmd)
    elif not args.skip_prompt_pack:
        print("[OK] Prompt pack skipped (no missing local assets). Use --prompt-pack-output to force.")

    # Step 1: Mermaid conversion
    effective_input = input_path
    has_mermaid = bool(re.search(r"```\\s*mermaid\\b", raw, flags=re.IGNORECASE))
    if not args.skip_mermaid and need_wechat and has_mermaid:
        wx_out = output_dir / f"{input_path.stem}-wx{input_path.suffix}"
        cmd = [
            "python3",
            str(Path(__file__).resolve().parent / "mermaid_to_png_replace.py"),
            "-i",
            str(input_path),
            "-o",
            str(wx_out),
            "--image-dir",
            str(assets_path),
        ]
        if args.dry_run:
            print("[DRY RUN]", " ".join(cmd))
        else:
            run_cmd(cmd)
        effective_input = wx_out

    # Resolve R2 settings
    endpoint = resolve_value(args.r2_endpoint, opublish, "r2_endpoint", "OPUBLISH_R2_ENDPOINT")
    bucket = resolve_value(args.r2_bucket, opublish, "r2_bucket", "OPUBLISH_R2_BUCKET")
    public_url = resolve_value(
        args.r2_public_base_url,
        opublish,
        "r2_public_base_url",
        "OPUBLISH_R2_PUBLIC_BASE_URL",
    )
    prefix = (
        args.r2_prefix
        if args.r2_prefix is not None
        else opublish.get("r2_prefix") or os.getenv("OPUBLISH_R2_PREFIX") or ""
    )

    # Upload decision
    auto_upload_flag = bool_value(opublish.get("auto_upload"), default=False)
    should_upload = False
    if args.skip_upload:
        should_upload = False
    elif args.auto_upload:
        should_upload = True
    elif auto_upload_flag:
        should_upload = True
    elif endpoint and public_url:
        # If endpoint/public URL are configured, default to upload for one-click flow.
        should_upload = True

    final_out = Path(args.output).expanduser().resolve() if args.output else None
    if should_upload:
        if not endpoint or not public_url:
            sys.stderr.write(
                "Upload enabled but missing R2 settings. Need endpoint and public URL.\n"
            )
            return 4

        upload_cmd = [
            "python3",
            str(Path(__file__).resolve().parent / "upload_assets_to_r2.py"),
            "--assets-dir",
            str(assets_path),
            "--s3-endpoint",
            endpoint,
            "--public-base-url",
            public_url,
            "--rewrite-assets-prefix",
            assets_dir_raw,
            "--markdown",
            str(effective_input),
        ]
        if bucket:
            upload_cmd += ["--bucket", bucket]
        if prefix:
            upload_cmd += ["--prefix", prefix]
        if final_out:
            upload_cmd += ["--output-markdown", str(final_out)]
        if args.dry_run:
            print("[DRY RUN]", " ".join(upload_cmd))
        else:
            run_cmd(upload_cmd)
        if final_out is None:
            final_out = output_dir / f"{input_path.stem}-hosted{input_path.suffix}"
    else:
        if final_out:
            if args.dry_run:
                print("[DRY RUN] copy", effective_input, "->", final_out)
            else:
                final_out.write_text(effective_input.read_text(encoding="utf-8"), encoding="utf-8")
        else:
            final_out = effective_input

    if platform == "xiaolvshu":
        txt_out = output_dir / f"{input_path.stem}-xiaolvshu-ready.txt"
        if args.dry_run:
            print("[DRY RUN] generate xiaolvshu plain text:", txt_out)
        else:
            source_text = final_out.read_text(encoding="utf-8")
            txt_out.write_text(to_plain_text_xiaolvshu(source_text, max_chars=1000) + "\n", encoding="utf-8")
            print(f"Xiaolvshu plain text: {txt_out}")

    if not args.skip_cover_sync and not args.dry_run and final_out.exists():
        final_text = final_out.read_text(encoding="utf-8")
        synced_text, changed = sync_cover_preview(final_text, platform)
        cleaned_text, cleaned = strip_slot_comments(synced_text)
        if changed or cleaned:
            final_out.write_text(cleaned_text, encoding="utf-8")
        if changed:
            print("[OK] synced top preview image with frontmatter cover")
        if cleaned:
            print("[OK] removed internal image-slot comments from hosted markdown")

    print(f"Final markdown: {final_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
