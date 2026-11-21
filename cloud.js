// ================= Google 登入＋雲端同步（選擇性） =================
// 不登入：照舊只存在這個瀏覽器。登入後：以雲端為準（雲端有資料就覆蓋本機，沒有才把本機上傳），
// 之後每次儲存都會在 1.5 秒後同步到 Firestore 的 explore/{uid}。
// 沿用交易日誌的 Firebase 專案；登入轉接檔在同網域 enyou0828-wq.github.io/__/auth/。
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signInWithCredential, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

const fbApp = initializeApp({
  apiKey: 'AIzaSyCgERf59G6aqXyINK2iLU2OLwRLlrwydwQ',
  authDomain: 'enyou0828-wq.github.io',
  projectId: 'trading-journal-65a29',
  storageBucket: 'trading-journal-65a29.firebasestorage.app',
  messagingSenderId: '683783822181',
  appId: '1:683783822181:web:2a9d6d7d099d1269fc1f8c',
}, 'explore');
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

const C = window.CLOUD = { user: null, msg: '', busy: false };
const ui = () => { paintHeader(); paintBoxes(); };
const setMsg = (m, busy = false) => { C.msg = m; C.busy = busy; ui(); };
const errText = e => e?.code === 'permission-denied' ? '雲端拒絕存取（Firestore 規則還沒開放 explore）' : (e?.code || e?.message || '未知錯誤');

// ---------- 登入 ----------
const IS_MOBILE = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const GOOGLE_CLIENT_ID = '683783822181-tlnnh3s2fmnlms5i0pddhm0tniebf51j.apps.googleusercontent.com';
const randomStr = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');

// 手機：自己帶去 Google 拿 id_token，回呼到同網域的 /__/auth/handler，
// 轉接頁看到 state 以 ex_ 開頭就把結果存進 localStorage 再導回 /explore/（iPhone Safari 收不到 Firebase 導向的結果）。
function startIdTokenLogin() {
  const state = 'ex_' + randomStr(), nonce = randomStr();
  try { localStorage.setItem('ex-oauth-state', state); } catch { /* 略過 */ }
  const q = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID, redirect_uri: 'https://enyou0828-wq.github.io/__/auth/handler',
    response_type: 'id_token', scope: 'openid email profile', nonce, state, prompt: 'select_account',
  });
  location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + q;
}
async function finishIdTokenLogin() {
  let raw = null, expected = null;
  try {
    raw = localStorage.getItem('ex-google-oauth'); expected = localStorage.getItem('ex-oauth-state');
    localStorage.removeItem('ex-google-oauth'); localStorage.removeItem('ex-oauth-state');
  } catch { return; }
  if (!raw) return;
  const r = new URLSearchParams(raw);
  if (r.get('error')) return setMsg('登入失敗：' + r.get('error'));
  if (expected && r.get('state') !== expected) return setMsg('登入失敗：驗證碼不符，請再試一次');
  const idToken = r.get('id_token');
  if (!idToken) return setMsg('登入失敗：沒有收到 Google 憑證');
  setMsg('登入中…', true);
  try { await signInWithCredential(auth, GoogleAuthProvider.credential(idToken)); }
  catch (e) { console.error(e); setMsg('登入失敗：' + errText(e)); }
}

async function login() {
  if (C.busy) return;
  setMsg('登入中…', true);
  if (IS_MOBILE) return startIdTokenLogin();
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) {
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return setMsg('');
    console.error(e);
    try { await signInWithRedirect(auth, new GoogleAuthProvider()); }
    catch (e2) { console.error(e2); setMsg('登入失敗：' + errText(e2)); }
  }
}
async function logout() {
  await flush();
  await signOut(auth);
  window.EXPLORE?.toast('已登出。這台裝置上的進度還在，下次登入會改用雲端的版本。');
}

// ---------- 同步 ----------
let loaded = false, timer = null, pending = false;
// 這台裝置第一次登入某個帳號：雲端優先（雲端有資料就用雲端的）。
// 之後同一個帳號再打開：比較修改時間，本機比較新就上傳、雲端比較新才下載，避免剛做的動作被舊資料蓋掉。
const LINK = 'explore-linked-uid';
const linkedTo = () => { try { return localStorage.getItem(LINK); } catch { return null; } };
const setLinked = uid => { try { localStorage.setItem(LINK, uid); } catch { /* 略過 */ } };
async function pull(uid) {
  loaded = false;
  setMsg('正在讀取雲端進度…', true);
  try {
    const snap = await getDoc(doc(db, 'explore', uid));
    let cloud = snap.exists() && snap.data().state ? snap.data() : null;
    // 重置前留下的舊雲端資料：刪掉、不讀回來
    if (cloud && JSON.parse(cloud.state).rv !== window.EXPLORE.RESET_ID) {
      await deleteDoc(doc(db, 'explore', uid)).catch(e => console.error(e));
      cloud = null;
    }
    const local = window.EXPLORE.state;
    const linked = linkedTo() === uid;
    loaded = true;
    if (cloud && !(linked && (local.ts || 0) > (cloud.ts || 0))) {
      window.EXPLORE.replaceState(JSON.parse(cloud.state));
      setLinked(uid);
      setMsg('已同步');
    } else if (local.profile) {
      await push();
      setLinked(uid);
    } else {
      setLinked(uid);
      setMsg('已登入，完成問卷後會自動存到雲端');
    }
  } catch (e) { console.error(e); setMsg('讀取雲端失敗：' + errText(e)); }
}
async function push() {
  const u = auth.currentUser;
  if (!u || !loaded) return;
  clearTimeout(timer); pending = false;
  const st = window.EXPLORE.state;
  try {
    // 整份狀態存成一個 JSON 字串：主題 id 當 key 的物件很多，存字串最省事也不會碰到 Firestore 欄位限制
    await setDoc(doc(db, 'explore', u.uid), { state: JSON.stringify(st), ts: st.ts || Date.now(), updatedAt: new Date().toISOString() });
    setMsg('已同步');
  } catch (e) { pending = true; console.error(e); setMsg('同步失敗：' + errText(e)); }
}
const flush = () => pending ? push() : Promise.resolve();
window.cloudPush = () => {
  if (!auth.currentUser || !loaded) return;
  pending = true; clearTimeout(timer); timer = setTimeout(push, 1500);
};
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

// ---------- 介面 ----------
function paintHeader() {
  const el = document.getElementById('acct');
  if (!el) return;
  el.hidden = false;
  if (C.user) {
    const n = (C.user.displayName || C.user.email || '?').trim()[0].toUpperCase();
    el.textContent = n;
    if (C.user.photoURL) {
      const img = new Image(); img.alt = ''; img.referrerPolicy = 'no-referrer'; img.src = C.user.photoURL;
      img.onerror = () => { el.textContent = n; };
      el.replaceChildren(img);
    }
    el.title = `已登入：${C.user.email || ''}`;
    el.setAttribute('aria-label', '帳號與同步');
    el.dataset.state = 'in';
  } else {
    el.textContent = '登入';
    el.title = '用 Google 登入，進度存到雲端';
    el.setAttribute('aria-label', '用 Google 登入');
    el.dataset.state = 'out';
  }
}
// 頁面裡的 [data-acct] 區塊只就地更新，不整頁重畫（避免問卷填到一半被洗掉）
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function paintBoxes() {
  const u = C.user, msg = C.msg ? `<span class="acct-msg">${esc(C.msg)}</span>` : '';
  document.querySelectorAll('[data-acct]').forEach(el => {
    if (el.dataset.acct === 'onboard') {
      el.innerHTML = u
        ? `已用 Google 登入（${esc(u.email)}）${msg ? '・' + msg : ''}`
        : `用過 EXPLORE？<button type="button" class="linkbtn" data-login>用 Google 登入</button>接續之前的進度。${msg}`;
    } else {
      el.innerHTML = u
        ? `<p>已用 Google 登入：<b>${esc(u.email)}</b>${msg ? '・' + msg : ''}</p><p class="muted small">進度會自動存到雲端，換手機或電腦登入同一個帳號就接得上。</p><div class="actions"><button class="btn" data-logout>登出</button></div>`
        : `<p class="muted small">登入後進度會存到雲端，換手機或電腦都接得上。不登入也能用，資料只存在這個瀏覽器。${msg ? '<br>' + msg : ''}</p><div class="actions"><button class="btn primary" data-login>用 Google 登入</button></div>`;
    }
  });
  const f = document.getElementById('footData');
  if (f) f.textContent = u ? '已登入，進度同步到雲端。' : '未登入時資料只存在這個瀏覽器。';
}
window.cloudPaint = paintBoxes;
document.addEventListener('click', e => {
  const t = e.target.closest('[data-login],[data-logout],#acct');
  if (!t) return;
  e.preventDefault();
  if (t.id === 'acct') {
    if (C.user) { location.hash = '#/journey'; setTimeout(() => document.getElementById('acctBox')?.scrollIntoView({ block: 'center' }), 60); }
    else login();
  } else if (t.matches('[data-login]')) login();
  else logout();
});

onAuthStateChanged(auth, user => {
  C.user = user ? { email: user.email, displayName: user.displayName, photoURL: user.photoURL } : null;
  if (user) pull(user.uid);
  else { loaded = false; setMsg(''); }
});
getRedirectResult(auth).catch(e => { console.error(e); setMsg('登入失敗：' + errText(e)); });
finishIdTokenLogin();
paintHeader(); paintBoxes();
