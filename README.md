# Qianzhu Skill Manager

一个本地优先的已安装 skill 管理台，用来统一扫描、预览、删除、同步和更新你分散在 `.claude`、`.codex`、`.agents` 里的 skills，并把远端 GitHub 仓库作为云端镜像层来做差异检查和同步。

## 当前能力

- 扫描本机多个 skill 目录并解析 `SKILL.md`、`README.md`、`package.json`
- 在 Web 界面里按 `Claude / Codex / Agents / 云端镜像 / 同步 / 配置` 分页管理
- 支持技能详情预览，包括 `SKILL.md`、README、文件列表、package 和 manifest
- 支持把选中的本地 skill 同步到其他本地库
- 支持把本地 skill 同步到仓库内的 `catalog/skills/<skill-id>` 作为云端镜像
- 支持从云端镜像一键同步回 Claude / Codex / Agents 本地目录
- 支持删除云端镜像 skill、本地移除 skill、保存目录配置
- 在界面内查看 Git 分支、远端仓库、拉取和推送状态
- 提供同步矩阵，检查同一个 skill 在本地库和云端镜像之间是否一致、缺失或有差异

## 项目文档

- [docs/ROADMAP.md](/Users/mac/qianzhu Vault/project/skills/docs/ROADMAP.md)
  - 产品目标、阶段 To Do、开源前检查项
- [docs/WORKTREES.md](/Users/mac/qianzhu Vault/project/skills/docs/WORKTREES.md)
  - worktree 拆分、职责分工、可直接复制的提示词

## 目录说明

- `skillhub.config.json`
  - 配置本地扫描目录、Catalog 路径和 GitHub 远端地址
- `backups/claude-code`
  - 当前机器的 Claude Code skills 源文件备份
- `backups/codex`
  - 当前机器的 Codex skills 源文件备份
- `backups/index.json`
  - 备份索引，记录每个 skill 的文件数、大小、哈希和更新时间
- `catalog/skills`
  - 远端仓库里被追踪的 skill 云端镜像
- `catalog/index.json`
  - 可供远端仓库、第三方脚本或未来客户端消费的索引文件
- `src/lib/skillhub.ts`
  - 本地扫描、索引、导入、安装的核心逻辑
- `src/app/api/actions/*`
  - Web 管理台对应的同步、删除、安装、重建索引、Git 同步接口

## 启动方式

```bash
npm install
npm run dev
```

打开 [http://localhost:3009](http://localhost:3009)。

如果你想用生产构建验证：

```bash
npm run build
npm run start
```

## Docker 启动

```bash
npm run docker:up
```

打开 [http://localhost:3009](http://localhost:3009)。

容器会挂载：

- 当前仓库的 `catalog/`
- 当前仓库的 `skillhub.config.json`
- 本机的 `/Users/mac/.claude`
- 本机的 `/Users/mac/.codex`
- 本机的 `/Users/mac/.agents`

停止容器：

```bash
npm run docker:down
```

查看日志：

```bash
npm run docker:logs
```

如果 Docker 构建时报 `input/output error`，问题通常不在这个项目，而在 Docker Desktop 的存储层或磁盘空间。当前这台机器上就检测到了 Docker overlay 存储读写错误，并且系统数据盘可用空间只剩约 `2.5GiB`，需要先清理磁盘或修复 Docker Desktop，再重新执行 `npm run docker:up`。

## 已绑定的远端仓库

- GitHub: [qianzhu18/skills](https://github.com/qianzhu18/skills)
- 本地分支: `main`

## 参考的开源思路

这个项目不是从零发明了一整套体系，而是做了资源整合和轻量缝合，主要参考了这几类模式：

- [Backtthefuture/huangshu - tools/skill-hub](https://github.com/Backtthefuture/huangshu/tree/main/tools/skill-hub)
  - 参考它的本地 Web 控制台、左侧导航、状态筛选、批量管理、版本历史和回收站方向
- [openai/skills](https://github.com/openai/skills)
  - 参考它的 skills catalog 和可分发结构
- [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases)
  - 参考“中心索引 + GitHub 仓库 + 本地安装”的商店模型
- [krstivoja/claude-skills-manager](https://github.com/krstivoja/claude-skills-manager)
  - 参考本地 skills 浏览和批量管理体验

## 视觉参考

- [qianzhu.me](https://qianzhu.me/)
  - 参考它的青绿色主色、米白背景、内容导航式分栏和更轻的卡片层级

## 后续可继续加的方向

- 适配 `main` 分支的 skills-only 备份布局：`claude-code/`、`codex/`、`index.json`
- 参考 Skill Hub 增加编辑 `SKILL.md`、版本快照、回收站和重复 skill 检测
- 在线编辑 `SKILL.md` / README
- Catalog 分类、标签和封面图
- GitHub OAuth / PAT 驱动的云端发布
- 多仓库镜像和团队共享 skill 源
