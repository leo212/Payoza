// Storage adapters. Both expose the same interface:
//   getUser(uid) / saveUser(uid, patch)
//   getMeta(code) / createWallet(code, meta) / updateWallet(code, patch)
//   setMember(code, uid, data) / setTx(code, id, data) / delTx(code, id)
//   fetch(code) -> {meta, members, tx} | null
//   watch(code, cb) -> unsubscribe
//   delMember(code, uid)
//   addLog(code, id, entry) / getLog(code) -> newest first
// Layout: users/{uid}, wallets/{code}, wallets/{code}/members/{uid}, wallets/{code}/tx/{id}

const FB = '10.12.2';

export async function createStore(config) {
  if (window.claude?.use) {
    // Running as a Claude artifact: the platform's shared database is the only backend the page may reach.
    const db = await window.claude.use('db').catch(() => null);
    return db ? claudeStore(db) : localStore();
  }
  if (config) {
    try { return await firebaseStore(config); }
    catch (e) { console.error('Firebase init failed, falling back to local mode', e); }
  }
  return localStore();
}

async function firebaseStore(config) {
  const base = `https://www.gstatic.com/firebasejs/${FB}`;
  const [{ initializeApp }, fs] = await Promise.all([
    import(`${base}/firebase-app.js`), import(`${base}/firebase-firestore.js`),
  ]);
  const db = fs.getFirestore(initializeApp(config));
  const { doc, collection, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, query, orderBy, limit } = fs;
  const map = snap => Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
  return {
    shared: true,
    async getUser(uid) { const s = await getDoc(doc(db, 'users', uid)); return s.exists() ? s.data() : null; },
    saveUser: (uid, patch) => setDoc(doc(db, 'users', uid), patch, { merge: true }),
    async getMeta(code) { const s = await getDoc(doc(db, 'wallets', code)); return s.exists() ? s.data() : null; },
    createWallet: (code, meta) => setDoc(doc(db, 'wallets', code), meta),
    updateWallet: (code, patch) => setDoc(doc(db, 'wallets', code), patch, { merge: true }),
    setMember: (code, uid, data) => setDoc(doc(db, 'wallets', code, 'members', uid), data, { merge: true }),
    delMember: (code, uid) => deleteDoc(doc(db, 'wallets', code, 'members', uid)),
    addLog: (code, id, entry) => setDoc(doc(db, 'wallets', code, 'log', id), entry),
    async getLog(code) {
      const q = await getDocs(query(collection(db, 'wallets', code, 'log'), orderBy('ts', 'desc'), limit(300)));
      return q.docs.map(d => ({ id: d.id, ...d.data() }));
    },
    setTx: (code, id, data) => setDoc(doc(db, 'wallets', code, 'tx', id), data),
    delTx: (code, id) => deleteDoc(doc(db, 'wallets', code, 'tx', id)),
    async fetch(code) {
      const meta = await this.getMeta(code);
      if (!meta) return null;
      const [m, t] = await Promise.all([
        getDocs(collection(db, 'wallets', code, 'members')), getDocs(collection(db, 'wallets', code, 'tx')),
      ]);
      return { meta, members: map(m), tx: map(t) };
    },
    watch(code, cb, onErr) {
      const st = {};
      const emit = () => { if ('meta' in st && st.members && st.tx) cb(st.meta ? { meta: st.meta, members: st.members, tx: st.tx } : null); };
      const err = e => onErr && onErr(e);
      const u = [
        onSnapshot(doc(db, 'wallets', code), s => { st.meta = s.exists() ? s.data() : null; emit(); }, err),
        onSnapshot(collection(db, 'wallets', code, 'members'), s => { st.members = map(s); emit(); }, err),
        onSnapshot(collection(db, 'wallets', code, 'tx'), s => { st.tx = map(s); emit(); }, err),
      ];
      return () => u.forEach(f => f());
    },
  };
}

function localStore() {
  const KEY = 'pz_localdb';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  let db = read();
  db.users ||= {}; db.wallets ||= {};
  const watchers = new Map(); // code -> Set<cb>
  const snap = code => { const w = db.wallets[code]; if (!w) return null; const { log, ...rest } = w; return structuredClone(rest); };
  const notify = code => (watchers.get(code) || []).forEach(cb => cb(snap(code)));
  let bc = null;
  try { bc = new BroadcastChannel('pz'); bc.onmessage = e => { db = read(); db.users ||= {}; db.wallets ||= {}; notify(e.data); }; } catch { /* single tab */ }
  const save = code => {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage unavailable */ }
    if (code) { notify(code); bc && bc.postMessage(code); }
  };
  const W = code => db.wallets[code];
  return {
    shared: false,
    async getUser(uid) { return db.users[uid] || null; },
    async saveUser(uid, patch) { db.users[uid] = { ...db.users[uid], ...patch }; save(); },
    async getMeta(code) { return W(code)?.meta || null; },
    async createWallet(code, meta) { db.wallets[code] = { meta, members: {}, tx: {} }; save(code); },
    async updateWallet(code, patch) { Object.assign(W(code).meta, patch); save(code); },
    async setMember(code, uid, data) { W(code).members[uid] = { ...W(code).members[uid], ...data }; save(code); },
    async delMember(code, uid) { delete W(code).members[uid]; save(code); },
    async addLog(code, id, entry) { (W(code).log ||= {})[id] = entry; save(); },
    async getLog(code) { return Object.entries(W(code)?.log || {}).map(([id, e]) => ({ id, ...e })).sort((a, b) => b.ts - a.ts); },
    async setTx(code, id, data) { W(code).tx[id] = data; save(code); },
    async delTx(code, id) { delete W(code).tx[id]; save(code); },
    async fetch(code) { return snap(code); },
    watch(code, cb) {
      if (!watchers.has(code)) watchers.set(code, new Set());
      watchers.get(code).add(cb);
      queueMicrotask(() => cb(snap(code)));
      return () => watchers.get(code).delete(cb);
    },
  };
}

function claudeStore(db) {
  const W = code => db.doc('wallets/' + code);
  const data = s => (s.exists ? { ...s.data() } : null);
  const map = q => Object.fromEntries(q.docs.map(d => [d.id, { ...d.data() }]));
  // `update` needs an existing document, so merge by read-then-set.
  const merge = async (ref, patch) => ref.set({ ...(data(await ref.get()) || {}), ...patch });
  return {
    shared: true,
    getUser: async uid => data(await db.doc('users/' + uid).get()),
    saveUser: (uid, patch) => merge(db.doc('users/' + uid), patch),
    getMeta: async code => data(await W(code).get()),
    createWallet: (code, meta) => W(code).set(meta),
    updateWallet: (code, patch) => merge(W(code), patch),
    setMember: (code, uid, d) => merge(W(code).collection('members').doc(uid), d),
    delMember: (code, uid) => W(code).collection('members').doc(uid).delete(),
    addLog: (code, id, e) => W(code).collection('log').doc(id).set(e),
    async getLog(code) { return (await W(code).collection('log').orderBy('ts', 'desc').limit(300).get()).docs.map(d => ({ id: d.id, ...d.data() })); },
    setTx: (code, id, d) => W(code).collection('tx').doc(id).set(d),
    delTx: (code, id) => W(code).collection('tx').doc(id).delete(),
    async fetch(code) {
      const meta = await this.getMeta(code);
      if (!meta) return null;
      const [m, t] = await Promise.all([W(code).collection('members').get(), W(code).collection('tx').get()]);
      return { meta, members: map(m), tx: map(t) };
    },
    watch(code, cb, onErr) {
      const st = {};
      const emit = () => { if ('meta' in st && st.members && st.tx) cb(st.meta ? { meta: st.meta, members: st.members, tx: st.tx } : null); };
      const err = e => onErr && onErr(e);
      const u = [
        W(code).onSnapshot(s => { st.meta = data(s); emit(); }, err),
        W(code).collection('members').onSnapshot(q => { st.members = map(q); emit(); }, err),
        W(code).collection('tx').onSnapshot(q => { st.tx = map(q); emit(); }, err),
      ];
      return () => u.forEach(f => f());
    },
  };
}
