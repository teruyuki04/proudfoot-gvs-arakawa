(()=>{
// JSON Schema（draft 2020-12）のうち、schema/ で使うキーワードだけを解釈する最小検証器。
// 外部ライブラリなしでブラウザとNodeの両方から使う。
const SUPPORTED_KEYWORDS = new Set([
  '$schema', '$id', 'title', 'description', '$defs', '$ref', 'type', 'enum', 'const', 'required',
  'properties', 'additionalProperties', 'items', 'minItems', 'maxItems', 'uniqueItems',
  'minimum', 'maximum', 'minLength', 'pattern'
]);

const jsonType = v => v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;
const typeMatches = (t, v) => { const a = jsonType(v); return t === a || (t === 'number' && a === 'integer'); };

function checkSchema(schema, data) {
  const errors = [];
  const push = (path, message) => errors.push({ code: 'SCHEMA', path, message });
  const resolve = ref => {
    if (!ref.startsWith('#/$defs/')) throw new Error('未対応の$ref: ' + ref);
    const def = schema.$defs && schema.$defs[ref.slice(8)];
    if (!def) throw new Error('未定義の$ref: ' + ref);
    return def;
  };
  function walk(s, v, path) {
    if (s.$ref) return walk(resolve(s.$ref), v, path);
    if (s.type !== undefined) {
      const ts = [].concat(s.type);
      if (!ts.some(t => typeMatches(t, v))) { push(path, `型が不正です（期待：${ts.join('|')}、実際：${jsonType(v)}）`); return; }
    }
    if ('const' in s && v !== s.const) push(path, `値は ${JSON.stringify(s.const)} である必要があります`);
    if (s.enum && !s.enum.includes(v)) push(path, `値 ${JSON.stringify(v)} は許可されていません（${s.enum.map(e => JSON.stringify(e)).join(' / ')}）`);
    if (typeof v === 'string') {
      if (s.minLength !== undefined && v.length < s.minLength) push(path, `文字列が短すぎます（最小${s.minLength}）`);
      if (s.pattern && !new RegExp(s.pattern).test(v)) push(path, `書式が不正です（${s.pattern}）`);
    }
    if (typeof v === 'number') {
      if (s.minimum !== undefined && v < s.minimum) push(path, `${s.minimum}以上である必要があります`);
      if (s.maximum !== undefined && v > s.maximum) push(path, `${s.maximum}以下である必要があります`);
    }
    if (Array.isArray(v)) {
      if (s.minItems !== undefined && v.length < s.minItems) push(path, `要素数は${s.minItems}以上が必要です`);
      if (s.maxItems !== undefined && v.length > s.maxItems) push(path, `要素数は${s.maxItems}以下である必要があります`);
      if (s.uniqueItems && new Set(v.map(x => JSON.stringify(x))).size !== v.length) push(path, '要素が重複しています');
      if (s.items) v.forEach((x, i) => walk(s.items, x, `${path}[${i}]`));
    }
    if (jsonType(v) === 'object') {
      for (const k of s.required || []) if (!(k in v)) push(`${path}.${k}`, '必須項目がありません');
      const props = s.properties || {};
      for (const [k, x] of Object.entries(v)) {
        if (props[k]) walk(props[k], x, `${path}.${k}`);
        else if (s.additionalProperties === false) push(`${path}.${k}`, '未定義の項目です');
        else if (s.additionalProperties && typeof s.additionalProperties === 'object') walk(s.additionalProperties, x, `${path}.${k}`);
      }
    }
  }
  walk(schema, data, '$');
  return errors;
}

// スキーマが本検証器の対応範囲だけで書かれているかを確認する（テスト用）。
function unsupportedKeywords(schema) {
  const found = new Set();
  (function visit(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return;
    for (const [k, v] of Object.entries(s)) {
      if (!SUPPORTED_KEYWORDS.has(k)) found.add(k);
      if (k === 'properties' || k === '$defs') Object.values(v).forEach(visit);
      else if (k === 'items' || k === 'additionalProperties') visit(v);
    }
  })(schema);
  return [...found];
}

// 方法論上の定数と、データから描画・判定に必要な値を導く純粋関数。企業固有の値は持たない。

const AXIS_X = {
  name: '顧客の切替必然性',
  target: '顧客にとっての不可欠性',
  levels: { 1: 'あったらいい', 2: 'あると助かる', 3: 'ないと困る', 4: '旧方式へ戻ることが不合理' },
  note: '顧客の採用・設備投資・仕様変更等は代理指標であり、判定対象そのものではない。'
};
const AXIS_Y = {
  name: '競合の参入不協和性',
  levels: {
    1: '容易に参入できる',
    2: '投資負担があっても参入が合理的',
    3: '参入が競合の収益・資源・事業モデルと重大に衝突',
    4: '主要競合・現実的な代替参入者にとって参入が構造的に不合理'
  },
  note: '単なる技術的参入障壁・特許数・競合の少なさとは区別する。'
};

const FACTORS = {
  premise_inversion: '前提倒置性',
  irreplaceability: '代替不可性',
  entry_dissonance: '参入不協和性',
  auto_expansion: '自動拡張性',
  irreversibility: '顧客・経営不可逆性'
};
const CLAIM_TYPES = { fact: '確認事実', inference: '合理的推論', hypothesis: '経営仮説', unknown: '未確認事項' };
const CERTAINTY = { low: '低', low_mid: '低〜中', mid: '中', mid_high: '中〜高', high: '高' };
const TP_ORDER = ['T0', 'T1', 'T2', 'TF'];
const TP_LABELS = { T0: '当初', T1: '主要転換点', T2: '現在', TF: '将来目標' };
const TRAJ_KINDS = {
  observed: { label: '観測された移動', dash: null },
  inferred: { label: '合理的推論による移動', dash: '7 5' },
  target: { label: '将来目標（実績ではない）', dash: '2 5' }
};
const SALES_TYPES = { actual: '実績', reference: '参考値（要原資料照合）', undisclosed: '非開示', not_comparable: '比較不可' };
const ZONES = { runaway: '独走路', runaway_band: '独走路候補帯', wilderness: '無人の荒野', showroom: '技術の展示場', taken_field: '取られる畑' };

// V1.2の領域構成。独走路はL4×L4のセルだけ。
function zoneOfCell(x, y) {
  if (x === 4 && y === 4) return 'runaway';
  if (x >= 3 && y >= 3) return 'runaway_band';
  if (x <= 2 && y >= 3) return 'wilderness';
  if (x <= 2) return 'showroom';
  return 'taken_field';
}

const isAssessed = tp => !!tp && tp.status === 'assessed' && !!tp.x.range && !!tp.y.range;

// 評価幅に含まれる全セルの領域（PDF 12.2 quadrant_candidates）。
function zoneCandidates(tp) {
  if (!isAssessed(tp)) return [];
  const set = new Set();
  for (let x = tp.x.range.min; x <= tp.x.range.max; x++)
    for (let y = tp.y.range.min; y <= tp.y.range.max; y++) set.add(zoneOfCell(x, y));
  return Object.keys(ZONES).filter(z => set.has(z));
}

// 「独走路」と確定判定できるのは、両軸とも幅のないL4の場合だけ。
const isRunaway = tp => isAssessed(tp) && tp.x.range.min === 4 && tp.x.range.max === 4 && tp.y.range.min === 4 && tp.y.range.max === 4;

const fmtRange = r => !r ? '保留' : r.min === r.max ? `L${r.min}` : `L${r.min}〜L${r.max}`;
const rangeMid = r => (r.min + r.max) / 2;

function plotValue(tp) {
  if (tp.plot) return { x: tp.plot.x, y: tp.plot.y };
  return { x: rangeMid(tp.x.range), y: rangeMid(tp.y.range) };
}

const sortTimepoints = tps => [...tps].sort((a, b) => TP_ORDER.indexOf(a.tp) - TP_ORDER.indexOf(b.tp));
const findTp = (c, tp) => c.timepoints.find(t => t.tp === tp);

// 現在の位置＝将来目標を除く最新の判定済み時点。
function currentTimepoint(c) {
  const list = sortTimepoints(c.timepoints).filter(t => t.tp !== 'TF' && isAssessed(t));
  return list.length ? list[list.length - 1] : null;
}

const hasSalesCircle = c => (c.sales.type === 'actual' || c.sales.type === 'reference') && typeof c.sales.value === 'number' && c.sales.value > 0;

function salesScaleMax(data) {
  const vals = data.cases.filter(hasSalesCircle).map(c => c.sales.value);
  return vals.length ? Math.max(...vals) : null;
}

// 円の面積を売上に比例させる（固定値の加算はしない）。
const SALES_RMAX = 30;
const radiusFor = (value, vmax, rmax = SALES_RMAX) => rmax * Math.sqrt(value / vmax);

function pubYear(s) { return s ? parseInt(String(s).slice(0, 4), 10) : null; }

function textWidth(str, size) {
  let w = 0;
  for (const ch of String(str)) w += /[\u0000-ÿ]/.test(ch) ? size * 0.6 : size;
  return w;
}

function indexBy(list, key = 'id') {
  const m = new Map();
  for (const x of list) m.set(x[key], x);
  return m;
}

// 第1票（マップ）・第2票（共通制約仮説）・第3票（根拠台帳）を同一データから文字列として生成する。
// DOMに依存しないため、ブラウザとNode（テスト・書き出し）の両方で同じ結果になる。

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const safeUrl = u => (/^https?:\/\//i.test(u || '') ? u : null);
const svgAttrs = o => Object.entries(o).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
const sv = (name, a, inner) => (inner === undefined ? `<${name}${svgAttrs(a)}/>` : `<${name}${svgAttrs(a)}>${inner}</${name}>`);
const n1 = v => Math.round(v * 10) / 10;

const MAP_GEOM = { x0: 92, y0: 32, gw: 560, gh: 480, W: 850, H: 620 };
const UNC_SIZE = { low: [33, 23], low_mid: [29, 20], mid: [24, 17], mid_high: [18, 13], high: [0, 0] };
const JITTER = 13;
const FONT = '"Yu Gothic","Meiryo",system-ui,sans-serif';

const boxOverlap = (a, b) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

function renderMap(data, opts = {}) {
  const o = { arrows: true, names: true, uncertainty: true, ...opts };
  const { x0, y0, gw, gh, W, H } = MAP_GEOM, cw = gw / 4, ch = gh / 4;
  const X = v => x0 + (v - 0.5) * cw, Y = v => y0 + gh - (v - 0.5) * ch;
  const layout = { shapes: [], labels: [], arrows: [], held: [], overlaps: 0 };
  const bg = [], under = [], dots = [], top = [], labels = [];

  // 背景：V1.2の非対称な領域構成と、L4×L4の独走路コア（試作版を継承）
  const r = (x, y, w, h, fill, more = {}) => bg.push(sv('rect', { x, y, width: w, height: h, fill, ...more }));
  const t = (x, y, s, size = 13, color = '#19384c', more = {}) => bg.push(sv('text', { x, y, fill: color, 'font-size': size, ...more }, esc(s)));
  r(x0, y0, gw, gh, '#eff2f3', { rx: 5 });
  r(x0, y0, gw / 2, gh / 2, '#e3eeee');
  r(x0, y0 + gh / 2, gw / 2, gh / 2, '#edf0e9');
  r(x0 + gw / 2, y0 + gh / 2, gw / 2, gh / 2, '#f5edf0');
  r(x0 + gw / 2, y0, gw / 2, gh / 2, '#f3eadf');
  r(x0 + 3 * cw, y0, cw, ch, '#e9c793', { stroke: '#a77737', 'stroke-width': 2, class: 'runaway-core' });
  for (let i = 0; i <= 4; i++) {
    bg.push(sv('line', { x1: x0 + cw * i, y1: y0, x2: x0 + cw * i, y2: y0 + gh, stroke: '#b6c7cb' }));
    bg.push(sv('line', { x1: x0, y1: y0 + ch * i, x2: x0 + gw, y2: y0 + ch * i, stroke: '#b6c7cb' }));
  }
  const zoneText = [
    [x0 + 40, 85, ZONES.wilderness, 18, '#45626b'],
    [x0 + 46, 310, ZONES.showroom, 18, '#49665d'],
    [x0 + cw * 2 + 47, 310, ZONES.taken_field, 18, '#765c65'],
    [x0 + cw * 2 + 28, 86, ZONES.runaway_band, 17, '#8c6a41']
  ];
  // 領域名は円より上の層に置き、白い縁取りで円と重なっても読めるようにする
  const zones = [];
  const halo = { 'paint-order': 'stroke', stroke: '#ffffff', 'stroke-width': 3, 'stroke-opacity': 0.6, 'stroke-linejoin': 'round', 'pointer-events': 'none' };
  const zt = (x, y, s, size, color, more) => zones.push(sv('text', { x, y, fill: color, 'font-size': size, ...halo, ...more }, esc(s)));
  const zoneBoxes = [];
  for (const [zx, zy, s, size, color] of zoneText) {
    zt(zx, zy, s, size, color, { 'font-weight': 700 });
    zoneBoxes.push({ x: zx, y: zy - size, w: textWidth(s, size), h: size + 4 });
  }
  zt(x0 + 3 * cw + cw / 2, y0 + 45, ZONES.runaway, 18, '#744b28', { 'text-anchor': 'middle', 'font-weight': 700 });
  zt(x0 + 3 * cw + cw / 2, y0 + 65, 'L4 × L4', 12, '#744b28', { 'text-anchor': 'middle' });
  zoneBoxes.push({ x: x0 + 3 * cw + cw / 2 - 30, y: y0 + 27, w: 60, h: 42 });
  for (let i = 1; i <= 4; i++) {
    t(x0 + (i - 0.5) * cw, y0 + gh + 21, 'L' + i, 13, '#506677', { 'text-anchor': 'middle' });
    t(x0 - 14, y0 + gh - (i - 0.5) * ch + 5, 'L' + i, 13, '#506677', { 'text-anchor': 'end' });
  }
  t(x0 + gw / 2, 590, `${AXIS_X.name}（${AXIS_X.levels[1]} → ${AXIS_X.levels[4]}） →`, 15, '#19384c', { 'text-anchor': 'middle', 'font-weight': 600 });
  t(18, y0 + gh / 2, `${AXIS_Y.name} →`, 15, '#19384c', { 'text-anchor': 'middle', 'font-weight': 600, transform: `rotate(-90 18 ${y0 + gh / 2})` });

  // 位置：正式判定（範囲）から描画位置を導き、異なる案件が同じ位置に重なる場合だけずらす
  const raw = [];
  for (const c of data.cases) for (const tp of c.timepoints) if (isAssessed(tp)) {
    const p = plotValue(tp);
    raw.push({ c, tp, bx: X(p.x), by: Y(p.y) });
  }
  const groups = new Map();
  const gkey = q => Math.round(q.bx) + ',' + Math.round(q.by);
  for (const q of raw) { const k = gkey(q); if (!groups.has(k)) groups.set(k, []); if (!groups.get(k).includes(q.c.id)) groups.get(k).push(q.c.id); }
  const pos = new Map();
  for (const q of raw) {
    const g = groups.get(gkey(q)); let dx = 0, dy = 0;
    if (g.length > 1) { const ang = -Math.PI * 3 / 4 + g.indexOf(q.c.id) * 2 * Math.PI / g.length; dx = JITTER * Math.cos(ang); dy = JITTER * Math.sin(ang); }
    pos.set(q.c.id + '|' + q.tp.tp, { x: q.bx + dx, y: q.by + dy, dx, dy });
  }

  const vmax = salesScaleMax(data);
  const shapes = [];
  for (const c of data.cases) {
    const cur = currentTimepoint(c);
    if (!cur) { layout.held.push(c.id); continue; }
    const p = pos.get(c.id + '|' + cur.tp);
    const circle = hasSalesCircle(c);
    shapes.push({ c, tp: cur, cx: p.x, cy: p.y, dx: p.dx, dy: p.dy, r: circle ? radiusFor(c.sales.value, vmax) : 11, kind: circle ? 'circle' : 'diamond' });
  }
  const shapeOf = new Map(shapes.map(s => [s.c.id, s]));

  for (const s of shapes) {
    const { c, tp } = s;
    // 評価幅・不確実性
    if (o.uncertainty) {
      const spanX = tp.x.range.max > tp.x.range.min, spanY = tp.y.range.max > tp.y.range.min;
      const [ux, uy] = UNC_SIZE[tp.certainty];
      if (!spanX && !spanY) {
        if (ux) under.push(sv('ellipse', { cx: n1(s.cx), cy: n1(s.cy), rx: ux, ry: uy, fill: c.color, 'fill-opacity': 0.07, stroke: c.color, 'stroke-width': 1.4, 'stroke-dasharray': '4 4', class: 'uncertainty' }));
      } else {
        const w = spanX ? (tp.x.range.max - tp.x.range.min + 1) * cw - cw * 0.45 : 2 * Math.max(ux, 22);
        const h = spanY ? (tp.y.range.max - tp.y.range.min + 1) * ch - ch * 0.45 : 2 * Math.max(uy, 16);
        const mx = X(spanX ? rangeMid(tp.x.range) : plotValue(tp).x) + s.dx, my = Y(spanY ? rangeMid(tp.y.range) : plotValue(tp).y) + s.dy;
        under.push(sv('rect', { x: n1(mx - w / 2), y: n1(my - h / 2), width: n1(w), height: n1(h), rx: 14, fill: c.color, 'fill-opacity': 0.06, stroke: c.color, 'stroke-width': 1.4, 'stroke-dasharray': '4 4', class: 'uncertainty range-band' }));
      }
    }
  }

  for (const c of data.cases) {
    const cur = shapeOf.get(c.id);
    // 時系列矢印：根拠のある移動のみ（検証器で保証）。同一判定（停滞）は描かない
    if (o.arrows) for (const tr of c.trajectories) {
      const a = pos.get(c.id + '|' + tr.from), b = pos.get(c.id + '|' + tr.to);
      if (!a || !b) continue;
      if (tr.kind !== 'target' && !tr.evidence_ids.length) continue;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist < 1) continue;
      const ux = (b.x - a.x) / dist, uy = (b.y - a.y) / dist;
      const sr = (cur && cur.tp.tp === tr.from ? cur.r : 5) + 2;
      const er = (cur && cur.tp.tp === tr.to ? cur.r : tr.to === 'TF' ? 6 : 5) + 3;
      if (dist <= sr + er + 2) continue;
      const ax = a.x + ux * sr, ay = a.y + uy * sr, bx = b.x - ux * er, by = b.y - uy * er;
      const kind = TRAJ_KINDS[tr.kind];
      under.push(sv('line', { x1: n1(ax), y1: n1(ay), x2: n1(bx), y2: n1(by), stroke: c.color, 'stroke-width': 2.7, 'stroke-dasharray': kind.dash, opacity: tr.kind === 'target' ? 0.7 : 0.85, class: `traj traj-${tr.kind}`, 'data-case': c.id }));
      const ang = Math.atan2(by - ay, bx - ax), len = 9;
      const pts = [[bx, by], [bx - len * Math.cos(ang - 0.5), by - len * Math.sin(ang - 0.5)], [bx - len * Math.cos(ang + 0.5), by - len * Math.sin(ang + 0.5)]];
      under.push(sv('polygon', { points: pts.map(v => v.map(n1).join(',')).join(' '), fill: c.color, opacity: tr.kind === 'target' ? 0.7 : 1 }));
      layout.arrows.push({ caseId: c.id, from: tr.from, to: tr.to, kind: tr.kind, dash: kind.dash });
    }
    // 過去時点と将来目標の点
    for (const tp of sortTimepoints(c.timepoints)) {
      if (!isAssessed(tp) || (cur && cur.tp === tp)) continue;
      const p = pos.get(c.id + '|' + tp.tp);
      if (tp.tp === 'TF') dots.push(sv('circle', { cx: n1(p.x), cy: n1(p.y), r: 6, fill: '#fff', stroke: c.color, 'stroke-width': 1.6, 'stroke-dasharray': '2 3', class: 'target-point' }));
      else dots.push(sv('circle', { cx: n1(p.x), cy: n1(p.y), r: 5, fill: c.color, opacity: 0.3, stroke: c.color, 'stroke-width': 1.2, class: 'past-point' }));
      if (o.arrows) dots.push(sv('text', { x: n1(p.x - 10), y: n1(p.y - 9), fill: c.color, 'font-size': 10 }, esc(String(tp.year).slice(2))));
    }
  }

  for (const s of shapes) {
    const { c, tp } = s;
    const tip = `${c.name}｜${tp.tp} ${tp.year}：横 ${fmtRange(tp.x.range)} × 縦 ${fmtRange(tp.y.range)}（${CLAIM_TYPES[tp.basis]}・確度${CERTAINTY[tp.certainty]}）`;
    const common = { 'data-case': c.id, class: `case-shape shape-${s.kind}`, style: 'cursor:pointer' };
    if (s.kind === 'circle') {
      const ref = c.sales.type === 'reference';
      top.push(sv('circle', { cx: n1(s.cx), cy: n1(s.cy), r: Math.round(s.r * 1000) / 1000, fill: c.color, 'fill-opacity': ref ? 0.78 : 0.84, stroke: '#fff', 'stroke-width': 2.2, 'data-sales': c.sales.value, ...common }, sv('title', {}, esc(tip))));
      if (ref) top.push(sv('circle', { cx: n1(s.cx), cy: n1(s.cy), r: n1(s.r + 2.6), fill: 'none', stroke: c.color, 'stroke-width': 1.1, 'stroke-dasharray': '3 2', class: 'reference-ring' }));
    } else {
      const { cx, cy } = s;
      top.push(sv('polygon', { points: `${n1(cx)},${n1(cy - 11)} ${n1(cx + 11)},${n1(cy)} ${n1(cx)},${n1(cy + 11)} ${n1(cx - 11)},${n1(cy)}`, fill: c.color, stroke: '#fff', 'stroke-width': 2, ...common }, sv('title', {}, esc(tip))));
    }
    layout.shapes.push({ caseId: c.id, kind: s.kind, cx: s.cx, cy: s.cy, r: s.r, tp: tp.tp, sales: c.sales.value });
  }

  // 製品名・成長の壁：重なりを避けて自動配置（案件固有の座標調整は持たない）
  if (o.names) {
    const shapeBoxes = shapes.map(s => ({ id: s.c.id, x: s.cx - s.r - 2, y: s.cy - s.r - 2, w: 2 * s.r + 4, h: 2 * s.r + 4 }));
    const placed = [];
    const order = [...shapes].sort((a, b) => b.r - a.r);
    for (const s of order) {
      const w = Math.max(textWidth(s.c.name, 13), textWidth(s.c.wall.text, 10)) + 2, h = 31;
      const cands = [];
      for (const step of [0, 12, 26, 42, 62, 86, 112]) for (const [dx, dy] of [[1, 0], [1, -1], [1, 1], [-1, 0], [-1, -1], [-1, 1], [0, -1], [0, 1]]) {
        const x = s.cx + dx * (s.r + 6 + step) - (dx < 0 ? w : dx === 0 ? w / 2 : 0);
        const y = s.cy + dy * (s.r + 4 + step) - (dy < 0 ? h : dy === 0 ? h / 2 : 0);
        cands.push({ x, y, w, h, step });
      }
      let best = null, bestScore = Infinity;
      cands.forEach((b, i) => {
        let sc = i * 0.01 + b.step * 0.2;
        if (b.x < x0 + 2 || b.x + b.w > W - 2 || b.y < y0 + 2 || b.y + b.h > y0 + gh - 2) sc += 1e6;
        for (const p of placed) sc += boxOverlap(b, p) * 10;
        for (const sb of shapeBoxes) if (sb.id !== s.c.id) sc += boxOverlap(b, sb) * 6;
        for (const z of zoneBoxes) sc += boxOverlap(b, z) * 1;
        if (sc < bestScore) { bestScore = sc; best = b; }
      });
      placed.push(best);
      layout.labels.push({ caseId: s.c.id, ...best });
      // 点が重なってラベルが離れた場合は、座標を動かさず引き出し線で対応を示す
      const nx = Math.max(best.x, Math.min(s.cx, best.x + best.w)), ny = Math.max(best.y, Math.min(s.cy, best.y + best.h));
      const dist = Math.hypot(nx - s.cx, ny - s.cy);
      if (dist - s.r > 10) {
        const ux = (nx - s.cx) / dist, uy = (ny - s.cy) / dist;
        labels.push(sv('line', { x1: n1(s.cx + ux * (s.r + 1)), y1: n1(s.cy + uy * (s.r + 1)), x2: n1(nx), y2: n1(ny), stroke: s.c.color, 'stroke-width': 1, opacity: 0.75, class: 'leader' }));
        layout.leaders = (layout.leaders || 0) + 1;
      }
      labels.push(sv('text', { x: n1(best.x), y: n1(best.y + 12), fill: s.c.color, 'font-size': 13, 'font-weight': 700, 'data-case': s.c.id, style: 'cursor:pointer' }, esc(s.c.name)));
      labels.push(sv('text', { x: n1(best.x), y: n1(best.y + 27), fill: s.c.color, 'font-size': 10 }, esc(s.c.wall.text)));
    }
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) if (boxOverlap(placed[i], placed[j]) > 0) layout.overlaps++;
      for (const sb of shapeBoxes) if (sb.id !== layout.labels[i].caseId && boxOverlap(placed[i], sb) > 0) layout.overlaps++;
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(data.metadata.company)}｜成長必然性マップ" font-family="${esc(FONT)}">`
    + sv('rect', { x: 0, y: 0, width: W, height: H, fill: '#ffffff' })
    + bg.join('') + under.join('') + dots.join('') + top.join('') + zones.join('') + labels.join('') + '</svg>';
  return { svg, layout };
}

// ---------- 共通部品 ----------
const badge = type => `<span class="ct ct-${esc(type)}">${esc(CLAIM_TYPES[type] || type)}</span>`;
const evRefs = (ids, tpYear, evs) => (ids || []).map(id => {
  const ev = evs.get(id); const late = ev && tpYear && pubYear(ev.published) > tpYear;
  return `<span class="evref${late ? ' late' : ''}" title="${late ? '時点より後に公表' : ''}">${esc(id)}${late ? '※後年' : ''}</span>`;
}).join(' ') || '<span class="muted">根拠なし</span>';
const caseChip = c => `<span class="chip" style="border-color:${esc(c.color)};color:${esc(c.color)}">${esc(c.name)}</span>`;
const list = items => items.length ? `<ul>${items.map(x => `<li>${x}</li>`).join('')}</ul>` : '<p class="muted">未記録</p>';

function caseEvidenceIds(c) {
  const s = new Set();
  const add = ids => (ids || []).forEach(id => s.add(id));
  c.timepoints.forEach(t => { add(t.x.evidence_ids); add(t.y.evidence_ids); });
  c.trajectories.forEach(t => add(t.evidence_ids));
  add(c.sales.evidence_ids); add(c.wall.evidence_ids);
  c.triggers.forEach(t => add(t.evidence_ids));
  c.interactions.forEach(t => add(t.supporting_evidence));
  c.factor_events.forEach(t => add(t.evidence_ids));
  c.counters.forEach(t => add(t.evidence_ids));
  return [...s];
}

function salesText(c) {
  const s = c.sales;
  if (hasSalesCircle(c)) return `${s.type === 'reference' ? '参考：' : ''}約${s.value}${s.unit}${s.fiscal_year ? `（${s.fiscal_year}年度）` : '（基準年度未設定）'}`;
  return SALES_TYPES[s.type];
}

// ---------- 第1票 ----------
function renderSheet1(data, mapSvg, layout) {
  const m = data.metadata, d = data.display;
  const vmax = salesScaleMax(data);
  const held = data.cases.filter(c => layout.held.includes(c.id));
  const statusLabel = { unverified_hypothesis: '未検証の推論を含む', partially_verified: '一部照合済み', reviewed: 'レビュー済み' }[m.data_status];
  const lineSample = dash => `<svg width="28" height="8" aria-hidden="true"><line x1="1" y1="4" x2="27" y2="4" stroke="#6b7c8a" stroke-width="2.4"${dash ? ` stroke-dasharray="${dash}"` : ''}/></svg>`;
  return `<section class="sheet" id="sheet1"><div class="heading"><div><h1>${esc(m.company)}｜${esc(d.map_title || '成長必然性マップ')} <span style="font-weight:400">${esc(d.heritage_label || 'V1.2継承')}</span></h1>`
    + `<div class="sub">公開情報からの暫定推論｜対象期間 ${m.period.from}–${m.period.to}（案件別 T0 当初 → T1 主要転換点 → T2 現在）｜第一層・第1票</div></div>`
    + `<div class="tag">${esc(m.version)}｜${esc(statusLabel)}</div></div>`
    + `<div class="bodygrid"><div><div class="graphbox" id="mapbox">${mapSvg}</div>`
    + `<div class="legend"><span><span class="dot"></span>円面積＝比較可能な売上${vmax ? `（最大 約${vmax}億円）` : ''}・破線の輪郭＝参考値（要照合）</span><span><span class="unknown">◆</span>売上非開示・比較不可</span>`
    + Object.values(TRAJ_KINDS).map(k => `<span>${lineSample(k.dash)} ${esc(k.label)}</span>`).join('')
    + `<span>濃色＝現在／淡色＝過去時点</span><span>点線の枠・楕円＝評価幅・不確実性</span></div>`
    + `<div class="controls noprint"><label><input id="arrows" type="checkbox" checked> 時系列矢印</label><label><input id="names" type="checkbox" checked> 製品名・壁</label><label><input id="uncertainty" type="checkbox" checked> 推論の不確実性</label></div>`
    + `<div class="small">L4×L4のみ「独走路」。横軸＝${esc(AXIS_X.name)}（判定対象は${esc(AXIS_X.target)}。${esc(AXIS_X.note)}）、縦軸＝${esc(AXIS_Y.name)}（${esc(AXIS_Y.note)}）。正式判定はL1〜L4（評価幅を許容）で、点の位置は判定範囲内の描画位置です。矢印は根拠IDを持つ移動だけを描き、同一判定の時点間（停滞）は描きません。円面積は売上に比例し、目標値は使いません。${d.map_note ? esc(d.map_note) : ''}</div>`
    + (held.length ? `<div class="small held">判定保留（作図しない案件）：${held.map(c => esc(c.name)).join('、')}</div>` : '')
    + `</div><aside class="side"><h3>この1枚から見えること</h3>`
    + d.insights.map((ins, i) => `<div class="insight"><b>${'①②③'[i] || ''} ${esc(ins.title)} ${badge(ins.claim_type)}</b>${esc(ins.text)}</div>`).join('')
    + `<div class="takeaway">${esc(d.takeaway.label)}：<br>${esc(d.takeaway.text)}</div></aside></div></section>`;
}

// ---------- 第2票 ----------
function renderSheet2(data) {
  const evs = indexBy(data.evidence), docs = indexBy(data.documents), cases = indexBy(data.cases), d = data.display;
  const body = data.constraints.length ? data.constraints.map(h => {
    const hf = h.hard_fact_ids.map(id => evs.get(id)).filter(Boolean);
    const docN = new Set(hf.map(e => e.doc_id)).size, grpN = new Set(hf.map(e => docs.get(e.doc_id)?.independence_group)).size;
    return `<div class="panel constraint" data-constraint="${esc(h.id)}"><h3>${esc(h.id)}｜${esc(h.title)} ${badge(h.claim_type)}</h3><div>`
      + `<p class="hyp">${esc(h.hypothesis)}</p>`
      + `<p><b>対象案件：</b>${h.case_ids.map(id => cases.get(id)).filter(Boolean).map(caseChip).join(' ')}</p>`
      + `<p><b>ハードファクト（${hf.length}件・独立した資料${docN}件・独立性グループ${grpN}件）：</b></p>`
      + list(hf.map(e => { const doc = docs.get(e.doc_id); return `<b>${esc(e.id)}</b>｜${esc(doc?.title)}（${esc(e.published)}・${esc(e.locator || '該当箇所未特定')}）：${esc(e.summary)}`; }))
      + (h.similarities ? `<p><b>類似する事実：</b>${esc(h.similarities)}</p>` : '')
      + (h.differences ? `<p><b>相違・反例：</b>${esc(h.differences)}</p>` : '')
      + `<p><b>対立仮説：</b>${esc(h.alternatives.join('、'))}</p>`
      + `<p><b>成功対照・反例案件：</b>${h.countercases.length ? esc(h.countercases.join('、')) : '<span class="muted">未特定</span>'}</p>`
      + `<p><b>現在の判断との接点：</b>${esc(h.current_relevance) || '<span class="muted">未記入</span>'}</p>`
      + `<p><b>第二層：</b>${esc(h.stage2_test)}</p>`
      + `<p class="small"><b>証拠の限界：</b>${esc(h.limits)}</p></div></div>`;
  }).join('') : '<p class="muted">根拠のある企業共通の制約仮説は、まだ形成されていません。</p>';
  return `<section class="sheet" id="sheet2"><div class="heading"><div><h2>第2票｜企業共通の成長制約仮説</h2><div class="sub">${esc(d.sheet2_subtitle || 'マップから第二層の5案件診断へ橋渡しする論点')}</div></div><div class="tag">仮説・反証可能</div></div>`
    + body + (d.sheet2_note ? `<p class="small">${esc(d.sheet2_note)}</p>` : '') + '</section>';
}

// ---------- 第3票 ----------
function renderCaseDetail(data, caseId) {
  const c = data.cases.find(x => x.id === caseId); if (!c) return '';
  const evs = indexBy(data.evidence);
  const rows = sortTimepoints(c.timepoints).map(tp => {
    if (!isAssessed(tp)) return `<tr class="unresolved"><td>${esc(tp.tp)}<br><span class="small">${esc(TP_LABELS[tp.tp])}</span></td><td>${tp.year}</td><td colspan="4"><b>判定保留</b>：${esc(tp.unresolved_reason)}<br><span class="small">${esc(tp.label)}</span></td></tr>`;
    const zones = zoneCandidates(tp).map(z => ZONES[z]).join('／');
    return `<tr><td>${esc(tp.tp)}<br><span class="small">${esc(TP_LABELS[tp.tp])}</span></td><td>${tp.year}<br><span class="small">${esc(tp.label)}</span></td>`
      + `<td><b>${fmtRange(tp.x.range)}</b> ${esc(AXIS_X.levels[tp.x.range.max])}<br><span class="small">${esc(tp.x.rationale)}</span><br>${evRefs(tp.x.evidence_ids, tp.tp === 'TF' ? null : tp.year, evs)}${tp.x.proxies?.length ? `<br><span class="small">代理指標：${esc(tp.x.proxies.join('、'))}</span>` : ''}</td>`
      + `<td><b>${fmtRange(tp.y.range)}</b> ${esc(AXIS_Y.levels[tp.y.range.max])}<br><span class="small">${esc(tp.y.rationale)}</span><br>${evRefs(tp.y.evidence_ids, tp.tp === 'TF' ? null : tp.year, evs)}${tp.y.proxies?.length ? `<br><span class="small">代理指標：${esc(tp.y.proxies.join('、'))}</span>` : ''}</td>`
      + `<td>${badge(tp.basis)}<br>確度 ${esc(CERTAINTY[tp.certainty])}${tp.link_status === 'unreviewed' ? '<br><span class="small warn">根拠リンク未精査</span>' : ''}</td><td>${esc(zones)}${isRunaway(tp) ? '<br><b>独走路（L4×L4）</b>' : ''}</td></tr>`;
  }).join('');
  const trs = c.trajectories.map(tr => {
    const a = findTp(c, tr.from), b = findTp(c, tr.to);
    const same = a && b && isAssessed(a) && isAssessed(b) && plotValue(a).x === plotValue(b).x && plotValue(a).y === plotValue(b).y;
    return `${esc(tr.from)}（${a?.year ?? '?'}）→ ${esc(tr.to)}（${b?.year ?? '?'}）：<b>${esc(TRAJ_KINDS[tr.kind].label)}</b>${same ? '｜<b>停滞（同一判定のため矢印なし）</b>' : ''}｜確度 ${esc(CERTAINTY[tr.confidence])}｜${evRefs(tr.evidence_ids, null, evs)}<br><span class="small">${esc(tr.rationale)}${tr.link_status === 'unreviewed' ? '（根拠リンク未精査）' : ''}</span>`;
  });
  const s = c.sales;
  return `<div class="detailtitle" style="color:${esc(c.color)}">${esc(c.name)}</div>`
    + `<p><b>案件範囲：</b>${esc(c.scope)}${c.start_year ? `｜事業開始 ${c.start_year}年` : ''}</p>`
    + (c.identity_note ? `<p><b>案件同一性：</b>${esc(c.identity_note)}</p>` : '')
    + `<div style="overflow:auto"><table class="tptable"><thead><tr><th>時点</th><th>西暦</th><th>横軸：${esc(AXIS_X.name)}</th><th>縦軸：${esc(AXIS_Y.name)}</th><th>区分・確度</th><th>領域候補</th></tr></thead><tbody>${rows}</tbody></table></div>`
    + `<p><b>時系列の移動：</b></p>${list(trs)}`
    + `<p><b>事業規模：</b>${esc(salesText(c))}｜${esc(s.scope)}<br><span class="small">${esc(s.note)}</span>${s.target ? `<br><span class="small">目標（円の大きさには不使用）：${s.target.year}年 ${s.target.value}${esc(s.unit)}｜${esc(s.target.scope)}｜${esc(s.target.note)}</span>` : ''}</p>`
    + `<p><b>成長の壁：</b>${esc(c.wall.text)} ${badge(c.wall.claim_type)} ${evRefs(c.wall.evidence_ids, null, evs)}${c.wall.rationale ? `<br><span class="small">${esc(c.wall.rationale)}</span>` : ''}</p>`
    + `<p><b>5Fトリガー：</b></p>` + list(c.triggers.map(tg => `<b>${esc(FACTORS[tg.factor])}</b>（${tg.status === 'hypothesis' ? 'トリガー仮説' : '探索候補'}${tg.at_tp ? `・${esc(tg.at_tp)}` : ''}）${badge(tg.claim_type)}：${esc(tg.rationale)}`
      + `<br><span class="small">対抗説明：${tg.alternatives.length ? esc(tg.alternatives.join('、')) : '未設定'}｜第二層で分かれる観察：${esc(tg.stage2_test) || '未設定'}</span>`))
    + `<p><b>Factor間の相互作用：</b></p>` + (c.interactions.length ? list(c.interactions.map(ix => `<b>${esc(FACTORS[ix.from_factor])} → ${esc(FACTORS[ix.to_factor])}</b> ${badge(ix.claim_type)}：媒介行動 ${esc(ix.mediator_behavior)}${ix.lag ? `（時間差 ${esc(ix.lag)}）` : ''} ${evRefs(ix.supporting_evidence, null, evs)}<br><span class="small">対抗説明：${esc(ix.rival_explanation)}｜反証方法：${esc(ix.falsification_test)}</span>`)) : '<p class="muted">未記録（固定順序は置かず、案件別に推論して記録する）</p>')
    + (c.factor_events.length ? `<p><b>Factorの変化イベント：</b></p>` + list(c.factor_events.map(fe => `${fe.year}｜<b>${esc(FACTORS[fe.factor])}</b> ${badge(fe.claim_type)}：${esc(fe.observation)} → ${esc(fe.interpretation)} ${evRefs(fe.evidence_ids, fe.year, evs)}`)) : '')
    + `<p><b>反証・別解釈：</b></p>` + list(c.counters.map(ct => `${esc(ct.text)} ${ct.evidence_ids.length ? evRefs(ct.evidence_ids, null, evs) : ''}`))
    + `<p><b>未確認事項：</b></p>` + list(c.unknowns.map(esc));
}

function renderCaseRefs(data, caseId) {
  const c = data.cases.find(x => x.id === caseId); if (!c) return '';
  const evs = indexBy(data.evidence), docs = indexBy(data.documents);
  const ids = caseEvidenceIds(c);
  return ids.map(id => evs.get(id)).filter(Boolean).map(e => {
    const doc = docs.get(e.doc_id), url = safeUrl(doc?.url);
    return `<div class="evidence"><b>${esc(e.id)}｜${esc(e.published)}｜${esc(doc?.title)}</b><p>${esc(e.summary)}<br>`
      + `<span class="small">対象期間：${esc(e.covers || '未記入')}｜該当箇所：${esc(e.locator || '未特定')}｜${e.verification === 'quote_verified' ? '原文照合済み' : '要約・原文未照合'}｜独立性グループ：${esc(doc?.independence_group)}</span><br>`
      + (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(doc.publisher)}</a>` : esc(doc?.publisher)) + '</p></div>';
  }).join('') + '<p class="small">出典の掲載事実と、地図上の推論座標は別管理です。「※後年」は判定時点より後に公表された資料です。</p>';
}

function renderSheet3(data, report, selected) {
  const evs = data.evidence, docs = indexBy(data.documents);
  const refBy = new Map();
  for (const c of data.cases) for (const id of caseEvidenceIds(c)) { if (!refBy.has(id)) refBy.set(id, []); refBy.get(id).push(c.name); }
  for (const h of data.constraints) for (const id of h.hard_fact_ids) { if (!refBy.has(id)) refBy.set(id, []); refBy.get(id).push(h.id); }
  const summary = data.cases.map(c => {
    const cur = currentTimepoint(c);
    return `<tr><td><b style="color:${esc(c.color)}">${esc(c.name)}</b></td>`
      + `<td>${cur ? `${fmtRange(cur.x.range)} × ${fmtRange(cur.y.range)}<br><span class="small">${esc(cur.tp)} ${cur.year}｜${esc(CLAIM_TYPES[cur.basis])}｜確度 ${esc(CERTAINTY[cur.certainty])}</span>` : '<b>判定保留</b>'}</td>`
      + `<td>${cur ? esc(zoneCandidates(cur).map(z => ZONES[z]).join('／')) : '—'}</td>`
      + `<td>${esc(salesText(c))}</td><td>${esc(c.triggers.map(t => FACTORS[t.factor]).join('／') || '未設定')}</td><td>${esc(c.wall.text)}</td></tr>`;
  }).join('');
  const ledger = evs.map(e => {
    const doc = docs.get(e.doc_id), url = safeUrl(doc?.url);
    return `<tr><td>${esc(e.id)}</td><td>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(doc?.title)}</a>` : esc(doc?.title)}<br><span class="small">${esc(doc?.publisher)}</span></td><td>${esc(e.published)}</td><td>${esc(e.covers || '—')}</td><td>${esc(e.locator || '未特定')}</td><td>${esc(e.summary)}${e.quote ? `<br><span class="small">「${esc(e.quote)}」</span>` : ''}</td><td>${e.verification === 'quote_verified' ? '照合済み' : '要約・未照合'}</td><td>${esc(doc?.independence_group)}</td><td>${esc((refBy.get(e.id) || []).join('、') || '—')}</td></tr>`;
  }).join('');
  const issues = [...report.errors.map(x => ['エラー', x]), ...report.warnings.map(x => ['警告', x])];
  return `<section class="sheet" id="sheet3"><div class="heading"><div><h2>第3票｜案件別の推論・根拠台帳</h2><div class="sub">地図の各点をクリックすると案件が選択されます。第1票・第2票と同じデータを参照しています。</div></div><div class="tag">確認事実／合理的推論／経営仮説／未確認事項を区別</div></div>`
    + `<div class="btnrow noprint" id="selectors">${data.cases.map(c => `<button data-case="${esc(c.id)}" class="${c.id === selected ? 'on' : ''}">${esc(c.name)}</button>`).join('')}</div>`
    + `<div class="data screenonly" style="margin-top:15px"><div class="panel"><h3>選択案件と判定ロジック</h3><div id="projectdetail">${renderCaseDetail(data, selected)}</div></div><div class="panel"><h3>参照資料・反証条件</h3><div id="references">${renderCaseRefs(data, selected)}</div></div></div>`
    + `<div class="printonly">${data.cases.map(c => `<div class="data printcase"><div class="panel"><h3>選択案件と判定ロジック</h3><div>${renderCaseDetail(data, c.id)}</div></div><div class="panel"><h3>参照資料・反証条件</h3><div>${renderCaseRefs(data, c.id)}</div></div></div>`).join('')}</div>`
    + `<h2 style="margin-top:24px">案件横断一覧</h2><div style="overflow:auto"><table id="summary"><thead><tr><th>案件</th><th>現在の仮説位置（横×縦）</th><th>領域候補</th><th>規模</th><th>5Fトリガー候補</th><th>主な壁の仮説</th></tr></thead><tbody>${summary}</tbody></table></div>`
    + `<h2 style="margin-top:24px">根拠台帳（全件）</h2><div style="overflow:auto"><table id="ledger"><thead><tr><th>ID</th><th>資料</th><th>公表</th><th>対象期間</th><th>該当箇所</th><th>要旨・引用</th><th>照合</th><th>独立性</th><th>参照元</th></tr></thead><tbody>${ledger}</tbody></table></div>`
    + `<h2 style="margin-top:24px">データ検証結果</h2><p class="small">エラー ${report.errors.length}件／警告 ${report.warnings.length}件／参考 ${report.info.length}件。警告は確度・監査上の注意であり、推論を確定事実へ昇格させるものではありません。</p>`
    + (issues.length ? `<div style="overflow:auto"><table id="issues"><thead><tr><th>区分</th><th>コード</th><th>箇所</th><th>内容</th></tr></thead><tbody>${issues.map(([k, x]) => `<tr class="${k === 'エラー' ? 'err' : ''}"><td>${k}</td><td>${esc(x.code)}</td><td>${esc(x.path)}</td><td>${esc(x.message)}</td></tr>`).join('')}</tbody></table></div>` : '')
    + (report.info.length ? `<details class="small"><summary>参考情報（${report.info.length}件）</summary><ul>${report.info.map(x => `<li>${esc(x.code)}｜${esc(x.path)}｜${esc(x.message)}</li>`).join('')}</ul></details>` : '')
    + `<div class="btnrow noprint" style="margin-top:14px"><button data-action="export-json">分析データ（JSON）を書き出す</button><button data-action="export-svg">第1票の図（SVG）を書き出す</button><button data-action="print">第1〜3票を印刷／PDF保存</button></div></section>`;
}

function renderDocument(data, report, state = {}) {
  const selected = state.selected && data.cases.some(c => c.id === state.selected) ? state.selected : data.cases[0].id;
  const map = renderMap(data, state.opts);
  const footer = data.display.footer_note || 'ローカル版：ブラウザ内で同一JSONから第1〜3票を生成しています。公開情報の収集・自動推論AIは未接続です。';
  return {
    html: renderSheet1(data, map.svg, map.layout) + renderSheet2(data) + renderSheet3(data, report, selected) + `<p class="small">${esc(footer)}</p>`,
    map, selected
  };
}

// V1.3：第1票の配置モデル（企業・案件数に依存しない）。
// 分析上の座標（評価幅の中点＝plotValue）・評価幅・売上の円面積はV1.2と同じ規則で求め、変更しない。
// 密集を5種類（円どうし／円とラベル／評価幅の枠／矢印どうし／円・矢印・ラベルの相互）で検出し、
// 解消できない重なりをもつ案件群だけを「集約グループ」にまとめる（表示上の処理。データは変更しない）。


const G = MAP_GEOM, CW = G.gw / 4, CH = G.gh / 4;
const X = v => G.x0 + (v - 0.5) * CW;
const Y = v => G.y0 + G.gh - (v - 0.5) * CH;
// 対応表は地図の右に置き、集約があるときだけSVGの横幅を広げる（地図の座標計算は変えない）
const PANEL = { x: 672, y: G.y0, w: 328, h: G.gh };
const WIDTH_WITH_PANEL = 1010;
const THRESHOLDS = {
  circlePad: 3,       // 円どうしの最小間隔（px）
  bandIoU: 0.6,       // 評価幅の枠の重なり（IoU）がこれ以上、かつ
  bandNear: 24,       // 分析上の位置の距離がこれ以下なら、集約の対象
  arrowNear: 4,       // 矢印どうしの最短距離（px）
  shapeArrowPad: 3,   // 円と他案件の矢印の間隔（px）
  maxLeader: 48,      // ラベルを点から離してよい最大距離（px）。超えたら配置失敗
  hullPad: 16,        // 集約マーカーの余白（売上の大きさは使わない）
  inlineNos: 3        // 集約マーカーの中に番号を書くのは、この件数以下のグループだけ（それより多ければ番号は対応表へ）
};
// 集約グループの色（地図の枠・バッジ、対応表の見出し、拡大一覧の見出しで共通。案件の色とは別の系統）
const GROUP_COLORS = ['#3d5d78', '#8a5a2b', '#4c6d32', '#6b4c8a', '#2f6f73', '#8a3f55', '#5b5b5b'];
const UNC = { low: [33, 23], low_mid: [29, 20], mid: [24, 17], mid_high: [18, 13], high: [0, 0] };
const LABEL_H = 34;
const LABEL_FONT = { name: 14, wall: 12 };

const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const iou = (a, b) => { const i = overlap(a, b); return i ? i / (a.w * a.h + b.w * b.h - i) : 0; };
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
function pointSeg(p, s) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p.x - s.x1) * dx + (p.y - s.y1) * dy) / L)) : 0;
  return Math.hypot(p.x - (s.x1 + t * dx), p.y - (s.y1 + t * dy));
}
function segSeg(a, b) {
  const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const A = { x: a.x1, y: a.y1 }, B = { x: a.x2, y: a.y2 }, C = { x: b.x1, y: b.y1 }, D = { x: b.x2, y: b.y2 };
  const d1 = cross(C, D, A), d2 = cross(C, D, B), d3 = cross(A, B, C), d4 = cross(A, B, D);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(pointSeg(A, b), pointSeg(B, b), pointSeg(C, a), pointSeg(D, a));
}
const segBox = s => ({ x: Math.min(s.x1, s.x2) - 2, y: Math.min(s.y1, s.y2) - 2, w: Math.abs(s.x2 - s.x1) + 4, h: Math.abs(s.y2 - s.y1) + 4 });

const circled = n => (n >= 1 && n <= 20 ? String.fromCodePoint(0x2460 + n - 1) : `(${n})`);

// 案件ごとの表示要素（分析上の位置・評価幅・円・矢印・時系列）
function buildModel(data, display = {}) {
  const vmax = salesScaleMax(data);
  const shortWall = id => display.short_walls?.[id] ?? null;
  const cases = data.cases.map(c => {
    const cur = currentTimepoint(c);
    const timeline = sortTimepoints(c.timepoints).filter(t => t.tp !== 'TF').map(t => ({
      tp: t.tp, year: t.year, status: t.status, x: t.x.range ?? null, y: t.y.range ?? null, certainty: t.certainty,
      reason: t.unresolved_reason ?? null, point: isAssessed(t) ? { x: X(plotValue(t).x), y: Y(plotValue(t).y) } : null
    }));
    const base = { id: c.id, name: c.name, color: c.color, sales: c.sales, wall: c.wall.text, short_wall: shortWall(c.id), timeline };
    if (!cur) return { ...base, held: true };
    const p = plotValue(cur);
    const anchor = { x: X(p.x), y: Y(p.y) };
    const circle = hasSalesCircle(c);
    const r = circle ? radiusFor(c.sales.value, vmax) : 11;
    const spanX = cur.x.range.max > cur.x.range.min, spanY = cur.y.range.max > cur.y.range.min;
    const [ux, uy] = UNC[cur.certainty];
    const bw = spanX ? (cur.x.range.max - cur.x.range.min + 1) * CW - CW * 0.45 : 2 * Math.max(ux, 22);
    const bh = spanY ? (cur.y.range.max - cur.y.range.min + 1) * CH - CH * 0.45 : 2 * Math.max(uy, 16);
    const band = { x: anchor.x - bw / 2, y: anchor.y - bh / 2, w: bw, h: bh, rect: spanX || spanY };
    const pts = new Map(timeline.filter(t => t.point).map(t => [t.tp, t.point]));
    const arrows = c.trajectories.map(tr => ({ ...tr, a: pts.get(tr.from), b: pts.get(tr.to) }))
      .filter(tr => tr.a && tr.b && dist(tr.a, tr.b) >= 1)
      .map(tr => ({ from: tr.from, to: tr.to, kind: tr.kind, x1: tr.a.x, y1: tr.a.y, x2: tr.b.x, y2: tr.b.y }));
    return { ...base, held: false, tp: cur.tp, formal: { x: { ...cur.x.range }, y: { ...cur.y.range } }, certainty: cur.certainty,
      plot: { ...p }, anchor, r, kind: circle ? 'circle' : 'diamond', band, arrows };
  });
  const years = data.cases.filter(hasSalesCircle).map(c => c.sales.fiscal_year);
  // 規模の比較に使う年度：円を描く売上で最も多い年度（同数なら新しい年度）
  const count = y => years.filter(v => v === y).length;
  const scale_year = [...new Set(years)].sort((a, b) => count(b) - count(a) || (b ?? 0) - (a ?? 0))[0] ?? null;
  return { cases, vmax, base_year: [...new Set(years)], scale_year };
}

function labelText(c) {
  const name = c.name;
  const w = c.short_wall ? `${c.short_wall.type ? c.short_wall.type + '：' : ''}${c.short_wall.label}` : c.wall;
  return { name, wall: w, w: Math.max(textWidth(name, LABEL_FONT.name), textWidth(w, LABEL_FONT.wall)) + 4, h: LABEL_H };
}

// ラベルの配置（V1.2と同じ考え方に、最大距離と障害物の拡張を加える）
function placeLabels(items, obstacles, bounds) {
  const placed = [], result = [];
  for (const s of [...items].sort((a, b) => b.r - a.r)) {
    const t = labelText(s);
    let best = null, bestScore = Infinity, bestHard = Infinity;
    for (const step of [0, 10, 22, 36]) for (const [dx, dy] of [[1, 0], [1, -1], [1, 1], [-1, 0], [-1, -1], [-1, 1], [0, -1], [0, 1]]) {
      const x = s.anchor.x + dx * (s.r + 5 + step) - (dx < 0 ? t.w : dx === 0 ? t.w / 2 : 0);
      const y = s.anchor.y + dy * (s.r + 3 + step) - (dy < 0 ? t.h : dy === 0 ? t.h / 2 : 0);
      const b = { x, y, w: t.w, h: t.h };
      let hard = 0, soft = 0;
      if (b.x < bounds.x || b.x + b.w > bounds.x + bounds.w || b.y < bounds.y || b.y + b.h > bounds.y + bounds.h) hard += 1e5;
      for (const p of placed) hard += overlap(b, p.box);
      for (const o of obstacles) if (o.owner !== s.id) (o.soft ? (soft += overlap(b, o.box)) : (hard += overlap(b, o.box)));
      const score = hard * 10 + soft + step * 0.5;
      if (score < bestScore) { bestScore = score; bestHard = hard; best = { box: b, step }; }
    }
    const nx = Math.max(best.box.x, Math.min(s.anchor.x, best.box.x + best.box.w)), ny = Math.max(best.box.y, Math.min(s.anchor.y, best.box.y + best.box.h));
    const gap = Math.hypot(nx - s.anchor.x, ny - s.anchor.y) - s.r;
    const blockers = bestHard > 0 ? obstacles.filter(o => o.owner !== s.id && !o.soft && overlap(best.box, o.box) > 0).map(o => o.owner)
      .concat(placed.filter(p => overlap(best.box, p.box) > 0).map(p => p.id)) : [];
    const entry = { id: s.id, box: best.box, text: t, leader: gap > 10 ? { x1: s.anchor.x, y1: s.anchor.y, x2: nx, y2: ny, r: s.r } : null, failed: bestHard > 0 || gap > THRESHOLDS.maxLeader, blockers: [...new Set(blockers.filter(Boolean))] };
    placed.push({ id: s.id, box: best.box });
    result.push(entry);
  }
  return result;
}

// 表示中の要素どうしの重なりを数える（5種類）
function detectConflicts(visible, labels = []) {
  const out = [];
  for (let i = 0; i < visible.length; i++) for (let j = i + 1; j < visible.length; j++) {
    const a = visible[i], b = visible[j];
    const d = dist(a.anchor, b.anchor);
    if (d < a.r + b.r + THRESHOLDS.circlePad) out.push({ type: 'circle', a: a.id, b: b.id, amount: a.r + b.r - d });
    const v = iou(a.band, b.band);
    if (v > 0) out.push({ type: 'band', a: a.id, b: b.id, amount: v, strong: v >= THRESHOLDS.bandIoU && d <= THRESHOLDS.bandNear });
    for (const sa of a.arrows) for (const sb of b.arrows) if (segSeg(sa, sb) < THRESHOLDS.arrowNear) out.push({ type: 'arrow', a: a.id, b: b.id });
    for (const [p, q] of [[a, b], [b, a]]) for (const s of q.arrows) if (pointSeg(p.anchor, s) < p.r + THRESHOLDS.shapeArrowPad) out.push({ type: 'shape_arrow', a: p.id, b: q.id });
  }
  for (const l of labels) {
    for (const c of visible) if (c.id !== l.id && overlap(l.box, { x: c.anchor.x - c.r, y: c.anchor.y - c.r, w: 2 * c.r, h: 2 * c.r }) > 0) out.push({ type: 'label_shape', a: l.id, b: c.id });
    for (const m of labels) if (m.id > l.id && overlap(l.box, m.box) > 0) out.push({ type: 'label_label', a: l.id, b: m.id });
    for (const c of visible) for (const s of c.arrows) if (c.id !== l.id && overlap(l.box, segBox(s)) > 0) out.push({ type: 'label_arrow', a: l.id, b: c.id });
    if (l.failed) out.push({ type: 'label_failed', a: l.id, b: l.blockers[0] ?? null });
  }
  return out;
}

const HARD = new Set(['circle', 'label_shape', 'label_label', 'label_failed', 'shape_arrow']);

// 集約の決定：解消できない重なり（円の重なり・ラベルの配置失敗・円と他案件の矢印・強い評価幅の重なり）で結ばれる案件群を集約する。
// 集約した案件の円・矢印・評価幅は地図に描かないので、残った要素で重なりを測り直し、解消するまで繰り返す。
function computeLayout(data, display = {}, opts = {}) {
  const model = buildModel(data, display);
  const all = model.cases.filter(c => !c.held);
  const byId = new Map(all.map(c => [c.id, c]));
  const usePanel = opts.panel !== false;
  const mapBounds = { x: G.x0 + 2, y: G.y0 + 2, w: G.gw - 4, h: G.gh - 4 };
  const zoneBoxes = (opts.zoneBoxes || []).map(b => ({ box: b, soft: true, owner: null }));
  const parent = new Map(all.map(c => [c.id, c.id]));
  const find = x => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
  const initial = { conflicts: null };
  let clusters = [], visible = all, labels = [], conflicts = [], hulls = [], groupsNow = [];
  let stage = 0;
  for (let iter = 0; iter < 24; iter++) {
    const groups = new Map();
    for (const c of all) { const r = find(c.id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(c); }
    clusters = [...groups.values()].filter(g => g.length > 1);
    const clustered = new Set(clusters.flat().map(c => c.id));
    visible = all.filter(c => !clustered.has(c.id));
    hulls = clusters.map(g => hullOf(g));
    groupsNow = makeGroups(clusters, hulls, model.scale_year);
    // 集約の判断はV1.3と同じ（枠の上に件数のバッジ1行分を確保）。規模つきのバッジは集約の決定後に空いた場所へ置く
    const obstacles = [
      ...visible.map(c => ({ owner: c.id, box: { x: c.anchor.x - c.r - 1, y: c.anchor.y - c.r - 1, w: 2 * c.r + 2, h: 2 * c.r + 2 } })),
      ...visible.flatMap(c => c.arrows.map(s => ({ owner: c.id, box: segBox(s), soft: true }))),
      ...hulls.map((h, i) => ({ owner: clusters[i][0].id, box: { x: h.x, y: h.y - 16, w: h.w, h: h.h + 16 } })),
      ...zoneBoxes
    ];
    // 集約がなければ右側の余白までラベルを置ける（V1.2と同じ）。集約があれば右側は対応表に使う
    const bounds = clusters.length && usePanel ? mapBounds : { x: G.x0 + 2, y: G.y0 + 2, w: G.W - G.x0 - 4, h: G.gh - 4 };
    labels = placeLabels(visible, obstacles, bounds);
    conflicts = detectConflicts(visible, labels);
    if (!initial.conflicts) initial.conflicts = detectConflicts(all, placeLabels(all, all.map(c => ({ owner: c.id, box: { x: c.anchor.x - c.r, y: c.anchor.y - c.r, w: 2 * c.r, h: 2 * c.r } })), mapBounds));
    // 集約マーカーと表示中の円の重なりも解消の対象にする
    const hullHits = [];
    for (const [i, h] of hulls.entries()) for (const c of visible) if (overlap(h, { x: c.anchor.x - c.r, y: c.anchor.y - c.r, w: 2 * c.r, h: 2 * c.r }) > 0) hullHits.push([clusters[i][0].id, c.id]);
    for (const [i, h] of hulls.entries()) for (const [k, h2] of hulls.entries()) if (k > i && overlap(h, h2) > 0) hullHits.push([clusters[i][0].id, clusters[k][0].id]);
    // 1回目は円どうし・強い評価幅の重なりだけで集約し、2回目以降は残った要素でラベル・矢印との重なりを測り直す
    // （集約した案件の矢印は地図に描かないため、それによる重なりで別の案件を巻き込まない）
    const first = stage === 0;
    const edges = conflicts.filter(x => x.b && (first ? x.type === 'circle' || (x.type === 'band' && x.strong) : HARD.has(x.type) || (x.type === 'band' && x.strong)))
      .map(x => [x.a, x.b]).concat(hullHits);
    let changed = false;
    for (const [a, b] of edges) {
      if (!a || !b || !byId.has(a) || !byId.has(b)) continue;
      const ra = find(a), rb = find(b);
      if (ra !== rb) { parent.set(ra, rb); changed = true; }
    }
    if (!changed) { if (stage === 0) { stage = 1; continue; } break; }
  }
  const groups = groupsNow;
  const badges = placeBadges(groups, visible, [...zoneBoxes.map(z => z.box), ...labels.map(l => l.box), ...labels.filter(l => l.leader).map(l => segBox(l.leader))]);
  for (const g of groups) g.badge = badges[g.id];
  const no = new Map(groups.flatMap(g => g.members.map(m => [m.id, m.no])));
  return {
    model, visible: visible.map(c => c.id), groups, labels, panel: usePanel && groups.length ? PANEL : null,
    conflicts: { initial: summarize(initial.conflicts), final: summarize(conflicts) },
    numbering: Object.fromEntries(no)
  };
}

// 集約グループ。G番号は地図の読み順（上の行から、同じ高さなら左から）で、対応表の並びと点線の交差を減らす。
// 案件の番号は集約された案件の通し番号
function makeGroups(clusters, hulls, year) {
  let n = 0;
  const order = clusters.map((g, i) => i).sort((a, b) => hulls[a].y - hulls[b].y || hulls[a].x - hulls[b].x);
  return order.map(k => [clusters[k], hulls[k]]).map(([g, hull], i) => {
    const members = g.map(c => ({ id: c.id, no: ++n })), no = new Map(members.map(m => [m.id, m.no]));
    return {
      id: `G${i + 1}`, members, hull, dots: dotsOf(g, id => no.get(id)), color: GROUP_COLORS[i % GROUP_COLORS.length],
      scale: groupScale(g, year), range: groupRange(g), inline_nos: g.length <= THRESHOLDS.inlineNos
    };
  });
}

// 集約グループの文言（地図のバッジ・対応表・拡大一覧で共通）。売上は合計しない
const oku = v => `約${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}億円`;
const groupTitle = g => `${g.id}｜${g.members.length}件`;
function scaleText(sc, short = false) {
  const parts = [sc.max ? `最大${oku(sc.max.value)}${sc.max.type === 'reference' ? '（参考値）' : ''}` : '比較できる売上なし'];
  if (sc.undisclosed) parts.push(short ? '非開示あり' : `非開示${sc.undisclosed}件`);
  if (sc.not_comparable) parts.push(short ? '比較不可あり' : `年度違い・比較不可${sc.not_comparable}件`);
  return parts.join('・');
}
const BADGE_FONT = { head: 13, scale: 12 }, DOT_FONT = 13;
const hitV13 = (a, b) => Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);
const gapV13 = (a, b) => Math.hypot(Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w)), Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h)));
const growV13 = (b, p) => ({ x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p });
// 集約マーカーの中の番号の範囲（少数のグループだけ番号を書く）
function dotLabelBoxes(g) {
  return g.inline_nos ? g.dots.map(d => ({ x: d.x + 4, y: d.y - 4 - DOT_FONT, w: textWidth(d.nos.map(circled).join(''), DOT_FONT) + 2, h: DOT_FONT + 3 })) : [];
}
// バッジ：枠の上下左右から、他の要素・他グループの枠（余白つき）に重ならない位置を選ぶ（位置に判定の意味はない）。
// 規模つきの2行で置けなければ件数だけの1行にする（規模は対応表の見出しにある）。
// 全グループの組み合わせで「規模つきで置ける数」と「他グループからの離れ具合（60pxで頭打ち）」が最もよい配置を選ぶ。
function placeBadges(groups, visible, blocks = []) {
  const inMap = b => b.x >= G.x0 + 2 && b.y >= G.y0 + 2 && b.x + b.w <= G.x0 + G.gw - 2 && b.y + b.h <= G.y0 + G.gh - 2;
  const fixed = [...blocks, ...visible.map(c => ({ x: c.anchor.x - c.r - 2, y: c.anchor.y - c.r - 2, w: 2 * c.r + 4, h: 2 * c.r + 4 })),
    ...visible.flatMap(c => c.arrows.map(segBox))];
  const marks = g => [g.hull, ...dotLabelBoxes(g)];
  const shortText = g => `${g.id}・${g.members.length}件`;
  const candidates = groups.map(g => {
    const own = marks(g), right = Math.max(...own.map(b => b.x + b.w)), others = groups.filter(o => o !== g).flatMap(marks);
    const blockers = [...fixed, ...own, ...groups.filter(o => o !== g).flatMap(o => [growV13(o.hull, 10), ...dotLabelBoxes(o).map(b => growV13(b, 6))])];
    const list = [];
    for (const full of [true, false]) {
      const lines = full ? [groupTitle(g), scaleText(g.scale, true)] : [shortText(g)];
      const w = Math.max(textWidth(lines[0], BADGE_FONT.head), lines[1] ? textWidth(lines[1], BADGE_FONT.scale) : 0) + 12, ht = full ? 36 : 18, h = g.hull;
      const spots = [[h.x, h.y - ht - 2], [h.x + h.w - w, h.y - ht - 2], [h.x, h.y + h.h + 2], [h.x + h.w - w, h.y + h.h + 2], [right + 4, h.y], [h.x - w - 4, h.y]];
      spots.forEach(([x, y], k) => {
        const b = { x, y, w, h: ht };
        if (!inMap(b) || blockers.some(o => hitV13(b, o))) return;
        const gap = Math.min(60, ...others.map(o => gapV13(b, o)));
        list.push({ box: b, lines, full, score: (full ? 100 : 0) + gap - k * 0.1 });
      });
    }
    return list.sort((a, b) => b.score - a.score);
  });
  // 組み合わせの探索（件数が多い場合は探索数を制限し、それまでの最良を使う）
  let best = null, bestScore = -Infinity, nodes = 0;
  const pick = new Array(groups.length).fill(null);
  (function dfs(i, score, used) {
    if (++nodes > 50000 || score + (groups.length - i) * 160 <= bestScore) return;
    if (i === groups.length) { if (score > bestScore) { bestScore = score; best = pick.slice(); } return; }
    for (const c of candidates[i]) {
      if (used.some(u => hitV13(growV13(c.box, 3), u))) continue;
      pick[i] = c; dfs(i + 1, score + c.score, [...used, c.box]);
    }
    pick[i] = null; dfs(i + 1, score - 50, used);   // 置けない場合（枠の左上に件数だけ）
  })(0, 0, []);
  const out = {};
  groups.forEach((g, i) => {
    const c = best?.[i];
    out[g.id] = c ? { ...c.box, lines: c.lines, full: c.full }
      : { x: g.hull.x, y: g.hull.y - 18, w: textWidth(shortText(g), BADGE_FONT.head) + 12, h: 18, lines: [shortText(g)], full: false };
  });
  return out;
}

// 集約グループの規模：件数・最大案件の売上（同一年度の実績／図表読取参考値だけで比較）・非開示の件数。
// 売上の重複範囲を確認できないため、グループの合計は出さない。
function groupScale(g, year) {
  const comparable = g.filter(c => (c.sales.type === 'actual' || c.sales.type === 'reference') && typeof c.sales.value === 'number' && c.sales.value > 0 && c.sales.fiscal_year === year);
  const top = comparable.reduce((m, c) => (!m || c.sales.value > m.sales.value ? c : m), null);
  const undisclosed = g.filter(c => c.sales.type === 'undisclosed').length;
  return {
    count: g.length, year,
    max: top ? { value: top.sales.value, type: top.sales.type, case_id: top.id } : null,
    undisclosed, not_comparable: g.length - comparable.length - undisclosed
  };
}
// 集約グループの正式判定の範囲（構成案件の評価幅の最小〜最大。表示の要約で、判定値を新たに作るものではない）
function groupRange(g) {
  const lo = k => Math.min(...g.map(c => c.formal[k].min)), hi = k => Math.max(...g.map(c => c.formal[k].max));
  return { x: { min: lo('x'), max: hi('x') }, y: { min: lo('y'), max: hi('y') }, same: g.every(c => JSON.stringify(c.formal) === JSON.stringify(g[0].formal)) };
}

function hullOf(g) {
  const xs = g.map(c => c.anchor.x), ys = g.map(c => c.anchor.y), p = THRESHOLDS.hullPad;
  let x = Math.min(...xs) - p, y = Math.min(...ys) - p, w = Math.max(...xs) - Math.min(...xs) + 2 * p, h = Math.max(...ys) - Math.min(...ys) + 2 * p;
  if (w < 36) { x -= (36 - w) / 2; w = 36; } if (h < 36) { y -= (36 - h) / 2; h = 36; }
  return { x, y, w, h };
}
// 分析上の位置が同じ案件は1つの点にまとめ、番号を並べる
function dotsOf(g, noOf) {
  const m = new Map();
  for (const c of g) { const k = `${Math.round(c.anchor.x)},${Math.round(c.anchor.y)}`; if (!m.has(k)) m.set(k, { x: c.anchor.x, y: c.anchor.y, ids: [] }); m.get(k).ids.push(c.id); }
  return [...m.values()].map(d => ({ ...d, nos: d.ids.map(noOf) }));
}
function summarize(list) {
  const s = { circle: 0, label_shape: 0, label_label: 0, label_failed: 0, band: 0, arrow: 0, shape_arrow: 0, label_arrow: 0 };
  for (const c of list || []) s[c.type] = (s[c.type] || 0) + 1;
  return s;
}

// V1.3：第1票の地図（SVG文字列）。背景・配色・線種はV1.2を継承し、密集部は集約マーカーと対応表で表示する。
// 表示上の分離（対応表・拡大一覧の位置）は判定値ではないことを明示する。分析データは変更しない。



{ scaleText, groupTitle };

const GM = MAP_GEOM, CWD = GM.gw / 4, CHT = GM.gh / 4;
const r1 = v => Math.round(v * 10) / 10;
const attrsV13 = o => Object.entries(o).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
const el = (name, a, inner) => (inner === undefined ? `<${name}${attrsV13(a)}/>` : `<${name}${attrsV13(a)}>${inner}</${name}>`);
const FONT_V13 = '"Yu Gothic","Meiryo",system-ui,sans-serif';

const salesShort = s => (s.type === 'actual' || s.type === 'reference') && typeof s.value === 'number'
  ? `約${s.value >= 10 ? Math.round(s.value) : r1(s.value)}億円${s.fiscal_year ? `（${s.fiscal_year}）` : ''}` : s.type === 'not_comparable' ? '比較不可' : '売上非開示';
const groupRangeText = g => `${g.range.same ? '全件' : '範囲'} 横${fmtRange(g.range.x)}×縦${fmtRange(g.range.y)}`;
// 対応表の売上：基準年度（注記に記載）と同じなら年度を省く
const salesPanel = (s, year) => (s.fiscal_year && s.fiscal_year === year ? salesShort({ ...s, fiscal_year: null }) : salesShort(s));
const formalText = c => (c.held ? '判定保留' : `横${fmtRange(c.formal.x)}×縦${fmtRange(c.formal.y)}`);
const wallShort = c => (c.short_wall ? `${c.short_wall.type ? c.short_wall.type + '：' : ''}${c.short_wall.label}` : c.wall);

// 時系列の変化の要約（正式判定の変化だけを書き、需要や売上の増減は含めない）
function changeSummary(c) {
  const out = [];
  const tl = c.timeline;
  for (const t of tl) if (t.status !== 'assessed') out.push(`${t.tp}（${t.year}）評価不能`);
  const as = tl.filter(t => t.status === 'assessed');
  for (let i = 1; i < as.length; i++) {
    const a = as[i - 1], b = as[i], dx = fmtRange(a.x) !== fmtRange(b.x), dy = fmtRange(a.y) !== fmtRange(b.y);
    if (!dx && !dy) out.push(`${a.tp}→${b.tp} 停滞`);
    else out.push(`${a.tp}→${b.tp} ${dx ? `横${fmtRange(a.x)}→${fmtRange(b.x)}` : ''}${dx && dy ? '・' : ''}${dy ? `縦${fmtRange(a.y)}→${fmtRange(b.y)}` : ''}`);
  }
  return out.length ? out.join('／') : '時点は1つ';
}
// 対応表用の短い要約（変化のある区間と評価不能だけ）
function changeShort(c) {
  const parts = changeSummary(c).split('／').filter(p => !p.endsWith('停滞'));
  return parts.length ? parts.join('／') : '時系列：変化なし（停滞）';
}

function background(out) {
  const { x0, y0, gw, gh } = GM;
  const r = (x, y, w, h, fill, more = {}) => out.push(el('rect', { x, y, width: w, height: h, fill, ...more }));
  r(x0, y0, gw, gh, '#eff2f3', { rx: 5 }); r(x0, y0, gw / 2, gh / 2, '#e3eeee'); r(x0, y0 + gh / 2, gw / 2, gh / 2, '#edf0e9');
  r(x0 + gw / 2, y0 + gh / 2, gw / 2, gh / 2, '#f5edf0'); r(x0 + gw / 2, y0, gw / 2, gh / 2, '#f3eadf');
  r(x0 + 3 * CWD, y0, CWD, CHT, '#e9c793', { stroke: '#a77737', 'stroke-width': 2, class: 'runaway-core' });
  for (let i = 0; i <= 4; i++) {
    out.push(el('line', { x1: x0 + CWD * i, y1: y0, x2: x0 + CWD * i, y2: y0 + gh, stroke: '#b6c7cb' }));
    out.push(el('line', { x1: x0, y1: y0 + CHT * i, x2: x0 + gw, y2: y0 + CHT * i, stroke: '#b6c7cb' }));
  }
  for (let i = 1; i <= 4; i++) {
    out.push(el('text', { x: x0 + (i - 0.5) * CWD, y: y0 + gh + 21, fill: '#506677', 'font-size': 13, 'text-anchor': 'middle' }, 'L' + i));
    out.push(el('text', { x: x0 - 14, y: y0 + gh - (i - 0.5) * CHT + 5, fill: '#506677', 'font-size': 13, 'text-anchor': 'end' }, 'L' + i));
  }
  out.push(el('text', { x: x0 + gw / 2, y: 590, fill: '#19384c', 'font-size': 15, 'text-anchor': 'middle', 'font-weight': 600 }, esc(`${AXIS_X.name}（${AXIS_X.levels[1]} → ${AXIS_X.levels[4]}） →`)));
  out.push(el('text', { x: 18, y: y0 + gh / 2, fill: '#19384c', 'font-size': 15, 'text-anchor': 'middle', 'font-weight': 600, transform: `rotate(-90 18 ${y0 + gh / 2})` }, esc(`${AXIS_Y.name} →`)));
}
function zoneLabels(out) {
  const { x0, y0 } = GM;
  const halo = { 'paint-order': 'stroke', stroke: '#ffffff', 'stroke-width': 3, 'stroke-opacity': 0.6, 'pointer-events': 'none' };
  const t = (x, y, s, size, color, more = {}) => out.push(el('text', { x, y, fill: color, 'font-size': size, ...halo, ...more }, esc(s)));
  t(x0 + 40, 85, ZONES.wilderness, 18, '#45626b', { 'font-weight': 700 });
  t(x0 + 46, 310, ZONES.showroom, 18, '#49665d', { 'font-weight': 700 });
  t(x0 + CWD * 2 + 47, 310, ZONES.taken_field, 18, '#765c65', { 'font-weight': 700 });
  t(x0 + CWD * 2 + 28, 86, ZONES.runaway_band, 17, '#8c6a41', { 'font-weight': 700 });
  t(x0 + 3 * CWD + CWD / 2, y0 + 45, ZONES.runaway, 18, '#744b28', { 'text-anchor': 'middle', 'font-weight': 700 });
  t(x0 + 3 * CWD + CWD / 2, y0 + 65, 'L4 × L4', 12, '#744b28', { 'text-anchor': 'middle' });
}
const zoneLabelBoxes = () => {
  const { x0 } = GM;
  return [[x0 + 40, 85, ZONES.wilderness, 18], [x0 + 46, 310, ZONES.showroom, 18], [x0 + CWD * 2 + 47, 310, ZONES.taken_field, 18], [x0 + CWD * 2 + 28, 86, ZONES.runaway_band, 17]]
    .map(([x, y, s, z]) => ({ x, y: y - z, w: textWidth(s, z), h: z + 4 }));
};

function shapeSvg(c, cx, cy, r, extra = {}) {
  const ref = c.sales.type === 'reference';
  if (c.kind === 'circle' || (r && c.sales && (c.sales.type === 'actual' || ref) && c.sales.value)) {
    return el('circle', { cx: r1(cx), cy: r1(cy), r: Math.round(r * 1000) / 1000, fill: c.color, 'fill-opacity': ref ? 0.78 : 0.84, stroke: '#fff', 'stroke-width': 2, ...extra })
      + (ref ? el('circle', { cx: r1(cx), cy: r1(cy), r: r1(r + 2.4), fill: 'none', stroke: c.color, 'stroke-width': 1, 'stroke-dasharray': '3 2' }) : '');
  }
  return el('polygon', { points: `${r1(cx)},${r1(cy - 10)} ${r1(cx + 10)},${r1(cy)} ${r1(cx)},${r1(cy + 10)} ${r1(cx - 10)},${r1(cy)}`, fill: c.color, stroke: '#fff', 'stroke-width': 2, ...extra });
}
function arrowSvg(c, s, out, dim = false) {
  const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1); if (len < 1) return;
  const ux = (s.x2 - s.x1) / len, uy = (s.y2 - s.y1) / len, sr = 6, er = (s.to === c.tp ? c.r : 5) + 3;
  if (len <= sr + er + 2) return;
  const ax = s.x1 + ux * sr, ay = s.y1 + uy * sr, bx = s.x2 - ux * er, by = s.y2 - uy * er;
  out.push(el('line', { x1: r1(ax), y1: r1(ay), x2: r1(bx), y2: r1(by), stroke: c.color, 'stroke-width': 2.6, 'stroke-dasharray': TRAJ_KINDS[s.kind].dash, opacity: dim ? 0.35 : 0.9, class: `traj traj-${s.kind}`, 'data-case': c.id }));
  const ang = Math.atan2(by - ay, bx - ax), L = 9;
  out.push(el('polygon', { points: [[bx, by], [bx - L * Math.cos(ang - 0.5), by - L * Math.sin(ang - 0.5)], [bx - L * Math.cos(ang + 0.5), by - L * Math.sin(ang + 0.5)]].map(p => p.map(r1).join(',')).join(' '), fill: c.color, opacity: dim ? 0.35 : 1 }));
}
function timelineSvg(c, out) {
  for (const t of c.timeline) if (t.point && t.tp !== c.tp) {
    out.push(el('circle', { cx: r1(t.point.x), cy: r1(t.point.y), r: 5, fill: c.color, opacity: 0.35, stroke: c.color, 'stroke-width': 1.2 }));
    out.push(el('text', { x: r1(t.point.x - 10), y: r1(t.point.y - 9), fill: c.color, 'font-size': 10 }, esc(String(t.year).slice(2))));
  }
  for (const s of c.arrows) arrowSvg(c, s, out);
}
function bandSvg(c, out, strong = false) {
  const b = c.band;
  if (b.rect) out.push(el('rect', { x: r1(b.x), y: r1(b.y), width: r1(b.w), height: r1(b.h), rx: 12, fill: c.color, 'fill-opacity': strong ? 0.08 : 0.05, stroke: c.color, 'stroke-width': strong ? 1.6 : 1.1, 'stroke-dasharray': '4 4', class: 'uncertainty' }));
  else if (b.w) out.push(el('ellipse', { cx: r1(c.anchor.x), cy: r1(c.anchor.y), rx: r1(b.w / 2), ry: r1(b.h / 2), fill: c.color, 'fill-opacity': 0.05, stroke: c.color, 'stroke-width': 1.1, 'stroke-dasharray': '4 4', class: 'uncertainty' }));
}

// 右側の対応表。集約グループごとに、色・見出し（件数）・規模（最大案件の売上・非開示）を示し、構成案件を続ける。
// 印刷で読める文字の大きさを保つため文字は縮めず、収まり具合で表示を3段階に切り替える。
//  full＝案件ごとに円（地図と同じ縮尺）・正式判定・売上・成長の壁／compact＝案件ごとに1行（売上は数値）／summary＝グループの要約と案件名
// 個別の時系列と詳細は「密集部の拡大一覧」に置く。
const PANEL_FONT = { title: 15, head: 14, name: 14.5, line: 13, sub: 12.5 };
const fitText = (str, size, w) => { let t = str; while (t.length > 1 && textWidth(t, size) > w) t = t.slice(0, -1); return t === str ? t : t.slice(0, -1) + '…'; };
function panelSvg(layout, out, st = {}) {
  const P = PANEL, F = PANEL_FONT, byId = new Map(layout.model.cases.map(c => [c.id, c]));
  const innerW = P.w - 6, bottom = P.y + P.h - 20, top = P.y + 46;
  const HEAD = 44, ROW = 20, rowFull = c => Math.max(2 * (c.kind === 'circle' ? c.r : 10) + 8, 56);
  const wrapNames = g => {
    const lines = []; let cur = '';
    for (const m of g.members) {
      const t = `${circled(m.no)}${byId.get(m.id).name}`, nx = cur ? `${cur}　${t}` : t;
      if (cur && textWidth(nx, F.line) > innerW) { lines.push(cur); cur = t; } else cur = nx;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const need = mode => layout.groups.reduce((h, g) => h + HEAD + 10 + (mode === 'full' ? g.members.reduce((x, m) => x + rowFull(byId.get(m.id)), 0)
    : mode === 'compact' ? g.members.length * ROW : ROW + wrapNames(g).length * ROW), 0);
  const mode = need('full') <= bottom - top ? 'full' : need('compact') <= bottom - top ? 'compact' : 'summary';
  const sub = { full: '判定は正式値。円は地図と同じ縮尺', compact: '判定は正式値。売上は数値で表示（円は拡大一覧）', summary: 'グループの位置と規模。案件ごとの数値は拡大一覧' }[mode];
  const bg = [], fg = [];
  bg.push(el('rect', { x: P.x - 8, y: P.y, width: P.w + 10, height: P.h, rx: 8, fill: '#ffffff', stroke: '#c9d6dd', class: 'v13-panel' }));
  fg.push(el('text', { x: P.x, y: P.y + 19, fill: '#19384c', 'font-size': F.title, 'font-weight': 700 }, '密集部の対応表'));
  fg.push(el('text', { x: P.x, y: P.y + 37, fill: '#596a7b', 'font-size': F.sub }, esc(sub)));
  let y = top, shown = 0, stop = false;
  const heads = {}, total = layout.groups.reduce((n, g) => n + g.members.length, 0);
  for (const g of layout.groups) {
    if (stop || y + HEAD > bottom) break;
    const y0 = y, part = [];
    heads[g.id] = y + 10;
    const title = groupTitle(g), tw = textWidth(title, F.head) + 14;
    part.push(el('rect', { x: P.x, y, width: r1(tw), height: 21, rx: 10, fill: g.color, 'data-group': g.id, style: 'cursor:pointer', class: 'v13-panel-head' }));
    part.push(el('text', { x: P.x + 7, y: y + 15, fill: '#fff', 'font-size': F.head, 'font-weight': 700, 'data-group': g.id, style: 'cursor:pointer' }, esc(title)));
    part.push(el('text', { x: P.x + 2, y: y + 38, fill: g.color, 'font-size': F.line, 'font-weight': 700 }, esc(fitText(scaleText(g.scale), F.line, innerW))));
    y += HEAD + 4;
    if (mode === 'summary') {
      part.push(el('text', { x: P.x + 2, y: y + 13, fill: '#2b3d4c', 'font-size': F.line }, esc(groupRangeText(g))));
      y += ROW;
      for (const line of wrapNames(g)) {
        if (y + ROW > bottom) { stop = true; break; }
        part.push(el('text', { x: P.x + 2, y: y + 13, fill: '#2b3d4c', 'font-size': F.line }, esc(line)));
        shown += (line.match(/[①-⑳]|\(\d+\)/g) || []).length; y += ROW;
      }
    } else for (const m of g.members) {
      const c = byId.get(m.id), h = mode === 'full' ? rowFull(c) : ROW;
      if (y + h > bottom) { stop = true; break; }
      if (mode === 'full') {
        const rr = c.kind === 'circle' ? c.r : 10, symW = Math.max(2 * rr + 6, 28), tx = P.x + symW + 6, w = P.x + P.w - tx - 4, ty = y + h / 2 - 17;
        part.push(shapeSvg(c, P.x + symW / 2, y + h / 2, rr, { 'data-case': c.id, style: 'cursor:pointer' }));
        part.push(el('text', { x: r1(tx), y: r1(ty + 4), fill: c.color, 'font-size': F.name, 'font-weight': 700, 'data-case': c.id, style: 'cursor:pointer' }, esc(fitText(`${circled(m.no)} ${c.name}`, F.name, w))));
        part.push(el('text', { x: r1(tx), y: r1(ty + 22), fill: '#2b3d4c', 'font-size': F.line }, esc(fitText(`${formalText(c)}｜${salesPanel(c.sales, layout.model.scale_year)}`, F.line, w))));
        part.push(el('text', { x: r1(tx), y: r1(ty + 39), fill: '#596a7b', 'font-size': F.sub }, esc(fitText(wallShort(c), F.sub, w))));
      } else {
        const rest = `　${formalText(c)}｜${salesShort(c.sales)}`, nm = fitText(`${circled(m.no)} ${c.name}`, F.line, Math.max(70, innerW - textWidth(rest, F.line)));
        part.push(el('text', { x: P.x + 2, y: y + 14, fill: '#2b3d4c', 'font-size': F.line, 'data-case': c.id, style: 'cursor:pointer' }, el('tspan', { fill: c.color, 'font-weight': 700 }, esc(nm)) + esc(rest)));
      }
      shown++; y += h;
    }
    if (st.expanded === g.id) bg.push(el('rect', { x: P.x - 4, y: y0 - 3, width: P.w + 2, height: y - y0 + 4, rx: 6, fill: g.color, 'fill-opacity': 0.1, stroke: g.color, 'stroke-width': 1.2, class: 'v13-panel-hit' }));
    fg.push(`<g data-panel-group="${esc(g.id)}"${st.expanded && st.expanded !== g.id ? ' opacity="0.4"' : ''}>${part.join('')}</g>`);
    y += 10;
  }
  if (shown < total) fg.push(el('text', { x: P.x, y: P.y + P.h - 6, fill: '#a12d2d', 'font-size': F.sub }, esc(`ほか${total - shown}件は「密集部の拡大一覧」に記載`)));
  out.push(...bg, ...fg);
  return { mode, compact: mode !== 'full', shown, total, heads };
}

// state: { selected: 案件ID|null, expanded: グループID|null, uncertainty: true }
function renderMapV13(data, display = {}, state = {}) {
  const st = { uncertainty: true, ...state };
  const layout = computeLayout(data, display, { zoneBoxes: zoneLabelBoxes() });
  const byId = new Map(layout.model.cases.map(c => [c.id, c]));
  const vis = layout.visible.map(id => byId.get(id));
  const base = [], top = [], zones = [], labels = [];
  background(base);
  if (st.uncertainty) for (const c of vis) bandSvg(c, base);
  for (const c of vis) timelineSvg(c, base);
  // 集約マーカー：正式判定の位置を点で示し、売上の大きさは使わない。グループの色で地図・対応表・拡大一覧を対応させる
  for (const g of layout.groups) {
    const h = g.hull, on = st.expanded === g.id, b = g.badge;
    base.push(el('rect', { x: r1(h.x), y: r1(h.y), width: r1(h.w), height: r1(h.h), rx: 10, fill: on ? g.color : '#ffffff', 'fill-opacity': on ? 0.14 : 0.72, stroke: g.color, 'stroke-width': on ? 2.8 : 1.6, 'stroke-dasharray': '5 3', class: 'v13-cluster', 'data-group': g.id, style: 'cursor:pointer' }, el('title', {}, esc(`${groupTitle(g)}・${scaleText(g.scale)}（クリックで詳細）`))));
    for (const d of g.dots) {
      base.push(el('circle', { cx: r1(d.x), cy: r1(d.y), r: 3.8, fill: g.color, 'data-group': g.id }));
      // 番号は少数のグループだけ枠の中に書く（多い場合は対応表と拡大一覧の番号で追う）
      if (g.inline_nos) base.push(el('text', { x: r1(d.x + 5), y: r1(d.y - 4), fill: g.color, 'font-size': DOT_FONT, 'font-weight': 700, 'data-group': g.id, style: 'cursor:pointer', 'paint-order': 'stroke', stroke: '#fff', 'stroke-width': 3 }, esc(d.nos.map(circled).join(''))));
    }
    base.push(el('rect', { x: r1(b.x), y: r1(b.y), width: r1(b.w), height: b.h, rx: 7, fill: on ? '#ffffff' : g.color, stroke: g.color, 'stroke-width': 1.4, 'data-group': g.id, style: 'cursor:pointer', class: 'v13-badge' }));
    b.lines.forEach((t, i) => base.push(el('text', { x: r1(b.x + 6), y: r1(b.y + 14 + i * 17), fill: on ? g.color : '#fff', 'font-size': i ? BADGE_FONT.scale : BADGE_FONT.head, 'font-weight': 700, 'data-group': g.id, style: 'cursor:pointer' }, esc(t))));
  }
  for (const c of vis) {
    const tip = `${c.name}｜${c.tp}：${formalText(c)}｜${salesShort(c.sales)}`;
    top.push(shapeSvg(c, c.anchor.x, c.anchor.y, c.r, { 'data-case': c.id, class: `case-shape shape-${c.kind}`, style: 'cursor:pointer' }).replace(/\/>/, `>${el('title', {}, esc(tip))}</${c.kind === 'circle' ? 'circle' : 'polygon'}>`));
  }
  zoneLabels(zones);
  for (const l of layout.labels) {
    const c = byId.get(l.id);
    if (l.leader) { const L = l.leader, len = Math.hypot(L.x2 - L.x1, L.y2 - L.y1) || 1; labels.push(el('line', { x1: r1(L.x1 + (L.x2 - L.x1) / len * (L.r + 1)), y1: r1(L.y1 + (L.y2 - L.y1) / len * (L.r + 1)), x2: r1(L.x2), y2: r1(L.y2), stroke: c.color, 'stroke-width': 1, opacity: 0.75, class: 'leader' })); }
    labels.push(el('text', { x: r1(l.box.x + 2), y: r1(l.box.y + 14), fill: c.color, 'font-size': LABEL_FONT.name, 'font-weight': 700, 'data-case': c.id, style: 'cursor:pointer' }, esc(l.text.name)));
    labels.push(el('text', { x: r1(l.box.x + 2), y: r1(l.box.y + 30), fill: c.color, 'font-size': LABEL_FONT.wall }, esc(l.text.wall)));
  }
  const panel = [];
  const panelInfo = layout.panel ? panelSvg(layout, panel, st) : null;
  // 集約マーカーから対応表の見出しへの点線（対応を示すだけで、位置の意味はない）
  if (panelInfo) for (const g of layout.groups) if (panelInfo.heads[g.id] !== undefined)
    { const sx = Math.max(g.hull.x + g.hull.w, g.badge.x + g.badge.w), sy = g.badge.x + g.badge.w >= g.hull.x + g.hull.w ? g.badge.y + g.badge.h / 2 : g.hull.y + g.hull.h / 2;
    panel.unshift(el('path', { d: `M${r1(sx)},${r1(sy)} C${r1(PANEL.x - 40)},${r1(sy)} ${r1(PANEL.x - 40)},${r1(panelInfo.heads[g.id])} ${r1(PANEL.x - 8)},${r1(panelInfo.heads[g.id])}`, fill: 'none', stroke: g.color, 'stroke-opacity': st.expanded === g.id ? 0.95 : 0.55, 'stroke-width': st.expanded === g.id ? 2 : 1.1, 'stroke-dasharray': '3 3', class: 'v13-connector', 'data-group': g.id })); }
  // 選択した案件の時系列だけを強調（他は淡色）。集約されていても正式判定の位置に描く
  const sel = st.selected ? byId.get(st.selected) : null;
  const focus = [];
  if (sel && !sel.held) {
    bandSvg(sel, focus, true); timelineSvg(sel, focus);
    focus.push(shapeSvg(sel, sel.anchor.x, sel.anchor.y, sel.r, { 'data-case': sel.id, class: 'v13-selected' }));
    focus.push(el('text', { x: GM.x0 + 6, y: GM.y0 + GM.gh - 8, fill: '#19384c', 'font-size': 11, 'font-weight': 700 }, esc(`選択中：${sel.name}（時系列は正式判定の位置。${changeSummary(sel)}）`)));
  }
  const dim = sel ? ' opacity="0.28"' : '';
  const W = panelInfo ? WIDTH_WITH_PANEL : GM.W;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${GM.H}" role="img" aria-label="${esc(data.metadata.company)}｜成長必然性マップ" font-family="${esc(FONT_V13)}">`
    + el('rect', { x: 0, y: 0, width: W, height: GM.H, fill: '#ffffff' })
    + `<g class="v13-base"${dim}>${base.join('')}${top.join('')}${labels.join('')}</g>${zones.join('')}${panel.join('')}${focus.join('')}</svg>`;
  return { svg, layout, panel: panelInfo };
}

// V1.3：第1票（経営者向け）と、その補足（密集部の拡大一覧）・付録（分析メタデータ）のHTML。
// 第2票・第3票はV1.2の描画（src/render.js）をそのまま使う。企業固有の文面は表示データ（data/v1_3/）から読む。





const badgeV13 = t => `<span class="ct ct-${esc(t)}">${esc(CLAIM_TYPES[t] || t)}</span>`;

// 表示データの検証（企業固有の文面が推論結果に紐づいているか）
function checkDisplay(display, schema, data) {
  const errors = checkSchema(schema, display).map(e => `${e.path} ${e.message}`);
  if (errors.length) return { ok: false, errors };
  const cases = new Set(data.cases.map(c => c.id)), cons = new Set(data.constraints.map(h => h.id)), evs = new Set(data.evidence.map(e => e.id));
  for (const id of Object.keys(display.short_walls)) if (!cases.has(id)) errors.push(`short_walls：データにない案件 ${id}`);
  for (const i of [...display.insights, display.takeaway]) {
    for (const h of i.constraint_ids) if (!cons.has(h)) errors.push(`${i.id ?? 'takeaway'}：データにない共通制約仮説 ${h}`);
    for (const e of i.evidence_ids || []) if (!evs.has(e)) errors.push(`${i.id}：データにない根拠 ${e}`);
    for (const c of i.case_ids || []) if (!cases.has(c)) errors.push(`${i.id}：データにない案件 ${c}`);
  }
  return { ok: errors.length === 0, errors };
}

function periodLabel(data) { return `${data.metadata.period.from}–${data.metadata.period.to}`; }

function renderSheet1V13(data, display, state = {}, interactive = false) {
  const map = renderMapV13(data, display, state);
  const year = map.layout.model.base_year.filter(Boolean).join('・');
  const line = dash => `<svg width="26" height="8" aria-hidden="true"><line x1="1" y1="4" x2="25" y2="4" stroke="#6b7c8a" stroke-width="2.4"${dash ? ` stroke-dasharray="${dash}"` : ''}/></svg>`;
  const held = map.layout.model.cases.filter(c => c.held);
  const notes = [
    `<b>軸</b>：横＝${esc(AXIS_X.name)}（顧客にとっての不可欠性）／縦＝${esc(AXIS_Y.name)}。L1〜L4で判定し、独走路はL4×L4のみ。`,
    `<b>円</b>：面積＝${year ? `${esc(year)}年度の` : ''}製品別売上（破線の輪郭は参考値）。◆＝売上非開示。`,
    `<b>線</b>：${Object.values(TRAJ_KINDS).map(k => `${line(k.dash)}${esc(k.label)}`).join('　')}。需要の増減だけの変化は矢印にしない。`,
    `<b>評価幅</b>：点線の枠。判定は未検証の推論を含む（根拠・対抗仮説は第3票）。${map.layout.groups.length ? '<b>G</b>＝密集部の集約。点は正式判定の位置で、色・番号は右の対応表と補足の拡大一覧に対応。規模はグループ内で最大の案件の売上（合計はしない）。' : ''}${held.length ? `判定保留：${held.map(c => esc(c.name)).join('・')}。` : ''}`
  ];
  const controls = interactive ? `<div class="controls noprint"><label>案件の時系列を表示：<select id="v13-select"><option value="">（選択なし）</option>${data.cases.map(c => `<option value="${esc(c.id)}"${state.selected === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>`
    + `<label><input id="v13-unc" type="checkbox"${state.uncertainty === false ? '' : ' checked'}> 評価幅</label><button data-v13="clear">選択を解除</button></div>`
    + `<div id="v13-detail" class="noprint v13-detail">${state.expanded ? renderGroupDetail(map.layout, state.expanded) : state.selected ? renderCaseTimeline(map.layout, state.selected) : '<p class="small">地図の集約マーカー（G）や案件をクリックすると、案件の一覧・正式判定・時系列を表示します。</p>'}</div>` : '';
  const html = `<section class="sheet" id="sheet1"><div class="heading"><div><h1>${esc(data.metadata.company)}｜成長必然性マップ</h1>`
    + `<div class="sub">${esc(display.header.analysis_label)}｜${esc(periodLabel(data))}</div></div></div>`
    + `<div class="bodygrid"><div><div class="graphbox" id="mapbox">${map.svg}</div>`
    + `<div class="v13-notes small">${notes.map(n => `<div>${n}</div>`).join('')}</div>${controls}</div>`
    + `<aside class="side"><h3>この1枚から見えること</h3>`
    + display.insights.map((ins, i) => `<div class="insight"><b>${'①②③'[i] || ''} ${esc(ins.title)} ${badgeV13(ins.claim_type)}</b>${esc(ins.text)}</div>`).join('')
    + `<div class="takeaway">${esc(display.takeaway.label)}：<br>${esc(display.takeaway.text)}</div></aside></div></section>`;
  return { html, map };
}

function renderGroupDetail(layout, groupId) {
  const g = layout.groups.find(x => x.id === groupId); if (!g) return '';
  const byId = new Map(layout.model.cases.map(c => [c.id, c]));
  return `<div class="v13-box" style="border-color:${esc(g.color)};border-left:5px solid ${esc(g.color)}"><b style="color:${esc(g.color)}">${esc(groupTitle(g))}</b>　<b>${esc(scaleText(g.scale))}</b>　<span class="small">${esc(groupRangeText(g))}｜密集のため集約。点は正式判定の位置で、下の一覧の並びは表示上の分離です。</span> <button data-sup="${esc(g.id)}">拡大一覧で見る</button>`
    + `<table class="v13-table"><thead><tr><th>No.</th><th>案件</th><th>正式判定（評価幅）</th><th>売上</th><th>成長の壁</th><th>時系列</th><th></th></tr></thead><tbody>`
    + g.members.map(m => { const c = byId.get(m.id); return `<tr><td>${circled(m.no)}</td><td><b style="color:${esc(c.color)}">${esc(c.name)}</b></td><td>${esc(c.tp)}：${esc(formalText(c))}<br><span class="small">確度 ${esc(CERTAINTY[c.certainty])}</span></td><td>${esc(salesShort(c.sales))}</td><td>${esc(wallShort(c))}</td><td class="small">${esc(changeSummary(c))}</td><td><button data-case="${esc(c.id)}">時系列</button> <button data-goto="${esc(c.id)}">第3票</button></td></tr>`; }).join('')
    + '</tbody></table></div>';
}

function renderCaseTimeline(layout, caseId) {
  const c = layout.model.cases.find(x => x.id === caseId); if (!c) return '';
  return `<div class="v13-box"><b style="color:${esc(c.color)}">${esc(c.name)}</b> <span class="small">${esc(salesShort(c.sales))}｜成長の壁：${esc(wallShort(c))}</span>`
    + `<table class="v13-table"><thead><tr><th>時点</th><th>年</th><th>正式判定</th><th>確度</th></tr></thead><tbody>`
    + c.timeline.map(t => `<tr><td>${esc(t.tp)}</td><td>${t.year}</td><td>${t.status === 'assessed' ? `横${esc(fmtRange(t.x))}×縦${esc(fmtRange(t.y))}` : `評価不能：${esc(t.reason || '')}`}</td><td>${t.status === 'assessed' ? esc(CERTAINTY[t.certainty]) : '—'}</td></tr>`).join('')
    + `</tbody></table><p class="small">変化：${esc(changeSummary(c))}（移動の理由と根拠は第3票）　<button data-goto="${esc(c.id)}">第3票で根拠を見る</button></p></div>`;
}

// 第1票の補足：全案件の一覧と、集約グループの拡大図（表示上の分離）
// 並びは地図の集約グループ（G1, G2…）順、続いて通常表示・判定保留。グループの見出しは地図・対応表と同じ色。
// state.expanded（HTMLで選択中のグループ）の行を強調する。
function renderSupplement(layout, state = {}) {
  const all = layout.model.cases;
  const no = layout.numbering;
  const byId = new Map(all.map(c => [c.id, c]));
  const row = (c, g) => `<tr${g ? ` data-group="${esc(g.id)}"` : ''}${g && state.expanded === g.id ? ` class="v13-hit" style="background:${esc(g.color)}14"` : ''}><td${g ? ` style="border-left:4px solid ${esc(g.color)}"` : ''}>${no[c.id] ? circled(no[c.id]) : '—'}</td><td><b style="color:${esc(c.color)}">${esc(c.name)}</b></td><td>${g ? `<b style="color:${esc(g.color)}">${esc(g.id)}</b>` : c.held ? '判定保留' : '通常表示'}</td><td>${c.held ? '判定保留' : `${esc(c.tp)}：${esc(formalText(c))}`}</td><td>${esc(salesShort(c.sales))}</td><td>${esc(wallShort(c))}</td><td class="small">${esc(changeSummary(c))}</td></tr>`;
  const grouped = new Set(layout.groups.flatMap(g => g.members.map(m => m.id)));
  const rows = layout.groups.map(g => `<tr id="sup-${esc(g.id)}" class="v13-grouphead" data-group="${esc(g.id)}" style="cursor:pointer"><td colspan="7" style="background:${esc(g.color)}${state.expanded === g.id ? '33' : '14'};border-left:4px solid ${esc(g.color)}"><b style="color:${esc(g.color)}">${esc(groupTitle(g))}</b>　${esc(scaleText(g.scale))}　<span class="small">${esc(groupRangeText(g))}</span></td></tr>`
    + g.members.map(m => row(byId.get(m.id), g)).join('')).join('')
    + all.filter(c => !grouped.has(c.id)).map(c => row(c, null)).join('');
  const exploded = layout.groups.map(g => {
    const ms = g.members.map(m => byId.get(m.id));
    // 案件ごとの幅は文字の長さから決め、隣と重ならないようにする
    const step = Math.max(130, ...ms.map(c => Math.max(textWidth(formalText(c), 11), textWidth(salesShort(c.sales), 11), textWidth(wallShort(c), 10.5)) + 20, ...ms.map(c => 2 * c.r + 20)));
    const W = Math.max(600, ms.length * step), H = 165;
    const parts = ms.map((c, i) => {
      const cx = (W / ms.length) * i + W / ms.length / 2, cy = 58, r = c.kind === 'circle' ? c.r : 10;
      const shape = c.kind === 'circle'
        ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${esc(c.color)}" fill-opacity="0.8" stroke="#fff" stroke-width="2"/>`
        : `<polygon points="${cx},${cy - 10} ${cx + 10},${cy} ${cx},${cy + 10} ${cx - 10},${cy}" fill="${esc(c.color)}"/>`;
      return shape + `<text x="${cx}" y="${cy + 46}" text-anchor="middle" font-size="12" font-weight="700" fill="${esc(c.color)}">${esc(circled(no[c.id]) + ' ' + c.name)}</text>`
        + `<text x="${cx}" y="${cy + 62}" text-anchor="middle" font-size="11" fill="#2b3d4c">${esc(formalText(c))}</text>`
        + `<text x="${cx}" y="${cy + 77}" text-anchor="middle" font-size="11" fill="#2b3d4c">${esc(salesShort(c.sales))}</text>`
        + `<text x="${cx}" y="${cy + 92}" text-anchor="middle" font-size="10.5" fill="#596a7b">${esc(wallShort(c))}</text>`;
    }).join('');
    return `<h3 style="margin:16px 0 6px"><span style="color:${esc(g.color)}">${esc(groupTitle(g))}</span>の拡大図 <span class="small">${esc(scaleText(g.scale))}。表示上の分離で、横の並びは判定値ではない。円は第1票と同じ縮尺</span></h3>`
      + `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;background:#fafcfd;border:1.5px dashed ${esc(g.color)};border-radius:8px" font-family='"Yu Gothic","Meiryo",sans-serif'>${parts}</svg>`;
  }).join('');
  return `<section class="sheet" id="sheet1-supplement"><div class="heading"><div><h2>第1票 補足｜密集部の拡大一覧</h2><div class="sub">第1票で集約表示した案件を含む全案件の正式判定・売上・成長の壁・時系列</div></div><div class="tag">表示上の補足</div></div>`
    + `<div style="overflow:auto"><table><thead><tr><th>No.</th><th>案件</th><th>表示</th><th>正式判定（現在）</th><th>売上</th><th>成長の壁</th><th>時系列の変化</th></tr></thead><tbody>${rows}</tbody></table></div>${exploded}</section>`;
}

// 付録：分析の版数・AI推論の工程・レビュー記録（経営者向けの第1票からは除外）
function renderAppendix(data) {
  const m = data.metadata;
  return `<section class="sheet" id="appendix"><h2>付録｜分析メタデータ</h2><table><tbody>`
    + `<tr><th>分析データの版</th><td>${esc(m.version)}</td></tr><tr><th>データの状態</th><td>${esc(m.data_status)}（人のレビュー前の推論を含む）</td></tr>`
    + `<tr><th>作成主体</th><td>${esc(m.producer)}：${esc(m.producer_note || '')}</td></tr><tr><th>基準日</th><td>${esc(m.asof)}</td></tr></tbody></table>`
    + `<h3 style="margin-top:16px">処理の記録</h3><table><thead><tr><th>日付</th><th>主体</th><th>処理</th><th>内容</th></tr></thead><tbody>`
    + data.review_log.map(r => `<tr><td>${esc(r.date)}</td><td>${esc(r.actor)}</td><td>${esc(r.action)}</td><td class="small">${esc(r.detail)}</td></tr>`).join('') + '</tbody></table></section>';
}

function renderDocumentV13(data, display, report, state = {}, interactive = false) {
  const s1 = renderSheet1V13(data, display, state, interactive);
  const selected = state.sheet3 && data.cases.some(c => c.id === state.sheet3) ? state.sheet3 : data.cases[0].id;
  return { html: s1.html + renderSupplement(s1.map.layout, state) + renderSheet2(data) + renderSheet3(data, report, selected) + renderAppendix(data), map: s1.map };
}

// V1.3 HTML版の操作：集約グループの展開、案件の時系列の強調表示、第3票への移動、書き出し・印刷。
// 表示の状態だけを変え、分析データは変更しない。


const v13 = window.__V13__;
const v13State = { selected: null, expanded: null, uncertainty: true, sheet3: null };
const $v13 = id => document.getElementById(id);

function v13Render(scrollTo) {
  $v13('app').innerHTML = renderDocumentV13(v13.data, v13.display, v13.report, v13State, true).html;
  if (scrollTo) $v13(scrollTo)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function v13Download(name, content, mime) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type: mime })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}

$v13('app').addEventListener('click', e => {
  const t = e.target.closest('[data-v13],[data-goto],[data-action],[data-sup],[data-group],[data-case]');
  if (!t) return;
  if (t.dataset.v13 === 'clear') { Object.assign(v13State, { selected: null, expanded: null }); return v13Render(); }
  // 地図・対応表のグループと、拡大一覧の同じグループを連動して強調する
  if (t.dataset.sup) { Object.assign(v13State, { expanded: t.dataset.sup, selected: null }); return v13Render(`sup-${t.dataset.sup}`); }
  if (t.closest('#sheet1-supplement') && t.dataset.group) { Object.assign(v13State, { expanded: t.dataset.group, selected: null }); return v13Render('sheet1'); }
  if (t.dataset.goto) { v13State.sheet3 = t.dataset.goto; return v13Render('sheet3'); }
  if (t.dataset.action) {
    const id = v13.data.metadata.company_id;
    if (t.dataset.action === 'export-json') v13Download(`${id}_layer1.json`, JSON.stringify(v13.data, null, 2), 'application/json');
    if (t.dataset.action === 'export-svg') v13Download(`${id}_growth_map_v1_3.svg`, '<?xml version="1.0" encoding="UTF-8"?>\n' + renderMapV13(v13.data, v13.display, { uncertainty: true }).svg, 'image/svg+xml');
    if (t.dataset.action === 'print') window.print();
    return;
  }
  if (t.closest('#sheet3') && t.dataset.case) { v13State.sheet3 = t.dataset.case; return v13Render('sheet3'); }
  if (t.dataset.group) { Object.assign(v13State, { expanded: t.dataset.group, selected: null }); return v13Render(); }
  if (t.dataset.case) { Object.assign(v13State, { selected: t.dataset.case, expanded: null }); return v13Render(); }
});
$v13('app').addEventListener('change', e => {
  if (e.target.id === 'v13-select') { Object.assign(v13State, { selected: e.target.value || null, expanded: null }); v13Render(); }
  if (e.target.id === 'v13-unc') { v13State.uncertainty = e.target.checked; v13Render(); }
});
v13Render();

})();
