(async function () {
  const { $, showAlert, hideAlert, setBusy } = UI;
  UI.bindPasswordToggles(document);
  const box = $('#resetAlert');

  /* supabase-js turns the recovery link into a temporary session. Wait for it (up to about 5 seconds)
     instead of guessing a fixed delay, so slow laptops still work. */
  let ready = false;
  const showForm = () => { ready = true; $('#resetForm').hidden = false; };
  const linkError = /error(_code|_description)?=/i.test(location.hash + location.search);   // link already expired or used
  if (!linkError) {
    API.sb.auth.onAuthStateChange((event, session) => {
      if (session && !ready && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN')) showForm();
    });
    for (let i = 0; i < 25 && !ready; i++) {
      const s = await API.session();
      if (s) { showForm(); break; }
      await new Promise(r => setTimeout(r, 200));
    }
  }
  if (!ready) {
    showAlert(box, 'This reset link is invalid or has expired. Request a new one from the sign-in page.');
    $('#backBtn').hidden = false; return;
  }

  $('#resetForm').addEventListener('submit', async (e) => {
    e.preventDefault(); hideAlert(box);
    const a = $('#newPw').value, b = $('#newPw2').value;
    const bad = Logic.passwordProblem(a);
    if (bad) return showAlert(box, bad);
    if (a !== b) return showAlert(box, 'Passwords do not match.');
    const btn = $('#resetBtn'); setBusy(btn, true, 'Updating');
    try { await API.setPassword(a); await API.signOut(); location.replace(APP_CONFIG.PATHS.login + '?reason=reset'); }
    catch (err) { showAlert(box, err.message); setBusy(btn, false); }
  });
})();
