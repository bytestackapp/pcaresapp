/* UI helpers: icons, toast, modals, confirm dialog, hospital picker. */
(function () {
  const ICONS = {
    layout: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
    clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 14l2 2 4-4"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    shieldOff: '<path d="M19.69 14a6.9 6.9 0 0 0 .31-2V5l-8-3-3.16 1.18"/><path d="M4.73 4.73 4 5v7c0 6 8 10 8 10a20.29 20.29 0 0 0 5.62-4.38"/><line x1="1" y1="1" x2="23" y2="23"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    edit: '<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    chevronDown: '<polyline points="6 9 12 15 18 9"/>',
    chevronLeft: '<polyline points="15 18 9 12 15 6"/>',
    chevronRight: '<polyline points="9 18 15 12 9 6"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
    moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
    sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    refresh: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    userCheck: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>'
  };
  const icon = (name, size) => `<svg class="ico" ${size ? `style="width:${size}px;height:${size}px"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const initials = (name) => { const p = String(name || '').trim().split(/\s+/).filter(Boolean); if (!p.length) return '?'; return (p.length === 1 ? p[0][0] : p[0][0] + p[p.length - 1][0]).toUpperCase(); };

  function timeAgo(iso) {
    const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    if (s < 604800) return Math.round(s / 86400) + ' d ago';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: window.APP_CONFIG.TIMEZONE });

  /* ---------- toast ---------- */
  let lastToast = { msg: '', at: 0 };
  function toast(message, type = 'info', ms = 3200) {
    if (lastToast.msg === message && Date.now() - lastToast.at < 800) return;   // no duplicate toasts
    lastToast = { msg: message, at: Date.now() };
    let stack = $('#toastStack');
    if (!stack) { stack = document.createElement('div'); stack.id = 'toastStack'; stack.className = 'toast-stack'; stack.setAttribute('role', 'status'); stack.setAttribute('aria-live', 'polite'); document.body.appendChild(stack); }
    const t = document.createElement('div');
    t.className = 'toast toast-' + type;
    t.innerHTML = `${icon(type === 'error' || type === 'warn' ? 'alert' : type === 'success' ? 'check' : 'info', 18)}<span>${esc(message)}</span>`;
    stack.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 250); }, ms);
  }

  /* ---------- modal ---------- */
  let openCount = 0;
  function modal({ title, body = '', footer = [], size = '', persistent = false, className = '', headIcon = '', onClose, beforeClose } = {}) {
    const bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.innerHTML = `
      <div class="modal ${size ? 'modal-' + size : ''} ${className}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal-head"><h3>${headIcon ? '<span class="head-ico">' + (String(headIcon).charAt(0) === '<' ? headIcon : icon(headIcon, 20)) + '</span>' : ''}${esc(title)}</h3><button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
        <div class="modal-body"></div>
        ${footer.length ? '<div class="modal-foot"></div>' : ''}
      </div>`;
    const box = $('.modal', bd), bodyEl = $('.modal-body', bd), footEl = $('.modal-foot', bd);
    if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.appendChild(body);
    const handle = { el: bd, box, body: bodyEl, closed: false };
    const prevFocus = document.activeElement;
    function close(result) {
      if (handle.closed) return;
      if (beforeClose && beforeClose(handle) === false) return;
      handle.closed = true;
      document.removeEventListener('keydown', onKey, true);
      bd.classList.remove('in');
      setTimeout(() => { bd.remove(); }, 160);
      openCount = Math.max(0, openCount - 1);
      if (!openCount) document.body.classList.remove('modal-open');
      if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) {}
      if (onClose) onClose(result);
    }
    function onKey(e) {
      if (e.key === 'Escape' && !persistent) { if (bd === lastModal()) { e.stopPropagation(); close(); } }
      if (e.key === 'Tab') trap(e);
    }
    function trap(e) {
      if (bd !== lastModal()) return;
      const f = $$('button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[href],[tabindex]:not([tabindex="-1"])', box).filter(x => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    handle.close = close;
    $$('[data-close]', bd).forEach(b => b.addEventListener('click', () => close()));
    bd.addEventListener('mousedown', (e) => { if (e.target === bd && !persistent) close(); });
    footer.forEach(f => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn ' + (f.className || 'btn-ghost'); b.textContent = f.label;
      if (f.id) b.id = f.id;
      b.addEventListener('click', async () => {
        if (f.onClick) { const r = await f.onClick(handle, b); if (r === false) return; }
        if (f.close !== false) close(f.value);
      });
      footEl.appendChild(b);
    });
    document.body.appendChild(bd);
    document.body.classList.add('modal-open');
    openCount++;
    document.addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => {
      bd.classList.add('in');
      const f = $('[autofocus], input:not([type=hidden]):not([type=radio]):not([type=checkbox]), textarea, select', bodyEl) || $('.btn-primary, .btn-danger', footEl) || box;
      if (f && f.focus) f.focus({ preventScroll: true });
    });
    return handle;
  }
  const lastModal = () => { const m = $$('.modal-backdrop'); return m[m.length - 1]; };

  function confirm({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false, iconName }) {
    return new Promise(resolve => {
      let result = false;
      modal({
        title, size: 'sm', className: 'modal-confirm' + (danger ? ' is-danger' : ''),
        headIcon: icon(iconName || (danger ? 'alert' : 'info'), 20),
        body: `<div class="confirm-msg">${message}</div>`,
        footer: [
          { label: cancelText, className: 'btn-ghost', value: false },
          { label: confirmText, className: danger ? 'btn-danger' : 'btn-primary', value: true, onClick: () => { result = true; } }
        ],
        onClose: () => resolve(result)
      });
    });
  }

  /* ---------- hospital picker (searchable radio list in a modal) ---------- */
  function pickHospital({ selectedId } = {}) {
    return new Promise(async (resolve) => {
      let chosen = null;
      const h = modal({
        title: 'Select hospital', headIcon: 'building', size: 'sm', className: 'modal-picker',
        body: `<div class="search-box">${icon('search', 18)}<input type="search" class="input" id="hpSearch" placeholder="Search hospital name" autocomplete="off" aria-label="Search hospital"></div>
               <ul class="pick-list" id="hpList" role="radiogroup" aria-label="Hospitals"><li class="pick-empty">Loading…</li></ul>`,
        footer: [{ label: 'Cancel', className: 'btn-ghost' }],
        onClose: () => resolve(chosen)
      });
      let list = [];
      try { list = (await API.hospitals.list()).filter(x => x.is_active); }
      catch (e) { $('#hpList', h.el).innerHTML = `<li class="pick-empty">${esc(e.message)}</li>`; return; }
      const ul = $('#hpList', h.el);
      function draw(q) {
        const t = (q || '').trim().toLowerCase();
        const rows = list.filter(x => !t || x.name.toLowerCase().includes(t));
        ul.innerHTML = rows.length ? rows.map(x => `
          <li><label class="pick-item ${x.id === selectedId ? 'is-selected' : ''}">
            <input type="radio" name="hosp" value="${x.id}" ${x.id === selectedId ? 'checked' : ''}>
            <span class="radio-dot" aria-hidden="true"></span><span class="pick-name">${esc(x.name)}</span>
          </label></li>`).join('') : `<li class="pick-empty">${list.length ? 'No hospital matches your search.' : 'No hospitals have been added yet. Ask your administrator.'}</li>`;
      }
      draw('');
      $('#hpSearch', h.el).addEventListener('input', (e) => draw(e.target.value));
      ul.addEventListener('change', (e) => {
        const id = e.target.value; chosen = list.find(x => x.id === id);
        setTimeout(() => h.close(), 140);
      });
    });
  }

  /* Wires a "select-looking" button to the picker. Returns {get, set}. */
  function hospitalField(btn, onChange) {
    let current = null;
    const label = $('.sel-text', btn);
    function set(h) {
      current = h;
      label.textContent = h ? h.name : 'Select your hospital';
      btn.classList.toggle('has-value', !!h);
      if (onChange) onChange(h);
    }
    btn.addEventListener('click', async () => { const h = await pickHospital({ selectedId: current && current.id }); if (h) set(h); });
    return { get: () => current, set };
  }

  function setBusy(btn, busy, text) {
    if (!btn) return;
    if (busy) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>${text ? '<span>' + esc(text) + '</span>' : ''}`; }
    else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
  }
  function showAlert(el, msg, type = 'error') {
    el.hidden = true;   // inline boxes are no longer shown; everything is a toast
    toast(msg, type, type === 'success' ? 3200 : type === 'error' ? 5000 : 6500);
  }
  const hideAlert = (el) => { el.hidden = true; };

  function bindPasswordToggles(root) {
    $$('[data-pw-toggle]', root).forEach(b => {
      b.innerHTML = icon('eye', 18);
      b.addEventListener('click', () => {
        const inp = $('#' + b.dataset.pwToggle); const show = inp.type === 'password';
        inp.type = show ? 'text' : 'password'; b.innerHTML = icon(show ? 'eyeOff' : 'eye', 18);
        b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      });
    });
  }

  /* shake an element (wrong entry) */
  function shake(el) {
    if (!el) return;
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
    const done = (ev) => { if (ev.target !== el) return; el.classList.remove('shake'); el.removeEventListener('animationend', done); };
    el.addEventListener('animationend', done);
  }

  /* sliding pill behind tabs / segmented buttons; stretches across, then settles */
  function pill(root, activeSel) {
    let el = root.querySelector(':scope > .pill');
    if (!el) { el = document.createElement('span'); el.className = 'pill'; el.setAttribute('aria-hidden', 'true'); root.prepend(el); }
    let cur = null, timer = null;
    function sync(animate) {
      const a = root.querySelector(activeSel); if (!a) return;
      const l = a.offsetLeft, w = a.offsetWidth;
      if (!animate || !cur) {
        el.style.transition = 'none'; el.style.left = l + 'px'; el.style.width = w + 'px';
        void el.offsetWidth; el.style.transition = ''; cur = { l, w }; return;
      }
      const left = Math.min(cur.l, l), right = Math.max(cur.l + cur.w, l + w);
      el.style.left = left + 'px'; el.style.width = (right - left) + 'px';
      clearTimeout(timer);
      timer = setTimeout(() => { el.style.left = l + 'px'; el.style.width = w + 'px'; }, 230);
      cur = { l, w };
    }
    sync(false);
    window.addEventListener('resize', () => sync(false));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => sync(false));
    return { sync };
  }

  /* custom date picker: replaces a date box with a button that opens a calendar pop-up */
  function datePicker(input, opts = {}) {
    if (!input) return;
    if (input._dp) { input._sync(); return; }
    input._dp = true;
    const clearable = opts.clearable !== false;
    const lab = input.id ? document.querySelector('label[for="' + input.id + '"]') : null;
    const title = opts.title || (lab ? lab.textContent.replace('*', '').replace(/\(.*?\)/, '').trim() : 'Select date');
    const pad = (n) => String(n).padStart(2, '0');
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'select-btn date-btn';
    btn.innerHTML = '<span class="sel-text"></span><span class="sel-chev"></span>';
    $('.sel-chev', btn).innerHTML = icon('calendar', 18);
    input.hidden = true; input.after(btn);
    input._sync = () => {
      const v = input.value;
      $('.sel-text', btn).textContent = v ? (window.Logic ? Logic.fmtDate(v) : v) : (opts.placeholder || 'Select date');
      btn.classList.toggle('has-value', !!v);
    };
    const setValue = (v) => { input.value = v; input._sync(); input.dispatchEvent(new Event('change', { bubbles: true })); };

    btn.addEventListener('click', () => {
      const T = window.Logic.todayStr(), min = input.min || '', max = input.max || '';
      const ok = (ds) => !((min && ds < min) || (max && ds > max));
      const base = input.value || (max && T > max ? max : (min && T < min ? min : T));
      let y = +base.slice(0, 4), mo = +base.slice(5, 7) - 1, yb = y - (y % 12), view = 'days';
      const box = document.createElement('div'); box.className = 'dp';
      function draw() {
        let head, body;
        if (view === 'days') {
          head = MONTHS[mo] + ' ' + y;
          const first = new Date(y, mo, 1).getDay(), n = new Date(y, mo + 1, 0).getDate();
          let cells = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => `<span class="dp-dow">${d}</span>`).join('') + '<span></span>'.repeat(first);
          for (let d = 1; d <= n; d++) {
            const ds = y + '-' + pad(mo + 1) + '-' + pad(d);
            cells += `<button type="button" class="dp-cell${ds === input.value ? ' is-sel' : ''}${ds === T ? ' is-today' : ''}" data-d="${ds}" ${ok(ds) ? '' : 'disabled'}>${d}</button>`;
          }
          body = `<div class="dp-grid">${cells}</div>`;
        } else if (view === 'months') {
          head = String(y);
          body = `<div class="dp-grid dp-big">${MONTHS.map((nm, i) => `<button type="button" class="dp-cell${i === mo ? ' is-sel' : ''}" data-m="${i}">${nm.slice(0, 3)}</button>`).join('')}</div>`;
        } else {
          head = yb + ' – ' + (yb + 11);
          body = `<div class="dp-grid dp-big">${Array.from({ length: 12 }, (_, i) => yb + i).map(yy => `<button type="button" class="dp-cell${yy === y ? ' is-sel' : ''}" data-y="${yy}">${yy}</button>`).join('')}</div>`;
        }
        box.innerHTML = `<div class="dp-head"><button type="button" class="icon-btn" data-nav="-1" aria-label="Previous">${icon('chevronLeft')}</button><button type="button" class="dp-title" data-title>${head}</button><button type="button" class="icon-btn" data-nav="1" aria-label="Next">${icon('chevronRight')}</button></div>` + body;
      }
      draw();
      const footer = [{ label: 'Cancel', className: 'btn-ghost' }];
      if (clearable) footer.push({ label: 'Clear', className: 'btn-ghost', onClick: () => { setValue(''); } });
      footer.push({ label: 'Today', className: 'btn-primary', onClick: () => { if (!ok(T)) { toast('Today is not available here.', 'error'); return false; } setValue(T); } });
      const m = modal({ title, headIcon: 'calendar', size: 'sm', className: 'modal-dp', body: box, footer });
      box.addEventListener('click', (ev) => {
        const t = ev.target.closest('button'); if (!t || t.disabled) return;
        if (t.dataset.nav) {
          const s = +t.dataset.nav;
          if (view === 'days') { mo += s; if (mo < 0) { mo = 11; y--; } if (mo > 11) { mo = 0; y++; } }
          else if (view === 'months') y += s; else yb += s * 12;
          draw();
        } else if ('title' in t.dataset) { view = view === 'days' ? 'months' : 'years'; if (view === 'years') yb = y - (y % 12); draw(); }
        else if (t.dataset.d) { setValue(t.dataset.d); m.close(); }
        else if (t.dataset.m) { mo = +t.dataset.m; view = 'days'; draw(); }
        else if (t.dataset.y) { y = +t.dataset.y; view = 'months'; draw(); }
      });
    });
    input._sync();
  }

  /* wrong field: shake it and flash it red for a moment */
  function flagInput(el) {
    if (!el) return;
    shake(el.closest('.input-wrap') || el);
    el.classList.remove('input-error'); void el.offsetWidth; el.classList.add('input-error');
    clearTimeout(el._flagT);
    el._flagT = setTimeout(() => el.classList.remove('input-error'), 1400);
  }

  /* About and Privacy wording: edit it here only. Used by the login page and the footer. */
  function showAbout() {
    const C = window.APP_CONFIG;
    modal({ title: 'About', headIcon: 'info', size: 'sm', footer: [{ label: 'Close', className: 'btn-primary' }],
      body: `<p><strong>${esc(C.APP_NAME)}</strong> replaces the manual P-CARES log sheet and daily report with a single digital platform.</p>
        <p>Enter each client’s information once, and the app automatically calculates daily summaries, maintains monthly log sheets, and generates monthly reports, including Summary Inpatient and Nature of Inquiry. All reports can be exported to PDF in the familiar format, with a unique control number on every page.</p>
        <p style="margin-top:20px;font-size:0.9rem"><strong>System Requirements</strong></p>
        <ul style="margin-top:8px;padding-left:22px">
          <li>Compatible with Google Chrome and Microsoft Edge.</li>
          <li>Designed for laptop and desktop computers.</li>
          <li>Current Version: ${esc(C.APP_VERSION || '1.0.0')}.</li>
        </ul>` });
  }

  function showPrivacy() {
    const C = window.APP_CONFIG;
    modal({ title: 'Privacy', headIcon: 'lock', size: 'sm', footer: [{ label: 'Close', className: 'btn-primary' }],
      body: `<p><strong>${esc(C.APP_NAME)}</strong> is designed to keep patient information stored locally on your computer.</p>
        <p style="margin-top:20px;font-size:0.9rem"><strong>1. Local Data Storage</strong></p>
        <p>Patient and member information entered into the app is stored only on your computer, in the C:\\Temp\\PCares folder. This includes signatures, report numbers, and backup files. These records are not uploaded to or stored on the online server.</p>
        <p style="margin-top:20px;font-size:0.9rem"><strong>2. Online Account Information</strong></p>
        <p>The online server stores account-related information only, including your name, username, email address, position, contact number, hospital, and messages sent to the administrator.</p>
        <p>Do not include patient or other sensitive information in messages sent through Support.</p>
        <p style="margin-top:20px;font-size:0.9rem"><strong>3. Data Backup and Security</strong></p>
        <p>Backup files contain patient information and must be handled securely. Keep your backup folder protected and regularly copy it to another drive to prevent data loss.</p>
        <p style="margin-top:20px;font-size:0.9rem"><strong>4. Account Protection</strong></p>
        <p>For security, an account is automatically locked after three consecutive incorrect password attempts. Contact the administrator through Support to request an account unlock.</p>
        <p style="margin-top:20px;font-size:0.9rem"><strong>5. Data Privacy Compliance</strong></p>
        <p>Use the app in accordance with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173) and your hospital's applicable data privacy and security policies.</p>
        <p>Never share your login credentials with others.</p>` });
  }

  window.UI = { icon, esc, $, $$, debounce, initials, timeAgo, fmtTime, toast, modal, confirm, pickHospital, hospitalField, setBusy, showAlert, hideAlert, bindPasswordToggles, shake, pill, flagInput, datePicker, showAbout, showPrivacy };
})();
