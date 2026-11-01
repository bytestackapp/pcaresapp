/* Admin: approve sign-ups, manage users and hospitals, app settings, audit log. */
(async function () {
  const ctx = await Shell.init({ adminOnly: true });
  const me = ctx.profile, L = Logic, C = APP_CONFIG, { $, $$, esc, icon, setBusy } = UI;
  const root = $('#page');
  const S = { tab: (location.hash || '#approvals').slice(1), profiles: [], hospitals: [], settings: ctx.settings, audit: [], today: {} };
  const TABS = [['approvals', 'Approvals', 'userCheck'], ['users', 'Users', 'users'], ['hospitals', 'Hospitals', 'building'], ['settings', 'Settings', 'sliders']];
  if (!TABS.some(t => t[0] === S.tab)) S.tab = 'approvals';
  const hname = (id) => (S.hospitals.find(h => h.id === id) || {}).name || '—';
  const pname = (id) => { const p = S.profiles.find(x => x.id === id); return p ? p.full_name : 'Unknown'; };
  const statusBadge = (s) => ({ approved: '<span class="badge badge-green">Active</span>', pending: '<span class="badge badge-amber">Pending</span>', rejected: '<span class="badge badge-red">Declined</span>', suspended: '<span class="badge badge-red">Suspended</span>' }[s] || '');

  async function loadAll() {
    try {
      [S.profiles, S.hospitals] = await Promise.all([API.admin.profiles(), API.hospitals.list(true)]);
      const rows = await API.admin.entriesOn(L.todayStr()); S.today = {}; rows.forEach(r => { S.today[r.hospital_id] = (S.today[r.hospital_id] || 0) + 1; });
    } catch (e) { UI.toast(e.message, 'error', 5000); }
  }

    let tabPill = null;
  const tabsHTML = () => TABS.map(([k, l, ic]) => `<button class="tab" role="tab" data-tab="${k}">${icon(ic, 18)}<span>${l}</span><span class="nav-count" data-count="${k}" hidden></span></button>`).join('');
  function markTabs() {
    const pending = S.profiles.filter(p => p.status === 'pending').length;
    $$('.tab', root).forEach(b => { const on = b.dataset.tab === S.tab; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
    const c = $('[data-count="approvals"]', root); if (c) { c.hidden = !pending; c.textContent = pending; }
  }
  function drawBody() { ({ approvals, users, hospitals, settings, audit })[S.tab]($('#tabBody')); }
  function draw() {
    if (!$('.tabs', root)) {
      root.innerHTML = `<div class="tabs" role="tablist">${tabsHTML()}</div><div id="tabBody"></div>`;
      $$('.tab', root).forEach(b => b.addEventListener('click', async () => {
        if (b.dataset.tab === S.tab) return;
        S.tab = b.dataset.tab; history.replaceState(null, '', '#' + S.tab);
        if (S.tab === 'audit') await loadAudit();
        markTabs(); tabPill.sync(true); drawBody();
      }));
      tabPill = UI.pill($('.tabs', root), '.tab.active');
    }
    markTabs(); tabPill.sync(false);
    drawBody();
  }

  /* ---------- approvals ---------- */
  function approvals(box) {
    const list = S.profiles.filter(p => p.status === 'pending');
    const opts = (sel) => '<option value="">Select hospital</option>' + S.hospitals.filter(h => h.is_active).map(h => `<option value="${h.id}" ${h.id === sel ? 'selected' : ''}>${esc(h.name)}</option>`).join('');
    box.innerHTML = list.length ? `<section class="card"><div class="table-wrap"><table class="tbl stack"><thead><tr><th>Name</th><th>Email</th><th>Requested</th><th></th></tr></thead><tbody>${list.map(p => `<tr>
      <td data-label="Name"><strong>${esc(p.full_name)}</strong><br><span class="muted small">@${esc(p.username)}${p.position ? ' · ' + esc(p.position) : ''}</span></td>
      <td data-label="Email">${esc(p.email)}</td>
      <td data-label="Requested" class="nowrap">${esc(UI.timeAgo(p.created_at))}</td>
      <td class="actions"><button class="btn btn-primary btn-sm" data-approve="${p.id}">Approve</button> <button class="btn btn-ghost btn-sm" data-reject="${p.id}">Decline</button></td></tr>`).join('')}</tbody></table></div></section>`
      : `<section class="card"><div class="empty">${icon('userCheck')}<h4>No sign-ups waiting</h4><p>New account requests will appear here, and you will get a notification.</p></div></section>`;
    $$('[data-approve]', box).forEach(b => b.addEventListener('click', () => {
      setStatus(b.dataset.approve, 'approved', b);
    }));
    $$('[data-reject]', box).forEach(b => b.addEventListener('click', async () => {
      const p = S.profiles.find(x => x.id === b.dataset.reject);
      if (await UI.confirm({ title: 'Decline this request?', danger: true, confirmText: 'Decline', message: `<p><strong>${esc(p.full_name)}</strong> will not be able to sign in.</p>` })) setStatus(p.id, 'rejected');
    }));
  }
  async function setStatus(id, status, btn, extra) {
    if (btn) setBusy(btn, true);
    try { const row = await API.admin.setProfile(id, { status, ...(extra || {}) }); S.profiles = S.profiles.map(p => p.id === id ? row : p); UI.toast(status === 'approved' ? 'Account approved.' : 'Account updated.', 'success'); }
    catch (e) { UI.toast(e.message, 'error', 5000); }
    draw();
  }

  /* ---------- users ---------- */
  function users(box) {
    const list = S.profiles.filter(p => p.status !== 'pending');
    box.innerHTML = `<section class="card"><div class="table-wrap"><table class="tbl stack"><thead><tr><th>Name</th><th>Hospital</th><th>Role</th><th>Status</th><th>Override</th><th></th></tr></thead><tbody>${list.map(p => {
      const self = p.id === me.id;
      return `<tr>
        <td data-label="Name"><strong>${esc(p.full_name)}</strong>${self ? ' <span class="badge">You</span>' : ''}<br><span class="muted small">@${esc(p.username)} · ${esc(p.email)}</span></td>
        <td data-label="Hospital">${esc(hname(p.hospital_id))}</td>
        <td data-label="Role">${p.role === 'admin' ? '<span class="badge badge-blue">Administrator</span>' : '<span class="badge">Staff</span>'}</td>
        <td data-label="Status">${statusBadge(p.status)}</td>
        <td data-label="Override"><label class="switch" title="Allow this user to use override mode"><input type="checkbox" data-ovr="${p.id}" ${p.can_override ? 'checked' : ''} ${p.role === 'admin' ? 'disabled' : ''} aria-label="Allow override for ${esc(p.full_name)}"><span class="switch-ui"></span></label></td>
        <td class="actions">${self ? '' : `
          <button class="btn btn-ghost btn-sm" data-role="${p.id}">${p.role === 'admin' ? 'Remove admin' : 'Make admin'}</button>
          <button class="btn btn-ghost btn-sm" data-susp="${p.id}">${p.status === 'approved' ? 'Suspend' : 'Reactivate'}</button>`}</td></tr>`;
    }).join('')}</tbody></table></div></section>`;
    $$('[data-ovr]', box).forEach(i => i.addEventListener('change', async () => {
      try { const row = await API.admin.setProfile(i.dataset.ovr, { can_override: i.checked }); S.profiles = S.profiles.map(p => p.id === row.id ? row : p); UI.toast('Override permission saved.', 'success'); }
      catch (e) { i.checked = !i.checked; UI.toast(e.message, 'error'); }
    }));
    $$('[data-role]', box).forEach(b => b.addEventListener('click', async () => {
      const p = S.profiles.find(x => x.id === b.dataset.role), to = p.role === 'admin' ? 'user' : 'admin';
      if (await UI.confirm({ title: to === 'admin' ? 'Make administrator?' : 'Remove administrator?', confirmText: 'Confirm', message: `<p><strong>${esc(p.full_name)}</strong> ${to === 'admin' ? 'will be able to approve accounts and change app settings.' : 'will lose access to the Admin page.'}</p>` })) {
        try { const row = await API.admin.setProfile(p.id, { role: to }); S.profiles = S.profiles.map(x => x.id === row.id ? row : x); UI.toast('Role updated.', 'success'); } catch (e) { UI.toast(e.message, 'error'); }
        draw();
      }
    }));
    $$('[data-susp]', box).forEach(b => b.addEventListener('click', async () => {
      const p = S.profiles.find(x => x.id === b.dataset.susp), suspend = p.status === 'approved';
      if (!suspend || await UI.confirm({ title: 'Suspend this account?', danger: true, confirmText: 'Suspend', message: `<p><strong>${esc(p.full_name)}</strong> will be signed out and cannot sign in until you reactivate the account.</p>` }))
        setStatus(p.id, suspend ? 'suspended' : 'approved');
    }));
  }

  /* ---------- hospitals ---------- */
  function hospitals(box) {
    box.innerHTML = `<div class="grid grid-main">
      <section class="card"><div class="table-wrap"><table class="tbl stack"><thead><tr><th>Hospital</th><th>Status</th><th></th></tr></thead><tbody>${S.hospitals.map(h => `<tr>
        <td data-label="Hospital"><strong>${esc(h.name)}</strong></td>
        <td data-label="Status">${h.is_active ? '<span class="badge badge-green">Active</span>' : '<span class="badge">Hidden</span>'}</td>
        <td class="actions"><button class="btn btn-ghost btn-sm" data-ren="${h.id}">Rename</button> <button class="btn btn-ghost btn-sm" data-tog="${h.id}">${h.is_active ? 'Hide' : 'Show'}</button></td></tr>`).join('') || '<tr><td colspan="4" class="empty-cell"><div class="empty-mini"><p>No hospitals yet.</p></div></td></tr>'}</tbody></table></div></section>
      <section class="card card-pad" style="align-self:start"><h3 style="margin-bottom:.2rem">Add hospitals</h3><p class="muted small">One name per line. They appear in the login and sign-up pickers.</p>
        <div class="field"><textarea class="input" id="hospNames" rows="5" placeholder="Hospital name"></textarea></div>
        <button class="btn btn-primary" id="hospAdd">${icon('plus', 18)}<span>Add to list</span></button></section></div>`;
    $('#hospAdd').addEventListener('click', async (e) => {
      const names = $('#hospNames').value.split('\n').map(x => x.trim()).filter(Boolean);
      if (!names.length) return UI.toast('Type at least one hospital name.', 'error');
      setBusy(e.currentTarget, true, 'Adding');
      try { await API.hospitals.add(names); S.hospitals = await API.hospitals.list(true); UI.toast(`${names.length} added.`, 'success'); } catch (err) { UI.toast(err.message, 'error', 5000); }
      draw();
    });
    $$('[data-tog]', box).forEach(b => b.addEventListener('click', async () => {
      const h = S.hospitals.find(x => x.id === b.dataset.tog);
      try { await API.hospitals.update(h.id, { is_active: !h.is_active }); S.hospitals = await API.hospitals.list(true); } catch (err) { UI.toast(err.message, 'error'); }
      draw();
    }));
    $$('[data-ren]', box).forEach(b => b.addEventListener('click', () => {
      const h = S.hospitals.find(x => x.id === b.dataset.ren);
      UI.modal({ title: 'Rename hospital', size: 'sm', body: `<div class="field"><label class="label" for="rnName">Hospital name</label><input class="input" id="rnName" value="${esc(h.name)}"></div>`,
        footer: [{ label: 'Cancel', className: 'btn-ghost' }, { label: 'Save', className: 'btn-primary', onClick: async (m) => {
          const v = $('#rnName', m.el).value.trim(); if (!v) return false;
          try { await API.hospitals.update(h.id, { name: v }); S.hospitals = await API.hospitals.list(true); UI.toast('Hospital renamed.', 'success'); } catch (err) { UI.toast(err.message, 'error'); return false; }
          draw();
        } }] });
    }));
  }

  /* ---------- settings ---------- */
  function settings(box) {
    const s = S.settings;
    box.innerHTML = `<section class="card card-pad" style="max-width:640px"><h3 style="margin-bottom:.2rem">Override mode</h3><p class="muted small">Lets staff record or correct entries for a past date.</p>
      <div class="field"><label class="switch"><input type="checkbox" id="setOvr" ${s.override_enabled !== false ? 'checked' : ''}><span class="switch-ui"></span><span>Allow override mode</span></label></div>
      <div class="field" style="max-width:260px"><label class="label" for="setTimeout">Turn off automatically after (minutes)</label><input class="input" id="setTimeout" type="number" min="5" max="240" value="${esc(s.override_timeout_min || 30)}"></div>
      <h3 style="margin:1.25rem 0 .2rem">Announcement</h3><p class="muted small">Shown at the top of every user’s dashboard. Leave empty for none.</p>
      <div class="field"><textarea class="input" id="setNote" rows="2" maxlength="240">${esc(s.announcement || '')}</textarea></div>
      <button class="btn btn-primary" id="setSave">Save settings</button></section>`;
    $('#setSave').addEventListener('click', async (e) => {
      const mins = Math.min(240, Math.max(5, parseInt($('#setTimeout').value, 10) || 30));
      setBusy(e.currentTarget, true, 'Saving');
      try {
        await API.settings.set('override_enabled', $('#setOvr').checked); await API.settings.set('override_timeout_min', mins); await API.settings.set('announcement', $('#setNote').value.trim());
        S.settings = await API.settings.all(); UI.toast('Settings saved.', 'success');
      } catch (err) { UI.toast(err.message, 'error', 5000); }
      draw();
    });
  }

  /* ---------- audit ---------- */
  async function loadAudit() { try { S.audit = await API.admin.audit(150); } catch (e) { UI.toast(e.message, 'error'); } }
  function audit(box) {
    const verb = { INSERT: 'Added', UPDATE: 'Edited', DELETE: 'Deleted' };
    box.innerHTML = S.audit.length ? `<section class="card"><div class="table-wrap"><table class="tbl stack"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Sheet date</th><th>Entry</th><th></th></tr></thead><tbody>${S.audit.map(a => `<tr>
      <td data-label="When" class="nowrap">${esc(new Date(a.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: C.TIMEZONE }))}</td>
      <td data-label="Who">${esc(pname(a.user_id))}</td><td data-label="Action">${esc(verb[a.action] || a.action)}</td>
      <td data-label="Sheet date" class="nowrap">${esc(L.fmtDate(a.entry_date))}</td>
      <td data-label="Entry">${esc((a.details && a.details.client) || '')} ${a.details && a.details.category ? `<span class="badge">${esc(a.details.category)}</span>` : ''}</td>
      <td data-label="">${a.is_override ? '<span class="badge badge-red">Override</span>' : ''}</td></tr>`).join('')}</tbody></table></div></section>`
      : `<section class="card"><div class="empty">${icon('list')}<h4>No activity yet</h4><p>Every added, edited and deleted entry is recorded here, with override entries flagged.</p></div></section>`;
  }

  await loadAll();
  if (S.tab === 'audit') await loadAudit();
  draw();
})();
