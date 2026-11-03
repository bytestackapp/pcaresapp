# PCaresApp

Desktop web app (Google Chrome or Microsoft Edge on a laptop or desktop) for the daily P-CARES log and report. Supabase handles login and accounts; Vercel hosts the site. Patient entries are saved only as files on the user's laptop, in C:\Temp\PCares.

## Files
index.html          splash screen (routes to login or dashboard)
css/global.css      all appearance
image/              logos (logo.png, logo-only.png, phcares-logo.png, bytestack.png)
fonts/              arialn.ttf, arialnb.ttf (used by the PDF; without them it falls back to Helvetica)
js/                 all JavaScript
public/             all other HTML pages
supabase/schema.sql database, security rules, triggers
vercel.json

## Setup
1. Supabase: create a project, run supabase/schema.sql in the SQL Editor.
2. Authentication > Providers > Email: turn OFF "Confirm email" (admin approval replaces it).
3. Authentication > URL Configuration: set Site URL to your Vercel URL and add https://YOUR-SITE/public/reset-password.html to Redirect URLs.
4. Put the Project URL and anon key in js/config.js.
5. Deploy: push to GitHub, import in Vercel (Framework: Other, Output Directory: .).
6. First admin: sign up in the app, then run in the SQL Editor:
   update public.profiles set role = 'admin', status = 'approved' where username = 'your_username';
7. Admin > Hospitals: add your hospitals.

Local preview: run PCaresApp.bat, or python3 -m http.server 8000 in this folder.

## How it works
- Every entry is saved on the laptop (C:\Temp\PCares\data). A backup is made automatically once a day (Profile > Your data).
- Log Sheet shows every entry with filters. Export PDF prints Sheet 1 and Sheet 2 for the entries currently shown.
- Each print-out has a control number (year-month-series). After the PDF downloads, the user confirms the print-out is okay; the control number is then saved on those entries. Printing entries that already have a control number shows a warning.

## Calculation rules
- Daily summary and Outpatient counts use the Service chosen on each entry.
- Membership status counts every entry with a category other than Non-Member, by Active/Inactive.
- PCF1 issuance counts entries where "PCF1 issued because of" is set. Non-Members are not counted.
- Walk-in and PPFF are independent ticks, counted across all entries.

## Known limits
- Signature column is left blank in the PDF only when the entry has no signature.
- Login looks up the email behind a username through a database function, so a guessed username reveals that account's email.