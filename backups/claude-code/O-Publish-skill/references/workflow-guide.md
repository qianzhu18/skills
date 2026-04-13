# O-Publish 工作流指南

## 完整工作流

## 平台硬约束（必须执行）

| 平台 | 文本规则 | 配图规则 |
| --- | --- | --- |
| 小绿书（`xiaolvshu`） | 正文控制在1000字以内；禁止 Markdown 语法；不要附“共X字/字数统计” | 仅封面图，不生成正文图 |
| 小红书（`xiaohongshu`） | 可分段，强调可读性 | 封面 + 正文图 |
| 公众号（`wechat`） | 可分段，公众号可读结构 | 封面 + 正文图（Mermaid 需转 PNG） |

## 选题目录规范（必须执行）

每个选题必须独立在 `02-内容生产/<选题名项目>/` 下，统一目录如下：

```text
/Users/mac/qianzhu Vault/自媒体/02-内容生产/PinMe项目/
  公众号/
  小红书/
  小绿书/
  assets/
  scripts/
  archive/
```

规则：
- 不创建 `images/` 目录，所有图片统一写入 `assets/`。
- 同一选题不得分散到 `02-待生产` / `02-生产中` / `02-生产内容`。
- 历史稿、调试稿仅放 `archive/`。

## 生图优先级管理（必须执行）

为了避免多个生图技能冲突，统一优先级如下：

### 封面图优先级
1. `smart-illustrator --mode cover --platform <platform>`
2. `smart-illustrator --mode cover --platform <platform> --prompt-only`
3. `baoyu-cover-image`
4. `baoyu-image-gen --prompt-only`

### 正文图优先级
仅在 `xiaohongshu` / `wechat` 使用以下优先级：
1. `smart-illustrator`（article mode）
2. `smart-illustrator --prompt-only`（结构化提示词载荷）
3. `baoyu-article-illustrator`
4. `baoyu-image-gen --prompt-only`

### 失败兜底规则
以下任一情况触发提示词兜底包：
- 封面图未生成
- 正文目标图缺失（仅 `xiaohongshu` / `wechat`）
- 连续失败或超时

命令：
```bash
python3 ~/.claude/skills/O-Publish-skill/scripts/build_image_prompt_package.py \
  -i path/to/article.md \
  --platform xiaohongshu \
  --assets-dir ./assets \
  --cover-platform xiaohongshu
```

输出：
- `*-prompt-pack.md`（单一 Markdown 汇总，内嵌 JSON 代码块）
- 可选 `*-image-slotted.md`（当传入 `--slotted-output` 时）

## 一体化收尾（Obsidian 一次触发）

不要再把“微信兼容”和“图床上传”拆成两个手工步骤。统一执行：

```bash
python3 ~/.claude/skills/O-Publish-skill/scripts/opublish_finalize.py \
  -i path/to/article-image.md
```

脚本会自动：
- 应用平台配图策略：`xiaolvshu` 仅封面；`xiaohongshu`/`wechat` 封面+正文图
- `platform=wechat` 时执行 Mermaid -> PNG
- 根据 frontmatter 中 `opublish.auto_upload` / `r2_endpoint` / `r2_public_base_url` 自动上传 R2
- 回写 markdown 本地图链接为公网 URL
- 自动生成 `*-prompt-pack.md`（不再默认生成独立 json 文件）
- 默认写入 `/Users/mac/qianzhu Vault/自媒体/02-内容生产`（可用 `opublish.output_dir` 覆盖）
- 默认图片目录为 `./assets`（相对于输出目录）

注意：
- 仅使用该 Vault 根目录：`/Users/mac/qianzhu Vault/自媒体`
- 不要使用 `~/.claude/obsidian/...` 副本路径。
- 不要创建 `images/` 目录；若发现历史 `images/`，先迁移到 `assets/` 再删除。

代理建议（保证可复现）：
- 在选题目录下维护 `./.env.local`，写入 `HTTP_PROXY` 与 `HTTPS_PROXY`。
- 生图前先做 API 预检：`curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GOOGLE_API_KEY"`。
- 预检失败时自动回退 prompt-pack，不要卡在“无图”状态。

## 项目级一键自动化（推荐）

当你已经有 `02-内容生产/<选题项目>/` 目录（含 `公众号/`、`小红书/`、`assets/`）时，直接执行：

```bash
python3 ~/.claude/skills/O-Publish-skill/scripts/opublish_fullchain_project.py \
  --project-dir "/Users/mac/qianzhu Vault/自媒体/02-内容生产/<选题项目>"
```

该脚本自动完成：
- 自动识别平台主稿（优先 `-v2.md`）
- 读取文章中的本地图片引用和 `cover:`，只补齐缺失图片
- 官方 Gemini API 优先，失败自动回退 gemini-web
- 仅在失败时输出单个 `*-prompt-pack.md`（不输出散落 json）
- 调用 `opublish_finalize.py` 上传 R2 并回写 hosted 链接

注意：
- 建议在 Vault 根目录准备一次性共享凭据：`/Users/mac/qianzhu Vault/自媒体/.env.local`
- 项目目录也可放 `./.env.local` 覆盖共享配置

### 步骤1：获取输入
用户需要提供：
- **选项A**：Obsidian 笔记文件路径（绝对路径或相对路径）
- **选项B**：直接粘贴笔记内容（Markdown格式）

建议在笔记 frontmatter 增加：

```markdown
---
opublish:
  assets_dir: ./assets
  output_dir: /Users/mac/qianzhu Vault/自媒体/02-内容生产/PinMe项目
  platform: xiaohongshu
  auto_upload: true
  r2_endpoint: https://<account>.r2.cloudflarestorage.com
  r2_bucket: obsidian-images
  r2_public_base_url: https://img.qianzhu.online
---
```

### 步骤2：读取内容
- 如果是文件路径，使用 `Read` 工具读取文件内容
- 如果是粘贴内容，直接使用

### 步骤3：选择风格模板
从 `references/style-profiles.md` 中选择风格：
- 探索派（默认）
- 实战派
- 理性派
- 个性派

**询问用户**：使用哪个风格模板，或者直接使用默认的探索派风格

新增内容维度（必须选）：
- `technical`：技术科普（机制、流程、取舍）
- `cognitive`：认知科普（模型、洞察、范式转移）

可在 frontmatter 声明：

```yaml
opublish:
  style: 探索派
  content_mode: technical
  writing_profile: deep_narrative
```

### 步骤4：内容重构
根据选定的风格参数，对原文内容进行：

1. **添加钩子开篇**（从风格模板库中选择或创作）
   - 生活化情景
   - 真实场景/对话
   - 具体时间/数字

2. **重组段落结构**
   - 提取核心观点
   - 添加小标题（如果有多个主题）
   - 调整叙述顺序（问题→探索→解决）

3. **调整语言风格**
   - 口语化程度调整
   - 添加「我」的视角
   - 情绪表达（冷幽默/直爽/克制等）
   - 避免AI味（检查 `style-profiles.md` 中的反AI清单）

4. **添加人设元素**
   - 根据风格人设关键词调整语气
   - 添加个人化表达

5. **平台硬约束校验**
   - `xiaolvshu`：正文<=1000字、纯文本、禁止 Markdown、不要写字数统计
   - `xiaohongshu`/`wechat`：保持可读分段结构

### 步骤5：生成封面图
优先使用 **Smart Illustrator 封面模式**（按目标平台）：

```bash
/smart-illustrator path/to/article.md --mode cover --platform <platform>
```

备用方案：调用 `baoyu-cover-image` 技能：

**参数**：
- 类型：infographic/clean/abstract
- 配色：根据内容选择（科技类用蓝色/紫色，生活类用暖色）
- 渲染风格：modern/minimalist
- 文字：文章标题（提取或生成）
- 情绪：根据风格选择

**返回**：封面图URL

### 步骤6：生成文内插图（Smart Illustrator 优先）
- `xiaolvshu`：跳过正文配图，仅保留封面
- `xiaohongshu` / `wechat`：优先使用 **Smart Illustrator**（双引擎：Mermaid + Gemini）

```bash
/smart-illustrator path/to/article.md --style light
```

**自动识别需要配图的位置**：
- 代码示例前
- 步骤说明中
- 对比部分
- 流程说明

输出（`xiaohongshu` / `wechat`）：`article-image.md` + 图片文件

**降级方案**：当 Gemini API 不可用或需要更强的概念插画时，使用 `baoyu-article-illustrator`。

### 步骤7：提示词兜底包（生图不稳定时）
当封面或正文图生成失败，立即生成单 markdown 提示词包并固定插图位置：

```bash
python3 ~/.claude/skills/O-Publish-skill/scripts/build_image_prompt_package.py \
  -i path/to/article.md \
  --platform xiaohongshu \
  --assets-dir ./assets \
  --cover-platform xiaohongshu
```

产物：
- `article-prompt-pack.md`（默认）
- `article-image-slotted.md`（可选）
- 若平台为 `xiaolvshu`，prompt-pack 仅包含封面槽位

JSON 格式参考：`references/image-prompt-schema.json`

### 步骤8：一体化收尾（Mermaid + 图床 + 链接回写 + 汇总）
执行：

```bash
python3 ~/.claude/skills/O-Publish-skill/scripts/opublish_finalize.py \
  -i path/to/article-image.md
```

输出：
- `article-image-<platform>-hosted.md`（启用上传）
- `article-image-<platform>.md`（未启用上传）
- 平台为 `xiaolvshu` 时，额外输出 `article-xiaolvshu-ready.txt`（纯文本，<=1000字）
- `article-prompt-pack.md`（仅在图片缺失/生图失败时生成；或显式强制生成）

### 步骤9：微信兼容（Mermaid → PNG）
公众号不支持 Mermaid 代码块。两种解决方案：

1. 强制使用 Gemini（避免 Mermaid）
   ```bash
   /smart-illustrator path/to/article.md --engine gemini
   ```
2. 将 Mermaid 导出为 PNG 并替换代码块：
   ```bash
   python3 ~/.claude/skills/O-Publish-skill/scripts/mermaid_to_png_replace.py \\
     -i path/to/article-image.md
   ```

### 步骤10：可选图床上传 + 链接替换（跨平台粘贴）
如果需要一份 Markdown 同时粘贴到公众号/小红书/其他平台，必须把 `./assets/...` 上传到图床并替换成可访问 URL：

```bash
export R2_ACCESS_KEY_ID=your_key
export R2_SECRET_ACCESS_KEY=your_secret

python3 ~/.claude/skills/O-Publish-skill/scripts/upload_assets_to_r2.py \\
  --assets-dir ./assets \\
  --s3-endpoint https://<account>.r2.cloudflarestorage.com/obsidian-images \\
  --public-base-url https://<public>.r2.dev \\
  --markdown path/to/article-image-<platform>.md
```

如果图片已提前上传，仅替换路径时可用 `replace_image_base_url.py`。

上传所需信息：
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`
- S3 API endpoint（含 bucket）
- 公网访问 URL（`r2.dev` 或自定义域名）

### 步骤11：格式化输出
按平台输出：
- `xiaolvshu`：直接输出纯文本成稿（无 Markdown 语法、正文<=1000字、无字数统计）
- `xiaohongshu` / `wechat`：调用 `baoyu-format-markdown` 输出 Markdown 成稿

### 步骤12：输出文件
生成文件：
- `xiaolvshu`：`{original-name}-xiaolvshu-ready.txt`
- `xiaohongshu` / `wechat`：`{original-name}-published.md`

文件结构：
```markdown
---
title: "文章标题"
cover: "封面图URL"
date: "2025-XX-XX"
style: "探索派"
---

[钩子开篇段落]

## 小标题1

[内容段落 + 图片]

![插图](URL)

## 小标题2

[内容段落]

---

[收尾段落]
```

---

## 相关技能整合说明

### obsidian-markdown
- **用途**：读取 Obsidian 笔记（支持 OFM 语法、wikilinks、properties）
- **使用场景**：步骤2读取内容
- **注意**：保留原文的 tags 和 properties 信息

### baoyu-cover-image
- **用途**：生成文章封面
- **使用场景**：步骤5
- **参数选择**：
  - 探索派：类型=infographic，配色=蓝色系，情绪=playful
  - 实战派：类型=clean，配色=红色系，情绪=serious
  - 理性派：类型=abstract，配色=灰色系，情绪=professional
  - 个性派：类型=bold，配色=对比色，情绪=bold

### smart-illustrator
- **用途**：主要配图引擎（Mermaid + Gemini）
- **使用场景**：步骤6（文内配图）/ 步骤5（封面）
- **微信**：Mermaid 需转 PNG 或强制 `--engine gemini`

### baoyu-article-illustrator
- **用途**：生成文内插图（备用）
- **使用场景**：步骤6 降级方案
- **插图类型选择**：
  - 工具类文章：screenshot + diagram
  - 教程类：step-by-step illustration
  - 观点类：concept illustration

### baoyu-format-markdown
- **用途**：格式化 `xiaohongshu` / `wechat` 最终输出
- **使用场景**：步骤11
- **说明**：`xiaolvshu` 走纯文本，不调用该技能

---

## 快速调用流程（伪代码）

```
function publishArticle(input, style = "探索派", platform = "wechat"):
    # 1. 获取内容
    if input.isFile:
        content = read(input.path)
    else:
        content = input.text

    # 2. 加载风格
    style_config = loadStyle(style)

    # 3. 重构内容
    article = rewriteContent(content, style_config)

    # 4. 生成封面（Smart Illustrator 优先）
    cover = generateCover(article.title, style)

    # 5. 平台配图策略
    if platform == "xiaolvshu":
        illustrated = article  # 仅封面，不生成正文图
    else:
        illustrated = smartIllustrate(article)

    # 6. 生图失败时生成提示词兜底包
    fallback = buildPromptPackIfNeeded(illustrated, platform)

    # 7. 一体化收尾（Mermaid + 图床 + 链接回写）
    hosted = finalizePublishAssetPipeline(fallback)

    # 8. 按平台格式化
    if platform == "xiaolvshu":
        formatted = toPlainText(hosted, maxChars=1000, noMarkdown=true, noWordCountFooter=true)
    else:
        formatted = formatMarkdown(hosted, cover)

    # 9. 输出
    save(formatted, "{original}-published.md")

    return formatted
```

---

## 用户交互流程示例

```
用户：我想把笔记发到公众号

Claude：好的，请提供笔记文件路径或粘贴内容

用户：/Users/mac/qianzhu Vault/自媒体/02-内容生产/工具分享.md

Claude：正在读取笔记...

Claude：已读取内容。使用哪个风格模板？
1. 探索派（默认）- 好玩有趣、发现小众工具
2. 实战派 - 踩坑经验、实战干货
3. 理性派 - 理性分析、数据说话
4. 个性派 - 直爽犀利、观点鲜明

用户：1

Claude：好的，使用探索派风格。开始创作...

[生成钩子]
[重构内容]
[生成封面]
[生成插图]
[格式化输出]

Claude：✅ 完成！
文章已保存至：工具分享-published.md
封面图：[URL]
插图数：3张

预览开头：
「今天发现一个好玩的工具，把我那堆乱七八糟的笔记全搞定了...」
```
