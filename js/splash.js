/* Splash screen: shows for a few seconds, then goes to the dashboard (valid session) or login. */
(async function () {
  const C = window.APP_CONFIG;
  const FADE_MS = 400;
  const start = Date.now();
  const overlay = document.getElementById('splashOverlay');

  overlay.style.setProperty('--splash-ms', C.SPLASH_MS + 'ms');
  overlay.classList.add('run');

  document.title = C.APP_NAME;
  document.getElementById('splashLogo').src = C.LOGO;
  document.getElementById('splashVersion').textContent = 'Version ' + (C.APP_VERSION || '1.0.0');
  document.getElementById('splashYear').textContent = new Date().getFullYear();

  let target = C.PATHS.login;
  try {
    if (API.configured) {
      const s = await API.session();
      if (s) {
        const p = await API.profile(s.user.id);
        if (p && p.status === 'approved') target = C.PATHS.dashboard;
      }
    }
  } catch (e) { /* fall through to login */ }

  const wait = Math.max(0, C.SPLASH_MS - (Date.now() - start));
  setTimeout(() => {
    overlay.classList.add('hide');
    setTimeout(() => location.replace(target), FADE_MS);
  }, wait);
})();