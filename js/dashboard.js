(async function () {
  const ctx = await Shell.init();
  const { profile, hospital, settings } = ctx, L = Logic, C = APP_CONFIG, { $, esc, icon } = UI;
  const root = $('#page');
  const today = L.todayStr();
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: C.TIMEZONE, hour: 'numeric', hour12: false }).format(new Date()));
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = (profile.full_name || '').split(' ')[0];

  root.innerHTML = `
    <div id="notes"></div>
    <section class="card hero">
      <div><h2>${greet}, ${esc(first)}</h2><p>${esc(L.fmtDate(today, 'wlong'))} · ${esc(hospital ? hospital.name : '')}</p></div>
      <div class="hero-count"><b id="heroCount">–</b><span>entries on today’s sheet</span></div>
      <div class="hero-actions">
        <a class="btn btn-primary" href="${C.PATHS.logsheet}?new=1">${icon('plus', 18)}<span>Add entry</span></a>
        <a class="btn btn-ghost" href="${C.PATHS.logsheet}">${icon('clipboard', 18)}<span>Open log sheet</span></a>
        <a class="btn btn-ghost" href="${C.PATHS.logsheet}?export=1">${icon('download', 18)}<span>Export PDF</span></a>
      </div>
    </section>
    <div class="stat-strip" id="stats" style="margin-top:1rem"></div>
    <div class="grid grid-main" style="margin-top:1rem">
      <section class="card"><div class="card-head"><h3>Last 7 days</h3><span class="muted small">Entries per day</span></div><div class="card-body" id="week"><div class="skeleton" style="height:170px"></div></div></section>
      <section class="card"><div class="card-head"><h3>Today by member category</h3></div><div class="card-body" id="cats"><div class="skeleton" style="height:170px"></div></div></section>
    </div>
  `;

  const notes = [];
  if (settings.announcement) notes.push(`<div class="alert alert-info">${icon('info', 18)}<span>${esc(settings.announcement)}</span></div>`);
  if (Override.isOn()) notes.push(`<div class="alert alert-warn">${icon('zap', 18)}<span>Override mode is on for ${esc(L.fmtDate(Override.get().date, 'long'))}. Turn it off from the banner above when you are done.</span></div>`);
  $('#notes').innerHTML = notes.join('');

  let rows = [];
  try { rows = await API.entries.range(hospital.id, L.addDays(today, -6), today); }
  catch (e) { UI.toast(e.message, 'error', 5000); }

  const todays = rows.filter(r => r.entry_date === today), s = L.computeSummary(todays);
  $('#heroCount').textContent = todays.length;
  const pcf1 = todays.filter(e => e.pcf1_reason).length;
  $('#stats').innerHTML = [['Inpatient', s.totals.inpatient, 'blue'], ['Outpatient', s.totals.outpatient, 'teal'], ['Walk-in', s.walkIn, 'accent'], ['PPFF', s.ppff, 'accent'], ['PCF1 issued', pcf1, '']]
    .map(([l, v, c]) => `<div class="stat ${c}"><b>${v}</b><span>${l}</span></div>`).join('');

  // 7-day columns
  const days = Array.from({ length: 7 }, (_, i) => L.addDays(today, i - 6));
  const counts = days.map(d => rows.filter(r => r.entry_date === d).length), max = Math.max(1, ...counts);
  $('#week').innerHTML = `<div class="cols" role="img" aria-label="Entries per day for the last 7 days">${days.map((d, i) =>
    `<div class="col ${d === today ? 'today' : ''}"><b>${counts[i]}</b><div class="col-bar" style="height:${Math.max(3, counts[i] / max * 100)}%"></div><span>${d === today ? 'Today' : L.fmtDate(d, 'day')}</span></div>`).join('')}</div>`;

  // categories today
  const cc = Object.fromEntries(L.CAT_CODES.map(c => [c, todays.filter(e => e.member_category === c).length]));
  const cmax = Math.max(1, ...Object.values(cc));
  $('#cats').innerHTML = todays.length ? `<div class="hbars">${L.CAT_CODES.filter(c => cc[c]).map(c =>
    `<div class="hbar"><b title="${esc(L.catByCode(c).label)}">${esc(c)}</b><div class="hbar-track"><div class="hbar-fill" style="width:${cc[c] / cmax * 100}%"></div></div><em>${cc[c]}</em></div>`).join('')}</div>`
    : `<div class="empty-mini">${icon('clipboard', 22)}<p>No entries yet today.</p></div>`;
})();
