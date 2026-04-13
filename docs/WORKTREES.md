# Worktree Playbook

这个仓库现在按一个主工作树 + 两个并行 worktree 来推进。

## 目录与职责

- `main`
  - 路径: `/Users/mac/qianzhu Vault/project/skills`
  - 角色: 集成主线，负责验收、合并、最终推送
  - 启动: `npm run dev:main`
  - 地址: `http://localhost:3000`

- `codex/catalog-ops`
  - 路径: `/Users/mac/qianzhu Vault/project/skills-catalog`
  - 角色: Skill catalog 整理、索引结构、批量导入体验、分类标签
  - 启动: `npm run dev:catalog`
  - 地址: `http://localhost:3001`

- `codex/sync-ops`
  - 路径: `/Users/mac/qianzhu Vault/project/skills-sync`
  - 角色: GitHub 同步、安装更新流程、启动稳定性、管理操作优化
  - 启动: `npm run dev:sync`
  - 地址: `http://localhost:3002`

## 常用命令

```bash
git worktree list
git branch
```

在不同 worktree 内分别启动：

```bash
cd "/Users/mac/qianzhu Vault/project/skills"
npm install
npm run dev:main
```

```bash
cd "/Users/mac/qianzhu Vault/project/skills-catalog"
npm install
npm run dev:catalog
```

```bash
cd "/Users/mac/qianzhu Vault/project/skills-sync"
npm install
npm run dev:sync
```

## 建议协作方式

- 先在对应 worktree 内完成单一主题改动
- 每个 worktree 只解决一类问题，避免互相覆盖
- 改完先 `npm run lint` / `npm run build`
- 回到主工作树 `main` 做 cherry-pick 或 merge

## 可直接复制的提示词

### Prompt A: Catalog 运营支线

```text
你在 Qianzhu Skill Store 的 catalog worktree 中工作。

当前分支：codex/catalog-ops
当前职责：优化 skill catalog 的管理能力，而不是改 Git 同步流程。

本轮优先事项：
1. 强化 catalog 的搜索、标签、分类、排序和批量导入体验。
2. 让 catalog/index.json 更适合作为“个人 skill 应用商店”的索引。
3. 保持 Web UI 可运行，完成后执行 npm run lint 和 npm run build。

限制：
- 只在当前 worktree 内工作。
- 不要改与 GitHub 同步无关的大块逻辑，除非是必要耦合。
- 不要回退其他分支可能会做的工作。
```

### Prompt B: 同步与安装支线

```text
你在 Qianzhu Skill Store 的 sync worktree 中工作。

当前分支：codex/sync-ops
当前职责：优化 GitHub 同步、本地安装更新、启动稳定性与管理操作，而不是改 catalog 结构本身。

本轮优先事项：
1. 强化 connect / fetch / pull / push 的反馈与错误处理。
2. 优化从 catalog 安装到 .claude / .codex / .agents 的流程。
3. 保证本地启动稳定，完成后执行 npm run lint 和 npm run build。

限制：
- 只在当前 worktree 内工作。
- 不要大改 catalog 信息架构，除非是同步流程必须依赖。
- 不要回退其他 worktree 的改动。
```

### Prompt C: 主线集成支线

```text
你在 Qianzhu Skill Store 的主工作树中工作。

当前分支：main
当前职责：集成 catalog 与 sync 两条支线的成果，做统一验收、冲突处理和最终发布准备。

本轮优先事项：
1. 拉取或合并并行支线的成果。
2. 验证 Web UI 在本地可启动且关键流程可用。
3. 确保 catalog、同步、安装三类能力协同工作。

限制：
- 不要在主线里直接做大块新功能，优先做整合和验收。
- 合并前后都要执行 npm run lint 和 npm run build。
```
