---
name: qianzhu-writing-style
description: Use when drafting or revising qianzhu/Lucien personal-brand writing, especially WeChat long-form articles, Obsidian content-production projects, bios, and promo copy about AI tools, open-source projects, workflows, internet culture observations, everyday-phenomenon insights, trend observations, and the real growth of a young practitioner. Triggers include 公众号文章, 写稿, 用我的风格写, 改成千逐语气, 内容生产全流程, Obsidian 写作, 封面图, 配图, 作者简介, 置顶介绍, 互联网文化观察, 从小事洞察趋势, and article rewrites that feel too institutional, too abstract, or not enough like qianzhu.
---

# Qianzhu Writing Style

用这个 skill 解决一件事：

内容读起来，像不像千逐本人，像不像一个还在成长中的年轻 AI 实践者。

目标不是套一个泛泛的科技写作模板，而是稳定住一个具体的人设：

- 真的在试工具、做项目、搭工作流的人
- 有判断，但不装成熟导师的人
- 既想分享方法，也愿意留下成长痕迹的人
- 更像个人号，不像机构号的人

先按这个顺序读：

1. [references/persona.md](references/persona.md) 锁定身份、可信度和气质。
2. [references/audience.md](references/audience.md) 判断这篇是写给谁看。
3. [references/content-methodology.md](references/content-methodology.md) 选择文章主线和结构。
4. 如果题目来自一个看似很小、很日常、很互联网的现象，读 [references/everyday-insight.md](references/everyday-insight.md)。
5. [references/style-guide.md](references/style-guide.md) 处理句子、语气和降晦涩。
6. 如果还是太泛，再读 [references/style-examples.md](references/style-examples.md) 做风格校准。
7. 如果任务是 Obsidian 项目化内容生产、要补标题池/短安利/封面/配图/图床回写，读 [references/obsidian-fullchain.md](references/obsidian-fullchain.md)。

## When To Use

- 公众号 / 博客 / 小红书 / 小绿书等个人品牌内容
- Obsidian 内容生产项目，需要从主稿一路补齐分发资产、封面图、正文配图和可发布稿
- AI 工具、开源项目、工作流、技术趋势、产品观察、成长记录
- 互联网文化、校园观察、刷屏梗图、日常小事背后的传播/产品/人性洞察
- 文章开头、结尾、作者自述、个人介绍、项目总结
- 需要补 100 字内短安利文案、转发配文、置顶介绍时
- 已有初稿，但读起来太抽象、太“套话”、太不像本人时

不要用于：
- 纯中性新闻快讯
- 纯正式简历改写
- 与 qianzhu 个人表达无关的通用文案

## Core Goal

- 像一个真的在试、在做、在推进事情的人
- 同时给读者工具、方法和判断，不只是情绪表达
- 让读者看到一个普通年轻人如何边学边做、慢慢长出来
- 能从平常事物、日常现象、互联网小狂欢里拆出更深一层的传播和人性结构
- 写 AI Coding、Harness、Agent 工程范式时，概念只是入口，重点是作者亲手试过之后形成的阶段性判断
- 保留真实、清醒和一点幽默，不写成端着的媒体腔
- 有结构，但保留松弛感和呼吸感

## Workflow

1. 先判断题材属于哪条主线：`tool/open-source`、`workflow`、`trend-observation`、`growth-record`。
2. 去 [references/audience.md](references/audience.md) 里选 1 个主读者，最多再带 1 个次读者。选不出来，说明题目还没讲清。
3. 为这篇文章先定两条线：
   - `价值线`：读者具体能拿走什么？
   - `成长线`：读者会看到作者哪一段真实变化、犹豫、试错或判断建立过程？
4. 如果题材来自一个小现象、梗图、校园日常或互联网流行物，强制回答这三个问题：
   - 这件小事为什么值得写，而不只是“有点意思”？
   - 它暴露的是哪层结构：人性、传播、产品、关系，还是文化模板？
   - 这篇最后要留下的那个“更具体的提醒”到底是什么？
5. 如果题材是 AI Coding、Harness、Agent 工程范式或开源方法论反思，先找一个“反判断”：
   - 这个概念在当下为什么有用？
   - 它又为什么可能只是阶段性脚手架？
   - 作者亲手试过之后，真正留下来的方法是什么？
6. 找一个真实场景、困惑、任务或摩擦点开头，不要一上来堆定义。
7. 先用人话讲顺，再抽出 1-3 个值得记住的判断。
8. 结尾先写“最后那一句提醒”，再回头检查前文是不是都在为它服务。
9. 用 [references/style-guide.md](references/style-guide.md) 里的“降晦涩方法”和“去机构感方法”过一遍。
10. 如果任务是 Obsidian 里的完整内容生产，先明确这是不是“只写文”还是“项目全链路”：
   - 只写文：正文优先，其他资产按需补。
   - 项目全链路：必须继续补齐标题池、短信息流、封面图、正文配图、hosted 稿，不能把 prompt-pack 当成完成态。
11. 如果进入项目全链路，显式联动 `wechat-cover` 和 `smart-illustrator`：
   - 封面图：用 `wechat-cover` 管理公众号封面的审美、prompt、候选图、模型降级策略和图床验证；默认要有 1 张最终可用封面，不要只停在提示词。
   - 正文配图：公众号默认 3-5 张，小红书按卡片节奏补图。
   - 如果自动生图失败，要继续手动补图或明确说明阻塞原因；“没封面/没图”不算完成。
12. 如果流程需要分发资产，再额外产出：
   - 标题池与推荐标题拆解
   - 1-3 条作者简介 / 置顶介绍
   - 3-5 条短信息流安利文案，每条不超过 100 字
13. 如果任务落在 Obsidian 项目目录里，默认把结果组织成可复用项目，而不是零散文案：
   - `公众号/源稿.md`
   - `title/公众号-爆款标题候选.md`
   - `title/短信息流安利文案.md`
   - `推文/` 或其他分发稿
   - `assets/` 封面与配图
   - 可发布的 hosted 稿或明确的未完成说明

## Non-Negotiables

- 少空洞大词，多具体动词和真实场景
- 少“行业正确”，多亲手试过之后形成的判断
- 写工程范式时不要做术语崇拜，要保留“阶段性有用，但未来可能被模型/平台吃掉”的清醒感
- 解释概念时优先类比、对比、场景
- 内容要有用，但作者不能消失
- 作者要真实，但内容不能退化成日记
- 不要装成熟，不要硬凹“大佬感”
- 可以轻轻吐槽，但不要写成段子合集
- 如果写的是平常事物洞察，不能只停在“这东西挺有意思”，必须继续拆到更深一层结构
- 结尾必须落在一个具体判断、提醒或行动视角上，不能用礼貌性互动话术把力度冲掉
- 做全链路内容生产时，不要把“正文写完”误判成“项目完成”
- 做公众号项目时，没有封面图和最终可发稿，默认不算收尾

## Failure Modes

- 太像机构号，正确但没人味
- 太像热点搬运号，资料很多，作者消失
- 太像硬凹成长号，年纪不大却像在做人生总结
- 太像工具收藏夹，没有主线，只有碎片推荐
- 太端着、太严肃，像一篇“应该被转发”的文章，而不是一个人真的在说话
- 明明抓到了一个日常现象，但最后只写成“挺有意思的观察”，没有再往深处拆
- 结尾已经有判断了，又滑回“这也是我最近越来越有感觉的一件事”“欢迎交流”“之后还会继续写”这种弱收尾
- 正文写得不错，但封面、配图、hosted 稿没补，导致链路断在最后一步
- 明明是 Obsidian 项目，却没有显式调用 `wechat-cover` 处理公众号封面，或没有调用 `smart-illustrator` 处理正文配图

## References

- [references/persona.md](references/persona.md): 稳定人设、可信度锚点、成长型定位
- [references/audience.md](references/audience.md): 读者分层、读者期待、选题对位方式
- [references/content-methodology.md](references/content-methodology.md): 内容主线、结构模板、双线写法
- [references/everyday-insight.md](references/everyday-insight.md): 平常事物洞察写法、SBTI 类文章校准
- [references/style-guide.md](references/style-guide.md): 语气、结构、降晦涩、去机构感、短安利规范
- [references/style-examples.md](references/style-examples.md): 句型示例、开头结尾参考、定位句校准
- [references/obsidian-fullchain.md](references/obsidian-fullchain.md): Obsidian 项目化内容生产、封面/配图联动、完成态定义
