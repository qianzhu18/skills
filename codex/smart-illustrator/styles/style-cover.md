# Style: Cover / Dan Koe Black-And-White Engraving

用于 Newsletter 封面、公众号封面、YouTube 缩略图、Twitter/X 卡片等横向封面图。

这份封面风格用于还原 Dan Koe 多张封面图的黑白维多利亚版画美学：不靠彩色科技感，不靠标题文字，而是用一个超现实隐喻主体，把文章观点转成有哲学感和叙事感的黑白木刻/蚀刻画面。

> 默认要求：最终图片中不出现任何文字。封面给文字叠加预留纯黑区域，但图片本身不要写字。

## 推荐工作流

1. 先分析文章内容，提炼核心主题、核心观点、情绪基调和关键视觉锚点。
2. 设计 2-3 个隐喻方案，优先选择具体物体，不要画抽象概念本身。
3. 用本文件的固定模板输出英文 prompt。
4. 调用 `generate-image.ts` 生成候选图，公众号默认至少 2 张候选。默认先走脚本内置 Gemini 3 图像模型；只有卡住、超时、长时间无响应或没有落图时，才降级重试 `--model gemini-2.5-flash-image`。
5. 验证：16:9 横向、黑白、无文字、木刻/蚀刻质感、非居中死板构图、有文字预留区。

## 平台尺寸预设

| 平台 | 代码 | 尺寸 | 比例 |
|------|------|------|------|
| YouTube | `youtube` | 1280x720 | 16:9 |
| 公众号 | `wechat` | 900x383 | 2.35:1 |
| Twitter | `twitter` | 1200x628 | 1.91:1 |
| 小红书 | `xiaohongshu` | 1080x1440 | 3:4 |
| 通用横版 | `landscape` | 1920x1080 | 16:9 |

> 注意：本风格核心是 16:9 横向文章封面。如果后续平台需要 2.35:1 或 1.91:1，可先生成 16:9，再裁切或居中留黑适配。

---

## Image Generation System Prompt

> **重要**：最终发送给图像生成模型的 prompt 必须使用英文。中文只用于隐喻推导和内部分析。

```
You are a conceptual visual designer specializing in Victorian-era engraving aesthetics. Your task is to transform abstract ideas into horizontal 16:9 article cover images in black-and-white woodcut or etching style.

You create surreal visual metaphors with narrative and philosophical depth, using Gustave Dore style cross-hatching, stippling, dense linework, carved shadows, and negative space.

ABSOLUTE STYLE REQUIREMENTS:
- Horizontal black-and-white banner, 16:9 ratio.
- Victorian illustration / Gustave Dore inspired woodcut or etching aesthetic.
- High-contrast black ink on pale engraving paper or pure black void.
- Detailed cross-hatching and stippling, hand-engraved linework, no smooth gradients.
- One clear foreground subject, plus at most 2-3 symbolic supporting details.
- Leave a pure black negative-space area for future text overlay, but do not add any text to the image itself.
- Composition must not be perfectly symmetrical or dead-centered. Use asymmetry and negative space.
- The image must feel editorial, philosophical, and metaphorical, not decorative.

STRICT NEGATIVE CONSTRAINTS:
- No color, no gradients, no grayscale photography, no flat vector art, no 3D rendering, no cartoon, no watercolor, no oil painting.
- No soft shadow gradients, no blur, no glow, no filter look, no flat filled black shapes without engraving texture.
- No vertical or square composition, no non-16:9 ratio, no centered poster layout without text reserve.
- No literal translation of the topic, no unrelated decorations, no more than three main visual elements, no over-abstract shapes.
- No cute, cartoonish, horror, gore, advertising, or stock illustration feel.
- No readable text, no letters, no numbers, no logos, no watermark, no photo collage, no low-resolution output.

CONTENT ANALYSIS STEPS:
1. Extract:
   - Core theme: one noun.
   - Core viewpoint: one sentence.
   - Emotional tone: choose one from inspirational / mysterious / protective / breakthrough / contemplative / rebellious.
   - Key visual anchors.
2. Design the metaphor:
   - Foreground subject: a concrete object strongly related to the theme.
   - Surreal transformation mechanism: how the object visually expresses the viewpoint.
   - 2-3 symbolic supporting details.
3. Output the final prompt using this exact structure:

A horizontal black and white [woodcut/etching] banner (16:9 ratio), depicting [detailed foreground subject], but [surreal transformation]. The [subject] rendered in detailed cross-hatching showing [texture], the [metaphor element] in lighter stippling creating [feeling]. [light source description] against pure black void. [decorative details] in negative space. [text area position] pure black for text overlay. [emotional tone] mood in Victorian illustration/Gustave Dore style.

The final image must contain zero text.
```

---

## 中文执行步骤

### 1. 先分析内容

提炼：

- 核心主题（1 个名词）
- 核心观点（1 句话）
- 情绪基调（选择一个：`inspirational` / `mysterious` / `protective` / `breakthrough` / `contemplative` / `rebellious`）
- 关键视觉锚点

### 2. 设计隐喻方案

确定：

- 前景主体物：必须是与主题强关联的具体物体
- 隐喻转化机制：如何用超现实方式表达观点
- 2-3 个象征性辅助细节

### 3. 输出提示词

按此格式：

```text
A horizontal black and white [woodcut/etching] banner (16:9 ratio), depicting [前景主体物详细描述], but [超现实转化描述]. The [主体物] rendered in detailed cross-hatching showing [质感], the [隐喻元素] in lighter stippling creating [感觉]. [光源描述] against pure black void. [装饰细节] in negative space. [文字区域位置] pure black for text overlay. [情绪] mood in Victorian illustration/Gustave Dore style.
```

### 4. 解释隐喻

用 1-2 句话说明图片如何视觉化文章观点。

## 负向约束

严格遵守：

- 不要：彩色 / 渐变 / 灰度照片 / 扁平化 / 3D 渲染 / 卡通 / 水彩 / 油画风格
- 不要：阴影渐变 / 模糊 / 光晕 / 滤镜感 / 平涂黑色
- 不要：竖版 / 方形 / 非 16:9 / 对称居中 / 无文字预留区
- 不要：字面翻译 / 无关装饰 / 超过 3 个主要元素 / 过度抽象
- 不要：可爱 / 卡通 / 恐怖 / 血腥 / 广告感风格
- 不要：添加文字 / 照片拼贴 / 低分辨率

## 文章封面示例模板

```text
[Insert the Image Generation System Prompt above]

Analysis:
- Core theme: Learning
- Core viewpoint: AI coding matters because real projects train the maker through action, feedback, and embodied interaction.
- Emotional tone: contemplative
- Key visual anchors: a compass, a hand, tangled threads, a black void for text overlay.

Metaphor:
- Foreground subject: an antique compass
- Surreal transformation: the compass needle becomes a human hand pulling a thread from a maze
- Supporting details: thin thread trails, small tool silhouettes, distant doorway

Final prompt:
A horizontal black and white etching banner (16:9 ratio), depicting an antique brass compass lying open on rough paper, but its needle has transformed into a human hand pulling a thread out of a small labyrinth. The compass rendered in detailed cross-hatching showing worn metal and scratched glass, the thread and maze in lighter stippling creating a feeling of embodied orientation through action. A hard candle-like light source from the upper left against pure black void. Two tiny tool silhouettes and a distant doorway in negative space. The right third remains pure black for text overlay. contemplative mood in Victorian illustration/Gustave Dore style.

Metaphor explanation:
The compass represents orientation in AI coding, while the hand-thread transformation shows that understanding comes from action and feedback, not abstract definitions alone.
```
