---
name: O-Manage-skill
description: Operate and optimize content topic systems with a focus on tool recommendations, AI coding how-to, and knowledge/ops workflows. Use when the user asks how to run or improve a topic, series, or content section, build a topic library and reuse system, set up data-driven review loops, or manage content ops beyond publishing. Integrates with O-Publish-skill for publishing.
---

# O-Manage-skill

Build and run a systematic content-ops loop from topic intake to data-driven iteration, not just publishing.

## Quick Start

1. Ask for context with the intake questions below.
2. Check or propose a directory structure and material library.
3. Set up the operating loop: capture -> deepen -> produce -> publish -> review -> compound.
4. Create the first batch of topic briefs and a review cadence.
5. If the user is ready to publish, hand off to O-Publish-skill.

## Intake Questions (询问式)

Ask and confirm these before designing the system:

1. 内容类型: 短文字/图文/长文/教程/混合
2. 平台: 小红书/推特/公众号/博客/其他
3. 平台优先级: 例如 公众号 > 小红书 > 博客
4. 目标: 涨粉/转化/变现/品牌/产品教育
5. 受众与细分板块: 目标人群, 具体板块名称
6. 频率与产能: 周更频次, 个人或团队
7. 现有资产: 旧文稿/素材库/数据表/方法论
8. 主要痛点: 选题难/复用低/效率低/数据不清
9. 评价指标: 曝光/互动/收藏/关注/转化
10. 重点方向优先级: 工具推荐/AI编程教程/知识库与OPS/自动化提示词/Apple生态/其他
11. 受众水平: 小白友好/中级用户/进阶
12. 教程成本上限: 可接受的篇幅和时间
13. 单篇字数上限: 例如 3000 字
14. 配图预算: 0-1 张/2-3 张/不限
15. 自有项目或工具: 例如 \"ktub\" 的定位与作用
16. 内容存放路径: Obsidian 仓库路径与项目目录

If any answer is missing, ask explicitly before proceeding.

## Positioning (定位)

- 目标导向: 先跑内容与涨粉，再优化 slogan 与商业化。
- 内容输出主形态: 清单 + 案例 + 低成本教程，帮助普通人高效上手。
- 参考 `references/framework.md` 的定位模板生成短句。

## Platform Priority (平台优先级)

- Default when unspecified: 公众号 > 小红书 > 博客
- Adapt the same topic into platform-specific formats.

## Storage Rule (内容存放)

- If the user provides an Obsidian path, create/update templates and logs in that vault.
- Do not store operational logs inside the skill folder unless explicitly requested.

## Project Defaults (当前配置，可覆盖)

- 平台优先级: 公众号 > 小红书 > 博客
- 受众: 混合型（小白友好到中级）
- 主题权重: 工具推荐 > AI 编程 > 知识库&OPS > 其他
- 单篇字数上限: 3000 字
- 配图预算: 0-1 张
- 产出比例: L0/L1 为主，L2 低频，L3 可选

## Core Principles

- System > fragments: every output should add to the system.
- Reuse beats re-invent: search before writing.
- Data drives method: publish data feeds back to frameworks.
- Content is the inlet, business is the outlet.

## Operating Loop

### Step 1: Capture (选题记录)

- Create a single inbox for raw ideas.
- Log every idea with date, platform, and quick notes.
- Use the Topic Card template from `references/framework.md`.
- Prefer writing records into the user’s Obsidian vault when provided.

### Step 2: Deepen (选题深化)

- Search the material library first.
- Reuse proven frames and phrasing where possible.
- If no reuse exists, create a new brief and tag it.

### Step 3: Produce (内容生产)

- Draft a brief with hook, structure, and key points.
- Choose the right format per platform and effort level.
- Use the format ladder in `references/framework.md` to reduce tutorial cost and image load.
- If publishing is required, pass the brief or draft to O-Publish-skill.

### Step 4: Publish & Log (发布与记录)

- Log publish date, platform, and performance.
- Track at least one primary metric and one secondary metric.
- Move the content from “in production” to “published.”
- Store publish logs in the user’s knowledge base by default.

### Step 5: Review & Compound (复盘与沉淀)

- Weekly review: what to repeat, what to kill, what to adjust.
- Monthly review: update methods, refine topic pillars.
- Feed learnings into the material library and frameworks.
- Maintain an iteration log (what changed, why, and data signal).

## Material Library

Maintain a reusable library with minimum sections:

- Core concepts (理论框架)
- Golden sentences (高质量表达)
- Proven drafts (爆款结构/高表现文稿)
- Raw archive (历史内容与原始素材)

See `references/framework.md` for a sample structure.

## Deliverables

When running this skill, produce:

- A tailored directory structure
- A topic backlog with scoring
- 1-3 topic briefs ready for production
- A publish log template and review cadence
- Optional: 3 slogan/定位句备选
- Optional: iteration log template (ops file)
- Optional: vault setup and initial templates in the user’s Obsidian path

## Integrations

- O-Publish-skill: for final publishing and packaging.
- baoyu-format-markdown: for consistent formatting when needed.
- baoyu-cover-image / baoyu-article-illustrator: optional for visuals.

## Safety

- Do not delete existing user data.
- Prefer adding new files and templates.
- Keep naming consistent with the user’s current system.

## Reference

Use `references/framework.md` for templates, directory layouts, format ladder, and review checklists.
