'use strict';

// ================= 狀態（存在這個瀏覽器；登入 Google 後由 cloud.js 同步到雲端） =================
const KEY = 'explore-v1';
// 重置版本：改這個值，所有使用者下次打開時本機進度都會清空、從問卷重來；雲端的舊資料也不會再被讀回來（見 cloud.js）
const RESET_ID = '2026-11-21';
const READ_V = 2; // 讀完流程改成「小測驗＋用自己的話講」：舊的「我讀完了」紀錄不保留（2026-11-27 使用者決定）
const blank = () => ({ rv: RESET_ID, readV: READ_V, profile: null, first: null, saved: {}, dismissed: {}, viewed: {}, read: {}, challenges: {}, exps: {}, logs: [], style: 'magazine', events: [], daily: null, fresh: [] });
function migrate(d) {
  const o = Object.assign(blank(), d || {});
  if ((d || {}).readV !== READ_V) { o.read = {}; o.readV = READ_V; }
  if (!Array.isArray(o.logs)) o.logs = [];
  return o;
}
let wasReset = false;
let S = load();
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.rv !== RESET_ID) { wasReset = !!d.profile; localStorage.removeItem(KEY); return blank(); }
    return migrate(d);
  } catch { return blank(); }
}
// save：使用者做了動作才用，會記下修改時間並觸發雲端同步；persist：自動產生的快取（例如今日推薦），不算修改
function persist() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* 無法儲存時照常運作 */ } }
function save() { S.ts = Date.now(); persist(); window.cloudPush?.(); }
// 給 cloud.js 用：讀目前狀態、用雲端版本整份取代（不觸發再上傳）、重畫
window.EXPLORE = {
  get state() { return S; },
  RESET_ID,
  replaceState(d) { S = migrate(d); persist(); render(); },
  render: () => render(),
  toast: (...a) => toast(...a),
};

// ================= 工具 =================
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => fmt(new Date());
const diffDays = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
const md = s => `${+s.slice(5, 7)} 月 ${+s.slice(8, 10)} 日`;
const WD = ['日', '一', '二', '三', '四', '五', '六'];
const T = Object.fromEntries(TOPICS.map(t => [t.id, t]));
const INT = Object.fromEntries(INTERESTS);
const hash = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const diffLabel = d => ['', '入門', '中等', '有挑戰'][d];
const dots = d => '●'.repeat(d) + '○'.repeat(3 - d);

function log(type, id, text = '') {
  S.events.push({ d: new Date().toISOString(), type, id, text });
  if (S.events.length > 500) S.events.shift();
}

// ================= 抽象視覺（依主題產生，不用圖片） =================
// 每種視覺風格一組抽象圖配色：[主色, 對比色, 底色, 輔色]
const PALS = {
  magazine: { knowledge: ['#22406b', '#c9a227', '#e8dfcf', '#8aa1c1'], hobby: ['#b4532a', '#253a52', '#efe3cf', '#e2a372'], experience: ['#55632b', '#d98c3f', '#ece4d2', '#a9b46b'] },
  minimal: { knowledge: ['#0071e3', '#1d1d1f', '#eef4fb', '#a8cdf5'], hobby: ['#ff6b3d', '#1d1d1f', '#fdf1ec', '#ffc3ad'], experience: ['#30a46c', '#1d1d1f', '#edf8f2', '#a6e0c0'] },
  notebook: { knowledge: ['#8fb0d4', '#4f7aa6', '#fbf6e9', '#e9d9b4'], hobby: ['#e8a598', '#cc6b5c', '#fbf6e9', '#f2d6a2'], experience: ['#a9c49a', '#63895a', '#fbf6e9', '#efd9a8'] },
  pop: { knowledge: ['#3d5afe', '#121212', '#fff4d6', '#ffb300'], hobby: ['#ff4f2e', '#121212', '#ffe6a8', '#3d5afe'], experience: ['#0e9f4f', '#121212', '#fff4d6', '#ff4f2e'] },
  space: { knowledge: ['#6b6b6b', '#7fa7ff', '#050505', '#3d3d3d'], hobby: ['#6b6b6b', '#ff7a45', '#050505', '#3d3d3d'], experience: ['#6b6b6b', '#8fd694', '#050505', '#3d3d3d'] },
};
// ================= 視覺風格 =================
const STYLES = [
  ['magazine', '文藝雜誌', '米白紙張、襯線大標，像翻一本雜誌'],
  ['minimal', '極簡白', '純白、圓角、輕陰影，乾淨俐落'],
  ['notebook', '日系手帳', '方格紙、手寫感字體、紙膠帶'],
  ['pop', '繽紛活潑', '飽和色塊、粗黑框、硬陰影'],
  ['space', '太空科技', '純黑底、細線、大寫寬字距'],
];
const STYLE_NAME = Object.fromEntries(STYLES.map(([k, n]) => [k, n]));
const STYLE_FONTS = {
  minimal: 'family=Inter:wght@400;600;700',
  notebook: 'family=LXGW+WenKai+TC:wght@400;700&family=Caveat:wght@600',
  pop: 'family=Bricolage+Grotesque:wght@600;800',
  space: 'family=Barlow:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500',
};
const curStyle = () => STYLE_NAME[S.style] ? S.style : 'magazine';
function loadStyleFonts(k) {
  if (!STYLE_FONTS[k] || document.getElementById('font-' + k)) return;
  const l = document.createElement('link');
  l.id = 'font-' + k; l.rel = 'stylesheet'; l.href = `https://fonts.googleapis.com/css2?${STYLE_FONTS[k]}&display=swap`;
  document.head.appendChild(l);
}
function applyStyle() {
  const k = curStyle();
  loadStyleFonts(k);
  if (document.documentElement.dataset.style !== k) document.documentElement.dataset.style = k;
}
function setStyle(k) {
  if (!STYLE_NAME[k] || k === curStyle()) return;
  S.style = k; save(); render();
  toast(`視覺風格：${STYLE_NAME[k]}${window.CLOUD?.user ? '，會同步到你的帳號' : ''}`);
}
function visual(t, cls = '') {
  const r = rng(hash(t.id));
  const [a, b, bg, c] = PALS[curStyle()][t.cat];
  const kind = hash(t.id + 'k') % 5;
  let g = '';
  if (kind === 0) { // 同心圓
    const cx = 120 + r() * 160, cy = 80 + r() * 140;
    for (let i = 6; i > 0; i--) g += `<circle cx="${cx}" cy="${cy}" r="${i * 26}" fill="${i % 2 ? a : bg}" opacity="${i % 2 ? 0.9 : 1}"/>`;
    g += `<rect x="0" y="${200 + r() * 40}" width="400" height="120" fill="${b}"/>`;
  } else if (kind === 1) { // 斜條紋
    for (let i = -6; i < 14; i++) g += `<rect x="${i * 34}" y="-60" width="16" height="460" fill="${i % 3 ? a : c}" transform="rotate(${18 + r() * 14} 200 150)"/>`;
    g += `<circle cx="${80 + r() * 240}" cy="${70 + r() * 160}" r="${44 + r() * 30}" fill="${b}"/>`;
  } else if (kind === 2) { // 日出弧
    g += `<rect width="400" height="300" fill="${c}"/>`;
    for (let i = 5; i > 0; i--) g += `<circle cx="200" cy="300" r="${i * 46}" fill="${i % 2 ? a : bg}"/>`;
    g += `<rect x="0" y="${236}" width="400" height="64" fill="${b}"/>`;
  } else if (kind === 3) { // 點陣
    for (let y = 0; y < 8; y++) for (let x = 0; x < 11; x++) { const s = 4 + r() * 12; g += `<circle cx="${20 + x * 37}" cy="${20 + y * 37}" r="${s}" fill="${r() > 0.82 ? b : a}"/>`; }
  } else { // 幾何拼貼
    g += `<rect x="0" y="0" width="${160 + r() * 80}" height="300" fill="${a}"/>`;
    g += `<polygon points="400,0 400,300 ${140 + r() * 80},300" fill="${c}"/>`;
    g += `<circle cx="${180 + r() * 60}" cy="${90 + r() * 60}" r="${50 + r() * 20}" fill="${b}"/>`;
    g += `<rect x="${40 + r() * 60}" y="${190 + r() * 40}" width="120" height="14" fill="${bg}"/>`;
  }
  const st = curStyle(), fid = `f-${st}-${t.id}`;
  let defs = '', body = g;
  if (st === 'minimal') { // 柔和漸層光暈：不用幾何形狀，三團模糊色塊
    defs = `<filter id="${fid}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="38"/></filter>`;
    body = `<g filter="url(#${fid})"><circle cx="${90 + r() * 120}" cy="${80 + r() * 80}" r="${110 + r() * 40}" fill="${a}" opacity=".85"/><circle cx="${240 + r() * 120}" cy="${140 + r() * 100}" r="${100 + r() * 40}" fill="${c}"/><circle cx="${150 + r() * 120}" cy="${230 + r() * 40}" r="${70 + r() * 30}" fill="${b}" opacity=".18"/></g>`;
  } else if (st === 'notebook') { // 手繪感：邊緣抖動、像水彩疊色
    defs = `<filter id="${fid}"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="${hash(t.id) % 97}"/><feDisplacementMap in="SourceGraphic" scale="14"/></filter>`;
    body = `<g filter="url(#${fid})" opacity=".88" style="mix-blend-mode:multiply">${g}</g>`;
  } else if (st === 'pop') { // 漫畫感：每個形狀加粗黑描邊
    body = g.replace(/\/>/g, ' stroke="#121212" stroke-width="5"/>');
  } else if (st === 'space') { // 線框：只留輪廓，加座標格線和準星
    body = g.replace(/fill="(#[0-9a-f]{6})"( opacity="[^"]*")?/gi, 'fill="none" stroke="$1" stroke-width="1.4"');
    let grid = '';
    for (let x = 50; x < 400; x += 50) grid += `<line x1="${x}" y1="0" x2="${x}" y2="300" stroke="#ffffff" stroke-opacity=".07"/>`;
    for (let y = 50; y < 300; y += 50) grid += `<line x1="0" y1="${y}" x2="400" y2="${y}" stroke="#ffffff" stroke-opacity=".07"/>`;
    const px = 60 + r() * 280, py = 50 + r() * 200;
    body = grid + body + `<g stroke="${b}" stroke-width="1.2" fill="none"><circle cx="${px}" cy="${py}" r="10"/><line x1="${px - 22}" y1="${py}" x2="${px + 22}" y2="${py}"/><line x1="${px}" y1="${py - 22}" x2="${px}" y2="${py + 22}"/></g><text x="12" y="288" fill="${b}" font-size="11" font-family="JetBrains Mono, monospace" letter-spacing="2">${String(hash(t.id) % 1000).padStart(3, '0')}.${t.cat.slice(0, 3).toUpperCase()}</text>`;
  }
  return `<svg class="vis ${cls}" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(t.title)}的抽象圖">${defs ? `<defs>${defs}</defs>` : ''}<rect width="400" height="300" fill="${bg}"/>${body}</svg>`;
}

// ================= 個人化推薦（固定規則） =================
const isDone = id => S.read[id] || S.challenges[id]?.finished || S.exps[id]?.done;
// ================= 由淺入深：分層解鎖 =================
// 每個分枝四層（levels.js）。同分枝上一層至少完成一個主題，這一層才解鎖；
// 主題出現在幾個分枝，只要其中一個分枝走到了就能看。已經有進度的主題不會被鎖回去。
const levelOf = (tag, id) => Math.max(0, LEVELS[tag].findIndex(l => l.includes(id)));
const layerOpen = (tag, i) => i === 0 || LEVELS[tag][i - 1].some(id => isDone(id));
function hasProgress(id) { return !!(S.viewed[id] || S.saved[id] || S.challenges[id] || S.exps[id] || S.read[id] || logsOf(id).length); }
const logsOf = id => S.logs.filter(l => l.topic === id);
function unlocked(id) { return hasProgress(id) || T[id].tags.some(g => LEVELS[g] && layerOpen(g, levelOf(g, id))); }
// 還沒解鎖時：找最接近的一條路（需要的層數最淺的分枝），告訴使用者先完成哪幾個
function unlockPath(id) {
  const opts = T[id].tags.filter(g => LEVELS[g]).map(g => {
    const lv = levelOf(g, id);
    let k = lv; while (k > 0 && !layerOpen(g, k)) k--; // 第 k 層已開放、需要在第 k 層完成一個
    return { g, lv, k, need: LEVELS[g][k] };
  }).sort((a, b) => (a.lv - a.k) - (b.lv - b.k) || a.lv - b.lv);
  return opts[0];
}
const unlockHint = id => { const u = unlockPath(id); return `完成「${INT[u.g]}」第 ${u.k + 1} 層（${LEVEL_NAMES[u.k]}）任一主題後${u.lv - u.k > 1 ? '逐層' : ''}解鎖`; };
function scoreOf(t) {
  const p = S.profile || {};
  let s = 0; const why = [];
  const hit = t.tags.filter(g => p.interests?.includes(g));
  if (hit.length) { s += 3 * Math.min(2, hit.length); why.push([3 * hit.length, `你對${hit.map(g => INT[g]).join('、')}有興趣`]); }
  // 從收藏與略過學習
  const savedTopics = Object.keys(S.saved).map(id => T[id]).filter(Boolean);
  const rel = savedTopics.find(x => x.id !== t.id && (x.related.includes(t.id) || t.related.includes(x.id)));
  const tagLove = savedTopics.filter(x => x.id !== t.id && x.tags.some(g => t.tags.includes(g))).length;
  if (rel) { s += 2; why.push([2.5, `和你收藏的「${rel.title}」相關`]); }
  else if (tagLove) { s += Math.min(2, tagLove); why.push([1.5, '和你收藏過的主題類型相近']); }
  const tagHate = Object.keys(S.dismissed).map(id => T[id]).filter(x => x && x.tags.some(g => t.tags.includes(g))).length;
  s -= Math.min(2, tagHate);
  if (p.mode === 'read' && t.mode === 'read') { s += 1; why.push([1, '適合喜歡多看多了解的你']); }
  if (p.mode === 'do' && t.mode === 'do') { s += 1; why.push([1, '可以實際動手做']); }
  if (t.hours > (p.hours || 5)) s -= 2; else if (t.hours <= 1) why.push([0.5, '花一點時間就能完成']);
  if (p.budget === 0) { if (t.cost === 2) s -= 2; if (t.cost === 0) { s += 1; why.push([1, '免費就能開始']); } }
  if (p.social === 'solo') { if (t.social === 'group') s -= 1; else if (t.social === 'solo') why.push([0.8, '一個人就能做']); }
  if (p.social === 'group' && t.social !== 'solo') { s += 1; why.push([1, '適合找朋友一起']); }
  if (isDone(t.id)) s -= 4;
  why.sort((x, y) => y[0] - x[0]);
  return { s, why: why.map(w => w[1]) };
}
function ranked(seed = today(), withLocked = false) {
  const r = rng(hash(seed));
  return TOPICS.filter(t => !S.dismissed[t.id] && (withLocked || unlocked(t.id))).map(t => ({ t, ...scoreOf(t), j: r() * 1.5 - (withLocked && !unlocked(t.id) ? 100 : 0) }))
    .sort((a, b) => (b.s + b.j) - (a.s + a.j));
}
// 今日推薦：先保證三類各一，再補到 4–5 張；一天內固定
function dailyPicks() {
  const n = (S.profile?.hours || 5) >= 5 ? 5 : 4;
  if (S.daily?.date === today()) {
    S.daily.ids = S.daily.ids.filter(id => !S.dismissed[id] && unlocked(id));
    if (S.daily.ids.length >= Math.min(n, 3)) return S.daily.ids;
  }
  const list = ranked();
  const ids = S.daily?.date === today() ? [...S.daily.ids] : [];
  for (const cat of Object.keys(CATS)) {
    if (ids.some(id => T[id].cat === cat)) continue;
    const x = list.find(x => x.t.cat === cat && !ids.includes(x.t.id) && !isDone(x.t.id));
    if (x) ids.push(x.t.id);
  }
  for (const x of list) {
    if (ids.length >= n) break;
    if (ids.includes(x.t.id) || isDone(x.t.id)) continue;
    if (ids.filter(id => T[id].cat === x.t.cat).length >= 2) continue;
    ids.push(x.t.id);
  }
  S.daily = { date: today(), ids }; persist();
  return ids;
}
function whyText(t) {
  const w = scoreOf(t).why;
  const recentCats = Object.entries(S.viewed).filter(([, d]) => diffDays(d, today()) <= 7).map(([id]) => T[id]?.cat);
  if (recentCats.length >= 3 && !recentCats.includes(t.cat)) w.unshift(`換換口味：你這週還沒看過${CATS[t.cat].zh}類`);
  return w.slice(0, 2).join('，') || '今天的隨機驚喜';
}

// ================= 卡片 =================
function card(t, opts = {}) {
  const saved = !!S.saved[t.id], lock = !unlocked(t.id);
  return `<article class="card ${opts.big ? 'big' : ''} ${lock ? 'locked' : ''} cat-${t.cat}">
    <a href="#/topic/${t.id}" class="cimg" aria-label="${esc(t.title)}">${visual(t)}</a>
    <div class="cbody">
      <div class="kicker"><span class="cat">${CATS[t.cat].en}</span><span>${esc(t.time)}</span><span title="難度：${diffLabel(t.diff)}">${dots(t.diff)} ${diffLabel(t.diff)}</span></div>
      <h3><a href="#/topic/${t.id}">${esc(t.title)}</a></h3>
      <p class="sub">${esc(t.sub)}</p>
      ${opts.why ? `<p class="why"><span>為什麼推薦</span>${esc(whyText(t))}</p>` : ''}
      ${isDone(t.id) ? '<p class="done-tag">已完成</p>' : ''}
      ${lock ? `<p class="lockline">🔒 ${esc(unlockHint(t.id))}</p>` : `<div class="actions">
        <a class="btn primary" href="#/topic/${t.id}">開始探索</a>
        <button class="btn icon ${saved ? 'on' : ''}" data-save="${t.id}" aria-pressed="${saved}" title="${saved ? '取消收藏' : '收藏'}">${saved ? '♥' : '♡'}<span>${saved ? '已收藏' : '收藏'}</span></button>
        <button class="btn icon ghost" data-dismiss="${t.id}" title="不感興趣">✕<span>不感興趣</span></button>
      </div>`}
    </div>
  </article>`;
}
function bindCards(root) {
  $$('[data-save]', root).forEach(b => b.onclick = () => { toggleSave(b.dataset.save); render(); });
  $$('[data-dismiss]', root).forEach(b => b.onclick = () => {
    const id = b.dataset.dismiss; S.dismissed[id] = today(); delete S.saved[id]; log('dismiss', id); save();
    const daily = S.daily && S.daily.date === today() ? [...S.daily.ids] : null;
    toast(`已略過「${T[id].title}」，之後會少推薦類似的。`, '復原', () => { delete S.dismissed[id]; if (daily) S.daily.ids = daily; log('undismiss', id); save(); render(); });
    render();
  });
}
function toggleSave(id) {
  if (S.saved[id]) { delete S.saved[id]; log('unsave', id); toast(`已取消收藏「${T[id].title}」。`); }
  else {
    S.saved[id] = today(); log('save', id);
    const n = TOPICS.filter(x => x.id !== id && unlocked(x.id) && !S.saved[x.id] && (x.related.includes(id) || T[id].related.includes(x.id))).length;
    toast(`已收藏「${T[id].title}」：放在首頁「我的收藏」，技能樹 +1${n ? `，之後多推薦 ${n} 個相關主題` : ''}。`, '看相關', () => { location.hash = `#/topic/${id}`; setTimeout(() => $('#related')?.scrollIntoView(), 80); });
  }
  save();
}
let toastTimer;
function toast(msg, act, fn) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${act ? `<button>${esc(act)}</button>` : ''}`;
  el.hidden = false;
  if (act) $('button', el).onclick = () => { el.hidden = true; fn(); };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 5000);
}

// ================= 路由 =================
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [page, id] = h.split('/');
  return { page: page || 'home', id };
}
function render() {
  applyStyle();
  const app = $('#app');
  const { page, id } = route();
  if (!S.profile || page === 'onboard') { renderOnboard(app); setNav(''); window.cloudPaint?.(); return; }
  setNav(page === 'topic' || page === 'challenge' ? '' : page);
  ({ home: renderHome, discover: renderDiscover, topic: renderTopic, challenge: renderChallenge, journey: renderJourney }[page] || renderHome)(app, id);
  window.cloudPaint?.();
}
function setNav(p) { $$('.nav a').forEach(a => a.setAttribute('aria-current', a.dataset.p === p ? 'page' : 'false')); }
let scrollTarget = null; // 換頁後要捲到的區塊 id（例如 #study），沒有就回到頂端
const goTo = (hash, target) => { scrollTarget = target; if (location.hash === hash) { render(); $('#' + target)?.scrollIntoView(); scrollTarget = null; } else location.hash = hash; };
window.addEventListener('hashchange', () => { render(); const el = scrollTarget && $('#' + scrollTarget); scrollTarget = null; el ? el.scrollIntoView() : window.scrollTo(0, 0); });

// ================= 首次問卷 =================
const QS = [
  { id: 'interests', q: '對哪些領域有興趣？', hint: '可複選，至少一個', multi: true, opts: INTERESTS },
  { id: 'mode', q: '比較喜歡怎麼探索？', opts: [['read', '多看多了解：讀、聽、逛'], ['do', '動手做：實際練習、參與'], ['both', '都喜歡']] },
  { id: 'hours', q: '每週大概有多少時間留給探索？', opts: [[2, '2 小時以內'], [5, '2–5 小時'], [10, '5 小時以上']] },
  { id: 'budget', q: '花錢的程度？', opts: [[0, '盡量免費'], [1, '一點點沒關係'], [2, '值得的話可以投資']] },
  { id: 'social', q: '喜歡一個人還是跟朋友？', opts: [['solo', '一個人比較自在'], ['group', '跟朋友比較有動力'], ['either', '都可以']] },
];
function renderOnboard(app) {
  const p = S.profile || { interests: [] };
  app.innerHTML = `
    <section class="onboard">
      <p class="eyebrow">Welcome to</p>
      <h1 class="masthead">EXPLORE</h1>
      <p class="tagline">Discover more. Experience more.</p>
      <p class="lede">回答 6 個問題，每天為你挑選值得認識的知識、嗜好和體驗。</p>
      <p class="acct-line" data-acct="onboard"></p>
      <form id="ob" class="qs">
        <fieldset class="q"><legend><span class="qn">01</span>怎麼稱呼你？</legend>
          <input name="name" maxlength="20" value="${esc(p.name || '')}" placeholder="名字或暱稱" required></fieldset>
        ${QS.map((q, i) => `<fieldset class="q"><legend><span class="qn">${String(i + 2).padStart(2, '0')}</span>${q.q}${q.hint ? `<small>${q.hint}</small>` : ''}</legend>
          <div class="opts ${q.multi ? 'chips' : ''}">${q.opts.map(([v, l]) => `<label class="opt"><input type="${q.multi ? 'checkbox' : 'radio'}" name="${q.id}" value="${v}" ${q.multi ? (p.interests.includes(v) ? 'checked' : '') : (String(p[q.id]) === String(v) ? 'checked' : '')}><span>${l}</span></label>`).join('')}</div></fieldset>`).join('')}
        <p class="err" id="oberr" hidden></p>
        <button class="btn primary big" type="submit">${S.profile ? '儲存' : '開始探索'}</button>
      </form>
    </section>`;
  $('#ob').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const np = { name: String(f.get('name') || '').trim(), interests: f.getAll('interests') };
    for (const q of QS) if (!q.multi) { const v = f.get(q.id); np[q.id] = v == null ? null : /^\d+$/.test(v) ? +v : v; }
    const miss = [];
    if (!np.name) miss.push('稱呼'); if (!np.interests.length) miss.push('興趣');
    QS.filter(q => !q.multi && np[q.id] == null).forEach(q => miss.push(q.q.replace('？', '')));
    if (miss.length) { const el = $('#oberr'); el.hidden = false; el.textContent = `還沒填：${miss.join('、')}`; return; }
    const isNew = !S.profile;
    S.profile = np; if (!S.first) S.first = today();
    S.daily = null; log(isNew ? 'start' : 'profile', null); save();
    location.hash = '#/home'; render();
  };
}

// ================= 首頁 =================
function greet() { const h = new Date().getHours(); return h < 5 ? '夜深了' : h < 11 ? '早安' : h < 14 ? '午安' : h < 18 ? '午後好' : '晚安'; }
function renderHome(app) {
  const ids = dailyPicks();
  const issue = diffDays(S.first || today(), today()) + 1;
  const d = new Date();
  const going = Object.entries(S.challenges).filter(([, c]) => !c.finished);
  app.innerHTML = `
    <section class="hero">
      <p class="eyebrow">No. ${issue} · ${md(today())} 星期${WD[d.getDay()]}</p>
      <h1>${greet()}，${esc(S.profile.name)}。</h1>
      <p class="lede">今天為你挑了 ${ids.length} 個值得認識的東西。</p>
    </section>
    ${going.length ? `<section class="strip"><h2 class="sec">進行中的挑戰</h2>${going.map(([id, c]) => { const n = Object.values(c.days || {}).filter(x => x.done).length; return `<a class="mini" href="#/challenge/${id}"><b>${esc(T[id].title)}</b><span>${n}/7 天</span><span class="bar"><i style="width:${n / 7 * 100}%"></i></span></a>`; }).join('')}</section>` : ''}
    ${digCard()}
    <section>
      <h2 class="sec">Today's Discovery</h2>
      <div class="feature">${ids.map((id, i) => card(T[id], { why: true, big: i === 0 })).join('')}</div>
      ${ids.length < 3 ? '<p class="muted">今天的推薦都被你略過了，去「探索」頁看看其他主題吧。</p>' : ''}
    </section>
    ${(() => { const sv = Object.keys(S.saved).filter(id => T[id] && !isDone(id) && !ids.includes(id)).sort((a, b) => S.saved[b].localeCompare(S.saved[a])); return sv.length ? `<section class="block"><h2 class="sec">我的收藏・還沒完成</h2><div class="grid three">${sv.slice(0, 6).map(id => card(T[id])).join('')}</div>${sv.length > 6 ? `<p class="muted small">還有 ${sv.length - 6} 個，在「我的旅程」看全部。</p>` : ''}</section>` : ''; })()}
    <section class="more"><a class="btn" href="#/discover">看更多主題 →</a></section>`;
  bindCards(app);
  bindStudy(app);
  $$('[data-gostudy]', app).forEach(b => b.onclick = () => goTo(`#/topic/${b.dataset.gostudy}`, 'study'));
}

// ================= 探索 =================
let filt = { cat: 'all', q: '', showDismissed: false };
function renderDiscover(app) {
  const list = ranked('discover', true); // 探索頁也列出還沒解鎖的（排在後面、灰色），看得到前面還有什麼
  const q = filt.q.trim().toLowerCase();
  const match = t => !q || [t.title, t.sub, ...t.tags.map(g => INT[g]), CATS[t.cat].zh].join(' ').toLowerCase().includes(q);
  const shown = list.filter(x => (filt.cat === 'all' || x.t.cat === filt.cat || (filt.cat === 'saved' && S.saved[x.t.id])) && match(x.t)).map(x => x.t);
  const dismissedList = TOPICS.filter(t => S.dismissed[t.id]);
  const fresh = S.fresh.map(id => T[id]).filter(t => t && !S.dismissed[t.id]);
  app.innerHTML = `
    <section class="hero small">
      <p class="eyebrow">Discover</p>
      <h1>探索新主題</h1>
      <p class="lede">隨意翻翻，說不定下一個愛上的東西就在這裡。</p>
    </section>
    <div class="toolbar">
      <div class="filters" role="tablist">${[['all', '全部'], ['knowledge', 'KNOWLEDGE'], ['hobby', 'HOBBIES'], ['experience', 'EXPERIENCES'], ['saved', '♥ 收藏']].map(([k, l]) => `<button class="chip ${filt.cat === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
      <input type="search" id="q" placeholder="搜尋主題，例如：咖啡、歷史" value="${esc(filt.q)}" aria-label="搜尋主題">
    </div>
    <section class="surprise">
      <button class="btn primary" id="shuffle">✦ 幫我抽三個新發現</button>
      <span class="muted">從你還沒看過的主題裡，依照你的喜好抽出來</span>
    </section>
    ${fresh.length ? `<section><h2 class="sec">New for you</h2><div class="grid three">${fresh.map(t => card(t, { why: true })).join('')}</div></section>` : ''}
    <section>
      <h2 class="sec">${shown.length} 個主題</h2>
      ${shown.length ? `<div class="grid">${shown.map(t => card(t)).join('')}</div>` : '<p class="muted">沒有符合的主題，換個關鍵字試試。</p>'}
    </section>
    ${dismissedList.length ? `<section><button class="linkbtn" id="toggleDis">${filt.showDismissed ? '收起' : '看看'}略過的 ${dismissedList.length} 個主題</button>
      ${filt.showDismissed ? `<ul class="dislist">${dismissedList.map(t => `<li>${esc(t.title)} <button class="linkbtn" data-undis="${t.id}">放回來</button></li>`).join('')}</ul>` : ''}</section>` : ''}`;
  $$('[data-f]', app).forEach(b => b.onclick = () => { filt.cat = b.dataset.f; render(); });
  const qi = $('#q');
  qi.oninput = () => { filt.q = qi.value; const pos = qi.selectionStart; render(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); };
  $('#shuffle').onclick = () => {
    const r = rng(Date.now());
    const pool = ranked(String(Date.now())).filter(x => !S.viewed[x.t.id] && !isDone(x.t.id) && !S.fresh.includes(x.t.id));
    const src = pool.length >= 3 ? pool : ranked(String(Date.now())).filter(x => !S.fresh.includes(x.t.id));
    const top = src.slice(0, 8).sort(() => r() - 0.5).slice(0, 3);
    S.fresh = top.map(x => x.t.id); log('shuffle', null); save(); render();
    if (!pool.length) toast('你已經看過大部分主題了！這次從全部主題裡抽。');
  };
  $('#toggleDis')?.addEventListener('click', () => { filt.showDismissed = !filt.showDismissed; render(); });
  $$('[data-undis]', app).forEach(b => b.onclick = () => { delete S.dismissed[b.dataset.undis]; save(); render(); });
  bindCards(app);
}

// ================= Deep Dive =================
function renderTopic(app, id) {
  const t = T[id];
  if (!t) { app.innerHTML = '<p class="muted">找不到這個主題。</p><a class="btn" href="#/discover">回到探索</a>'; return; }
  if (!unlocked(id)) {
    const u = unlockPath(id);
    app.innerHTML = `
      <section class="hero small locked-hero cat-${t.cat}">
        <p class="eyebrow">🔒 尚未解鎖・${esc(INT[u.g])}第 ${u.lv + 1} 層（${LEVEL_NAMES[u.lv]}）</p>
        <h1>${esc(t.title)}</h1>
        <p class="lede">${esc(t.sub)}</p>
        <p class="muted">EXPLORE 的主題由淺入深排列。先在「${esc(INT[u.g])}」第 ${u.k + 1} 層（${LEVEL_NAMES[u.k]}）完成下面任一個${u.lv - u.k > 1 ? '，再一層一層往外走' : '，這個主題就會打開'}。</p>
      </section>
      <section class="block"><h2 class="sec">先從這裡開始</h2><div class="grid three">${u.need.map(x => card(T[x])).join('')}</div></section>`;
    bindCards(app); return;
  }
  if (!S.viewed[id]) { S.viewed[id] = today(); log('view', id); save(); }
  const saved = !!S.saved[id];
  const rel = t.related.map(r => T[r]).filter(Boolean);
  const more = S.moreRel === id ? [...new Set(rel.flatMap(r => r.related))].filter(x => x !== id && !t.related.includes(x)).map(x => T[x]).slice(0, 4) : [];
  const ch = S.challenges[id], ex = S.exps[id] || { steps: [] };
  let action = '';
  if (t.cat === 'hobby') action = ch ? `<a class="btn primary" href="#/challenge/${id}">${ch.finished ? '看挑戰紀錄' : '繼續七天挑戰'}</a>` : `<button class="btn primary" data-act="start">開始七天挑戰</button>`;
  if (t.cat === 'knowledge') action = S.read[id] ? '<span class="done-tag">已讀完</span>' : '<button class="btn primary" data-act="read">我讀完了</button>';
  if (t.cat === 'experience') action = ex.done ? '<span class="done-tag">已完成這個體驗</span>' : '<a class="btn primary" href="#do">我要去做</a>';
  app.innerHTML = `
    <article class="dive cat-${t.cat}">
      <header class="dhero">
        ${visual(t, 'wide')}
        <div class="dtitle">
          <p class="kicker"><span class="cat">${CATS[t.cat].en}</span><span>${esc(t.time)}</span><span>${dots(t.diff)} ${diffLabel(t.diff)}</span></p>
          <h1><span class="ticon">${icon(t.id, 30)}</span>${esc(t.title)}</h1>
          <p class="lede">${esc(t.sub)}</p>
          <div class="actions">${action}<button class="btn icon ${saved ? 'on' : ''}" id="saveT">${saved ? '♥ 已收藏' : '♡ 收藏'}</button><a class="btn ghost" href="#related">延伸探索 ↓</a></div>
        </div>
      </header>

      <section class="block intro"><h2 class="sec">簡介</h2><p class="dropcap">${esc(t.intro)}</p></section>
      <section class="block"><h2 class="sec">為什麼有趣</h2><ul class="whylist">${t.why.map(w => `<li>${esc(w)}</li>`).join('')}</ul></section>
      <section class="block"><h2 class="sec">${t.cat === 'experience' ? '怎麼做得更好' : '關鍵概念'}</h2><div class="concepts">${t.concepts.map((c, i) => `<div class="concept"><span class="cn">${String(i + 1).padStart(2, '0')}</span><h3>${esc(c.t)}</h3><p>${esc(c.d)}</p></div>`).join('')}</div></section>
      ${t.deep ? `<section class="block deep"><h2 class="sec">深入一點</h2>${t.deep.map(p => `<p>${esc(p)}</p>`).join('')}</section>` : ''}
      ${t.gear ? `<section class="block two"><div><h2 class="sec">入門裝備</h2><ul class="plain">${t.gear.map(g => `<li>${esc(g)}</li>`).join('')}</ul></div><div><h2 class="sec">新手常犯的錯</h2><ul class="plain warn">${t.mistakes.map(g => `<li>${esc(g)}</li>`).join('')}</ul></div></section>` : ''}
      ${t.steps ? `<section class="block" id="do"><h2 class="sec">實際去做</h2>
        <ol class="steps">${t.steps.map((s, i) => `<li><label><input type="checkbox" data-step="${i}" ${ex.steps[i] ? 'checked' : ''} ${ex.done ? 'disabled' : ''}><span>${esc(s)}</span></label></li>`).join('')}</ol>
        ${ex.done ? reflectionView(ex) : ex.steps.filter(Boolean).length === t.steps.length ? reflectionForm('exp') : '<p class="muted small">三步都完成後，可以寫下心得。</p>'}
        ${t.taichung ? `<div class="local"><h3>在台中可以去</h3><ul class="plain">${t.taichung.map(p => `<li><b>${esc(p.name)}</b>　${esc(p.note)}</li>`).join('')}</ul><p class="muted small">開放時間和活動常變動，出發前請先查詢。</p></div>` : ''}
      </section>` : ''}
      <section class="block"><h2 class="sec">你可能不知道</h2><ol class="facts">${t.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ol></section>
      <section class="block"><h2 class="sec">下一步</h2><ul class="nextlist">${t.next.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
        ${t.cat === 'knowledge' && S.read[id] ? reflectionView(S.read[id]) : ''}
        <div class="actions" style="margin-top:16px">${action}</div></section>
      ${(t.reads?.length || t.practice?.length) ? `<section class="block reads"><h2 class="sec">推薦讀物與實作</h2>
        ${t.reads?.length ? `<div class="books">${t.reads.map(b => `<div class="book"><span class="spine"></span><div><h3>${esc(b.t)}</h3><p class="author">${esc(b.a)}</p><p>${esc(b.w)}</p></div></div>`).join('')}</div>` : ''}
        ${t.practice?.length ? `<h3 class="subhead">動手練習</h3><ol class="practice">${t.practice.map(p => `<li>${esc(p)}</li>`).join('')}</ol>` : ''}
      </section>` : ''}
      ${studySection(t)}
      <section class="block" id="related"><h2 class="sec">相關主題</h2>
        <div class="grid three">${rel.map(r => card(r)).join('')}</div>
        ${S.moreRel === id ? (more.length ? `<h2 class="sec" style="margin-top:28px">再延伸一點</h2><div class="grid three">${more.map(r => card(r)).join('')}</div>` : '<p class="muted">已經沒有更遠的相關主題了。</p>') : `<button class="btn" id="moreRel" style="margin-top:16px">✦ 找更多相關主題</button>`}
      </section>
    </article>`;
  $('#saveT').onclick = () => { toggleSave(id); render(); };
  $('#moreRel')?.addEventListener('click', () => { S.moreRel = id; save(); render(); $('#related').scrollIntoView(); });
  $$('[data-act="start"]', app).forEach(b => b.onclick = () => { S.challenges[id] = { start: today(), days: {} }; log('challenge', id); save(); location.hash = `#/challenge/${id}`; });
  $$('[data-act="read"]', app).forEach(b => b.onclick = () => openQuiz(id));
  bindStudy(app, id);
  $$('[data-step]', app).forEach(c => c.onchange = () => {
    const e = S.exps[id] = S.exps[id] || { steps: [] };
    e.steps[+c.dataset.step] = c.checked; if (!e.started) { e.started = today(); log('exp', id); } save(); render(); $('#do').scrollIntoView();
  });
  bindReflect(app, 'exp', id);
  bindCards(app);
}

// 心得（體驗、挑戰、讀完）
function reflectionForm(kind) {
  return `<form class="reflect" data-kind="${kind}">
    <h3>${kind === 'challenge' ? '完成挑戰' : kind === 'exp' ? '完成這個體驗' : '讀完了'}</h3>
    <label>${kind === 'knowledge' ? '如果要跟朋友解釋這個主題，你會怎麼講？用自己的話寫兩三句（選填）' : '心得：印象最深的是什麼？下次想怎麼做？'}<textarea name="text" rows="${kind === 'knowledge' ? 4 : 3}" maxlength="600" ${kind === 'knowledge' ? 'placeholder="例如：其實就是……，最重要的是……"' : ''}></textarea></label>
    <div class="rate" role="radiogroup" aria-label="喜歡程度">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="rate" value="${n}" ${n === 4 ? 'checked' : ''}><span>${'★'.repeat(n)}</span></label>`).join('')}</div>
    <button class="btn primary" type="submit">完成</button>
  </form>`;
}
function reflectionView(r) {
  if (!r || (!r.text && !r.rate)) return '';
  return `<blockquote class="refl">${r.text ? esc(r.text) : ''}<footer>${r.rate ? '★'.repeat(r.rate) : ''}${r.quiz ? ` · 小測驗 ${r.quiz.ok}/${r.quiz.n}` : ''} · ${md(r.date || today())}</footer></blockquote>`;
}
function bindReflect(root, kind, id) {
  $$('form.reflect', root).forEach(f => f.onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(f);
    const r = { text: String(fd.get('text') || '').trim(), rate: +fd.get('rate'), date: today() };
    const before = new Set(TOPICS.filter(x => unlocked(x.id)).map(x => x.id));
    if (f.dataset.kind === 'exp') { Object.assign(S.exps[id], r, { done: true }); log('expdone', id, r.text); }
    if (f.dataset.kind === 'challenge') { Object.assign(S.challenges[id], r, { finished: today() }); log('chdone', id, r.text); }
    if (f.dataset.kind === 'knowledge') { S.read[id] = Object.assign(r, { quiz: quizScore }); log('read', id, r.text); closeModal(); }
    save(); render();
    const opened = TOPICS.filter(x => !before.has(x.id) && unlocked(x.id));
    const base = f.dataset.kind === 'knowledge' ? '記下來了。想再挖深一點，下面有延伸閱讀，自己去學了也可以記一筆。' : '恭喜完成！已加入你的旅程。';
    if (opened.length) toast(`${base}解鎖了 ${opened.length} 個新主題：${opened.slice(0, 3).map(x => '「' + x.title + '」').join('')}${opened.length > 3 ? '等' : ''}。`, '看技能樹', () => location.hash = '#/journey');
    else toast(base, '看我的旅程', () => location.hash = '#/journey');
  });
}
function openReflect(kind, id) {
  const m = $('#modal');
  m.innerHTML = `<div class="sheet">${reflectionForm(kind)}<button class="linkbtn" id="mclose">取消</button></div>`;
  m.hidden = false;
  $('#mclose').onclick = closeModal;
  bindReflect(m, kind, id);
}
function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }

// ================= 讀完小測驗（知識類）：3 題、不設門檻、可跳過，接著用自己的話講一次 =================
let quizScore = null;
function shuffled(arr, seed) { const r = rng(seed), a = arr.map((x, i) => [x, i]); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function openQuiz(id) {
  const qs = QUIZ[id];
  quizScore = null;
  if (!qs) { openReflect('knowledge', id); return; }
  const m = $('#modal'), seed = hash(id + Date.now());
  let i = 0, ok = 0;
  const step = () => {
    const [q, opts, ex] = qs[i];
    const order = shuffled(opts, seed + i);
    m.innerHTML = `<div class="sheet quiz">
      <p class="kicker"><span class="cat">QUIZ</span><span>${esc(T[id].title)}・第 ${i + 1} / ${qs.length} 題</span></p>
      <h3>${esc(q)}</h3>
      <div class="qopts">${order.map(([o, k]) => `<button type="button" class="qopt" data-k="${k}">${esc(o)}</button>`).join('')}</div>
      <div class="qex" hidden></div>
      <div class="row qnav"><button class="linkbtn" id="qskip">跳過測驗</button><button class="btn primary" id="qnext" hidden>${i + 1 < qs.length ? '下一題' : '看結果'}</button></div>
    </div>`;
    m.hidden = false;
    $$('.qopt', m).forEach(b => b.onclick = () => {
      const right = b.dataset.k === '0';
      if (right) ok++;
      $$('.qopt', m).forEach(x => { x.disabled = true; if (x.dataset.k === '0') x.classList.add('right'); });
      if (!right) b.classList.add('wrong');
      const e = $('.qex', m); e.hidden = false; e.innerHTML = `<b>${right ? '答對了' : '再想想'}</b>　${esc(ex)}`;
      $('#qnext', m).hidden = false; $('#qnext', m).focus();
    });
    $('#qnext', m).onclick = () => { i++; i < qs.length ? step() : done(); };
    $('#qskip', m).onclick = () => { quizScore = null; openReflect('knowledge', id); };
  };
  const done = () => {
    quizScore = { ok, n: qs.length };
    m.innerHTML = `<div class="sheet quiz"><p class="kicker"><span class="cat">QUIZ</span><span>${esc(T[id].title)}</span></p>
      <h3>答對 ${ok} / ${qs.length} 題</h3>
      <p class="muted">${ok === qs.length ? '重點都抓到了。' : '沒關係，答錯的地方正好是值得再看一次的地方。'}最後一步：試著用自己的話講一次，講得出來才是真的懂。</p>
      <button class="btn primary" id="qgo">用自己的話講一次</button></div>`;
    $('#qgo', m).onclick = () => openReflect('knowledge', id);
  };
  step();
}

// ================= 延伸學習與自學紀錄 =================
const KW = { sleep: '睡眠', microbiome: '腸道菌叢', bauhaus: '包浩斯', compound: '複利', memory: '記憶 心理學', llm: '大型語言模型', cooking: '家常菜 做法', running: '跑步 新手', python: 'Python 入門', bouldering: '抱石', plants: '室內植物 照顧', museum: '台中 博物館', neighborhood: '台中 老街 散步', photowalk: '街頭攝影', sunrise: '日出', market: '傳統市場', detox: '數位排毒', concert: '現場演出', hiking: '台中 郊山', stargaze: '觀星 入門', volunteer: '志工', stoic: '斯多葛主義', habit: '習慣 養成', filmlang: '電影語言 鏡頭', weather: '氣象學', index: '指數基金', hero: '英雄旅程 坎伯', wabisabi: '侘寂', strength: '重量訓練 入門', swim: '游泳 入門', writing: '寫作 練習', video: '手機 影片剪輯', piano: '鋼琴 入門', bread: '麵包 做法', basketball: '籃球 基本動作', cycling: '單車 路線', camping: '露營 新手', solotrip: '一個人旅行', pottery: '陶藝', usedbooks: '二手書店', letter: '手寫信', bookclub: '讀書會', sunset: '夕陽', movie: '電影 推薦', botanic: '植物 辨識', etymology: '英文字根', chinesechar: '漢字 演變', rock: '搖滾樂 歷史', hiphop: '嘻哈 歷史', soundsci: '泛音 音律', linguistics: '語言相對論', platform: '平台經濟', marketing: '品牌行銷', coffeechain: '咖啡 供應鏈', inflation: '通貨膨脹 利率', beatmaking: 'beat 製作', lyrics: '英文歌詞 學英文', english: '英文口說 練習', calligraphy: '書法 入門', origbook: '英文原文書 推薦', arduino: 'Arduino 入門', website: '個人網站 製作', lightroom: 'Lightroom 修圖', mealprep: '備餐', budget: '記帳 預算', badminton: '羽球 入門', sportmeal: '增肌 飲食', dance: '舞蹈 入門', album: '經典專輯', poetry: '現代詩', foreignmenu: '外語 點餐', roadrace: '5K 路跑 訓練', baseball: '中華職棒', nightmarket: '夜市 小吃', marketstall: '市集 擺攤', cookingclass: '料理課', teatasting: '品茶 入門' };
const kwOf = t => KW[t.id] || t.title;
const STUDY_TYPES = [['book', '讀書'], ['video', '看影片'], ['article', '讀文章'], ['practice', '實作'], ['outing', '出門'], ['talk', '跟人聊']];
const STYPE = Object.fromEntries(STUDY_TYPES);
const fmtMin = m => m >= 60 ? `${Math.floor(m / 60)} 小時${m % 60 ? ` ${m % 60} 分` : ''}` : `${m} 分鐘`;
const safeUrl = u => /^https?:\/\/[^\s]+$/i.test(u || '') ? u : '';
function searchLinks(t) {
  const q = encodeURIComponent(kwOf(t));
  const links = [['維基百科', `https://zh.wikipedia.org/w/index.php?search=${q}`], ['YouTube', `https://www.youtube.com/results?search_query=${q}`], ['Google', `https://www.google.com/search?q=${q}`]];
  if (t.cat === 'knowledge') links.push(['Google 學術', `https://scholar.google.com/scholar?q=${q}`]);
  return links.map(([n, u]) => `<a class="btn ghost" href="${u}" target="_blank" rel="noopener noreferrer">${n} ↗</a>`).join('');
}
function logItem(l, withTopic) {
  const u = safeUrl(l.url);
  return `<li class="slog">
    <p class="kicker"><span class="cat">${esc(STYPE[l.type] || '自學')}</span><span>${md(l.date)}</span><span>${fmtMin(l.min)}</span>${withTopic && T[l.topic] ? `<a href="#/topic/${l.topic}">${esc(T[l.topic].title)}</a>` : ''}</p>
    ${l.text ? `<p class="stext">${esc(l.text)}</p>` : ''}
    ${u ? `<p class="small"><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u.replace(/^https?:\/\//, '').slice(0, 60))} ↗</a></p>` : ''}
    <button class="linkbtn" data-editlog="${l.id}">編輯</button>
  </li>`;
}
function studySection(t) {
  const mine = logsOf(t.id).slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const n = Math.min(2, mine.length);
  return `<section class="block study" id="study"><h2 class="sec">自己再挖深一點</h2>
    <p class="muted">讀完簡介只是開始。挑一個方向自己找下去：讀一本上面的書、看一支影片、動手做一次練習。${n < 2 ? `學完回來記一筆，技能樹這個主題會再亮一格（目前自學 ${n}/2）。` : '學完回來記一筆，就會累積到你的自學時數（這個主題的自學點數已滿 2/2）。'}</p>
    <h3 class="subhead">從這裡找下去</h3>
    <div class="actions">${searchLinks(t)}</div>
    <h3 class="subhead">我的自學紀錄${mine.length ? `・${mine.length} 筆、共 ${fmtMin(mine.reduce((s, l) => s + l.min, 0))}` : ''}</h3>
    ${mine.length ? `<ul class="slogs">${mine.map(l => logItem(l, false)).join('')}</ul>` : '<p class="muted small">還沒有紀錄。</p>'}
    <div class="actions" style="margin-top:12px"><button class="btn primary" data-newlog="${t.id}">＋ 我自己去學了</button></div>
  </section>`;
}
function bindStudy(root, topic) {
  $$('[data-newlog]', root).forEach(b => b.onclick = () => openLog({ topic: b.dataset.newlog || topic || '' }));
  $$('[data-editlog]', root).forEach(b => b.onclick = () => openLog(S.logs.find(l => l.id === b.dataset.editlog)));
}
function topicOptions(sel) {
  const ok = TOPICS.filter(t => unlocked(t.id) || t.id === sel);
  return Object.keys(CATS).map(c => `<optgroup label="${CATS[c].zh}">${ok.filter(t => t.cat === c).map(t => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.title)}</option>`).join('')}</optgroup>`).join('');
}
function openLog(l) {
  if (!l) return;
  const editing = !!l.id;
  const m = $('#modal');
  m.innerHTML = `<form class="sheet logform" novalidate>
    <h3>${editing ? '編輯自學紀錄' : '我自己去學了'}</h3>
    <label class="field">主題<select name="topic" required><option value="">選一個主題</option>${topicOptions(l.topic)}</select></label>
    <fieldset class="field"><legend>怎麼學的</legend><div class="opts chips">${STUDY_TYPES.map(([v, n], i) => `<label class="opt"><input type="radio" name="type" value="${v}" ${(l.type || 'book') === v ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div></fieldset>
    <label class="field">花了幾分鐘<input type="number" name="min" min="1" max="600" step="1" inputmode="numeric" value="${l.min || 30}" required></label>
    <label class="field">學到什麼、做了什麼<textarea name="text" rows="4" maxlength="800" placeholder="例如：看完一支講黑洞影像的影片，原來那個亮環是……" required>${esc(l.text || '')}</textarea></label>
    <label class="field">連結（選填，文章或影片網址）<input type="url" name="url" maxlength="500" placeholder="https://" value="${esc(l.url || '')}"></label>
    <p class="err" id="logerr" hidden></p>
    <div class="row"><button class="btn primary" type="submit">${editing ? '儲存' : '記下來'}</button><button class="linkbtn" type="button" id="lcancel">取消</button>${editing ? '<button class="btn danger" type="button" id="ldel">刪除</button>' : ''}</div>
  </form>`;
  m.hidden = false;
  const f = $('form', m);
  $('#lcancel', m).onclick = closeModal;
  if (editing) { const d = $('#ldel', m); let armed = false; d.onclick = () => { if (!armed) { armed = true; d.textContent = '再按一次確認刪除'; setTimeout(() => { armed = false; d.textContent = '刪除'; }, 3000); return; } S.logs = S.logs.filter(x => x.id !== l.id); save(); closeModal(); render(); toast('已刪除這筆紀錄。'); }; }
  f.onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(f);
    const topic = String(fd.get('topic') || ''), min = Math.round(+fd.get('min')), text = String(fd.get('text') || '').trim(), url = String(fd.get('url') || '').trim();
    const miss = [];
    if (!T[topic]) miss.push('主題'); if (!(min >= 1 && min <= 600)) miss.push('分鐘（1–600）'); if (!text) miss.push('學到什麼');
    if (url && !safeUrl(url)) miss.push('連結要以 http:// 或 https:// 開頭');
    if (miss.length) { const el = $('#logerr', m); el.hidden = false; el.textContent = `請確認：${miss.join('、')}`; return; }
    const rec = { topic, type: String(fd.get('type') || 'book'), min, text, url, date: l.date || today() };
    const before = pts(T[topic]);
    if (editing) Object.assign(S.logs.find(x => x.id === l.id), rec);
    else { S.logs.push(Object.assign(rec, { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) })); log('study', topic, text); if (!S.viewed[topic]) S.viewed[topic] = today(); }
    save(); closeModal(); render();
    if (editing) { toast('已更新。'); return; }
    const gain = pts(T[topic]) - before;
    const total = S.logs.reduce((s, x) => s + x.min, 0);
    toast(`記下來了！累積自學 ${fmtMin(total)}${gain > 0 ? `，「${T[topic].title}」技能樹 +${gain}` : ''}。`, '看我的紀錄', () => goTo('#/journey', 'studylog'));
  };
}
// 首頁「接著挖深」：挑一個完成了、但還沒有自學紀錄滿 2 筆的主題，附一個具體的下一步，每天換一個
function digCard() {
  const cand = TOPICS.filter(t => isDone(t.id) && logsOf(t.id).length < 2);
  if (!cand.length) return '';
  const r = rng(hash(today() + 'dig'));
  const pick = cand.sort((a, b) => (logsOf(a.id).length - logsOf(b.id).length) || (hash(today() + a.id) - hash(today() + b.id)))[0];
  const ideas = [...(pick.reads || []).map(b => `讀讀看${b.t}（${b.a}）：${b.w}`), ...(pick.practice || []), ...pick.next];
  const idea = ideas[Math.floor(r() * ideas.length)];
  return `<section class="block dig"><h2 class="sec">接著挖深</h2>
    <div class="digcard cat-${pick.cat}"><span class="ticon">${icon(pick.id, 30)}</span><div>
      <p class="kicker"><span class="cat">${CATS[pick.cat].en}</span><span>你已經完成了這個主題</span><span>自學 ${logsOf(pick.id).length}/2</span></p>
      <h3><a href="#/topic/${pick.id}">${esc(pick.title)}</a></h3>
      <p>今天可以試試：${esc(idea)}</p>
      <div class="actions"><button class="btn primary" data-newlog="${pick.id}">＋ 學完記一筆</button><button class="btn" data-gostudy="${pick.id}">找延伸資料</button></div>
    </div></div></section>`;
}

// ================= Hobby Starter：七天挑戰 =================
function renderChallenge(app, id) {
  const t = T[id];
  const c = S.challenges[id];
  if (!t?.challenge || !c) { location.hash = `#/topic/${id}`; return; }
  const doneN = t.challenge.filter((_, i) => c.days[i + 1]?.done).length;
  const sugg = Math.min(7, diffDays(c.start, today()) + 1);
  app.innerHTML = `
    <section class="hero small cat-${t.cat}">
      <p class="eyebrow"><a href="#/topic/${id}">← ${esc(t.title)}</a> · Hobby Starter</p>
      <h1>七天${esc(t.title)}挑戰</h1>
      <p class="lede">${md(c.start)} 開始 · ${c.finished ? `已在 ${md(c.finished)} 完成` : `今天建議做第 ${sugg} 天`}</p>
      <div class="progress"><span style="width:${doneN / 7 * 100}%"></span></div>
      <p class="muted">${doneN} / 7 天完成</p>
    </section>
    <ol class="days">${t.challenge.map((d, i) => { const n = i + 1, s = c.days[n] || {}; return `
      <li class="day ${s.done ? 'done' : ''} ${n === sugg && !c.finished ? 'today' : ''}">
        <label class="dhead"><input type="checkbox" data-day="${n}" ${s.done ? 'checked' : ''} ${c.finished ? 'disabled' : ''}>
          <span class="dn">DAY ${n}</span><span class="dt"><b>${esc(d.t)}</b><span class="muted">約 ${d.min} 分鐘</span></span></label>
        <p class="dd">${esc(d.d)}</p>
        <textarea data-note="${n}" rows="2" maxlength="400" placeholder="筆記：做了什麼、卡在哪、發現什麼" ${c.finished ? 'readonly' : ''}>${esc(s.note || '')}</textarea>
      </li>`; }).join('')}</ol>
    <section class="block">
      ${c.finished ? reflectionView(c) : doneN === 7 ? reflectionForm('challenge') : `<p class="muted">七天都打勾後就能完成挑戰、寫下心得。不一定要連續七天，照自己的節奏就好。</p>`}
      ${!c.finished ? '<button class="linkbtn" id="quit">放棄這個挑戰</button>' : ''}
    </section>`;
  $$('[data-day]', app).forEach(cb => cb.onchange = () => {
    const n = cb.dataset.day; c.days[n] = c.days[n] || {}; c.days[n].done = cb.checked;
    if (cb.checked) log('day', id, `第 ${n} 天：${t.challenge[n - 1].t}`);
    save(); const y = scrollY; render(); scrollTo(0, y);
  });
  $$('[data-note]', app).forEach(ta => ta.onchange = () => {
    const n = ta.dataset.note; c.days[n] = c.days[n] || {}; c.days[n].note = ta.value.trim(); save();
  });
  const q = $('#quit');
  if (q) { let armed = false; q.onclick = () => { if (!armed) { armed = true; q.textContent = '再按一次確認放棄（筆記會刪除）'; setTimeout(() => { armed = false; q.textContent = '放棄這個挑戰'; }, 3000); return; } delete S.challenges[id]; log('quit', id); save(); location.hash = `#/topic/${id}`; }; }
  bindReflect(app, 'challenge', id);
}

// ================= My Journey =================
const EV = { undismiss: '放回了', start: '開始了 EXPLORE', view: '探索了', save: '收藏了', challenge: '開始七天挑戰：', day: '完成', chdone: '完成挑戰：', exp: '開始體驗：', expdone: '完成體驗：', read: '讀完了', shuffle: '抽了一次新發現', dismiss: '略過了', profile: '更新了興趣設定', quit: '放棄挑戰：', study: '自學了' };
function renderJourney(app) {
  const viewed = Object.keys(S.viewed);
  const catN = c => viewed.filter(id => T[id]?.cat === c).length;
  const finishedCh = Object.entries(S.challenges).filter(([, c]) => c.finished);
  const going = Object.entries(S.challenges).filter(([, c]) => !c.finished);
  const doneEx = Object.entries(S.exps).filter(([, e]) => e.done);
  const notes = [];
  Object.entries(S.challenges).forEach(([id, c]) => Object.entries(c.days || {}).forEach(([n, d]) => d.note && notes.push({ id, where: `七天挑戰 · 第 ${n} 天`, text: d.note })));
  [...finishedCh, ...doneEx].forEach(([id, r]) => r.text && notes.push({ id, where: '心得', text: r.text }));
  Object.entries(S.read).forEach(([id, r]) => r.text && notes.push({ id, where: '用自己的話講', text: r.text }));
  const totalMin = S.logs.reduce((s, l) => s + l.min, 0);
  const weekAgo = fmt(new Date(Date.now() - 6 * 86400000));
  const weekMin = S.logs.filter(l => l.date >= weekAgo).reduce((s, l) => s + l.min, 0);
  const slog = S.logs.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const activeDays = new Set(S.events.map(e => e.d.slice(0, 10))).size;
  const evs = S.events.filter(e => !['shuffle', 'unsave'].includes(e.type)).slice().reverse().slice(0, 60);
  const groups = {};
  evs.forEach(e => { const d = fmt(new Date(e.d)); (groups[d] = groups[d] || []).push(e); });
  const total = viewed.length || 1;
  app.innerHTML = `
    <section class="hero small">
      <p class="eyebrow">My Journey · 從 ${md(S.first || today())} 開始</p>
      <h1>${esc(S.profile.name)} 的探索旅程</h1>
    </section>
    <section class="stats">
      <div><b>${viewed.length}</b><span>探索過的主題</span></div>
      <div><b>${Object.keys(S.saved).length}</b><span>收藏</span></div>
      <div><b>${finishedCh.length}</b><span>完成的挑戰</span></div>
      <div><b>${doneEx.length}</b><span>完成的體驗</span></div>
      <div><b>${(totalMin / 60).toFixed(totalMin && totalMin < 600 ? 1 : 0)}</b><span>自學小時</span></div>
      <div><b>${activeDays}</b><span>活躍天數</span></div>
    </section>
    <section class="block study" id="studylog"><h2 class="sec">我的學習紀錄</h2>
      <div class="sstats"><div><b>${S.logs.length}</b><span>自學筆數</span></div><div><b>${fmtMin(totalMin)}</b><span>累積時間</span></div><div><b>${fmtMin(weekMin)}</b><span>最近 7 天</span></div><div><b>${new Set(S.logs.map(l => l.topic)).size}</b><span>延伸過的主題</span></div></div>
      <div class="actions" style="margin:14px 0"><button class="btn primary" data-newlog="">＋ 記一筆自學</button></div>
      ${slog.length ? `<ul class="slogs">${slog.map(l => logItem(l, true)).join('')}</ul>` : '<p class="muted">讀完一個主題後，自己去找書、看影片、動手做，回來記一筆，就會出現在這裡。</p>'}
    </section>
    <section class="block tree-block"><h2 class="sec">技能樹</h2>
      <div id="tree"></div>
    </section>
    ${going.length ? `<section class="block"><h2 class="sec">進行中的挑戰</h2>${going.map(([id, c]) => { const n = Object.values(c.days).filter(x => x.done).length; return `<a class="mini" href="#/challenge/${id}"><b>${esc(T[id].title)}</b><span>${n}/7 天</span><span class="bar"><i style="width:${n / 7 * 100}%"></i></span></a>`; }).join('')}</section>` : ''}
    <section class="block"><h2 class="sec">收藏</h2>${Object.keys(S.saved).length ? `<div class="grid three">${Object.keys(S.saved).map(id => T[id]).filter(Boolean).map(t => card(t)).join('')}</div>` : '<p class="muted">還沒有收藏。看到喜歡的主題按 ♡ 就會出現在這裡。</p>'}</section>
    <section class="block"><h2 class="sec">完成的挑戰與體驗</h2>${finishedCh.length + doneEx.length ? `<div class="done-list">${[...finishedCh.map(([id, c]) => ({ id, r: c, k: '七天挑戰' })), ...doneEx.map(([id, e]) => ({ id, r: e, k: '體驗' }))].map(x => `<div class="done-item"><p class="kicker"><span class="cat">${x.k}</span></p><h3><a href="#/${x.k === '七天挑戰' ? 'challenge' : 'topic'}/${x.id}">${esc(T[x.id].title)}</a></h3>${reflectionView(x.r)}</div>`).join('')}</div>` : '<p class="muted">完成一個七天挑戰或體驗後，心得會留在這裡。</p>'}</section>
    <section class="block"><h2 class="sec">我的筆記</h2>${notes.length ? `<ul class="notes">${notes.map(n => `<li><a href="#/topic/${n.id}">${esc(T[n.id].title)}</a><span class="muted"> · ${n.where}</span><p>${esc(n.text)}</p></li>`).join('')}</ul>` : '<p class="muted">挑戰裡的每日筆記和完成心得會整理在這裡。</p>'}</section>
    <section class="block"><h2 class="sec">時間軸</h2>
      <div class="timeline">${Object.entries(groups).map(([d, es]) => `<div class="tday"><h3>${md(d)}</h3><ul>${es.map(e => `<li><span class="dot ${e.id ? 'cat-' + T[e.id]?.cat : ''}"></span>${EV[e.type] || e.type}${e.id && T[e.id] ? `<a href="#/topic/${e.id}">「${esc(T[e.id].title)}」</a>` : ''}${e.type === 'day' ? ` <span class="muted">${esc(e.text)}</span>` : ''}</li>`).join('')}</ul></div>`).join('') || '<p class="muted">還沒有紀錄。</p>'}</div>
    </section>
    <section class="block settings" id="stylebox"><h2 class="sec">視覺風格</h2>
      <div class="stylegrid">${STYLES.map(([k, n, d]) => `<button type="button" class="stylepick" data-pick="${k}" aria-pressed="${k === curStyle()}">
        <span class="pv" data-style="${k}"><b>EXPLORE</b><span class="pc"><span class="pt">睡眠的科學</span><span class="pb"><i style="background:var(--k)"></i><i style="background:var(--h)"></i><i style="background:var(--e)"></i></span><span class="pbtn">開始探索</span></span></span>
        <span class="nm"><b>${n}${k === curStyle() ? '・使用中' : ''}</b><span>${d}</span></span></button>`).join('')}</div>
      <p class="muted small" style="margin-top:10px">登入 Google 後，選好的風格會跟著帳號同步到其他裝置。頂部的 <span aria-hidden="true">◐</span> 按鈕也可以快速輪換。</p>
    </section>
    <section class="block settings"><h2 class="sec">設定</h2>
      <div class="actions"><a class="btn" href="#/onboard">修改興趣與偏好</a><button class="btn" id="exp">匯出備份</button><label class="btn">匯入備份<input type="file" id="imp" accept="application/json" hidden></label><button class="btn danger" id="wipe">清除所有資料</button></div>
    </section>
    <section class="block settings" id="acctBox"><h2 class="sec">帳號與同步</h2><div data-acct="settings"></div></section>`;
  bindCards(app);
  bindStudy(app);
  STYLES.forEach(([k]) => loadStyleFonts(k));
  $$('[data-pick]', app).forEach(b => b.onclick = () => setStyle(b.dataset.pick));
  renderTree($('#tree'));
  $('#exp').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
    a.download = `explore-backup-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#imp').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(txt => { try { const d = JSON.parse(txt); if (!d.profile) throw new Error('不是 EXPLORE 的備份檔'); S = migrate(d); save(); render(); toast('匯入完成'); } catch (err) { toast('匯入失敗：' + err.message); } });
  };
  const w = $('#wipe'); let armed = false;
  w.onclick = () => { if (!armed) { armed = true; w.textContent = '再按一次確認清除'; setTimeout(() => { armed = false; w.textContent = '清除所有資料'; }, 3000); return; } S = blank(); save(); location.hash = '#/home'; render(); };
}

// ================= 技能樹 =================
// 每個節點 7 點：看過 1、收藏 1、完成 3（嗜好：挑戰每 2 天 1 點；體驗：每完成一步 1 點）、自學紀錄每筆 1（最多 2）
function donePts(t) {
  if (t.cat === 'knowledge') return S.read[t.id] ? 3 : 0;
  if (t.cat === 'hobby') { const c = S.challenges[t.id]; if (!c) return 0; if (c.finished) return 3; return Math.min(3, Math.floor(Object.values(c.days || {}).filter(d => d.done).length / 2)); }
  const e = S.exps[t.id]; if (!e) return 0; return e.done ? 3 : Math.min(3, (e.steps || []).filter(Boolean).length);
}
const logPts = t => Math.min(2, logsOf(t.id).length);
const MAXPTS = 7;
const pts = t => (S.viewed[t.id] ? 1 : 0) + (S.saved[t.id] ? 1 : 0) + donePts(t) + logPts(t);
// 16 個興趣分枝：一個主題有幾個興趣標籤，就出現在幾個分枝（點數共用）
const BRANCH_ORDER = ['sci', 'tech', 'biz', 'psych', 'phil', 'lang', 'hist', 'art', 'photo', 'media', 'music', 'craft', 'food', 'health', 'sport', 'nature'];
const BRANCH_COL = { sci: '#2f5d8a', tech: '#4a6fa5', biz: '#7a6a2f', psych: '#8a4f7d', phil: '#5b4b8a', lang: '#3d7f8c', hist: '#8c5a3c', art: '#b4532a', photo: '#c47f2c', media: '#a33f4f', music: '#b05f8a', craft: '#8f6e4a', food: '#c0632f', health: '#4f8a5b', sport: '#2f7f6f', nature: '#55632b' };
let treeCache = null;
function buildTree() {
  if (treeCache) return treeCache;
  const out = {};
  for (const tag of BRANCH_ORDER) {
    const list = TOPICS.filter(t => t.tags.includes(tag));
    const ids = new Set(list.map(t => t.id));
    const nb = t => list.filter(x => x.id !== t.id && (t.related.includes(x.id) || x.related.includes(t.id)));
    // 由淺入深：照 levels.js 的四層排，內圈入門、外圈深入。
    // 每個節點接到上一層的相關主題；沒有相關的就接到上一層位置最接近的那個
    const tiers = LEVELS[tag].map(l => l.map(id => T[id]).filter(Boolean));
    list.forEach(t => { if (!tiers.some(l => l.includes(t))) tiers[tiers.length - 1].push(t); });
    const parent = {}, posKey = {};
    tiers.forEach((tier, k) => {
      if (k > 0) {
        const prev = tiers[k - 1];
        tier.forEach(t => { const r = nb(t).filter(x => prev.includes(x)); t._pk = r.length ? r.reduce((s, x) => s + posKey[x.id], 0) / r.length : 0.5; });
        tier.sort((a, b) => a._pk - b._pk);
      }
      tier.forEach((t, j) => {
        posKey[t.id] = tier.length > 1 ? j / (tier.length - 1) : 0.5;
        if (k === 0) { parent[t.id] = null; return; }
        const prev = tiers[k - 1], r = nb(t).filter(x => prev.includes(x));
        const cand = r.length ? r : prev;
        parent[t.id] = cand.slice().sort((a, b) => Math.abs(posKey[a.id] - posKey[t.id]) - Math.abs(posKey[b.id] - posKey[t.id]))[0].id;
      });
    });
    tiers.flat().forEach(t => delete t._pk);
    out[tag] = { tiers, parent, ids };
  }
  return (treeCache = out);
}
const branchPts = tag => TOPICS.filter(t => t.tags.includes(tag)).reduce((s, t) => s + pts(t), 0);

// 把一層拆成多排：每排最多 cap 個
function rowsOf(tiers, capAt) {
  const rows = []; let k = 0;
  tiers.forEach(tier => {
    let rest = tier.slice();
    while (rest.length) { const cap = Math.max(1, capAt(k)); rows.push(rest.splice(0, cap)); k++; }
  });
  return rows;
}
// 放射狀：每個分枝佔 360/16 度；每排的容量依半徑計算，保證和相鄰分枝的節點不重疊
function layoutRadial(cx, cy) {
  const T = buildTree(), pos = {}, HUB = 150, R0 = 230, ROW = 58, NODE = 48;
  const sector = 2 * Math.PI / BRANCH_ORDER.length;
  let maxR = 0;
  BRANCH_ORDER.forEach((tag, i) => {
    const th = -Math.PI / 2 + i * sector;
    pos['hub-' + tag] = { x: cx + HUB * Math.cos(th), y: cy + HUB * Math.sin(th), th };
    const rows = rowsOf(T[tag].tiers, k => Math.floor((R0 + k * ROW) * sector / NODE));
    rows.forEach((row, k) => {
      const r = R0 + k * ROW; maxR = Math.max(maxR, r);
      const step = NODE / r;
      // 交錯排的節點稍微錯開，避免和上一排對齊時徽章重疊
      const shift = (k % 2 && row.length < Math.floor(r * sector / NODE)) ? step / 2 : 0;
      row.forEach((t, j) => { const a = th + (j - (row.length - 1) / 2) * step + shift; pos[tag + ':' + t.id] = { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }; });
    });
  });
  // 節點下方還有進度徽章：把每個節點當成「圓＋徽章」的方框，互相推開到不重疊
  const keys = Object.keys(pos).filter(k => !k.startsWith('hub-'));
  const hubs = Object.keys(pos).filter(k => k.startsWith('hub-'));
  const BW = 50, BH = 66, OFF = 9, HW = 90, HH = 100;
  for (let it = 0; it < 80; it++) {
    let moved = 0;
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = pos[keys[i]], b = pos[keys[j]];
        const ox = BW - Math.abs(a.x - b.x), oy = BH - Math.abs(a.y - b.y);
        if (ox <= 0 || oy <= 0) continue;
        moved++;
        if (ox < oy) { const d = (ox / 2 + 0.5) * (a.x < b.x ? -1 : 1); a.x += d; b.x -= d; }
        else { const d = (oy / 2 + 0.5) * (a.y < b.y ? -1 : 1); a.y += d; b.y -= d; }
      }
      // 分枝圓心固定不動，只推開節點
      for (const h of hubs) {
        const a = pos[keys[i]], b = pos[h];
        const ox = HW - Math.abs(a.x - b.x), oy = HH - Math.abs(a.y - b.y);
        if (ox <= 0 || oy <= 0) continue;
        moved++;
        if (ox < oy) a.x += (ox + 1) * (a.x < b.x ? -1 : 1); else a.y += (oy + 1) * (a.y < b.y ? -1 : 1);
      }
    }
    if (!moved) break;
  }
  keys.forEach(k => { const p = pos[k]; maxR = Math.max(maxR, Math.hypot(p.x - cx, p.y - cy + OFF)); });
  return { pos, maxR };
}
// 單一分枝（手機）：從下往上長
function layoutSingle(tag, W) {
  const T = buildTree()[tag], pos = {}, ROW = 80, GAP = 64;
  const rows = rowsOf(T.tiers, () => 6);
  const oy = 110 + rows.length * ROW;
  pos['hub-' + tag] = { x: W / 2, y: oy };
  rows.forEach((row, k) => row.forEach((t, j) => { pos[tag + ':' + t.id] = { x: W / 2 + (j - (row.length - 1) / 2) * GAP, y: oy - 70 - (k + 1) * ROW + 40 }; }));
  return { pos, H: oy + 90 };
}

let treeSel = null, treeBranch = null, treeFocus = false;
function nodeSvg(tag, t, p, col, dim) {
  const T = buildTree()[tag];
  const n = pts(t);
  const locked = !unlocked(t.id);
  const st = n >= MAXPTS ? 'full' : n > 0 ? 'part' : locked ? 'locked' : 'open';
  return `<g class="node ${st} ${treeSel === t.id ? 'sel' : ''} ${dim ? 'dim' : ''}" data-node="${t.id}" tabindex="0" role="button" aria-label="${esc(INT[tag])}：${esc(t.title)}，${n}/${MAXPTS}" style="--c:${col}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})">
    <circle r="21" class="ring"/>
    <g transform="translate(-10.5 -10.5)" class="ic">${icon(t.id, 21).replace('<svg ', '<svg x="0" y="0" ')}</g>
    <g transform="translate(0 30)"><rect x="-14" y="-7.5" width="28" height="15" rx="7.5" class="badge"/><text y="4" text-anchor="middle">${n}/${MAXPTS}</text></g>
    ${locked ? `<g transform="translate(-22 12)" class="lock"><rect x="-5" y="-2" width="10" height="8" rx="1.5"/><path d="M-3 -2v-2a3 3 0 0 1 6 0v2" fill="none"/></g>` : ''}
    <title>${esc(INT[tag])}・${esc(t.title)}</title>
  </g>`;
}
function renderTree(box) {
  if (!box) return;
  const narrow = box.clientWidth < 720 || treeFocus;
  const mine = new Set(S.profile?.interests || []);
  const T = buildTree();
  if (!treeBranch) treeBranch = BRANCH_ORDER.find(t => mine.has(t)) || 'sci';
  const lines = [], nodes = [], hubs = [];
  let vb;
  if (!narrow) {
    const C = 900, { pos, maxR } = layoutRadial(C, C);
    const ext = maxR + 70;
    vb = `${C - ext} ${C - ext} ${ext * 2} ${ext * 2}`;
    BRANCH_ORDER.forEach(tag => {
      const col = BRANCH_COL[tag], dim = !mine.has(tag) && branchPts(tag) === 0;
      const h = pos['hub-' + tag];
      lines.push(`<line x1="${C}" y1="${C}" x2="${h.x}" y2="${h.y}" stroke="${col}" stroke-width="2" opacity="${dim ? 0.3 : 0.8}"/>`);
      T[tag].tiers.flat().forEach(t => {
        const p = pos[tag + ':' + t.id], pp = T[tag].parent[t.id] ? pos[tag + ':' + T[tag].parent[t.id]] : h;
        const lit = pts(t) > 0;
        lines.push(`<line x1="${pp.x.toFixed(1)}" y1="${pp.y.toFixed(1)}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="${lit ? col : 'var(--line)'}" stroke-width="${lit ? 3 : 1.4}" opacity="${dim ? 0.45 : 1}"/>`);
        nodes.push(nodeSvg(tag, t, p, col, dim));
      });
      const total = branchPts(tag);
      hubs.push(`<g class="hub ${dim ? 'dim' : ''} ${tag === treeBranch ? '' : ''}" style="--c:${col}" transform="translate(${h.x.toFixed(1)} ${h.y.toFixed(1)})" data-hub="${tag}" tabindex="0" role="button" aria-label="放大看${esc(INT[tag])}分枝">
        <circle r="30" class="ring"/><text y="-2" text-anchor="middle" class="hn">${esc(INT[tag])}</text><text y="13" text-anchor="middle" class="hv">${total} 點・Lv ${Math.floor(total / 10)}</text>
        <title>${esc(INT[tag])}：${T[tag].tiers.flat().length} 個主題</title></g>`);
    });
    const tot = TOPICS.reduce((s, t) => s + pts(t), 0);
    hubs.push(`<g class="hub you" transform="translate(${C} ${C})"><circle r="44" class="ring"/><text y="-2" text-anchor="middle" class="yt">你</text><text y="18" text-anchor="middle" class="hs">${tot} 點</text></g>`);
  } else {
    const W = 440, { pos, H } = layoutSingle(treeBranch, W);
    vb = `0 0 ${W} ${H}`;
    const tag = treeBranch, col = BRANCH_COL[tag], h = pos['hub-' + tag];
    T[tag].tiers.forEach((tier, k) => { const p = pos[tag + ':' + tier[0].id]; lines.push(`<text x="8" y="${(p.y + 4).toFixed(1)}" class="lvl ${layerOpen(tag, k) ? '' : 'off'}">${k + 1} ${LEVEL_NAMES[k]}</text>`); });
    T[tag].tiers.flat().forEach(t => {
      const p = pos[tag + ':' + t.id], pp = T[tag].parent[t.id] ? pos[tag + ':' + T[tag].parent[t.id]] : h;
      const lit = pts(t) > 0;
      lines.push(`<line x1="${pp.x}" y1="${pp.y}" x2="${p.x}" y2="${p.y}" stroke="${lit ? col : 'var(--line)'}" stroke-width="${lit ? 3 : 1.5}"/>`);
      nodes.push(nodeSvg(tag, t, p, col, false));
    });
    const total = branchPts(tag);
    hubs.push(`<g class="hub" style="--c:${col}" transform="translate(${h.x} ${h.y})"><circle r="32" class="ring"/><text y="-2" text-anchor="middle" class="hn">${esc(INT[tag])}</text><text y="13" text-anchor="middle" class="hv">Lv ${Math.floor(total / 10)}</text><text y="54" text-anchor="middle" class="hp">${total}<tspan class="hs"> 點</tspan></text></g>`);
  }
  const sel = treeSel && TOPICS.find(t => t.id === treeSel);
  box.innerHTML = `
    ${narrow ? `<div class="row treebar">${treeFocus ? '<button class="btn" id="treeAll">← 回到全部分枝</button>' : ''}<label class="field treepick">分枝<select id="brsel">${BRANCH_ORDER.map(t => `<option value="${t}" ${t === treeBranch ? 'selected' : ''}>${INT[t]}${mine.has(t) ? ' ★' : ''}（${branchPts(t)} 點）</option>`).join('')}</select></label></div>` : ''}
    <div class="treewrap"><svg viewBox="${vb}" class="tree ${narrow ? 'focus' : 'radial'}" role="group" aria-label="技能樹">${lines.join('')}${nodes.join('')}${hubs.join('')}</svg></div>
    <div class="treelegend"><span><i class="lg full"></i>7/7 滿點</span><span><i class="lg part"></i>進行中</span><span><i class="lg open"></i>可以探索</span><span><i class="lg locked"></i>尚未解鎖</span><span class="muted">由內往外：入門 → 基礎 → 進階 → 深入，上一層完成一個就解鎖下一層・看過 +1、收藏 +1、完成 +3、自學紀錄 +2・${narrow ? '★ 是你選的興趣' : '淡色分枝是還沒選、也還沒探索的領域・點分枝中心可以放大'}</span></div>
    <div class="treeinfo">${sel ? (() => { const n = pts(sel), d = donePts(sel); return `<div class="tsel cat-${sel.cat}"><span class="ticon">${icon(sel.id, 26)}</span><div><p class="kicker"><span class="cat">${CATS[sel.cat].en}</span><span>${n}/${MAXPTS}</span><span>${sel.tags.map(g => INT[g]).join('・')}</span></p><h3>${esc(sel.title)}</h3>
      <ul class="pts"><li class="${S.viewed[sel.id] ? 'ok' : ''}">看過 +1</li><li class="${S.saved[sel.id] ? 'ok' : ''}">收藏 +1</li><li class="${d ? 'ok' : ''}">${sel.cat === 'knowledge' ? '讀完' : sel.cat === 'hobby' ? '七天挑戰' : '完成體驗'} +${d}/3</li><li class="${logPts(sel) ? 'ok' : ''}">自學紀錄 +${logPts(sel)}/2</li></ul>
      ${unlocked(sel.id) ? `<a class="btn primary" href="#/topic/${sel.id}">前往主題</a>` : `<p class="lockline">🔒 ${esc(unlockHint(sel.id))}</p>`}</div></div>`; })() : '<p class="muted">點一個節點看詳細進度。</p>'}</div>`;
  $$('[data-node]', box).forEach(g => {
    const pick = () => { treeSel = g.dataset.node; renderTree(box); };
    g.addEventListener('click', pick);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
  $('#brsel', box)?.addEventListener('change', e => { treeBranch = e.target.value; treeSel = null; renderTree(box); });
  $('#treeAll', box)?.addEventListener('click', () => { treeFocus = false; renderTree(box); });
  $$('[data-hub]', box).forEach(g => { const go = () => { treeBranch = g.dataset.hub; treeFocus = true; treeSel = null; renderTree(box); }; g.addEventListener('click', go); g.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); });
}
window.addEventListener('resize', () => { const b = $('#tree'); if (b) renderTree(b); });

$('#styleBtn')?.addEventListener('click', () => { const i = STYLES.findIndex(([k]) => k === curStyle()); setStyle(STYLES[(i + 1) % STYLES.length][0]); });
render();
if (wasReset) toast('EXPLORE 改版了：所有進度已重置，請重新填一次問卷。');
