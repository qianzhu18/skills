---
name: wechat-cover
description: Use when creating or revising qianzhu WeChat article cover images, especially Dan Koe style black-and-white Victorian woodcut/etching covers, cover prompt writing, cover candidate generation, image-hosting rewrite, and Obsidian fullchain article assets. Triggers include 公众号封面, WeChat cover, 封面图, Dan Koe 封面, 黑白版画, 木刻, 蚀刻, Gustave Dore, 横向封面, 图床封面, and qianzhu article cover generation.
---

# WeChat Cover

这个 skill 专门管理千竹/千逐公众号文章封面图。

默认审美不是泛科技感，而是 Dan Koe 式黑白维多利亚版画：用一个具体物体做超现实隐喻，把文章观点变成有叙事感和哲学感的 16:9 横向封面。

## When To Use

- 公众号文章需要封面图
- Obsidian 内容生产全链路里要补封面、图床、hosted 稿
- 用户提到 Dan Koe、黑白木刻、蚀刻、Gustave Dore、维多利亚版画封面
- 已有封面太科技感、太抽象、太像通用 AI 图，需要改成千逐内容体系里的封面

## Workflow

1. 先读文章，提炼核心主题、核心观点、情绪基调和关键视觉锚点。
2. 读 [references/dankoe-victorian-cover.md](references/dankoe-victorian-cover.md)，按里面的模板写英文 prompt。
3. 先做“本体绑定”检查：封面主体必须来自文章真正讨论的对象、工具、项目、工程结构或场景；不要只用罗盘、迷宫、云、光门这类泛学习/泛成长隐喻。
4. 公众号项目默认生成 2 张封面候选，保留 prompt 文件，放在项目 `prompts/` 目录，不放进 `assets/`。
5. 候选图放进 `assets/`，推荐命名为 `源稿-wechat-cover-dankoe-01.png` 和 `源稿-wechat-cover-dankoe-02.png`。
6. 选择 1 张作为正文首图和 frontmatter cover。若 O-Publish 会强制标准文件名，可把入选图同步为 `源稿-wechat-cover.png`，或在 hosted 稿中使用独立候选 URL 避免 CDN 同名缓存。
7. 重新跑全链路上传图床，检查封面 URL 是 200，且最终 hosted 稿封面指向入选图。

## Model Routing

默认优先级不能改：

1. 先走 `smart-illustrator/scripts/generate-image.ts` 的默认模型，也就是 Gemini 3 图像模型。不要一开始就指定 `gemini-2.5-flash-image`。
2. 如果 Gemini 3 长时间无输出、卡住、超时、没有落图，才停止该进程并降级重试 `--model gemini-2.5-flash-image`。
3. 如果 `npx bun` 因 npm 缓存冲突失败，可以直接用本机 `bun` 跑同一个脚本，但模型优先级仍然不变。
4. 如果自动生图仍失败，继续按项目要求补真实 PNG；不要把 prompt-pack 当成完成态。

默认命令：

```bash
bun ~/.codex/skills/smart-illustrator/scripts/generate-image.ts \
  --prompt-file path/to/wechat-cover-prompt.md \
  --output path/to/assets/源稿-wechat-cover-dankoe-01.png \
  --aspect-ratio 16:9 \
  --size default \
  --no-config
```

仅当 Gemini 3 卡住或失败后，才使用降级命令：

```bash
bun ~/.codex/skills/smart-illustrator/scripts/generate-image.ts \
  --model gemini-2.5-flash-image \
  --prompt-file path/to/wechat-cover-prompt.md \
  --output path/to/assets/源稿-wechat-cover-dankoe-01.png \
  --aspect-ratio 16:9 \
  --size default \
  --no-config
```

## Quality Check

- 16:9 横向封面
- 黑白木刻/蚀刻风格
- 有 Gustave Dore 式交叉影线和点画
- 主体和文章本体相关，而不是只有抽象漂亮的学习/方向/迷宫隐喻
- 一个清晰前景主体，最多 2-3 个辅助细节
- 图片本身没有文字、字母、数字、logo、水印
- 有纯黑负空间给后期文字叠加
- 不对称、不居中死板、不像广告海报
- hosted 稿中的封面 URL 可访问

## Fullchain Contract

`qianzhu-writing-style` 负责文章判断线和项目全链路意识；`wechat-cover` 负责公众号封面的审美、prompt、候选图、模型降级策略和图床验证。

进入 Obsidian 全链路时，封面图缺失就不算完成。
