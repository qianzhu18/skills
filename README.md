# Qianzhu Skills

这个仓库只托管本机当前的 skills 备份，不再托管 Web 管理器项目代码。

## 目录

- `claude-code/`
  - Claude Code skills，来源为 `/Users/mac/.claude/skills`
- `codex/`
  - Codex skills，来源为 `/Users/mac/.codex/skills`
- `index.json`
  - 备份索引，记录每个 skill 的来源、相对路径、文件数、大小、更新时间和 hash
- `broken-symlinks.json`
  - 本机备份时发现但无法恢复的断链记录

## 备份规则

备份会展开有效符号链接，避免 GitHub 上出现指向本机路径的不可用 symlink。

为保持仓库可用，以下依赖缓存和构建产物不会托管：

- `.git/`
- `node_modules/`
- `.venv/`
- `__pycache__/`
- `dist/`
- `build/`
- `.next/`
- `.DS_Store`

## 当前索引

- Claude Code: 54 skills
- Codex: 19 skills
- 索引生成时间见 `index.json`

Web 管理器代码已从 `main` 移除；本机保留了一个 `codex/web-manager` 保护分支用于必要时恢复，`main` 只作为 skills 托管分支使用。
