(async function () {
  const C = APP_CONFIG, { $, icon, setBusy, showAlert, hideAlert } = UI;
  $('#brandTag').textContent = C.APP_TAGLINE; $('#brandLogo').src = C.LOGO;
  $('#hospChevron').innerHTML = icon('chevronDown', 18);
  UI.bindPasswordToggles(document);

  const alertBox = $('#loginAlert');
  const hospital = UI.hospitalField($('#hospitalBtn'));

  if (!API.configured) showAlert(alertBox, 'This app is not connected to Supabase yet. Add your project URL and anon key in js/config.js.', 'warn');
  if (!window.showDirectoryPicker) showAlert(alertBox, 'PCaresApp works only in Google Chrome or Microsoft Edge on a laptop or desktop computer.', 'warn');

  // Message from a redirect (pending / rejected / suspended / session ended)
  const reason = new URLSearchParams(location.search).get('reason');
  const reasons = {
    pending: ['Your account is still waiting for administrator approval. We will notify you once it is approved.', 'info'],
    rejected: ['Your account request was declined. Please contact your administrator.', 'error'],
    suspended: ['Your account is locked or suspended. Click Support below to message the admin.', 'error'],
    noprofile: ['We could not find a profile for this account. Please contact your administrator.', 'error'],
    reset: ['Password updated. Sign in with your new password.', 'success']
  };
  if (reason && Object.prototype.hasOwnProperty.call(reasons, reason)) showAlert(alertBox, ...reasons[reason]);

  // Remember the last hospital on this device
  try {
    const last = localStorage.getItem('ls_last_hospital');
    if (last && API.configured) { const h = await API.hospitals.get(last); if (h && h.is_active) hospital.set(h); }
  } catch (e) {}

  // Already signed in? go on.
  if (API.configured) {
    try {
      const s = await API.session();
      if (s) { const p = await API.profile(s.user.id); if (p && p.status === 'approved' && p.hospital_id) { location.replace(C.PATHS.dashboard); return; } }
    } catch (e) {}
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(alertBox);
    const username = $('#username').value.trim(), password = $('#password').value, h = hospital.get();
    if (!username || !password) { if (!username) UI.flagInput($('#username')); if (!password) UI.flagInput($('#password')); return showAlert(alertBox, 'Enter your username and password.'); }
    if (!h) { UI.flagInput($('#hospitalBtn')); return showAlert(alertBox, 'Select your hospital.'); }
    const btn = $('#loginBtn'); setBusy(btn, true, 'Signing in');
    try {
      const user = await API.signIn(username, password);
      const p = await API.profile(user.id);
      const bail = async (msg, type) => { await API.signOut(); showAlert(alertBox, msg, type); };
      if (!p) return bail('We could not find a profile for this account. Please contact your administrator.');
      if (p.status === 'pending') return bail('Your account is still waiting for administrator approval. We will notify you once it is approved.', 'info');
      if (p.status === 'rejected') return bail('Your account request was declined. Please contact your administrator.');
      if (p.status === 'suspended') return bail('Your account is locked or suspended. Click Support below to message the admin.');
      await API.setMyHospital(h.id);
      try { localStorage.setItem('ls_last_hospital', h.id); } catch (e) {}
      location.replace(C.PATHS.dashboard);
    } catch (err) {
      showAlert(alertBox, err.message);
      UI.flagInput($('#password'));
    } finally { setBusy(btn, false); }
  });

  /* forgot password */
  const show = (id) => { ['panelLogin', 'panelForgot'].forEach(x => { $('#' + x).hidden = x !== id; }); $('#authBrand').hidden = id === 'panelForgot'; };
  $('#forgotLink').addEventListener('click', () => show('panelForgot'));
  $('#backToLogin').addEventListener('click', () => show('panelLogin'));
  $('#forgotForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const box = $('#forgotAlert'); hideAlert(box);
    const email = $('#forgotEmail').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return showAlert(box, 'Enter a valid email address.');
    const btn = $('#forgotBtn'); setBusy(btn, true, 'Sending');
    try { await API.sendReset(email); showAlert(box, 'If that email is registered, a reset link is on its way. Check your inbox.', 'success'); }
    catch (err) { showAlert(box, err.message); }
    finally { setBusy(btn, false); }
  });

  /* support: message the admin without signing in */
  $('#supportLink').addEventListener('click', () => UI.modal({
    title: 'Support', headIcon: 'mail', size: 'sm',
    body: `<p class="muted small">Locked out or cannot sign in? Send a message to the admin. Do not include patient details.</p>
      <div class="field"><label class="label" for="spUser">Your username</label><input class="input" id="spUser" autocapitalize="none" spellcheck="false" value="${UI.esc($('#username').value.trim())}"></div>
      <div class="field"><label class="label" for="spSub">Subject</label><input class="input" id="spSub" maxlength="100" placeholder="e.g. My account is locked"></div>
      <div class="field"><label class="label" for="spBody">Message</label><textarea class="input" id="spBody" rows="4" maxlength="900"></textarea></div>`,
    footer: [{ label: 'Cancel', className: 'btn-ghost' }, { label: 'Send message', className: 'btn-primary', onClick: async (h, b) => {
      const u = $('#spUser', h.el).value.trim(), s = $('#spSub', h.el).value.trim(), m = $('#spBody', h.el).value.trim();
      if (!u) { UI.flagInput($('#spUser', h.el)); UI.toast('Enter your username.', 'error'); return false; }
      if (!s) { UI.flagInput($('#spSub', h.el)); UI.toast('Enter a subject.', 'error'); return false; }
      if (!m) { UI.flagInput($('#spBody', h.el)); UI.toast('Enter your message.', 'error'); return false; }
      setBusy(b, true, 'Sending');
      try { await API.support.sendFromLogin(u, s, m); UI.toast('Message sent. The admin will see it.', 'success', 5000); }
      catch (err) { UI.toast(err.message, 'error', 5000); setBusy(b, false); return false; }
    } }]
  }));

  /* info modals */
  $('#aboutLink').addEventListener('click', () => UI.modal({ title: 'About', headIcon: 'info', size: 'sm', footer: [{ label: 'Close', className: 'btn-primary' }],
    body: `<p><strong>${UI.esc(C.APP_NAME)}</strong> replaces the paper P-CARES log and the daily report with one digital log sheet.</p>
      <p>Enter each client once. The app calculates the daily summary, keeps a monthly log sheet, prepares the monthly reports (Summary Inpatient and Nature of Inquiry), and exports everything to PDF in the familiar format, with a control number on each page.</p>
      <p class="muted small">Works in Google Chrome or Microsoft Edge on a laptop or desktop computer. Version ${UI.esc(C.APP_VERSION || '1.0.0')}.</p>` }));
  $('#privacyLink').addEventListener('click', () => UI.modal({ title: 'Privacy', headIcon: 'lock', size: 'sm', footer: [{ label: 'Close', className: 'btn-primary' }],
    body: `<p>Patient and member details entered here are personal information. They are saved only on this laptop, in the <strong>C:\\Temp\\PCares</strong> folder, never on the internet. This includes signatures, the typed report numbers and the backups.</p>
      <p>The online server keeps only account details: name, username, email, position, contact number, hospital, and the messages you send to the admin. Do not put patient details in a message.</p>
      <p>Backups contain patient details. Keep the folder safe, and copy the backup folder to another drive from time to time.</p>
      <p>For your protection, an account is locked after 3 wrong password attempts. The admin can unlock it once you send a message through Support.</p>
      <p>Use this app in line with the Data Privacy Act of 2012 (RA 10173) and your hospital’s data policy. Do not share your login.</p>` }));
})();
