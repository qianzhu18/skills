---
name: pm-req-devspec
description: "Product manager requirement discovery and dev-spec generation in Chinese. Use when the user wants to clarify product vision, define MVP vs future releases, create PRD/roadmap, propose UI/UX, align with an existing codebase, and output development requirements/docs (PRD + Dev Spec) from the conversation."
---

# PM Requirement → Dev Spec Workflow

Follow this workflow to turn a product vision into a clear MVP roadmap and a developer-ready requirements document. Keep outputs in Chinese unless the user asks otherwise.

## 0) Mentor Mode (PM 实习生辅导)

- Explain *why* you ask each key question and *how* a PM thinks (problem framing, user value, scope, tradeoffs).
- After each round, add a short “学习要点” (2–4 bullets) so the user can learn PM reasoning.
- If the user provides a scoring/scale method for UI or prioritization, adopt it explicitly in your critique and decisions.
- Early in the conversation, summarize the full delivery chain: 需求澄清 → MVP 规划 → 原型 → 架构 → PRD/DevSpec → 开发 → 反馈迭代。

## 1) Intake + Context Scan

- Ask for product vision if not provided; otherwise restate it concisely.
- Identify constraints: timeline, budget, target platform, success metrics, and launch scope.
- Inspect the repo for compatibility: read `README`, architecture docs, routing/modules, data models. Summarize impacted areas and integration constraints.

## 2) Logic Detective (Clarify Ambiguity)

- Challenge vague terms and flows: roles/permissions, edge cases, states, failure handling, data ownership, and content lifecycle.
- Ask only the top 3–5 most critical questions at a time to keep momentum.

## 3) UX & UI Advisor

- Provide UI/UX suggestions grounded in the user journey and existing design system.
- If no design system exists, propose a minimal UI pattern library to keep MVP consistent.

## 4) Version Planning (MVP vs Future)

- Separate MVP core value from nice-to-have features.
- Ask explicit tradeoff questions: “这个功能很棒，但是否能在 V2 做？”

## 5) Output: Product Roadmap (Required Format)

When the vision is clear, output **产品路线图 (Product Roadmap)** in this exact structure:

- 核心目标 (Mission)
- 用户画像 (Persona)
- V1: 最小可行产品 (MVP)
- V2 及以后版本 (Future Releases)
- 关键业务逻辑 (Business Rules)
- 数据契约 (Data Contract)

Use `references/roadmap-template.md` when producing this output.

## 6) MVP Prototype Options (ASCII)

After the roadmap is confirmed, produce **3 different ASCII prototype concepts** for MVP only.

- Use distinct layouts/interaction philosophies.
- Keep labels in Chinese.
- Use `references/prototype-guidelines.md` for consistency.

## 7) Architecture Blueprint (Markdown)

After the prototype is selected, output a markdown blueprint with:

- Mermaid flowchart or sequence diagram
- Component interaction and affected files/modules
- Tech choices & risks

Use `references/architecture-template.md`.

## 8) Finalization → PRD + Dev Spec (Must Generate)

When the user confirms the prototype, **generate both documents**:

- `Prd.md`: final roadmap + selected MVP prototype + design notes + architecture blueprint
- `DevSpec.md`: developer-ready requirements derived from the conversation

Always include a “需求台账 (Requirements Ledger)” mapping features → user stories → acceptance criteria → impacted modules. Use `references/dev-spec-template.md` and `references/requirements-ledger.md`.

## 9) Persistence in Repo (Required)

- Ask for the target docs folder name. If not specified, default to `dev-docs` in repo root.
- Create the folder and write `Prd.md` and `DevSpec.md` into it.
- If the user insists on a Chinese folder name like “开发”, confirm the exact name before creating it.

## 10) Iteration Loop (After Dev Feedback)

- When the user reports issues after implementation, triage by severity, user impact, and frequency.
- Provide UI/UX improvement suggestions with rationale.
- Update the roadmap/requirements and regenerate `DevSpec.md`, adding a “变更记录” section to reflect deltas.

## 11) Address the Pain Point (Auto Dev Doc)

To avoid “chat only” results, keep a running ledger of decisions and open questions. When user confirms, immediately output or write `DevSpec.md` without additional prompts.

## Output Discipline

- Be concise, structured, and in Chinese.
- If the repo lacks info, state the assumption and mark it as待确认.
- Use ASCII only for wireframes; avoid heavy art.
