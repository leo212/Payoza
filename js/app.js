import { icon } from './icons.js';
import { CATS, CAT, CURS, CUR, COLORS, TRIP_EMOJI } from './data.js';
import { createStore } from './store.js';
import { firebaseConfig } from './config.js';

/* ───────── helpers ───────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* unavailable */ } },
};
const cookie = {
  get(k) { try { return decodeURIComponent((document.cookie.match(new RegExp('(?:^|; )' + k + '=([^;]*)')) || [])[1] || '') || null; } catch { return null; } },
  set(k, v) { try { document.cookie = `${k}=${encodeURIComponent(v)}; max-age=${60 * 60 * 24 * 730}; path=/; SameSite=Lax`; } catch { /* blocked */ } },
};
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const rand = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => ALPHA[b % ALPHA.length]).join('');
const newId = () => Date.now().toString(36) + rand(6).toLowerCase();
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const showCode = c => c.length > 4 ? c.slice(0, 4) + '-' + c.slice(4) : c;
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };

function fmtNum(n) {
  const a = Math.abs(n);
  return a.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: a >= 100 ? 0 : 2 });
}
function money(n, cur, { sign = false, cls = '' } = {}) {
  const c = CUR[cur] || { sym: cur };
  const z = Math.abs(n) < 0.005;
  const s = z ? '' : n < 0 ? '−' : sign ? '+' : '';
  const gap = c.sym.length > 1 ? ' ' : '';
  return `<bdi class="num ${cls}">${s}${esc(c.sym)}${gap}${fmtNum(z ? 0 : n)}</bdi>`;
}
const avatar = (m, cls = '') => `<span class="av ${cls}" style="--c:${esc(m?.color || '#889')}">${esc((m?.name || '?').trim().charAt(0) || '?')}</span>`;
const catTile = (id, cls = '') => { const c = CAT[id] || CAT.other; return `<span class="cat ${cls}" style="--h:${c.hue}">${icon(c.icon)}</span>`; };

function dayLabel(iso) {
  const t = today();
  if (iso === t) return 'היום';
  const y = new Date(Date.now() - 864e5 - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  if (iso === y) return 'אתמול';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
}

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = (kind === 'err' ? icon('circle-alert') : icon('check')) + `<span>${esc(msg)}</span>`;
  $('#toasts').append(el);
  setTimeout(() => el.classList.add('out'), 2400);
  setTimeout(() => el.remove(), 2900);
}
async function copyText(text, msg = 'הועתק') {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
  }
  toast(msg);
}

/* ───────── rates ───────── */
let live = ls.get('pz_rates');
const usd = c => live?.r?.[c] || CUR[c]?.usd || 1;
const rateOf = (from, to) => usd(to) / usd(from);
const tidyRate = r => +r.toPrecision(5);
async function refreshRates() {
  if (live && Date.now() - live.t < 12 * 36e5) return;
  try {
    const j = await (await fetch('https://open.er-api.com/v6/latest/USD')).json();
    if (j?.rates?.ILS) { live = { t: Date.now(), r: j.rates }; ls.set('pz_rates', live); }
  } catch { /* offline: built-in approximate rates are used */ }
}

/* ───────── identity ───────── */
const me = { uid: null, name: '', color: COLORS[0], wallets: [] };
function loadMe() {
  me.uid = cookie.get('pz_uid') || ls.get('pz_uid');
  const p = ls.get('pz_profile') || {};
  Object.assign(me, { name: p.name || '', color: p.color || COLORS[Math.floor(Math.random() * COLORS.length)], wallets: p.wallets || [] });
  if (!me.uid) me.uid = `PZ-${rand(4)}-${rand(4)}-${rand(4)}`;
  cookie.set('pz_uid', me.uid); ls.set('pz_uid', me.uid);
}
function saveMe(remote = true) {
  cookie.set('pz_uid', me.uid); ls.set('pz_uid', me.uid);
  ls.set('pz_profile', { name: me.name, color: me.color, wallets: me.wallets });
  if (remote && me.name) store.saveUser(me.uid, { name: me.name, color: me.color, wallets: me.wallets, updatedAt: Date.now() }).catch(() => {});
}

/* ───────── state ───────── */
let store;
const S = { route: { v: 'home' }, wallet: null, code: null, unsub: null, missing: false, sums: ls.get('pz_sums') || {} };
const app = $('#app');

function parseRoute() {
  const p = location.hash.replace(/^#\/?/, '').split('/');
  if (p[0] === 'w' && p[1]) return { v: 'wallet', code: cleanCode(p[1]), tab: ['home', 'tx', 'settle', 'crew'].includes(p[2]) ? p[2] : 'home' };
  if (p[0] === 'j' && p[1]) return { v: 'join', code: cleanCode(p[1]) };
  return { v: 'home' };
}
const go = h => { if (location.hash === h) onRoute(); else location.hash = h; };

function onRoute() {
  const r = parseRoute();
  const prev = S.route;
  S.route = r;
  if (!me.name) return render(true);
  if (r.v === 'join') return joinWallet(r.code);
  if (r.v === 'wallet') {
    if (S.code !== r.code) subscribe(r.code);
    const tabOnly = prev.v === 'wallet' && prev.code === r.code;
    if (tabOnly && document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(() => render(true));
    else render(true);
    return;
  }
  unsubscribe();
  render(true);
  refreshHome();
}
function unsubscribe() { S.unsub?.(); S.unsub = null; S.code = null; S.wallet = null; S.missing = false; }
function subscribe(code) {
  unsubscribe();
  S.code = code;
  let first = true;
  S.unsub = store.watch(code, snap => {
    if (S.code !== code) return;
    if (!snap) { S.missing = true; S.wallet = null; return render(true); }
    S.wallet = { code, ...snap };
    const m = snap.members[me.uid];
    if (!m || m.name !== me.name || m.color !== me.color) {
      store.setMember(code, me.uid, { name: me.name, color: me.color, joinedAt: m?.joinedAt || Date.now() }).catch(() => {});
    }
    if (!me.wallets.includes(code)) { me.wallets.unshift(code); saveMe(); }
    saveSum(S.wallet);
    render(first); first = false;
  }, () => toast('החיבור לענן נכשל. בודקים שוב…', 'err'));
}
function saveSum(w) {
  const c = compute(w);
  S.sums[w.code] = { name: w.meta.name, emoji: w.meta.emoji, base: w.meta.base, n: Object.keys(w.members).length, bal: c.bal[me.uid] || 0, total: c.total };
  ls.set('pz_sums', S.sums);
}
async function refreshHome() {
  for (const code of [...me.wallets]) {
    try {
      const w = await store.fetch(code);
      if (w) saveSum({ code, ...w });
    } catch { /* keep cached */ }
  }
  if (S.route.v === 'home' && me.name && !$('#sheets').children.length) render(false);
}
async function joinWallet(code) {
  app.innerHTML = `<div class="center-msg"><div class="spinner"></div><p>מצטרפים לארנק…</p></div>`;
  let meta = null;
  try { meta = await store.getMeta(code); } catch { /* handled below */ }
  if (!meta) {
    toast(store.shared ? 'לא מצאנו ארנק עם הקוד הזה' : 'הקוד לא נמצא במכשיר הזה (מצב מקומי)', 'err');
    return go('#/');
  }
  toast(`הצטרפת אל ${meta.name}`);
  go(`#/w/${code}`);
}

/* ───────── maths ───────── */
function membersOf(w) {
  return Object.entries(w.members).map(([uid, m]) => ({ uid, ...m })).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
}
function txList(w) {
  return Object.entries(w.tx).map(([id, t]) => ({ id, ...t })).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.ts || 0) - (a.ts || 0));
}
export function sharesOf(amount, shares) {
  const sum = Object.values(shares).reduce((a, b) => a + b, 0);
  const out = {};
  if (sum > 0) for (const [u, wgt] of Object.entries(shares)) if (wgt > 0) out[u] = amount * wgt / sum;
  return out;
}
export function compute(w) {
  const bal = {}, paid = {}, share = {}, byCat = {};
  for (const u of Object.keys(w.members)) bal[u] = paid[u] = share[u] = 0;
  const add = (o, k, v) => { o[k] = (o[k] || 0) + v; };
  let total = 0;
  for (const t of Object.values(w.tx)) {
    const base = t.amount * (t.rate || 1);
    if (t.type === 's') { add(bal, t.from, base); add(bal, t.to, -base); continue; }
    total += base;
    add(bal, t.payer, base); add(paid, t.payer, base); add(byCat, t.cat || 'other', base);
    for (const [u, v] of Object.entries(sharesOf(base, t.shares || {}))) { add(bal, u, -v); add(share, u, v); }
  }
  return { bal, paid, share, byCat, total, transfers: settleUp(bal) };
}
export function settleUp(bal) {
  const deb = [], cred = [];
  for (const [u, v] of Object.entries(bal)) { if (v < -0.005) deb.push([u, -v]); else if (v > 0.005) cred.push([u, v]); }
  deb.sort((a, b) => b[1] - a[1]); cred.sort((a, b) => b[1] - a[1]);
  const out = [];
  let i = 0, j = 0;
  while (i < deb.length && j < cred.length) {
    const x = Math.min(deb[i][1], cred[j][1]);
    out.push({ from: deb[i][0], to: cred[j][0], amount: x });
    deb[i][1] -= x; cred[j][1] -= x;
    if (deb[i][1] < 0.005) i++;
    if (cred[j][1] < 0.005) j++;
  }
  return out;
}

/* ───────── render ───────── */
function render(animate) {
  const r = S.route;
  let html;
  if (!me.name) html = viewWelcome();
  else if (r.v === 'wallet') html = viewWallet();
  else html = viewHome();
  app.innerHTML = html;
  app.className = animate ? 'enter' : '';
  if (animate) { countUp(); window.scrollTo(0, 0); }
}
function countUp() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  $$('[data-n]', app).forEach(el => {
    const to = +el.dataset.n, cur = el.dataset.cur, sign = el.dataset.sign === '1', t0 = performance.now(), dur = 700;
    const step = t => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.innerHTML = money(k === 1 ? to : Math.round(to * e), cur, { sign });
      if (k < 1 && el.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
const counted = (n, cur, sign = false) => `<span data-n="${n}" data-cur="${cur}" data-sign="${sign ? 1 : 0}">${money(n, cur, { sign })}</span>`;
const logo = `<span class="logo"><span class="logo-mark">${icon('plane')}</span>Payoza</span>`;
const localBanner = () => store.shared ? '' : `<button class="banner" data-act="local-info">${icon('cloud-off')}<span><b>מצב מקומי.</b> הנתונים נשמרים רק בדפדפן הזה, ושיתוף עם אחרים עדיין לא פעיל.</span></button>`;

function viewWelcome() {
  return `<section class="welcome">
    <div class="welcome-art"><span class="orbit"><i>${icon('plane')}</i></span><span class="coin c1">₪</span><span class="coin c2">$</span><span class="coin c3">€</span><span class="coin c4">฿</span></div>
    <h1>${logo}</h1>
    <p class="lead">ארנק אחד לכל הטיול. כל אחד מתעד מה שילם, ואנחנו מחשבים מי חייב למי.</p>
    <form class="card form" data-form="welcome">
      <label for="wl-name">איך קוראים לך?</label>
      <input id="wl-name" class="in big" maxlength="24" placeholder="השם שיופיע לחברים" autocomplete="given-name" required>
      <div class="label">צבע</div>
      ${colorDots(me.color)}
      <button class="btn primary">יוצאים לדרך ${icon('arrow-left')}</button>
    </form>
    <button class="link" data-act="restore">${icon('key-round')} יש לי כבר מזהה משתמש</button>
  </section>`;
}
const colorDots = sel => `<div class="dots" role="radiogroup" aria-label="צבע">${COLORS.map(c => `<button type="button" class="dot${c === sel ? ' on' : ''}" style="--c:${c}" data-act="color" data-c="${c}" role="radio" aria-checked="${c === sel}" aria-label="צבע"></button>`).join('')}</div>`;

function viewHome() {
  const cards = me.wallets.map((code, i) => {
    const s = S.sums[code];
    if (!s) return `<a class="trip" href="#/w/${code}" style="--i:${i}"><span class="trip-emoji">🧳</span><span class="trip-main"><b>${showCode(code)}</b><small>טוען…</small></span></a>`;
    const st = Math.abs(s.bal) < 0.005 ? ['flat', 'מאוזן'] : s.bal > 0 ? ['pos', 'מגיע לך'] : ['neg', 'יתרת חוב'];
    return `<a class="trip" href="#/w/${code}" style="--i:${i}">
      <span class="trip-emoji">${esc(s.emoji || '🧳')}</span>
      <span class="trip-main"><b>${esc(s.name)}</b><small>${icon('users')} ${s.n} · סה״כ ${money(s.total, s.base)}</small></span>
      <span class="trip-bal ${st[0]}"><small>${st[1]}</small>${Math.abs(s.bal) < 0.005 ? icon('check') : money(Math.abs(s.bal), s.base)}</span>
    </a>`;
  }).join('');
  return `<header class="top">
      ${logo}
      <button class="me-chip" data-act="profile" aria-label="הפרופיל שלי">${avatar(me)}<span>${esc(me.name)}</span></button>
    </header>
    ${localBanner()}
    <section class="hello"><h1>לאן נוסעים, ${esc(me.name)}?</h1><p>הארנקים המשותפים שלך</p></section>
    <section class="trips">${cards || `<div class="empty"><div class="empty-art">${icon('luggage')}</div><b>עוד אין כאן ארנקים</b><p>פותחים ארנק לטיול ומזמינים את החברים, או מצטרפים עם קוד שקיבלת.</p></div>`}</section>
    <div class="home-actions">
      <button class="btn primary" data-act="new-wallet">${icon('plus')} ארנק חדש</button>
      <button class="btn ghost" data-act="join">${icon('qr-code')} הצטרפות עם קוד</button>
    </div>`;
}

function viewWallet() {
  const w = S.wallet;
  if (S.missing) return `<div class="center-msg">${icon('circle-alert')}<b>הארנק לא נמצא</b><p>ייתכן שהקוד שגוי${store.shared ? '' : ', או שהארנק נוצר במכשיר אחר (מצב מקומי)'}.</p><a class="btn ghost" href="#/">חזרה לארנקים</a></div>`;
  if (!w) return `<div class="center-msg"><div class="spinner"></div><p>טוענים את הארנק…</p></div>`;
  const tab = S.route.tab, c = compute(w), mem = membersOf(w);
  const body = { home: tabHome, tx: tabTx, settle: tabSettle, crew: tabCrew }[tab](w, c, mem);
  const tabBtn = (id, ic, label) => `<a class="tab${tab === id ? ' on' : ''}" href="#/w/${w.code}/${id}" ${tab === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a>`;
  return `<header class="top">
      <a class="icon-btn" href="#/" aria-label="חזרה לארנקים">${icon('arrow-right')}</a>
      <div class="top-title"><span>${esc(w.meta.emoji || '🧳')}</span><b>${esc(w.meta.name)}</b></div>
      <button class="icon-btn" data-act="share" aria-label="שיתוף הארנק">${icon('user-plus')}</button>
    </header>
    ${localBanner()}
    <div class="tab-body">${body}</div>
    <nav class="tabbar" aria-label="ניווט בארנק">
      ${tabBtn('home', 'layout-dashboard', 'סקירה')}${tabBtn('tx', 'receipt', 'הוצאות')}
      <button class="fab" data-act="add-x" aria-label="הוצאה חדשה">${icon('plus')}</button>
      ${tabBtn('settle', 'handshake', 'התחשבנות')}${tabBtn('crew', 'users', 'חברים')}
    </nav>`;
}

function tabHome(w, c, mem) {
  const base = w.meta.base, my = c.bal[me.uid] || 0, flat = Math.abs(my) < 0.005;
  const max = Math.max(1, ...mem.map(m => Math.abs(c.bal[m.uid] || 0)));
  const bars = mem.map((m, i) => {
    const b = c.bal[m.uid] || 0, pct = Math.abs(b) / max * 100;
    return `<li class="bal" style="--i:${i}">${avatar(m)}<span class="bal-name">${esc(m.name)}${m.uid === me.uid ? '<em>אני</em>' : ''}</span>
      <span class="bal-bar ${b >= 0 ? 'pos' : 'neg'}"><i style="--w:${pct.toFixed(1)}%"></i></span>
      ${money(b, base, { sign: true, cls: Math.abs(b) < 0.005 ? '' : b > 0 ? 'pos' : 'neg' })}</li>`;
  }).join('');
  const cats = Object.entries(c.byCat).sort((a, b) => b[1] - a[1]);
  const recent = txList(w).slice(0, 4);
  const empty = !Object.keys(w.tx).length;
  return `<section class="pass">
      <div class="pass-glow" aria-hidden="true"></div>
      <div class="pass-top"><span class="pass-label">${flat ? 'המאזן שלך' : my > 0 ? 'מגיע לך בחזרה' : 'נשאר לך להחזיר'}</span><button class="pass-code" data-act="copy-code">${icon('copy')}<bdi>${showCode(w.code)}</bdi></button></div>
      <div class="pass-amount ${flat ? '' : my > 0 ? 'up' : 'down'}">${flat ? `<span class="even">${icon('sparkles')} הכול מאוזן</span>` : counted(Math.abs(my), base)}</div>
      <div class="pass-route" aria-hidden="true"><i></i>${icon('plane')}<i></i></div>
      <dl class="pass-stats">
        <div><dt>סה״כ בטיול</dt><dd>${counted(c.total, base)}</dd></div>
        <div><dt>החלק שלי</dt><dd>${counted(c.share[me.uid] || 0, base)}</dd></div>
        <div><dt>שילמתי</dt><dd>${counted(c.paid[me.uid] || 0, base)}</dd></div>
      </dl>
    </section>
    ${empty ? `<div class="empty"><div class="empty-art">${icon('receipt')}</div><b>עוד אין הוצאות</b><p>מתעדים את ההוצאה הראשונה, והמאזן מתעדכן לכולם.</p><button class="btn primary" data-act="add-x">${icon('plus')} הוצאה ראשונה</button>${mem.length < 2 ? `<button class="btn ghost" data-act="share">${icon('user-plus')} הזמנת חברים</button>` : ''}</div>` : `
    <section class="block"><h2>מאזן הקבוצה</h2><ul class="bals">${bars}</ul></section>
    <section class="block"><h2>לאן הלך הכסף</h2>${donut(cats, c.total, base)}</section>
    <section class="block"><div class="block-head"><h2>פעילות אחרונה</h2><a href="#/w/${w.code}/tx">הכול ${icon('chevron-left')}</a></div><div class="txs">${recent.map((t, i) => txRow(t, w, i)).join('')}</div></section>`}`;
}

function donut(cats, total, base) {
  if (!total) return '';
  const R = 42, C = 2 * Math.PI * R;
  let off = 0;
  const top = cats.slice(0, 5), rest = cats.slice(5).reduce((a, [, v]) => a + v, 0);
  const rows = top.map(([id, v]) => ({ id, v, ...(CAT[id] || CAT.other) }));
  if (rest > 0) rows.push({ id: '_rest', v: rest, name: 'כל השאר', icon: 'ellipsis', hue: 225, grey: true });
  const arcs = rows.map((r, i) => {
    const len = r.v / total * C, gap = rows.length > 1 ? 2.5 : 0;
    const s = `<circle r="${R}" cx="60" cy="60" fill="none" stroke="${r.grey ? 'var(--line-strong)' : `hsl(${r.hue} 72% 55%)`}" stroke-width="13" stroke-linecap="butt" stroke-dasharray="${Math.max(0.1, len - gap).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" style="--i:${i}"/>`;
    off += len; return s;
  }).join('');
  return `<div class="donut"><div class="donut-chart"><svg viewBox="0 0 120 120" role="img" aria-label="חלוקת ההוצאות לפי קטגוריה">${arcs}</svg><div class="donut-mid"><small>סה״כ</small>${money(total, base)}</div></div>
    <ul class="legend">${rows.map(r => `<li><span class="cat sm" style="--h:${r.hue}">${icon(r.icon)}</span><span>${r.name}</span><b>${Math.round(r.v / total * 100)}%</b>${money(r.v, base)}</li>`).join('')}</ul></div>`;
}

function txRow(t, w, i = 0) {
  const base = w.meta.base, M = w.members;
  if (t.type === 's') {
    return `<button class="tx" data-act="tx" data-id="${t.id}" style="--i:${i}"><span class="cat settle">${icon('handshake')}</span>
      <span class="tx-main"><b>${esc(M[t.from]?.name || '?')} ← ${esc(M[t.to]?.name || '?')}</b><small>העברת תשלום${t.note ? ' · ' + esc(t.note) : ''}</small></span>
      <span class="tx-amt">${money(t.amount, t.cur)}<small>התחשבנות</small></span></button>`;
  }
  const mine = sharesOf(t.amount * (t.rate || 1), t.shares || {})[me.uid];
  return `<button class="tx" data-act="tx" data-id="${t.id}" style="--i:${i}">${catTile(t.cat)}
    <span class="tx-main"><b>${esc(t.note || (CAT[t.cat] || CAT.other).name)}</b><small>${avatar(M[t.payer], 'xs')} ${t.payer === me.uid ? 'שילמתי' : 'שולם ע״י ' + esc(M[t.payer]?.name || '?')}</small></span>
    <span class="tx-amt">${money(t.amount, t.cur)}<small>${mine ? 'חלקך ' + money(mine, base) : 'בלי חלקך'}</small></span></button>`;
}

function tabTx(w) {
  const list = txList(w);
  if (!list.length) return `<div class="empty"><div class="empty-art">${icon('receipt')}</div><b>רשימת ההוצאות ריקה</b><p>כל הוצאה שתתועד תופיע כאן, מסודרת לפי ימים.</p><button class="btn primary" data-act="add-x">${icon('plus')} הוצאה חדשה</button></div>`;
  const groups = {};
  list.forEach(t => (groups[t.date || ''] ||= []).push(t));
  let i = 0;
  return Object.entries(groups).map(([d, items]) => {
    const sum = items.filter(t => t.type !== 's').reduce((a, t) => a + t.amount * (t.rate || 1), 0);
    return `<section class="day"><div class="day-head"><h2>${dayLabel(d)}</h2>${sum ? money(sum, w.meta.base) : ''}</div><div class="txs">${items.map(t => txRow(t, w, i++)).join('')}</div></section>`;
  }).join('');
}

function tabSettle(w, c, mem) {
  const base = w.meta.base, M = w.members;
  const hist = txList(w).filter(t => t.type === 's');
  const sug = c.transfers.map((t, i) => {
    const mine = t.from === me.uid || t.to === me.uid;
    return `<li class="owe${mine ? ' mine' : ''}" style="--i:${i}">
      <div class="owe-flow">${avatar(M[t.from], 'lg')}<span class="owe-line"><i></i>${money(t.amount, base)}${icon('arrow-left')}</span>${avatar(M[t.to], 'lg')}</div>
      <p><b>${esc(M[t.from]?.name || '?')}</b> מעביר/ה אל <b>${esc(M[t.to]?.name || '?')}</b></p>
      <button class="btn small ${mine ? 'primary' : 'ghost'}" data-act="settle" data-from="${t.from}" data-to="${t.to}" data-amt="${t.amount.toFixed(2)}">${icon('check')} תיעוד התשלום</button></li>`;
  }).join('');
  return `<section class="block flush"><h2>מי מעביר למי</h2>
      <p class="hint">המסלול הקצר ביותר לאיזון: ${c.transfers.length || 'אפס'} העברות.</p>
      ${sug ? `<ul class="owes">${sug}</ul>` : `<div class="empty slim"><div class="empty-art ok">${icon('party-popper')}</div><b>כולם מאוזנים</b><p>${mem.length < 2 ? 'כשיצטרפו חברים ויתועדו הוצאות, יופיעו כאן ההעברות.' : 'אין חובות פתוחים בארנק הזה.'}</p></div>`}
      <button class="btn ghost wide" data-act="settle">${icon('arrow-left-right')} תיעוד העברה ידנית</button>
    </section>
    ${hist.length ? `<section class="block"><h2>העברות שתועדו</h2><div class="txs">${hist.map((t, i) => txRow(t, w, i)).join('')}</div></section>` : ''}`;
}

function tabCrew(w, c, mem) {
  const base = w.meta.base;
  return `<section class="share-card">
      <div class="share-qr" id="qr">${qrSvg(shareLink(w.code))}</div>
      <div class="share-main"><small>קוד הצטרפות</small><button class="code" data-act="copy-code"><bdi>${showCode(w.code)}</bdi>${icon('copy')}</button>
        <div class="share-btns"><button class="btn primary small" data-act="share">${icon('share-2')} שיתוף קישור</button><button class="btn ghost small" data-act="copy-link">${icon('link')} העתקה</button></div></div>
    </section>
    <section class="block"><h2>${mem.length} חברים בארנק</h2><ul class="crew">${mem.map((m, i) => `<li style="--i:${i}">${avatar(m, 'lg')}<span class="crew-main"><b>${esc(m.name)}${m.uid === me.uid ? '<em>אני</em>' : ''}</b><small>שילם/ה ${money(c.paid[m.uid] || 0, base)} · חלק ${money(c.share[m.uid] || 0, base)}</small></span>${money(c.bal[m.uid] || 0, base, { sign: true, cls: (c.bal[m.uid] || 0) > 0.005 ? 'pos' : (c.bal[m.uid] || 0) < -0.005 ? 'neg' : '' })}</li>`).join('')}</ul></section>
    <section class="block"><h2>הגדרות הארנק</h2>
      <button class="row-btn" data-act="rename">${icon('pencil')}<span>שם ואימוג׳י</span><small>${esc(w.meta.emoji || '')} ${esc(w.meta.name)}</small>${icon('chevron-left')}</button>
      <div class="row-btn static">${icon('globe')}<span>מטבע המאזן</span><small>${CUR[base]?.flag || ''} ${CUR[base]?.name || base}</small></div>
      <button class="row-btn danger" data-act="leave">${icon('log-out')}<span>הסרת הארנק מהרשימה שלי</span></button>
    </section>`;
}
const shareLink = code => `${location.origin}${location.pathname}#/j/${code}`;
function qrSvg(text) {
  try {
    const q = window.qrcode(0, 'M'); q.addData(text); q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" role="img" aria-label="קוד QR להצטרפות"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#0B1F33"/></svg>`;
  } catch { return ''; }
}

/* ───────── sheets ───────── */
function openSheet(html, cls = '') {
  const el = document.createElement('div');
  el.className = 'sheet-wrap ' + cls;
  el.innerHTML = `<div class="backdrop" data-act="close"></div><section class="sheet" role="dialog" aria-modal="true"><button class="sheet-x" data-act="close" aria-label="סגירה">${icon('x')}</button>${html}</section>`;
  $('#sheets').append(el);
  document.body.classList.add('locked');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  return el;
}
function closeSheet(el = $('#sheets').lastElementChild) {
  if (!el) return;
  el.classList.remove('open');
  setTimeout(() => { el.remove(); if (!$('#sheets').children.length) document.body.classList.remove('locked'); }, 300);
}
const curOptions = (sel, short) => CURS.map(c => `<option value="${c.code}"${c.code === sel ? ' selected' : ''} title="${c.name}">${c.flag} ${c.code}${short ? '' : ' · ' + c.name}</option>`).join('');
const chips = (name, mem, sel) => `<div class="chips" data-chips="${name}">${mem.map(m => `<button type="button" class="chip${m.uid === sel ? ' on' : ''}" data-act="chip" data-uid="${m.uid}">${avatar(m, 'xs')}${esc(m.name)}</button>`).join('')}</div>`;

/* expense form */
let F = null;
function expenseSheet(tx) {
  const w = S.wallet, mem = membersOf(w), base = w.meta.base;
  const lastCur = ls.get('pz_cur_' + w.code) || base;
  F = tx ? { id: tx.id, cur: tx.cur, cat: tx.cat, payer: tx.payer, weights: Object.fromEntries(mem.map(m => [m.uid, tx.shares?.[m.uid] || 0])), ts: tx.ts }
    : { id: null, cur: lastCur, cat: 'food', payer: me.uid, weights: Object.fromEntries(mem.map(m => [m.uid, 1])) };
  const rate = tx ? tx.rate : tidyRate(rateOf(F.cur, base));
  openSheet(`<form class="form" data-form="expense" novalidate>
    <h2>${tx ? 'עריכת הוצאה' : 'הוצאה חדשה'}</h2>
    <div class="amount-box">
      <select id="xf-cur" class="cur-pick" aria-label="מטבע">${curOptions(F.cur, true)}</select>
      <input id="xf-amt" class="amount-in" inputmode="decimal" placeholder="0" autocomplete="off" aria-label="סכום" value="${tx ? tx.amount : ''}" dir="ltr">
    </div>
    <div class="rate-row" id="xf-rate-row"${F.cur === base ? ' hidden' : ''}>
      <span>שער <span id="xf-rate-name">${CUR[F.cur].name}</span>: <bdi>1 <b id="xf-rate-cur">${F.cur}</b> =</bdi></span><input id="xf-rate" class="in mini" inputmode="decimal" value="${rate}" dir="ltr" aria-label="שער המרה"><span>${CUR[base].sym}</span><span class="rate-eq" id="xf-rate-eq"></span>
    </div>
    <div class="label">קטגוריה</div>
    <div class="cat-grid" id="xf-cats">${CATS.map(c => `<button type="button" class="cat-btn${c.id === F.cat ? ' on' : ''}" data-act="cat" data-cat="${c.id}" style="--h:${c.hue}"><span class="cat">${icon(c.icon)}</span><span>${c.name}</span></button>`).join('')}</div>
    <div class="grid2">
      <div><label for="xf-note">על מה?</label><input id="xf-note" class="in" maxlength="60" placeholder="למשל: ארוחת ערב בנמל" value="${esc(tx?.note || '')}"></div>
      <div><label for="xf-date">מתי?</label><input id="xf-date" class="in" type="date" value="${tx?.date || today()}" max="2100-01-01"></div>
    </div>
    <div class="label">מי שילם?</div>
    ${chips('payer', mem, F.payer)}
    <div class="label split-head"><span>איך מתחלקים? <bdi class="ratio" id="xf-ratio"></bdi></span><button type="button" class="link" data-act="w-even">${icon('equal')} שווה בשווה</button></div>
    <ul class="split" id="xf-split">${mem.map(m => `<li data-uid="${m.uid}">${avatar(m)}<span class="split-name">${esc(m.name)}</span><span class="split-amt"></span>
      <span class="stepper"><button type="button" data-act="w-dec" data-uid="${m.uid}" aria-label="פחות חלקים">${icon('minus')}</button><b></b><button type="button" data-act="w-inc" data-uid="${m.uid}" aria-label="יותר חלקים">${icon('plus')}</button></span></li>`).join('')}</ul>
    <p class="form-err" id="xf-err" hidden></p>
    <button class="btn primary wide">${icon('check')} ${tx ? 'שמירת השינויים' : 'הוספת ההוצאה'}</button>
  </form>`, 'tall');
  refreshSplit();
  if (!tx) setTimeout(() => $('#xf-amt')?.focus(), 350);
}
function refreshSplit() {
  if (!F || !$('#xf-split')) return;
  const amt = num($('#xf-amt').value), base = S.wallet.meta.base;
  const parts = sharesOf(amt, F.weights);
  $$('#xf-split li').forEach(li => {
    const u = li.dataset.uid, wgt = F.weights[u] || 0;
    li.classList.toggle('off', !wgt);
    $('b', li).textContent = wgt;
    $('.split-amt', li).innerHTML = wgt ? money(parts[u] || 0, F.cur) : 'לא משתתף';
  });
  const ws = Object.values(F.weights);
  $('#xf-ratio').textContent = ws.every(x => x === ws[0]) && ws[0] > 0 ? 'שווה בשווה' : ws.join(' : ');
  const r = num($('#xf-rate').value);
  $('#xf-rate-eq').innerHTML = amt && r ? '≈ ' + money(amt * r, base) : '';
}
async function submitExpense() {
  const w = S.wallet, base = w.meta.base, err = $('#xf-err');
  const amount = num($('#xf-amt').value), rate = F.cur === base ? 1 : num($('#xf-rate').value);
  const shares = Object.fromEntries(Object.entries(F.weights).filter(([, v]) => v > 0));
  const fail = m => { err.textContent = m; err.hidden = false; };
  if (!(amount > 0)) return fail('צריך להזין סכום גדול מאפס.');
  if (!(rate > 0)) return fail('צריך להזין שער המרה תקין.');
  if (!Object.keys(shares).length) return fail('לפחות חבר אחד צריך להשתתף בהוצאה.');
  const tx = { type: 'x', amount, cur: F.cur, rate, cat: F.cat, note: $('#xf-note').value.trim(), date: $('#xf-date').value || today(), payer: F.payer, shares, by: me.uid, ts: F.ts || Date.now() };
  ls.set('pz_cur_' + w.code, F.cur);
  const editing = !!F.id;
  closeSheet();
  try { await store.setTx(w.code, F.id || newId(), tx); toast(editing ? 'ההוצאה עודכנה' : 'ההוצאה נוספה'); }
  catch { toast('השמירה נכשלה. כדאי לנסות שוב', 'err'); }
}

/* settlement form */
let G = null;
function settleSheet(pre = {}) {
  const w = S.wallet, mem = membersOf(w), base = w.meta.base;
  if (mem.length < 2) return toast('צריך לפחות שני חברים בארנק', 'err');
  const from = pre.from || me.uid, to = pre.to || mem.find(m => m.uid !== from).uid;
  G = { from, to, cur: base };
  openSheet(`<form class="form" data-form="settle" novalidate>
    <h2>תיעוד העברת תשלום</h2>
    <p class="hint">העברה שכבר בוצעה בפועל (מזומן, ביט, העברה בנקאית). המאזן יתעדכן לכולם.</p>
    <div class="amount-box"><select id="sf-cur" class="cur-pick" aria-label="מטבע">${curOptions(base, true)}</select>
      <input id="sf-amt" class="amount-in" inputmode="decimal" placeholder="0" autocomplete="off" aria-label="סכום" value="${pre.amt ? +(+pre.amt).toFixed(2) : ''}" dir="ltr"></div>
    <div class="rate-row" id="sf-rate-row" hidden><span>שער: <bdi>1 <b id="sf-rate-cur"></b> =</bdi></span><input id="sf-rate" class="in mini" inputmode="decimal" value="1" dir="ltr" aria-label="שער המרה"><span>${CUR[base].sym}</span></div>
    <div class="label">מי העביר?</div>${chips('from', mem, G.from)}
    <div class="label">למי?</div>${chips('to', mem, G.to)}
    <div class="grid2">
      <div><label for="sf-note">הערה</label><input id="sf-note" class="in" maxlength="60" placeholder="למשל: ביט"></div>
      <div><label for="sf-date">מתי?</label><input id="sf-date" class="in" type="date" value="${today()}"></div>
    </div>
    <p class="form-err" id="sf-err" hidden></p>
    <button class="btn primary wide">${icon('handshake')} תיעוד ההעברה</button>
  </form>`);
}
async function submitSettle() {
  const w = S.wallet, base = w.meta.base, err = $('#sf-err');
  const amount = num($('#sf-amt').value), rate = G.cur === base ? 1 : num($('#sf-rate').value);
  const fail = m => { err.textContent = m; err.hidden = false; };
  if (!(amount > 0)) return fail('צריך להזין סכום גדול מאפס.');
  if (!(rate > 0)) return fail('צריך להזין שער המרה תקין.');
  if (G.from === G.to) return fail('המעביר והמקבל חייבים להיות אנשים שונים.');
  const tx = { type: 's', amount, cur: G.cur, rate, from: G.from, to: G.to, note: $('#sf-note').value.trim(), date: $('#sf-date').value || today(), by: me.uid, ts: Date.now() };
  closeSheet();
  try { await store.setTx(w.code, newId(), tx); toast('ההעברה תועדה'); confetti(); }
  catch { toast('השמירה נכשלה. כדאי לנסות שוב', 'err'); }
}

function txSheet(id) {
  const w = S.wallet, t = w.tx[id], M = w.members, base = w.meta.base;
  if (!t) return;
  const foreign = t.cur !== base;
  let body;
  if (t.type === 's') {
    body = `<div class="detail-hero"><span class="cat settle xl">${icon('handshake')}</span><div class="detail-amt">${money(t.amount, t.cur)}</div><p>${esc(M[t.from]?.name || '?')} העביר/ה אל ${esc(M[t.to]?.name || '?')}</p></div>`;
  } else {
    const c = CAT[t.cat] || CAT.other, parts = sharesOf(t.amount, t.shares || {});
    body = `<div class="detail-hero">${catTile(t.cat, 'xl')}<div class="detail-amt">${money(t.amount, t.cur)}</div><p><b>${esc(t.note || c.name)}</b> · ${c.name}</p></div>
      <div class="label">חלוקה <bdi class="ratio">${Object.values(t.shares || {}).join(' : ')}</bdi></div>
      <ul class="split read">${Object.entries(parts).map(([u, v]) => `<li>${avatar(M[u])}<span class="split-name">${esc(M[u]?.name || '?')}${u === t.payer ? '<em>שילם/ה</em>' : ''}</span><span class="split-amt">${money(v, t.cur)}</span></li>`).join('')}</ul>`;
  }
  openSheet(`<div class="form">${body}
    <dl class="meta"><div><dt>${icon('calendar')} תאריך</dt><dd>${dayLabel(t.date)}</dd></div>
      ${foreign ? `<div><dt>${icon('globe')} שער</dt><dd><bdi>1 ${t.cur} = ${CUR[base].sym}${t.rate}</bdi> · ${money(t.amount * t.rate, base)}</dd></div>` : ''}
      ${t.type === 's' && t.note ? `<div><dt>${icon('info')} הערה</dt><dd>${esc(t.note)}</dd></div>` : ''}
      <div><dt>${icon('user')} תועד ע״י</dt><dd>${esc(M[t.by]?.name || '?')}</dd></div></dl>
    <div class="grid2">${t.type === 's' ? '' : `<button class="btn ghost" data-act="edit-x" data-id="${id}">${icon('pencil')} עריכה</button>`}<button class="btn danger" data-act="del-x" data-id="${id}">${icon('trash-2')} מחיקה</button></div></div>`);
}

function walletSheet(edit) {
  const m = edit ? S.wallet.meta : { name: '', emoji: TRIP_EMOJI[0], base: 'ILS' };
  openSheet(`<form class="form" data-form="wallet" data-edit="${edit ? 1 : 0}" data-emoji="${esc(m.emoji)}">
    <h2>${edit ? 'עריכת הארנק' : 'ארנק חדש לטיול'}</h2>
    <label for="nw-name">שם הטיול</label><input id="nw-name" class="in big" maxlength="32" placeholder="למשל: תאילנד 2027" value="${esc(m.name)}" required>
    <div class="label">אימוג׳י</div>
    <div class="emoji-grid">${TRIP_EMOJI.map(e => `<button type="button" class="emoji${e === m.emoji ? ' on' : ''}" data-act="emoji" data-e="${e}">${e}</button>`).join('')}</div>
    ${edit ? '' : `<label for="nw-cur">מטבע המאזן</label><select id="nw-cur" class="in">${curOptions('ILS')}</select><p class="hint">הוצאות בכל מטבע יומרו למטבע הזה לצורך המאזן. אי אפשר לשנות אותו אחר כך.</p>`}
    <button class="btn primary wide">${icon('check')} ${edit ? 'שמירה' : 'יצירת הארנק'}</button></form>`);
  setTimeout(() => $('#nw-name')?.focus(), 350);
}
function profileSheet() {
  const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  openSheet(`<form class="form" data-form="profile">
    <h2>הפרופיל שלי</h2>
    <label for="pf-name">שם</label><input id="pf-name" class="in big" maxlength="24" value="${esc(me.name)}" required>
    <div class="label">צבע</div>${colorDots(me.color)}
    <button class="btn primary wide">${icon('check')} שמירה</button>
    <div class="label">מזהה המשתמש שלי</div>
    <button type="button" class="uid" data-act="copy-uid"><bdi>${esc(me.uid)}</bdi>${icon('copy')}</button>
    <p class="hint">המזהה שמור בעוגייה בדפדפן הזה. כדאי להעתיק ולשמור אותו: איתו אפשר לשחזר את החשבון במכשיר אחר או אחרי ניקוי הדפדפן.</p>
    <button type="button" class="row-btn" data-act="restore">${icon('key-round')}<span>שחזור חשבון ממזהה</span>${icon('chevron-left')}</button>
    <button type="button" class="row-btn" data-act="theme">${icon(dark ? 'sun' : 'moon')}<span>${dark ? 'מעבר לתצוגה בהירה' : 'מעבר לתצוגה כהה'}</span></button>
  </form>`);
}
function restoreSheet() {
  openSheet(`<form class="form" data-form="restore">
    <h2>שחזור חשבון</h2>
    <p class="hint">מדביקים את מזהה המשתמש שהעתקת מהמכשיר הקודם, והארנקים שלך חוזרים.</p>
    <label for="rs-uid">מזהה משתמש</label><input id="rs-uid" class="in big mono" placeholder="PZ-XXXX-XXXX-XXXX" dir="ltr" autocomplete="off" autocapitalize="characters" required>
    <p class="form-err" id="rs-err" hidden></p>
    <button class="btn primary wide">${icon('key-round')} שחזור</button></form>`);
  setTimeout(() => $('#rs-uid')?.focus(), 350);
}
function joinSheet() {
  openSheet(`<form class="form" data-form="join">
    <h2>הצטרפות לארנק</h2>
    <label for="jn-code">קוד הצטרפות</label><input id="jn-code" class="in big mono" placeholder="XXXX-XXXX" dir="ltr" autocomplete="off" autocapitalize="characters" maxlength="12" required>
    <button class="btn primary wide">${icon('arrow-left')} הצטרפות</button></form>`);
  setTimeout(() => $('#jn-code')?.focus(), 350);
}

/* ───────── actions ───────── */
const acts = {
  close: () => closeSheet(),
  profile: profileSheet, restore: restoreSheet, join: joinSheet,
  'new-wallet': () => walletSheet(false), rename: () => walletSheet(true),
  'add-x': () => expenseSheet(), settle: el => settleSheet(el.dataset.from ? { from: el.dataset.from, to: el.dataset.to, amt: el.dataset.amt } : {}),
  tx: el => txSheet(el.dataset.id),
  'edit-x': el => { const t = S.wallet.tx[el.dataset.id]; closeSheet(); setTimeout(() => expenseSheet({ id: el.dataset.id, ...t }), 200); },
  'del-x': async el => {
    if (!el.classList.contains('armed')) { el.classList.add('armed'); el.innerHTML = icon('trash-2') + ' לחיצה נוספת למחיקה'; return; }
    closeSheet();
    try { await store.delTx(S.wallet.code, el.dataset.id); toast('נמחק'); } catch { toast('המחיקה נכשלה', 'err'); }
  },
  color: el => { $$('.dot', el.parentElement).forEach(d => { d.classList.toggle('on', d === el); d.setAttribute('aria-checked', d === el); }); },
  emoji: el => { $$('.emoji', el.parentElement).forEach(d => d.classList.toggle('on', d === el)); el.closest('form').dataset.emoji = el.dataset.e; },
  cat: el => { F.cat = el.dataset.cat; $$('#xf-cats .cat-btn').forEach(b => b.classList.toggle('on', b === el)); },
  chip: el => {
    const box = el.parentElement, name = box.dataset.chips;
    $$('.chip', box).forEach(b => b.classList.toggle('on', b === el));
    if (name === 'payer') F.payer = el.dataset.uid; else G[name] = el.dataset.uid;
  },
  'w-inc': el => { F.weights[el.dataset.uid] = Math.min(99, (F.weights[el.dataset.uid] || 0) + 1); refreshSplit(); },
  'w-dec': el => { F.weights[el.dataset.uid] = Math.max(0, (F.weights[el.dataset.uid] || 0) - 1); refreshSplit(); },
  'w-even': () => { for (const k in F.weights) F.weights[k] = 1; refreshSplit(); },
  'copy-code': () => copyText(showCode(S.wallet.code), 'הקוד הועתק'),
  'copy-link': () => copyText(shareLink(S.wallet.code), 'הקישור הועתק'),
  'copy-uid': () => copyText(me.uid, 'המזהה הועתק'),
  share: async () => {
    const w = S.wallet, url = shareLink(w.code);
    if (navigator.share) { try { await navigator.share({ title: 'Payoza', text: `הצטרפו לארנק "${w.meta.name}" ב-Payoza. קוד: ${showCode(w.code)}`, url }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
    copyText(url, 'קישור ההצטרפות הועתק');
  },
  leave: el => {
    if (!el.classList.contains('armed')) { el.classList.add('armed'); $('span', el).textContent = 'לחיצה נוספת לאישור (הנתונים נשארים לשאר החברים)'; return; }
    me.wallets = me.wallets.filter(c => c !== S.wallet.code); saveMe(); go('#/');
  },
  theme: () => {
    const root = document.documentElement;
    const dark = root.dataset.theme === 'dark' || (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.theme = dark ? 'light' : 'dark'; ls.set('pz_theme', root.dataset.theme);
    closeSheet();
  },
  'local-info': () => openSheet(`<div class="form"><h2>מצב מקומי</h2><p>האפליקציה עדיין לא מחוברת לענן, ולכן הארנקים נשמרים רק בדפדפן הזה. קוד או קישור הצטרפות יעבדו רק במכשיר הזה.</p><p class="hint">להפעלת שיתוף אמיתי בין מכשירים צריך להדביק הגדרות Firebase בקובץ <bdi>js/config.js</bdi>. ההוראות נמצאות בקובץ README.</p><button class="btn primary wide" data-act="close">הבנתי</button></div>`),
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = acts[el.dataset.act];
  if (fn) { if (el.tagName !== 'A') e.preventDefault(); fn(el, e); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

document.addEventListener('input', e => {
  const id = e.target.id;
  if (id === 'xf-amt' || id === 'xf-rate') refreshSplit();
  if (id === 'rs-uid' || id === 'jn-code') e.target.value = e.target.value.toUpperCase();
});
document.addEventListener('change', e => {
  const base = S.wallet?.meta.base;
  if (e.target.id === 'xf-cur') {
    F.cur = e.target.value;
    $('#xf-rate-row').hidden = F.cur === base;
    $('#xf-rate-cur').textContent = F.cur;
    $('#xf-rate-name').textContent = CUR[F.cur].name;
    $('#xf-rate').value = tidyRate(rateOf(F.cur, base));
    refreshSplit();
  }
  if (e.target.id === 'sf-cur') {
    G.cur = e.target.value;
    $('#sf-rate-row').hidden = G.cur === base;
    $('#sf-rate-cur').textContent = G.cur;
    $('#sf-rate').value = tidyRate(rateOf(G.cur, base));
  }
});

const forms = {
  welcome: f => {
    const name = $('#wl-name', f).value.trim();
    if (!name) return;
    me.name = name; me.color = $('.dot.on', f)?.dataset.c || me.color;
    saveMe(); onRoute();
  },
  profile: f => {
    const name = $('#pf-name', f).value.trim();
    if (!name) return;
    me.name = name; me.color = $('.dot.on', f)?.dataset.c || me.color;
    saveMe(); closeSheet(); toast('הפרופיל עודכן');
    if (S.wallet) store.setMember(S.wallet.code, me.uid, { name: me.name, color: me.color }).catch(() => {});
    render(false);
  },
  restore: async f => {
    const uid = $('#rs-uid', f).value.trim().toUpperCase(), err = $('#rs-err', f);
    let u = null;
    try { u = await store.getUser(uid); } catch { /* handled below */ }
    if (!u) { err.textContent = store.shared ? 'לא מצאנו חשבון עם המזהה הזה. כדאי לבדוק שהועתק במלואו.' : 'במצב מקומי אפשר לשחזר רק חשבון שנוצר בדפדפן הזה.'; err.hidden = false; return; }
    Object.assign(me, { uid, name: u.name || me.name, color: u.color || me.color, wallets: u.wallets || [] });
    saveMe(false);
    $$('.sheet-wrap').forEach(closeSheet);
    toast(`ברוך שובך, ${me.name}`);
    go('#/');
  },
  join: f => { const code = cleanCode($('#jn-code', f).value); if (code.length < 4) return; closeSheet(); go(`#/j/${code}`); },
  wallet: async f => {
    const name = $('#nw-name', f).value.trim(), emoji = f.dataset.emoji;
    if (!name) return;
    closeSheet();
    try {
      if (f.dataset.edit === '1') { await store.updateWallet(S.wallet.code, { name, emoji }); return toast('הארנק עודכן'); }
      const code = rand(8);
      await store.createWallet(code, { name, emoji, base: $('#nw-cur', f).value, createdAt: Date.now(), createdBy: me.uid });
      await store.setMember(code, me.uid, { name: me.name, color: me.color, joinedAt: Date.now() });
      me.wallets.unshift(code); saveMe();
      go(`#/w/${code}/crew`);
      toast('הארנק נוצר. אפשר להזמין חברים');
    } catch { toast('הפעולה נכשלה. כדאי לנסות שוב', 'err'); }
  },
  expense: submitExpense,
  settle: submitSettle,
};
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-form]');
  if (!f) return;
  e.preventDefault();
  forms[f.dataset.form]?.(f);
});

/* ───────── confetti ───────── */
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('#fx'), ctx = cv.getContext('2d'), dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.scale(dpr, dpr);
  const P = Array.from({ length: 110 }, () => ({
    x: innerWidth / 2, y: innerHeight * 0.45, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 15 - 3,
    s: Math.random() * 7 + 4, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));
  const t0 = performance.now();
  (function frame(t) {
    const k = (t - t0) / 1800;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (k >= 1) return;
    for (const p of P) {
      p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.globalAlpha = 1 - k * k; ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s / 1.5); ctx.restore();
    }
    requestAnimationFrame(frame);
  })(t0);
}

/* ───────── boot ───────── */
(async function boot() {
  const th = ls.get('pz_theme');
  if (th) document.documentElement.dataset.theme = th;
  loadMe();
  store = await createStore(firebaseConfig);
  if (me.name) saveMe();
  refreshRates();
  addEventListener('hashchange', onRoute);
  onRoute();
})();
