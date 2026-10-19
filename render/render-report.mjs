#!/usr/bin/env node
/**
 * render-report.mjs — 用 report-data.json（事实数据）+ content.json（分析文案）渲染完整报告 HTML
 * 用法: node render/render-report.mjs <content.json> <report-data.json> <out.html>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const [contentPath, dataPath, outPath] = process.argv.slice(2);
if (!contentPath || !dataPath || !outPath) {
  console.error("用法: node render/render-report.mjs <content.json> <report-data.json> <out.html>");
  process.exit(1);
}
const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const CSS = fs.readFileSync(path.join(__dir, "report.css"), "utf8");

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (s) =>
  esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/==(.+?)==/g, '<em class="hlx">$1</em>');

function ol(items = [], startAt = 1) {
  return `<ol class="numlist">${items
    .map((it, i) => {
      const lead = it.lead ? `<span class="lead">${esc(it.lead)}</span>${it.x ? (it.punct === false ? "" : "　") : ""}` : "";
      const body = fmt(it.x || (typeof it === "string" ? it : ""));
      return `<li><span class="n">${i + startAt}.</span>${lead}${body}</li>`;
    })
    .join("")}</ol>`;
}

// ---------- 融合组件（八字层） ----------
function renderPillars() {
  const pt = (data.bazi && data.bazi.pillarsTable) || [];
  if (!pt.length) return "";
  const rowGan = pt.map((p) => `<td><span class="big">${esc(p.gan)}</span><span class="tag">${esc(p.ganShishen)}</span></td>`).join("");
  const rowZhi = pt.map((p) => `<td><span class="big">${esc(p.zhi)}</span><span class="tag">${esc(p.zhiWx)}</span></td>`).join("");
  const rowHide = pt.map((p) => `<td>${p.hide.map((h) => `${esc(h.gan)}<span class="tag">${esc(h.shishen)}</span>`).join("&nbsp;")}</td>`).join("");
  const rowNayin = pt.map((p) => `<td>${esc(p.nayin)}</td>`).join("");
  const rowKong = pt.map((p) => `<td>${esc(p.kong)}</td>`).join("");
  return `<table class="pillars-tbl">
<thead><tr><th></th>${pt.map((p) => `<th>${esc(p.pos)}</th>`).join("")}</tr></thead>
<tbody>
<tr><td class="lbl">天干</td>${rowGan}</tr>
<tr><td class="lbl">地支</td>${rowZhi}</tr>
<tr><td class="lbl">藏干</td>${rowHide}</tr>
<tr><td class="lbl">纳音</td>${rowNayin}</tr>
<tr><td class="lbl">旬空</td>${rowKong}</tr>
</tbody></table>`;
}
function renderDayun() {
  const bz = data.bazi;
  if (!bz || !bz.dayun) return "";
  const rows = bz.dayun
    .map((d) => `<tr><td>${esc(d.ganZhi)}</td><td>${esc(d.ganShishen)}</td><td>虚${d.startAge}-${d.endAge}</td><td>${esc(d.span)}</td></tr>`)
    .join("");
  return `<p class="axis-note">起运：出生后 ${esc(bz.yun.startText)}（公历 ${esc(bz.yun.startSolar)} 起运）</p>
<table class="yeartbl"><thead><tr><th>大运</th><th>干十神</th><th>虚岁</th><th>公历区间</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function renderCross(rows) {
  if (!rows || !rows.length) return "";
  const body = rows
    .map((r) => `<tr><td>${esc(r.topic)}</td><td>${fmt(r.zw)}</td><td>${fmt(r.bz)}</td><td>${fmt(r.note)}</td></tr>`)
    .join("");
  return `<table class="cross-tbl"><thead><tr><th>议题</th><th>紫微视角</th><th>八字视角</th><th>合参</th></tr></thead><tbody>${body}</tbody></table>`;
}
function axisLine(d) {
  const al = (data.bazi && data.bazi.alignment && data.bazi.alignment[d.no - 1]) || null;
  if (!al || !al.dayun.length) return "";
  const txt = al.dayun.map((x) => `${x.ganZhi}（${x.ganShishen} · ${x.span}）`).join("、");
  return `<p class="axis-note">八字大运同期：${txt}</p>`;
}

function blocks(list = []) {
  return list
    .map((b) => {
      switch (b.t) {
        case "p": return `<p>${fmt(b.x)}</p>`;
        case "h3": return `<h3 class="bar">${esc(b.x)}</h3>`;
        case "h4": return `<h4 class="sub">${esc(b.x)}</h4>`;
        case "box": {
          const paras = (b.paras || (b.x ? [b.x] : []))
            .map((p, i) => `<p>${i === 0 && b.title ? `<span class="lead">${esc(b.title)}</span>　` : ""}${fmt(p)}</p>`)
            .join("");
          return `<div class="box">${b.title && !b.paras && b.x ? `<p><span class="lead">${esc(b.title)}</span>　${fmt(b.x)}</p>` : paras}</div>`;
        }
        case "ol": return ol(b.items);
        case "pillars": return renderPillars();
        case "dayun": return renderDayun();
        case "cross": return renderCross(b.rows);
        default: return "";
      }
    })
    .join("\n");
}

const sectionHead = (no, title) =>
  `<h2 class="secttl">${esc(no)}、${esc(title)}</h2>\n<div class="orn">❖</div>`;

// ---------- 封面 ----------
function renderCover() {
  const rows = (data.coverRows || [])
    .map(([l1, v1, l2, v2]) => `<tr><td>${esc(l1)}</td><td>${esc(v1)}</td><td>${esc(l2)}</td><td>${esc(v2)}</td></tr>`)
    .join("");
  return `<div class="cover">
<h1>${esc(content.title)}</h1>
<div class="sub">${(content.subtitle || []).map(esc).join("<br>")}</div>
<div class="introbox"><p>${fmt(content.intro)}</p></div>
<h3 class="bar">排盘信息</h3>
<table class="infotbl"><thead><tr><th>项目</th><th>内容</th><th>项目</th><th>内容</th></tr></thead><tbody>${rows}</tbody></table>
${data.trueSolar && data.trueSolar.dateShifted && data.trueSolar.dateShiftNote ? `<div class="box"><p>${esc(data.trueSolar.dateShiftNote)}</p></div>` : ""}
<h3 class="bar">${esc(content.oneLine?.label || "一句话命格定性")}</h3>
<div class="box"><p>${fmt(content.oneLine?.text)}</p></div>
</div>`;
}

// ---------- 目录 + 方法论 + 提示 ----------
function renderToc() {
  const toc = (content.toc || [])
    .map((t, i) => `<li><span class="n">${i + 1}.</span>${esc(t)}</li>`)
    .join("");
  const principles = content.principles
    ? `<h3 class="bar">${esc(content.principles.title)}</h3>${ol(content.principles.items)}`
    : "";
  const notice = content.notice ? `<div class="box"><p>${fmt(content.notice)}</p></div>` : "";
  return `<h3 class="bar">目录</h3><ol class="numlist">${toc}</ol>\n${principles}\n${notice}`;
}

// ---------- 领域章节 ----------
function renderSection(sec) {
  return `<section class="sec">${sectionHead(sec.no, sec.title)}\n${blocks(sec.blocks)}</section>`;
}

// ---------- 运程时间轴 ----------
function renderTimeline() {
  const tl = content.timeline || {};
  const introBoxes = (tl.introBoxes || [])
    .map((b) => `<p><span class="lead">${esc(b.title)}</span>　${fmt(b.x)}</p>`)
    .join("");
  const decadeHtml = (tl.decades || [])
    .map((d) => {
      const meta = data.decades[d.no - 1] || {};
      const range = meta.range ? `虚${meta.range[0]}-${meta.range[1]} / 公历${meta.startYear}-${meta.endYear}` : d.range || "";
      const palace = meta.palace ? `${meta.palace}限` : d.palace || "";
      const badge = d.current ? `<span class="badge-current">当前</span>` : "";
      const ky = (d.keyYears || [])
        .map((k) => {
          const star = k.star ? `｜★${esc(k.star)}` : "";
          return `<p class="ky"><span class="head">${esc(k.head)}${star}</span> - <span class="lead">可能事象范围：</span>${fmt(k.x)}` +
            (k.ji ? ` - <span class="lead">吉凶：</span>${esc(k.ji)}` : "") +
            (k.impact ? ` - <span class="lead">影响度：</span>${esc(k.impact)}` : "") +
            (k.advice ? ` - <span class="lead">建议：</span>${fmt(k.advice)}` : "") +
            `</p>`;
        })
        .join("");
      const years = (data.liunian || []).filter((y) => meta.range && y.age >= meta.range[0] && y.age <= meta.range[1]);
      const rows = years
        .map((y) => {
          const note = (content.yearNotes || {})[String(y.year)] || "";
          const star = (content.yearStars || {})[String(y.year)] ? "★" : "";
          return `<tr><td>${y.year} 虚${y.age} ${esc(y.ganZhi)}</td><td>${esc(y.liunianPalace || "")}</td><td>${esc(y.xiaoxianPalace || "")}</td><td>${fmt(note)}</td><td class="star">${star}</td></tr>`;
        })
        .join("");
      return `<div class="decade">
<h3 class="bar">第${esc(meta.noCn || d.no)}限 · ${esc(palace)}（${esc(range)}）· ${esc(d.label || "")}${badge}</h3>
${axisLine(d)}
<h4 class="sub">${esc(d.thesisLabel || "十年主旋律")}</h4>
<p>${fmt(d.thesis)}</p>
${d.keyYears && d.keyYears.length ? `<h4 class="sub">${esc(d.keyLabel || "关键年精析")}</h4>${ky}` : ""}
<h4 class="sub">${esc(d.tableTitle || "平流年速览表")}</h4>
<table class="yeartbl"><colgroup><col style="width:24%"><col style="width:13%"><col style="width:13%"><col style="width:42%"><col style="width:8%"></colgroup><thead><tr><th>公历·虚岁·干支</th><th>流年宫</th><th>小限宫</th><th>主题方向</th><th>★</th></tr></thead><tbody>${rows}</tbody></table>
</div>`;
    })
    .join("\n");
  return `<section class="sec">${sectionHead(tl.no || "十", tl.title || "运程时间轴 · 十年大限为纲")}
${introBoxes ? `<div class="box">${introBoxes}</div>` : ""}
${tl.intro ? `<p>${fmt(tl.intro)}</p>` : ""}
${decadeHtml}</section>`;
}

// ---------- 关键窗口 / 总结 / 使用说明 ----------
function renderWindows() {
  const w = content.windows || {};
  const items = (w.items || [])
    .map((it) =>
      it.t === "h3"
        ? `<h3 class="bar">${esc(it.x)}</h3>`
        : `<p class="ky"><span class="head">${esc(it.head)}</span>——${fmt(it.x)}</p>`
    )
    .join("");
  return `<section class="sec">${sectionHead(w.no || "十一", w.title || "关键人生窗口")}\n${blocks(w.blocks)}${items}${w.tail ? `<p>${fmt(w.tail)}</p>` : ""}</section>`;
}
function renderSummary() {
  const s = content.summary || {};
  const advice = s.advice && s.advice.length ? `<h3 class="bar">${esc(s.adviceTitle || "落地的建议")}</h3>${ol(s.advice)}` : "";
  return `<section class="sec">${sectionHead(s.no || "十二", s.title || "综合总结与建议")}\n${blocks(s.blocks)}${advice}</section>`;
}
function renderUsage() {
  const u = content.usage || {};
  const howto = u.howto && u.howto.length ? `<h3 class="bar">${esc(u.howTitle || "如何使用这份报告")}</h3>${ol(u.howto)}` : "";
  const precision = u.precision ? `<h3 class="bar">${esc(u.precisionTitle || "关于精度的诚实说明")}</h3><p>${fmt(u.precision)}</p>` : "";
  const disc = u.disclaimer
    ? `<h3 class="bar">${esc(u.disclaimerTitle || "免责声明")}</h3><div class="box"><p>${fmt(u.disclaimer)}</p></div>`
    : "";
  const blessing = u.blessing ? `<div class="blessing">${u.blessing.map(esc).join("<br>")}</div>` : "";
  return `<section class="sec">${sectionHead(u.no || "十三", u.title || "使用说明与免责声明")}\n${howto}${precision}${disc}${blessing}</section>`;
}

// ---------- 组装 ----------
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${esc(content.title || "紫微斗数命盘深度分析报告")}</title>
<style>
${CSS}
</style>
</head>
<body>
<div class="page">
${renderCover()}
${renderToc()}
${(content.sections || []).map(renderSection).join("\n")}
${renderTimeline()}
${renderWindows()}
${renderSummary()}
${renderUsage()}
</div>
</body>
</html>`;

fs.writeFileSync(outPath, html);
console.log(`OK -> ${outPath} (${(html.length / 1024).toFixed(0)} KB, ${(content.sections || []).length} sections + timeline ${(content.timeline?.decades || []).length} decades)`);