#!/usr/bin/env python3
"""Build image prompt package for O-Publish.

Default output is a single markdown summary file for Obsidian.
JSON file output is optional and disabled by default.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
IMG_MARKER_RE = re.compile(r"<!--\s*IMG:\s*(.*?)\s*-->")
MD_IMAGE_RE = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")
DEFAULT_VAULT_ROOT = Path("/Users/mac/qianzhu Vault/自媒体")
DEFAULT_CONTENT_SUBDIR = "02-内容生产"
LEGACY_PATH_HINTS = ("/.claude/obsidian/", "/qianzhu Vault/qianzhu Wiki/")
PLATFORM_ALIASES = {
    "wechat": {"wechat", "weixin", "mp", "公众号"},
    "xiaohongshu": {"xiaohongshu", "xhs", "rednote", "小红书"},
    "xiaolvshu": {"xiaolvshu", "xiaolvshu", "xiaolushu", "greenbook", "小绿书"},
}


@dataclass
class Heading:
    line_no: int
    level: int
    text: str


@dataclass
class Marker:
    line_no: int
    prompt_text: str
    heading: str | None


def default_content_output_dir() -> Path:
    raw_root = os.getenv("OPUBLISH_VAULT_ROOT")
    root = Path(raw_root).expanduser().resolve() if raw_root else DEFAULT_VAULT_ROOT
    raw_output = os.getenv("OPUBLISH_OUTPUT_DIR")
    if raw_output:
        candidate = Path(raw_output).expanduser()
        output = candidate if candidate.is_absolute() else (root / candidate)
    else:
        output = root / DEFAULT_CONTENT_SUBDIR
    output = output.resolve()
    if any(token in str(output) for token in LEGACY_PATH_HINTS):
        raise SystemExit(f"Output path is deprecated legacy location: {output}")
    try:
        output.relative_to(root)
    except ValueError:
        raise SystemExit(f"Output path must be under vault root `{root}`: {output}")
    return output


def normalize_platform(raw: str | None) -> str:
    if not raw:
        return ""
    platform = raw.strip().lower()
    for canonical, aliases in PLATFORM_ALIASES.items():
        if platform in aliases:
            return canonical
    return platform


def resolve_article_image_mode(mode: str, platform: str) -> str:
    if mode != "auto":
        return mode
    if platform == "xiaolvshu":
        return "cover-only"
    return "with-inline"


def parse_frontmatter(lines: list[str]) -> tuple[int | None, dict[str, str]]:
    if not lines or lines[0].strip() != "---":
        return None, {}
    data: dict[str, str] = {}
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            return i, data
        m = re.match(r"^([A-Za-z0-9_-]+)\s*:\s*(.+?)\s*$", lines[i])
        if m:
            data[m.group(1).strip()] = m.group(2).strip().strip('"').strip("'")
    return None, {}


def get_title(lines: list[str], fm: dict[str, str], default_stem: str) -> str:
    if fm.get("title"):
        return fm["title"]
    for line in lines:
        m = re.match(r"^#\s+(.+?)\s*$", line)
        if m:
            return m.group(1).strip()
    return default_stem


def collect_headings(lines: list[str]) -> list[Heading]:
    headings: list[Heading] = []
    for idx, line in enumerate(lines, start=1):
        m = HEADING_RE.match(line)
        if not m:
            continue
        headings.append(Heading(line_no=idx, level=len(m.group(1)), text=m.group(2).strip()))
    return headings


def nearest_heading(headings: list[Heading], line_no: int) -> str | None:
    nearest = None
    for h in headings:
        if h.line_no <= line_no:
            nearest = h.text
        else:
            break
    return nearest


def collect_markers(lines: list[str], headings: list[Heading]) -> list[Marker]:
    markers: list[Marker] = []
    for idx, line in enumerate(lines, start=1):
        m = IMG_MARKER_RE.search(line)
        if not m:
            continue
        markers.append(
            Marker(
                line_no=idx,
                prompt_text=m.group(1).strip(),
                heading=nearest_heading(headings, idx),
            )
        )
    return markers


def collect_existing_local_images(lines: list[str], assets_dir: str) -> list[str]:
    local_paths: list[str] = []
    assets = assets_dir.strip() or "./assets"
    variants = [assets]
    if assets.startswith("./"):
        variants.append(assets[2:])
    else:
        variants.append(f"./{assets}")
    for line in lines:
        m = MD_IMAGE_RE.search(line)
        if not m:
            continue
        p = m.group(1).strip()
        for v in variants:
            if p.startswith(v + "/"):
                local_paths.append(p)
                break
    return local_paths


def first_text_excerpt(lines: list[str], max_chars: int = 180) -> str:
    start_idx = 0
    if lines and lines[0].strip() == "---":
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                start_idx = i + 1
                break
    chunks: list[str] = []
    for line in lines[start_idx:]:
        s = line.strip()
        if not s:
            continue
        if s.startswith("#") or s.startswith("```") or s.startswith("![") or s.startswith("<!--"):
            continue
        chunks.append(s)
        if sum(len(x) for x in chunks) >= max_chars:
            break
    joined = " ".join(chunks)
    return joined[:max_chars].strip()


def build_slots(
    *,
    markers: list[Marker],
    headings: list[Heading],
    max_auto_slots: int,
    stem: str,
    assets_dir: str,
) -> list[dict]:
    slots: list[dict] = []
    if markers:
        for i, m in enumerate(markers, start=1):
            slots.append(
                {
                    "id": f"img-{i:02d}",
                    "label": f"IMG-{i:02d}",
                    "source": "marker",
                    "anchor_line": m.line_no,
                    "anchor_heading": m.heading,
                    "instruction": m.prompt_text,
                    "output_path": f"{assets_dir.rstrip('/')}/{stem}-image-{i:02d}.png",
                    "aspect_ratio": "3:4",
                }
            )
        return slots

    h2 = [h for h in headings if h.level == 2][:max_auto_slots]
    if not h2 and headings:
        h2 = headings[:max_auto_slots]
    for i, h in enumerate(h2, start=1):
        slots.append(
            {
                "id": f"img-{i:02d}",
                "label": f"IMG-{i:02d}",
                "source": "auto",
                "anchor_line": h.line_no,
                "anchor_heading": h.text,
                "instruction": f"{h.text} 的辅助理解配图，突出步骤、对比或关键概念。",
                "output_path": f"{assets_dir.rstrip('/')}/{stem}-image-{i:02d}.png",
                "aspect_ratio": "3:4",
            }
        )
    return slots


def build_prompt_package(
    *,
    source_path: Path,
    lines: list[str],
    title: str,
    assets_dir: str,
    platform: str,
    article_image_mode: str,
    cover_platform: str,
    slots: list[dict],
    local_images: list[str],
) -> dict:
    excerpt = first_text_excerpt(lines)
    cover_output = f"{assets_dir.rstrip('/')}/{source_path.stem}-cover.png"
    cover_prompt = (
        f"标题：{title}\\n"
        f"平台：{cover_platform}\\n"
        "要求：高辨识度封面图，突出核心观点，文字区域留白，适合社媒封面。"
    )

    pictures = []
    for idx, s in enumerate(slots, start=1):
        heading_text = s.get("anchor_heading") or "正文内容"
        content = (
            f"位置标签：{s['label']}\\n"
            f"插入位置：{heading_text}\\n"
            f"需求：{s['instruction']}"
        )
        pictures.append({"id": idx, "topic": heading_text, "content": content})

    return {
        "version": "1.1",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "source_markdown": str(source_path),
        "platform": platform,
        "article_image_mode": article_image_mode,
        "image_skill_priority": {
            "cover": [
                f"smart-illustrator --mode cover --platform {cover_platform}",
                f"smart-illustrator --mode cover --platform {cover_platform} --prompt-only",
                "baoyu-cover-image",
                "baoyu-image-gen (prompt-only)",
            ],
            "article": [
                "smart-illustrator (article mode)",
                "smart-illustrator --prompt-only (JSON)",
                "baoyu-article-illustrator",
                "baoyu-image-gen (prompt-only)",
            ],
        },
        "cover": {
            "id": "cover-01",
            "label": "COVER",
            "platform": cover_platform,
            "output_path": cover_output,
            "prompt": cover_prompt,
            "context_excerpt": excerpt,
        },
        "article_images": slots,
        "local_reference_images": local_images,
        "smart_illustrator_prompt_only_json": {
            "instruction": (
                f"请为我绘制 {len(pictures)} 张图片（generate {len(pictures)} images）。"
                "你是一位「信息图绘制者」。请逐条执行 pictures 数组："
                "每个 id 对应 1 张独立配图，严禁合并，严禁只输出文字描述。"
            ),
            "batch_rules": {
                "total": len(pictures),
                "one_item_one_image": True,
                "aspect_ratio": "3:4",
                "do_not_merge": True,
            },
            "style_ref": "~/.claude/skills/smart-illustrator/styles/style-light.md",
            "cover_prompt": cover_prompt,
            "pictures": pictures,
        },
    }


def render_prompt_pack_markdown(package: dict) -> str:
    lines: list[str] = []
    title = Path(package["source_markdown"]).stem
    lines.append(f"# Image Prompt Pack - {title}")
    lines.append("")
    lines.append(f"- Generated: `{package['generated_at']}`")
    lines.append(f"- Source: `{package['source_markdown']}`")
    lines.append(f"- Platform: `{package.get('platform', '')}`")
    lines.append(f"- Article Image Mode: `{package.get('article_image_mode', '')}`")
    lines.append("")

    lines.append("## Skill Priority")
    lines.append("")
    lines.append("### Cover")
    for idx, item in enumerate(package["image_skill_priority"]["cover"], start=1):
        lines.append(f"{idx}. `{item}`")
    lines.append("")
    lines.append("### Article")
    for idx, item in enumerate(package["image_skill_priority"]["article"], start=1):
        lines.append(f"{idx}. `{item}`")
    lines.append("")

    cover = package["cover"]
    lines.append("## Cover")
    lines.append("")
    lines.append(f"- Slot: `{cover['label']}`")
    lines.append(f"- Platform: `{cover['platform']}`")
    lines.append(f"- Output: `{cover['output_path']}`")
    lines.append("")
    lines.append("### Cover Prompt")
    lines.append("")
    lines.append("```text")
    lines.append(cover["prompt"])
    lines.append("```")
    lines.append("")

    slots = package["article_images"]
    lines.append("## Article Image Slots")
    lines.append("")
    if not slots:
        lines.append("_No image slots detected. Auto prompts are still available below._")
        lines.append("")
    else:
        lines.append("| Slot | Heading | Source | Output | Prompt |")
        lines.append("| --- | --- | --- | --- | --- |")
        for s in slots:
            heading = (s.get("anchor_heading") or "正文内容").replace("|", "\\|")
            prompt = s["instruction"].replace("|", "\\|")
            lines.append(
                f"| `{s['label']}` | {heading} | `{s['source']}` | `{s['output_path']}` | {prompt} |"
            )
        lines.append("")

    lines.append("## Prompt-Only JSON (embedded)")
    lines.append("")
    lines.append("```json")
    lines.append(json.dumps(package["smart_illustrator_prompt_only_json"], ensure_ascii=False, indent=2))
    lines.append("```")
    lines.append("")

    lines.append("## Existing Local Images")
    lines.append("")
    local_images = package.get("local_reference_images", [])
    if local_images:
        for p in local_images:
            lines.append(f"- `{p}`")
    else:
        lines.append("- _No existing local images found under assets prefix._")
    lines.append("")

    lines.append("## Copy-Ready Prompts")
    lines.append("")
    lines.append("### Cover")
    lines.append("```text")
    lines.append(cover["prompt"])
    lines.append("```")
    lines.append("")
    lines.append("### Article")
    if not slots:
        lines.append("- _No slots; add `<!--IMG: ... -->` markers or headings in source article._")
    else:
        for s in slots:
            lines.append(f"#### {s['label']}")
            lines.append("```text")
            lines.append(
                f"位置标签：{s['label']}\\n插入位置：{s.get('anchor_heading') or '正文内容'}\\n需求：{s['instruction']}"
            )
            lines.append("```")
            lines.append("")

    lines.append("## Slot Insertion Template")
    lines.append("")
    lines.append(f"- `![COVER 封面图]({cover['output_path']})`")
    if slots:
        for s in slots:
            lines.append(f"- `![{s['label']} 插图]({s['output_path']})`")
    else:
        lines.append("- _No article slot generated._")
    lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def write_slotted_markdown(
    *,
    lines: list[str],
    out_path: Path,
    fm_end_idx: int | None,
    stem: str,
    assets_dir: str,
    slots: list[dict],
) -> None:
    slot_by_line = {s["anchor_line"]: s for s in slots}
    marker_lines = {s["anchor_line"] for s in slots if s["source"] == "marker"}
    result: list[str] = []

    cover_block = [
        "<!--COVER_SLOT: cover-01-->",
        f"![COVER 封面图]({assets_dir.rstrip('/')}/{stem}-cover.png)",
        "",
    ]

    inserted_cover = False
    cover_insert_line = 1 if fm_end_idx is None else fm_end_idx + 2
    for idx, line in enumerate(lines, start=1):
        if not inserted_cover and idx == cover_insert_line:
            result.extend(cover_block)
            inserted_cover = True

        marker_match = IMG_MARKER_RE.search(line)
        if marker_match and idx in marker_lines:
            s = slot_by_line[idx]
            result.append(f"<!--IMG_SLOT: {s['id']} | {s['instruction']}-->")
            result.append(f"![{s['label']} 插图]({s['output_path']})")
            result.append("")
            continue

        result.append(line)
        if idx in slot_by_line and idx not in marker_lines:
            s = slot_by_line[idx]
            result.append(f"<!--IMG_SLOT: {s['id']} | {s['instruction']}-->")
            result.append(f"![{s['label']} 插图]({s['output_path']})")
            result.append("")

    if not inserted_cover:
        result = cover_block + result

    out_path.write_text("\n".join(result).rstrip() + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Generate prompt pack markdown for image fallback workflow. "
            "JSON output is optional."
        )
    )
    parser.add_argument("-i", "--input", required=True, help="Input markdown file")
    parser.add_argument(
        "--platform",
        default="",
        help="Target platform (wechat | xiaohongshu | xiaolvshu). Controls image-slot policy.",
    )
    parser.add_argument(
        "--article-image-mode",
        choices=["auto", "cover-only", "with-inline"],
        default="auto",
        help="Article image slot policy (default: auto by platform)",
    )
    parser.add_argument("--assets-dir", default="./assets", help="Assets dir prefix")
    parser.add_argument(
        "--cover-platform",
        default="",
        help="Cover platform (default: same as --platform)",
    )
    parser.add_argument("--max-auto-slots", type=int, default=4, help="Max auto slots")
    parser.add_argument(
        "--prompt-pack-output",
        help="Output markdown summary path (default: <vault>/02-内容生产/<input>-prompt-pack.md)",
    )
    parser.add_argument("--slotted-output", help="Output slotted markdown path (optional)")
    parser.add_argument("--write-json", action="store_true", help="Also write JSON package")
    parser.add_argument("--json-output", help="Output JSON path")
    parser.add_argument(
        "--json-only",
        action="store_true",
        help="Compatibility mode: only write standalone JSON package",
    )
    args = parser.parse_args()

    input_path = Path(args.input).expanduser().resolve()
    if not input_path.exists():
        raise SystemExit(f"Input markdown not found: {input_path}")

    text = input_path.read_text(encoding="utf-8")
    lines = text.splitlines()
    platform = normalize_platform(args.platform or args.cover_platform)
    if not platform:
        platform = "wechat"
    cover_platform = normalize_platform(args.cover_platform) or platform
    article_image_mode = resolve_article_image_mode(args.article_image_mode, platform)
    fm_end_idx, fm_data = parse_frontmatter(lines)
    title = get_title(lines, fm_data, input_path.stem)
    headings = collect_headings(lines)
    markers = collect_markers(lines, headings)
    local_images = collect_existing_local_images(lines, args.assets_dir)
    slots: list[dict] = []
    if article_image_mode == "with-inline":
        slots = build_slots(
            markers=markers,
            headings=headings,
            max_auto_slots=args.max_auto_slots,
            stem=input_path.stem,
            assets_dir=args.assets_dir,
        )

    package = build_prompt_package(
        source_path=input_path,
        lines=lines,
        title=title,
        assets_dir=args.assets_dir,
        platform=platform,
        article_image_mode=article_image_mode,
        cover_platform=cover_platform,
        slots=slots,
        local_images=local_images,
    )
    default_out_dir = default_content_output_dir()
    default_out_dir.mkdir(parents=True, exist_ok=True)

    json_out = (
        Path(args.json_output).expanduser().resolve()
        if args.json_output
        else default_out_dir / f"{input_path.stem}-image-prompts.json"
    )

    if args.json_only:
        json_out.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"JSON prompt package: {json_out}")
        return 0

    prompt_out = (
        Path(args.prompt_pack_output).expanduser().resolve()
        if args.prompt_pack_output
        else default_out_dir / f"{input_path.stem}-prompt-pack.md"
    )
    prompt_out.write_text(render_prompt_pack_markdown(package), encoding="utf-8")
    print(f"Prompt pack markdown: {prompt_out}")

    if args.slotted_output:
        md_out = Path(args.slotted_output).expanduser().resolve()
        write_slotted_markdown(
            lines=lines,
            out_path=md_out,
            fm_end_idx=fm_end_idx,
            stem=input_path.stem,
            assets_dir=args.assets_dir,
            slots=slots,
        )
        print(f"Slotted markdown: {md_out}")

    if args.write_json:
        json_out.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"JSON prompt package: {json_out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
