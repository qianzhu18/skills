#!/usr/bin/env bash
set -euo pipefail

VAULT_ROOT="/Users/mac/qianzhu Vault/自媒体"
TOPIC_CARD=""
PROJECT_NAME=""

usage() {
  cat <<'EOF'
Usage:
  bash ~/.claude/skills/obsidian-blog-fullchain/scripts/bootstrap_topic_project.sh \
    --vault-root "/Users/mac/qianzhu Vault/自媒体" \
    --topic-card "01-选题库/选题卡片-PinMe.md" \
    [--project-name "PinMe项目"]
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --vault-root) VAULT_ROOT="$2"; shift 2 ;;
    --topic-card) TOPIC_CARD="$2"; shift 2 ;;
    --project-name) PROJECT_NAME="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 2 ;;
  esac
done

[[ -n "$TOPIC_CARD" ]] || { echo "[ERROR] --topic-card is required" >&2; usage; exit 2; }

VAULT_ROOT="$(cd "$VAULT_ROOT" && pwd)"
TOPIC_CARD_PATH="$VAULT_ROOT/$TOPIC_CARD"
[[ -f "$TOPIC_CARD_PATH" ]] || { echo "[ERROR] Topic card not found: $TOPIC_CARD_PATH" >&2; exit 2; }

if [[ -z "$PROJECT_NAME" ]]; then
  base="$(basename "$TOPIC_CARD_PATH" .md)"
  base="${base#选题卡片-}"
  if [[ "$base" == *项目 ]]; then
    PROJECT_NAME="$base"
  else
    PROJECT_NAME="${base}项目"
  fi
fi

PROJECT_DIR="$VAULT_ROOT/02-内容生产/$PROJECT_NAME"
mkdir -p \
  "$PROJECT_DIR/公众号" \
  "$PROJECT_DIR/小红书" \
  "$PROJECT_DIR/小绿书" \
  "$PROJECT_DIR/title" \
  "$PROJECT_DIR/assets" \
  "$PROJECT_DIR/scripts" \
  "$PROJECT_DIR/archive/generated" \
  "$PROJECT_DIR/archive/docs"

RUN_SH="$PROJECT_DIR/scripts/run_fullchain.sh"
if [[ ! -f "$RUN_SH" ]]; then
  cat > "$RUN_SH" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
python3 "$HOME/.claude/skills/O-Publish-skill/scripts/opublish_fullchain_project.py" \
  --project-dir "$PROJECT_DIR"
EOF
  chmod +x "$RUN_SH"
fi

README="$PROJECT_DIR/README.md"
if [[ ! -f "$README" ]]; then
  cat > "$README" <<EOF
# ${PROJECT_NAME}

选题卡（双向链接）：[[${TOPIC_CARD%.md}]]

## 目录

- 公众号/
- 小红书/
- 小绿书/
- title/
- assets/
- scripts/
- archive/

## 一键命令

\`\`\`bash
cd "$PROJECT_DIR"
bash scripts/run_fullchain.sh
\`\`\`
EOF
fi

MEM="$PROJECT_DIR/记忆同步.md"
if [[ ! -f "$MEM" ]]; then
  cat > "$MEM" <<EOF
# 记忆同步（${PROJECT_NAME}）

更新时间：$(date +%Y-%m-%d)

## 一键命令

\`\`\`bash
cd "$PROJECT_DIR"
bash scripts/run_fullchain.sh
\`\`\`
EOF
fi

TITLE_WECHAT="$PROJECT_DIR/title/公众号-爆款标题候选.md"
TITLE_XHS="$PROJECT_DIR/title/小红书-爆款标题候选.md"
TITLE_XLS="$PROJECT_DIR/title/小绿书-标题候选.md"

[[ -f "$TITLE_WECHAT" ]] || cat > "$TITLE_WECHAT" <<'EOF'
# 公众号爆款标题候选

最终选择：⬜️
EOF

[[ -f "$TITLE_XHS" ]] || cat > "$TITLE_XHS" <<'EOF'
# 小红书爆款标题候选

最终选择：⬜️
EOF

[[ -f "$TITLE_XLS" ]] || cat > "$TITLE_XLS" <<'EOF'
# 小绿书标题候选

最终选择：⬜️
EOF

TOPIC_LINK_LINE="对应项目（双向链接）：[[02-内容生产/${PROJECT_NAME}/README]]"
TITLE_LINK_LINE="标题池：[[02-内容生产/${PROJECT_NAME}/title/公众号-爆款标题候选]]、[[02-内容生产/${PROJECT_NAME}/title/小红书-爆款标题候选]]、[[02-内容生产/${PROJECT_NAME}/title/小绿书-标题候选]]"

if ! rg -n "对应项目（双向链接）" "$TOPIC_CARD_PATH" >/dev/null 2>&1; then
  {
    echo
    echo "$TOPIC_LINK_LINE"
  } >> "$TOPIC_CARD_PATH"
fi
if ! rg -n "标题池：" "$TOPIC_CARD_PATH" >/dev/null 2>&1; then
  {
    echo "$TITLE_LINK_LINE"
  } >> "$TOPIC_CARD_PATH"
fi

if ! rg -n "\\[\\[${TOPIC_CARD%.md}\\]\\]" "$README" >/dev/null 2>&1; then
  {
    echo
    echo "选题卡（双向链接）：[[${TOPIC_CARD%.md}]]"
  } >> "$README"
fi

echo "[OK] Project bootstrapped: $PROJECT_DIR"
echo "[OK] Run next:"
echo "  cd \"$PROJECT_DIR\""
echo "  bash scripts/run_fullchain.sh"
