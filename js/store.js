// Storage adapters. Both expose the same interface:
//   getUser(uid) / saveUser(uid, patch)
//   getMeta(code) / createWallet(code, meta) / updateWallet(code, patch)
//   setMember(code, uid, data) / setTx(code, id, data) / delTx(code, id)
//   fetch(code) -> {meta, members, tx} | null
//   watch(code, cb) -> unsubscribe
// Layout: users/{uid}, wallets/{code}, wallets/{code}/members/{uid}, wallets/{code}/tx/{id}

const FB = '10.12.2';

export async function createStore(config) {
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
  const { doc, collection, getDoc, getDocs, setDoc, deleteDoc, onSnapshot } = fs;
  const map = snap => Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
  return {
    shared: true,
    async getUser(uid) { const s = await getDoc(doc(db, 'users', uid)); return s.exists() ? s.data() : null; },
    saveUser: (uid, patch) => setDoc(doc(db, 'users', uid), patch, { merge: true }),
    async getMeta(code) { const s = await getDoc(doc(db, 'wallets', code)); return s.exists() ? s.data() : null; },
    createWallet: (code, meta) => setDoc(doc(db, 'wallets', code), meta),
    updateWallet: (code, patch) => setDoc(doc(db, 'wallets', code), patch, { merge: true }),
    setMember: (code, uid, data) => setDoc(doc(db, 'wallets', code, 'members', uid), data, { merge: true }),
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
  const snap = code => { const w = db.wallets[code]; return w ? structuredClone(w) : null; };
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
