# Smart Illustrator Integration (O-Publish)

## Purpose

Use Smart Illustrator as the primary illustration engine. It auto-detects where to place images and chooses **Mermaid** (structured diagrams) or the image generator route (creative visuals, defaulting to **Sophnet**).

## Location

- Preferred skill path: `~/.claude/skills/smart-illustrator`
- Vendored copy: `~/.claude/skills/O-Publish-skill/references/smart-illustrator`

> If the skill path is missing, create a symlink:
>
> ```bash
> ln -s ~/.claude/skills/O-Publish-skill/references/smart-illustrator ~/.claude/skills/smart-illustrator
> ```

## Style Mapping (Suggested)

- Explorer (探索派) → `--style light`
- Practitioner (实战派) → `--style dark`
- Analyst (理性派) → `--style minimal`
- Maverick (个性派) → `--style dark` or `--style minimal`

## Article Mode (In-Article Images)

```bash
# Default: auto engine selection
/smart-illustrator path/to/draft.md --style light

# Force image generator only (no Mermaid blocks)
/smart-illustrator path/to/draft.md --style light --engine gemini

# Skip cover if you only need in-article images
/smart-illustrator path/to/draft.md --no-cover
```

Output:
- `draft-image.md` (images inserted)
- `draft-image-01.png`, `draft-image-02.png`, ...

## WeChat Compatibility (Mermaid → PNG)

WeChat does **not** render Mermaid code blocks. Use one of these options:

### Option A: Avoid Mermaid

```bash
/smart-illustrator path/to/draft.md --engine gemini
```

### Option B: Convert Mermaid Blocks to PNG (Recommended for diagrams)

```bash
python3 ~/.claude/skills/O-Publish-skill/scripts/mermaid_to_png_replace.py \
  -i path/to/draft-image.md
```

Output:
- `draft-image-wx.md` (Mermaid blocks replaced with `![diagram](...)`)
- `draft-image-mermaid-01.png`, `draft-image-mermaid-02.png`, ...

## Cover Mode (WeChat)

```bash
/smart-illustrator path/to/draft.md --mode cover --platform wechat
```

## Prerequisites

- `bun` runtime
- Mermaid CLI: `npm install -g @mermaid-js/mermaid-cli`
- Sophnet API key (default for creative visuals): `SOPHNET_API_KEY`
- Gemini API key (optional fallback): `GEMINI_API_KEY`

## Recommended Pipeline

1. Rewrite article content (style profile)
2. Run Smart Illustrator (article mode)
3. Convert Mermaid → PNG (if any)
4. Pass the `*-image-wx.md` to `baoyu-format-markdown`
5. Publish to WeChat
