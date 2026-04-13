---
name: O-Publish-skill
description: Transform Obsidian notes into publish-ready articles for 小绿书/小红书/公众号 with personalized voice, platform-specific format constraints, and automated cover/inline image strategy. Use when user wants to publish content from Obsidian to social platforms, enforce per-platform writing rules, or produce final post-ready drafts. Supports 4 preset style profiles (Explorer/Practitioner/Analyst/Maverick), Smart Illustrator first-priority image generation, and markdown prompt-pack fallback (with embedded JSON blocks) when image generation is unstable.
---

# O-Publish-skill

Transform Obsidian notes into platform-ready articles with personalized voice and controlled image generation.

## Complete Workflow (从选题到发布)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           完整自媒体发布流程                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. 选题阶段 (O-Manage-skill)                                              │
│     └── 在 01-选题库/ 创建选题卡片                                           │
│                                                                             │
│  2. 立项阶段 (初始化项目目录)                                                │
│     └── bash ~/.claude/skills/O-Publish-skill/scripts/bootstrap_topic_project.sh \
│         --vault-root "/Users/mac/qianzhu Vault/自媒体"                       \
│         --topic-card "01-选题库/选题卡片-<选题名>.md"                        │
│     └── 创建固定目录结构：公众号/、小红书/、小绿书/、title/、assets/、scripts/ │
│                                                                             │
│  3. 写稿阶段 (风格改写)                                                      │
│     └── 选择风格：探索派/实战派/理性派/个性派                                 │
│     └── 根据风格改写内容，生成三平台初稿                                      │
│                                                                             │
│  4. 标题阶段 (生成候选)                                                      │
│     └── 在 title/ 生成各平台标题候选池                                       │
│     └── 人工选择后回写到文章 title:                                         │
│                                                                             │
│  5. 配图阶段 (Smart Illustrator)                                           │
│     └── /smart-illustrator article.md --style light                         │
│     └── 生成封面图 + 正文插图（Mermaid 或 Gemini）                           │
│                                                                             │
│  6. 收尾阶段 (一键完成)                                                      │
│     └── python3 scripts/opublish_finalize.py -i article-image.md             │
│     └── Mermaid → PNG + R2 上传 + 链接回写 → *-hosted.md                     │
│                                                                             │
│  7. 发布阶段                                                                │
│     └── 复制 *-hosted.md 到平台发布                                          │
│     └── 或使用 baoyu-post-to-wechat 直接发布                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Prerequisites (环境依赖)

配图功能需要以下依赖：

```bash
# 1. 安装 bun (TypeScript 运行时)
curl -fsSL https://bun.sh/install | bash

# 2. 安装 Mermaid CLI (用于导出流程图为 PNG)
npm install -g @mermaid-js/mermaid-cli

# 3. 设置 Sophnet API Key（Smart Illustrator 默认优先使用）
export SOPHNET_API_KEY="your-api-key-here"

# 推荐方式：添加到 ~/.zshrc 或项目 .env.local
echo 'export SOPHNET_API_KEY="your-api-key-here"' >> ~/.zshrc
source ~/.zshrc
```

**检查依赖**：
```bash
which bun      # 应显示 /Users/mac/.bun/bin/bun
which mmdc     # 应显示 /Users/mac/.npm-global/bin/mmdc
echo $SOPHNET_API_KEY  # 应显示你的 API key
```

## Quick Start

When user wants to publish Obsidian notes to 小绿书/小红书/公众号:

1. **Get input**: Ask for note file path or pasted content
2. **Choose style**: Present 4 style options, default to "Explorer" (探索派)
3. **Transform content**: Rewrite with selected style profile
4. **Generate title candidates**: Create a `title/` pack per platform for manual selection (no auto final title)
5. **Generate images first**: Smart Illustrator has highest priority
6. **Apply platform hard rules**: obey length/format/image policy by platform
7. **Fallback prompt-pack**: If generation fails, output one `*-prompt-pack.md` (embedded JSON + labeled slots)
8. **WeChat compatibility**: Convert Mermaid blocks to PNG (or force Gemini)
9. **Format & output**: Save as publish-ready output (no extra统计字段)
10. **Folder contract**: Keep all outputs for one topic in one topic folder; no `images/` split dir
11. **No-stall rule**: image generation must have timeout/fallback; never block whole full-chain indefinitely

## Claude Code Hard Guarantees

- `*-hosted.md` 是必须产物（可直接复制使用）。
- 公众号封面是必须产物，不允许“只出正文图”。
- 公众号封面目标比例为 `2.35:1`（生成后允许强制裁切到该比例）。
- 上传失败不能中断全链路：必须降级输出本地 hosted。
- 配图链路使用“主技能 + 兜底”模式，避免并发调用多个同类技能造成结果抖动。

## Platform Hard Rules (Must Follow)

| Platform | Text Rules | Image Rules |
| --- | --- | --- |
| 小绿书 (`xiaolvshu`) | 正文控制在 1000 字以内；纯文本，不使用 Markdown 语法；不要在末尾写“字数统计/共X字”等信息 | 只生成封面图，不生成正文插图 |
| 小红书 (`xiaohongshu`) | 可读性优先，可使用分段结构 | 必须生成封面 + 正文插图 |
| 公众号 (`wechat`) | 保持公众号可读结构 | 必须生成封面 + 正文插图（如含 Mermaid，需转 PNG） |

## Topic Folder Contract (Must Follow)

Each topic must use one folder under `02-内容生产`, for example:

```text
/Users/mac/qianzhu Vault/自媒体/02-内容生产/PinMe项目/
  公众号/
  小红书/
  小绿书/
  title/
  assets/
  scripts/
  archive/
```

Rules:
- Do not create `images/`; all image outputs go to `assets/`.
- Title candidates must be written under `title/` for manual selection (do not overwrite final titles silently).
- Keep platform articles and assets in the same topic folder for deterministic reruns.
- Keep legacy or debug files only in `archive/`.

## Obsidian One-Click Mode (Recommended)

Use the **current Obsidian note** as the working draft. This mode is designed for your
“口喷 + 局部修改 + 配图补齐 + 一键输出” workflow.

### Draft Conventions (in the note)

Add optional frontmatter to guide the pipeline:

```markdown
---
opublish:
  style: 探索派
  content_mode: technical               # technical | cognitive
  writing_profile: deep_narrative       # deep_narrative | practical_explain | social_hook | concise_insight
  ref: /absolute/path/to/reference.md   # optional reference article
  assets_dir: ./assets                  # required: image output dir
  output_dir: /Users/mac/qianzhu Vault/自媒体/02-内容生产/PinMe项目   # optional
  platform: xiaolvshu                   # xiaolvshu | xiaohongshu | wechat
  engine: auto                          # auto | gemini
  auto_upload: true                     # auto-upload to R2 in finalize step
  r2_endpoint: https://<account>.r2.cloudflarestorage.com
  r2_bucket: obsidian-images
  r2_public_base_url: https://img.qianzhu.online
  r2_prefix: notes/2026-02              # optional
---
```

For your current R2 setup:

```markdown
---
opublish:
  style: 探索派
  assets_dir: ./assets
  output_dir: /Users/mac/qianzhu Vault/自媒体/02-内容生产/PinMe项目
  platform: xiaohongshu
  auto_upload: true
  r2_endpoint: https://1e1b04d71f7d0f223bc1f2af2a56bac9.r2.cloudflarestorage.com
  r2_bucket: obsidian-images
  r2_public_base_url: https://img.qianzhu.online
---
```

Add inline image requirements using HTML comments:

```markdown
<!--IMG: 操作步骤流程图，3-5步，突出关键按钮 -->
<!--IMG: 对比图：旧流程 vs 新流程 -->
```

Existing screenshots should remain as normal Markdown image links:

```markdown
![截图](./assets/step-01.png)
```

### One-Click Behavior

1. Treat the **current note** as source
2. If `ref` is provided, use it as style/structure reference
3. Rewrite per style profile and target platform hard rules
4. If platform is `xiaolvshu`, output pure text (no markdown) and keep content within 1000 Chinese characters
5. If platform is `xiaohongshu` or `wechat`, generate missing “how-to” images for `<!--IMG: ... -->` markers
6. If generation fails, generate one `*-prompt-pack.md` (+ optional slotted markdown when needed)
7. Ensure all images are saved to `./assets/`
8. Never write standalone JSON prompt files unless explicitly requested
9. Run `scripts/opublish_finalize.py` once (Mermaid->PNG + optional R2 upload + URL rewrite)
10. Output final post-ready content without extra word-count appendix

### Project Autopilot (No Manual Intervention)

For a topic project folder (`02-内容生产/<选题项目>`), run:

```bash
python3 ~/.claude/skills/O-Publish-skill/scripts/opublish_fullchain_project.py \
  --project-dir "/Users/mac/qianzhu Vault/自媒体/02-内容生产/<选题项目>"
```

只跑公众号（推荐日常发文）：

```bash
python3 ~/.claude/skills/O-Publish-skill/scripts/opublish_fullchain_project.py \
  --project-dir "/Users/mac/qianzhu Vault/自媒体/02-内容生产/<选题项目>" \
  --platforms wechat
```

What it does:
- Auto-select source markdown in `公众号/` + `小红书/` (prefers `-v2.md` if present)
- Auto-normalize frontmatter (`cover`, `opublish.assets_dir=../assets`) for deterministic reruns
- Auto-insert image slots when missing:
  - `wechat`: cover + inline slots
  - `xiaohongshu`: cover + inline slots
  - `xiaolvshu`: cover only
- Read local image refs + frontmatter cover, generate only missing images
- WeChat inline structured diagrams prefer Mermaid export; creative images use AI generation
- WeChat cover uses dedicated cover route and mandatory ratio normalization
- Use official Gemini API first; fallback to gemini-web if needed
- Apply per-image timeout to avoid hanging full-chain
- On failure, generate one `*-prompt-pack.md` per failed article
- Run `opublish_finalize.py` with correct `--output-dir` + `--assets-dir` and force hosted output
- If upload fails, retry once then fallback to local hosted output
- Upload to R2 and rewrite hosted markdown links
- Finalize 后自动把正文首图同步为 frontmatter `cover`（可用 `--skip-cover-sync` 关闭）

Path hygiene:
- Use this vault root only: `/Users/mac/qianzhu Vault/自媒体`
- Default output directory: `/Users/mac/qianzhu Vault/自媒体/02-内容生产`
- Default image directory (relative): `./assets`
- Never create `images/`; migrate any legacy `images/` files to `assets/`

Proxy hygiene:
- Prefer project-local `.env.local` for `HTTP_PROXY` / `HTTPS_PROXY`
- If proxy is required, validate the active image provider endpoint before image generation

## Image Skill Priority Manager

To avoid conflicts between multiple image skills, enforce this priority order.

### Cover Priority

1. `smart-illustrator/scripts/generate-image.ts` (cover prompt + target ratio)
2. `baoyu-image-gen` (google provider)
3. `baoyu-danger-gemini-web` (cookies fallback)

### Article Image Priority

Use this list **only when platform is `xiaohongshu` or `wechat`**:

1. `smart-illustrator mermaid-export` for structured diagrams (`流程/步骤/架构/对比`)
2. `smart-illustrator/scripts/generate-image.ts` for non-structured visual illustrations
3. `baoyu-image-gen` as fallback only
3. `baoyu-danger-gemini-web` fallback

Do not run multiple article illustrators in parallel for the same slot.

### Fallback Rule

If any of these happens, switch to prompt fallback package:
- Cover image missing
- Expected in-article images missing (only for `xiaohongshu` / `wechat`)
- Generation timeout or repeated failure
- Upload failure after retry (hosted must still be produced locally)

Use:

```bash
python3 ~/.claude/skills/O-Publish-skill/scripts/build_image_prompt_package.py \
  -i path/to/article.md \
  --platform xiaohongshu \
  --assets-dir ./assets \
  --cover-platform xiaohongshu
```

Outputs:
- `*-prompt-pack.md` (single markdown summary; includes embedded JSON blocks and copy-ready prompts)
- Optional slotted markdown when `--slotted-output` is provided
- For `xiaolvshu`, prompt pack is cover-only (no article image slots)

### Integrated Finalize Command (One-Click)

Run once after image generation:

```bash
python3 ~/.claude/skills/O-Publish-skill/scripts/opublish_finalize.py \
  -i path/to/article-image.md
```

Behavior:
- Reads `opublish.*` from markdown frontmatter
- Applies platform-specific image policy (`xiaolvshu`: cover-only, `xiaohongshu`/`wechat`: cover + inline)
- Converts Mermaid blocks to PNG when platform is `wechat`
- Auto-uploads `./assets` to R2 when `auto_upload=true` or R2 settings are present
- Rewrites markdown image links to public URLs
- Generates `*-prompt-pack.md` only when local assets are missing (or when you force it via `--prompt-pack-output`), and never defaults to standalone JSON files

## Style Profiles

Load `references/style-profiles.md` for detailed style configurations:

| Style | Chinese | Voice | Hook Type | Emotion |
|-------|---------|-------|-----------|---------|
| Explorer | 探索派 | Fun, curious, discovering tools | Life scenarios | Dry humor |
| Practitioner | 实战派 | Battle-hardened, direct | Problem-oriented | Bold, candid |
| Analyst | 理性派 | Analytical, data-driven | Suspense/buildup | Reserved, thoughtful |
| Maverick | 个性派 | Sharp, opinionated | Conversational | Sarcastic, witty |

**Default**: Explorer (探索派) - balanced voice, life-scenario hooks, dry humor

Content mode axis (must choose one):
- `technical`: 技术科普，强调结构清晰、方法可复现、关键术语解释
- `cognitive`: 认知科普，强调洞察重构、叙事递进、抽象模型提炼

## Workflow

### Step 1: Get Input

User provides one of:
- **File path**: `/Users/mac/qianzhu Vault/自媒体/02-内容生产/article.md`
- **Pasted content**: Raw markdown text

### Step 2: Load Style Configuration

Read `references/style-profiles.md` and extract selected style parameters:
- Spoken level (balance/extreme/reserved)
- Emotion expression (cold humor/direct/sarcastic)
- Hook type (life scenario/problem/suspense/conversation)
- Persona keywords
- Content mode (`technical` | `cognitive`)
- Writing profile (`deep_narrative` | `practical_explain` | `social_hook` | `concise_insight`)

### Step 3: Transform Content

Apply style profile to rewrite content:

1. **Add hook opening** - Use life scenarios, specific time/numbers, dialogue
2. **Restructure paragraphs** - Extract core points, add subheadings
3. **Adjust voice** - Mix formal + colloquial, add "I" perspective
4. **Inject persona** - Use style keywords (curious/battle-scarred/analytical/sharp)
5. **Anti-AI check** - Avoid "总而言之" "首先其次", ensure varied sentence length
6. **Platform check (mandatory)**:
   - `xiaolvshu`: final body <=1000 Chinese characters, plain text only, no markdown syntax, no word-count footer
   - `xiaohongshu` / `wechat`: keep structured sections for readability
7. **Content mode check (mandatory)**:
   - `technical`: keep mechanism explanations, reproducible steps, boundary conditions
   - `cognitive`: keep narrative progression, framework abstraction, reflective ending

**Reference**: See `style-profiles.md` for hook templates and anti-AI checklist

### Step 4: Generate Cover Image

Use **Smart Illustrator cover mode** with target platform:
- `/smart-illustrator article.md --mode cover --platform <platform>`

Fallback: call `baoyu-cover-image` with style-matched parameters:

| Style | Type | Palette | Mood |
|-------|------|---------|------|
| Explorer | infographic | blue/purple | playful |
| Practitioner | clean | red/dark | serious |
| Analyst | abstract | gray/neutral | professional |
| Maverick | bold | high-contrast | bold |

**Extract**: Generate article title from content for cover text

### Step 5: Generate In-Article Illustrations (Platform Gated)

- `xiaolvshu`: **skip in-article images** (cover only)
- `xiaohongshu` / `wechat`: use **Smart Illustrator** (`/smart-illustrator`) for in-article images
  - Dual-engine selection (Mermaid for structured diagrams, Gemini for creative visuals)
  - Auto-detects illustration positions
  - Outputs `*-image.md` with inserted images

Fallback to `baoyu-article-illustrator` when:
- Gemini API is unavailable
- You need more stylized conceptual art
- You want manual control over illustration positions

**WeChat note**: Mermaid code blocks do not render in WeChat. Use the WeChat compatibility step below.

### Step 6: Prompt-Pack Fallback (When Generation Is Unstable)

If cover/body image generation is unstable, output a single markdown prompt pack:

```bash
python3 ~/.claude/skills/O-Publish-skill/scripts/build_image_prompt_package.py \
  -i path/to/article.md \
  --platform xiaohongshu \
  --assets-dir ./assets \
  --cover-platform xiaohongshu
```

Artifacts:
- `article-prompt-pack.md` (default)
- Optional slotted markdown via `--slotted-output`
- `xiaolvshu` defaults to cover-only slots in prompt-pack

Schema reference:
- `references/image-prompt-schema.json`

### Step 7: One-Click Finalize (Mermaid + R2 + URL Rewrite)

Use integrated finalize instead of separate manual commands:

```bash
python3 ~/.claude/skills/O-Publish-skill/scripts/opublish_finalize.py \
  -i path/to/article-image.md
```

Result:
- `article-image-<platform>-hosted.md` (when upload is enabled)
- or `article-image-<platform>.md` (when upload is disabled)
- for `xiaolvshu`, additionally emits `article-xiaolvshu-ready.txt` (plain text, <=1000 chars)

### Step 8: WeChat Compatibility (Mermaid → PNG)

WeChat Official Account does **not** render Mermaid blocks. Use one of:

1. **Force Gemini only** (no Mermaid blocks):
   - Run Smart Illustrator with `--engine gemini`
2. **Export Mermaid to PNG** and replace blocks:
   - Use `scripts/mermaid_to_png_replace.py`

See `references/smart-illustrator-integration.md` for commands and templates.

### Step 9: Optional Image Hosting (Cross-Platform Copy/Paste)

If the user wants **one Markdown to paste into WeChat/小红书/other platforms**, local paths like
`./assets/...` must be uploaded and then replaced with hosted URLs.

Use `scripts/upload_assets_to_r2.py` (upload + rewrite in one step):

Example:
```bash
export R2_ACCESS_KEY_ID=your_key
export R2_SECRET_ACCESS_KEY=your_secret

python3 ~/.claude/skills/O-Publish-skill/scripts/upload_assets_to_r2.py \\
  --assets-dir ./assets \\
  --s3-endpoint https://<account>.r2.cloudflarestorage.com/obsidian-images \\
  --public-base-url https://<public>.r2.dev \\
  --markdown path/to/article-image-<platform>.md
```

Alternative:
- If assets are already uploaded by other tools, use `scripts/replace_image_base_url.py` only.

Required for upload:
- `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` (or AWS-compatible env vars)
- S3 endpoint (API): `https://<account>.r2.cloudflarestorage.com/<bucket>`
- Public URL base: `https://<public>.r2.dev` (or custom domain)

### Step 10: Format Output

Format by platform:
- `xiaolvshu`: output pure text (no markdown symbols like `#`, `*`, `-`, `[ ] ( )`, code fences), body within 1000 Chinese characters, no word-count footer
- `xiaohongshu` / `wechat`: keep markdown workflow and image links

### Step 11: Save File

Output:
- `xiaolvshu`: `{original-name}-xiaolvshu-ready.txt`
- `xiaohongshu` / `wechat`: `{original-name}-published.md`

Example structure (`xiaohongshu` / `wechat`):
```markdown
---
title: "发现的这个工具把我那堆乱七八糟的笔记全搞定了"
cover: "https://..."
date: "2025-XX-XX"
style: "探索派"
---

今天发现一个好玩的工具，把我那堆乱七八糟的笔记全搞定了...

## 为什么需要这个工具

之前我一直用...

![示意图](https://...)

## 核心功能

这玩意儿有意思的地方在于...
```

Example structure (`xiaolvshu`, plain text):
```text
今天我把自己的内容工作流重做了一遍，最关键的变化是把所有素材都收敛到一个固定目录，写作、配图、发布都在同一条线上完成。之前最浪费时间的不是写，而是来回找版本、找图片、补链接。现在改完之后，写完就能直接发，整个过程短很多，也不容易漏步骤。

这套流程里我只保留一张封面图，不在正文插图。原因很简单：小绿书更吃叙事完整度和表达节奏，正文插图反而会打断阅读。把核心观点压缩在一屏一屏能读完的长度里，信息密度更高，转化也更直接。真正要做的是把开头写得有代入感，中段给出可执行的方法，结尾给一个明确动作。

如果你也在做内容，建议先做三件事：第一，固定你的写作根目录；第二，固定你的输出路径和素材路径；第三，把发布前收尾动作做成一键。只要这三个动作固定下来，你会发现稳定更新没有想象中那么难。
```

## Integrated Skills

This skill orchestrates multiple existing skills:

### obsidian-markdown
- **Purpose**: Read Obsidian Flavored Markdown (wikilinks, properties, tags)
- **When**: Step 1 - reading input files
- **Preserve**: Original tags and properties

### baoyu-cover-image
- **Purpose**: Generate article cover images (5 dimensions: type, palette, rendering, text, mood)
- **When**: Step 4 - cover generation
- **Match**: Parameters to selected style profile

### baoyu-article-illustrator
- **Purpose**: Analyze article structure and generate illustrations at key positions
- **When**: Step 5 fallback - in-article images
- **Types**: Screenshots, diagrams, concept art based on content

### smart-illustrator
- **Purpose**: Primary illustration engine (Mermaid for diagrams + Gemini for creative visuals)
- **When**: Step 5 - in-article images, optional cover mode
- **WeChat**: Convert Mermaid blocks to PNG or force `--engine gemini`

### baoyu-format-markdown
- **Purpose**: Format markdown output for `xiaohongshu` / `wechat`
- **When**: Step 10 - final formatting
- **Skip**: For `xiaolvshu` plain-text output mode

### local scripts
- **`scripts/build_image_prompt_package.py`**: Generate single markdown prompt pack (JSON embedded) + optional slotted markdown
- **`scripts/opublish_finalize.py`**: One-click finalize (Mermaid->PNG + optional R2 upload + URL rewrite)
- **`scripts/mermaid_to_png_replace.py`**: Convert Mermaid blocks to PNG for WeChat
- **`scripts/upload_assets_to_r2.py`**: Upload local assets and rewrite markdown links to public URLs

## User Interaction Example

```
User: 我想把这篇笔记发公众号

Claude: 好的，请提供笔记文件路径或粘贴内容

User: /Users/mac/qianzhu Vault/自媒体/02-内容生产/工具分享.md

Claude: 正在读取笔记... [content preview]

已读取内容。使用哪个风格模板？
1. 探索派（默认）- 好玩有趣、发现小众工具
2. 实战派 - 踩坑经验、实战干货
3. 理性派 - 理性分析、数据说话
4. 个性派 - 直爽犀利、观点鲜明

User: 1

Claude: 好的，使用探索派风格。开始创作...

[✓ 生成钩子]
[✓ 重构内容]
[✓ 生成封面图]
[✓ 生成插图: 3张]
[✓ 格式化输出]

✅ 完成！
文章已保存至：工具分享-published.md
封面图：[URL]
插图数：3张

预览开头：
「今天发现一个好玩的工具，把我那堆乱七八糟的笔记全搞定了...」
```

## Style Customization

To update or add new style profiles:

1. Edit `references/style-profiles.md`
2. Add new style section with parameters:
   - Language style (spoken level)
   - Emotion expression type
   - Hook templates
   - Persona keywords
   - Structure recommendations
3. Update style selection prompt to include new option

## Anti-AI Writing Guidelines

**CRITICAL**: All generated content must avoid AI patterns:

### ❌ Avoid
- "在当今时代" "随着XX的发展" openers
- "总而言之" "综上所述" "首先其次"
- Overly structured, uniform sentences
- Generic "能够帮助" "有效地" phrases

### ✅ Emulate
- Direct scene/dialogue/problem openers
- Varied sentence length and rhythm
- Specific numbers, times, names, scenarios
- First-person perspective with emotion traces
- Natural transitions and pauses

**Reference**: See `references/style-profiles.md` for complete checklist

## Workflow Reference

For detailed workflow documentation and integration patterns, see `references/workflow-guide.md`.
