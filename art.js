// 插圖畫派：同一個主題固定生成一幅「風景」（天空、太陽、山丘、水面或地面），
// 再依畫派用不同畫法畫出來。和介面風格（themes.css）分開，可以任意搭配。
// 依賴 app.js 的 rng()、hash()（執行時才呼叫，載入順序不影響）。

const ART_SCHOOLS = [
  ['auto', '跟隨介面風格', '用目前介面風格的畫法'],
  ['impressionism', '印象派', '短而快的筆觸並排，捕捉光線在某一瞬間的感覺，代表人物是莫內（《印象・日出》）。'],
  ['fauvism', '野獸派', '用不自然的強烈色彩表達情緒，天空可以是紅的、山可以是紫的，代表人物是馬諦斯。'],
  ['pointillism', '點描派', '用一顆顆純色小點並排，讓眼睛自己在遠處混色，代表人物是秀拉。'],
  ['cubism', '立體派', '把物體切成幾何碎面，同時呈現好幾個角度，代表人物是畢卡索和布拉克。'],
  ['abstract', '抽象派', '不畫具體的東西，只用點、線、面和顏色本身說話，代表人物是康丁斯基。'],
  ['destijl', '風格派', '只用水平、垂直的黑線和紅黃藍三原色，代表人物是蒙德里安。'],
  ['ukiyoe', '浮世繪', '平塗色塊、清楚的輪廓線、天空由深藍漸淡，代表人物是北齋和廣重。'],
  ['pop', '普普藝術', '借用漫畫和廣告印刷的網點、粗黑框和飽和色，代表人物是李奇登斯坦。'],
];
const ART_NAME = Object.fromEntries(ART_SCHOOLS.map(([k, n]) => [k, n]));
const ART_DESC = Object.fromEntries(ART_SCHOOLS.map(([k, , d]) => [k, d]));
const ART_TOPIC = { impressionism: 'impressionism' }; // 畫派有對應主題的，主題頁說明會連過去

// ---------- 顏色工具 ----------
const hx = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgb = ([r, g, b]) => `rgb(${r | 0},${g | 0},${b | 0})`;
const mixc = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const jit = (c, r, n) => c.map(v => Math.max(0, Math.min(255, v + (r() - 0.5) * 2 * n)));
const WHITE = [255, 255, 255];

// 筆刷收集器：顏色量化後同色同粗細的筆觸合成一條 path
function brushes() {
  const m = new Map();
  const q = v => Math.max(0, Math.min(255, Math.round(v / 26) * 26)).toString(16).padStart(2, '0');
  return {
    add(c, w, seg) { const k = '#' + c.map(q).join('') + '|' + w; m.set(k, (m.get(k) || '') + seg); },
    out(extra = '') { let o = ''; for (const [k, d] of m) { const [col, w] = k.split('|'); o += `<path d="${d}" stroke="${col}" stroke-width="${w}" stroke-linecap="round" fill="none" ${extra}/>`; } return o; },
  };
}

// ---------- 每個主題一幅固定的風景 ----------
const SCENE_COL = {
  knowledge: { skyTop: '#6f98cc', skyLow: '#d4e3f0', sun: '#f2c14e', hill: '#2f5a8a', water: '#3f6fa8', ground: '#4a6b4f' },
  hobby: { skyTop: '#ec9550', skyLow: '#fbe3c2', sun: '#e4572e', hill: '#8a3b2b', water: '#c76a3a', ground: '#9c5a2f' },
  experience: { skyTop: '#93c28b', skyLow: '#eef2c8', sun: '#f08a24', hill: '#3f6b3a', water: '#4f8f86', ground: '#6c8a3a' },
};
function sceneOf(t) {
  const r = rng(hash(t.id + 'scene'));
  const hy = 160 + r() * 50;
  const sun = { x: 60 + r() * 280, y: 48 + r() * 62, r: 24 + r() * 18 };
  const water = r() > 0.45;
  const hills = [0, 1].map(() => ({ cx: r() * 400, w: 70 + r() * 110, h: 30 + r() * 60 }));
  const ridge = x => hy - Math.max(...hills.map(h => h.h * Math.exp(-(((x - h.cx) / h.w) ** 2))));
  const col = Object.fromEntries(Object.entries(SCENE_COL[t.cat]).map(([k, v]) => [k, hx(v)]));
  const region = (x, y) => {
    if ((x - sun.x) ** 2 + (y - sun.y) ** 2 < sun.r ** 2) return 'sun';
    if (y < ridge(x)) return 'sky';
    if (y < hy) return 'hill';
    return water ? 'water' : 'ground';
  };
  const colorAt = (x, y) => {
    const g = region(x, y);
    if (g === 'sky') return mixc(col.skyTop, col.skyLow, Math.min(1, y / hy));
    if (g === 'water') { const near = Math.abs(x - sun.x) < sun.r * 1.1 && y < hy + 90; return near ? mixc(col.water, col.sun, 0.55) : mixc(col.water, col.skyLow, (300 - y) / 300 * 0.35); }
    return col[g];
  };
  const ridgePath = (step = 10) => { let d = `M0 ${ridge(0).toFixed(1)}`; for (let x = step; x <= 400; x += step) d += ` L${x} ${ridge(x).toFixed(1)}`; return d + ` L400 ${hy} L0 ${hy}Z`; };
  return { r, hy, sun, water, hills, ridge, region, colorAt, col, ridgePath };
}

// ---------- 各畫派 ----------
const ART = {
  impressionism(t, s) { // 短筆觸並排、亮色、水面倒影（同色筆觸合成一條 path，圖檔才不會太大）
    const r = s.r, B = brushes();
    for (let y = -6; y < 306; y += 11) for (let x = -6; x < 406; x += 11) {
      const px = x + (r() - 0.5) * 9, py = y + (r() - 0.5) * 9, g = s.region(px, py);
      const c = jit(mixc(s.colorAt(px, py), WHITE, 0.12 + r() * 0.12), r, 26);
      const ang = (g === 'water' ? (r() - 0.5) * 14 : g === 'hill' ? -35 + (r() - 0.5) * 40 : g === 'sun' ? r() * 360 : -18 + (r() - 0.5) * 50) * Math.PI / 180;
      const len = (g === 'water' ? 9 : 6) + r() * 6, dx = Math.cos(ang) * len, dy = Math.sin(ang) * len;
      B.add(c, r() < 0.5 ? 7 : 9, `M${Math.round(px - dx)} ${Math.round(py - dy)}l${Math.round(dx * 2)} ${Math.round(dy * 2)}`);
    }
    for (let i = 0; i < 26; i++) { const a = r() * Math.PI * 2, d = s.sun.r * (1 + r() * 0.9); B.add(mixc(s.col.sun, WHITE, 0.45), 5, `M${Math.round(s.sun.x + Math.cos(a) * d)} ${Math.round(s.sun.y + Math.sin(a) * d)}l8 -3`); }
    return `<rect width="400" height="300" fill="${rgb(s.col.skyLow)}"/>` + B.out('opacity=".88"');
  },
  pointillism(t, s) { // 純色小點、夾雜互補色（零長度線段＋圓頭＝圓點）
    const r = s.r, B = brushes();
    for (let y = 2; y < 300; y += 8.5) for (let x = 2; x < 400; x += 8.5) {
      const px = x + (r() - 0.5) * 4, py = y + (r() - 0.5) * 4;
      let c = s.colorAt(px, py);
      const k = r();
      if (k < 0.14) c = c.map(v => 255 - v * 0.6); // 互補色點
      else if (k < 0.3) c = mixc(c, WHITE, 0.45);
      B.add(jit(c, r, 18), r() < 0.5 ? 6 : 8, `M${Math.round(px)} ${Math.round(py)}h0`);
    }
    return `<rect width="400" height="300" fill="#f6f1e4"/>` + B.out();
  },
  fauvism(t, s) { // 不自然的強烈色彩、粗筆刷、暗色輪廓
    const r = s.r, i = { knowledge: 0, hobby: 1, experience: 2 }[t.cat];
    const P = { sky: ['#ff6a3d', '#2bb3a3', '#ffcf3d'][i], sky2: ['#ffb03d', '#7d3fbf', '#ff5d8f'][i], hill: ['#7b3fbf', '#e2366f', '#2e7dd7'][i], sun: ['#3ddc84', '#ffe14d', '#ff3d9a'][i], low: ['#2e7dd7', '#ff9f1c', '#14b87a'][i] };
    let o = `<rect width="400" height="300" fill="${P.sky}"/><rect y="${(s.hy * 0.5).toFixed(0)}" width="400" height="${(s.hy * 0.5).toFixed(0)}" fill="${P.sky2}" opacity=".75"/>`;
    o += `<rect y="${s.hy}" width="400" height="${300 - s.hy}" fill="${P.low}"/>`;
    o += `<path d="${s.ridgePath(16)}" fill="${P.hill}" stroke="#24123d" stroke-width="6" stroke-linejoin="round"/>`;
    for (let k = 0; k < 90; k++) {
      const x = r() * 400, y = r() * 300, g = s.region(x, y);
      const base = hx({ sky: y < s.hy * 0.5 ? P.sky : P.sky2, hill: P.hill, sun: P.sun, water: P.low, ground: P.low }[g]);
      const c = jit(mixc(base, k % 3 ? WHITE : [20, 10, 40], 0.22), r, 40), a = (g === 'water' || g === 'ground' ? 0 : -25) + (r() - 0.5) * 30, l = 18 + r() * 22;
      o += `<line x1="${(x - l).toFixed(0)}" y1="${y.toFixed(0)}" x2="${(x + l).toFixed(0)}" y2="${y.toFixed(0)}" transform="rotate(${a.toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})" stroke="${rgb(c)}" stroke-width="${(10 + r() * 10).toFixed(0)}" stroke-linecap="round" opacity=".55"/>`;
    }
    o += `<circle cx="${s.sun.x.toFixed(0)}" cy="${s.sun.y.toFixed(0)}" r="${s.sun.r.toFixed(0)}" fill="${P.sun}" stroke="#24123d" stroke-width="5"/>`;
    o += `<line x1="0" y1="${s.hy}" x2="400" y2="${s.hy}" stroke="#24123d" stroke-width="4"/>`;
    return o;
  },
  cubism(t, s) { // 幾何碎面、大地色、同一個太陽從幾個角度重複
    const r = s.r, earth = { sky: ['#b8b2a0', '#d9ceb0', '#9d9a8c'], sun: ['#d8a84e', '#c08a3a'], hill: ['#7a5a3a', '#5e4a36', '#8c6a42'], water: ['#6d7a78', '#56605e', '#8a9290'], ground: ['#a0763f', '#6d7550', '#c9a15b'] };
    const tint = hx({ knowledge: '#3f5f88', hobby: '#a04a2e', experience: '#4f7a3f' }[t.cat]);
    const cols = 8, rows = 6, W = 400 / cols, H = 300 / rows, pt = [];
    for (let j = 0; j <= rows; j++) { pt[j] = []; for (let i = 0; i <= cols; i++) { const ex = i === 0 || i === cols, ey = j === 0 || j === rows; pt[j][i] = [i * W + (ex ? 0 : (r() - 0.5) * W * 0.8), j * H + (ey ? 0 : (r() - 0.5) * H * 0.8)]; } }
    let o = '';
    const tri = (a, b, c) => {
      const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, list = earth[s.region(cx, cy)];
      let col = hx(list[Math.floor(r() * list.length)]);
      col = mixc(col, r() < 0.25 ? tint : r() < 0.5 ? [40, 30, 20] : WHITE, r() * 0.3);
      o += `<polygon points="${[a, b, c].map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" fill="${rgb(col)}" stroke="#2b2218" stroke-width="1.4" stroke-linejoin="round"/>`;
    };
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = pt[j][i], b = pt[j][i + 1], c = pt[j + 1][i + 1], d = pt[j + 1][i];
      if ((i + j) % 2) { tri(a, b, c); tri(a, c, d); } else { tri(a, b, d); tri(b, c, d); }
    }
    for (let k = 0; k < 3; k++) { const dx = (k - 1) * s.sun.r * 0.7; o += `<path d="M${(s.sun.x + dx - s.sun.r).toFixed(0)} ${s.sun.y.toFixed(0)} a${s.sun.r.toFixed(0)} ${s.sun.r.toFixed(0)} 0 0 1 ${(s.sun.r * 2).toFixed(0)} 0" fill="none" stroke="#2b2218" stroke-width="2"/>`; }
    for (let k = 0; k < 4; k++) o += `<rect x="${(r() * 330).toFixed(0)}" y="${(r() * 240).toFixed(0)}" width="${(40 + r() * 60).toFixed(0)}" height="${(30 + r() * 50).toFixed(0)}" fill="${rgb(mixc(hx('#e8dcc0'), tint, 0.15))}" opacity=".32" transform="rotate(${((r() - 0.5) * 40).toFixed(0)} 200 150)" stroke="#2b2218" stroke-width="1"/>`;
    return o;
  },
  abstract(t, s) { // 康丁斯基式：圓、三角、線、弧，不畫風景
    const r = s.r, sc = s.col, P = ['#d62d20', '#1d4e9e', '#f5c518', '#121212', rgb(sc.hill), rgb(sc.sun)];
    const pick = () => P[Math.floor(r() * P.length)];
    let o = `<rect width="400" height="300" fill="#f1e9d8"/><rect x="${(r() * 200).toFixed(0)}" y="${(r() * 120).toFixed(0)}" width="220" height="170" fill="${rgb(mixc(sc.skyLow, WHITE, 0.2))}" opacity=".8" transform="rotate(${((r() - 0.5) * 30).toFixed(0)} 200 150)"/>`;
    const cx = 120 + r() * 160, cy = 90 + r() * 100;
    [70, 52, 34, 18].forEach((rad, k) => o += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${rad}" fill="${k % 2 ? '#f1e9d8' : pick()}" opacity="${k ? 0.95 : 0.9}"/>`);
    for (let k = 0; k < 6; k++) o += `<circle cx="${(r() * 400).toFixed(0)}" cy="${(r() * 300).toFixed(0)}" r="${(5 + r() * 16).toFixed(0)}" fill="${pick()}"/>`;
    for (let k = 0; k < 3; k++) { const x = r() * 380, y = r() * 280, z = 30 + r() * 50; o += `<polygon points="${x.toFixed(0)},${(y + z).toFixed(0)} ${(x + z * 0.6).toFixed(0)},${y.toFixed(0)} ${(x + z * 1.2).toFixed(0)},${(y + z).toFixed(0)}" fill="${pick()}" opacity=".9"/>`; }
    for (let k = 0; k < 5; k++) o += `<line x1="${(r() * 400).toFixed(0)}" y1="${(r() * 300).toFixed(0)}" x2="${(r() * 400).toFixed(0)}" y2="${(r() * 300).toFixed(0)}" stroke="#121212" stroke-width="${(1.5 + r() * 4).toFixed(1)}"/>`;
    for (let k = 0; k < 3; k++) o += `<path d="M${(r() * 300).toFixed(0)} ${(r() * 300).toFixed(0)} q ${(60 + r() * 80).toFixed(0)} ${(-40 - r() * 80).toFixed(0)} ${(120 + r() * 80).toFixed(0)} 0" fill="none" stroke="${pick()}" stroke-width="3"/>`;
    const gx = r() * 320, gy = r() * 230; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) o += `<rect x="${(gx + a * 12).toFixed(0)}" y="${(gy + b * 12).toFixed(0)}" width="12" height="12" fill="${(a + b) % 2 ? '#121212' : '#f1e9d8'}"/>`;
    return o;
  },
  destijl(t, s) { // 蒙德里安：黑線格子＋三原色
    const r = s.r, main = { knowledge: '#1d4e9e', hobby: '#d62d20', experience: '#f5c518' }[t.cat], others = ['#d62d20', '#1d4e9e', '#f5c518'].filter(c => c !== main);
    const rects = [];
    const split = (x, y, w, h, d) => {
      if (d > 3 || (w < 110 && h < 90) || (d > 1 && r() < 0.25)) { rects.push([x, y, w, h]); return; }
      if (w / h > 1.1 || (w / h > 0.8 && r() < 0.5)) { const k = w * (0.3 + r() * 0.4); split(x, y, k, h, d + 1); split(x + k, y, w - k, h, d + 1); }
      else { const k = h * (0.3 + r() * 0.4); split(x, y, w, k, d + 1); split(x, y + k, w, h - k, d + 1); }
    };
    split(0, 0, 400, 300, 0);
    const big = rects.reduce((m, q, i) => q[2] * q[3] > rects[m][2] * rects[m][3] ? i : m, 0);
    let o = '';
    rects.forEach((q, i) => { const k = r(); const fill = i === big ? main : k < 0.12 ? others[0] : k < 0.22 ? others[1] : k < 0.27 ? '#121212' : '#f4f1ea'; o += `<rect x="${q[0].toFixed(1)}" y="${q[1].toFixed(1)}" width="${q[2].toFixed(1)}" height="${q[3].toFixed(1)}" fill="${fill}" stroke="#121212" stroke-width="7"/>`; });
    return o;
  },
  ukiyoe(t, s) { // 浮世繪：普魯士藍漸層天空、平塗、細輪廓、青海波
    const id = `uk-${t.id}`, r = s.r, ink = '#2a2622';
    let o = `<defs><linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f3f73"/><stop offset=".55" stop-color="#9fb8c9"/><stop offset="1" stop-color="#efe3c8"/></linearGradient>
      <pattern id="${id}-wave" width="28" height="14" patternUnits="userSpaceOnUse"><rect width="28" height="14" fill="#24477a"/><path d="M0 14a14 14 0 0 1 28 0M-14 7a14 14 0 0 1 28 0M14 7a14 14 0 0 1 28 0" fill="none" stroke="#efe3c8" stroke-width="1.3" opacity=".85"/><path d="M5 14a9 9 0 0 1 18 0" fill="none" stroke="#efe3c8" stroke-width="1" opacity=".6"/></pattern></defs>`;
    o += `<rect width="400" height="300" fill="url(#${id}-sky)"/>`;
    o += `<circle cx="${s.sun.x.toFixed(0)}" cy="${s.sun.y.toFixed(0)}" r="${s.sun.r.toFixed(0)}" fill="#c8433a"/>`;
    for (let k = 0; k < 2; k++) { const y = 40 + k * 55 + r() * 20, x = r() * 220; o += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${(140 + r() * 80).toFixed(0)}" height="14" rx="7" fill="#efe3c8" stroke="${ink}" stroke-width="1.2" opacity=".95"/>`; }
    const hillCol = { knowledge: '#2c4f7c', hobby: '#7a3b2e', experience: '#4f6e45' }[t.cat];
    o += `<path d="${s.ridgePath(8)}" fill="${hillCol}" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>`;
    o += `<path d="${s.ridgePath(8)}" fill="#efe3c8" opacity=".18" transform="translate(0 6)"/>`;
    o += s.water ? `<rect y="${s.hy}" width="400" height="${300 - s.hy}" fill="url(#${id}-wave)" stroke="${ink}" stroke-width="1.6"/>` : `<rect y="${s.hy}" width="400" height="${300 - s.hy}" fill="#6f8a5b" stroke="${ink}" stroke-width="1.6"/>` + Array.from({ length: 22 }, () => { const x = r() * 400, y = s.hy + 8 + r() * (290 - s.hy); return `<path d="M${x.toFixed(0)} ${y.toFixed(0)} l4 -8 l4 8" fill="none" stroke="#3e5232" stroke-width="1.2"/>`; }).join('');
    o += `<rect x="${s.sun.x > 200 ? 16 : 352}" y="16" width="32" height="92" fill="#efe3c8" stroke="${ink}" stroke-width="1.4"/><rect x="${s.sun.x > 200 ? 22 : 358}" y="22" width="20" height="80" fill="none" stroke="#c8433a" stroke-width="1"/>`;
    return o;
  },
  pop(t, s) { // 普普：網點、粗黑框、超飽和
    const id = `pop-${t.id}`, P = { knowledge: ['#00b7eb', '#ff3ea5'], hobby: ['#ff2b2b', '#00b7eb'], experience: ['#2bd96b', '#ff3ea5'] }[t.cat];
    let o = `<defs><pattern id="${id}-a" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" fill="${P[0]}"/><circle cx="6" cy="6" r="3.2" fill="#ffffff" opacity=".55"/></pattern>
      <pattern id="${id}-b" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#ffe600"/><circle cx="5" cy="5" r="2.6" fill="#ff2b2b"/></pattern>
      <pattern id="${id}-c" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="${P[1]}"/><circle cx="4.5" cy="4.5" r="2.4" fill="#121212" opacity=".35"/></pattern></defs>`;
    o += `<rect width="400" height="300" fill="url(#${id}-a)"/>`;
    const { x, y, r: R } = s.sun; let star = '';
    for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, d = k % 2 ? R * 1.35 : R * 2.1; star += `${(x + Math.cos(a) * d).toFixed(0)},${(y + Math.sin(a) * d).toFixed(0)} `; }
    o += `<polygon points="${star}" fill="#ffe600" stroke="#121212" stroke-width="5" stroke-linejoin="round"/>`;
    o += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${R.toFixed(0)}" fill="url(#${id}-b)" stroke="#121212" stroke-width="5"/>`;
    o += `<path d="${s.ridgePath(20)}" fill="url(#${id}-c)" stroke="#121212" stroke-width="6" stroke-linejoin="round"/>`;
    o += `<rect y="${s.hy}" width="400" height="${300 - s.hy}" fill="${s.water ? '#1d4ed8' : '#ffe600'}" stroke="#121212" stroke-width="6"/>`;
    if (s.water) for (let k = 0; k < 4; k++) o += `<path d="M${20 + k * 95} ${(s.hy + 26 + (k % 2) * 30).toFixed(0)} q 20 -12 40 0 t 40 0" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>`;
    return o;
  },
};

const ART_CACHE = new Map(); // 畫面是固定的（同主題同畫派永遠同一幅），算過就記住
function artSvg(t, school, cls, label) {
  const key = school + '|' + t.id;
  if (!ART_CACHE.has(key)) ART_CACHE.set(key, ART[school](t, sceneOf(t)));
  return `<svg class="vis art-${school} ${cls}" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${label}">${ART_CACHE.get(key)}</svg>`;
}
