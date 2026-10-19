---
name: bazi-ziwei-deep-report
description: 八字·紫微融合深度报告生成器：出生信息 → 真太阳时校正 → 双引擎排盘（iztro 紫微 + lunar-javascript 八字）→ 双盘互证数据 → 十六章节融合长文 → 暖纸色 HTML → Chrome 无头打印为 A4 PDF。内容深度优先、跨章不重复（内置量化去重与双盘一致性检查）。触发词：八字紫微融合报告、双盘分析、融合命理报告、八字+紫微 PDF、双盘互证报告。
---

# bazi-ziwei-deep-report · 八字·紫微融合深度报告生成器

一条完整管线：**出生信息 → 真太阳时校正 → 双引擎排盘 → 融合数据 → 十六章节深度文案 → HTML → A4 PDF**。
双系统并行：八字（四柱/十神/用神/大运/神煞/刑冲合害）× 紫微（十二宫/四化/自化/大限/流年），并在专章做「双盘互证」。

## 内容深度优先（第一原则）

排版只是载体——**思路与内容深度才是交付物**。成稿必须满足：

- **每章有唯一的主人**：一个结论只在它最早出现的章节深讲一次；其他章节引用式一提，不复述机制。
- **双盘分工不打架**：紫微看剧场（哪一幕开场）、八字看气候（当季风雨）；同一结论两盘都有佐证时升为「高置信」，分歧时**取严处理**并在互证章显式列出。
- **量化去重**：写完运行 `node scripts/check-repetition.mjs content.json`，退出码 0 为准（0 对篇章 5-gram 重合 > 10%、0 组重复长句）。封面「一句话定性」与各章 ≤7% 重合属正常。
- **深度优先于篇幅**：宁精不冗；判断标准是「这一章给出了什么前文没有的信息」。

## 何时使用

- 用户要求**同时用八字与紫微**做一份完整的深度命理报告（PDF 交付物）
- 用户给出出生日期时间与出生地，要「双盘合参」级别产出
- 只需要单系统报告：紫微用 `ziwei-deep-report`，八字单盘可用 `bazi-mingli`

## 前置条件

- Node.js ≥ 18；本目录 `npm install` 一次（iztro 2.5.0 + lunar-javascript）
- Chrome / Chromium / Edge（HTML→PDF；自动探测，可用 CHROME_PATH 指定）
- 城市经度自动查找为可选：默认读取同级技能 zwds-openclaw 的经度表（`ZWDS_LONGITUDES` 可覆盖），找不到时直接在 input.json 提供 `longitude`

## 第一步：采集输入

| 项 | 说明 |
|---|---|
| 公历出生日期 | `YYYY-MM-DD` |
| 出生时刻 | `HH:MM`；只知时辰时按区间中值，并在报告中标注 |
| 性别 | 男 / 女 |
| 出生地 | 城市名（自动查经度）或 `longitude`（东经为正） |

**真太阳时必校正**：东经每偏离 120° 约 4 分钟（另含均时差）。在中国西部出生尤其要小心——钟表午后一点的出生，真实太阳时可能还没到正午，时辰判定随之改变；若不校正，时柱与整张盘都会错。
写 `input.json`（示例见 `examples/demo/input.json`）：

```json
{ "solar_date": "2026-10-19", "birth_time": "10:00", "gender": "男", "city": "上海" }
```

### 子时与跨日处理（已内置）

- 校正跨日界时自动回退/前进日期重取时辰；晚子时口径与 iztro/lunar-javascript 流派1 对齐（**子时换日、晚子归次日**）；跨日时封面自动附「跨日校正说明」框。
- 四柱/农历在 `report-data.selfCheck` 双引擎一致；`warnings` 必须转达命主。

## 第二步：双引擎排盘与融合数据

```bash
node scripts/build-fused-report-data.mjs input.json > report-data.json
```

输出（唯一事实源）：
- `trueSolar / birth / pillars / chart / palaces / decades / liunian`：紫微侧全量（同 ziwei-deep-report）
- **`bazi`（八字侧新增）**：`pillarsTable`（四柱+十神+藏干+纳音+旬空）、`wuxing`（天干/本气/藏干三口径统计）、`shensha`（天乙/文昌/禄神/羊刃/桃花/驿马，含命中柱位）、`relations`（刑冲合害全扫描）、`kongwang/taiyuan/minggong/shengong`、`yun`（精确起运）、`dayun`（前八步大运含干十神）、`alignment`（大限×大运双轴对齐）
- `liunian[].ganShishen`：每个流年干与日主的十神
- `selfCheck`：双引擎交叉校验——**必须通过**

**铁律：报告中每个星曜/宫位/四化/干支/岁数，只能来自 report-data.json。**

## 第三步：撰写 content.json（十六章节框架）

按 `examples/demo/content.json` 的 schema 撰写。结构：

```
title / subtitle[2] / intro / oneLine / toc[16]
principles[6] / notice
sections[12]：
  一 命格总纲·双盘定性      二 八字命局总论（用 pillars block）   三 飞星四化全盘
  四 大运流年·八字时间轴（用 dayun block）  五~十一 七大领域（紫微为主 + 八字侧写）
  十二 双盘互证（用 cross block：议题/紫微视角/八字视角/合参）
timeline{8 大限，每限自动并列同期八字大运}
windows / summary / usage
```

block 类型：`p / h3 / h4 / box / ol` + **融合组件** `pillars`（四柱表,自动取自数据）、`dayun`（大运表,自动）、`cross`（互证表,内容提供 rows）。
行内标记：`**加粗**`、`==酒红高亮==`。

### 融合写作规范

- 领域章（五~十一）统一三段式：紫微视角 → **八字侧写**（h4）→ 合参建议；两盘结论一致时写明「一致」，冲突时不硬拗、取严处理
- 互证章（十二）的 rows 宜覆盖：才干/财富节奏/事业主场/婚姻/风险点/体质/晚年，6-8 行
- 关键年标注规则：★ = 紫微三系统（大限四化 ∩ 流年太岁 ∩ 小限）共振，且八字侧大运/流年同向
- 精度诚实：只到大限/小限/流年/大运（步），不写流月流日；吉凶用「倾向/偏高/值得留意/宜防」
- 完整版篇幅：每领域章 5-8 个实质段落；每限 3-4 个关键年；80 流年主题全覆盖；成稿 22-30 页（密度优先）

## 第四步：渲染与出 PDF

```bash
node render/render-report.mjs content.json report-data.json report.html
./scripts/render-pdf.sh report.html report.pdf
```

设计系统与 ziwei-deep-report 同源（暖纸底/酒红/金），新增融合组件样式（四柱表/互证表/双轴注记）。字体：macOS 宋体+苹方，Windows 回退 SimSun/雅黑。

## QA 清单

1. `selfCheck.passed === total`；`warnings` 已处理
2. content.json 中干支/宫位/四化/岁数与 report-data 抽查 ≥5 处一致
3. `node scripts/check-repetition.mjs content.json` 退出码 0
4. 互证章 rows 与两张盘的口径一致（如「官杀大运 ≈ 官禄限」类对应关系可核对）
5. PDF 生成成功、页数 22-30；目视封面/四柱页/互证页/时间轴页无排版异常
6. 免责声明与精度说明在文末完整存在

## 伦理

吉凶并陈、不迎合；不断生死、不断具体日期；不替代医疗/法律/财务建议；只处理经命主同意的命盘；报告仅供传统文化研究与自我观察参考。

## 目录速查

```
scripts/build-fused-report-data.mjs   输入 → 双引擎融合数据（含八字全量）
render/render-report.mjs              content + data → HTML（含融合组件）
render/report.css                     设计系统
scripts/render-pdf.sh                 HTML → PDF
scripts/check-repetition.mjs          跨章去重检查
examples/demo/                        演示样例（合成出生数据）：input/report-data/content/html/pdf
```