/* Log sheet page: one table with every patient entered on this laptop, with filters.
   Export PDF prints both sheets for the entries currently shown in the table. */
(async function () {
  const ctx = await Shell.init();
  const { profile, hospital } = ctx;
  const C = APP_CONFIG, L = Logic, { $, $$, esc, icon, setBusy } = UI;
  const today = () => L.todayStr();
  const mb = () => L.monthBounds(L.activeMonth());                       // first and last day of the active month
  const maxDate = () => { const last = mb()[1], t = today(); return last < t ? last : t; };
  const PAGE = 50;
  const INQUIRIES = (() => {
    try {
      const v = ctx.settings.inquiries, a = typeof v === 'string' ? JSON.parse(v) : v;
      if (Array.isArray(a) && a.length) return a.filter(x => typeof x === 'string' && x.trim());
    } catch (e) {}
    return ['DOC REQUIREMENT', 'ADD DEPENDENT', 'PHIC ELIGIBILITY'];
  })();
  const state = { all: [], view: [], page: 1, search: '', loading: true, error: '', filter: { hospital: '', from: '', to: '' } };
  const sigCache = new Map();

  /* ============================== page skeleton ============================== */
  const root = $('#page');
  root.innerHTML = `
    <div class="page-head">
      <p class="lede">${esc(L.monthLabel(L.activeMonth()))} · saved on this laptop</p>
      <div class="head-actions">
        <button class="btn btn-ghost" id="pdfBtn">${icon('download', 18)}<span>Export PDF</span></button>
        <button class="btn btn-primary" id="addBtn">${icon('plus', 18)}<span>Add entry</span></button>
      </div>
    </div>

    ${L.activeMonth() !== L.currentMonth() ? `<div class="mode-note">${icon('calendar', 18)}<span>You are viewing ${esc(L.monthLabel(L.activeMonth()))}, not the current month.</span><a class="btn btn-ghost btn-sm" href="${C.PATHS.monthly}">Go to Monthly Log Sheet</a></div>` : ''}
    <div class="card ls-toolbar">
      <div class="tb-field">
        <label class="label" for="fHosp">Hospital</label>
        <select class="input" id="fHosp"></select>
      </div>
      <div class="tb-field"><label class="label" for="fFrom">From</label><input type="date" class="input" id="fFrom"></div>
      <div class="tb-field"><label class="label" for="fTo">To</label><input type="date" class="input" id="fTo"></div>
      <div class="tb-field tb-search">
        <label class="label" for="search">Search</label>
        <div class="search-box">${icon('search', 18)}<input class="input" id="search" type="search" placeholder="Search names or inquiry" aria-label="Search entries"></div>
      </div>
      <p class="help tb-hint" id="dateHint" hidden>Choose both From and To to filter by date.</p>
    </div>
    <div class="card"><div class="table-wrap" id="tableWrap"></div><div id="pager"></div></div>`;

  /* ============================== data ============================== */
  async function load(silent) {
    if (!silent) { state.loading = true; state.error = ''; renderAll(); }
    try { state.all = (await API.entries.all()).filter(e => String(e.entry_date).slice(0, 7) === L.activeMonth()).reverse(); state.error = ''; }      // newest date first
    catch (e) { state.error = e.message; if (!silent) state.all = []; UI.toast(e.message, 'error', 6000); }
    state.loading = false; renderAll();
  }

  function hospitalsWithData() {
    const m = new Map();
    state.all.forEach(e => { if (!m.has(e.hospital_id)) m.set(e.hospital_id, e.hospital_name || 'Unknown hospital'); });
    return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }

  function filtered() {
    const f = state.filter, q = state.search.trim().toLowerCase();
    const byH = !!f.hospital;
    const byD = !!(f.from && f.to);
    return state.all.filter(e => {
      if (byH && e.hospital_id !== f.hospital) return false;
      if (byD && (e.entry_date < f.from || e.entry_date > f.to)) return false;
      if (q && ![e.client_name, e.member_name, e.patient_name, e.nature_of_inquiry, e.remarks, e.contact_no, e.hospital_name, e.control_no].join(' ').toLowerCase().includes(q)) return false;
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

  /* ============================== rendering ============================== */
  function renderAll() {
    renderFilter();
    state.view = state.loading ? [] : filtered();
    const pages = Math.max(1, Math.ceil(state.view.length / PAGE)); if (state.page > pages) state.page = pages;
    $('#addBtn').disabled = state.loading || !!state.error;
    $('#pdfBtn').disabled = state.loading || !!state.error;
    renderTable(); renderPager();
  }

  function renderFilter() {
    const f = state.filter, hs = hospitalsWithData();
    if (f.hospital && !hs.some(h => h.id === f.hospital)) f.hospital = '';
    $('#fHosp').innerHTML = '<option value="">All hospitals</option>' + hs.map(h => `<option value="${esc(h.id)}" ${h.id === f.hospital ? 'selected' : ''}>${esc(h.name)}</option>`).join('');
    $('#fFrom').value = f.from; $('#fTo').value = f.to;
    $('#fFrom').min = mb()[0]; $('#fFrom').max = f.to || mb()[1]; $('#fTo').min = f.from || mb()[0]; $('#fTo').max = mb()[1];
    if ($('#fFrom')._sync) { $('#fFrom')._sync(); $('#fTo')._sync(); }
    $('#dateHint').hidden = !!f.from === !!f.to;
  }

  const dash = '<span class="dash">—</span>';
  const td = (label, html, cls = '', raw) => `<td data-label="${label}" class="${cls}${(raw === '' || raw == null) && cls !== 'actions' && cls !== 'no' ? ' is-empty' : ''}">${html || dash}</td>`;
  const catBadge = (c) => `<span class="badge ${c === 'NM' ? '' : 'badge-green'}" title="${esc((L.catByCode(c) || {}).label || '')}">${esc(c)}</span>`;
  const svcBadge = (k) => ({ at_post: '<span class="badge badge-blue">At Post</span>', ward_class: '<span class="badge badge-teal">Ward Class</span>', outpatient: '<span class="badge badge-green">Outpatient</span>', none: '<span class="badge">Inquiry only</span>' }[k] || '');
  const tick = `<span class="tick">${icon('check', 18)}</span>`;
  const filterActive = () => state.filter.hospital || state.filter.from || state.filter.to || state.search.trim();

  function actionsCell(e, no) {
    return `<td class="actions"><button class="icon-btn" data-act="edit" data-id="${e.id}" aria-label="Edit entry ${no}" title="Edit">${icon('edit', 18)}</button><button class="icon-btn danger" data-act="del" data-id="${e.id}" aria-label="Delete entry ${no}" title="Delete">${icon('trash', 18)}</button></td>`;
  }
  const noCell = (no) => `<td class="no" data-label="No.">${no}</td>`;
  const dateCell = (e) => td('Date entered', esc(L.fmtDate(e.entry_date)), 'nowrap', e.entry_date);
  const hospCell = (e) => td('Hospital', esc(e.hospital_name), '', e.hospital_name);
  const ctrlCell = (e) => td('Control no.', e.control_no ? '<span class="badge badge-blue">' + esc(e.control_no) + '</span>' : '', 'nowrap', e.control_no);

  function renderTable() {
    const wrap = $('#tableWrap');
    if (state.loading) { wrap.innerHTML = '<div style="padding:1.25rem;display:grid;gap:.7rem">' + [1, 2, 3, 4].map(() => '<div class="skeleton" style="height:38px"></div>').join('') + '</div>'; return; }
    if (state.error) {
      wrap.innerHTML = `<div class="empty">${icon('alert')}<h4>Your data could not be opened</h4><p>${esc(state.error)}</p><button class="btn btn-primary" id="retryBtn">Try again</button></div>`;
      $('#retryBtn').addEventListener('click', () => load()); return;
    }
    if (!state.all.length) {
      wrap.innerHTML = `<div class="empty">${icon('clipboard')}<h4>No entries yet</h4><p>Add the first client. Totals and the summary fill in as you go.</p></div>`;
      return;
    }
    if (!state.view.length) {
      wrap.innerHTML = `<div class="empty">${icon('search')}<h4>No matches</h4><p>No entry matches your filter or search.</p>${filterActive() ? '<button class="btn btn-ghost" id="clearFilter">Clear filter and search</button>' : ''}</div>`;
      const b = $('#clearFilter'); if (b) b.addEventListener('click', () => { state.filter = { hospital: '', from: '', to: '' }; state.search = ''; $('#search').value = ''; state.page = 1; renderAll(); });
      return;
    }
    const start = (state.page - 1) * PAGE;
    const rows = state.view.slice(start, start + PAGE).map((e, i) => ({ e, no: state.view.length - (start + i) }));
    wrap.innerHTML = `<table class="tbl ls-table"><thead><tr><th>No.</th><th>Date entered</th><th>Control no.</th><th>Hospital</th><th>Name of patient</th><th>Name of member</th><th>Name of client</th><th>Contact</th><th>Signature</th><th>Patient is</th><th>Admission date</th><th>Category</th><th>Status</th><th>Nature of inquiry</th><th>Service</th><th>Walk-in</th><th>PPFF</th><th>PCF1</th><th>Remarks</th><th>Action</th></tr></thead><tbody>${rows.map(({ e, no }) => `<tr>
      ${noCell(no)}${dateCell(e)}${ctrlCell(e)}${hospCell(e)}
      ${td('Patient', esc(e.patient_name), 'name', e.patient_name)}
      ${td('PhilHealth member', esc(e.member_name), '', e.member_name)}
      ${td('Client', esc(e.client_name), '', e.client_name)}
      ${td('Contact', esc(e.contact_no), 'nowrap', e.contact_no)}
      ${td('Signature', e.has_signature ? (sigCache.get(e.id) ? `<img class="sig-thumb" src="${sigCache.get(e.id)}" alt="Client signature">` : `<span data-sig="${e.id}" class="muted small">…</span>`) : '', '', e.has_signature ? 'y' : '')}
      ${td('Patient is', e.patient_is === 'member' ? '<span class="badge">Member</span>' : e.patient_is === 'dependent' ? '<span class="badge">Dependent</span>' : '', '', e.patient_is)}
      ${td('Admission date', e.admission_date ? esc(e.admission_date.slice(5, 7) + '/' + e.admission_date.slice(8, 10) + '/' + e.admission_date.slice(0, 4)) : '', 'nowrap', e.admission_date)}
      ${td('Category', e.member_category ? catBadge(e.member_category) : '', '', e.member_category)}
      ${td('Status', e.status === 'active' ? '<span class="badge badge-green">Active</span>' : e.status === 'inactive' ? '<span class="badge badge-amber">Inactive</span>' : '', '', e.status)}
      ${td('Nature of inquiry', esc(e.nature_of_inquiry), '', e.nature_of_inquiry)}
      ${td('Service', svcBadge(e.service), '', e.service)}
      ${td('Walk-in', e.walk_in ? tick : '', '', e.walk_in ? 'y' : '')}
      ${td('PPFF', e.ppff ? tick : '', '', e.ppff ? 'y' : '')}
      ${td('PCF1 reason', e.pcf1_reason ? `<span class="badge badge-amber">${esc((L.PCF1_REASONS.find(r => r.key === e.pcf1_reason) || {}).label || '')}</span>` : '', '', e.pcf1_reason)}
      ${td('Remarks', esc(String(e.remarks || '').toUpperCase()), '', e.remarks)}
      ${actionsCell(e, no)}</tr>`).join('')}</tbody></table>`;
    loadSigs();
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

  /* ============================== entry form ============================== */
  function formHTML(e) {
    const chk = (cond) => cond ? 'checked' : '';
    const inqList = ((!e.nature_of_inquiry || INQUIRIES.includes(e.nature_of_inquiry)) ? INQUIRIES : [e.nature_of_inquiry, ...INQUIRIES])
      .slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const services = L.SERVICES.filter(sv => sv.key !== 'none');
    return `
      <div id="entryAlert" class="alert" hidden></div>
      <form id="entryForm" novalidate autocomplete="off">
        <div class="form-section"><h4>Where and when</h4>
          <div class="form-grid">
            <div class="field"><span class="label" id="fHospLabel">Hospital <span class="req">*</span></span>
              <button type="button" class="select-btn" id="fHosp" aria-labelledby="fHospLabel" aria-haspopup="dialog"><span class="sel-text">Select hospital</span><span id="fHospChev"></span></button></div>
            <div class="field"><label class="label" for="fDate">Date entered <span class="req">*</span></label>
              <input class="input" id="fDate" type="date" value="${esc(e.entry_date || maxDate())}" min="${mb()[0]}" max="${maxDate()}"></div>
          </div>
        </div>
        <div class="form-section"><h4>Client details</h4>
          <div class="form-grid">
            <div class="field"><label class="label" for="fPatient">Name of patient <span class="req">*</span></label>
              <input class="input caps" id="fPatient" value="${esc(e.patient_name || '')}" placeholder="LAST NAME, FIRST NAME" autocapitalize="characters" spellcheck="false" autofocus></div>
            <div class="field"><label class="label" for="fMember">Name of member</label>
              <input class="input caps" id="fMember" value="${esc(e.member_name || '')}" placeholder="LAST NAME, FIRST NAME" autocapitalize="characters" spellcheck="false"></div>

            <div class="field"><label class="label" for="fClient">Name of client</label>
              <input class="input caps" id="fClient" value="${esc(e.client_name || '')}" placeholder="LAST NAME, FIRST NAME" autocapitalize="characters" spellcheck="false"></div>
            <div class="field"><label class="label" for="fContact">Contact number <span class="muted small">(optional)</span></label>
              <input class="input" id="fContact" type="tel" inputmode="tel" value="${esc(e.contact_no || '')}" placeholder="09XX XXX XXXX"></div>

            <div class="field"><label class="label" for="fPi">Patient is</label>
              <select class="input" id="fPi"><option value="">Select</option>
                <option value="member" ${e.patient_is === 'member' ? 'selected' : ''}>Member</option>
                <option value="dependent" ${e.patient_is === 'dependent' ? 'selected' : ''}>Dependent</option></select></div>
            <div class="field"><label class="label" for="fAdmission">Admission date</label>
              <input class="input" id="fAdmission" type="date" value="${esc(e.admission_date || '')}"></div>

            <div class="field span-2"><span class="label">Client signature <span class="muted small">(sign inside the box, or paste an image)</span></span>
              <div class="sig-wrap" id="sigWrap" tabindex="0"><canvas id="fSig" class="sig-canvas" width="600" height="200" aria-label="Signature pad"></canvas></div>
              <div class="row" style="justify-content:flex-end">
                <button type="button" class="btn btn-ghost btn-sm" id="sigPaste">Paste from clipboard</button>
                <button type="button" class="btn btn-ghost btn-sm" id="sigClear">Clear</button>
                <button type="button" class="btn btn-ghost btn-sm" id="sigCopy">Copy</button>
                <button type="button" class="btn btn-primary btn-sm" id="sigEdit">Save</button>
              </div></div>
          </div>
        </div>
        <div class="form-section"><h4>Classification</h4>
          <div class="form-grid">
            <div class="field span-2"><div class="label-row"><label class="label" for="fCat">Member category</label><button type="button" class="info-btn" id="legendBtn" aria-label="Show member category legend" title="Member category legend">${icon('info', 18)}</button></div>
              <select class="input" id="fCat"><option value="">Select category</option>${L.CATEGORIES.map(c => `<option value="${esc(c.code)}" ${e.member_category === c.code ? 'selected' : ''}>${esc(c.code)} – ${esc(c.label)}</option>`).join('')}</select></div>
            <div class="field"><label class="label" for="fSt">Membership status <span id="stReq"></span></label>
              <select class="input" id="fSt"><option value="">Select status</option>
                <option value="active" ${e.status === 'active' ? 'selected' : ''}>Active</option>
                <option value="inactive" ${e.status === 'inactive' ? 'selected' : ''}>Inactive</option></select></div>
            <div class="field"><label class="label" for="fSvc">Service</label>
              <select class="input" id="fSvc"><option value="">None</option>${services.map(sv => `<option value="${sv.key}" ${e.service === sv.key ? 'selected' : ''}>${esc(sv.label)}</option>`).join('')}</select></div>
            <div class="field"><label class="label" for="fInquiry">Nature of inquiry</label>
              <select class="input" id="fInquiry"><option value="">Select inquiry</option>${inqList.map(i => `<option value="${esc(i)}" ${e.nature_of_inquiry === i ? 'selected' : ''}>${esc(i)}</option>`).join('')}</select></div>
            <div class="field"><label class="label" for="fPcf1">PCF1 issued because of</label>
              <select class="input" id="fPcf1"><option value="">Not issued</option>${L.PCF1_REASONS.map(r => `<option value="${r.key}" ${e.pcf1_reason === r.key ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select></div>

            <div class="field"><label class="switch"><input type="checkbox" id="fWalk" ${chk(e.walk_in)}><span class="switch-ui"></span><span>Walk-in client</span></label></div>
            <div class="field"><label class="switch"><input type="checkbox" id="fPpff" ${chk(e.ppff)}><span class="switch-ui"></span><span>PPFF administered</span></label></div>

            <div class="field span-2"><label class="label" for="fRemarks">Remarks</label>
              <input class="input caps" id="fRemarks" value="${esc(e.remarks || '')}" autocapitalize="characters" spellcheck="false"></div>
          </div>
        </div>
      </form>`;
  }

  /* draws a pasted picture onto the signature pad, scaled to fit */
  function drawOnPad(cv, blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob), img = new Image();
      img.onload = () => {
        const g = cv.getContext('2d'); cv._clear();
        const sc = Math.min(cv.width / img.width, cv.height / img.height), w = img.width * sc, h = img.height * sc;
        g.drawImage(img, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
        cv._st.ink = true; URL.revokeObjectURL(url); resolve();
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That image could not be read.')); };
      img.src = url;
    });
  }

  function initSignature(el, existing) {
    const cv = $('#fSig', el), g = cv.getContext('2d'), wrap = $('#sigWrap', el);
    const st = cv._st || (cv._st = { ink: false, drawing: false });
    cv._clear = () => { g.clearRect(0, 0, cv.width, cv.height); st.ink = false; };
    cv._get = () => st.ink ? cv.toDataURL('image/png') : null;
    cv._clear();
    if (existing) { const img = new Image(); img.onload = () => { g.drawImage(img, 0, 0, cv.width, cv.height); st.ink = true; }; img.src = existing; }
    cv._setLock = (on) => {
      st.locked = on;
      $('#sigPaste', el).disabled = on; $('#sigClear', el).disabled = on;
      wrap.classList.toggle('is-locked', on);
      const eb = $('#sigEdit', el); eb.textContent = on ? 'Edit' : 'Save'; eb.className = 'btn btn-sm ' + (on ? 'btn-ghost' : 'btn-primary');
    };
    cv._setLock(!!existing);
    if (cv._bound) return; cv._bound = true;
    g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#000';
    const pt = (ev) => { const r = cv.getBoundingClientRect(); return [(ev.clientX - r.left) * cv.width / r.width, (ev.clientY - r.top) * cv.height / r.height]; };
    cv.addEventListener('pointerdown', (ev) => { ev.preventDefault(); if (st.locked) return; wrap.focus({ preventScroll: true }); cv.setPointerCapture(ev.pointerId); st.drawing = true; const [x, y] = pt(ev); g.beginPath(); g.moveTo(x, y); g.lineTo(x + .01, y + .01); g.stroke(); st.ink = true; });
    cv.addEventListener('pointermove', (ev) => { if (!st.drawing) return; ev.preventDefault(); const [x, y] = pt(ev); g.lineTo(x, y); g.stroke(); g.beginPath(); g.moveTo(x, y); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => cv.addEventListener(n, () => { st.drawing = false; }));
    $('#sigClear', el).addEventListener('click', () => { if (!st.locked) cv._clear(); });

    $('#sigCopy', el).addEventListener('click', async () => {
      if (!cv._get()) { UI.toast('There is no signature to copy.', 'error'); return; }
      try {
        if (!navigator.clipboard || !window.ClipboardItem) throw new Error('nosupport');
        const flat = document.createElement('canvas'); flat.width = cv.width; flat.height = cv.height;
        const fg = flat.getContext('2d'); fg.fillStyle = '#ffffff'; fg.fillRect(0, 0, flat.width, flat.height); fg.drawImage(cv, 0, 0);
        const blob = await new Promise(r => flat.toBlob(r, 'image/png'));
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        UI.toast('Signature copied. You can now paste it into the PDF.', 'success', 4000);
      } catch (err) { UI.toast('Could not copy the signature. Use Google Chrome or Microsoft Edge and try again.', 'error', 6000); }
    });

    $('#sigEdit', el).addEventListener('click', async () => {
      if (st.locked) {
        const go = await UI.confirm({ title: 'Edit the signature?', confirmText: 'Yes, edit', iconName: 'edit', message: '<p>Are you sure you want to change this signature? Clear and Paste are turned on until you click Save.</p>' });
        if (go) cv._setLock(false);
      } else {
        if (!cv._get()) { UI.toast('There is no signature to save. Sign or paste one first.', 'error'); return; }
        cv._setLock(true);
        UI.toast('Signature saved. Click Save entry to keep the entry.', 'success', 4000);
      }
    });

    // paste with the button
    $('#sigPaste', el).addEventListener('click', async () => {
      if (st.locked) return;
      try {
        if (!navigator.clipboard || !navigator.clipboard.read) throw Object.assign(new Error('nosupport'), { name: 'NotSupportedError' });
        const items = await navigator.clipboard.read();
        let blob = null;
        for (const it of items) { const t = it.types.find(x => x.indexOf('image/') === 0); if (t) { blob = await it.getType(t); break; } }
        if (!blob) { UI.toast('No picture found on the clipboard. Copy the signature picture first.', 'error', 5000); return; }
        await drawOnPad(cv, blob);
      } catch (err) {
        UI.toast('Could not read the clipboard. Click the signature box, then press Ctrl+V.', 'error', 6000);
        wrap.focus({ preventScroll: true });
      }
    });
    // paste with Ctrl+V while the signature box is selected
    wrap.addEventListener('paste', async (ev) => {
      if (st.locked) return;
      const items = (ev.clipboardData && ev.clipboardData.items) || [];
      for (const it of items) {
        if (it.kind === 'file' && it.type.indexOf('image/') === 0) {
          ev.preventDefault();
          try { await drawOnPad(cv, it.getAsFile()); } catch (err) { UI.toast(err.message, 'error'); }
          return;
        }
      }
    });
  }

  function openLegend() {
    UI.modal({
      title: 'Member category legend', headIcon: 'info', size: 'sm',
      body: `<dl class="legend">${L.CATEGORIES.map(c => `<dt>${esc(c.code)}</dt><dd>${esc(c.label)}</dd>`).join('')}</dl>`,
      footer: [{ label: 'Close', className: 'btn-primary' }]
    });
  }

  /* turns the drop-down lists in the entry form into pop-up pickers */
  function popSelects(el) {
    $$('select.input', el).forEach(sel => {
      if (!sel._btn) {
        const lab = el.querySelector('label[for="' + sel.id + '"]');
        const title = lab ? lab.textContent.replace('*', '').replace(/\(.*?\)/, '').trim() : 'Select';
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'select-btn';
        btn.innerHTML = '<span class="sel-text"></span><span class="sel-chev"></span>';
        $('.sel-chev', btn).innerHTML = icon('chevronDown', 18);
        sel.hidden = true; sel.after(btn); sel._btn = btn;
        sel._sync = () => {
          const o = sel.options[sel.selectedIndex];
          $('.sel-text', btn).textContent = o ? o.textContent : '';
          btn.classList.toggle('has-value', !!sel.value);
          btn.disabled = sel.disabled;
        };
        btn.addEventListener('click', () => {
          const opts = Array.from(sel.options);
          const m = UI.modal({
            title, headIcon: 'list', size: 'sm', className: 'modal-picker',
            body: (sel.id === 'fInquiry' ? `<div class="search-box">${icon('search', 18)}<input type="search" class="input" id="pkSearch" placeholder="Type to search" autocomplete="off" aria-label="Search"></div>` : '') + `<ul class="pick-list" role="radiogroup">${opts.map((o, i) => `<li><label class="pick-item ${o.value === sel.value ? 'is-selected' : ''}"><input type="radio" name="opt" value="${i}" ${o.value === sel.value ? 'checked' : ''}><span class="radio-dot" aria-hidden="true"></span><span class="pick-name">${esc(o.textContent)}</span></label></li>`).join('')}</ul>`,
            footer: [{ label: 'Cancel', className: 'btn-ghost' }]
          });
          const pk = $('#pkSearch', m.el);
          if (pk) pk.addEventListener('input', () => {
            const t = pk.value.trim().toLowerCase();
            $$('.pick-list li', m.el).forEach((li, i) => { li.hidden = !!t && !opts[i].textContent.toLowerCase().includes(t); });
          });
          $('.pick-list', m.el).addEventListener('change', (ev) => {
            const o = opts[+ev.target.value];
            sel.value = o.value; sel._sync();
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            setTimeout(() => m.close(), 140);
          });
        });
      }
      sel._sync();
    });
  }

  function wireForm(h, e) {
    const el = h.el, q = (s) => $(s, el);
    popSelects(el);
    UI.datePicker(q('#fDate'), { clearable: false });
    UI.datePicker(q('#fAdmission'), { placeholder: 'Select date' });
    if (!h._legend) { h._legend = true; q('#legendBtn').addEventListener('click', openLegend); }
    if (!h._hf) {
      h._hf = UI.hospitalField(q('#fHosp'));
      q('#fHospChev').innerHTML = icon('chevronDown', 18);
      h._hf.set(e.hospital_id ? { id: e.hospital_id, name: e.hospital_name } : (hospital ? { id: hospital.id, name: hospital.name } : null));
    }
    // everything typed in the name and remarks boxes becomes CAPITAL letters
    if (!h._caps) {
      h._caps = true;
      $$('input.caps', el).forEach(inp => inp.addEventListener('input', () => {
        const a = inp.selectionStart, b = inp.selectionEnd, u = inp.value.toUpperCase();
        if (u !== inp.value) { inp.value = u; try { inp.setSelectionRange(a, b); } catch (x) {} }
      }));
    }
    let touchedPatient = !!e.patient_name;
    q('#fPatient').addEventListener('input', () => { touchedPatient = true; });
    const copyMember = () => { if (!touchedPatient && q('#fPi').value === 'member') q('#fPatient').value = q('#fMember').value; };
    q('#fMember').addEventListener('input', copyMember);
    q('#fPi').addEventListener('change', copyMember);
    const syncCat = () => {
      const nm = q('#fCat').value === 'NM';
      q('#fSt').disabled = nm; if (nm) q('#fSt').value = '';
      q('#stReq').hidden = nm;
      $$('select.input', el).forEach(s => s._sync && s._sync());
    };
    q('#fCat').addEventListener('change', syncCat); syncCat();
    initSignature(el, e.signature);
    if (!h._wired) { h._wired = true; q('#entryForm').addEventListener('submit', (ev) => { ev.preventDefault(); q('#entrySave').click(); }); }
  }

  function readForm(h) {
    const el = h.el, v = (id) => $(id, el).value.trim() || null, r = (n) => $({ pi: '#fPi', cat: '#fCat', st: '#fSt', svc: '#fSvc' }[n], el).value || null;
    const vu = (id) => { const x = v(id); return x ? x.toUpperCase() : null; };
    const cat = r('cat'), hosp = h._hf.get();
    return {
      hospital_id: hosp ? hosp.id : null, hospital_name: hosp ? hosp.name : null, entry_date: v('#fDate'),
      client_name: vu('#fClient'), member_name: vu('#fMember'), patient_name: vu('#fPatient'), contact_no: v('#fContact'),
      patient_is: r('pi'), admission_date: v('#fAdmission'), member_category: cat, status: cat === 'NM' ? null : r('st'),
      nature_of_inquiry: v('#fInquiry'), service: r('svc') || 'none', walk_in: $('#fWalk', el).checked, ppff: $('#fPpff', el).checked,
      pcf1_reason: v('#fPcf1'), remarks: vu('#fRemarks'), signature: $('#fSig', el)._get()
    };
  }

  function validate(p) {
    if (!p.hospital_id) return ['fHosp', 'Select the hospital.'];
    if (!p.entry_date) return ['fDate', 'Enter the date of the entry.'];
    if (p.entry_date > today()) return ['fDate', 'The date cannot be in the future.'];
    if (p.entry_date.slice(0, 7) !== L.activeMonth()) return ['fDate', 'The date must be in ' + L.monthLabel(L.activeMonth()) + '. To enter another month, activate it in Monthly Log Sheet.'];
    if (!p.patient_name) return ['fPatient', 'Enter the name of the patient.'];
    if (p.member_category !== 'NM') {
    }
    return null;
  }

  async function openEntryModal(entry) {
    let e = entry || {};
    if (entry && entry.has_signature) { try { e = { ...entry, signature: await API.entries.signature(entry.id) }; } catch (x) {} }
    const h = UI.modal({
      title: entry ? 'Edit entry' : 'Add entry', headIcon: entry ? 'edit' : 'plus', size: '', className: 'modal-entry', persistent: true,
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
      UI.showAlert(box, bad[1]);
      const fid = bad[0] || (bad[1].indexOf('category') > -1 ? 'fCat' : 'fSt');
      const fel = $('#' + fid, h.el); fel.focus(); UI.flagInput(fel);
      return false;
    }
    setBusy(btn, true, 'Saving');
    try {
      if (entry) { await API.entries.update(entry.id, p); sigCache.delete(entry.id); UI.toast('Entry updated.', 'success'); }
      else { await API.entries.create({ ...p, created_by: ctx.user.id }); UI.toast('Entry saved.', 'success'); }
      await load(true);
      if (another) {
        const f = $('#entryForm', h.el); f.reset();
        $('#fPatient', h.el).focus(); h.body.scrollTo({ top: 0 });
        wireForm(h, { entry_date: p.entry_date, hospital_id: p.hospital_id, hospital_name: p.hospital_name });
        $('#fDate', h.el).value = p.entry_date; $('#fDate', h.el)._sync();
        setBusy(btn, false);
        return false;
      }
    } catch (err) { UI.showAlert(box, err.message); setBusy(btn, false); return false; }
    setBusy(btn, false);
  }

  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  async function delEntry(id) {
    const e = state.all.find(x => x.id === id); if (!e) return;
    const ok = await UI.confirm({
      title: 'Delete this entry?', danger: true, confirmText: 'Delete entry', iconName: 'trash',
      message: `<p><strong>${esc(e.patient_name || e.client_name || 'This entry')}</strong> (${esc(L.fmtDate(e.entry_date, 'long'))}, ${esc(e.hospital_name || '')}) will be removed. This cannot be undone. Make sure you have a recent backup if you may need it again.</p>`
    });
    if (!ok) return;
    try { await API.entries.remove(id); } catch (err) { UI.toast(err.message, 'error', 5000); return; }
    sigCache.delete(id);
    const y = window.scrollY, wrap = $('#tableWrap'), sx = wrap.scrollLeft, card = wrap.parentElement;
    const btn = $(`[data-act="del"][data-id="${id}"]`), tr = btn && btn.closest('tr');
    if (tr) {
      const h0 = card.offsetHeight, rowH = tr.offsetHeight;
      const after = []; let n = tr; while ((n = n.nextElementSibling)) after.push(n);
      tr.classList.add('row-out'); await wait(220);
      tr.remove();
      const total = state.view.length - 1, start = (state.page - 1) * PAGE;
      $$('tbody tr', wrap).forEach((r, i) => { const c = r.querySelector('.no'); if (c) c.textContent = total - (start + i); });
      const h1 = card.offsetHeight;
      card.style.height = h0 + 'px'; card.style.overflow = 'hidden';
      after.forEach(r => { r.style.transition = 'none'; r.style.transform = `translateY(${rowH}px)`; });
      void card.offsetHeight;
      card.style.transition = 'height .32s cubic-bezier(.4,0,.2,1)'; card.style.height = h1 + 'px';
      after.forEach(r => { r.style.transition = 'transform .32s cubic-bezier(.4,0,.2,1)'; r.style.transform = ''; });
      await wait(340);
      card.style.height = ''; card.style.transition = ''; card.style.overflow = '';
    }
    state.all = state.all.filter(x => x.id !== id);
    renderAll();
    $('#tableWrap').scrollLeft = sx; window.scrollTo(0, y);
    UI.toast('Entry deleted.', 'success');
  }

  /* ============================== export ============================== */
    function openExportModal() {
    if (!state.view.length) { UI.toast('There are no entries to export.', 'error'); return; }
    UI.modal({
      title: 'Export PDF', headIcon: 'download', size: 'sm',
      body: `<div id="expAlert" class="alert" hidden></div>
        <p class="help">Each page gets its own control no. (year-month-series), starting at 01 every month.</p>
        <div class="field"><label class="label" for="expOpdN">No. of times OPD class is conducted</label>
          <input class="input" id="expOpdN" type="number" min="0" inputmode="numeric"></div>
        <div class="field"><label class="label" for="expOpdC">No. of clients served during OPD class</label>
          <input class="input" id="expOpdC" type="number" min="0" inputmode="numeric"></div>
        <div class="field"><label class="label" for="expPpff">Total No. of PPFF Administered</label>
          <input class="input" id="expPpff" type="number" min="0" inputmode="numeric"></div>`,
      footer: [{ label: 'Cancel', className: 'btn-ghost' }, { id: 'expGo', label: 'Download PDF', className: 'btn-primary', onClick: (hh, b) => doExport(hh, b) }]
    });
  }

  async function doExport(h, btn) {
    const box = $('#expAlert', h.el); box.hidden = true;
    if (!window.PDFLib) { UI.showAlert(box, 'The PDF library did not load. Check your internet connection and try again.'); return false; }
    const num = (id) => { const v = $(id, h.el).value.trim(); return v === '' ? null : Math.max(0, parseInt(v, 10) || 0); };

    const printed = state.view.filter(e => e.control_no);
    if (printed.length) {
      const list = [...new Set(printed.map(e => e.control_no))].sort();
      const go = await UI.confirm({
        title: 'Some entries were already printed', danger: true, confirmText: 'Print again', iconName: 'alert',
        message: `<p>${printed.length} of the ${state.view.length} selected entries were already printed under control no. <strong>${list.map(esc).join(', ')}</strong>.</p><p>If you print again and confirm the print-out, these entries will get new control numbers.</p>`
      });
      if (!go) return false;
    }

    const manual = {
      pcare_name: profile.full_name,
      opd_class_count: num('#expOpdN'), opd_class_clients: num('#expOpdC'), ppff_total: num('#expPpff')
    };
    setBusy(btn, true, 'Preparing');
    const marks = new Map();      // entry id -> control no.
    let controlList = [];
    try {
      const byH = new Map();
      state.view.forEach(e => {
        if (!byH.has(e.hospital_id)) byH.set(e.hospital_id, { hospital_id: e.hospital_id, hospital: e.hospital_name || '', entries: [] });
        byH.get(e.hospital_id).entries.push(e);
      });
      const gs = [...byH.values()].sort((a, b) => a.hospital.localeCompare(b.hospital));

      // highest series already used per hospital and month (by entries that are not part of this export)
      const inView = new Set(state.view.map(e => e.id));
      const used = new Map();
      state.all.forEach(e => {
        if (!e.control_no || inView.has(e.id)) return;
        const p = String(e.control_no).split('-'), n = parseInt(p[2], 10);
        if (isNaN(n)) return;
        const k = e.hospital_id + '|' + p[0] + '-' + p[1];
        if (n > (used.get(k) || 0)) used.set(k, n);
      });
      const PER = C.ROWS_PER_PAGE || 15;

      const days = gs.map(g => {
        const entries = g.entries.map(e => ({ ...e })).sort((a, b) => String(a.entry_date).localeCompare(b.entry_date) || String(a.created_at).localeCompare(b.created_at));
        const pages = Math.floor(entries.length / PER) + 1;
        const controls = [];
        for (let p = 0; p < pages; p++) {
          const chunk = entries.slice(p * PER, p * PER + PER);
          if (!chunk.length) { controls.push(controls[controls.length - 1]); continue; }   // empty last page keeps the previous number
          const ym = String(chunk[0].entry_date).slice(0, 7);
          const k = g.hospital_id + '|' + ym, n = (used.get(k) || 0) + 1;
          used.set(k, n);
          const control = ym + '-' + String(n).padStart(2, '0');
          controls.push(control);
          chunk.forEach(e => marks.set(e.id, control));
        }
        return { date: entries[0].entry_date, dateTo: entries[entries.length - 1].entry_date, hospital: g.hospital, sheet: { ...manual, control_no: controls[0] }, controls, entries };
      });
      controlList = [...new Set(days.flatMap(d => d.controls))].sort();

      const signed = days.flatMap(d => d.entries).filter(e => e.has_signature);
      for (let i = 0; i < signed.length; i += 40) {
        await Promise.all(signed.slice(i, i + 40).map(async (e) => { try { e.signature = await API.entries.signature(e.id); } catch (x) {} }));
      }
      const names = [...new Set(days.map(d => d.hospital))];
      const label = names.length === 1 ? names[0] : 'Multiple hospitals';
      const bytes = await PDFExport.generate({ days, sheets: { s1: true, s2: true }, hospital: label, logo: C.LOGO_CARES, appName: C.APP_NAME, rowsPerPage: C.ROWS_PER_PAGE });
      const first = days[0].date;
      const hl = await API.hospitals.list();
      const hids = [...new Set(gs.map(g => g.hospital_id))];
      const hsel = hl.find(x => x.id === hids[0]);
      const short = hids.length === 1 ? ((hsel && hsel.short_name) || label.replace(/[^A-Za-z0-9]+/g, '')) : 'ALL';
      const name = `Logsheet.${short}.${first.slice(5, 7)}${first.slice(0, 4)}.pdf`;
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      UI.toast('PDF downloaded.', 'success');
    } catch (err) { UI.showAlert(box, err.message); setBusy(btn, false); return false; }

    h.close();
    const range = controlList.length > 1 ? controlList[0] + ' to ' + controlList[controlList.length - 1] : controlList[0];
    const okPrint = await UI.confirm({
      title: 'Is the print-out okay?', confirmText: 'Yes, it is okay', cancelText: 'No, not yet', iconName: 'check',
      message: `<p>If yes, control no. <strong>${esc(range)}</strong> will be saved on these ${marks.size} entries so you can tell which print-out they belong to.</p><p class="muted small">If no, nothing is saved. You can export again.</p>`
    });
    if (okPrint) {
      try {
        await API.entries.markPrinted(marks);
        await load(true);
        UI.toast('Control numbers saved on ' + marks.size + ' entries.', 'success', 5000);
      } catch (err) { UI.toast(err.message, 'error', 6000); }
    }
  }

  /* ============================== events ============================== */
  const resetPage = () => { state.page = 1; renderAll(); };
  $('#fHosp').addEventListener('change', (e) => { state.filter.hospital = e.target.value; resetPage(); });
  $('#fFrom').addEventListener('change', (e) => { state.filter.from = e.target.value; resetPage(); });
  $('#fTo').addEventListener('change', (e) => { state.filter.to = e.target.value; resetPage(); });
  UI.datePicker($('#fFrom'), { placeholder: 'Any date' });
  UI.datePicker($('#fTo'), { placeholder: 'Any date' });
  $('#addBtn').addEventListener('click', () => openEntryModal());
  $('#pdfBtn').addEventListener('click', openExportModal);
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