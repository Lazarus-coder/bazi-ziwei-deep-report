#!/usr/bin/env node
/**
 * check-repetition.mjs — 跨章节重复检查（量化）
 * 用法: node scripts/check-repetition.mjs content.json
 *
 * 指标:
 *  1) 篇章两两 5-gram 重合率（重合数 / 较小篇长），阈值 warn > 0.10
 *  2) 跨篇重复长句（≥14 字，4-gram Jaccard ≥ 0.6）
 */
import fs from "node:fs";

const p = process.argv[2];
if (!p) {
  console.error("用法: node scripts/check-repetition.mjs content.json");
  process.exit(1);
}
const c = JSON.parse(fs.readFileSync(p, "utf8"));

const plain = (x) => {
  if (!x) return "";
  if (Array.isArray(x)) return x.map(plain).join("");
  if (typeof x === "object") return Object.values(x).map(plain).join("");
  return String(x).replace(/\*\*|==|　/g, "");
};
const blocksText = (blocks = []) =>
  blocks.map((b) => plain(b.x) + plain(b.paras) + plain(b.items) + plain(b.title || "")).join("");

const units = [];
const add = (name, text) => units.push({ name, raw: text, clean: text.replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, "") });
add("封面·定性", plain(c.oneLine?.text));
(c.sections || []).forEach((s) => add(`${s.no}·${s.title.slice(0, 6)}`, blocksText(s.blocks)));
const tl = c.timeline || {};
add("十·时间轴(引)", plain(tl.intro) + plain(tl.introBoxes));
(tl.decades || []).forEach((d) => add(`限${d.no}·${(d.label || "").slice(0, 6)}`, plain(d.thesis) + plain(d.keyYears)));
const w = c.windows || {};
add("十一·窗口", blocksText(w.blocks) + plain(w.items) + plain(w.tail));
const s = c.summary || {};
add("十二·总结", blocksText(s.blocks) + plain(s.advice));
const u = c.usage || {};
add("十三·说明", plain(u.howto) + plain(u.precision) + plain(u.disclaimer));

const N = 5;
const grams = (s) => {
  const set = new Set();
  for (let i = 0; i + N <= s.length; i++) set.add(s.slice(i, i + N));
  return set;
};
const withGrams = units.map((u) => ({ ...u, g: grams(u.clean) }));

console.log("== 5-gram 跨篇重合率（仅列 > 0.06）==");
const pairs = [];
for (let i = 0; i < withGrams.length; i++)
  for (let j = i + 1; j < withGrams.length; j++) {
    const A = withGrams[i].g, B = withGrams[j].g;
    if (!A.size || !B.size) continue;
    let inter = 0;
    const [small, big] = A.size < B.size ? [A, B] : [B, A];
    for (const x of small) if (big.has(x)) inter++;
    const r = inter / small.size;
    if (r > 0.06) pairs.push({ a: withGrams[i].name, b: withGrams[j].name, r });
  }
pairs.sort((x, y) => y.r - x.r).slice(0, 15).forEach((x) => {
  const flag = x.r > 0.1 ? " ⚠️超阈" : "";
  console.log(`  ${(x.r * 100).toFixed(1)}%${flag}  ${x.a}  vs  ${x.b}`);
});
if (!pairs.length) console.log("  （无）");

console.log("\n== 跨篇重复长句（≥14 字）==");
const sent4 = (s) => {
  const g = new Set();
  for (let i = 0; i + 4 <= s.length; i++) g.add(s.slice(i, i + 4));
  return g;
};
const jac = (A, B) => {
  let inter = 0;
  const [small, big] = A.size < B.size ? [A, B] : [B, A];
  for (const x of small) if (big.has(x)) inter++;
  return inter / (A.size + B.size - inter);
};
const sents = [];
units.forEach((u) => {
  u.raw.split(/[。！？；]/).forEach((t) => {
    const cl = t.replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, "");
    if (cl.length >= 14) sents.push({ unit: u.name, text: t.trim(), g: sent4(cl) });
  });
});
let dupFound = 0;
for (let i = 0; i < sents.length; i++)
  for (let j = i + 1; j < sents.length; j++) {
    if (sents[i].unit === sents[j].unit) continue;
    const r = jac(sents[i].g, sents[j].g);
    if (r >= 0.6) {
      dupFound++;
      if (dupFound <= 12) {
        console.log(`  ${(r * 100).toFixed(0)}%  [${sents[i].unit}] "${sents[i].text.slice(0, 30)}…"`);
        console.log(`       ≈ [${sents[j].unit}] "${sents[j].text.slice(0, 30)}…"`);
      }
    }
  }
if (!dupFound) console.log("  （无）");
console.log(`\n结论: ${pairs.filter((x) => x.r > 0.1).length} 对篇章超 10% 重合, ${dupFound} 组重复长句。`);
process.exit(pairs.filter((x) => x.r > 0.1).length || dupFound ? 2 : 0);