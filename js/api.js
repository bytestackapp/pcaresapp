/* Data layer: every data call lives here so pages stay simple.
   Supabase = login, profiles, hospitals, settings, notifications.
   Files on this laptop = all log entries, signatures and daily sheet details, in the folder the user chose (C:\PCares):
     C:\PCares\data\entries.json       every entry (without signatures)
     C:\PCares\data\sheets.json        daily sheet details (control no., OPD class)
     C:\PCares\data\signatures\<id>.png
     C:\PCares\backup\backup_<date>_<time>.json   automatic daily + manual backups
   Nothing patient-related leaves the laptop. Needs Chrome or Edge. */
(function () {
  const C = window.APP_CONFIG;
  const configured = !!C.SUPABASE_URL && !/YOUR-PROJECT/.test(C.SUPABASE_URL) && !/YOUR-ANON/.test(C.SUPABASE_ANON_KEY);
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const ACTIVE_KEY = 'ls_last_active';      // used by the auto-logout timer (see shell.js)

  function friendly(err) {
    const m = (err && err.message) || String(err || 'Something went wrong.');
    if (/invalid login credentials/i.test(m)) return 'Incorrect username or password.';
    if (/email not confirmed/i.test(m)) return 'Please confirm your email address first, then sign in.';
    if (/already registered|already been registered/i.test(m)) return 'An account with this email already exists.';
    if (/row-level security|permission denied/i.test(m)) return 'You do not have permission to do that.';
    if (/duplicate key.*username|profiles_username_key/i.test(m)) return 'That username is already taken.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Cannot reach the server. Check your internet connection and try again.';
    if (/password should be at least/i.test(m)) return 'Password must be at least 8 characters.';
    if (/password should contain at least one character/i.test(m)) return 'Password needs an upper case letter, a lower case letter and a number.';
    return m;
  }
  const fail = (error) => { if (error) { const e = new Error(friendly(error)); e.raw = error; throw e; } };
  const ok = ({ data, error }) => { fail(error); return data; };

  /* =====================================================================
     Files on this laptop
     ===================================================================== */
  const S = { root: null, data: null, sigs: null, backup: null, ready: false, loaded: false, entries: [], sheets: [], mE: 0, mS: 0, queue: Promise.resolve(), autoTried: false };

  const uuid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()); };

  /* remembers WHICH folder the user picked (just the folder handle, no patient data).
     Saved under "root2" so everyone is asked once to choose the new C:\PCares folder. */
  const FOLDER_KEY = 'root2';
  function kvDb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('pcares-fs', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function kvGet(k) { const d = await kvDb(); return new Promise((res, rej) => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
  async function kvSet(k, v) { const d = await kvDb(); return new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }

  const damaged = (name) => Object.assign(new Error('The data file “' + name + '” is damaged. Go to Profile → Your data → Restore backup.'), { damaged: true });

  async function readJson(dir, name, fallback) {
    let fh;
    try { fh = await dir.getFileHandle(name); } catch (e) { if (e.name === 'NotFoundError') return { json: fallback, mtime: 0 }; throw e; }
    const f = await fh.getFile(), txt = await f.text();
    if (!txt.trim()) return { json: fallback, mtime: f.lastModified };
    try { return { json: JSON.parse(txt), mtime: f.lastModified }; } catch (e) { throw damaged(name); }
  }
  async function writeFile(dir, name, content) {
    try {
      const fh = await dir.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(content);
      await w.close();
      return (await fh.getFile()).lastModified;
    } catch (e) {
      if (e.name === 'NotAllowedError' || e.name === 'SecurityError') { S.ready = false; throw new Error('PCaresApp lost access to the data folder. Refresh the page and allow access again.'); }
      if (e.name === 'QuotaExceededError') throw new Error('The disk is full. Free up some space and try again.');
      throw e;
    }
  }
  async function stat(name) { try { return (await (await S.data.getFileHandle(name)).getFile()).lastModified; } catch (e) { return 0; } }
  const queue = (fn) => { const p = S.queue.then(fn); S.queue = p.catch(() => {}); return p; };

  async function initFolders(root) {          // root is the C:\PCares folder itself
    S.data = await root.getDirectoryHandle('data', { create: true });          // created automatically if missing
    S.sigs = await S.data.getDirectoryHandle('signatures', { create: true });
    S.backup = await root.getDirectoryHandle('backup', { create: true });      // created automatically if missing
    S.root = root; S.ready = true; S.loaded = false; S.entries = []; S.sheets = []; S.mE = 0; S.mS = 0;
  }
  async function reload() {
    const e = await readJson(S.data, 'entries.json', { entries: [] });
    const s = await readJson(S.data, 'sheets.json', { sheets: [] });
    S.entries = Array.isArray(e.json.entries) ? e.json.entries : [];
    S.sheets = Array.isArray(s.json.sheets) ? s.json.sheets : [];
    S.mE = e.mtime; S.mS = s.mtime; S.loaded = true;
  }
  async function refresh() {          // picks up changes made outside this tab (another tab, a restored file)
    const [a, b] = await Promise.all([stat('entries.json'), stat('sheets.json')]);
    if (S.loaded && a === S.mE && b === S.mS) return;
    await reload();
  }
  const saveEntries = () => queue(async () => { S.mE = await writeFile(S.data, 'entries.json', JSON.stringify({ version: 1, entries: S.entries })); });
  const saveSheets = () => queue(async () => { S.mS = await writeFile(S.data, 'sheets.json', JSON.stringify({ version: 1, sheets: S.sheets })); });

  /* signatures */
  function dataUrlToBlob(u) {
    const bin = atob(String(u).split(',')[1] || ''), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: 'image/png' });
  }
  async function blobToDataUrl(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
    return 'data:image/png;base64,' + btoa(s);
  }
  async function readSig(id) { const f = await (await S.sigs.getFileHandle(id + '.png')).getFile(); return blobToDataUrl(f); }

  /* pop-up asking the user to choose (or re-allow) the data folder. Resolves with a folder handle, or null if cancelled. */
  function askFolder(prev) {
    return new Promise((resolve) => {
      let result = null;
      const again = !!prev;
      const pick = async (h) => {
        try { result = await window.showDirectoryPicker({ id: 'pcares', mode: 'readwrite' }); }
        catch (e) { if (e.name !== 'AbortError') UI.showAlert(UI.$('#fsAlert', h.el), e.message || 'That folder cannot be used. Choose another one.'); return false; }
        if (!/^pcares$/i.test(result.name)) { result = null; UI.showAlert(UI.$('#fsAlert', h.el), 'Please choose the folder named PCares on the C: drive (C:\\PCares).'); return false; }
      };
      const footer = [{ label: 'Cancel', className: 'btn-ghost' }];
      if (again) {
        let needPick = false;
        footer.push({ label: 'Allow access', className: 'btn-primary', onClick: async (h) => {
          if (needPick) return pick(h);
          try {
            if ((await prev.requestPermission({ mode: 'readwrite' })) === 'granted') {
              await prev.getDirectoryHandle('data', { create: true });   // fails if the folder was deleted
              result = prev; return;
            }
          } catch (e) {}
          needPick = true;
          UI.showAlert(UI.$('#fsAlert', h.el), 'The data folder could not be opened. Click Allow access again, then choose C:\\PCares (use New folder if it does not exist).'); return false;
        } });
      } else footer.push({ label: 'Choose folder', className: 'btn-primary', onClick: (h) => pick(h) });
      UI.modal({
        title: again ? 'Allow access to your data folder' : 'Choose where to save your data', headIcon: 'file', size: 'sm', persistent: true, footer,
        body: `<div id="fsAlert" class="alert" hidden></div>` + (again
          ? `<p>PCaresApp needs your permission to use the folder <strong>${UI.esc(prev.name)}</strong> again.</p>
             <ol style="padding-left:1.2rem;margin:0 0 .75rem"><li>Click <strong>Allow access</strong>.</li><li>A small box from your browser appears at the top. Click <strong>Allow</strong>. If it shows <strong>Allow on every visit</strong>, click that one instead.</li></ol>
             <p class="help">Choosing “Allow on every visit” stops this window from appearing each time you open the app.</p>`
          : `<p>PCaresApp saves your patient entries as files on this laptop, not on the internet.</p>
             <ol style="padding-left:1.2rem;margin:0 0 .75rem"><li>Click <strong>Choose folder</strong>.</li><li>Open the <strong>C:</strong> drive, then open the folder <strong>PCares</strong> (use <em>New folder</em> to create it, named exactly <strong>PCares</strong>, if it does not exist) and click <strong>Select Folder</strong>.</li><li>Click <strong>Edit files</strong> to allow it.</li></ol>
             <p class="help">PCaresApp creates the <strong>data</strong> and <strong>backup</strong> folders inside <strong>C:\\PCares</strong> by itself.</p>`),
        onClose: () => resolve(result)
      });
    });
  }

  let ensuring = null;
  async function connect() {
    if (!window.showDirectoryPicker) throw new Error('Saving to a folder needs Google Chrome or Microsoft Edge on a laptop or desktop computer.');
    let h = null;
    try { h = await kvGet(FOLDER_KEY); } catch (e) {}
    if (h) {
      let perm = 'prompt';
      try { perm = await h.queryPermission({ mode: 'readwrite' }); } catch (e) {}
      if (perm === 'granted') { try { await initFolders(h); return; } catch (e) { /* ask again below */ } }
    }
    const chosen = await askFolder(h);
    if (!chosen) throw new Error('A data folder is needed. Refresh the page and choose a folder to continue.');
    await initFolders(chosen);
    await kvSet(FOLDER_KEY, chosen);
  }
  function ensure() {
    if (S.ready) return Promise.resolve();
    if (!ensuring) ensuring = connect().finally(() => { ensuring = null; });
    return ensuring;
  }
  async function open() {
    await ensure();
    try { await refresh(); }
    catch (e) { if (e.damaged) throw e; S.ready = false; await ensure(); await refresh(); }
    kickAutoBackup();
  }

  /* backups */
  async function listBackups() {
    const out = [];
    for await (const [name, fh] of S.backup.entries()) {
      if (fh.kind !== 'file' || !name.endsWith('.json')) continue;
      const f = await fh.getFile();
      out.push({ name, modified: f.lastModified, size: f.size });
    }
    out.sort((a, b) => b.modified - a.modified);
    return out.map((b) => ({
      ...b,
      label: new Date(b.modified).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
      info: (b.name.startsWith('before-restore') ? 'Saved automatically before a restore · ' : '') + (b.size > 1048576 ? (b.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b.size / 1024)) + ' KB')
    }));
  }
  async function makeBackup(prefix) {
    try { await refresh(); } catch (e) { if (prefix === 'backup' || !e.damaged) throw e; }
    const signatures = {};
    for (const e of S.entries) if (e.has_signature) { try { signatures[e.id] = await readSig(e.id); } catch (x) {} }
    const payload = { app: 'PCaresApp', version: 2, created_at: new Date().toISOString(), entries: S.entries, sheets: S.sheets, signatures };
    const name = prefix + '_' + stamp() + '.json';
    await queue(() => writeFile(S.backup, name, JSON.stringify(payload)));
    try {                                   // keep the newest 30 regular backups
      const old = (await listBackups()).filter(b => b.name.startsWith('backup_')).slice(30);
      for (const b of old) await S.backup.removeEntry(b.name);
    } catch (e) {}
    return name;
  }
  function kickAutoBackup() {
    if (S.autoTried) return; S.autoTried = true;
    (async () => {
      const last = (await listBackups()).find(b => b.name.startsWith('backup_'));
      if (S.entries.length && (!last || Date.now() - last.modified > 20 * 3600 * 1000)) await makeBackup('backup');
    })().catch(() => {});
  }
  async function restoreBackup(name) {
    let obj;
    try { obj = JSON.parse(await (await (await S.backup.getFileHandle(name)).getFile()).text()); }
    catch (e) { throw new Error('That backup file could not be read. Try an older one.'); }
    if (!obj || obj.app !== 'PCaresApp' || !Array.isArray(obj.entries) || !Array.isArray(obj.sheets)) throw new Error('That backup file is not valid. Try an older one.');
    await makeBackup('before-restore');          // safety copy of what is there now; if this fails, nothing is restored
    const sigs = obj.signatures || {};
    for await (const [n] of S.sigs.entries()) { if (!Object.prototype.hasOwnProperty.call(sigs, n.replace(/\.png$/, ''))) { try { await S.sigs.removeEntry(n); } catch (e) {} } }
    for (const id of Object.keys(sigs)) await queue(() => writeFile(S.sigs, id + '.png', dataUrlToBlob(sigs[id])));
    S.entries = obj.entries; S.sheets = obj.sheets;
    await saveEntries(); await saveSheets();
    S.loaded = true;
    return { entries: S.entries.length };
  }

  const byDateAsc = (a, b) => String(a.entry_date).localeCompare(b.entry_date) || String(a.created_at).localeCompare(b.created_at);

  const DEFAULT_SETTINGS = { announcement: '' };

  /* sign-in always goes through the "login" function so wrong passwords are counted and the account can be locked */
  async function callLogin(username, password) {
    let res;
    try {
      res = await fetch(C.SUPABASE_URL + '/functions/v1/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': C.SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + C.SUPABASE_ANON_KEY },
        body: JSON.stringify({ username: String(username || '').trim().toLowerCase(), password })
      });
    } catch (e) { throw new Error(friendly(e)); }
    let out = {};
    try { out = await res.json(); } catch (e) {}
    if (!res.ok || !out.session) { const err = new Error(out.error || 'Could not sign in. Please try again.'); err.locked = !!out.locked; throw err; }
    return out.session;
  }

  const API = {
    configured, sb, friendly,

    /* ---------- auth ---------- */
    async session() { const { data } = await sb.auth.getSession(); return data.session; },

    async signIn(username, password) {
      const session = await callLogin(username, password);
      const { data, error } = await sb.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
      fail(error);
      try { localStorage.setItem(ACTIVE_KEY, String(Date.now())); } catch (e) {}
      return data.user;
    },
    async signUp({ email, password, username, full_name, hospital_id, position, contact_no }) {
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { username: username.trim().toLowerCase(), full_name: full_name.trim(), hospital_id, position: position || '', contact_no: contact_no || '' } }
      });
      fail(error);
      return data;
    },
    async usernameAvailable(username) {
      const { data, error } = await sb.rpc('username_available', { p_username: username });
      fail(error); return !!data;
    },
    async signOut() {
      try { localStorage.removeItem(ACTIVE_KEY); } catch (e) {}
      try { await sb.auth.signOut(); } catch (e) {}
    },
    async sendReset(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + C.PATHS.reset });
      fail(error);
    },
    async setPassword(newPassword) {
      const { error } = await sb.auth.updateUser({ password: newPassword }); fail(error);
    },
    async changePassword(username, current, next) {
      try { await callLogin(username, current); }       // checks the current password AND counts wrong tries
      catch (e) { throw new Error(String(e.message).replace('Incorrect username or password.', 'Your current password is incorrect.')); }
      await API.setPassword(next);
    },

    /* ---------- profiles ---------- */
    async profile(id) {
      const { data, error } = await sb.from('profiles').select('*').eq('id', id).maybeSingle();
      fail(error); return data;
    },
    async updateProfile(id, fields) {
      return ok(await sb.from('profiles').update(fields).eq('id', id).select().single());
    },
    async setMyHospital(hospitalId) {
      const { error } = await sb.rpc('set_my_hospital', { p_hospital: hospitalId }); fail(error);
    },

    /* ---------- hospitals ---------- */
    hospitals: {
      _cache: null,
      async list(force) {
        if (this._cache && !force) return this._cache;
        const d = ok(await sb.from('hospitals').select('*').order('name', { ascending: true }));
        this._cache = d; return d;
      },
      async get(id) { const d = await this.list(); return d.find(h => h.id === id) || null; },
      async add(names) {
        const rows = names.map(n => typeof n === 'string' ? { name: n.trim() } : { name: String(n.name || '').trim(), short_name: String(n.short_name || '').trim().toUpperCase() || null }).filter(r => r.name);
        if (!rows.length) return [];
        this._cache = null;
        return ok(await sb.from('hospitals').insert(rows).select());
      },
      async update(id, fields) { this._cache = null; return ok(await sb.from('hospitals').update(fields).eq('id', id).select().single()); }
    },

    /* ---------- settings ---------- */
    settings: {
      async all() {
        const { data, error } = await sb.from('app_settings').select('*');
        if (error) {
          if (window.UI) UI.toast('Could not load the latest settings. Default settings are shown for now.', 'warn', 6000);
          return { ...DEFAULT_SETTINGS };
        }
        const out = { ...DEFAULT_SETTINGS };
        (data || []).forEach(r => { out[r.key] = r.value; });
        return out;
      },
      async set(key, value) { ok(await sb.from('app_settings').upsert({ key, value }, { onConflict: 'key' })); }
    },

    /* ---------- log entries (files on this laptop) ---------- */
    entries: {
      /* every entry, oldest date first. */
      async all() { await open(); return S.entries.map(e => ({ ...e })).sort(byDateAsc); },
      /* entries for one hospital (or all when hospitalId is empty) between two dates, oldest first. */
      async range(hospitalId, from, to) {
        await open();
        return S.entries.filter(e => (!hospitalId || e.hospital_id === hospitalId) && (!from || e.entry_date >= from) && (!to || e.entry_date <= to))
          .map(e => ({ ...e })).sort(byDateAsc);
      },
      async signature(id) { await open(); try { return await readSig(id); } catch (e) { return null; } },
      async create(row) {
        await open();
        const { signature, ...rest } = row;
        const now = new Date().toISOString();
        const rec = { ...rest, id: uuid(), has_signature: !!signature, created_at: now, updated_at: now };
        if (signature) await queue(() => writeFile(S.sigs, rec.id + '.png', dataUrlToBlob(signature)));
        S.entries.push(rec);
        try { await saveEntries(); } catch (e) { S.entries.pop(); throw e; }
        return { ...rec };
      },
      async update(id, row) {
        await open();
        const i = S.entries.findIndex(e => e.id === id);
        if (i < 0) throw new Error('Entry not found.');
        const old = S.entries[i], { signature, ...rest } = row;
        const rec = { ...old, ...rest, id, created_at: old.created_at, created_by: old.created_by, updated_at: new Date().toISOString() };
        if (signature) { await queue(() => writeFile(S.sigs, id + '.png', dataUrlToBlob(signature))); rec.has_signature = true; }
        else if (signature === null && old.has_signature) { try { await S.sigs.removeEntry(id + '.png'); } catch (e) {} rec.has_signature = false; }
        S.entries[i] = rec;
        try { await saveEntries(); } catch (e) { S.entries[i] = old; throw e; }
        return { ...rec };
      },
      async markPrinted(map) {
        await open();
        const now = new Date().toISOString(), old = [];
        S.entries.forEach((e, i) => { if (map.has(e.id)) { old.push([i, e]); S.entries[i] = { ...e, control_no: map.get(e.id), printed_at: now }; } });
        try { await saveEntries(); } catch (err) { old.forEach(([i, e]) => { S.entries[i] = e; }); throw err; }
      },
      async remove(id) {
        await open();
        const i = S.entries.findIndex(e => e.id === id);
        if (i < 0) return;
        const old = S.entries.splice(i, 1)[0];
        try { await saveEntries(); } catch (e) { S.entries.splice(i, 0, old); throw e; }
        if (old.has_signature) { try { await S.sigs.removeEntry(id + '.png'); } catch (e) {} }
      }
    },

    /* ---------- typed report numbers (saved in the data folder, included in backups) ---------- */
    reportManual: {
      async get(ym) {
        await open();
        const r = S.sheets.find(x => x.kind === 'report_manual' && x.ym === ym);
        return r && r.data ? JSON.parse(JSON.stringify(r.data)) : {};
      },
      async set(ym, data) {
        await open();
        const i = S.sheets.findIndex(x => x.kind === 'report_manual' && x.ym === ym);
        const old = i >= 0 ? S.sheets[i] : null;
        const rec = { kind: 'report_manual', ym, data, updated_at: new Date().toISOString() };
        if (i >= 0) S.sheets[i] = rec; else S.sheets.push(rec);
        try { await saveSheets(); }
        catch (e) { if (i >= 0) S.sheets[i] = old; else S.sheets = S.sheets.filter(x => x !== rec); throw e; }
      }
    },

    /* ---------- the data folder, backups and restore ---------- */
    files: {
      async backupNow() { await ensure(); return makeBackup('backup'); },
      async listBackups() { await ensure(); return listBackups(); },
      async restore(name) { await ensure(); return restoreBackup(name); }
    },

    /* ---------- notifications ---------- */
    notifications: {
      async list(userId) {
        const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 1);
        const { data, error } = await sb.from('notifications').select('*').eq('user_id', userId).gte('created_at', cutoff.toISOString()).order('created_at', { ascending: false }).limit(25);
        if (error) return []; return data;
      },
      async markAllRead(userId) { await sb.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false); },
      async markRead(id) { await sb.from('notifications').update({ is_read: true }).eq('id', id); },
      async clearAll(userId) { const { error } = await sb.from('notifications').delete().eq('user_id', userId); fail(error); }
    },

    /* ---------- support messages (user to admin) ---------- */
    support: {
      async sendFromLogin(username, subject, message) {
        const { error } = await sb.rpc('login_support', { p_username: String(username || '').trim().toLowerCase(), p_subject: subject, p_message: message });
        fail(error);
      },
      async mine(userId) { return ok(await sb.from('support_messages').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20)); },
      async send(userId, subject, message) { return ok(await sb.from('support_messages').insert({ user_id: userId, subject, message }).select().single()); },
      async all() { return ok(await sb.from('support_messages').select('*').order('created_at', { ascending: false }).limit(200)); },
      async reply(id, reply, status) { return ok(await sb.from('support_messages').update({ admin_reply: reply || null, status, replied_at: reply ? new Date().toISOString() : null }).eq('id', id).select().single()); }
    },

    /* ---------- admin ---------- */
    admin: {
      async profiles() { return ok(await sb.from('profiles').select('*').order('created_at', { ascending: false })); },
      async setProfile(id, fields) { return ok(await sb.from('profiles').update(fields).eq('id', id).select().single()); },
      async deleteUser(id) { const { error } = await sb.rpc('admin_delete_user', { p_id: id }); fail(error); }
    }
  };

  window.API = API;
})();
