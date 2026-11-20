'use strict';

// ================= 狀態（只存在這個瀏覽器） =================
const KEY = 'explore-v1';
const blank = () => ({ profile: null, first: null, saved: {}, dismissed: {}, viewed: {}, read: {}, challenges: {}, exps: {}, events: [], daily: null, fresh: [] });
let S = load();
function load() { try { return Object.assign(blank(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch { return blank(); } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* 無法儲存時照常運作 */ } }

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
const PAL = {
  knowledge: ['#22406b', '#c9a227', '#e8dfcf', '#8aa1c1'],
  hobby: ['#b4532a', '#253a52', '#efe3cf', '#e2a372'],
  experience: ['#55632b', '#d98c3f', '#ece4d2', '#a9b46b'],
};
function visual(t, cls = '') {
  const r = rng(hash(t.id));
  const [a, b, bg, c] = PAL[t.cat];
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
  return `<svg class="vis ${cls}" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(t.title)}的抽象圖"><rect width="400" height="300" fill="${bg}"/>${g}</svg>`;
}

// ================= 個人化推薦（固定規則） =================
const isDone = id => S.read[id] || S.challenges[id]?.finished || S.exps[id]?.done;
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
function ranked(seed = today()) {
  const r = rng(hash(seed));
  return TOPICS.filter(t => !S.dismissed[t.id]).map(t => ({ t, ...scoreOf(t), j: r() * 1.5 }))
    .sort((a, b) => (b.s + b.j) - (a.s + a.j));
}
// 今日推薦：先保證三類各一，再補到 4–5 張；一天內固定
function dailyPicks() {
  const n = (S.profile?.hours || 5) >= 5 ? 5 : 4;
  if (S.daily?.date === today()) {
    S.daily.ids = S.daily.ids.filter(id => !S.dismissed[id]);
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
  S.daily = { date: today(), ids }; save();
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
  const saved = !!S.saved[t.id];
  return `<article class="card ${opts.big ? 'big' : ''} cat-${t.cat}">
    <a href="#/topic/${t.id}" class="cimg" aria-label="${esc(t.title)}">${visual(t)}</a>
    <div class="cbody">
      <div class="kicker"><span class="cat">${CATS[t.cat].en}</span><span>${esc(t.time)}</span><span title="難度：${diffLabel(t.diff)}">${dots(t.diff)} ${diffLabel(t.diff)}</span></div>
      <h3><a href="#/topic/${t.id}">${esc(t.title)}</a></h3>
      <p class="sub">${esc(t.sub)}</p>
      ${opts.why ? `<p class="why"><span>為什麼推薦</span>${esc(whyText(t))}</p>` : ''}
      ${isDone(t.id) ? '<p class="done-tag">已完成</p>' : ''}
      <div class="actions">
        <a class="btn primary" href="#/topic/${t.id}">開始探索</a>
        <button class="btn icon ${saved ? 'on' : ''}" data-save="${t.id}" aria-pressed="${saved}" title="${saved ? '取消收藏' : '收藏'}">${saved ? '♥' : '♡'}<span>${saved ? '已收藏' : '收藏'}</span></button>
        <button class="btn icon ghost" data-dismiss="${t.id}" title="不感興趣">✕<span>不感興趣</span></button>
      </div>
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
  if (S.saved[id]) { delete S.saved[id]; log('unsave', id); } else { S.saved[id] = today(); log('save', id); }
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
  const app = $('#app');
  const { page, id } = route();
  if (!S.profile || page === 'onboard') { renderOnboard(app); setNav(''); return; }
  setNav(page === 'topic' || page === 'challenge' ? '' : page);
  ({ home: renderHome, discover: renderDiscover, topic: renderTopic, challenge: renderChallenge, journey: renderJourney }[page] || renderHome)(app, id);
}
function setNav(p) { $$('.nav a').forEach(a => a.setAttribute('aria-current', a.dataset.p === p ? 'page' : 'false')); }
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

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
    <section>
      <h2 class="sec">Today's Discovery</h2>
      <div class="feature">${ids.map((id, i) => card(T[id], { why: true, big: i === 0 })).join('')}</div>
      ${ids.length < 3 ? '<p class="muted">今天的推薦都被你略過了，去「探索」頁看看其他主題吧。</p>' : ''}
    </section>
    <section class="more"><a class="btn" href="#/discover">看更多主題 →</a></section>`;
  bindCards(app);
}

// ================= 探索 =================
let filt = { cat: 'all', q: '', showDismissed: false };
function renderDiscover(app) {
  const list = ranked('discover');
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
          <h1>${esc(t.title)}</h1>
          <p class="lede">${esc(t.sub)}</p>
          <div class="actions">${action}<button class="btn icon ${saved ? 'on' : ''}" id="saveT">${saved ? '♥ 已收藏' : '♡ 收藏'}</button><a class="btn ghost" href="#related">延伸探索 ↓</a></div>
        </div>
      </header>

      <section class="block intro"><h2 class="sec">簡介</h2><p class="dropcap">${esc(t.intro)}</p></section>
      <section class="block"><h2 class="sec">為什麼有趣</h2><ul class="whylist">${t.why.map(w => `<li>${esc(w)}</li>`).join('')}</ul></section>
      <section class="block"><h2 class="sec">${t.cat === 'experience' ? '怎麼做得更好' : '關鍵概念'}</h2><div class="concepts">${t.concepts.map((c, i) => `<div class="concept"><span class="cn">${String(i + 1).padStart(2, '0')}</span><h3>${esc(c.t)}</h3><p>${esc(c.d)}</p></div>`).join('')}</div></section>
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
      <section class="block" id="related"><h2 class="sec">相關主題</h2>
        <div class="grid three">${rel.map(r => card(r)).join('')}</div>
        ${S.moreRel === id ? (more.length ? `<h2 class="sec" style="margin-top:28px">再延伸一點</h2><div class="grid three">${more.map(r => card(r)).join('')}</div>` : '<p class="muted">已經沒有更遠的相關主題了。</p>') : `<button class="btn" id="moreRel" style="margin-top:16px">✦ 找更多相關主題</button>`}
      </section>
    </article>`;
  $('#saveT').onclick = () => { toggleSave(id); render(); };
  $('#moreRel')?.addEventListener('click', () => { S.moreRel = id; save(); render(); $('#related').scrollIntoView(); });
  $$('[data-act="start"]', app).forEach(b => b.onclick = () => { S.challenges[id] = { start: today(), days: {} }; log('challenge', id); save(); location.hash = `#/challenge/${id}`; });
  $$('[data-act="read"]', app).forEach(b => b.onclick = () => openReflect('knowledge', id));
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
    <label>${kind === 'knowledge' ? '一句話記下你學到的事（選填）' : '心得：印象最深的是什麼？下次想怎麼做？'}<textarea name="text" rows="3" maxlength="600"></textarea></label>
    <div class="rate" role="radiogroup" aria-label="喜歡程度">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="rate" value="${n}" ${n === 4 ? 'checked' : ''}><span>${'★'.repeat(n)}</span></label>`).join('')}</div>
    <button class="btn primary" type="submit">完成</button>
  </form>`;
}
function reflectionView(r) {
  if (!r || (!r.text && !r.rate)) return '';
  return `<blockquote class="refl">${r.text ? esc(r.text) : ''}<footer>${r.rate ? '★'.repeat(r.rate) : ''} · ${md(r.date || today())}</footer></blockquote>`;
}
function bindReflect(root, kind, id) {
  $$('form.reflect', root).forEach(f => f.onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(f);
    const r = { text: String(fd.get('text') || '').trim(), rate: +fd.get('rate'), date: today() };
    if (f.dataset.kind === 'exp') { Object.assign(S.exps[id], r, { done: true }); log('expdone', id, r.text); }
    if (f.dataset.kind === 'challenge') { Object.assign(S.challenges[id], r, { finished: today() }); log('chdone', id, r.text); }
    if (f.dataset.kind === 'knowledge') { S.read[id] = r; log('read', id, r.text); closeModal(); }
    save(); render();
    toast(f.dataset.kind === 'knowledge' ? '記下來了，已加入你的旅程。' : '恭喜完成！已加入你的旅程。', '看我的旅程', () => location.hash = '#/journey');
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
const EV = { undismiss: '放回了', start: '開始了 EXPLORE', view: '探索了', save: '收藏了', challenge: '開始七天挑戰：', day: '完成', chdone: '完成挑戰：', exp: '開始體驗：', expdone: '完成體驗：', read: '讀完了', shuffle: '抽了一次新發現', dismiss: '略過了', profile: '更新了興趣設定', quit: '放棄挑戰：' };
function renderJourney(app) {
  const viewed = Object.keys(S.viewed);
  const catN = c => viewed.filter(id => T[id]?.cat === c).length;
  const finishedCh = Object.entries(S.challenges).filter(([, c]) => c.finished);
  const going = Object.entries(S.challenges).filter(([, c]) => !c.finished);
  const doneEx = Object.entries(S.exps).filter(([, e]) => e.done);
  const notes = [];
  Object.entries(S.challenges).forEach(([id, c]) => Object.entries(c.days || {}).forEach(([n, d]) => d.note && notes.push({ id, where: `七天挑戰 · 第 ${n} 天`, text: d.note })));
  [...finishedCh, ...doneEx].forEach(([id, r]) => r.text && notes.push({ id, where: '心得', text: r.text }));
  Object.entries(S.read).forEach(([id, r]) => r.text && notes.push({ id, where: '讀後一句話', text: r.text }));
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
      <div><b>${notes.length}</b><span>筆記與心得</span></div>
      <div><b>${activeDays}</b><span>活躍天數</span></div>
    </section>
    <section class="block"><h2 class="sec">探索的平衡</h2>
      <div class="balance">${Object.entries(CATS).map(([k, c]) => `<span class="seg cat-${k}" style="flex:${catN(k) || 0.0001}" title="${c.zh} ${catN(k)}"></span>`).join('')}</div>
      <div class="legend">${Object.entries(CATS).map(([k, c]) => `<span class="cat-${k}"><i></i>${c.en} ${catN(k)}（${Math.round(catN(k) / total * 100)}%）</span>`).join('')}</div>
    </section>
    ${going.length ? `<section class="block"><h2 class="sec">進行中的挑戰</h2>${going.map(([id, c]) => { const n = Object.values(c.days).filter(x => x.done).length; return `<a class="mini" href="#/challenge/${id}"><b>${esc(T[id].title)}</b><span>${n}/7 天</span><span class="bar"><i style="width:${n / 7 * 100}%"></i></span></a>`; }).join('')}</section>` : ''}
    <section class="block"><h2 class="sec">收藏</h2>${Object.keys(S.saved).length ? `<div class="grid three">${Object.keys(S.saved).map(id => T[id]).filter(Boolean).map(t => card(t)).join('')}</div>` : '<p class="muted">還沒有收藏。看到喜歡的主題按 ♡ 就會出現在這裡。</p>'}</section>
    <section class="block"><h2 class="sec">完成的挑戰與體驗</h2>${finishedCh.length + doneEx.length ? `<div class="done-list">${[...finishedCh.map(([id, c]) => ({ id, r: c, k: '七天挑戰' })), ...doneEx.map(([id, e]) => ({ id, r: e, k: '體驗' }))].map(x => `<div class="done-item"><p class="kicker"><span class="cat">${x.k}</span></p><h3><a href="#/${x.k === '七天挑戰' ? 'challenge' : 'topic'}/${x.id}">${esc(T[x.id].title)}</a></h3>${reflectionView(x.r)}</div>`).join('')}</div>` : '<p class="muted">完成一個七天挑戰或體驗後，心得會留在這裡。</p>'}</section>
    <section class="block"><h2 class="sec">我的筆記</h2>${notes.length ? `<ul class="notes">${notes.map(n => `<li><a href="#/topic/${n.id}">${esc(T[n.id].title)}</a><span class="muted"> · ${n.where}</span><p>${esc(n.text)}</p></li>`).join('')}</ul>` : '<p class="muted">挑戰裡的每日筆記和完成心得會整理在這裡。</p>'}</section>
    <section class="block"><h2 class="sec">時間軸</h2>
      <div class="timeline">${Object.entries(groups).map(([d, es]) => `<div class="tday"><h3>${md(d)}</h3><ul>${es.map(e => `<li><span class="dot ${e.id ? 'cat-' + T[e.id]?.cat : ''}"></span>${EV[e.type] || e.type}${e.id && T[e.id] ? `<a href="#/topic/${e.id}">「${esc(T[e.id].title)}」</a>` : ''}${e.type === 'day' ? ` <span class="muted">${esc(e.text)}</span>` : ''}</li>`).join('')}</ul></div>`).join('') || '<p class="muted">還沒有紀錄。</p>'}</div>
    </section>
    <section class="block settings"><h2 class="sec">設定</h2>
      <div class="actions"><a class="btn" href="#/onboard">修改興趣與偏好</a><button class="btn" id="exp">匯出備份</button><label class="btn">匯入備份<input type="file" id="imp" accept="application/json" hidden></label><button class="btn danger" id="wipe">清除所有資料</button></div>
      <p class="muted small">資料只存在這個瀏覽器。換裝置前先匯出備份。</p>
    </section>`;
  bindCards(app);
  $('#exp').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
    a.download = `explore-backup-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#imp').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(txt => { try { const d = JSON.parse(txt); if (!d.profile) throw new Error('不是 EXPLORE 的備份檔'); S = Object.assign(blank(), d); save(); render(); toast('匯入完成'); } catch (err) { toast('匯入失敗：' + err.message); } });
  };
  const w = $('#wipe'); let armed = false;
  w.onclick = () => { if (!armed) { armed = true; w.textContent = '再按一次確認清除'; setTimeout(() => { armed = false; w.textContent = '清除所有資料'; }, 3000); return; } S = blank(); save(); location.hash = '#/home'; render(); };
}

render();
