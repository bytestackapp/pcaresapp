/* Runs in <head> before first paint: applies light/dark theme and override mode. */
(function () {
  var root = document.documentElement;
  function resolve() {
    var t = 'system';
    try { t = localStorage.getItem('ls_theme') || 'system'; } catch (e) {}
    var dark = t === 'dark' || (t === 'system' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
  }
  resolve();
  if (window.matchMedia) {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(resolve);
  }
  window.__applyTheme = resolve;
  try {
    var o = JSON.parse(sessionStorage.getItem('ls_override') || 'null');
    if (o && o.on) root.classList.add('override');
  } catch (e) {}
})();
