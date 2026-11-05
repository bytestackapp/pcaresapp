(async function () {
  const { $, showAlert, hideAlert, setBusy } = UI;
  UI.bindPasswordToggles(document);
  const box = $('#resetAlert');

  // supabase-js turns the recovery link into a temporary session
  await new Promise(r => setTimeout(r, 400));
  const s = await API.session();
  if (!s) {
    showAlert(box, 'This reset link is invalid or has expired. Request a new one from the sign-in page.');
    $('#backBtn').hidden = false; return;
  }
  $('#resetForm').hidden = false;

  $('#resetForm').addEventListener('submit', async (e) => {
    e.preventDefault(); hideAlert(box);
    const a = $('#newPw').value, b = $('#newPw2').value;
    if (a.length < 8) return showAlert(box, 'Password must be at least 8 characters.');
    if (a !== b) return showAlert(box, 'Passwords do not match.');
    const btn = $('#resetBtn'); setBusy(btn, true, 'Updating');
    try { await API.setPassword(a); await API.signOut(); location.replace(APP_CONFIG.PATHS.login + '?reason=reset'); }
    catch (err) { showAlert(box, err.message); setBusy(btn, false); }
  });
})();
