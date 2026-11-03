/* App shell: auth guard, sidebar (web), dropdown menu (mobile), notification bell,
   override-mode banner and logout confirmation. Every signed-in page calls Shell.init(). */
(function () {
  const C = window.APP_CONFIG, { icon, esc, $, $$ } = UI;
  const KEY = 'ls_override';
  const ctx = { user: null, profile: null, hospital: null, settings: {}, isAdmin: false };

  /* ======================= Override mode ======================= */
  const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const limitMs = () => ((ctx.settings && ctx.settings.override_timeout_min) || C.OVERRIDE_TIMEOUT_MIN) * 60000;

  const Override = {
    get() {
      const o = read();
      if (!o || !o.on) return null;
      if (ctx.profile && Date.now() - o.touched > limitMs()) { this.stop('expired'); return null; }
      return o;
    },
    isOn() { return !!this.get(); },
    start({ date, reason }) {
      sessionStorage.setItem(KEY, JSON.stringify({ on: true, date, reason: reason || '', touched: Date.now() }));
      applyOverride(); window.dispatchEvent(new CustomEvent('override:change'));
    },
    setDate(date) {
      const o = read(); if (!o) return;
      o.date = date; o.touched = Date.now(); sessionStorage.setItem(KEY, JSON.stringify(o));
      applyOverride(); window.dispatchEvent(new CustomEvent('override:change'));
    },
    touch() { const o = read(); if (o) { o.touched = Date.now(); sessionStorage.setItem(KEY, JSON.stringify(o)); } },
    stop(why) {
      const was = !!read();
      sessionStorage.removeItem(KEY);
      applyOverride();
      if (was) {
        window.dispatchEvent(new CustomEvent('override:change', { detail: { why } }));
        if (why === 'expired') UI.toast('Override mode turned off after a period of inactivity.', 'info', 5000);
      }
    }
  };
  window.Override = Override;

  function applyOverride() {
    const o = read(); const on = !!(o && o.on);
    document.documentElement.classList.toggle('override', on);
    const b = $('#ovBanner'); if (!b) return;
    b.hidden = !on;
    if (on) {
      const onLog = document.body.dataset.page === 'logsheet';
      $('#ovText', b).innerHTML = `<strong>Override mode is on.</strong> Changes are recorded for <strong>${esc(Logic.fmtDate(o.date, 'long'))}</strong>, not today.`;
      $('#ovGo', b).hidden = onLog;
    }
    setBannerHeight();
  }
  function setBannerHeight() {
    const b = $('#ovBanner');
    const h = b && !b.hidden ? b.offsetHeight : 0;
    document.documentElement.style.setProperty('--banner-h', h + 'px');
  }

  /* ======================= Navigation ======================= */
  const NAV = [
    { key: 'dashboard', label: 'Dashboard', icon: 'layout', href: C.PATHS.dashboard },
    { key: 'logsheet',  label: 'Log Sheet', icon: 'clipboard', href: C.PATHS.logsheet },
    { key: 'profile',   label: 'Profile',   icon: 'user', href: C.PATHS.profile },
    { key: 'help',      label: 'Help and support', icon: 'help', href: C.PATHS.help },
    { key: 'admin',     label: 'Admin',     icon: 'shield', href: C.PATHS.admin, admin: true }
  ];
  const navLinks = (page) => NAV.filter(n => !n.admin || ctx.isAdmin).map(n =>
    `<a class="nav-link ${n.key === page ? 'active' : ''}" href="${n.href}" ${n.key === page ? 'aria-current="page"' : ''}>${icon(n.icon, 20)}<span>${n.label}</span>${n.key === 'admin' ? '<span class="nav-count" id="navPending" hidden></span>' : ''}</a>`).join('');

  function buildShell() {
    const page = document.body.dataset.page, title = document.body.dataset.title || '';
    const main = $('#page'); main.classList.add('content');
    const p = ctx.profile;
    const app = document.createElement('div'); app.className = 'app';
    app.innerHTML = `
      <aside class="sidebar" id="sidebar" aria-label="Main navigation">
        <a class="brand" href="${C.PATHS.dashboard}"><img src="${C.LOGO_ONLY}" alt="" class="brand-logo"><span class="brand-name">${esc(C.APP_NAME)}</span></a>
        <nav class="sidebar-nav">${navLinks(page)}</nav>
        <div class="sidebar-foot">
          <div class="user-chip"><span class="avatar">${esc(UI.initials(p.full_name))}</span>
            <span class="user-meta"><strong>${esc(p.full_name)}</strong><small>${esc(ctx.hospital ? ctx.hospital.name : '')}</small></span></div>
          <button class="btn btn-ghost btn-block btn-sm" data-logout>${icon('logout', 18)}<span>Log out</span></button>
        </div>
      </aside>
      <div class="main-wrap">
        <header class="topbar">
          <a class="topbar-brand" href="${C.PATHS.dashboard}" aria-label="Home"><img src="${C.LOGO}" alt="" class="brand-logo"></a>
          <h1 class="topbar-title">${NAV.find(n => n.key === page) ? '<span class="title-ico">' + icon(NAV.find(n => n.key === page).icon, 22) + '</span>' : ''}<span class="title-text">${esc(title)}</span></h1>
          <div class="topbar-actions">
            <button class="icon-btn" id="themeBtn" aria-label="Toggle dark mode" title="Toggle dark mode"></button>
            <div class="pop-anchor">
              <button class="icon-btn" id="bellBtn" aria-label="Notifications" aria-expanded="false">${icon('bell')}<span class="badge-dot" id="bellDot" hidden></span></button>
              <div class="pop pop-notif" id="bellPop" hidden></div>
            </div>
            <button class="icon-btn menu-btn" id="menuBtn" aria-label="Open menu" aria-expanded="false" aria-controls="menuPop">${icon('menu')}</button>
          </div>
        </header>
      </div>
      <div class="menu-backdrop" id="menuBackdrop" hidden></div>
      <div class="menu-pop" id="menuPop" hidden>
        <div class="menu-user"><span class="avatar">${esc(UI.initials(p.full_name))}</span>
          <span class="user-meta"><strong>${esc(p.full_name)}</strong><small>${esc(ctx.hospital ? ctx.hospital.name : '')}</small></span></div>
        <nav>${navLinks(page)}</nav>
        <button class="nav-link nav-logout" data-logout>${icon('logout', 20)}<span>Log out</span></button>
      </div>`;
    const banner = document.createElement('div');
    banner.id = 'ovBanner'; banner.className = 'override-banner'; banner.hidden = true; banner.setAttribute('role', 'alert');
    banner.innerHTML = `${icon('zap', 20)}<span id="ovText"></span>
      <span class="ov-actions"><a class="btn btn-sm btn-light" id="ovGo" href="${C.PATHS.logsheet}">Go to log sheet</a>
      <button class="btn btn-sm btn-light" id="ovOff">Turn off</button></span>`;
    document.body.prepend(app); document.body.prepend(banner);
    $('.main-wrap', app).appendChild(main);
    const foot = document.createElement('footer'); foot.className = 'app-foot';
    foot.innerHTML = `<strong class="foot-name">PCares App · Version ${esc(C.APP_VERSION || '1.0.0')}</strong><span>© ${new Date().getFullYear()} Bytestack. All Rights Reserved.</span>`; $('.main-wrap', app).appendChild(foot);
  }

  function bindShell() {
    const menu = $('#menuPop'), mbd = $('#menuBackdrop'), mbtn = $('#menuBtn');
    const toggleMenu = (open) => {
      open = open === undefined ? menu.hidden : open;
      menu.hidden = !open; mbd.hidden = !open; mbtn.setAttribute('aria-expanded', String(open));
      mbtn.innerHTML = icon(open ? 'x' : 'menu');
    };
    mbtn.addEventListener('click', () => { closeBell(); toggleMenu(); });
    mbd.addEventListener('click', () => toggleMenu(false));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { toggleMenu(false); closeBell(); } });
    window.addEventListener('resize', () => { if (window.innerWidth >= 900) toggleMenu(false); setBannerHeight(); });
    $$('[data-logout]').forEach(b => b.addEventListener('click', logout));
    $('#ovOff').addEventListener('click', () => { Override.stop('manual'); UI.toast('Override mode is off. You are back on today’s sheet.', 'success'); });

    const tb = $('#themeBtn');
    const drawTheme = () => { tb.innerHTML = icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon'); };
    drawTheme();
    tb.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('ls_theme', next); } catch (e) {}
      window.__applyTheme(); drawTheme();
    });

    /* bell */
    const bell = $('#bellBtn'), pop = $('#bellPop');
    function closeBell() { pop.hidden = true; bell.setAttribute('aria-expanded', 'false'); }
    bell.addEventListener('click', (e) => {
      e.stopPropagation(); toggleMenu(false);
      pop.hidden = !pop.hidden; bell.setAttribute('aria-expanded', String(!pop.hidden));
      if (!pop.hidden) drawBell();
    });
    document.addEventListener('click', (e) => { if (!pop.hidden && !pop.contains(e.target) && e.target !== bell) closeBell(); });
    pop.addEventListener('click', async (e) => {
      const item = e.target.closest('[data-nid]');
      if (e.target.closest('#markAll')) { await API.notifications.markAllRead(ctx.user.id); await loadNotifs(); drawBell(); return; }
      if (item) {
        await API.notifications.markRead(item.dataset.nid);
        const link = item.dataset.link; await loadNotifs();
        if (link) location.href = link; else drawBell();
      }
    });
    window.addEventListener('override:change', () => { applyOverride(); });
    setInterval(() => { Override.get(); }, 15000);
    setInterval(loadNotifs, 60000);
  }

  let notifs = [];
  async function loadNotifs() {
    notifs = await API.notifications.list(ctx.user.id);
    const n = notifs.filter(x => !x.is_read).length;
    const dot = $('#bellDot'); dot.hidden = !n; dot.textContent = n > 9 ? '9+' : n;
    if (!$('#bellPop').hidden) drawBell();
  }
  function drawBell() {
    const pop = $('#bellPop');
    const unread = notifs.filter(x => !x.is_read).length;
    pop.innerHTML = `<div class="pop-head"><strong>Notifications</strong>${unread ? '<button class="link-btn" id="markAll">Mark all as read</button>' : ''}</div>
      <div class="notif-list">${notifs.length ? notifs.map(n => `
        <button class="notif-item ${n.is_read ? '' : 'unread'}" data-nid="${n.id}" data-link="${esc(n.link || '')}">
          <span class="notif-ico notif-${esc(n.type)}">${icon(n.type === 'override' ? 'zap' : n.type === 'signup' ? 'userCheck' : n.type === 'account' ? 'check' : 'bell', 16)}</span>
          <span class="notif-text"><strong>${esc(n.title)}</strong>${n.body ? `<small>${esc(n.body)}</small>` : ''}<em>${UI.timeAgo(n.created_at)}</em></span>
        </button>`).join('') : `<div class="empty-mini">${icon('bell', 22)}<p>You’re all caught up.</p></div>`}</div>`;
  }

  /* ======================= Logout ======================= */
  async function logout() {
    const ovOn = Override.isOn();
    const ok = await UI.confirm({
      title: 'Log out?', confirmText: 'Log out', iconName: 'logout',
      message: `<p>You will need to sign in again to continue.</p>${ovOn ? '<p class="confirm-warn"><strong>Override mode is still on.</strong> It will be turned off when you log out.</p>' : ''}`
    });
    if (!ok) return;
    Override.stop('logout');
    await API.signOut();
    location.replace(C.PATHS.login);
  }

  function redirectToLogin(reason) {
    location.replace(C.PATHS.login + (reason ? '?reason=' + reason : ''));
    return new Promise(() => {});
  }

  /* ======================= Init ======================= */
  async function init(opts = {}) {
    try {
      const session = await API.session();
      if (!session) return redirectToLogin();
      const profile = await API.profile(session.user.id);
      if (!profile) { await API.signOut(); return redirectToLogin('noprofile'); }
      if (profile.status !== 'approved') { await API.signOut(); return redirectToLogin(profile.status); }
      if (!profile.hospital_id) return redirectToLogin();
      ctx.user = session.user; ctx.profile = profile; ctx.isAdmin = profile.role === 'admin';
      if (opts.adminOnly && !ctx.isAdmin) { location.replace(C.PATHS.dashboard); return new Promise(() => {}); }
      [ctx.hospital, ctx.settings] = await Promise.all([API.hospitals.get(profile.hospital_id).catch(() => null), API.settings.all()]);
    } catch (e) {
      document.body.innerHTML = `<div class="fatal"><h2>We couldn’t load the app</h2><p>${esc(e.message)}</p><a class="btn btn-primary" href="">Try again</a></div>`;
      document.body.classList.add('ready');
      return new Promise(() => {});
    }
    Override.get();                       // expire stale override on load
    buildShell(); bindShell(); applyOverride();
    loadNotifs();
    if (ctx.isAdmin) {
      const { count } = await API.sb.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      $$('#navPending').forEach(el => { if (count) { el.hidden = false; el.textContent = count; } });
    }
    document.body.classList.add('ready');
    setBannerHeight();
    return ctx;
  }

  window.Shell = { init, ctx, logout };
})();
