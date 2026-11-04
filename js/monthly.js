/* Monthly Log Sheet: one card per month with a summary. Activate shows that month in the Log Sheet page. */
(async function () {
  const ctx = await Shell.init();
  const L = Logic, C = APP_CONFIG, { $, $$, esc, icon } = UI;
  const root = $('#page');
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const cur = L.currentMonth(), curYear = +cur.slice(0, 4);
  let year = +L.activeMonth().slice(0, 4), minYear = curYear, byMonth = new Map(), error = '';

  async function load() {
    try {
      const all = await API.entries.all();
      byMonth = new Map(); minYear = curYear;
      all.forEach(e => {
        const ym = String(e.entry_date || '').slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(ym)) return;
        if (!byMonth.has(ym)) byMonth.set(ym, []);
        byMonth.get(ym).push(e);
        minYear = Math.min(minYear, +ym.slice(0, 4));
      });
      error = '';
    } catch (e) { error = e.message; }
    draw();
  }

  function draw() {
    if (error) {
      root.innerHTML = `<div class="card"><div class="empty">${icon('alert')}<h4>Your data could not be opened</h4><p>${esc(error)}</p><button class="btn btn-primary" id="retryBtn">Try again</button></div></div>`;
      $('#retryBtn').addEventListener('click', load); return;
    }
    const act = L.activeMonth();
    const last = year === curYear ? +cur.slice(5, 7) : 12;
    const cards = [];
    for (let m = 1; m <= last; m++) {
      const ym = year + '-' + String(m).padStart(2, '0');
      const list = byMonth.get(ym) || [];
      const s = L.computeSummary(list);
      const pcf1 = list.filter(e => e.pcf1_reason && e.member_category !== 'NM').length;
      const isAct = ym === act;
      const status = [];
      if (ym === cur) status.push('<span>Current month</span>');
      if (isAct) status.push('<span class="is-showing">Showing in Log Sheet</span>');
      cards.push(`<section class="card month-card${isAct ? ' is-active' : ''}${list.length ? '' : ' is-empty'}">
        <div class="month-head"><h3>${MONTHS[m - 1]}</h3><span class="month-status">${status.join(' · ')}</span></div>
        <div class="month-stats">${[['Total entries', s.total], ['Inpatient', s.totals.inpatient], ['Outpatient', s.totals.outpatient], ['Walk-in', s.walkIn], ['PPFF', s.ppff], ['PCF1 issued', pcf1]].map(([l, v]) => `<div><b class="${v ? '' : 'z'}">${v}</b><span>${l}</span></div>`).join('')}</div>
        <div class="month-actions">
          ${isAct
            ? `<a class="btn btn-primary btn-sm btn-block" href="${C.PATHS.logsheet}">Open Log Sheet</a>`
            : `<button class="btn btn-ghost btn-sm btn-block" data-activate="${ym}">Activate</button>`}
          <button class="btn btn-ghost btn-sm" data-report="${ym}">${icon('file', 16)}<span>Report</span></button>
        </div>
      </section>`);
    }
    root.innerHTML = `
      <div class="page-head"><p class="lede">Choose a month and click Activate to show it in the Log Sheet. Nothing is deleted. All months stay saved on this laptop.</p></div>
      <div class="year-nav">
        <button class="icon-btn" id="yPrev" aria-label="Previous year" ${year <= minYear ? 'disabled' : ''}>${icon('chevronLeft')}</button>
        <strong>${year}</strong>
        <button class="icon-btn" id="yNext" aria-label="Next year" ${year >= curYear ? 'disabled' : ''}>${icon('chevronRight')}</button>
      </div>
      <div class="month-grid">${cards.join('')}</div>`;
    $('#yPrev').addEventListener('click', () => { if (year > minYear) { year--; draw(); } });
    $('#yNext').addEventListener('click', () => { if (year < curYear) { year++; draw(); } });
    $$('[data-report]', root).forEach(b => b.addEventListener('click', () => Reports.openList(b.dataset.report, ctx)));
    $$('[data-activate]', root).forEach(b => b.addEventListener('click', () => {
      L.setActiveMonth(b.dataset.activate);
      UI.toast(L.monthLabel(b.dataset.activate) + ' is now showing in the Log Sheet.', 'success');
      draw();
    }));
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  await load();
})();