# Worktree Playbook

这个仓库现在按 `1 个主线 + 3 个并行 worktree` 推进，更适合你要的“本地 skill 管理器”开发方式。

## 当前工作树

- `main`
  - 路径: `/Users/mac/qianzhu Vault/project/skills`
  - 角色: 集成主线、验收、冲突处理、最终发布
  - 启动: `npm run dev:main`
  - 地址: `http://localhost:3009`

- `codex/catalog-ops`
  - 路径: `/Users/mac/qianzhu Vault/project/skills-catalog`
  - 角色: 虽然分支名保留旧名字，但现在主要负责本地技能列表 UI、搜索、分页、预览、排布
  - 启动: `npm run dev:catalog`
  - 地址: `http://localhost:3010`

- `codex/sync-ops`
  - 路径: `/Users/mac/qianzhu Vault/project/skills-sync`
  - 角色: 负责删除、跨库同步、GitHub 镜像同步、更新检查
  - 启动: `npm run dev:sync`
  - 地址: `http://localhost:3011`

- `codex/release-ops`
  - 路径: `/Users/mac/qianzhu Vault/project/skills-release`
  - 角色: Docker、去个人化配置、README、开源发布准备
  - 启动: `npm run dev`
  - 地址: `http://localhost:3009`

## 开发拆解

### Worktree A: 本地管理 UI

目标：

1. 只围绕 `.claude/skills` 和 `.codex/skills`
2. 把列表、搜索、排序、分页、预览做好
3. 界面像“本地应用商店”，但核心是已安装 skill 管理

交付：

1. 双库列表页
2. 搜索栏
3. 状态筛选
4. 详情预览
5. 删除入口

### Worktree B: 同步与更新

目标：

1. 打通 Claude 和 Codex 之间的双向同步
2. 打通和 GitHub 仓库之间的镜像同步
3. 做更新检查面板和差异提示

交付：

1. 本地差异矩阵
2. GitHub fetch / pull / push 反馈
3. 同步确认和覆盖策略
4. 定时更新检查的设计占位

### Worktree C: Docker 与开源

目标：

1. 让别人拉仓库后，只改配置就能跑
2. 去掉个人路径依赖
3. 补 Docker 与 README

交付：

1. 稳定的容器启动
2. 默认 `3009` 端口
3. 示例配置
4. 开源文档与截图

## 常用命令

```bash
git worktree list
git branch
```

分别启动：

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

```bash
cd "/Users/mac/qianzhu Vault/project/skills-release"
npm install
npm run dev
```

## 协作原则

1. `main` 只做集成，不做大块新功能
2. 每个 worktree 只负责一个主题，减少互相覆盖
3. 进入合并前，先跑 `npm run lint` 和 `npm run build`
4. 支线改动用 cherry-pick 或 merge 回 `main`

## 可直接复制的提示词

### Prompt A: UI 与搜索支线

```text
你在 Qianzhu Skill Manager 的 UI worktree 中工作。

当前分支：codex/catalog-ops
当前职责：把项目做成“本地已安装 skill 管理器”，重点优化 Claude / Codex 技能列表、搜索、排序、分页、预览和删除，而不是去做大而全的技能商城。

本轮优先事项：
1. 默认只突出 Claude 和 Codex 两个技能库。
2. 做好搜索、筛选、排序、分页和预览。
3. 让界面更像本地应用管理器，而不是仓库索引后台。
4. 完成后执行 npm run lint 和 npm run build。

限制：
- 只在当前 worktree 内工作。
- 不要大改 GitHub 同步逻辑。
- 不要回退其他分支的改动。
```

### Prompt B: 同步与更新支线

```text
你在 Qianzhu Skill Manager 的 sync worktree 中工作。

当前分支：codex/sync-ops
当前职责：负责 Claude / Codex 技能的删除、跨库同步、GitHub 镜像同步与更新检查，而不是改整体页面排版。

本轮优先事项：
1. 做好跨库同步确认和覆盖策略。
2. 做好本地和 GitHub 镜像的差异检查。
3. 强化 fetch / pull / push 的反馈。
4. 为后续定期更新检查预留接口。
5. 完成后执行 npm run lint 和 npm run build。

限制：
- 只在当前 worktree 内工作。
- 不要大改主界面视觉层。
- 不要回退其他分支的改动。
```

### Prompt C: Docker 与开源支线

```text
你在 Qianzhu Skill Manager 的 release worktree 中工作。

当前分支：codex/release-ops
当前职责：把项目做成一个别人能直接拉取、挂载本地 skills 目录、用 Docker 跑起来的开源工具。

本轮优先事项：
1. 修复 Docker 启动链路。
2. 去掉个人路径和个人仓库耦合。
3. 提供示例配置和更稳的 README。
4. 为开源发布准备截图、说明和启动指南。
5. 完成后执行 npm run lint 和 npm run build。

限制：
- 只在当前 worktree 内工作。
- 不要大改业务逻辑，除非是容器化必须依赖。
- 不要回退其他分支的改动。
```

### Prompt D: 主线集成支线

```text
你在 Qianzhu Skill Manager 的主工作树中工作。

当前分支：main
当前职责：集成 UI、同步、Docker 三条支线的成果，做统一验收和发布准备。

本轮优先事项：
1. 合并并行 worktree 的成果。
2. 确认 3009 端口本地可预览。
3. 验证 Claude / Codex skills 的搜索、预览、同步和删除流程。
4. 为开源发布做最终检查。

限制：
- 不要在主线里直接做大块新功能。
- 合并前后都要执行 npm run lint 和 npm run build。
```
