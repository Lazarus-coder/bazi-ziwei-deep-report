#!/usr/bin/env node
/**
 * build-fused-report-data.mjs — 从出生信息生成「八字·紫微融合报告」所需的全部结构化数据
 * 双引擎：iztro(紫微) + lunar-javascript(八字)，共用真太阳时校正与晚子口径
 *
 * 输入 (input.json):
 *   { "solar_date": "1990-06-01", "birth_time": "08:30", "gender": "女",
 *     "longitude": 116.41,          // 可选：出生地经度（优先）
 *     "city": "北京",               // 可选：出生城市名（用内置经度表查找）
 *     "std_meridian": 120 }         // 可选：所用标准时区的中央经线，默认 120
 *
 * 输出: stdout 一份 JSON（报告渲染与 Agent 分析共同使用的唯一数据源）
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { astro } = require("iztro");
const { Solar } = require("lunar-javascript");

const SIHUA_TABLE = {
  甲: { 禄: "廉贞", 权: "破军", 科: "武曲", 忌: "太阳" },
  乙: { 禄: "天机", 权: "天梁", 科: "紫微", 忌: "太阴" },
  丙: { 禄: "天同", 权: "天机", 科: "文昌", 忌: "廉贞" },
  丁: { 禄: "太阴", 权: "天同", 科: "天机", 忌: "巨门" },
  戊: { 禄: "贪狼", 权: "太阴", 科: "右弼", 忌: "天机" },
  己: { 禄: "武曲", 权: "贪狼", 科: "天梁", 忌: "文曲" },
  庚: { 禄: "太阳", 权: "武曲", 科: "太阴", 忌: "天同" },
  辛: { 禄: "巨门", 权: "太阳", 科: "文曲", 忌: "文昌" },
  壬: { 禄: "天梁", 权: "紫微", 科: "左辅", 忌: "武曲" },
  癸: { 禄: "破军", 权: "巨门", 科: "太阴", 忌: "贪狼" },
};
const GAN = "甲乙丙丁戊己庚辛壬癸";
const ZHI = "子丑寅卯辰巳午未申酉戌亥";
const CN_NUM = "一二三四五六七八九十";
const LONGITUDES_FILE =
  process.env.ZWDS_LONGITUDES ||
  path.join(process.env.HOME, ".qoder/skills/zwds-openclaw/zwds-cli/data/longitudes.json");

function fail(msg) {
  console.error("ERROR: " + msg);
  process.exit(1);
}

function lookupCity(city) {
  try {
    const j = JSON.parse(fs.readFileSync(LONGITUDES_FILE, "utf8"));
    const norm = (s) => String(s).replace(/市$/, "");
    for (const e of j.entries || []) {
      const names = (e.names || [e.name]).filter(Boolean);
      if (names.some((n) => norm(n) === norm(city))) {
        return { longitude: e.longitude ?? e.lon ?? e.lng, matched: names[0] };
      }
    }
  } catch {
    return null;
  }
  return null;
}

function equationOfTimeMinutes(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  const n = Math.floor((d - new Date(d.getUTCFullYear(), 0, 1)) / 86400000) + 1;
  const b = (2 * Math.PI * (n - 81)) / 364;
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

function timeToMinutes(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim());
  if (!m) fail(`birth_time 格式应为 HH:MM，收到: ${t}`);
  return Number(m[1]) * 60 + Number(m[2]);
}
function fmtHM(total) {
  const t = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
function timeIndex(hh) {
  return hh === 23 ? 12 : Math.floor((hh + 1) / 2) % 12;
}
function zhiFromIndex(idx) {
  if (idx === 0 || idx === 12) return "子";
  return ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"][idx];
}
const MONTH_CN = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
function ganZhiOfYear(year) {
  return GAN[(year - 4) % 10] + ZHI[(year - 4) % 12];
}
function starText(stars) {
  return stars.map((s) => `${s.name}${s.brightness ? "·" + s.brightness : ""}`).join("、");
}
const mod12 = (n) => ((n % 12) + 12) % 12;

// ---------- main ----------
if (process.argv.length < 3) fail("用法: node build-fused-report-data.mjs input.json");
const input = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));

const [y, mo, da] = String(input.solar_date).split("-").map(Number);
if (!y || !mo || !da) fail("solar_date 格式应为 YYYY-MM-DD");
const gender = input.gender === "女" || input.gender === "female" ? "女" : "男";
const genderCn = gender;

let longitude = typeof input.longitude === "number" ? input.longitude : null;
let longitudeSource = longitude != null ? "input" : null;
let cityMatched = null;
const warnings = [];
if (longitude == null && input.city) {
  const hit = lookupCity(input.city);
  if (hit && typeof hit.longitude === "number") {
    longitude = hit.longitude;
    longitudeSource = "city";
    cityMatched = hit.matched;
  } else {
    warnings.push(`未在内置经度表中找到城市「${input.city}」，已退回中央经线 120°E；请直接提供 longitude。`);
  }
}
if (longitude == null) {
  longitude = 120;
  longitudeSource = "default";
  warnings.push("未提供出生地经度，按 120°E 计算，真太阳时未做经度校正（西部出生影响很大，务必补全）。");
}

const stdMeridian = typeof input.std_meridian === "number" ? input.std_meridian : 120;
const clockMin = timeToMinutes(input.birth_time);
const eot = equationOfTimeMinutes(input.solar_date);
const deltaMin = Math.round(((longitude - stdMeridian) * 4 + eot) * 100) / 100;
const totalShifted = clockMin + deltaMin;
const dayShift = Math.floor(totalShifted / 1440);
const correctedHM = fmtHM(Math.floor(((totalShifted % 1440) + 1440) % 1440));
const [cHH, cMM] = correctedHM.split(":").map(Number);
const tIdx = timeIndex(cHH);
const timeZhi = zhiFromIndex(tIdx);
const corrDateObj = new Date(Date.UTC(y, mo - 1, da));
corrDateObj.setUTCDate(corrDateObj.getUTCDate() + dayShift);
const cy = corrDateObj.getUTCFullYear();
const cmo = corrDateObj.getUTCMonth() + 1;
const cda = corrDateObj.getUTCDate();
const correctedDateStr = `${cy}-${cmo}-${cda}`;
const dateShifted = dayShift !== 0;
const into = (() => {
  if (cHH >= 23 || cHH < 1) {
    const absolute = (cHH >= 23 ? cHH - 23 : cHH + 1) * 60 + cMM; // 23:00 起的分钟数
    return Math.min(absolute, 120 - absolute);
  }
  const startOdd = cHH % 2 === 1 ? cHH : cHH - 1;
  const h = (cHH - startOdd) * 60 + cMM;
  return Math.min(h, 120 - h);
})();
if (into <= 12) {
  warnings.push(`真太阳时 ${correctedHM} 距时辰边界不足 ${Math.max(1, Math.ceil(into))} 分钟，时辰判定临界，请与命主复核出生时间。`);
}
if (dateShifted) {
  warnings.push(`真太阳时校正跨越日界：钟表 ${y}-${mo}-${da} ${input.birth_time} → 真太阳时 ${correctedDateStr} ${correctedHM}。已按校正后时刻排盘（见 trueSolar.dateShiftNote）。`);
}

const solarStr = `${y}-${mo}-${da}`;
const chart = astro.bySolar(correctedDateStr, tIdx, genderCn, true, "zh-CN");
if (!chart || !chart.palaces) fail("iztro 排盘失败");

const yearPillar = chart.chineseDate.split(" ")[0];
const yearStem = yearPillar[0];

// 双引擎自校验（iztro 排盘 vs lunar-javascript 八字）
const lunarJs = Solar.fromYmdHms(cy, cmo, cda, cHH, cMM, 0).getLunar();
const ec = lunarJs.getEightChar();
try {
  ec.setSect(1); // 与 iztro 口径对齐：晚子时日柱按次日（6tail 流派1）
} catch {}
const pillarsJs = [ec.getYear(), ec.getMonth(), ec.getDay(), ec.getTime()].join(" ");
const selfCheck = [
  { item: "四柱（iztro vs lunar-javascript）", ok: pillarsJs === chart.chineseDate, detail: `${chart.chineseDate} | ${pillarsJs}` },
  { item: "农历月日（iztro vs lunar-javascript）", ok: chart.lunarDate.includes(lunarJs.getDayInChinese()), detail: `${chart.lunarDate} | ${lunarJs.getYearInChinese()}年${lunarJs.getMonthInChinese()}月${lunarJs.getDayInChinese()}日` },
];

const palaces = chart.palaces.map((p) => ({
  index: p.index,
  name: p.name,
  stem: p.heavenlyStem,
  branch: p.earthlyBranch,
  isBodyPalace: p.isBodyPalace,
  major: (p.majorStars || []).map((s) => ({ name: s.name, brightness: s.brightness, mutagen: s.mutagen })),
  majorText: starText(p.majorStars || []) || "空宫",
  minorText: (p.minorStars || []).map((s) => s.name).join("、"),
  adjectiveText: (p.adjectiveStars || []).map((s) => s.name).join("、"),
  decadal: p.decadal ? { range: p.decadal.range, stem: p.decadal.heavenlyStem, branch: p.decadal.earthlyBranch } : null,
  ages: p.ages,
  yearly: p.yearly,
}));

const soulPalace = palaces.find((p) => p.name === "命宫");
const bodyPalace = palaces.find((p) => p.isBodyPalace);
const laiyin = palaces.find((p) => p.stem === yearStem);
const startAge = Math.min(...palaces.filter((p) => p.decadal).map((p) => p.decadal.range[0]));

const yangStem = "甲丙戊庚壬".includes(yearStem);
const forward = (yangStem && gender === "男") || (!yangStem && gender === "女");
const directionCn = `${yangStem ? "阳" : "阴"}${gender}${forward ? "顺行" : "逆行"}`;

// 子年斗君：从子宫起正月，逆数至生月；再自该宫起子时，顺数至生时
const lunarMonthRaw = lunarJs.getMonth(); // 闰月为负数
const lunarDay = lunarJs.getDay();
let doujunMonth = Math.abs(lunarMonthRaw);
if (lunarMonthRaw < 0 && lunarDay > 15) doujunMonth += 1; // 闰月后半月按下月（fixLeap 口径）
const hourOrdinal = tIdx === 0 || tIdx === 12 ? 1 : tIdx + 1;
const doujunBranch = ZHI[mod12(0 - (doujunMonth - 1) + (hourOrdinal - 1))];

const decades = palaces
  .filter((p) => p.decadal)
  .sort((a, b) => a.decadal.range[0] - b.decadal.range[0])
  .map((p, i) => ({
    no: i + 1,
    noCn: CN_NUM[i] || String(i + 1),
    palace: p.name,
    branch: p.branch,
    stem: p.decadal.stem,
    range: p.decadal.range,
    startYear: y + p.decadal.range[0] - 1,
    endYear: y + p.decadal.range[1] - 1,
    sihua: SIHUA_TABLE[p.decadal.stem] || null,
    majorText: p.majorText,
    minorText: p.minorText,
    adjectiveText: p.adjectiveText,
    stemBranch: p.decadal.stem + p.decadal.branch,
  }));

const liunian = [];
for (let age = startAge; age < startAge + 80; age++) {
  const yr = y + age - 1;
  const gz = ganZhiOfYear(yr);
  const yPal = palaces.find((p) => p.branch === gz[1]); // 流年命宫即流年地支所在宫
  const xPal = palaces.find((p) => Array.isArray(p.ages) && p.ages.includes(age));
  liunian.push({
    year: yr,
    age,
    ganZhi: gz,
    liunianPalace: yPal ? yPal.name : null,
    liunianBranch: yPal ? yPal.branch : null,
    xiaoxianPalace: xPal ? xPal.name : null,
    sihua: SIHUA_TABLE[gz[0]] || null,
  });
}

const checksum = crypto
  .createHash("sha1")
  .update(`${chart.chineseDate}|${chart.fiveElementsClass}|${soulPalace.branch}|${doujunBranch}|${laiyin ? laiyin.name : ""}`)
  .digest("hex")
  .slice(0, 5)
  .toUpperCase();

const lunarDisplay = (() => {
  const leap = lunarMonthRaw < 0;
  const displayMonth = leap && lunarDay > 15 ? Math.abs(lunarMonthRaw) + 1 : Math.abs(lunarMonthRaw);
  const monthCn = MONTH_CN[displayMonth - 1] || String(displayMonth);
  const shichenCn = tIdx === 12 ? "晚子时" : tIdx === 0 ? "早子时" : timeZhi + "时";
  return `${yearPillar}年${monthCn}月${lunarJs.getDayInChinese()}日${shichenCn}`;
})();
const shichenDisplay = `${tIdx === 12 ? "晚子时" : tIdx === 0 ? "早子时" : timeZhi + "时"}（真太阳 ${correctedHM}）`;
const clockH0 = Number(String(input.birth_time).split(":")[0]);
const clockTIdx = timeIndex(Number.isFinite(clockH0) ? clockH0 : 0);
const clockShichen = clockTIdx === 0 ? "早子时" : clockTIdx === 12 ? "晚子时" : zhiFromIndex(clockTIdx) + "时";
const dateShiftNote = dateShifted
  ? `真太阳时校正跨越日界：钟表时间 ${solarStr} ${input.birth_time}（${clockShichen}）经出生地经度校正后为 ${correctedDateStr} ${correctedHM}（${tIdx === 12 ? "晚子时" : tIdx === 0 ? "早子时" : timeZhi + "时"}）。本盘按「子时换日、晚子时归次日」口径排定，安星以校正后时刻为基准。`
  : null;

const coverRows = [
  ["性别", genderCn, "五行局", `${chart.fiveElementsClass}（起运虚${startAge}岁）`],
  ["公历", `${solarStr} ${input.birth_time}`, "真太阳时", `${correctedDateStr} ${correctedHM}（${tIdx === 12 ? "晚子时" : tIdx === 0 ? "早子时" : timeZhi + "时"}）`],
  ["农历", lunarDisplay, "地理经度", `东经 ${longitude}°${longitudeSource === "city" ? `（${cityMatched}）` : ""}`],
  ["四柱（节气）", chart.chineseDate, "四柱（非节气）", chart.chineseDate],
  ["命宫", `${soulPalace.branch}（${soulPalace.majorText}）`, "身宫", bodyPalace ? (bodyPalace.name === "命宫" ? `${bodyPalace.branch}（命身同宫·${soulPalace.major[0] ? soulPalace.major[0].name : ""}）` : `${bodyPalace.branch}（${bodyPalace.majorText}）`) : "—"],
  ["命主", chart.soul, "身主", chart.body],
  ["来因宫", laiyin ? `${laiyin.name}（${laiyin.branch}）` : "—", "大限行向", directionCn],
  ["校验码", checksum, "子年斗君", doujunBranch],
];

// ===== 八字层（lunar-javascript 全量）=====
const GAN_WX = { 甲: "木", 乙: "木", 丙: "火", 丁: "火", 戊: "土", 己: "土", 庚: "金", 辛: "金", 壬: "水", 癸: "水" };
const ZHI_WX = { 子: "水", 丑: "土", 寅: "木", 卯: "木", 辰: "土", 巳: "火", 午: "火", 未: "土", 申: "金", 酉: "金", 戌: "土", 亥: "水" };
const POLAR = { 甲: "阳", 丙: "阳", 戊: "阳", 庚: "阳", 壬: "阳", 乙: "阴", 丁: "阴", 己: "阴", 辛: "阴", 癸: "阴" };
const SHENG = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
const KE = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };
const shishen = (other, day) => {
  const o = GAN_WX[other], d = GAN_WX[day];
  const same = POLAR[other] === POLAR[day];
  if (o === d) return same ? "比肩" : "劫财";
  if (SHENG[d] === o) return same ? "食神" : "伤官";
  if (KE[d] === o) return same ? "偏财" : "正财";
  if (KE[o] === d) return same ? "七杀" : "正官";
  if (SHENG[o] === d) return same ? "偏印" : "正印";
  return "—";
};
const countWx = (arr) => { const c = { 金: 0, 木: 0, 水: 0, 火: 0, 土: 0 }; arr.forEach(w => c[w]++); return c; };

const bzItems = [
  { pos: "年柱", gan: ec.getYearGan(), zhi: ec.getYearZhi(), hide: ec.getYearHideGan(), ssZhi: ec.getYearShiShenZhi(), nayin: ec.getYearNaYin(), kong: ec.getYearXunKong() },
  { pos: "月柱", gan: ec.getMonthGan(), zhi: ec.getMonthZhi(), hide: ec.getMonthHideGan(), ssZhi: ec.getMonthShiShenZhi(), nayin: ec.getMonthNaYin(), kong: ec.getMonthXunKong() },
  { pos: "日柱", gan: ec.getDayGan(), zhi: ec.getDayZhi(), hide: ec.getDayHideGan(), ssZhi: ec.getDayShiShenZhi(), nayin: ec.getDayNaYin(), kong: ec.getDayXunKong() },
  { pos: "时柱", gan: ec.getTimeGan(), zhi: ec.getTimeZhi(), hide: ec.getTimeHideGan(), ssZhi: ec.getTimeShiShenZhi(), nayin: ec.getTimeNaYin(), kong: ec.getTimeXunKong() },
];
const dayGan = ec.getDayGan();
const pillarsTable = bzItems.map((it, i) => ({
  pos: it.pos,
  gan: it.gan,
  ganShishen: i === 2 ? "日主" : shishen(it.gan, dayGan),
  zhi: it.zhi,
  zhiWx: ZHI_WX[it.zhi],
  hide: it.hide.map((g, j) => ({ gan: g, wx: GAN_WX[g], shishen: it.ssZhi[j] || shishen(g, dayGan) })),
  nayin: it.nayin,
  kong: it.kong,
}));
const wuxing = {
  gan: countWx(bzItems.map(it => GAN_WX[it.gan])),
  zhiBenqi: countWx(bzItems.map(it => ZHI_WX[it.zhi])),
  hidden: countWx(bzItems.flatMap(it => it.hide.map(g => GAN_WX[g]))),
};

// 神煞（按通行口诀，日干为主）
const branches = bzItems.map(it => ({ zhi: it.zhi, pos: it.pos }));
const hasZhi = (z) => branches.filter(b => b.zhi === z).map(b => b.pos);
const TIANYI = { 甲: "丑未", 戊: "丑未", 庚: "丑未", 乙: "子申", 己: "子申", 丙: "亥酉", 丁: "亥酉", 壬: "巳卯", 癸: "巳卯", 辛: "午寅" };
const WENCHANG = { 甲: "巳", 乙: "午", 丙: "申", 戊: "申", 丁: "酉", 己: "酉", 庚: "亥", 辛: "子", 壬: "寅", 癸: "卯" };
const LUSHEN = { 甲: "寅", 乙: "卯", 丙: "巳", 戊: "巳", 丁: "午", 己: "午", 庚: "申", 辛: "酉", 壬: "亥", 癸: "子" };
const YANGREN = { 甲: "卯", 乙: "辰", 丙: "午", 丁: "未", 戊: "午", 己: "未", 庚: "酉", 辛: "戌", 壬: "子", 癸: "丑" };
const TAOHUA = { 申: "酉", 子: "酉", 辰: "酉", 寅: "卯", 午: "卯", 戌: "卯", 巳: "午", 酉: "午", 丑: "午", 亥: "子", 卯: "子", 未: "子" };
const YIMA = { 申: "寅", 子: "寅", 辰: "寅", 寅: "申", 午: "申", 戌: "申", 巳: "亥", 酉: "亥", 丑: "亥", 亥: "巳", 卯: "巳", 未: "巳" };
const yearZhi = ec.getYearZhi();
const shensha = [
  { name: "天乙贵人", by: `日干${dayGan}`, target: TIANYI[dayGan], hit: TIANYI[dayGan].split("").flatMap(hasZhi) },
  { name: "文昌贵人", by: `日干${dayGan}`, target: WENCHANG[dayGan], hit: hasZhi(WENCHANG[dayGan]) },
  { name: "禄神", by: `日干${dayGan}`, target: LUSHEN[dayGan], hit: hasZhi(LUSHEN[dayGan]) },
  { name: "羊刃", by: `日干${dayGan}`, target: YANGREN[dayGan], hit: hasZhi(YANGREN[dayGan]) },
  { name: "桃花（咸池）", by: `年支${yearZhi}`, target: TAOHUA[yearZhi], hit: hasZhi(TAOHUA[yearZhi]) },
  { name: "驿马", by: `年支${yearZhi}`, target: YIMA[yearZhi], hit: hasZhi(YIMA[yearZhi]) },
];

// 刑冲合害（地支关系全扫描）
const relations = (() => {
  const out = [];
  const CHONG = [["子", "午"], ["丑", "未"], ["寅", "申"], ["卯", "酉"], ["辰", "戌"], ["巳", "亥"]];
  const HE6 = [["子", "丑"], ["寅", "亥"], ["卯", "戌"], ["辰", "酉"], ["巳", "申"], ["午", "未"]];
  const HE3 = [["申", "子", "辰", "水"], ["寅", "午", "戌", "火"], ["亥", "卯", "未", "木"], ["巳", "酉", "丑", "金"]];
  const HUI = [["寅", "卯", "辰", "木"], ["巳", "午", "未", "火"], ["申", "酉", "戌", "金"], ["亥", "子", "丑", "水"]];
  for (let i = 0; i < branches.length; i++) for (let j = i + 1; j < branches.length; j++) {
    const a = branches[i], b = branches[j];
    if (a.zhi === b.zhi && "辰午酉亥".includes(a.zhi)) out.push(`${a.pos}${a.zhi}与${b.pos}${b.zhi}自刑`);
    for (const [x, y] of CHONG) if ((a.zhi === x && b.zhi === y) || (a.zhi === y && b.zhi === x)) out.push(`${a.pos}${a.zhi}冲${b.pos}${b.zhi}`);
    for (const [x, y] of HE6) if ((a.zhi === x && b.zhi === y) || (a.zhi === y && b.zhi === x)) out.push(`${a.pos}${a.zhi}合${b.pos}${b.zhi}（六合）`);
  }
  for (const [x, y, z, wx] of HE3) {
    const got = [x, y, z].filter(zz => branches.some(b => b.zhi === zz));
    if (got.length === 3) out.push(`三合${wx}局（${x}${y}${z}）`);
    else if (got.length === 2) out.push(`半合${wx}局（${got.join("")}，缺${[x, y, z].find(t => !got.includes(t))}）`);
  }
  for (const [x, y, z, wx] of HUI) {
    const got = [x, y, z].filter(zz => branches.some(b => b.zhi === zz));
    if (got.length === 3) out.push(`三会${wx}方（${x}${y}${z}）`);
    else if (got.length === 2) out.push(`拱${wx}方（${got.join("")}）`);
  }
  for (const grp of [["寅", "巳", "申"], ["丑", "戌", "未"]]) {
    const got = grp.filter(zz => branches.some(b => b.zhi === zz));
    if (got.length === 3) out.push(`三刑全（${grp.join("")}）`);
  }
  if (branches.some(b => b.zhi === "子") && branches.some(b => b.zhi === "卯")) out.push("子卯相刑");
  return out;
})();

// 大运（精确起运）
const yun = ec.getYun(genderCn === "男" ? 1 : 0);
const yunStart = yun.getStartSolar();
const yunStartText = `${yunStart.getYear()}-${String(yunStart.getMonth()).padStart(2, "0")}-${String(yunStart.getDay()).padStart(2, "0")}`;
const dayun = (yun.getDaYun() || [])
  .filter(d => d.getGanZhi())
  .slice(0, 8)
  .map((d, i) => ({
    no: i + 1,
    ganZhi: d.getGanZhi(),
    ganShishen: shishen(d.getGanZhi()[0], dayGan),
    zhiWx: ZHI_WX[d.getGanZhi()[1]],
    startAge: d.getStartAge(),
    endAge: d.getEndAge(),
    startYear: d.getStartYear(),
    endYear: d.getEndYear(),
    span: `${yunStart.getYear() + i * 10}–${yunStart.getYear() + (i + 1) * 10}`,
  }));

// 与紫微大限的双轴对齐
const alignment = decades.slice(0, 8).map(dec => ({
  decade: dec.noCn + "限",
  decadePalace: dec.palace,
  decadeYears: `${dec.startYear}-${dec.endYear}`,
  dayun: dayun
    .filter(d => !(d.endYear < dec.startYear || d.startYear > dec.endYear))
    .map(d => ({ ganZhi: d.ganZhi, span: d.span, ganShishen: d.ganShishen })),
}));

liunian.forEach(ln => { ln.ganShishen = shishen(ln.ganZhi[0], dayGan); });

const bazi = {
  pillars: { year: ec.getYear(), month: ec.getMonth(), day: ec.getDay(), time: ec.getTime() },
  dayMaster: dayGan,
  pillarsTable,
  wuxing,
  kongwang: { day: ec.getDayXunKong(), year: ec.getYearXunKong(), month: ec.getMonthXunKong(), time: ec.getTimeXunKong() },
  taiyuan: ec.getTaiYuan(),
  minggong: ec.getMingGong(),
  shengong: ec.getShenGong(),
  shensha,
  relations,
  yun: {
    startText: `${yun.getStartYear()}年${yun.getStartMonth()}个月${yun.getStartDay()}天`,
    startSolar: yunStartText,
  },
  dayun,
  alignment,
};

const out = {
  generatedAt: new Date().toISOString(),
  input: { ...input, gender: genderCn },
  trueSolar: {
    clock: `${solarStr} ${input.birth_time}`,
    corrected: `${correctedDateStr} ${correctedHM}`,
    correctedDate: correctedDateStr,
    dateShifted,
    dateShiftNote,
    deltaMinutes: deltaMin,
    equationOfTimeMin: Math.round(eot * 100) / 100,
    longitude,
    longitudeSource,
    cityMatched,
    stdMeridian,
    timeIndex: tIdx,
    timeZhi,
    shichen: shichenDisplay,
  },
  birth: {
    solar: solarStr,
    lunar: chart.lunarDate,
    lunarDisplay,
    gender: genderCn,
    zodiac: chart.zodiac,
    sign: chart.sign,
    timeRange: chart.timeRange,
  },
  pillars: { chinese: chart.chineseDate },
  chart: {
    fiveElements: chart.fiveElementsClass,
    decadalStartAge: startAge,
    soulPalace: { branch: soulPalace.branch, stars: soulPalace.majorText, minorText: soulPalace.minorText, adjectiveText: soulPalace.adjectiveText },
    bodyPalace: bodyPalace ? { branch: bodyPalace.branch, stars: bodyPalace.majorText, isSoulPalace: bodyPalace.name === "命宫" } : null,
    soulStar: chart.soul,
    bodyStar: chart.body,
    laiyin: laiyin ? { palace: laiyin.name, branch: laiyin.branch, stem: laiyin.stem } : null,
    direction: directionCn,
    yearStem,
    yearPillar,
    doujunBranch,
    soulPalaceStarsDetail: soulPalace.major,
  },
  coverRows,
  bazi,
  palaces,
  decades,
  liunian,
  selfCheck: { passed: selfCheck.filter((c) => c.ok).length, total: selfCheck.length, items: selfCheck },
  checksum,
  warnings,
};

console.log(JSON.stringify(out, null, 1));