# Local Skills Backup

This directory is a source backup of the local skills installed on this machine.

## Sources

- `claude-code/`
  - Source: `/Users/mac/.claude/skills`
  - Purpose: Claude Code skills backup
- `codex/`
  - Source: `/Users/mac/.codex/skills`
  - Purpose: Codex skills backup
- `index.json`
  - Generated inventory with skill counts, file counts, sizes, hashes, and timestamps

## Exclusions

The backup intentionally excludes dependency caches and generated artifacts:

- `.git/`
- `node_modules/`
- `.venv/`
- `__pycache__/`
- `dist/`
- `build/`
- `.next/`
- `.DS_Store`

Valid symlinks are dereferenced during backup so the GitHub copy stays portable. Broken source symlinks are not copied; they are recorded in `broken-symlinks.json`.

These exclusions keep the GitHub repository usable while preserving the skill source files needed for management, search, preview, and restoration.
