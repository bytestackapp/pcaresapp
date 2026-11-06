(async function () {
  const ctx = await Shell.init();
  let hospital = ctx.hospital; let profile = ctx.profile;
  const L = Logic, { $, esc, icon, setBusy, showAlert, hideAlert } = UI;
  const root = $('#page');

  const roleBadge = profile.role === 'admin' ? '<span class="badge badge-blue">Administrator</span>' : '<span class="badge badge-green">Staff</span>';
  const currentTheme = () => document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

  function draw() {
    root.innerHTML = `
      <div class="grid grid-main">
        <div class="stack">
          <section class="card card-pad">
            <div class="row" style="gap:1rem;margin-bottom:1.25rem">
              <span class="avatar avatar-lg">${esc(UI.initials(profile.full_name))}</span>
              <div><h2 style="font-size:1.35rem">${esc(profile.full_name)}</h2><div class="row" style="margin-top:.3rem">${roleBadge}<span class="muted small">@${esc(profile.username)}</span></div></div>
              <span class="spacer"></span>
              <button class="btn btn-ghost btn-sm" id="hospSwitch">${icon('refresh', 16)}<span>Switch hospital</span></button>
              <button class="btn btn-ghost btn-sm" id="editBtn">${icon('edit', 16)}<span>Edit details</span></button>
            </div>
            <dl class="kv">
              <dt>Username</dt><dd>${esc(profile.username)}</dd>
              <dt>Email</dt><dd>${esc(profile.email)}</dd>
              <dt>Hospital</dt><dd>${esc(hospital ? hospital.name : '—')}</dd>
              <dt>Position</dt><dd>${esc(profile.position || '—')}</dd>
              <dt>Contact number</dt><dd>${esc(profile.contact_no || '—')}</dd>
              <dt>Member since</dt><dd>${esc(new Date(profile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))}</dd>
            </dl>
          </section>
          <section class="card card-pad">
            <h3 style="margin-bottom:.2rem">Your data</h3>
            <p class="muted small">Your entries are saved as files on this laptop, in the folder you chose during setup (with <strong>data</strong> and <strong>backup</strong> inside it). A backup is made automatically once a day. Keep the folder and backups safe: they contain patient details. For privacy, the browser shows only the folder name, not the full path. Recommended folder name: <strong>PCares</strong>.</p>
            <dl class="kv" style="margin-bottom:1rem;grid-template-columns:auto 1fr"><dt>Folder name</dt><dd id="fsName">…</dd></dl>
            <div class="row">
              <button class="btn btn-ghost btn-sm" id="fsBackup">${icon('download', 16)}<span>Back up now</span></button>
              <button class="btn btn-ghost btn-sm" id="fsRestore">${icon('refresh', 16)}<span>Restore backup</span></button>
              <button class="btn btn-ghost btn-sm" id="fsChange">${icon('file', 16)}<span>Change folder</span></button>
            </div>
          </section>
          <section class="card card-pad">
            <h3 style="margin-bottom:.2rem">Appearance</h3><p class="muted small">Dark mode is easier on the eyes during night shifts.</p>
            <div class="seg" id="themeSeg" role="group" aria-label="Theme">
              ${['light', 'dark'].map(t => `<button data-t="${t}" class="${t === currentTheme() ? 'active' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
            </div>
          </section>
        </div>
        <section class="card card-pad" style="align-self:start">
          <h3 style="margin-bottom:.2rem">Change password</h3><p class="muted small">Use at least 8 characters with upper case, lower case and a number.</p>
          <div id="pwAlert" class="alert" hidden></div>
          <form id="pwForm" novalidate>
            <div class="field"><label class="label" for="curPw">Current password</label>
              <div class="input-wrap"><input class="input" id="curPw" type="password" autocomplete="current-password"><button type="button" class="toggle-btn" data-pw-toggle="curPw" aria-label="Show password"></button></div></div>
            <div class="field"><label class="label" for="newPw">New password</label>
              <div class="input-wrap"><input class="input" id="newPw" type="password" autocomplete="new-password"><button type="button" class="toggle-btn" data-pw-toggle="newPw" aria-label="Show password"></button></div></div>
            <div class="field"><label class="label" for="newPw2">Confirm new password</label>
              <input class="input" id="newPw2" type="password" autocomplete="new-password"></div>
            <button class="btn btn-primary" id="pwBtn" type="submit">Update password</button>
          </form>
        </section>
      </div>`;
    UI.bindPasswordToggles(root);

    $('#editBtn').addEventListener('click', openEdit);
    const themePill = UI.pill($('#themeSeg'), '.active');

    $('#hospSwitch').addEventListener('click', async () => {
      const h = await UI.pickHospital({ selectedId: profile.hospital_id });
      if (!h || h.id === profile.hospital_id) return;
      try {
        await API.setMyHospital(h.id);
        profile = { ...profile, hospital_id: h.id }; ctx.profile = profile;
        hospital = h; ctx.hospital = h;
        try { localStorage.setItem('ls_last_hospital', h.id); } catch (x) {}
        document.querySelectorAll('.user-meta small').forEach(el => { el.textContent = h.short_name || h.name; });
        draw(); UI.toast('Now working in ' + h.name + '.', 'success');
      } catch (err) { UI.toast(err.message, 'error', 5000); }
    });

    $('#fsBackup').addEventListener('click', async (e) => {
      const b = e.currentTarget;
      const go = await UI.confirm({ title: 'Back up now?', confirmText: 'Back up now', iconName: 'download', message: '<p>A copy of all your entries, signatures and typed report numbers will be saved in the backup folder inside your data folder.</p>' });
      if (!go) return;
      setBusy(b, true, 'Backing up');
      try { const name = await API.files.backupNow(); UI.toast('Backup saved: ' + name, 'success', 6000); }
      catch (err) { UI.toast(err.message, 'error', 6000); }
      finally { setBusy(b, false); }
    });
    $('#fsRestore').addEventListener('click', openRestore);

    API.files.name().then((n) => { $('#fsName').textContent = n || 'Not chosen yet'; });
    $('#fsChange').addEventListener('click', async (e) => {
      const b = e.currentTarget;
      if (!window.showDirectoryPicker) return UI.toast('Changing the folder needs Google Chrome or Microsoft Edge on a laptop or desktop computer.', 'error', 6000);
      let dest;
      try { dest = await window.showDirectoryPicker({ id: 'pcares', mode: 'readwrite' }); }
      catch (err) { if (err.name !== 'AbortError') UI.toast(err.message || 'That folder cannot be used.', 'error', 6000); return; }
      const go = await UI.confirm({ title: 'Use this folder?', confirmText: 'Copy and switch', iconName: 'refresh', message: '<p>All your entries, signatures, report numbers and backups will be copied to <strong>' + esc(dest.name) + '</strong>, and the app will use that folder from now on.</p><p>The old folder is not deleted. You can delete it yourself after checking that everything works.</p>' });
      if (!go) return;
      setBusy(b, true, 'Copying');
      try { await API.files.switchTo(dest); $('#fsName').textContent = dest.name; UI.toast('Now saving in ' + dest.name + '.', 'success', 6000); }
      catch (err) { UI.toast(err.message, 'error', 7000); }
      finally { setBusy(b, false); }
    });

    $('#themeSeg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      try { localStorage.setItem('ls_theme', b.dataset.t); } catch (x) {}
      window.__applyTheme();
      document.querySelectorAll('#themeSeg button').forEach(x => x.classList.toggle('active', x === b));
      themePill.sync(true);
      const tb = $('#themeBtn'); if (tb) tb.innerHTML = icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon');
    });
    $('#pwForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const box = $('#pwAlert'); hideAlert(box);
      const cur = $('#curPw').value, a = $('#newPw').value, b = $('#newPw2').value;
      if (!cur) return showAlert(box, 'Enter your current password.');
      const pwBad = Logic.passwordProblem(a); if (pwBad) return showAlert(box, pwBad);
      if (a === cur) return showAlert(box, 'Choose a password that is different from the current one.');
      if (a !== b) return showAlert(box, 'The new passwords do not match.');
      const btn = $('#pwBtn'); setBusy(btn, true, 'Updating');
      try { await API.changePassword(profile.username, cur, a); $('#pwForm').reset(); showAlert(box, 'Password updated.', 'success'); UI.toast('Password updated.', 'success'); }
      catch (err) { showAlert(box, err.message); }
      finally { setBusy(btn, false); }
    });
  }

  async function openRestore() {
    let list;
    try { list = await API.files.listBackups(); }
    catch (err) { return UI.toast(err.message, 'error', 6000); }
    if (!list.length) return UI.toast('No backups were found in the backup folder yet.', 'info', 5000);
    UI.modal({
      title: 'Restore a backup', headIcon: 'refresh', size: 'sm',
      body: `<div id="rsAlert" class="alert alert-warn">${icon('alert', 18)}<span>Your current data is backed up first, then replaced by the backup you choose. Entries added after that backup will be gone from the list.</span></div>
        <ul class="pick-list" role="radiogroup" aria-label="Backups">${list.map((b, i) => `
          <li><label class="pick-item"><input type="radio" name="bk" value="${esc(b.name)}" ${i === 0 ? 'checked' : ''}><span class="radio-dot" aria-hidden="true"></span>
            <span class="pick-name">${esc(b.label)}<br><small class="muted">${esc(b.info)}</small></span></label></li>`).join('')}</ul>`,
      footer: [{ label: 'Cancel', className: 'btn-ghost' }, {
        label: 'Restore this backup', className: 'btn-danger',
        onClick: async (h, b) => {
          const name = ($('input[name="bk"]:checked', h.el) || {}).value; if (!name) return false;
          setBusy(b, true, 'Restoring');
          try { const r = await API.files.restore(name); UI.toast('Restored ' + r.entries + ' entries.', 'success', 6000); }
          catch (err) { UI.toast(err.message, 'error', 6000); setBusy(b, false); return false; }
        }
      }]
    });
  }

  function openEdit() {
    UI.modal({
      title: 'Edit details', headIcon: 'edit', size: 'sm',
      body: `<div id="edAlert" class="alert" hidden></div>
        <div class="field"><label class="label" for="edName">Full name</label><input class="input" id="edName" value="${esc(profile.full_name)}"></div>
        <div class="field"><label class="label" for="edPos">Position</label><input class="input" id="edPos" value="${esc(profile.position || '')}"></div>
        <div class="field"><label class="label" for="edTel">Contact number</label><input class="input" id="edTel" type="tel" value="${esc(profile.contact_no || '')}"></div>
        <p class="help">Your username and email can only be changed by an administrator. To change your hospital, use Switch hospital.</p>`,
      footer: [{ label: 'Cancel', className: 'btn-ghost' }, {
        label: 'Save changes', className: 'btn-primary',
        onClick: async (h, b) => {
          const name = $('#edName', h.el).value.trim();
          if (!name) { UI.showAlert($('#edAlert', h.el), 'Enter your full name.'); return false; }
          setBusy(b, true, 'Saving');
          try {
            profile = await API.updateProfile(profile.id, { full_name: name, position: $('#edPos', h.el).value.trim() || null, contact_no: $('#edTel', h.el).value.trim() || null });
            ctx.profile = profile; draw(); UI.toast('Details saved.', 'success');
          } catch (err) { UI.showAlert($('#edAlert', h.el), err.message); setBusy(b, false); return false; }
        }
      }]
    });
  }
  draw();
})();