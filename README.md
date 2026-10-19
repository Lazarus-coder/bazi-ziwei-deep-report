# 八字 · 紫微 融合深度报告生成器

> 一个 Agent Skill：从出生数据到一本可收藏的命理研报（A4 PDF，22-30 页）。
> 双引擎并行排盘 → 双盘互证 → 十六章节深度长文 → 暖纸色排版 → 一键出 PDF。

[![License: MIT](https://img.shields.io/badge/License-MIT-f4c430.svg)](#license)
[![Node](https://img.shields.io/badge/Node-%E2%89%A518-339933.svg)](#安装)

## 这是什么

`bazi-ziwei-deep-report` 是一套**八字 + 紫微斗数双系统融合**的深度报告生成管线，以 Agent Skill 形式封装：

- **双引擎排盘**：紫微用 [iztro](https://github.com/SylarLong/iztro)（2.5.0），八字用 [lunar-javascript](https://github.com/6tail/lunar-javascript)——四柱、十神、藏干、纳音、旬空、胎元命宫身宫、神煞（天乙/文昌/禄神/羊刃/桃花/驿马）、刑冲合害、**精确起运的大运序列**，一份数据全带齐。
- **真太阳时校正**：经度修正 + 均时差，西部出生不再卡在时辰边界上翻船；跨日界自动回退日期，晚子时按通行「子时换日」口径排盘。
- **双盘互证**：专章把两套系统对同一议题（才干/财富/事业/婚姻/体质/晚年）的结论并排放——**同向升置信，分歧取严处理**，不硬拗。
- **量化质检**：双引擎交叉自校验 + 跨章去重器（5-gram 重合率与重复长句检测），排盘关键数据零臆造。
- **出片级排版**：暖纸色设计系统（`#FAF7F1 / #6A2E33 / #A98746`），封面 → 目录 → 十六章节 → 八十流年时间轴，Chrome 无头打印为 A4 PDF。

## 样例

[`examples/demo/`](examples/demo/) 内含一份**完整演示报告**（出生数据为合成数据，非真实个人）：

| 文件 | 说明 |
|---|---|
| `input.json` | 输入示例 |
| `report-data.json` | 双引擎融合数据（排盘 + 八字全量 + 双轴对齐） |
| `content.json` | 十六章节文案（AI 侧产出） |
| `report.html` / `report.pdf` | 最终交付物 |

## 安装

```bash
# 方式一：skills CLI（skills.sh 索引后）
npx skills add Lazarus-coder/bazi-ziwei-deep-report -g -a qoder

# 方式二：直接克隆到你的 Agent 技能目录
git clone https://github.com/Lazarus-coder/bazi-ziwei-deep-report.git \
  ~/.qoder/skills/bazi-ziwei-deep-report
cd ~/.qoder/skills/bazi-ziwei-deep-report && npm install
```

## 使用（四步）

```bash
# 1) 写输入
echo '{"solar_date":"2026-10-19","birth_time":"10:00","gender":"男","city":"上海"}' > input.json

# 2) 双引擎排盘 + 融合数据
node scripts/build-fused-report-data.mjs input.json > report-data.json

# 3) 由 Agent 依据 report-data.json 撰写 content.json（十六章节，见 SKILL.md）

# 4) 渲染并出 PDF
node render/render-report.mjs content.json report-data.json report.html
./scripts/render-pdf.sh report.html report.pdf
```

> 在 Qoder / Claude Code 等支持 Agent Skills 的环境中，直接对 Agent 说「用 bazi-ziwei-deep-report 给这个出生数据出一份融合报告」即可，Skill 会引导完成全程。

## 架构

```
scripts/build-fused-report-data.mjs   出生信息 → 双引擎融合数据（唯一事实源）
render/render-report.mjs              融合数据 + 文案 → 完整 HTML（含四柱/大运/互证组件）
render/report.css                     暖纸色设计系统
scripts/render-pdf.sh                 HTML → A4 PDF（自动探测 Chrome）
scripts/check-repetition.mjs          跨章去重质检
examples/demo/                        合成数据演示样例（含成品 PDF）
```

## 设计原则

1. **数据诚实**：报告中每个星曜/宫位/四化/干支/岁数都来自程序排盘，AI 只做解释，不做臆造；双引擎交叉自校验。
2. **内容深度优先**：每章有唯一主人（一个结论只深讲一次），总结只收束不重播；去重器量化把关。
3. **精度诚实**：到「大限 / 小限 / 流年 / 大运（步）」为止，不伪造流月流日级断言。
4. **吉凶并陈**：只给能量主题与风险敞口，宿主主动权永远在命主本人。

## 免责声明

本项目仅供传统文化研究、自我观察与娱乐参考，不构成医疗、健康、投资、财务、婚姻、法律或任何重大决策依据。命理为趋势参考，请理性看待，切勿迷信。

## License

MIT © 2026 Lazarus-coder