/* Admin: approve sign-ups, manage users and hospitals, app settings, audit log. */
(async function () {
  const ctx = await Shell.init({ adminOnly: true });
  const me = ctx.profile, L = Logic, { $, $$, esc, icon, setBusy } = UI;
  const root = $('#page');
  const S = { tab: (location.hash || '#approvals').slice(1), profiles: [], hospitals: [], settings: ctx.settings, messages: [] };
  const TABS = [['approvals', 'Approvals', 'userCheck'], ['users', 'Users', 'users'], ['hospitals', 'Hospitals', 'building'], ['messages', 'Messages', 'mail'], ['inquiries', 'Inquiries', 'list'], ['settings', 'Settings', 'sliders']];
  if (!TABS.some(t => t[0] === S.tab)) S.tab = 'approvals';
  const hname = (id) => (S.hospitals.find(h => h.id === id) || {}).name || '—';
  const pname = (id) => { const p = S.profiles.find(x => x.id === id); return p ? p.full_name : 'Unknown'; };
  const statusBadge = (s) => ({ approved: '<span class="badge badge-green">Active</span>', pending: '<span class="badge badge-amber">Pending</span>', rejected: '<span class="badge badge-red">Declined</span>', suspended: '<span class="badge badge-red">Suspended</span>' }[s] || '');

  async function loadAll() {
    try {
      [S.profiles, S.hospitals, S.messages] = await Promise.all([API.admin.profiles(), API.hospitals.list(true), API.support.all().catch(() => [])]);
    } catch (e) { UI.toast(e.message, 'error', 5000); }
  }

    let tabPill = null;
  const tabsHTML = () => TABS.map(([k, l, ic]) => `<button class="tab" role="tab" data-tab="${k}">${icon(ic, 18)}<span>${l}</span><span class="nav-count" data-count="${k}" hidden></span></button>`).join('');
  function markTabs() {
    const pending = S.profiles.filter(p => p.status === 'pending').length;
    $$('.tab', root).forEach(b => { const on = b.dataset.tab === S.tab; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
    const c = $('[data-count="approvals"]', root); if (c) { c.hidden = !pending; c.textContent = pending; }
    const openMsgs = S.messages.filter(m => m.status === 'open').length;
    const c2 = $('[data-count="messages"]', root); if (c2) { c2.hidden = !openMsgs; c2.textContent = openMsgs; }
  }
  function drawBody() { ({ approvals, users, hospitals, messages, inquiries, settings })[S.tab]($('#tabBody')); }
  function draw() {
    if (!$('.tabs', root)) {
      root.innerHTML = `<div class="tabs" role="tablist">${tabsHTML()}</div><div id="tabBody"></div>`;
      $$('.tab', root).forEach(b => b.addEventListener('click', async () => {
        if (b.dataset.tab === S.tab) return;
        S.tab = b.dataset.tab; history.replaceState(null, '', '#' + S.tab);
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
    box.innerHTML = `<section class="card"><div class="table-wrap"><table class="tbl stack"><thead><tr><th>Name</th><th>Hospital</th><th>Role</th><th>Status</th><th class="actions">Action</th></tr></thead><tbody>${list.map(p => {
      const self = p.id === me.id;
      return `<tr>
        <td data-label="Name"><strong>${esc(p.full_name)}</strong>${self ? ' <span class="badge">You</span>' : ''}<br><span class="muted small">@${esc(p.username)} · ${esc(p.email)}</span></td>
        <td data-label="Hospital">${esc(hname(p.hospital_id))}</td>
        <td data-label="Role">${p.role === 'admin' ? '<span class="badge badge-blue">Administrator</span>' : '<span class="badge">Staff</span>'}</td>
        <td data-label="Status">${statusBadge(p.status)}</td>
        <td class="actions">
          <button class="icon-btn" data-edit="${p.id}" title="Edit user" aria-label="Edit ${esc(p.full_name)}">${icon('edit', 18)}</button>${self ? '' : `
          <button class="icon-btn" data-role="${p.id}" title="${p.role === 'admin' ? 'Remove admin' : 'Make admin'}" aria-label="${p.role === 'admin' ? 'Remove admin' : 'Make admin'}">${icon(p.role === 'admin' ? 'shieldOff' : 'shield', 18)}</button>
          <button class="icon-btn" data-susp="${p.id}" title="${p.status === 'approved' ? 'Suspend' : 'Reactivate'}" aria-label="${p.status === 'approved' ? 'Suspend' : 'Reactivate'}">${icon(p.status === 'approved' ? 'lock' : 'userCheck', 18)}</button>
          <button class="icon-btn danger" data-del="${p.id}" title="Delete user" aria-label="Delete ${esc(p.full_name)}">${icon('trash', 18)}</button>`}</td></tr>`;
    }).join('')}</tbody></table></div></section>`;
    $$('[data-role]', box).forEach(b => b.addEventListener('click', async () => {
      const p = S.profiles.find(x => x.id === b.dataset.role), to = p.role === 'admin' ? 'user' : 'admin';
      if (await UI.confirm({ title: to === 'admin' ? 'Make administrator?' : 'Remove administrator?', confirmText: 'Confirm', iconName: 'shield', message: `<p><strong>${esc(p.full_name)}</strong> ${to === 'admin' ? 'will be able to approve accounts and change app settings.' : 'will lose access to the Admin page.'}</p>` })) {
        try { const row = await API.admin.setProfile(p.id, { role: to }); S.profiles = S.profiles.map(x => x.id === row.id ? row : x); UI.toast('Role updated.', 'success'); } catch (e) { UI.toast(e.message, 'error'); }
        draw();
      }
    }));
    $$('[data-susp]', box).forEach(b => b.addEventListener('click', async () => {
      const p = S.profiles.find(x => x.id === b.dataset.susp), suspend = p.status === 'approved';
      if (!suspend || await UI.confirm({ title: 'Suspend this account?', danger: true, confirmText: 'Suspend', message: `<p><strong>${esc(p.full_name)}</strong> will be signed out and cannot sign in until you reactivate the account.</p>` }))
        setStatus(p.id, suspend ? 'suspended' : 'approved');
    }));
    $$('[data-del]', box).forEach(b => b.addEventListener('click', async () => {
      const p = S.profiles.find(x => x.id === b.dataset.del);
      if (!(await UI.confirm({ title: 'Delete this user?', danger: true, confirmText: 'Delete user', iconName: 'trash', message: `<p><strong>${esc(p.full_name)}</strong> (@${esc(p.username)}) will be removed and can no longer sign in. This cannot be undone.</p><p class="muted small">Entries saved on the laptops are not affected.</p>` }))) return;
      try { await API.admin.deleteUser(p.id); S.profiles = S.profiles.filter(x => x.id !== p.id); UI.toast('User deleted.', 'success'); }
      catch (e) { UI.toast(e.message, 'error', 5000); }
      draw();
    }));
    $$('[data-edit]', box).forEach(b => b.addEventListener('click', () => {
      const p = S.profiles.find(x => x.id === b.dataset.edit);
      let hf;
      const m = UI.modal({
        title: 'Edit user', headIcon: 'edit', size: 'sm',
        body: `<div class="field"><label class="label" for="euName">Full name</label><input class="input" id="euName" value="${esc(p.full_name)}"></div>
          <div class="field"><label class="label" for="euUser">Username</label><input class="input" id="euUser" value="${esc(p.username)}" autocapitalize="none" spellcheck="false"></div>
          <div class="field"><span class="label" id="euHospLabel">Hospital</span><button type="button" class="select-btn" id="euHosp" aria-labelledby="euHospLabel" aria-haspopup="dialog"><span class="sel-text">Select hospital</span><span id="euChev"></span></button></div>
          <div class="field"><label class="label" for="euPos">Position</label><input class="input" id="euPos" value="${esc(p.position || '')}"></div>
          <div class="field"><label class="label" for="euTel">Contact number</label><input class="input" id="euTel" type="tel" value="${esc(p.contact_no || '')}"></div>
          <p class="help">The email address cannot be changed here.</p>`,
        footer: [{ label: 'Cancel', className: 'btn-ghost' }, { label: 'Save changes', className: 'btn-primary', onClick: async (h, btn) => {
          const name = $('#euName', h.el).value.trim(), uname = $('#euUser', h.el).value.trim().toLowerCase();
          if (!name) { UI.toast('Enter the full name.', 'error'); return false; }
          if (!/^[a-z0-9._]{3,24}$/.test(uname)) { UI.toast('Username must be 3–24 letters, numbers, dots or underscores.', 'error'); return false; }
          setBusy(btn, true, 'Saving');
          try {
            if (uname !== p.username && !(await API.usernameAvailable(uname))) throw new Error('That username is already taken.');
            const hosp = hf.get();
            const row = await API.admin.setProfile(p.id, { full_name: name, username: uname, hospital_id: hosp ? hosp.id : p.hospital_id, position: $('#euPos', h.el).value.trim() || null, contact_no: $('#euTel', h.el).value.trim() || null });
            S.profiles = S.profiles.map(x => x.id === row.id ? row : x); UI.toast('User updated.', 'success');
          } catch (err) { UI.toast(err.message, 'error', 5000); setBusy(btn, false); return false; }
          draw();
        } }]
      });
      hf = UI.hospitalField($('#euHosp', m.el));
      $('#euChev', m.el).innerHTML = icon('chevronDown', 18);
      hf.set(S.hospitals.find(h => h.id === p.hospital_id) || null);
    }));
  }

  /* ---------- hospitals ---------- */
  function hospitals(box) {
    box.innerHTML = `<div class="grid grid-main">
      <section class="card"><div class="table-wrap"><table class="tbl stack"><thead><tr><th>Hospital</th><th>Short Name</th><th>Status</th><th></th></tr></thead><tbody>${S.hospitals.map(h => `<tr>
        <td data-label="Hospital"><strong>${esc(h.name)}</strong></td>
        <td data-label="Short Name">${h.short_name ? esc(h.short_name) : '<span class="muted">—</span>'}</td>
        <td data-label="Status">${h.is_active ? '<span class="badge badge-green">Active</span>' : '<span class="badge">Hidden</span>'}</td>
        <td class="actions"><button class="btn btn-ghost btn-sm" data-ren="${h.id}">Edit</button> <button class="btn btn-ghost btn-sm" data-tog="${h.id}">${h.is_active ? 'Hide' : 'Show'}</button></td></tr>`).join('') || '<tr><td colspan="4" class="empty-cell"><div class="empty-mini"><p>No hospitals yet.</p></div></td></tr>'}</tbody></table></div></section>
      <section class="card card-pad" style="align-self:start"><h3 style="margin-bottom:.2rem">Add hospital</h3><p class="muted small">It appears in the login and sign-up pickers.</p>
        <div class="field"><label class="label" for="hospNew">Hospital name</label><input class="input" id="hospNew" placeholder="Hospital name"></div>
        <div class="field"><label class="label" for="hospShort">Short name</label><input class="input caps" id="hospShort" placeholder="e.g. BGH" maxlength="12"></div>
        <button class="btn btn-primary" id="hospAdd">${icon('plus', 18)}<span>Add to list</span></button></section></div>`;
    $('#hospShort').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });
    $('#hospAdd').addEventListener('click', async (e) => {
      const name = $('#hospNew').value.trim(), short = $('#hospShort').value.trim();
      if (!name) return UI.toast('Type the hospital name.', 'error');
      setBusy(e.currentTarget, true, 'Adding');
      try { await API.hospitals.add([{ name, short_name: short }]); S.hospitals = await API.hospitals.list(true); UI.toast('Hospital added.', 'success'); } catch (err) { UI.toast(err.message, 'error', 5000); }
      draw();
    });
    $$('[data-tog]', box).forEach(b => b.addEventListener('click', async () => {
      const h = S.hospitals.find(x => x.id === b.dataset.tog);
      try { await API.hospitals.update(h.id, { is_active: !h.is_active }); S.hospitals = await API.hospitals.list(true); } catch (err) { UI.toast(err.message, 'error'); }
      draw();
    }));
    $$('[data-ren]', box).forEach(b => b.addEventListener('click', () => {
      const h = S.hospitals.find(x => x.id === b.dataset.ren);
      UI.modal({ title: 'Edit hospital', headIcon: 'building', size: 'sm', body: `<div class="field"><label class="label" for="rnName">Hospital name</label><input class="input" id="rnName" value="${esc(h.name)}"></div>
        <div class="field"><label class="label" for="rnShort">Short name</label><input class="input" id="rnShort" value="${esc(h.short_name || '')}" maxlength="12" style="text-transform:uppercase"></div>`,
        footer: [{ label: 'Cancel', className: 'btn-ghost' }, { label: 'Save', className: 'btn-primary', onClick: async (m) => {
          const v = $('#rnName', m.el).value.trim(); if (!v) return false;
          const sn = $('#rnShort', m.el).value.trim().toUpperCase() || null;
          try { await API.hospitals.update(h.id, { name: v, short_name: sn }); S.hospitals = await API.hospitals.list(true); UI.toast('Hospital saved.', 'success'); } catch (err) { UI.toast(err.message, 'error'); return false; }
          draw();
        } }] });
    }));
  }

  /* ---------- messages ---------- */
  function messages(box) {
    const list = S.messages;
    box.innerHTML = list.length ? `<section class="card"><div class="table-wrap"><table class="tbl stack"><thead><tr><th>From</th><th>Subject</th><th>Sent</th><th>Status</th><th class="actions">Action</th></tr></thead><tbody>${list.map(m => `<tr>
      <td data-label="From"><strong>${esc(pname(m.user_id))}</strong></td>
      <td data-label="Subject">${esc(m.subject)}</td>
      <td data-label="Sent" class="nowrap">${esc(UI.timeAgo(m.created_at))}</td>
      <td data-label="Status">${m.status === 'open' ? '<span class="badge badge-amber">Open</span>' : '<span class="badge badge-green">Done</span>'}</td>
      <td class="actions"><button class="btn btn-ghost btn-sm" data-view="${m.id}">View</button>${m.status === 'open' ? ` <button class="btn btn-primary btn-sm" data-reply="${m.id}">Reply</button>` : ''}</td></tr>`).join('')}</tbody></table></div></section>`
      : `<section class="card"><div class="empty">${icon('mail')}<h4>No messages</h4><p>Messages from users will appear here, and you will get a notification.</p></div></section>`;

    const msgBody = (m) => `<p class="muted small" style="margin-bottom:.2rem">From ${esc(pname(m.user_id))} · ${esc(UI.timeAgo(m.created_at))}</p>
      <p><strong>${esc(m.subject)}</strong></p><p style="white-space:pre-wrap">${esc(m.message)}</p>`;

    $$('[data-view]', box).forEach(b => b.addEventListener('click', () => {
      const m = S.messages.find(x => x.id === b.dataset.view);
      UI.modal({
        title: 'Message from ' + pname(m.user_id), headIcon: 'mail', size: 'sm',
        body: msgBody(m) + (m.admin_reply
          ? `<div class="msg-reply"><strong>Your reply:</strong> <span style="white-space:pre-wrap">${esc(m.admin_reply)}</span></div>`
          : '<p class="muted small">No reply yet.</p>'),
        footer: [{ label: 'Close', className: 'btn-primary' }]
      });
    }));

    $$('[data-reply]', box).forEach(b => b.addEventListener('click', () => {
      const m = S.messages.find(x => x.id === b.dataset.reply);
      UI.modal({
        title: 'Reply to ' + pname(m.user_id), headIcon: 'mail', size: 'sm',
        body: msgBody(m) + `<div class="field"><label class="label" for="msgReply">Your reply</label><textarea class="input" id="msgReply" rows="4" maxlength="1000"></textarea></div>
          <p class="help">Once sent, the message is marked as done and the reply cannot be edited.</p>`,
        footer: [{ label: 'Cancel', className: 'btn-ghost' }, { label: 'Send reply', className: 'btn-primary', onClick: async (h, btn) => {
          const text = $('#msgReply', h.el).value.trim();
          if (!text) { UI.flagInput($('#msgReply', h.el)); UI.toast('Type your reply first.', 'error'); return false; }
          setBusy(btn, true, 'Sending');
          try {
            const row = await API.support.reply(m.id, text, 'resolved');
            S.messages = S.messages.map(x => x.id === row.id ? row : x); UI.toast('Reply sent. Message marked as done.', 'success');
          } catch (err) { UI.toast(err.message, 'error', 5000); setBusy(btn, false); return false; }
          draw();
        } }]
      });
    }));
  }

  /* ---------- inquiries ---------- */
  const inqList = () => L.inquiryList(S.settings);
  async function saveInq(next, msg) {
    try { await API.settings.set('inquiries', JSON.stringify(next)); S.settings = await API.settings.all(); UI.toast(msg, 'success'); }
    catch (e) { UI.toast(e.message, 'error', 5000); }
    draw();
  }
  function inquiries(box) {
    const list = inqList();
    box.innerHTML = `<div class="grid grid-main">
      <section class="card"><div class="table-wrap"><table class="tbl stack"><thead><tr><th>Nature of inquiry</th><th></th></tr></thead><tbody>${list.map((n, i) => `<tr>
        <td data-label="Nature of inquiry"><strong>${esc(n)}</strong></td>
        <td class="actions"><button class="btn btn-ghost btn-sm" data-iedit="${i}">Edit</button> <button class="btn btn-ghost btn-sm" data-idel="${i}">Remove</button></td></tr>`).join('') || '<tr><td colspan="2" class="empty-cell"><div class="empty-mini"><p>No inquiries yet.</p></div></td></tr>'}</tbody></table></div></section>
      <section class="card card-pad" style="align-self:start"><h3 style="margin-bottom:.2rem">Add inquiry</h3><p class="muted small">It appears in the Nature of inquiry list when adding an entry. It is saved exactly as you type it.</p>
        <div class="field"><label class="label" for="inqNew">Nature of inquiry</label><input class="input" id="inqNew" maxlength="80"></div>
        <button class="btn btn-primary" id="inqAdd">${icon('plus', 18)}<span>Add to list</span></button></section></div>`;
    const dup = (v, skip) => list.some((x, i) => i !== skip && x.toLowerCase() === v.toLowerCase());
    const add = () => {
      const v = $('#inqNew').value.trim();
      if (!v) { UI.flagInput($('#inqNew')); return UI.toast('Type the nature of inquiry.', 'error'); }
      if (dup(v, -1)) { UI.flagInput($('#inqNew')); return UI.toast('That inquiry is already in the list.', 'error'); }
      saveInq([...list, v], 'Inquiry added.');
    };
    $('#inqAdd').addEventListener('click', add);
    $('#inqNew').addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    $$('[data-iedit]', box).forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.iedit;
      UI.modal({ title: 'Edit inquiry', headIcon: 'edit', size: 'sm',
        body: `<div class="field"><label class="label" for="inqEdit">Nature of inquiry</label><input class="input" id="inqEdit" maxlength="80" value="${esc(list[i])}"></div><p class="help">Entries already saved under the old name will no longer be counted in the Nature of Inquiry report. Rename only to fix a typing mistake.</p>`,
        footer: [{ label: 'Cancel', className: 'btn-ghost' }, { label: 'Save', className: 'btn-primary', onClick: (h) => {
          const v = $('#inqEdit', h.el).value.trim();
          if (!v) { UI.flagInput($('#inqEdit', h.el)); return false; }
          if (dup(v, i)) { UI.toast('That inquiry is already in the list.', 'error'); return false; }
          const next = list.slice(); next[i] = v; saveInq(next, 'Inquiry saved.');
        } }] });
    }));
    $$('[data-idel]', box).forEach(b => b.addEventListener('click', async () => {
      const i = +b.dataset.idel;
      if (await UI.confirm({ title: 'Remove this inquiry?', danger: true, confirmText: 'Remove', iconName: 'trash', message: `<p><strong>${esc(list[i])}</strong> will no longer appear in the list. Entries already saved with it will also stop being counted in the Nature of Inquiry report.</p>` }))
        saveInq(list.filter((x, j) => j !== i), 'Inquiry removed.');
    }));
  }

  /* ---------- settings ---------- */
  function settings(box) {
    const s = S.settings, today = L.todayStr();
    box.innerHTML = `<section class="card card-pad" style="max-width:640px"><h3 style="margin-bottom:.2rem">Announcement</h3><p class="muted small">Shown at the top of every user’s dashboard. Leave empty for none.</p>
      <div class="field"><textarea class="input" id="setNote" rows="2" maxlength="240">${esc(s.announcement || '')}</textarea></div>
      <div class="field" style="max-width:260px"><label class="label" for="setExp">Expires on</label><input type="date" class="input" id="setExp" value="${esc(s.announcement_expires || '')}" min="${today}"></div>
      <p class="help" style="margin-top:-.5rem;margin-bottom:1rem">The announcement is shown until the end of this date, then disappears by itself. Leave empty to keep it showing.</p>
      <button class="btn btn-primary" id="setSave">Save settings</button></section>`;
    UI.datePicker($('#setExp'), { placeholder: 'No expiry' });
    $('#setSave').addEventListener('click', async (e) => {
      const note = $('#setNote').value.trim(), exp = note ? $('#setExp').value : '';
      setBusy(e.currentTarget, true, 'Saving');
      try {
        await API.settings.set('announcement', note); await API.settings.set('announcement_expires', exp);
        S.settings = await API.settings.all(); UI.toast('Settings saved.', 'success');
      } catch (err) { UI.toast(err.message, 'error', 5000); }
      draw();
    });
  }

  await loadAll();
  draw();
})();
