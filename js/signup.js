(function () {
  const C = APP_CONFIG, { $, icon, setBusy, showAlert, hideAlert } = UI;
  $('#doneIcon').innerHTML = icon('check');
  UI.bindPasswordToggles(document);
  const alertBox = $('#signupAlert');
  if (!API.configured) showAlert(alertBox, 'This app is not connected to Supabase yet. Add your project URL and anon key in js/config.js.', 'warn');

  const unameRe = /^[a-z0-9._]{3,24}$/;
  const strength = (p) => {
    let s = 0; if (p.length >= 8) s++; if (p.length >= 12) s++; if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^A-Za-z0-9]/.test(p)) s++;
    return Math.min(s, 4);
  };
  $('#suPassword').addEventListener('input', (e) => {
    const s = strength(e.target.value), bar = $('#pwBar');
    bar.style.width = (s * 25) + '%'; bar.style.background = ['var(--danger)', 'var(--danger)', '#D9A400', 'var(--brand)', 'var(--primary)'][s];
  });

  function mark(id, bad) { $('#' + id).classList.toggle('is-invalid', !!bad); }

  // live username availability
  const checkName = UI.debounce(async () => {
    const v = $('#suUsername').value.trim().toLowerCase(), help = $('#unameHelp');
    if (!v) { help.textContent = '3–24 characters: letters, numbers, dot or underscore.'; return; }
    if (!unameRe.test(v)) { help.textContent = 'Use 3–24 letters, numbers, dots or underscores.'; help.style.color = 'var(--danger)'; return; }
    try {
      const free = await API.usernameAvailable(v);
      help.textContent = free ? 'Username is available.' : 'That username is taken.';
      help.style.color = free ? 'var(--primary)' : 'var(--danger)';
    } catch (e) { help.textContent = ''; }
  }, 400);
  $('#suUsername').addEventListener('input', checkName);

  $('#signupForm').addEventListener('submit', async (e) => {
    e.preventDefault(); hideAlert(alertBox);
    const v = {
      full_name: $('#fullName').value.trim(), username: $('#suUsername').value.trim().toLowerCase(), email: $('#suEmail').value.trim(),
      position: $('#position').value.trim(), contact_no: $('#contactNo').value.trim(), password: $('#suPassword').value, confirm: $('#suConfirm').value
    };
    ['fullName', 'suUsername', 'suEmail', 'suPassword', 'suConfirm'].forEach(id => mark(id, false));
    let err = null;
    if (!v.full_name) { mark('fullName', 1); err = 'Enter your full name.'; }
    else if (!unameRe.test(v.username)) { mark('suUsername', 1); err = 'Username must be 3–24 letters, numbers, dots or underscores.'; }
    else if (!/^\S+@\S+\.\S+$/.test(v.email)) { mark('suEmail', 1); err = 'Enter a valid email address.'; }
    else if (v.password.length < 8) { mark('suPassword', 1); err = 'Password must be at least 8 characters.'; }
    else if (v.password !== v.confirm) { mark('suConfirm', 1); err = 'Passwords do not match.'; }
    if (err) { showAlert(alertBox, err); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }

    const btn = $('#signupBtn'); setBusy(btn, true, 'Submitting');
    try {
      if (!(await API.usernameAvailable(v.username))) { mark('suUsername', 1); throw new Error('That username is already taken.'); }
      await API.signUp({ ...v, hospital_id: null });
      await API.signOut();   // never keep a session for an unapproved account
      $('#panelForm').hidden = true; $('#panelDone').hidden = false;
    } catch (ex) { showAlert(alertBox, ex.message); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    finally { setBusy(btn, false); }
  });
})();
