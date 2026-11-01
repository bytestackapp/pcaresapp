(async function () {
  const ctx = await Shell.init();
  const { hospital } = ctx; let profile = ctx.profile;
  const L = Logic, { $, esc, icon, setBusy, showAlert, hideAlert } = UI;
  const root = $('#page');

  const roleBadge = profile.role === 'admin' ? '<span class="badge badge-blue">Administrator</span>' : '<span class="badge badge-green">Staff</span>';
  const theme = (() => { try { return localStorage.getItem('ls_theme') || 'system'; } catch (e) { return 'system'; } })();
  let folderName = null;
  try { folderName = (await API.files.info()).name; } catch (e) {}

  function draw() {
    root.innerHTML = `
      <div class="grid grid-main">
        <div class="stack">
          <section class="card card-pad">
            <div class="row" style="gap:1rem;margin-bottom:1.25rem">
              <span class="avatar avatar-lg">${esc(UI.initials(profile.full_name))}</span>
              <div><h2 style="font-size:1.35rem">${esc(profile.full_name)}</h2><div class="row" style="margin-top:.3rem">${roleBadge}<span class="muted small">@${esc(profile.username)}</span></div></div>
              <span class="spacer"></span>
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
            <p class="muted small">Your entries are saved as files on this laptop, in a <strong>PCares</strong> folder inside the folder you chose (with <strong>data</strong> and <strong>backup</strong> in it). A backup is made automatically once a day. Keep the folder and backups safe: they contain patient details.</p>
            <dl class="kv" style="margin-bottom:1rem"><dt>Folder</dt><dd id="fsName">${esc(folderName || 'Not chosen yet')}</dd></dl>
            <div class="row">
              <button class="btn btn-ghost btn-sm" id="fsBackup">${icon('download', 16)}<span>Back up now</span></button>
              <button class="btn btn-ghost btn-sm" id="fsRestore">${icon('refresh', 16)}<span>Restore backup</span></button>
              <button class="btn btn-ghost btn-sm" id="fsChange">${icon('file', 16)}<span>Change folder</span></button>
            </div>
          </section>
          <section class="card card-pad">
            <h3 style="margin-bottom:.2rem">Appearance</h3><p class="muted small">Dark mode is easier on the eyes during night shifts.</p>
            <div class="seg" id="themeSeg" role="group" aria-label="Theme">
              ${['system', 'light', 'dark'].map(t => `<button data-t="${t}" class="${t === theme ? 'active' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
            </div>
          </section>
        </div>
        <section class="card card-pad" style="align-self:start">
          <h3 style="margin-bottom:.2rem">Change password</h3><p class="muted small">Use at least 8 characters.</p>
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

    $('#fsBackup').addEventListener('click', async (e) => {
      const b = e.currentTarget; setBusy(b, true, 'Backing up');
      try { const name = await API.files.backupNow(); UI.toast('Backup saved: ' + name, 'success', 6000); }
      catch (err) { UI.toast(err.message, 'error', 6000); }
      finally { setBusy(b, false); }
    });
    $('#fsRestore').addEventListener('click', openRestore);
    $('#fsChange').addEventListener('click', async () => {
      const yes = await UI.confirm({
        title: 'Change data folder?', confirmText: 'Choose folder', iconName: 'file',
        message: '<p>Your current files stay where they are. PCaresApp will use the new folder from now on. It starts empty unless that folder already contains your <strong>data</strong> folder.</p>'
      });
      if (!yes) return;
      try {
        const name = await API.files.chooseFolder();
        if (name) { folderName = name; $('#fsName').textContent = name; UI.toast('Now saving to the folder “' + name + '”.', 'success', 5000); }
      } catch (err) { UI.toast(err.message, 'error', 6000); }
    });

    $('#themeSeg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      try { localStorage.setItem('ls_theme', b.dataset.t); } catch (x) {}
      window.__applyTheme();
      document.querySelectorAll('#themeSeg button').forEach(x => x.classList.toggle('active', x === b));
      const tb = $('#themeBtn'); if (tb) tb.innerHTML = icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon');
    });
    $('#pwForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const box = $('#pwAlert'); hideAlert(box);
      const cur = $('#curPw').value, a = $('#newPw').value, b = $('#newPw2').value;
      if (!cur) return showAlert(box, 'Enter your current password.');
      if (a.length < 8) return showAlert(box, 'The new password must be at least 8 characters.');
      if (a === cur) return showAlert(box, 'Choose a password that is different from the current one.');
      if (a !== b) return showAlert(box, 'The new passwords do not match.');
      const btn = $('#pwBtn'); setBusy(btn, true, 'Updating');
      try { await API.changePassword(profile.email, cur, a); $('#pwForm').reset(); showAlert(box, 'Password updated.', 'success'); UI.toast('Password updated.', 'success'); }
      catch (err) { showAlert(box, err.message); }
      finally { setBusy(btn, false); }
    });
  }

  async function openRestore() {
    let list;
    try { list = await API.files.listBackups(); folderName = (await API.files.info()).name; $('#fsName').textContent = folderName || ''; }
    catch (err) { return UI.toast(err.message, 'error', 6000); }
    if (!list.length) return UI.toast('No backups were found in the backup folder yet.', 'info', 5000);
    UI.modal({
      title: 'Restore a backup', size: 'sm',
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
          catch (err) { showAlert($('#rsAlert', h.el), err.message); setBusy(b, false); return false; }
        }
      }]
    });
  }

  function openEdit() {
    UI.modal({
      title: 'Edit details', size: 'sm',
      body: `<div id="edAlert" class="alert" hidden></div>
        <div class="field"><label class="label" for="edName">Full name</label><input class="input" id="edName" value="${esc(profile.full_name)}"></div>
        <div class="field"><label class="label" for="edPos">Position</label><input class="input" id="edPos" value="${esc(profile.position || '')}"></div>
        <div class="field"><label class="label" for="edTel">Contact number</label><input class="input" id="edTel" type="tel" value="${esc(profile.contact_no || '')}"></div>
        <p class="help">Your username and email can only be changed by an administrator. Your hospital is chosen when you sign in.</p>`,
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
