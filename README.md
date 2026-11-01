# LogSheet

Plain HTML/CSS/JS app (no build step) for the daily P-CARES log and report. Supabase handles login and data; Vercel hosts it. One codebase serves web and mobile.

```
index.html          splash screen (routes to login or dashboard)
favicon.svg / .ico
manifest.json       lets phones "Add to Home Screen"
css/global.css      ALL appearance: colors, fonts, spacing, override-mode look
image/logo.png      placeholder, replace with your logo (square, 512×512 PNG works best)
js/                 all JavaScript
public/             all other HTML pages
supabase/schema.sql database, security rules, triggers
vercel.json
```

## Setup (about 15 minutes)

1. **Supabase**: create a project. Open *SQL Editor*, paste `supabase/schema.sql`, run it.
2. **Supabase → Authentication → Providers → Email**: turn **off** "Confirm email". Admin approval replaces it.
3. **Supabase → Authentication → URL Configuration**: set Site URL to your Vercel URL and add `https://YOUR-SITE/public/reset-password.html` to Redirect URLs (needed for "Forgot password").
4. Copy *Project URL* and *anon public key* (Settings → API) into `js/config.js`.
5. Put your logo at `image/logo.png`.
6. **Deploy**: push to GitHub, import in Vercel (Framework: Other). If you see only a blank page or 404s, open Project Settings → Build & Output → set **Output Directory** to `.` (Vercel treats a folder named `public` specially).
7. **First admin**: sign up in the app, then run in the SQL Editor:
   `update public.profiles set role = 'admin', status = 'approved' where username = 'your_username';`
8. Sign in → Admin → Hospitals: rename or delete the three sample hospitals and add yours.

Local preview: `python3 -m http.server 8000` in this folder, then open http://localhost:8000.

## How the log sheet works

- One shared sheet per hospital per day. Everyone on the same hospital sees and edits the same rows.
- **Sheet 1** and **Sheet 2** are two views of the same entries, matching the two PDF forms. Add an entry once; it lands on both.
- Only today's sheet can be changed. Other dates are read-only.
- **Override mode** (red banner, red tint, red frame) lets a user pick a past date and add, edit or delete entries for it. It stays on across pages, turns off by itself after 30 idle minutes (Admin → Settings), and logging out warns about it. Override entries get an `OVR` tag, notify admins, and appear in Admin → Audit log.
- The database enforces this too: past-date writes need `is_override` and the user's override permission (Admin → Users).

## Calculation rules (confirm with your team)

- Daily summary and Outpatient counts use the *Service* chosen on each entry.
- *Membership status* counts every entry with a category other than Non-Member, by Active/Inactive.
- *PCF1 issuance* counts entries where "PCF1 issued because of" is set. Non-Members are not counted, as on the form.
- *Walk-in* and *PPFF* are independent ticks, counted across all entries.
- Control no. is `year-month-series`; the series is suggested as the next number for that month and can be edited.

## Known limits

- The Signature column is left blank in the PDF for signing on paper.
- Login looks up the email behind a username through a small database function, so someone who guesses a username can learn that account's email. Acceptable for a staff tool; move login to an Edge Function if that matters to you.
- To publish as an Android app later, wrap this site with Capacitor or a Trusted Web Activity. No rewrite needed.
