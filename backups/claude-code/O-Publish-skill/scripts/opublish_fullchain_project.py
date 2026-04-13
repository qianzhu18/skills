#!/usr/bin/env python3
"""Project-level one-click full chain for Obsidian O-Publish.

Flow:
1) Discover platform source markdown files in this project.
2) Generate missing local images referenced by markdown/frontmatter cover.
3) If image generation fails, create a single *-prompt-pack.md fallback.
4) Run opublish_finalize.py to upload assets and write hosted markdown.

This script is project-local and reusable for new topic projects.
"""

from __future__ import annotations

import argparse
import html
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


VAULT_ROOT = Path("/Users/mac/qianzhu Vault/自媒体").resolve()
IMAGE_GEN_TS = Path("/Users/mac/.codex/skills/baoyu-image-gen/scripts/main.ts")
GEMINI_WEB_TS = Path("/Users/mac/.codex/skills/baoyu-danger-gemini-web/scripts/main.ts")
SMART_IMAGE_GEN_TS = Path("/Users/mac/.claude/skills/smart-illustrator/scripts/generate-image.ts")
SMART_MERMAID_EXPORT_TS = Path("/Users/mac/.claude/skills/smart-illustrator/scripts/mermaid-export.ts")
BUILD_PROMPT_PACK_PY = Path("/Users/mac/.claude/skills/O-Publish-skill/scripts/build_image_prompt_package.py")
FINALIZE_PY = Path("/Users/mac/.claude/skills/O-Publish-skill/scripts/opublish_finalize.py")

IGNORE_SUFFIXES = ("-hosted.md", "-wx.md", "-xiaohongshu.md", "-prompt-pack.md")
PLATFORM_DIRS = ("公众号", "小红书", "小绿书")
PLATFORM_ALIASES = {
    "wechat": {"wechat", "weixin", "mp", "公众号"},
    "xiaohongshu": {"xiaohongshu", "xhs", "rednote", "小红书"},
    "xiaolvshu": {"xiaolvshu", "xiaolushu", "greenbook", "小绿书"},
}
DEFAULT_ASSETS_REL = "../assets"
INLINE_IMAGE_COUNT = {
    "wechat": 5,
    "xiaohongshu": 4,
}

IMG_RE = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")
HEADING_RE = re.compile(r"^\s{0,3}#{1,6}\s+(.+?)\s*$")
IMG_SLOT_RE = re.compile(r"^\s*<!--\s*配图位置[：:]\s*(.+?)\s*-->\s*$")


@dataclass
class ImageNeed:
    platform: str
    article_path: Path
    image_path: Path
    rel_path: str
    title: str
    heading: str
    alt: str
    is_cover: bool
    content_mode: str


def run(
    cmd: list[str],
    *,
    cwd: Path | None = None,
    check: bool = True,
    timeout_sec: int | None = None,
) -> subprocess.CompletedProcess[str]:
    try:
        p = subprocess.run(
            cmd,
            cwd=str(cwd) if cwd else None,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout_sec,
        )
    except subprocess.TimeoutExpired as exc:
        msg = f"Command timed out after {timeout_sec}s: {' '.join(cmd)}"
        if check:
            raise RuntimeError(msg) from exc
        return subprocess.CompletedProcess(
            cmd,
            returncode=124,
            stdout=exc.stdout or "",
            stderr=(exc.stderr or msg),
        )
    if check and p.returncode != 0:
        msg = (p.stderr or p.stdout).strip()
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\n{msg}")
    return p


def parse_frontmatter(md_text: str) -> tuple[dict[str, str], dict[str, str]]:
    lines = md_text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, {}

    end = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end = i
            break
    if end is None:
        return {}, {}

    top: dict[str, str] = {}
    opublish: dict[str, str] = {}
    in_opublish = False
    op_indent = 0
    for raw in lines[1:end]:
        if not raw.strip():
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        line = raw.strip()

        if re.match(r"^opublish\s*:\s*$", line):
            in_opublish = True
            op_indent = indent
            continue

        if in_opublish and indent <= op_indent:
            in_opublish = False

        m = re.match(r"^([A-Za-z0-9_.-]+)\s*:\s*(.+?)\s*$", line)
        if not m:
            continue
        key = m.group(1)
        val = m.group(2).strip().strip('"').strip("'")
        if in_opublish:
            opublish[key] = val
        else:
            top[key] = val
    return top, opublish


def discover_primary_markdown(platform_dir: Path) -> Path | None:
    if not platform_dir.exists():
        return None

    candidates = []
    for p in sorted(platform_dir.glob("*.md")):
        name = p.name
        if any(name.endswith(suffix) for suffix in IGNORE_SUFFIXES):
            continue
        candidates.append(p)
    if not candidates:
        return None

    # Prefer v2/deep version if present, else latest modified.
    v2 = [p for p in candidates if "-v2" in p.stem.lower()]
    if v2:
        return sorted(v2, key=lambda x: x.stat().st_mtime, reverse=True)[0]
    return sorted(candidates, key=lambda x: x.stat().st_mtime, reverse=True)[0]


def resolve_path(base: Path, rel: str) -> Path:
    path = Path(rel).expanduser()
    if path.is_absolute():
        return path.resolve()
    return (base / path).resolve()


def safe_mode(raw: str | None) -> str:
    v = (raw or "").strip().lower()
    if v in ("cognitive", "认知科普"):
        return "cognitive"
    return "technical"


def canonical_platform(raw: str | None, parent_name: str) -> str:
    if raw:
        value = raw.strip().lower()
        for canonical, aliases in PLATFORM_ALIASES.items():
            if value in aliases:
                return canonical
    return infer_platform_by_parent(parent_name)


def parse_platforms_arg(raw: str | None) -> set[str]:
    if not raw:
        return set()
    out: set[str] = set()
    for part in raw.split(","):
        token = part.strip().lower()
        if not token:
            continue
        found = False
        for canonical, aliases in PLATFORM_ALIASES.items():
            if token in aliases:
                out.add(canonical)
                found = True
                break
        if not found:
            raise ValueError(f"Unsupported platform in --platforms: {part}")
    return out


def slug_for_assets(stem: str) -> str:
    s = stem.strip().replace("/", "-").replace("\\", "-")
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"-{2,}", "-", s)
    return s or "article"


def split_frontmatter(md_text: str) -> tuple[list[str], list[str], bool]:
    lines = md_text.splitlines()
    if lines and lines[0].strip() == "---":
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                return lines[: i + 1], lines[i + 1 :], True
    return [], lines, False


def opublish_block_span(fm_inner: list[str]) -> tuple[int, int] | None:
    for i, raw in enumerate(fm_inner):
        if re.match(r"^\s*opublish\s*:\s*$", raw):
            indent = len(raw) - len(raw.lstrip(" "))
            j = i + 1
            while j < len(fm_inner):
                line = fm_inner[j]
                if line.strip():
                    cur_indent = len(line) - len(line.lstrip(" "))
                    if cur_indent <= indent:
                        break
                j += 1
            return i, j
    return None


def ensure_frontmatter_fields(article_path: Path, md_text: str) -> tuple[str, bool, str]:
    fm, body, has_fm = split_frontmatter(md_text)
    parent_name = article_path.parent.name
    parsed_top, parsed_opublish = parse_frontmatter(md_text)
    platform = canonical_platform(parsed_opublish.get("platform"), parent_name)
    slug = slug_for_assets(article_path.stem)
    cover_rel = f"{DEFAULT_ASSETS_REL}/{slug}-{platform}-cover.png"
    changed = False

    if not has_fm:
        title = parsed_top.get("title") or article_path.stem
        fm_inner = [
            f'title: "{title}"',
            f'cover: "{cover_rel}"',
            "opublish:",
            f"  assets_dir: {DEFAULT_ASSETS_REL}",
            f"  output_dir: {article_path.parent}",
            f"  platform: {platform}",
            "  auto_upload: true",
        ]
        fm = ["---", *fm_inner, "---"]
        changed = True
    else:
        fm_inner = fm[1:-1]

        cover_idx = -1
        title_idx = -1
        for i, raw in enumerate(fm_inner):
            indent = len(raw) - len(raw.lstrip(" "))
            stripped = raw.strip()
            if indent == 0 and re.match(r"^title\s*:", stripped):
                title_idx = i
            if indent == 0 and re.match(r"^cover\s*:", stripped):
                cover_idx = i
                break

        if cover_idx >= 0:
            new_cover_line = f'cover: "{cover_rel}"'
            if fm_inner[cover_idx] != new_cover_line:
                fm_inner[cover_idx] = new_cover_line
                changed = True
        else:
            insert_at = title_idx + 1 if title_idx >= 0 else len(fm_inner)
            fm_inner.insert(insert_at, f'cover: "{cover_rel}"')
            changed = True

        span = opublish_block_span(fm_inner)
        if span is None:
            fm_inner.extend(
                [
                    "opublish:",
                    f"  assets_dir: {DEFAULT_ASSETS_REL}",
                    f"  output_dir: {article_path.parent}",
                    f"  platform: {platform}",
                    "  auto_upload: true",
                ]
            )
            changed = True
        else:
            start, end = span
            has_assets = False
            has_platform = False
            has_auto_upload = False
            for i in range(start + 1, end):
                raw = fm_inner[i]
                m = re.match(r"^\s*([A-Za-z0-9_.-]+)\s*:\s*(.*?)\s*$", raw)
                if not m:
                    continue
                key = m.group(1)
                if key == "assets_dir":
                    if raw.strip() != f"assets_dir: {DEFAULT_ASSETS_REL}":
                        fm_inner[i] = f"  assets_dir: {DEFAULT_ASSETS_REL}"
                        changed = True
                    has_assets = True
                elif key == "platform":
                    desired = f"platform: {platform}"
                    if raw.strip() != desired:
                        fm_inner[i] = f"  {desired}"
                        changed = True
                    has_platform = True
                elif key == "auto_upload":
                    has_auto_upload = True
            insertion: list[str] = []
            if not has_assets:
                insertion.append(f"  assets_dir: {DEFAULT_ASSETS_REL}")
            if not has_platform:
                insertion.append(f"  platform: {platform}")
            if not has_auto_upload:
                insertion.append("  auto_upload: true")
            if insertion:
                fm_inner[end:end] = insertion
                changed = True

        fm = ["---", *fm_inner, "---"]

    normalized = "\n".join([*fm, *body]).rstrip() + "\n"
    return normalized, changed, platform


def sanitize_heading_text(raw: str) -> str:
    text = raw.strip().strip("#").strip()
    text = re.sub(r"[*_`~\[\]()<>]", "", text)
    return text or "文章配图"


def has_nearby_image(lines: list[str], idx: int, max_nonempty: int = 2) -> bool:
    for step in (-1, 1):
        seen = 0
        j = idx + step
        while 0 <= j < len(lines):
            raw = lines[j]
            stripped = raw.strip()
            if not stripped:
                j += step
                continue
            if HEADING_RE.match(raw) or IMG_SLOT_RE.match(raw):
                break
            if IMG_RE.search(raw):
                return True
            seen += 1
            if seen >= max_nonempty:
                break
            j += step
    return False


def next_inline_image_seq(lines: list[str], slug: str, platform: str) -> int:
    pat = re.compile(rf"{re.escape(slug)}-{re.escape(platform)}-(\d+)\.(?:png|jpe?g|webp)\b")
    max_seq = 0
    for raw in lines:
        for m in pat.finditer(raw):
            try:
                max_seq = max(max_seq, int(m.group(1)))
            except ValueError:
                continue
    return max_seq


def ensure_inline_images(article_path: Path, md_text: str, platform: str) -> tuple[str, bool]:
    if platform not in INLINE_IMAGE_COUNT:
        return md_text, False
    lines = md_text.splitlines()
    slug = slug_for_assets(article_path.stem)

    if any(IMG_SLOT_RE.match(line) for line in lines):
        changed = False
        next_seq = next_inline_image_seq(lines, slug, platform)
        out: list[str] = []
        for idx, line in enumerate(lines):
            out.append(line)
            sm = IMG_SLOT_RE.match(line)
            if not sm or has_nearby_image(lines, idx):
                continue
            next_seq += 1
            alt = sm.group(1).strip() or "文章配图"
            rel = f"{DEFAULT_ASSETS_REL}/{slug}-{platform}-{next_seq:02d}.png"
            out.extend(["", f"![{alt}]({rel})", ""])
            changed = True
        if changed:
            return "\n".join(out).rstrip() + "\n", True

    if any(IMG_RE.search(line) for line in lines):
        return md_text, False

    count = INLINE_IMAGE_COUNT[platform]
    heading_positions: list[tuple[int, str]] = []
    for idx, line in enumerate(lines):
        hm = HEADING_RE.match(line)
        if hm:
            heading_positions.append((idx, sanitize_heading_text(hm.group(1))))

    if not heading_positions:
        return md_text, False

    selected = heading_positions[:count]
    mapping: dict[int, list[tuple[str, str]]] = {}
    for i, (idx, heading) in enumerate(selected, start=1):
        rel = f"{DEFAULT_ASSETS_REL}/{slug}-{platform}-{i:02d}.png"
        mapping.setdefault(idx, []).append((heading, rel))

    out: list[str] = []
    for idx, line in enumerate(lines):
        out.append(line)
        for heading, rel in mapping.get(idx, []):
            out.extend(["", f"![{heading}]({rel})", ""])

    return "\n".join(out).rstrip() + "\n", True


def normalize_article_for_fullchain(article_path: Path) -> tuple[str, bool]:
    raw = article_path.read_text(encoding="utf-8")
    first_pass, changed_frontmatter, platform = ensure_frontmatter_fields(article_path, raw)
    second_pass, changed_inline = ensure_inline_images(article_path, first_pass, platform)
    changed = changed_frontmatter or changed_inline
    if changed:
        article_path.write_text(second_pass, encoding="utf-8")
    return platform, changed


def collect_missing_images(article_path: Path) -> tuple[list[ImageNeed], dict[str, str]]:
    text = article_path.read_text(encoding="utf-8")
    top, opublish = parse_frontmatter(text)

    title = top.get("title") or article_path.stem
    platform = canonical_platform(opublish.get("platform"), article_path.parent.name)
    content_mode = safe_mode(opublish.get("content_mode") or top.get("content_mode"))

    lines = text.splitlines()
    heading = ""
    needs: list[ImageNeed] = []

    # Cover from frontmatter
    cover = top.get("cover")
    if cover and not cover.startswith(("http://", "https://")):
        cover_path = resolve_path(article_path.parent, cover)
        if not cover_path.exists():
            needs.append(
                ImageNeed(
                    platform=platform or infer_platform_by_parent(article_path.parent.name),
                    article_path=article_path,
                    image_path=cover_path,
                    rel_path=cover,
                    title=title,
                    heading="封面",
                    alt="封面图",
                    is_cover=True,
                    content_mode=content_mode,
                )
            )

    for raw in lines:
        hm = HEADING_RE.match(raw)
        if hm:
            heading = hm.group(1).strip()

        m = IMG_RE.search(raw)
        if not m:
            continue
        alt = m.group(1).strip() or "文章配图"
        rel = m.group(2).strip()
        if rel.startswith(("http://", "https://")):
            continue
        path = resolve_path(article_path.parent, rel)
        if path.exists():
            continue

        needs.append(
            ImageNeed(
                platform=platform or infer_platform_by_parent(article_path.parent.name),
                article_path=article_path,
                image_path=path,
                rel_path=rel,
                title=title,
                heading=heading,
                alt=alt,
                is_cover=False,
                content_mode=content_mode,
            )
        )
    return needs, opublish


def infer_platform_by_parent(parent: str) -> str:
    if parent == "公众号":
        return "wechat"
    if parent == "小红书":
        return "xiaohongshu"
    if parent == "小绿书":
        return "xiaolvshu"
    return "wechat"


def detect_official_api() -> bool:
    key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not key:
        return False
    if os.getenv("GOOGLE_API_KEY") is None:
        os.environ["GOOGLE_API_KEY"] = key
    cmd = [
        "curl",
        "-sS",
        "-o",
        "/tmp/opublish-gemini-models.json",
        "-w",
        "%{http_code}",
        "--connect-timeout",
        "12",
        "--max-time",
        "25",
        f"https://generativelanguage.googleapis.com/v1beta/models?key={key}",
    ]
    try:
        p = run(cmd, check=False)
        return p.stdout.strip() == "200"
    except Exception:
        return False


def aspect_ratio(need: ImageNeed) -> str:
    if need.is_cover:
        # WeChat cover target is 2.35:1; use 21:9 (closest supported ratio).
        return "21:9" if need.platform == "wechat" else "3:4"
    return "4:3" if need.platform == "wechat" else "3:4"


def style_hint(mode: str) -> str:
    if mode == "cognitive":
        return (
            "视觉风格偏思想启发与抽象表达，减少硬技术UI元素，"
            "用隐喻、对比、层次空间表达认知跃迁。"
        )
    return (
        "视觉风格偏技术科普与信息图表达，结构清晰、步骤明确、"
        "强调可操作性与逻辑层次。"
    )


def build_prompt(need: ImageNeed) -> str:
    target = "封面图" if need.is_cover else "正文配图"
    heading = need.heading or need.alt or "核心内容"
    return (
        f"请生成1张中文社媒{target}。"
        f"文章标题：{need.title}。平台：{need.platform}。"
        f"图像主题：{heading}。图像说明：{need.alt}。"
        f"{style_hint(need.content_mode)}"
        "配色高级克制，构图干净，禁止水印，禁止品牌Logo，"
        "画面中不要出现任何可读文字、数字、英文单词。"
    )


def verify_image(path: Path, min_bytes: int = 4096) -> bool:
    if not path.exists():
        return False
    try:
        return path.stat().st_size >= min_bytes
    except OSError:
        return False


def svg_font_stack() -> str:
    return "'Hiragino Sans GB', 'PingFang SC', 'STHeiti SC', 'Arial Unicode MS', sans-serif"


def render_svg_to_png(svg: str, output_path: Path) -> bool:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    svg_path = output_path.with_suffix(".svg")
    try:
        svg_path.write_text(svg, encoding="utf-8")
        p = run(
            ["sips", "-s", "format", "png", str(svg_path), "--out", str(output_path)],
            check=False,
            timeout_sec=30,
        )
        return p.returncode == 0 and verify_image(output_path, min_bytes=8192)
    finally:
        try:
            svg_path.unlink()
        except OSError:
            pass


def generate_financing_comparison_infographic(need: ImageNeed) -> bool:
    font = svg_font_stack()
    width = 2400
    height = 1792
    items = [
        ("2023", "员工股份出售", "主融资缺席", "估值 860 亿美元", "#E2E8F0", "#475569"),
        ("2024", "正式融资轮", "融资 66 亿美元", "估值 1570 亿美元", "#BFDBFE", "#1D4ED8"),
        ("2025", "SoftBank 领投", "融资 400 亿美元", "估值 3000 亿美元", "#93C5FD", "#1E40AF"),
        ("2026", "最新融资", "融资 1220 亿美元", "估值 8520 亿美元", "#0F172A", "#FFFFFF"),
    ]

    cards: list[str] = []
    timeline_nodes: list[str] = []
    start_x = 180
    start_y = 430
    gap_y = 250
    card_w = 2040
    card_h = 180
    line_x = 290
    for i, (year, event, amount, valuation, fill, accent) in enumerate(items):
        y = start_y + i * gap_y
        is_dark = fill == "#0F172A"
        title_fill = "#F8FAFC" if is_dark else "#0F172A"
        body_fill = "#E2E8F0" if is_dark else "#475569"
        amount_fill = "#FACC15" if is_dark else "#0F172A"
        cards.append(
            f"""
      <g>
        <rect x="{start_x}" y="{y}" width="{card_w}" height="{card_h}" rx="34" fill="{fill}" stroke="#E2E8F0" stroke-width="2"/>
        <text x="{start_x + 170}" y="{y + 58}" font-size="44" font-family="{font}" font-weight="800" fill="{title_fill}">{year}</text>
        <text x="{start_x + 170}" y="{y + 112}" font-size="32" font-family="{font}" font-weight="700" fill="{body_fill if not is_dark else '#CBD5E1'}">{event}</text>
        <text x="{start_x + 860}" y="{y + 78}" font-size="38" font-family="{font}" font-weight="800" fill="{amount_fill}">{amount}</text>
        <text x="{start_x + 860}" y="{y + 126}" font-size="34" font-family="{font}" fill="{title_fill if is_dark else '#334155'}">{valuation}</text>
        <text x="{start_x + 1510}" y="{y + 78}" font-size="28" font-family="{font}" font-weight="700" fill="{accent if not is_dark else '#F8FAFC'}">资本强度</text>
        <text x="{start_x + 1510}" y="{y + 122}" font-size="28" font-family="{font}" fill="{body_fill if not is_dark else '#CBD5E1'}">{'从流动性定价到大规模主融资' if year == '2023' else '融资额与估值同步抬升'}</text>
      </g>
"""
        )
        dot_y = y + 90
        timeline_nodes.append(
            f"""
      <circle cx="{line_x}" cy="{dot_y}" r="26" fill="{accent}"/>
"""
        )

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <rect width="{width}" height="{height}" fill="#F8FAFC"/>
  <rect x="56" y="56" width="{width - 112}" height="{height - 112}" rx="52" fill="url(#bg)"/>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#EFF6FF"/>
    </linearGradient>
  </defs>
  <text x="140" y="150" font-size="76" font-family="{font}" font-weight="800" fill="#0F172A">OpenAI 2023-2026 资本加速图谱</text>
  <text x="140" y="214" font-size="34" font-family="{font}" fill="#475569">这不是简单的融资列表，而是 OpenAI 从流动性定价走向超级资本平台的四个关键跳点。</text>

  <line x1="{line_x}" y1="520" x2="{line_x}" y2="1290" stroke="#CBD5E1" stroke-width="8" stroke-linecap="round"/>
  {''.join(timeline_nodes)}
  {''.join(cards)}

  <rect x="140" y="1530" width="2080" height="154" rx="34" fill="#E0F2FE"/>
  <text x="190" y="1594" font-size="34" font-family="{font}" font-weight="700" fill="#0C4A6E">读图重点</text>
  <text x="190" y="1642" font-size="30" font-family="{font}" fill="#0F172A">2024 年之后，OpenAI 的资本动作已经不只是补研发，而是在为算力、治理与叙事控制权持续加杠杆。</text>
</svg>"""
    return render_svg_to_png(svg, need.image_path)


def generate_competition_landscape_infographic(need: ImageNeed) -> bool:
    font = svg_font_stack()
    width = 2400
    height = 1792
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <rect width="{width}" height="{height}" fill="#F8FAFC"/>
  <rect x="56" y="56" width="{width - 112}" height="{height - 112}" rx="52" fill="url(#bg)"/>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#F8FAFC"/>
    </linearGradient>
    <marker id="arrow-blue" markerWidth="14" markerHeight="14" refX="10" refY="7" orient="auto">
      <path d="M0,0 L14,7 L0,14 z" fill="#1D4ED8"/>
    </marker>
    <marker id="arrow-green" markerWidth="14" markerHeight="14" refX="10" refY="7" orient="auto">
      <path d="M0,0 L14,7 L0,14 z" fill="#16A34A"/>
    </marker>
    <marker id="arrow-orange" markerWidth="14" markerHeight="14" refX="10" refY="7" orient="auto">
      <path d="M0,0 L14,7 L0,14 z" fill="#EA580C"/>
    </marker>
  </defs>
  <text x="140" y="150" font-size="76" font-family="{font}" font-weight="800" fill="#0F172A">OpenAI 面前的三场同时进行的战争</text>
  <text x="140" y="214" font-size="34" font-family="{font}" fill="#475569">Anthropic、Google、xAI 不在同一条线竞争，它们分别从工作流、生态入口和实时分发三个方向挤压 OpenAI。</text>

  <rect x="860" y="600" width="700" height="250" rx="44" fill="#111827"/>
  <text x="930" y="690" font-size="64" font-family="{font}" font-weight="800" fill="#F8FAFC">OpenAI</text>
  <text x="930" y="748" font-size="34" font-family="{font}" fill="#CBD5E1">入口 + 模型 + 算力平台</text>
  <text x="930" y="798" font-size="30" font-family="{font}" fill="#94A3B8">真正的压力来自三种不同性质的对手</text>

  <line x1="860" y1="680" x2="500" y2="430" stroke="#16A34A" stroke-width="10" stroke-linecap="round" marker-end="url(#arrow-green)"/>
  <line x1="1560" y1="680" x2="1960" y2="430" stroke="#1D4ED8" stroke-width="10" stroke-linecap="round" marker-end="url(#arrow-blue)"/>
  <line x1="1200" y1="850" x2="1200" y2="1220" stroke="#EA580C" stroke-width="10" stroke-linecap="round" marker-end="url(#arrow-orange)"/>

  <rect x="180" y="250" width="520" height="220" rx="36" fill="#F0FDF4" stroke="#16A34A" stroke-width="3"/>
  <text x="230" y="328" font-size="54" font-family="{font}" font-weight="800" fill="#166534">Google</text>
  <text x="230" y="382" font-size="30" font-family="{font}" fill="#166534">抢生态与默认入口</text>
  <text x="230" y="430" font-size="28" font-family="{font}" fill="#475569">Gemini + Google Cloud + 搜索分发，靠生态体量反扑。</text>

  <rect x="1700" y="250" width="520" height="220" rx="36" fill="#EFF6FF" stroke="#2563EB" stroke-width="3"/>
  <text x="1750" y="328" font-size="54" font-family="{font}" font-weight="800" fill="#1D4ED8">Anthropic</text>
  <text x="1750" y="382" font-size="30" font-family="{font}" fill="#1D4ED8">抢企业与高价值工作流</text>
  <text x="1750" y="430" font-size="28" font-family="{font}" fill="#475569">Claude 在企业、代码、工作流里直接分流高价值场景。</text>

  <rect x="940" y="1260" width="520" height="220" rx="36" fill="#FFF7ED" stroke="#EA580C" stroke-width="3"/>
  <text x="990" y="1338" font-size="54" font-family="{font}" font-weight="800" fill="#C2410C">xAI</text>
  <text x="990" y="1392" font-size="30" font-family="{font}" fill="#C2410C">抢实时内容与舆论场</text>
  <text x="990" y="1440" font-size="28" font-family="{font}" fill="#475569">X 平台 + 实时数据 + 模型联动，争的是注意力和即时分发。</text>

  <rect x="140" y="1532" width="2080" height="150" rx="34" fill="#FEF3C7"/>
  <text x="190" y="1592" font-size="34" font-family="{font}" font-weight="700" fill="#92400E">一句话看懂</text>
  <text x="190" y="1640" font-size="30" font-family="{font}" fill="#0F172A">OpenAI 打平台整合战，Anthropic 打工作流，Google 打入口，xAI 打实时分发，这三种压力同时发生。</text>
</svg>"""
    return render_svg_to_png(svg, need.image_path)


def generate_custom_infographic(need: ImageNeed) -> bool:
    text = " ".join([need.title, need.heading, need.alt]).lower()
    if "融资" in text and ("估值" in text or "对比" in text):
        return generate_financing_comparison_infographic(need)
    if "竞争格局" in text or all(k in text for k in ("openai", "anthropic", "google", "xai")):
        return generate_competition_landscape_infographic(need)
    return False


def is_structured_need(need: ImageNeed) -> bool:
    text = " ".join([need.title, need.heading, need.alt]).lower()
    if any(k in text for k in ("融资", "估值", "竞争格局", "竞争", "anthropic", "google", "xai")):
        return False
    keywords = (
        "流程",
        "步骤",
        "架构",
        "时序",
        "闭环",
        "链路",
        "框架",
        "路径",
        "系统",
    )
    return any(k in text for k in keywords)


def build_mermaid_content(need: ImageNeed) -> str:
    seed = (need.heading or need.alt or "内容").strip()
    if "对比" in seed:
        return (
            "flowchart LR\n"
            '  A1["旧流程"] --> A2["手动收集"] --> A3["低效率"]\n'
            '  B1["新流程"] --> B2["批量处理"] --> B3["高效率"]\n'
        )
    if "时序" in seed:
        return (
            "sequenceDiagram\n"
            "  participant U as 用户\n"
            "  participant S as 系统\n"
            "  U->>S: 提交需求\n"
            "  S->>S: 处理与分析\n"
            "  S-->>U: 输出结果\n"
        )
    return (
        "flowchart TD\n"
        '  A["问题识别"] --> B["信息收集"]\n'
        '  B --> C["批量处理"]\n'
        '  C --> D["结论复盘"]\n'
    )


def generate_mermaid_image(need: ImageNeed, project_dir: Path) -> bool:
    if not SMART_MERMAID_EXPORT_TS.exists():
        return False
    need.image_path.parent.mkdir(parents=True, exist_ok=True)
    mermaid = build_mermaid_content(need)
    cmd = [
        "npx",
        "-y",
        "bun",
        str(SMART_MERMAID_EXPORT_TS),
        "--content",
        mermaid,
        "--output",
        str(need.image_path),
        "--theme",
        "light",
        "--width",
        "1536",
        "--height",
        "1024",
    ]
    p = run(cmd, cwd=project_dir, check=False, timeout_sec=90)
    return p.returncode == 0 and verify_image(need.image_path, min_bytes=2048)


def build_cover_prompt(need: ImageNeed) -> str:
    return (
        f"为微信公众号封面生成高辨识度视觉图。文章标题：{need.title}。"
        "风格：科技感、结构清晰、光影干净、留白充足。"
        "禁止任何可读文字、数字、字母、Logo、水印。"
        "只输出纯视觉封面背景。"
    )


def target_cover_size(platform: str) -> tuple[int, int]:
    if platform == "wechat":
        return (1410, 600)  # ~2.35:1
    return (1080, 1440)  # 3:4


def image_size(path: Path) -> tuple[int, int] | None:
    cmd = ["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(path)]
    p = run(cmd, check=False)
    if p.returncode != 0:
        return None
    w = None
    h = None
    for line in p.stdout.splitlines():
        line = line.strip()
        if line.startswith("pixelWidth:"):
            try:
                w = int(line.split(":", 1)[1].strip())
            except ValueError:
                w = None
        elif line.startswith("pixelHeight:"):
            try:
                h = int(line.split(":", 1)[1].strip())
            except ValueError:
                h = None
    if not w or not h:
        return None
    return (w, h)


def normalize_cover_aspect(need: ImageNeed) -> bool:
    if not need.is_cover:
        return True
    size = image_size(need.image_path)
    if not size:
        return False
    w, h = size
    target_w, target_h = target_cover_size(need.platform)
    if w <= 0 or h <= 0:
        return False

    target_ratio = target_w / target_h
    ratio = w / h

    crop_w = w
    crop_h = h
    if abs(ratio - target_ratio) > 0.02:
        if ratio > target_ratio:
            crop_w = max(1, int(round(h * target_ratio)))
            crop_h = h
        else:
            crop_w = w
            crop_h = max(1, int(round(w / target_ratio)))
        crop_cmd = [
            "sips",
            "--cropToHeightWidth",
            str(crop_h),
            str(crop_w),
            str(need.image_path),
            "--out",
            str(need.image_path),
        ]
        p = run(crop_cmd, check=False)
        if p.returncode != 0:
            return False

    resize_cmd = [
        "sips",
        "--resampleHeightWidth",
        str(target_h),
        str(target_w),
        str(need.image_path),
        "--out",
        str(need.image_path),
    ]
    p = run(resize_cmd, check=False)
    if p.returncode != 0:
        return False
    return verify_image(need.image_path, min_bytes=4096)


def generate_with_smart(need: ImageNeed, project_dir: Path) -> bool:
    if not SMART_IMAGE_GEN_TS.exists():
        return False
    need.image_path.parent.mkdir(parents=True, exist_ok=True)
    prompt = build_cover_prompt(need) if need.is_cover else build_prompt(need)
    cmd = [
        "npx",
        "-y",
        "bun",
        str(SMART_IMAGE_GEN_TS),
        "--provider",
        "sophnet",
        "--prompt",
        prompt,
        "--output",
        str(need.image_path),
        "--aspect-ratio",
        aspect_ratio(need),
        "--size",
        "2k",
    ]
    p = run(cmd, cwd=project_dir, check=False, timeout_sec=240)
    return p.returncode == 0 and verify_image(need.image_path, min_bytes=6144)


def generate_with_baoyu(need: ImageNeed, project_dir: Path, official_ok: bool) -> bool:
    if not official_ok or not IMAGE_GEN_TS.exists():
        return False
    cmd = [
        "npx",
        "-y",
        "bun",
        str(IMAGE_GEN_TS),
        "--provider",
        "google",
        "--prompt",
        build_prompt(need),
        "--image",
        str(need.image_path),
        "--ar",
        aspect_ratio(need),
        "--quality",
        "normal",
    ]
    p = run(cmd, cwd=project_dir, check=False, timeout_sec=240)
    min_size = 6144 if need.is_cover else 3072
    return p.returncode == 0 and verify_image(need.image_path, min_bytes=min_size)


def generate_with_gemini_web(need: ImageNeed, project_dir: Path) -> bool:
    if not GEMINI_WEB_TS.exists():
        return False
    cmd = [
        "npx",
        "-y",
        "bun",
        str(GEMINI_WEB_TS),
        "--prompt",
        f"Create one image only. {build_prompt(need)}",
        "--image",
        str(need.image_path),
        "--model",
        "gemini-2.5-flash",
    ]
    p = run(cmd, cwd=project_dir, check=False, timeout_sec=240)
    min_size = 6144 if need.is_cover else 3072
    return p.returncode == 0 and verify_image(need.image_path, min_bytes=min_size)


def generate_one(need: ImageNeed, official_ok: bool, project_dir: Path) -> bool:
    need.image_path.parent.mkdir(parents=True, exist_ok=True)

    # Cover is mandatory and should not depend on Mermaid route.
    if need.is_cover:
        if generate_with_smart(need, project_dir):
            return normalize_cover_aspect(need)
        if generate_with_baoyu(need, project_dir, official_ok):
            return normalize_cover_aspect(need)
        if generate_with_gemini_web(need, project_dir):
            return normalize_cover_aspect(need)
        return False

    if generate_custom_infographic(need):
        return True

    # Prefer Mermaid for structured WeChat inline diagrams.
    if need.platform == "wechat" and is_structured_need(need):
        if generate_mermaid_image(need, project_dir):
            return True

    if generate_with_smart(need, project_dir):
        return True
    if generate_with_baoyu(need, project_dir, official_ok):
        return True
    if generate_with_gemini_web(need, project_dir):
        return True
    return False


def grouped_by_article(needs: Iterable[ImageNeed]) -> dict[Path, list[ImageNeed]]:
    out: dict[Path, list[ImageNeed]] = {}
    for n in needs:
        out.setdefault(n.article_path, []).append(n)
    return out


def dedupe_needs_by_image_path(needs: Iterable[ImageNeed]) -> list[ImageNeed]:
    out: list[ImageNeed] = []
    seen: set[Path] = set()
    for n in needs:
        key = n.image_path.resolve()
        if key in seen:
            continue
        seen.add(key)
        out.append(n)
    return out


def build_prompt_pack(article_path: Path, opublish: dict[str, str], project_dir: Path) -> Path:
    platform = canonical_platform(opublish.get("platform"), article_path.parent.name)
    assets_dir = opublish.get("assets_dir") or DEFAULT_ASSETS_REL
    out_path = article_path.with_name(f"{article_path.stem}-prompt-pack.md")
    cmd = [
        "python3",
        str(BUILD_PROMPT_PACK_PY),
        "-i",
        str(article_path),
        "--platform",
        platform,
        "--cover-platform",
        platform,
        "--assets-dir",
        assets_dir,
        "--prompt-pack-output",
        str(out_path),
    ]
    run(cmd, cwd=project_dir, check=True)
    return out_path


def finalize_article(article_path: Path, project_dir: Path, skip_cover_sync: bool) -> Path:
    hosted_out = article_path.with_name(f"{article_path.stem}-hosted{article_path.suffix}")
    cmd = [
        "python3",
        str(FINALIZE_PY),
        "-i",
        str(article_path),
        "--output-dir",
        str(article_path.parent),
        "--assets-dir",
        "../assets",
        "--output",
        str(hosted_out),
    ]
    if skip_cover_sync:
        cmd.append("--skip-cover-sync")
    first = run(cmd, cwd=project_dir, check=False)
    if first.returncode == 0:
        return hosted_out
    # Retry once for transient upload/network issues.
    time.sleep(1.0)
    retry = run(cmd, cwd=project_dir, check=False)
    if retry.returncode == 0:
        print(f"[OK] finalize retry succeeded: {article_path.name}")
        return hosted_out
    reason = (first.stderr or first.stdout or "").strip()
    print(f"[WARN] finalize with upload failed, fallback to local hosted only: {article_path.name}")
    if reason:
        print(f"  reason: {reason[:300]}")
    fallback_cmd = [*cmd, "--skip-upload"]
    run(fallback_cmd, cwd=project_dir, check=True)
    return hosted_out


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def select_articles(project_dir: Path, wanted: set[str]) -> list[Path]:
    articles: list[Path] = []
    for folder in PLATFORM_DIRS:
        platform = infer_platform_by_parent(folder)
        if wanted and platform not in wanted:
            continue
        md = discover_primary_markdown(project_dir / folder)
        if md:
            articles.append(md)
    return articles


def main() -> int:
    parser = argparse.ArgumentParser(description="Run full chain for one topic project.")
    parser.add_argument(
        "--project-dir",
        default=str(Path.cwd()),
        help="Topic project directory, e.g. .../02-内容生产/某项目",
    )
    parser.add_argument(
        "--skip-generate",
        action="store_true",
        help="Skip image generation and only run finalize/upload.",
    )
    parser.add_argument(
        "--platforms",
        default="",
        help="Comma-separated platforms: wechat,xiaohongshu,xiaolvshu (default: auto-detect all)",
    )
    parser.add_argument(
        "--skip-cover-sync",
        action="store_true",
        help="Do not sync the top preview image with frontmatter cover in hosted output",
    )
    args = parser.parse_args()

    project_dir = Path(args.project_dir).expanduser().resolve()
    if not project_dir.exists():
        sys.stderr.write(f"Project directory not found: {project_dir}\n")
        return 2
    try:
        project_dir.relative_to(VAULT_ROOT)
    except ValueError:
        sys.stderr.write(f"Project directory must be inside vault root: {VAULT_ROOT}\n")
        return 2

    # Load env from global and project local.
    load_env_file(Path.home() / ".baoyu-skills/.env")
    load_env_file(VAULT_ROOT / ".env.local")
    load_env_file(project_dir / ".env.local")

    # Set default proxy for this network if missing.
    if "HTTP_PROXY" not in os.environ and "http_proxy" not in os.environ:
        os.environ["HTTP_PROXY"] = "http://127.0.0.1:7897"
    if "HTTPS_PROXY" not in os.environ and "https_proxy" not in os.environ:
        os.environ["HTTPS_PROXY"] = os.environ.get("HTTP_PROXY", "http://127.0.0.1:7897")
    os.environ.setdefault("http_proxy", os.environ.get("HTTP_PROXY", ""))
    os.environ.setdefault("https_proxy", os.environ.get("HTTPS_PROXY", ""))

    wanted = parse_platforms_arg(args.platforms)
    articles = select_articles(project_dir, wanted)
    if not articles:
        wanted_text = ",".join(sorted(wanted)) if wanted else "auto-detected platforms"
        sys.stderr.write(f"No source markdown found for: {wanted_text}\n")
        return 3

    print("==> Selected source markdown:")
    for a in articles:
        print(f"  - {a}")

    print("==> Normalize frontmatter and image slots")
    for article in articles:
        platform, changed = normalize_article_for_fullchain(article)
        status = "updated" if changed else "ok"
        print(f"  [{status}] {article.name} ({platform})")

    all_needs: list[ImageNeed] = []
    opublish_by_article: dict[Path, dict[str, str]] = {}
    for article in articles:
        needs, op = collect_missing_images(article)
        all_needs.extend(needs)
        opublish_by_article[article] = op

    all_needs = dedupe_needs_by_image_path(all_needs)

    if all_needs and not args.skip_generate:
        print(f"==> Missing images: {len(all_needs)}")
        official_ok = detect_official_api()
        if official_ok:
            print("[OK] Gemini official API reachable.")
        else:
            print("[WARN] Gemini official API unavailable; fallback to gemini-web.")

        failed: list[ImageNeed] = []
        for need in all_needs:
            print(f"[GEN] {need.image_path.name} <- {need.alt}")
            ok = generate_one(need, official_ok=official_ok, project_dir=project_dir)
            if ok:
                print(f"  [OK] {need.image_path}")
            else:
                print(f"  [FAIL] {need.image_path}")
                failed.append(need)

        if failed:
            print("==> Some images failed. Writing prompt-pack fallback per article.")
            for article, items in grouped_by_article(failed).items():
                out_path = build_prompt_pack(article, opublish_by_article[article], project_dir)
                print(f"  [PROMPT-PACK] {out_path} ({len(items)} missing)")
    else:
        print("==> No missing images, skip generation.")

    print("==> Finalize and upload")
    hosted_outputs: list[Path] = []
    for article in articles:
        hosted = finalize_article(
            article,
            project_dir=project_dir,
            skip_cover_sync=args.skip_cover_sync,
        )
        if not hosted.exists():
            raise RuntimeError(f"Hosted output missing after finalize: {hosted}")
        hosted_outputs.append(hosted)

    print("==> Hosted outputs:")
    for out in hosted_outputs:
        print(f"  - {out}")

    print("==> Done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
