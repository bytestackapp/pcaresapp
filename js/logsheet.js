/* Log sheet page: the full list of every patient entered on this laptop, with filters.
   Entries are rows; Sheet 1 / Sheet 2 are two views of the same rows, like the paper forms. */
(async function () {
  const ctx = await Shell.init();
  const { profile, hospital } = ctx;
  const C = APP_CONFIG, L = Logic, { $, $$, esc, icon, setBusy } = UI;
  const today = () => L.todayStr();
  const PAGE = 50;
  const state = { tab: 's1', all: [], view: [], page: 1, search: '', loading: true, error: '', filter: { type: 'none', hospital: '', from: '', to: '' } };
  const sigCache = new Map();
  let sheetKey = null, sheetRow = null;

  /* ============================== page skeleton ============================== */
  const root = $('#page');
  root.innerHTML = `
    <div class="page-head">
      <p class="lede">Every patient you have entered · saved on this laptop</p>
      <div class="head-actions">
        <button class="btn btn-ghost" id="pdfBtn">${icon('download', 18)}<span>Export PDF</span></button>
        <button class="btn btn-primary" id="addBtn">${icon('plus', 18)}<span>Add entry</span></button>
      </div>
    </div>
    <div class="card ls-toolbar">
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:.5rem">
        <label class="label" for="fType" style="margin:0">Filter by</label>
        <select class="input" id="fType" style="width:auto;min-width:170px">
          <option value="none">None (show all)</option>
          <option value="hospital">Hospital</option>
          <option value="date">Date</option>
          <option value="both">Hospital and date</option>
        </select>
        <select class="input" id="fHosp" style="width:auto;min-width:220px" aria-label="Hospital" hidden></select>
        <span id="fDates" style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap" hidden>
          <label class="label" for="fFrom" style="margin:0">From</label><input type="date" class="input" id="fFrom" style="width:auto">
          <label class="label" for="fTo" style="margin:0">To</label><input type="date" class="input" id="fTo" style="width:auto">
        </span>
      </div>
      <div class="seg" role="tablist" aria-label="Sheet">
        <button role="tab" data-tab="s1" class="active">Sheet 1 · Client log</button>
        <button role="tab" data-tab="s2">Sheet 2 · Daily report</button>
      </div>
      <div class="search-box">${icon('search', 18)}<input class="input" id="search" type="search" placeholder="Search names or inquiry" aria-label="Search entries"></div>
    </div>
    <div class="stat-strip" id="stats"></div>
    <div class="card" style="margin-top:1rem"><div class="table-wrap" id="tableWrap"></div><div id="pager"></div></div>
    <div class="card card-pad" style="margin-top:1rem" id="bottom"></div>`;

  /* ============================== data ============================== */
  async function load(silent) {
    if (!silent) { state.loading = true; state.error = ''; renderAll(); }
    try { state.all = (await API.entries.all()).reverse(); state.error = ''; }      // newest date first
    catch (e) { state.error = e.message; if (!silent) state.all = []; UI.toast(e.message, 'error', 6000); }
    state.loading = false; sheetKey = null; renderAll();
  }

  function hospitalsWithData() {
    const m = new Map();
    state.all.forEach(e => { if (!m.has(e.hospital_id)) m.set(e.hospital_id, e.hospital_name || 'Unknown hospital'); });
    return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }

  function filtered() {
    const f = state.filter, q = state.search.trim().toLowerCase();
    const byH = (f.type === 'hospital' || f.type === 'both') && f.hospital;
    const byD = f.type === 'date' || f.type === 'both';
    return state.all.filter(e => {
      if (byH && e.hospital_id !== f.hospital) return false;
      if (byD) { if (f.from && e.entry_date < f.from) return false; if (f.to && e.entry_date > f.to) return false; }
      if (q && ![e.client_name, e.member_name, e.patient_name, e.nature_of_inquiry, e.remarks, e.contact_no, e.hospital_name].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function groupsOf(list) {
    const m = new Map();
    list.forEach(e => {
      const k = e.hospital_id + '|' + e.entry_date;
      if (!m.has(k)) m.set(k, { key: k, hospital_id: e.hospital_id, hospital: e.hospital_name || '', date: e.entry_date, entries: [] });
      m.get(k).entries.push(e);
    });
    return [...m.values()];
  }

  const sheetDefaults = async (g) => ({ pcare_name: profile.full_name, control_no: g.date.slice(0, 7) + '-' + await API.sheets.nextSeries(g.hospital_id, g.date), opd_class_count: null, opd_class_clients: null });

  async function saveMeta(g, fields) {
    try {
      const base = sheetRow || await sheetDefaults(g);
      sheetRow = await API.sheets.upsert({
        hospital_id: g.hospital_id, sheet_date: g.date, pcare_name: base.pcare_name, control_no: base.control_no,
        opd_class_count: base.opd_class_count, opd_class_clients: base.opd_class_clients, ...fields
      });
      const f = $('#savedFlag'); if (f) { f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 1600); }
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  /* ============================== rendering ============================== */
  function renderAll() {
    renderFilter();
    state.view = state.loading ? [] : filtered();
    const pages = Math.max(1, Math.ceil(state.view.length / PAGE)); if (state.page > pages) state.page = pages;
    $('#addBtn').disabled = state.loading || !!state.error;
    $('#pdfBtn').disabled = state.loading || !!state.error;
    renderStats(); renderTable(); renderPager(); renderBottom();
  }

  function renderFilter() {
    const f = state.filter, hs = hospitalsWithData();
    if (f.hospital && !hs.some(h => h.id === f.hospital)) f.hospital = '';
    $('#fType').value = f.type;
    const showH = f.type === 'hospital' || f.type === 'both', showD = f.type === 'date' || f.type === 'both';
    const sel = $('#fHosp'); sel.hidden = !showH;
    sel.innerHTML = '<option value="">Select a hospital</option>' + hs.map(h => `<option value="${esc(h.id)}" ${h.id === f.hospital ? 'selected' : ''}>${esc(h.name)}</option>`).join('');
    $('#fDates').hidden = !showD;
    $('#fFrom').value = f.from; $('#fTo').value = f.to;
  }

  function renderStats() {
    const s = L.computeSummary(state.view);
    const items = [['Entries', s.total, 'accent'], ['Inpatient', s.totals.inpatient, 'blue'], ['Outpatient', s.totals.outpatient, 'teal'], ['Walk-in', s.walkIn, ''], ['PPFF', s.ppff, '']];
    $('#stats').innerHTML = items.map(([l, v, c]) => `<div class="stat ${c}"><b>${state.loading ? '–' : v}</b><span>${l}</span></div>`).join('');
  }

  const dash = '<span class="dash">—</span>';
  const td = (label, html, cls = '', raw) => `<td data-label="${label}" class="${cls}${(raw === '' || raw == null) && cls !== 'actions' && cls !== 'no' ? ' is-empty' : ''}">${html || dash}</td>`;
  const catBadge = (c) => `<span class="badge ${c === 'NM' ? '' : 'badge-green'}" title="${esc((L.catByCode(c) || {}).label || '')}">${esc(c)}</span>`;
  const svcBadge = (k) => ({ at_post: '<span class="badge badge-blue">At Post</span>', ward_class: '<span class="badge badge-teal">Ward Class</span>', outpatient: '<span class="badge badge-green">Outpatient</span>', none: '<span class="badge">Inquiry only</span>' }[k] || '');
  const tick = `<span class="tick">${icon('check', 18)}</span>`;
  const filterActive = () => state.filter.type !== 'none' || state.search.trim();

  function actionsCell(e, no) {
    return `<td class="actions"><button class="icon-btn" data-act="edit" data-id="${e.id}" aria-label="Edit entry ${no}" title="Edit">${icon('edit', 18)}</button><button class="icon-btn danger" data-act="del" data-id="${e.id}" aria-label="Delete entry ${no}" title="Delete">${icon('trash', 18)}</button></td>`;
  }
  const noCell = (no) => `<td class="no" data-label="No.">${no}</td>`;
  const dateCell = (e) => td('Date entered', esc(L.fmtDate(e.entry_date)), 'nowrap', e.entry_date);
  const hospCell = (e) => td('Hospital', esc(e.hospital_name), '', e.hospital_name);

  function renderTable() {
    const wrap = $('#tableWrap');
    if (state.loading) { wrap.innerHTML = '<div style="padding:1.25rem;display:grid;gap:.7rem">' + [1, 2, 3, 4].map(() => '<div class="skeleton" style="height:38px"></div>').join('') + '</div>'; return; }
    if (state.error) {
      wrap.innerHTML = `<div class="empty">${icon('alert')}<h4>Your data could not be opened</h4><p>${esc(state.error)}</p><button class="btn btn-primary" id="retryBtn">Try again</button></div>`;
      $('#retryBtn').addEventListener('click', () => load()); return;
    }
    if (!state.all.length) {
      wrap.innerHTML = `<div class="empty">${icon('clipboard')}<h4>No entries yet</h4><p>Add the first client. Totals and the summary fill in as you go.</p>
        <button class="btn btn-primary" id="emptyAdd">${icon('plus', 18)}<span>Add entry</span></button></div>`;
      $('#emptyAdd').addEventListener('click', () => openEntryModal()); return;
    }
    if (!state.view.length) {
      wrap.innerHTML = `<div class="empty">${icon('search')}<h4>No matches</h4><p>No entry matches your filter or search.</p>${filterActive() ? '<button class="btn btn-ghost" id="clearFilter">Clear filter and search</button>' : ''}</div>`;
      const b = $('#clearFilter'); if (b) b.addEventListener('click', () => { state.filter = { type: 'none', hospital: '', from: '', to: '' }; state.search = ''; $('#search').value = ''; state.page = 1; renderAll(); });
      return;
    }
    const start = (state.page - 1) * PAGE;
    const rows = state.view.slice(start, start + PAGE).map((e, i) => ({ e, no: state.view.length - (start + i) }));
    if (state.tab === 's1') {
      wrap.innerHTML = `<table class="tbl stack ls-table"><thead><tr><th>No.</th><th>Date entered</th><th>Hospital</th><th>Name of client</th><th>Name of PhilHealth member</th><th>Name of patient</th><th>Contact</th><th>Signature</th><th>Patient is</th><th>Admission date</th><th>PCF1</th><th></th></tr></thead><tbody>${rows.map(({ e, no }) => `<tr>
        ${noCell(no)}${dateCell(e)}${hospCell(e)}
        ${td('Client', esc(e.client_name), 'name', e.client_name)}
        ${td('PhilHealth member', esc(e.member_name), '', e.member_name)}
        ${td('Patient', esc(e.patient_name), '', e.patient_name)}
        ${td('Contact', esc(e.contact_no), 'nowrap', e.contact_no)}
        ${td('Signature', e.has_signature ? `<span data-sig="${e.id}" class="muted small">…</span>` : '', '', e.has_signature ? 'y' : '')}
        ${td('Patient is', e.patient_is === 'member' ? '<span class="badge">Member</span>' : e.patient_is === 'dependent' ? '<span class="badge">Dependent</span>' : '', '', e.patient_is)}
        ${td('Admission date', e.admission_date ? esc(L.fmtDate(e.admission_date)) : '', 'nowrap', e.admission_date)}
        ${td('PCF1 reason', e.pcf1_reason ? `<span class="badge badge-amber">${esc((L.PCF1_REASONS.find(r => r.key === e.pcf1_reason) || {}).label || '')}</span>` : '', '', e.pcf1_reason)}
        ${actionsCell(e, no)}</tr>`).join('')}</tbody></table>`;
      loadSigs();
    } else {
      wrap.innerHTML = `<table class="tbl stack ls-table"><thead><tr><th>No.</th><th>Date entered</th><th>Hospital</th><th>Name of client</th><th>Category</th><th>Status</th><th>Nature of inquiry</th><th>Service</th><th>Walk-in</th><th>PPFF</th><th>Remarks</th><th></th></tr></thead><tbody>${rows.map(({ e, no }) => `<tr>
        ${noCell(no)}${dateCell(e)}${hospCell(e)}
        ${td('Client', esc(e.client_name), 'name', e.client_name)}
        ${td('Category', catBadge(e.member_category), '', e.member_category)}
        ${td('Status', e.status === 'active' ? '<span class="badge badge-green">Active</span>' : e.status === 'inactive' ? '<span class="badge badge-amber">Inactive</span>' : '', '', e.status)}
        ${td('Nature of inquiry', esc(e.nature_of_inquiry), '', e.nature_of_inquiry)}
        ${td('Service', svcBadge(e.service), '', e.service)}
        ${td('Walk-in', e.walk_in ? tick : '', '', e.walk_in ? 'y' : '')}
        ${td('PPFF', e.ppff ? tick : '', '', e.ppff ? 'y' : '')}
        ${td('Remarks', esc(e.remarks), '', e.remarks)}
        ${actionsCell(e, no)}</tr>`).join('')}</tbody></table>`;
    }
  }

  function loadSigs() {          // signatures are separate files, so only the rows on screen are read
    $$('[data-sig]').forEach(async (el) => {
      const id = el.dataset.sig;
      try {
        let u = sigCache.get(id);
        if (!u) { u = await API.entries.signature(id); if (u) sigCache.set(id, u); }
        if (el.isConnected) el.innerHTML = u ? `<img class="sig-thumb" src="${u}" alt="Client signature">` : '';
      } catch (e) {}
    });
  }

  function renderPager() {
    const box = $('#pager'), n = state.view.length, pages = Math.max(1, Math.ceil(n / PAGE));
    if (state.loading || state.error || n <= PAGE) { box.innerHTML = ''; return; }
    const a = (state.page - 1) * PAGE + 1, b = Math.min(n, state.page * PAGE);
    box.innerHTML = `<div class="row" style="justify-content:space-between;padding:.75rem 1rem;border-top:1px solid var(--border)">
      <span class="muted small">Showing ${a}–${b} of ${n}</span>
      <span class="row"><button class="btn btn-ghost btn-sm" id="pgPrev" ${state.page <= 1 ? 'disabled' : ''}>Previous</button><span class="muted small">Page ${state.page} of ${pages}</span><button class="btn btn-ghost btn-sm" id="pgNext" ${state.page >= pages ? 'disabled' : ''}>Next</button></span></div>`;
    $('#pgPrev').addEventListener('click', () => { state.page--; renderTable(); renderPager(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    $('#pgNext').addEventListener('click', () => { state.page++; renderTable(); renderPager(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }

  /* ---- summaries (the part that used to be calculated by hand) ---- */
  const cell = (n) => `<td class="${n ? '' : 'zero'}">${n}</td>`;
  const catHead = (codes) => codes.map(c => `<th title="${esc((L.catByCode(c) || {}).label || '')}">${c}</th>`).join('');

  function summaryHTML(s) {
    const codes = L.CAT_CODES, mem = L.MEMBER_CODES;
    const rowCells = (obj, cs, total) => cs.map(c => cell(obj[c])).join('') + `<td class="rowtotal">${total}</td>`;
    return `
      <div class="sum-block"><h4>Daily summary of patients served</h4><div class="table-wrap"><table class="sum-table">
        <thead><tr><th colspan="2" class="rowhead">Member category</th>${catHead(codes)}<th>Total</th></tr></thead>
        <tbody>
          <tr><th rowspan="2" class="rowhead">Inpatient</th><th class="rowhead">At Post</th>${rowCells(s.atPost, codes, s.totals.atPost)}</tr>
          <tr><th class="rowhead">Ward Class</th>${rowCells(s.ward, codes, s.totals.ward)}</tr>
          <tr class="total"><th colspan="2" class="rowhead">Total inpatient</th>${rowCells(s.inpatient, codes, s.totals.inpatient)}</tr>
          <tr><th colspan="2" class="rowhead">Outpatient</th>${rowCells(s.outpatient, codes, s.totals.outpatient)}</tr>
        </tbody></table></div></div>
      <div class="sum-block"><h4>Membership status</h4><div class="table-wrap"><table class="sum-table">
        <thead><tr><th class="rowhead"></th>${catHead(mem)}<th>Total</th></tr></thead>
        <tbody>
          <tr><th class="rowhead">Active</th>${rowCells(s.active, mem, s.totals.active)}</tr>
          <tr><th class="rowhead">Inactive</th>${rowCells(s.inactive, mem, s.totals.inactive)}</tr>
          <tr class="total"><th class="rowhead">Total</th>${rowCells(s.statusTotal, mem, s.totals.status)}</tr>
        </tbody></table></div></div>`;
  }

  function pcf1HTML(s) {
    const colTotal = (code) => L.PCF1_REASONS.reduce((a, r) => a + s.pcf1[r.key][code], 0);
    const grand = L.MEMBER_CODES.reduce((a, c) => a + colTotal(c), 0);
    return `<div class="sum-block" style="margin-top:0"><h4>PCF1 issuance</h4><div class="table-wrap"><table class="sum-table" style="min-width:560px">
      <thead><tr><th class="rowhead">Member category</th>${L.PCF1_REASONS.map(r => `<th>${esc(r.label)}</th>`).join('')}<th>Total</th></tr></thead>
      <tbody>${L.MEMBER_CODES.map(c => `<tr><th class="rowhead">${esc(L.catByCode(c).name)}</th>${L.PCF1_REASONS.map(r => cell(s.pcf1[r.key][c])).join('')}<td class="rowtotal">${colTotal(c)}</td></tr>`).join('')}
      <tr class="total"><th class="rowhead">Total</th>${L.PCF1_REASONS.map(r => `<td>${L.MEMBER_CODES.reduce((a, c) => a + s.pcf1[r.key][c], 0)}</td>`).join('')}<td>${grand}</td></tr></tbody></table></div></div>`;
  }

  function renderBottom() {
    const box = $('#bottom');
    if (state.loading) { box.innerHTML = '<div class="skeleton" style="height:160px"></div>'; return; }
    if (state.error || !state.all.length) { box.innerHTML = ''; box.hidden = true; return; }
    box.hidden = false;
    const s = L.computeSummary(state.view), groups = groupsOf(state.view), g = groups.length === 1 ? groups[0] : null;
    if (g && sheetKey !== g.key) { const key = g.key; sheetKey = key; sheetRow = null; API.sheets.get(g.hospital_id, g.date).then(r => { if (sheetKey === key) { sheetRow = r; renderBottom(); } }).catch(() => {}); }
    const sh = (g && sheetKey === g.key && sheetRow) || {};
    const hint = `<p class="help" style="margin:0 0 1rem">The totals below cover the ${state.view.length} ${state.view.length === 1 ? 'entry' : 'entries'} shown. To edit the P-CARES name, control number and OPD class details, filter to <strong>one hospital and one date</strong>.</p>`;
    if (state.tab === 's1') {
      box.innerHTML = `
        ${g ? `<div class="sheet-meta" style="margin-top:0">
          <div class="field"><label class="label" for="mPcare">Name of P-CARES</label><input class="input" id="mPcare" value="${esc(sh.pcare_name || '')}" placeholder="${esc(profile.full_name)}"></div>
          <div class="field"><label class="label">Date</label><input class="input" value="${esc(L.fmtDate(g.date, 'long'))}" disabled></div>
          <div class="field" style="align-self:end"><span class="saved-flag" id="savedFlag">Saved</span></div>
        </div>` : hint}
        <div class="sheet-grid">
          ${pcf1HTML(s)}
          <div class="sum-block" style="margin-top:0"><h4>Legend</h4><dl class="legend">${L.CATEGORIES.map(c => `<dt>${esc(c.code)}</dt><dd>${esc(c.label)}</dd>`).join('')}</dl></div>
        </div>`;
      if (g) $('#mPcare').addEventListener('change', (e) => saveMeta(g, { pcare_name: e.target.value.trim() }));
    } else {
      const [cy, cm, cs] = (sh.control_no || (g ? g.date.slice(0, 7) + '-' : '--')).split('-');
      box.innerHTML = `
        ${g ? `<div class="sheet-meta" style="margin-top:0">
          <div class="field"><label class="label">Name of health care institution</label><input class="input" value="${esc(g.hospital)}" disabled></div>
          <div class="field"><label class="label" for="cY">Control no.</label>
            <div class="ctrl-row"><input class="input" id="cY" value="${esc(cy || '')}" maxlength="4" inputmode="numeric" aria-label="Year" style="width:5.2rem">–
              <input class="input" id="cM" value="${esc(cm || '')}" maxlength="2" inputmode="numeric" aria-label="Month" style="width:3.4rem">–
              <input class="input" id="cS" value="${esc(cs || '')}" maxlength="4" inputmode="numeric" aria-label="Series no." style="width:4.6rem"></div>
            <span class="help">Year · Month · Series no.</span></div>
          <div class="field" style="align-self:end"><span class="saved-flag" id="savedFlag">Saved</span></div>
        </div>` : hint}
        <div class="sheet-grid">
          <div>${summaryHTML(s)}</div>
          <div class="sum-block" style="margin-top:1rem"><h4>Totals</h4><div class="side-metrics">
            ${g ? `<div class="metric"><label for="mOpdN">No. of times OPD class is conducted <small class="muted">(if applicable)</small></label><input class="input" id="mOpdN" type="number" min="0" inputmode="numeric" value="${sh.opd_class_count ?? ''}"></div>
            <div class="metric"><label for="mOpdC">No. of clients served during OPD class <small class="muted">(if applicable)</small></label><input class="input" id="mOpdC" type="number" min="0" inputmode="numeric" value="${sh.opd_class_clients ?? ''}"></div>` : ''}
            <div class="metric"><span>Total inpatient clients served <small class="muted">(At Post + Ward Class)</small></span><b>${s.totals.inpatient}</b></div>
            <div class="metric"><span>Total outpatient clients</span><b>${s.totals.outpatient}</b></div>
            <div class="metric"><span>Total walk-in clients</span><b>${s.walkIn}</b></div>
            <div class="metric"><span>Total PPFF administered</span><b>${s.ppff}</b></div>
          </div></div>
        </div>`;
      if (g) {
        const ctrl = () => saveMeta(g, { control_no: [$('#cY').value.trim(), $('#cM').value.trim().padStart(2, '0'), $('#cS').value.trim().padStart(3, '0')].join('-') });
        ['cY', 'cM', 'cS'].forEach(id => $('#' + id).addEventListener('change', ctrl));
        const num = (id) => { const v = $(id).value; return v === '' ? null : Math.max(0, parseInt(v, 10) || 0); };
        $('#mOpdN').addEventListener('change', () => saveMeta(g, { opd_class_count: num('#mOpdN') }));
        $('#mOpdC').addEventListener('change', () => saveMeta(g, { opd_class_clients: num('#mOpdC') }));
      }
    }
  }

  /* ============================== entry form ============================== */
  function formHTML(e) {
    const chk = (cond) => cond ? 'checked' : '';
    const inquiries = [...new Set(state.all.map(x => x.nature_of_inquiry).filter(Boolean))].slice(0, 100);
    return `
      <div id="entryAlert" class="alert" hidden></div>
      <form id="entryForm" novalidate autocomplete="off">
        <div class="form-section"><h4>Where and when</h4><span class="help">The hospital where you met the client, and the date of the entry</span>
          <div class="form-grid">
            <div class="field"><span class="label" id="fHospLabel">Hospital <span class="req">*</span></span>
              <button type="button" class="select-btn" id="fHosp" aria-labelledby="fHospLabel" aria-haspopup="dialog"><span class="sel-text">Select hospital</span><span id="fHospChev"></span></button></div>
            <div class="field"><label class="label" for="fDate">Date entered <span class="req">*</span></label>
              <input class="input" id="fDate" type="date" value="${esc(e.entry_date || today())}" max="${today()}"></div>
          </div>
        </div>
        <div class="form-section"><h4>Client details</h4><span class="help">Goes on Sheet 1 · P-CARES log</span>
          <div class="form-grid">
            <div class="field span-2"><label class="label" for="fClient">Name of client <span class="req">*</span></label>
              <input class="input" id="fClient" value="${esc(e.client_name || '')}" placeholder="Last name, First name" autofocus></div>
            <div class="field"><label class="label" for="fMember">Name of PhilHealth member</label>
              <input class="input" id="fMember" value="${esc(e.member_name || '')}" placeholder="Last name, First name"></div>
            <div class="field"><label class="label" for="fPatient">Name of patient</label>
              <input class="input" id="fPatient" value="${esc(e.patient_name || '')}" placeholder="Last name, First name"></div>
            <div class="field"><span class="label">Patient is</span>
              <div class="chip-group">
                <label class="chip"><input type="radio" name="pi" value="member" ${chk(e.patient_is === 'member')}><span>Member</span></label>
                <label class="chip"><input type="radio" name="pi" value="dependent" ${chk(e.patient_is === 'dependent')}><span>Dependent</span></label>
              </div></div>
            <div class="field"><label class="label" for="fContact">Contact number <span class="muted small">(optional)</span></label>
              <input class="input" id="fContact" type="tel" inputmode="tel" value="${esc(e.contact_no || '')}" placeholder="09XX XXX XXXX"></div>
            <div class="field"><label class="label" for="fAdmission">Admission date</label>
              <input class="input" id="fAdmission" type="date" value="${esc(e.admission_date || '')}"></div>
            <div class="field span-2"><span class="label">Client signature <span class="muted small">(sign inside the box)</span></span>
              <div class="sig-wrap"><canvas id="fSig" class="sig-canvas" width="600" height="200" aria-label="Signature pad"></canvas></div>
              <div class="row" style="justify-content:space-between"><span class="help">Sign with the signature pad.</span><button type="button" class="btn btn-ghost btn-sm" id="sigClear">Clear</button></div></div>
          </div>
        </div>
        <div class="form-section"><h4>Classification</h4><span class="help">Goes on Sheet 2 · Daily report and the summary</span>
          <div class="field"><span class="label">Member category <span class="req">*</span></span>
            <div class="cat-grid" role="radiogroup" aria-label="Member category">${L.CATEGORIES.map(c =>
              `<label class="chip" title="${esc(c.label)}"><input type="radio" name="cat" value="${esc(c.code)}" ${chk(e.member_category === c.code)}><span><b>${esc(c.code)}</b><small>${esc(c.name)}</small></span></label>`).join('')}</div>
            <div class="cat-readout" id="catReadout"></div></div>
          <div class="form-grid">
            <div class="field"><span class="label">Membership status <span class="req" id="stReq">*</span></span>
              <div class="chip-group">
                <label class="chip"><input type="radio" name="st" value="active" ${chk(e.status === 'active')}><span>Active</span></label>
                <label class="chip"><input type="radio" name="st" value="inactive" ${chk(e.status === 'inactive')}><span>Inactive</span></label>
              </div></div>
            <div class="field"><label class="label" for="fInquiry">Nature of inquiry</label>
              <input class="input" id="fInquiry" list="inqList" value="${esc(e.nature_of_inquiry || '')}" placeholder="What did the client ask about?">
              <datalist id="inqList">${inquiries.map(i => `<option value="${esc(i)}">`).join('')}</datalist></div>
            <div class="field span-2"><span class="label">Service</span>
              <div class="chip-group">${L.SERVICES.map(sv => `<label class="chip"><input type="radio" name="svc" value="${sv.key}" ${chk((e.service || 'none') === sv.key)}><span>${esc(sv.label)}</span></label>`).join('')}</div></div>
            <div class="field"><label class="switch"><input type="checkbox" id="fWalk" ${chk(e.walk_in)}><span class="switch-ui"></span><span>Walk-in client</span></label></div>
            <div class="field"><label class="switch"><input type="checkbox" id="fPpff" ${chk(e.ppff)}><span class="switch-ui"></span><span>PPFF administered</span></label></div>
            <div class="field"><label class="label" for="fPcf1">PCF1 issued because of</label>
              <select class="input" id="fPcf1"><option value="">Not issued</option>${L.PCF1_REASONS.map(r => `<option value="${r.key}" ${e.pcf1_reason === r.key ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select></div>
            <div class="field"><label class="label" for="fRemarks">Remarks</label>
              <textarea class="input" id="fRemarks" rows="2">${esc(e.remarks || '')}</textarea></div>
          </div>
        </div>
      </form>`;
  }

  function initSignature(el, existing) {
    const cv = $('#fSig', el), g = cv.getContext('2d');
    const st = cv._st || (cv._st = { ink: false, drawing: false });
    cv._clear = () => { g.clearRect(0, 0, cv.width, cv.height); st.ink = false; };
    cv._get = () => st.ink ? cv.toDataURL('image/png') : null;
    cv._clear();
    if (existing) { const img = new Image(); img.onload = () => { g.drawImage(img, 0, 0, cv.width, cv.height); st.ink = true; }; img.src = existing; }
    if (cv._bound) return; cv._bound = true;
    g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#000';
    const pt = (ev) => { const r = cv.getBoundingClientRect(); return [(ev.clientX - r.left) * cv.width / r.width, (ev.clientY - r.top) * cv.height / r.height]; };
    cv.addEventListener('pointerdown', (ev) => { ev.preventDefault(); cv.setPointerCapture(ev.pointerId); st.drawing = true; const [x, y] = pt(ev); g.beginPath(); g.moveTo(x, y); g.lineTo(x + .01, y + .01); g.stroke(); st.ink = true; });
    cv.addEventListener('pointermove', (ev) => { if (!st.drawing) return; ev.preventDefault(); const [x, y] = pt(ev); g.lineTo(x, y); g.stroke(); g.beginPath(); g.moveTo(x, y); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => cv.addEventListener(n, () => { st.drawing = false; }));
    $('#sigClear', el).addEventListener('click', () => cv._clear());
  }

  function wireForm(h, e) {
    const el = h.el, q = (s) => $(s, el);
    if (!h._hf) {
      h._hf = UI.hospitalField(q('#fHosp'));
      q('#fHospChev').innerHTML = icon('chevronDown', 18);
      h._hf.set(e.hospital_id ? { id: e.hospital_id, name: e.hospital_name } : (hospital ? { id: hospital.id, name: hospital.name } : null));
    }
    let touchedPatient = !!e.patient_name;
    q('#fPatient').addEventListener('input', () => { touchedPatient = true; });
    const copyMember = () => { if (!touchedPatient && ($('input[name="pi"]:checked', el) || {}).value === 'member') q('#fPatient').value = q('#fMember').value; };
    q('#fMember').addEventListener('input', copyMember);
    $$('input[name="pi"]', el).forEach(r => r.addEventListener('change', copyMember));
    const syncCat = () => {
      const c = ($('input[name="cat"]:checked', el) || {}).value, nm = c === 'NM';
      q('#catReadout').textContent = c ? (L.catByCode(c).label) : '';
      $$('input[name="st"]', el).forEach(r => { r.disabled = nm; if (nm) r.checked = false; });
      q('#stReq').hidden = nm;
    };
    $$('input[name="cat"]', el).forEach(r => r.addEventListener('change', syncCat)); syncCat();
    initSignature(el, e.signature);
    if (!h._wired) { h._wired = true; q('#entryForm').addEventListener('submit', (ev) => { ev.preventDefault(); q('#entrySave').click(); }); }
  }

  function readForm(h) {
    const el = h.el, v = (id) => $(id, el).value.trim() || null, r = (n) => ($(`input[name="${n}"]:checked`, el) || {}).value || null;
    const cat = r('cat'), hosp = h._hf.get();
    return {
      hospital_id: hosp ? hosp.id : null, hospital_name: hosp ? hosp.name : null, entry_date: v('#fDate'),
      client_name: v('#fClient'), member_name: v('#fMember'), patient_name: v('#fPatient'), contact_no: v('#fContact'),
      patient_is: r('pi'), admission_date: v('#fAdmission'), member_category: cat, status: cat === 'NM' ? null : r('st'),
      nature_of_inquiry: v('#fInquiry'), service: r('svc') || 'none', walk_in: $('#fWalk', el).checked, ppff: $('#fPpff', el).checked,
      pcf1_reason: v('#fPcf1'), remarks: v('#fRemarks'), signature: $('#fSig', el)._get()
    };
  }

  function validate(p) {
    if (!p.hospital_id) return ['fHosp', 'Select the hospital.'];
    if (!p.entry_date) return ['fDate', 'Enter the date of the entry.'];
    if (p.entry_date > today()) return ['fDate', 'The date cannot be in the future.'];
    if (!p.client_name) return ['fClient', 'Enter the name of the client.'];
    if (!p.member_category) return ['', 'Choose a member category.'];
    if (p.member_category !== 'NM') {
      if (!p.member_name) return ['fMember', 'Enter the name of the PhilHealth member, or choose Non-Member.'];
      if (!p.status) return ['', 'Choose Active or Inactive for the membership status.'];
    }
    return null;
  }

  async function openEntryModal(entry) {
    let e = entry || {};
    if (entry && entry.has_signature) { try { e = { ...entry, signature: await API.entries.signature(entry.id) }; } catch (x) {} }
    const h = UI.modal({
      title: entry ? 'Edit entry' : 'Add entry', size: 'lg', persistent: false,
      body: formHTML(e),
      footer: entry
        ? [{ label: 'Cancel', className: 'btn-ghost' }, { id: 'entrySave', label: 'Save changes', className: 'btn-primary', onClick: (hh, b) => save(hh, b, entry, false) }]
        : [{ label: 'Cancel', className: 'btn-ghost' }, { id: 'entryAnother', label: 'Save and add another', className: 'btn-ghost', onClick: (hh, b) => save(hh, b, null, true) },
           { id: 'entrySave', label: 'Save entry', className: 'btn-primary', onClick: (hh, b) => save(hh, b, null, false) }]
    });
    wireForm(h, e);
  }

  async function save(h, btn, entry, another) {
    const box = $('#entryAlert', h.el); box.hidden = true;
    const p = readForm(h), bad = validate(p);
    if (bad) {
      UI.showAlert(box, bad[1]); h.body.scrollTo({ top: 0, behavior: 'smooth' });
      if (bad[0]) $('#' + bad[0], h.el).focus();
      return false;
    }
    setBusy(btn, true, 'Saving');
    try {
      if (entry) { await API.entries.update(entry.id, p); sigCache.delete(entry.id); UI.toast('Entry updated.', 'success'); }
      else { await API.entries.create({ ...p, created_by: ctx.user.id }); UI.toast('Entry saved.', 'success'); }
      await load(true);
      if (another) {
        const f = $('#entryForm', h.el); f.reset();
        $('#fClient', h.el).focus(); h.body.scrollTo({ top: 0 });
        wireForm(h, { entry_date: p.entry_date, hospital_id: p.hospital_id, hospital_name: p.hospital_name });
        $('#fDate', h.el).value = p.entry_date;
        setBusy(btn, false);
        return false;
      }
    } catch (err) { UI.showAlert(box, err.message); setBusy(btn, false); return false; }
    setBusy(btn, false);
  }

  async function delEntry(id) {
    const e = state.all.find(x => x.id === id); if (!e) return;
    const ok = await UI.confirm({
      title: 'Delete this entry?', danger: true, confirmText: 'Delete entry', iconName: 'trash',
      message: `<p><strong>${esc(e.client_name)}</strong> (${esc(L.fmtDate(e.entry_date, 'long'))}, ${esc(e.hospital_name || '')}) will be removed. This cannot be undone. Your latest backup still has it.</p>`
    });
    if (!ok) return;
    try { await API.entries.remove(id); sigCache.delete(id); await load(true); UI.toast('Entry deleted.', 'success'); }
    catch (err) { UI.toast(err.message, 'error', 5000); }
  }

  /* ============================== export ============================== */
  function openExportModal() {
    if (!state.view.length) { UI.toast('There are no entries to export.', 'error'); return; }
    const gs = groupsOf(state.view).length;
    UI.modal({
      title: 'Export PDF', size: 'sm',
      body: `<div id="expAlert" class="alert" hidden></div>
        <p>Exports the <strong>${state.view.length}</strong> ${state.view.length === 1 ? 'entry' : 'entries'} now shown in the list: <strong>${gs}</strong> ${gs === 1 ? 'sheet' : 'sheets'}, one per hospital per day. Change the filter first to export less.</p>
        <div class="field"><span class="label">Sheets</span>
          <div class="chip-group"><label class="chip"><input type="checkbox" id="expS1" checked><span>Sheet 1 · P-CARES log</span></label>
          <label class="chip"><input type="checkbox" id="expS2" checked><span>Sheet 2 · Daily report</span></label></div></div>
        <p class="help">More than ${C.ROWS_PER_PAGE} entries in one day continue on extra pages.</p>`,
      footer: [{ label: 'Cancel', className: 'btn-ghost' }, { id: 'expGo', label: 'Download PDF', className: 'btn-primary', onClick: (hh, b) => doExport(hh, b) }]
    });
  }

  async function doExport(h, btn) {
    const box = $('#expAlert', h.el); box.hidden = true;
    const s1 = $('#expS1', h.el).checked, s2 = $('#expS2', h.el).checked;
    if (!s1 && !s2) { UI.showAlert(box, 'Choose at least one sheet.'); return false; }
    if (!window.PDFLib) { UI.showAlert(box, 'The PDF library did not load. Check your internet connection and try again.'); return false; }
    setBusy(btn, true, 'Preparing');
    try {
      const gs = groupsOf(state.view).sort((a, b) => a.date.localeCompare(b.date) || a.hospital.localeCompare(b.hospital));
      const days = [];
      for (const g of gs) {
        let sheet = await API.sheets.get(g.hospital_id, g.date);
        if (!sheet) sheet = await API.sheets.upsert({ hospital_id: g.hospital_id, sheet_date: g.date, ...(await sheetDefaults(g)) });
        const list = g.entries.map(e => ({ ...e })).sort((a, b) => String(a.created_at).localeCompare(b.created_at));
        days.push({ date: g.date, hospital: g.hospital, entries: list, sheet });
      }
      const signed = days.flatMap(d => d.entries).filter(e => e.has_signature);
      for (let i = 0; i < signed.length; i += 40) {
        await Promise.all(signed.slice(i, i + 40).map(async (e) => { try { e.signature = await API.entries.signature(e.id); } catch (x) {} }));
      }
      const names = [...new Set(days.map(d => d.hospital))];
      const label = names.length === 1 ? names[0] : 'Multiple hospitals';
      const bytes = await PDFExport.generate({ days, sheets: { s1, s2 }, hospital: label, logo: C.LOGO, appName: C.APP_NAME, rowsPerPage: C.ROWS_PER_PAGE });
      const first = days[0].date, last = days[days.length - 1].date;
      const name = `Logsheet_${label.replace(/[^A-Za-z0-9]+/g, '_')}_${first === last ? first : first + '_to_' + last}.pdf`;
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      sheetKey = null; renderBottom();
      UI.toast('PDF downloaded.', 'success');
    } catch (err) { UI.showAlert(box, err.message); setBusy(btn, false); return false; }
    setBusy(btn, false);
  }

  /* ============================== events ============================== */
  const resetPage = () => { state.page = 1; renderAll(); };
  $('#fType').addEventListener('change', (e) => { state.filter.type = e.target.value; resetPage(); });
  $('#fHosp').addEventListener('change', (e) => { state.filter.hospital = e.target.value; resetPage(); });
  $('#fFrom').addEventListener('change', (e) => { state.filter.from = e.target.value; resetPage(); });
  $('#fTo').addEventListener('change', (e) => { state.filter.to = e.target.value; resetPage(); });
  $('#addBtn').addEventListener('click', () => openEntryModal());
  $('#pdfBtn').addEventListener('click', openExportModal);
  $$('.seg [data-tab]').forEach(b => b.addEventListener('click', () => {
    state.tab = b.dataset.tab; $$('.seg [data-tab]').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-selected', String(x === b)); });
    renderTable(); renderBottom();
  }));
  $('#search').addEventListener('input', UI.debounce((e) => { state.search = e.target.value; resetPage(); }, 200));
  $('#tableWrap').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'edit') openEntryModal(state.all.find(x => x.id === b.dataset.id));
    else delEntry(b.dataset.id);
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !state.loading && !state.error && !$('.modal-backdrop')) load(true); });

  await load();
  const params = new URLSearchParams(location.search);
  if (!state.error) { if (params.get('new')) openEntryModal(); if (params.get('export')) openExportModal(); }
  if (params.get('new') || params.get('export')) history.replaceState(null, '', location.pathname);
})();
