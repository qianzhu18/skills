# Qianzhu Skill Store

一个本地优先的 skill 管理台，用来统一扫描、搜索、导入、安装和同步你分散在 `.claude`、`.codex`、`.agents` 里的 skills，并把它们整理成一个可同步到 GitHub 的个人 skill 应用商店。

## 当前能力

- 扫描本机多个 skill 目录并解析 `SKILL.md`、`README.md`、`package.json`
- 在 Web 界面里搜索技能名、描述、命令、触发词和来源库
- 把任意本地 skill 导入到仓库内的 `catalog/skills/<skill-id>`
- 生成可提交到远端仓库的 `catalog/index.json`
- 从 Catalog 一键安装或更新回 Claude / Codex / Agents 本地目录
- 在界面内查看 Git 分支、远端仓库、拉取和推送状态

## 目录说明

- `skillhub.config.json`
  - 配置本地扫描目录、Catalog 路径和 GitHub 远端地址
- `catalog/skills`
  - 你的 Skill Store 实际收录内容
- `catalog/index.json`
  - 可供远端仓库、第三方脚本或未来客户端消费的索引文件
- `src/lib/skillhub.ts`
  - 本地扫描、索引、导入、安装的核心逻辑
- `src/app/api/actions/*`
  - Web 管理台对应的导入、安装、重建索引、Git 同步接口

## 启动方式

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 已绑定的远端仓库

- GitHub: [qianzhu18/skills](https://github.com/qianzhu18/skills)
- 本地分支: `main`

## 参考的开源思路

这个项目不是从零发明了一整套体系，而是做了资源整合和轻量缝合，主要参考了这几类模式：

- [openai/skills](https://github.com/openai/skills)
  - 参考它的 skills catalog 和可分发结构
- [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases)
  - 参考“中心索引 + GitHub 仓库 + 本地安装”的商店模型
- [krstivoja/claude-skills-manager](https://github.com/krstivoja/claude-skills-manager)
  - 参考本地 skills 浏览和批量管理体验

## 后续可继续加的方向

- 在线编辑 `SKILL.md` / README
- Catalog 分类、标签和封面图
- GitHub OAuth / PAT 驱动的云端发布
- 多仓库镜像和团队共享 skill 源
