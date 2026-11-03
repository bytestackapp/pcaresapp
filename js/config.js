/* ============================================================================
   App configuration — the only file you must edit before deploying.
   The anon key is safe to expose in the browser; Row Level Security protects data.
   ============================================================================ */
window.APP_CONFIG = {
  SUPABASE_URL: 'https://mnpjovykfddmgulfmbcu.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ucGpvdnlrZmRkbWd1bGZtYmN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzNTkzNjksImV4cCI6MjEwODkzNTM2OX0.MXGvKJvYebQ3z3uRX14Lg61HTl7o1IZ3oEFsn1WDXRI',

  APP_NAME: 'PCaresApp',
  APP_TAGLINE: 'Daily log and summary report',
  LOGO: '/image/logo.png',
  LOGO_ONLY: '/image/logo-only.png',
  LOGO_CARES: '/image/phcares-logo.png',

  TIMEZONE: 'Asia/Manila',
  ROWS_PER_PAGE: 15,          // rows per printed sheet (matches the paper form)
  SPLASH_MS: 5000,            // minimum time the splash screen stays visible
  APP_VERSION: '1.0.0',
  OVERRIDE_TIMEOUT_MIN: 30,   // default; admins can change it in Admin → Settings

  PATHS: {
    login:     '/public/login.html',
    signup:    '/public/signup.html',
    reset:     '/public/reset-password.html',
    dashboard: '/public/dashboard.html',
    logsheet:  '/public/logsheet.html',
    profile:   '/public/profile.html',
    help:      '/public/help.html',
    admin:     '/public/admin.html'
  }
};
