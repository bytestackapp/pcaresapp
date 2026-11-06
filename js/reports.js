/* Reports: list of reports for one month (opened from Monthly Log Sheet → Report).
   Report 1: Summary (Inpatient). Numbers come from the saved entries; only NO CO-PAY, OPD classes conducted
   and CS during OPD class are typed by the user (saved on this laptop, per month). Export PDF = landscape A4.
   Report 2: Nature of Inquiry. Columns come from Admin → Inquiries. All numbers come from the saved entries. */
(function () {
  const L = Logic, C = APP_CONFIG, { $, $$, esc, icon } = UI;
  const CATS = L.CAT_CODES;
  const MANUAL = ['copay', 'opdN', 'opdC'];
  const NOTES = ['', 'LEAVE', 'OFF', 'CPO', 'OBS', 'HOLIDAY'];
  const MKEY = (ym) => 'pc_report_manual_' + ym;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const norm = (s) => String(s || '').trim().toLowerCase();
  const noteOf = (man, date) => (man['d|' + date] || {}).note || '';

  async function loadManual(ym) {
    const d = await API.reportManual.get(ym);
    if (d && Object.keys(d).length) return d;
    try { return JSON.parse(localStorage.getItem(MKEY(ym)) || '{}') || {}; } catch (e) { return {}; }   // numbers typed before this update
  }
  async function saveManual(ym, obj) {
    await API.reportManual.set(ym, obj);
    try { localStorage.removeItem(MKEY(ym)); } catch (e) {}
  }

  /* ---------- pieces shared by both reports ---------- */
  const metaHtml = (info) => `<div class="rpt-meta"><div><span>Name of P-CARES</span><b>${esc(info.name)}</b></div><div><span>Month</span><b>${esc(info.month)}</b></div><div><span>Date/s Covered</span><b>${esc(info.covered)}</b></div></div>`;

  function monthInfo(ym, profile) {
    const [, to] = L.monthBounds(ym);
    const mon = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1).toLocaleDateString('en-US', { month: 'long' });
    return {
      name: String(profile.full_name || '').toUpperCase(),
      month: mon + ' ' + ym.slice(0, 4),
      covered: mon + ' 1 to ' + (+to.slice(8, 10)) + ', ' + ym.slice(0, 4)
    };
  }

  /* pop-up to choose LEAVE / OFF / CPO / OBS / HOLIDAY for a day without entries */
  function bindNotePicker(body, man, isEditing) {
    body.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-note]'); if (!b || !isEditing()) return;
      const key = 'd|' + b.dataset.note, cur = (man[key] || {}).note || '';
      const pm = UI.modal({
        title: 'HCI', headIcon: 'list', size: 'sm', className: 'modal-picker',
        body: `<ul class="pick-list" role="radiogroup">${NOTES.map((o, i) => `<li><label class="pick-item ${o === cur ? 'is-selected' : ''}"><input type="radio" name="hnote" value="${i}" ${o === cur ? 'checked' : ''}><span class="radio-dot" aria-hidden="true"></span><span class="pick-name">${o ? esc(o) : '(None)'}</span></label></li>`).join('')}</ul>`,
        footer: [{ label: 'Cancel', className: 'btn-ghost' }]
      });
      $('.pick-list', pm.el).addEventListener('change', (e) => {
        const v = NOTES[+e.target.value];
        if (v) man[key] = { note: v }; else delete man[key];
        b.textContent = v; b.closest('tr').classList.toggle('rpt-off', !!v);
        setTimeout(() => pm.close(), 140);
      });
    });
  }

  /* asks "Discard your changes?" when a report window is closed with unsaved typed values */
  function discardGuard(man, getSaved) {
    let asking = false;
    return (h) => {
      if (JSON.stringify(man) === JSON.stringify(getSaved())) return true;
      if (asking) return false;
      asking = true;
      UI.confirm({
        title: 'Discard your changes?', danger: true, confirmText: 'Discard', cancelText: 'Keep editing', iconName: 'alert',
        message: '<p>You changed some values but did not save them. If you close now, these changes will be lost.</p>'
      }).then((go) => {
        asking = false;
        if (go) { Object.keys(man).forEach(k => delete man[k]); Object.assign(man, clone(getSaved())); h.close(); }
      });
      return false;
    };
  }

  /* ---------- PDF helpers (A4 landscape, bold serif like the original form) ---------- */
  const PW = 841.92, PH = 595.32, K = PW / 1280, L0 = 28 * K, THICK = 1.1, THIN = .5;

  async function startPdf(title, heading, info) {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const doc = await PDFDocument.create();
    const fb = await doc.embedFont(StandardFonts.TimesRomanBold);          // the original form is all bold serif
    doc.setTitle(heading + ' · ' + info.month); doc.setProducer(C.APP_NAME); doc.setCreator(C.APP_NAME);
    const black = rgb(0, 0, 0), gray = rgb(.5, .5, .5);
    let logo = null;
    try { const r = await fetch(C.LOGO_CARES); if (r.ok) logo = await doc.embedPng(await r.arrayBuffer()); } catch (e) { logo = null; }

    const P = { doc, fb, X: [], RH: 10.9, page: doc.addPage([PW, PH]) };
    const Yt = (y) => PH - y;
    const safe = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().split('').map(ch => { try { fb.widthOfTextAtSize(ch, 8); return ch; } catch (e) { return '?'; } }).join('');
    P.Yt = Yt; P.safe = safe; P.black = black;
    P.newPage = () => { P.page = doc.addPage([PW, PH]); return P.page; };
    P.right = () => P.X[P.X.length - 1];
    P.hline = (x0, x1, y, th) => P.page.drawLine({ start: { x: x0, y: Yt(y) }, end: { x: x1, y: Yt(y) }, thickness: th, color: black });
    P.vline = (x, y0, y1, th) => P.page.drawLine({ start: { x, y: Yt(y0) }, end: { x, y: Yt(y1) }, thickness: th, color: black });
    P.box = (x0, y0, x1, y1, th) => P.page.drawRectangle({ x: x0, y: Yt(y1), width: x1 - x0, height: y1 - y0, borderColor: black, borderWidth: th });
    P.grid = (c0, c1, y0, y1) => { for (let c = c0; c <= c1 + 1; c++) P.vline(P.X[c], y0, y1, THIN); };

    /* text inside columns c0..c1; wraps, shrinks if still too wide */
    P.cell = (text, c0, c1, y0, y1, o = {}) => {
      const x0 = P.X[c0], x1 = P.X[c1 + 1]; let size = o.size || 6;
      const pad = o.pad == null ? 1.2 : o.pad, maxW = x1 - x0 - pad * 2;
      const words = o.nowrap ? [safe(text)] : safe(text).split(' ').filter(Boolean), lines = []; let cur = '';
      words.forEach(w => { const tt = cur ? cur + ' ' + w : w; if (fb.widthOfTextAtSize(tt, size) <= maxW || !cur) cur = tt; else { lines.push(cur); cur = w; } });
      if (cur) lines.push(cur);
      const widest = Math.max(0, ...lines.map(l => fb.widthOfTextAtSize(l, size)));
      if (widest > maxW && widest > 0) size = Math.max(3.4, size * maxW / widest);
      const lh = size * 1.12, cy = Yt((y0 + y1) / 2);
      lines.forEach((l, i) => {
        const w = fb.widthOfTextAtSize(l, size);
        const x = o.left ? x0 + pad : x0 + (x1 - x0 - w) / 2;
        P.page.drawText(l, { x, y: cy + ((lines.length - 1) / 2 - i) * lh - size * .32, size, font: fb, color: o.gray ? gray : black });
      });
    };
    /* a row of data: first = day / number, hci = hospital, vals = one number per column */
    P.dataRow = (first, hci, vals, y, off) => {
      const RH = P.RH;
      if (off) P.page.drawRectangle({ x: L0, y: Yt(y + RH), width: P.right() - L0, height: RH, color: gray });
      P.grid(0, 1 + vals.length, y, y + RH); P.hline(L0, P.right(), y + RH, THIN);
      P.cell(first, 0, 0, y, y + RH, { size: 6, left: true, pad: 3 });
      P.cell(hci, 1, 1, y, y + RH, { size: 6, left: true, pad: 8, nowrap: true });
      vals.forEach((v, i) => P.cell(String(v || 0), 2 + i, 2 + i, y, y + RH, { size: 6, gray: !v && !off }));
    };
    P.totalRow = (arr, y) => {
      const RH = P.RH;
      P.vline(P.X[0], y, y + RH, THIN); for (let c = 2; c < P.X.length; c++) P.vline(P.X[c], y, y + RH, THIN);
      P.cell('GRAND TOTAL', 0, 1, y, y + RH, { size: 6.2, left: true, pad: 2 });
      arr.forEach((v, i) => P.cell(String(v || 0), 2 + i, 2 + i, y, y + RH, { size: 6, gray: !v }));
    };
    /* title, logo and the name / month / dates box. Columns (P.X) must be set first. Returns the y where the table starts. */
    P.top = () => {
      const tsz = 10.6, tw = fb.widthOfTextAtSize(title, tsz);
      P.page.drawText(title, { x: PW * 542 / 1280 - tw / 2, y: Yt(28.5), size: tsz, font: fb, color: black });
      if (logo) { const w = 120, h = w * logo.height / logo.width; P.page.drawImage(logo, { x: 888 * K, y: Yt(34 + h / 2), width: w, height: h }); }
      const top = 68 * K, boxBottom = top + 10.2, infoY = Yt((top + boxBottom) / 2) - 2.1;
      P.page.drawText('Name of P-CARES: ' + safe(info.name), { x: L0 + 1.5, y: infoY, size: 6.6, font: fb, color: black });
      P.page.drawText('Month: ' + safe(info.month), { x: 377 * K, y: infoY, size: 6.6, font: fb, color: black });
      P.page.drawText('Date/s Covered: ' + safe(info.covered), { x: 538 * K, y: infoY, size: 6.6, font: fb, color: black });
      P.box(L0, top, P.right(), boxBottom, THICK);
      return 91 * K;
    };
    P.finish = async (filename) => {
      const bytes = await doc.save();
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    };
    return P;
  }

  /* =====================================================================
     Report 1: Summary (Inpatient)
     ===================================================================== */
  function blank() { return { at: Object.fromEntries(CATS.map(c => [c, 0])), ward: Object.fromEntries(CATS.map(c => [c, 0])), atA: 0, atI: 0, wdA: 0, wdI: 0 }; }

  function build(entries, ym, hospitals) {
    const hName = (id, fallback) => { const h = hospitals.find(x => x.id === id); return String(h ? h.name : (fallback || 'Unknown')).toUpperCase(); };
    const rows = [];
    for (let d = 1; d <= 31; d++) {      // always list days 1 to 31; days the month does not have stay at 0
      const date = ym + '-' + String(d).padStart(2, '0');
      const day = entries.filter(e => e.entry_date === date);
      const groups = new Map();
      day.forEach(e => { const k = e.hospital_id || ''; if (!groups.has(k)) groups.set(k, { hid: k, hci: hName(e.hospital_id, e.hospital_name), d: blank() }); });
      day.forEach(e => {
        const g = groups.get(e.hospital_id || '').d, c = e.member_category;
        if (!CATS.includes(c)) return;
        const isAt = e.service === 'at_post', isWd = e.service === 'ward_class';
        if (isAt) g.at[c]++; else if (isWd) g.ward[c]++;
        if (c !== 'NM' && (isAt || isWd)) {
          if (e.status === 'active') { if (isAt) g.atA++; else g.wdA++; }
          else if (e.status === 'inactive') { if (isAt) g.atI++; else g.wdI++; }
        }
      });
      if (!groups.size) rows.push({ day: d, date, hid: '', hci: '', d: null, key: '' });
      else [...groups.values()].sort((a, b) => a.hci.localeCompare(b.hci)).forEach(g => rows.push({ day: d, date, hid: g.hid, hci: g.hci, d: g.d, key: date + '|' + g.hid }));
    }
    return rows;
  }

  const num = (v) => { const n = parseInt(v, 10); return isFinite(n) && n > 0 ? n : 0; };
  /* one flat array of 29 numbers for a row, in the same column order as the sheet */
  function cells(r, man) {
    const d = r.d, m = man[r.key] || {};
    const at = CATS.map(c => d.at[c]), wd = CATS.map(c => d.ward[c]);
    const S = (a) => a.reduce((x, y) => x + y, 0);
    return [...at, S(at), d.atA, d.atI, d.atA + d.atI, ...wd, S(wd), d.wdA, d.wdI, d.wdA + d.wdI, num(m.copay), num(m.opdN), num(m.opdC)];
  }
  const TOTAL_IDX = [9, 12, 22, 25];   // columns that show a bold total

  function totals(rows, man) {
    const t = new Array(29).fill(0), byH = new Map();
    rows.forEach(r => {
      if (!r.d) return;
      const v = cells(r, man);
      v.forEach((x, i) => { t[i] += x; });
      if (!byH.has(r.hid)) byH.set(r.hid, { hci: r.hci, v: new Array(29).fill(0) });
      v.forEach((x, i) => { byH.get(r.hid).v[i] += x; });
    });
    return { grand: t, hcis: [...byH.values()].sort((a, b) => a.hci.localeCompare(b.hci)) };
  }

  const HEAD_CATS = CATS.map(c => `<th>${esc(c)}</th>`).join('');
  function head(first) {
    return `<thead>
      <tr><th rowspan="3" class="c-day">${first}</th><th rowspan="3" class="c-hci">HCI</th><th colspan="13">Inpatient (At post)</th><th colspan="13">Inpatient (Ward Class)</th><th rowspan="3">NO CO-PAY</th><th rowspan="3">No. of OPD Class Conducted</th><th rowspan="3">No. of CS During OPD Class</th></tr>
      <tr><th colspan="10">Category</th><th colspan="3">Status</th><th colspan="10">Category</th><th colspan="3">Status</th></tr>
      <tr>${HEAD_CATS}<th>TOTAL</th><th>Active</th><th>Inactive</th><th>TOTAL</th>${HEAD_CATS}<th>TOTAL</th><th>Active</th><th>Inactive</th><th>TOTAL</th></tr>
    </thead>`;
  }

  function dayRowsHtml(rows, man) {
    return rows.map((r) => {
      const dayCell = `<td class="c-day">${r.day}</td>`;
      if (!r.d) {
        const note = noteOf(man, r.date);
        return `<tr class="rpt-empty${note ? ' rpt-off' : ''}">${dayCell}<td class="c-hci c-note"><button type="button" class="hci-pick" data-note="${esc(r.date)}" aria-label="HCI status day ${r.day}">${esc(note)}</button></td>${'<td class="z">0</td>'.repeat(29)}</tr>`;
      }
      const v = cells(r, man), m = man[r.key] || {};
      const body = v.slice(0, 26).map((x, k) => `<td class="${TOTAL_IDX.includes(k) ? 'tot' : ''}${x ? '' : ' z'}">${x}</td>`).join('');
      const inp = MANUAL.map(f => `<td class="in"><input type="number" min="0" inputmode="numeric" data-k="${esc(r.key)}" data-f="${f}" value="${m[f] ? esc(m[f]) : ''}" placeholder="0" aria-label="${f} day ${r.day}"></td>`).join('');
      return `<tr>${dayCell}<td class="c-hci">${esc(r.hci)}</td>${body}${inp}</tr>`;
    }).join('');
  }
  const totRowHtml = (label, t) => `<tr class="rpt-total"><td colspan="2">${label}</td>${t.map(x => `<td class="${x ? '' : 'z'}">${x}</td>`).join('')}</tr>`;

  function hciTableHtml(t) {
    const rows = t.hcis.map((h, i) => `<tr><td class="c-day">${i + 1}</td><td class="c-hci">${esc(h.hci)}</td>${h.v.map((x, k) => `<td class="${TOTAL_IDX.includes(k) ? 'tot' : ''}${x ? '' : ' z'}">${x}</td>`).join('')}</tr>`).join('');
    return `<table class="rpt-table">${head('No.')}<tbody>${rows || '<tr><td colspan="31" class="rpt-none">No entries for this month.</td></tr>'}</tbody><tfoot>${totRowHtml('GRAND TOTAL', t.grand)}</tfoot></table>`;
  }

  function openList(ym, ctx) {
    UI.modal({
      title: 'Reports · ' + L.monthLabel(ym), headIcon: 'file', size: 'sm',
      body: `<div class="rpt-list">
        <button type="button" class="rpt-item" data-rpt="summary_inpatient">${icon('file', 20)}<span><b>Summary (Inpatient)</b><small>At post and ward class, by category and status</small></span>${icon('chevronRight', 18)}</button>
        <button type="button" class="rpt-item" data-rpt="nature_inquiry">${icon('file', 20)}<span><b>Nature of Inquiry</b><small>Number of clients per nature of inquiry, by day</small></span>${icon('chevronRight', 18)}</button>
      </div>`
    }).el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-rpt]'); if (!b) return;
      if (b.dataset.rpt === 'summary_inpatient') openSummary(ym, ctx);
      if (b.dataset.rpt === 'nature_inquiry') openInquiry(ym, ctx);
    });
  }

  async function openSummary(ym, ctx) {
    let entries, hospitals, saved;
    try { [entries, hospitals] = await Promise.all([API.entries.range('', ...L.monthBounds(ym)), API.hospitals.list()]); saved = await loadManual(ym); }
    catch (e) { UI.toast(e.message || 'Could not open the report.', 'error', 5000); return; }
    const rows = build(entries, ym, hospitals), info = monthInfo(ym, ctx.profile);
    let editing = false;
    const man = clone(saved);                                   // working copy; only written to storage on Save

    const body = document.createElement('div');
    body.innerHTML = `${metaHtml(info)}
      <div class="table-wrap rpt-wrap"><table class="rpt-table" id="rptDaily">${head('Day')}<tbody>${dayRowsHtml(rows, man)}</tbody><tfoot id="rptFoot"></tfoot></table></div>
      <div class="table-wrap rpt-wrap" id="rptHci"></div>`;

    const setEditing = (on) => { editing = on; $$('input[data-k]', body).forEach(i => { i.disabled = !on; }); $$('button[data-note]', body).forEach(i => { i.disabled = !on; }); };
    function refresh() {
      const t = totals(rows, man);
      $('#rptFoot', body).innerHTML = totRowHtml('GRAND TOTAL', t.grand);
      $('#rptHci', body).innerHTML = hciTableHtml(t);
    }
    setEditing(false);
    refresh();
    body.addEventListener('input', (ev) => {
      const i = ev.target.closest('input[data-k]'); if (!i || !editing) return;
      const v = i.value.replace(/\D/g, '');
      (man[i.dataset.k] = man[i.dataset.k] || {})[i.dataset.f] = v;
      if (!v) delete man[i.dataset.k][i.dataset.f];
      if (!Object.keys(man[i.dataset.k]).length) delete man[i.dataset.k];
      refresh();
    });
    bindNotePicker(body, man, () => editing);

    UI.modal({
      title: 'Summary (Inpatient)', headIcon: 'file', size: 'xl', className: 'modal-report', body,
      beforeClose: discardGuard(man, () => saved),
      footer: [
        { label: 'Close', className: 'btn-ghost' },
        { id: 'rptClear', label: 'Clear', className: 'btn-ghost', close: false, onClick: async () => {
          if (!editing) { UI.toast('Press Edit first.', 'info'); return false; }
          if (!Object.keys(man).some(k => k.indexOf('d|') !== 0 && MANUAL.some(f => man[k][f]))) { UI.toast('There is nothing to clear.', 'info'); return false; }
          const go = await UI.confirm({ title: 'Clear typed values?', confirmText: 'Clear', danger: true, iconName: 'alert',
            message: '<p>This clears NO CO-PAY, No. of OPD Class Conducted and No. of CS During OPD Class for this month. Press Save afterwards to keep the change. The counts from your entries are not affected.</p>' });
          if (!go) return false;
          Object.keys(man).forEach(k => { if (k.indexOf('d|') === 0) return; MANUAL.forEach(f => delete man[k][f]); if (!Object.keys(man[k]).length) delete man[k]; });
          $$('input[data-k]', body).forEach(i => { i.value = ''; });
          refresh(); UI.toast('Typed values cleared. Press Save to keep this.', 'success'); return false;
        } },
        { id: 'rptEdit', label: 'Edit', className: 'btn-ghost', close: false, onClick: async (h, b) => {
          if (!editing) {
            setEditing(true); b.textContent = 'Save'; b.className = 'btn btn-primary';
            const first = $('input[data-k]', body); if (first) first.focus({ preventScroll: true });
            return false;
          }
          try { await saveManual(ym, man); } catch (err) { UI.toast(err.message || 'Could not save.', 'error', 5000); return false; }
          saved = clone(man);
          setEditing(false); b.textContent = 'Edit'; b.className = 'btn btn-ghost';
          UI.toast('Changes saved.', 'success'); return false;
        } },
        { id: 'rptXls', label: 'Export Excel', className: 'btn-ghost', close: false, onClick: async (h, b) => {
          if (editing) { UI.toast('Press Save first, then export.', 'info'); return false; }
          if (!window.ExcelJS) { UI.toast('The Excel library did not load. Refresh the page and try again.', 'error', 5000); return false; }
          UI.setBusy(b, true);
          try {
            const tt = totals(rows, man);
            await ReportsXlsx.summary({ days: rows.map(r => ({ day: r.day, hci: r.d ? r.hci : noteOf(man, r.date), v: r.d ? cells(r, man) : null })), hcis: tt.hcis, grand: tt.grand, cats: CATS, info, ym, logo: C.LOGO_CARES });
            UI.toast('Excel file downloaded.', 'success');
          } catch (e) { UI.toast(e.message || 'Could not create the Excel file.', 'error', 5000); }
          UI.setBusy(b, false); return false;
        } },
        { id: 'rptPdf', label: 'Export PDF', className: 'btn-primary', close: false, onClick: async (h, b) => {
          if (editing) { UI.toast('Press Save first, then export.', 'info'); return false; }
          if (!window.PDFLib) { UI.toast('The PDF library did not load. Refresh the page and try again.', 'error', 5000); return false; }
          UI.setBusy(b, true);
          try { await exportPdf(rows, man, info, ym, totals(rows, man)); UI.toast('PDF downloaded.', 'success'); }
          catch (e) { UI.toast(e.message || 'Could not create the PDF.', 'error', 5000); }
          UI.setBusy(b, false); return false;
        } }
      ]
    });
  }

  /* ---------- Summary PDF: laid out like the original form ---------- */
  async function exportPdf(rows, man, info, ym, t) {
    const P = await startPdf('SUMMARY ( INPATIENT )', 'Summary (Inpatient)', info);
    const PXW = [22, 208, ...new Array(9).fill(32.3), 37, 32.3, 32.3, 32.3, ...new Array(9).fill(32.3), 37, 34, 34, 34, 32, 35, 37];
    const sc = (1217 - 28) * K / PXW.reduce((a, b) => a + b, 0);
    P.X = [L0]; PXW.forEach(w => P.X.push(P.X[P.X.length - 1] + w * sc));
    const X = P.X, HH = [10, 10, 13.5], HT = HH[0] + HH[1] + HH[2];
    const { cell, vline, hline, grid } = P;

    function header(y, first) {
      const y1 = y + HH[0], y2 = y1 + HH[1], y3 = y + HT;
      vline(X[1], y, y3, THIN); vline(X[2], y, y3, THIN); vline(X[15], y, y3, THIN); vline(X[28], y, y3, THIN); vline(X[29], y, y3, THIN); vline(X[30], y, y3, THIN);
      [2, 15].forEach(s => { vline(X[s + 10], y1, y3, THIN); grid(s, s + 12, y2, y3); });
      hline(X[2], X[28], y1, THIN); hline(X[2], X[28], y2, THIN); hline(L0, X[31], y3, THIN);
      cell(first, 0, 0, y, y3, { size: 6.4, pad: .6 }); cell('HCI', 1, 1, y, y3, { size: 6.4 });
      cell('Inpatient (At post)', 2, 14, y, y1, { size: 6.2 }); cell('Inpatient (Ward Class)', 15, 27, y, y1, { size: 6.2 });
      [['NO CO-PAY', 28], ['No. of OPD Class Conducted', 29], ['No. of CS During OPD Class', 30]].forEach(([s, c]) => cell(s, c, c, y, y3, { size: 5.8, pad: .8 }));
      [2, 15].forEach(s => {
        cell('Category', s, s + 9, y1, y2, { size: 6 }); cell('Status', s + 10, s + 12, y1, y2, { size: 6 });
        CATS.forEach((c, i) => cell(c, s + i, s + i, y2, y3, { size: 5.8, pad: .6 }));
        ['TOTAL', 'Active', 'Inactive', 'TOTAL'].forEach((l, i) => cell(l, s + 9 + i, s + 9 + i, y2, y3, { size: 5.4, pad: .5, nowrap: true }));
      });
      return y3;
    }

    const tableTop = P.top();
    let y = tableTop, yBoxTop = tableTop;
    y = header(y, 'Day');
    rows.forEach(r => {
      if (y + 2 * P.RH > PH - 24) { P.box(L0, yBoxTop, P.right(), y, THICK); P.newPage(); yBoxTop = 24; y = header(yBoxTop, 'Day'); }
      if (!r.d) P.dataRow(String(r.day), noteOf(man, r.date), new Array(29).fill(0), y, !!noteOf(man, r.date));
      else P.dataRow(String(r.day), r.hci, cells(r, man), y);
      y += P.RH;
    });
    P.totalRow(t.grand, y); y += P.RH;
    P.box(L0, yBoxTop, P.right(), y, THICK);
    y += 15;

    // HCI summary table (at least 5 rows like the form)
    const n = Math.max(5, t.hcis.length);
    if (y + HT + (n + 1) * P.RH > PH - 20) { P.newPage(); y = 24; }
    const y2top = y;
    y = header(y, 'No.');
    for (let i = 0; i < n; i++) {
      const h = t.hcis[i];
      P.dataRow(String(i + 1), h ? h.hci : '', h ? h.v : new Array(29).fill(0), y);
      y += P.RH;
    }
    P.totalRow(t.grand, y); y += P.RH;
    P.box(L0, y2top, P.right(), y, THICK);

    await P.finish(`Summary.Inpatient.${ym.slice(5, 7)}${ym.slice(0, 4)}.pdf`);
  }

  /* =====================================================================
     Report 2: Nature of Inquiry
     ===================================================================== */
  /* rows: one per day (and per hospital when it has entries). v = count per inquiry column, then TOTAL */
  function buildInq(entries, ym, hospitals, cols) {
    const idx = new Map(cols.map((c, i) => [norm(c), i]));
    entries = entries.filter(e => idx.has(norm(e.nature_of_inquiry)));   // only inquiries still in the admin list
    const hName = (id, fallback) => { const h = hospitals.find(x => x.id === id); return String(h ? h.name : (fallback || 'Unknown')).toUpperCase(); };
    const rows = [];
    for (let d = 1; d <= 31; d++) {
      const date = ym + '-' + String(d).padStart(2, '0');
      const day = entries.filter(e => e.entry_date === date);
      const groups = new Map();
      day.forEach(e => { const k = e.hospital_id || ''; if (!groups.has(k)) groups.set(k, { hid: k, hci: hName(e.hospital_id, e.hospital_name), v: new Array(cols.length + 1).fill(0) }); });
      day.forEach(e => {
        const i = idx.get(norm(e.nature_of_inquiry));
        if (i === undefined) return;
        const g = groups.get(e.hospital_id || '');
        g.v[i]++; g.v[cols.length]++;
      });
      if (!groups.size) rows.push({ day: d, date, hid: '', hci: '', v: null });
      else [...groups.values()].sort((a, b) => a.hci.localeCompare(b.hci)).forEach(g => rows.push({ day: d, date, hid: g.hid, hci: g.hci, v: g.v }));
    }
    return rows;
  }

  function totalsInq(rows, n) {
    const grand = new Array(n).fill(0), byH = new Map();
    rows.forEach(r => {
      if (!r.v) return;
      r.v.forEach((x, i) => { grand[i] += x; });
      if (!byH.has(r.hid)) byH.set(r.hid, { hci: r.hci, v: new Array(n).fill(0) });
      r.v.forEach((x, i) => { byH.get(r.hid).v[i] += x; });
    });
    return { grand, hcis: [...byH.values()].sort((a, b) => a.hci.localeCompare(b.hci)) };
  }

  function headInq(first, cols) {
    return `<thead><tr><th class="c-day">${first}</th><th class="c-hci">HCI</th>${cols.map(c => `<th class="inq-h"><div class="inq-v">${esc(c)}</div></th>`).join('')}<th>TOTAL</th></tr></thead>`;
  }
  const valCells = (v, n) => v.map((x, k) => `<td class="${k === n - 1 ? 'tot' : ''}${x ? '' : ' z'}">${x}</td>`).join('');

  function inqDailyHtml(rows, n, man) {
    return rows.map(r => {
      if (r.v) return `<tr><td class="c-day">${r.day}</td><td class="c-hci">${esc(r.hci)}</td>${valCells(r.v, n)}</tr>`;
      const note = noteOf(man, r.date);
      return `<tr class="rpt-empty${note ? ' rpt-off' : ''}"><td class="c-day">${r.day}</td><td class="c-hci c-note"><button type="button" class="hci-pick" data-note="${esc(r.date)}" disabled aria-label="HCI status day ${r.day}">${esc(note)}</button></td>${'<td class="z">0</td>'.repeat(n)}</tr>`;
    }).join('');
  }
  function inqHciHtml(t, cols) {
    const n = cols.length + 1;
    const rows = t.hcis.map((h, i) => `<tr><td class="c-day">${i + 1}</td><td class="c-hci">${esc(h.hci)}</td>${valCells(h.v, n)}</tr>`).join('');
    return `<table class="rpt-table">${headInq('No.', cols)}<tbody>${rows || `<tr><td colspan="${n + 2}" class="rpt-none">No entries for this month.</td></tr>`}</tbody><tfoot>${totRowHtml('GRAND TOTAL', t.grand)}</tfoot></table>`;
  }

  async function openInquiry(ym, ctx) {
    let entries, hospitals, settings, saved;
    try { [entries, hospitals, settings] = await Promise.all([API.entries.range('', ...L.monthBounds(ym)), API.hospitals.list(), API.settings.all()]); saved = await loadManual(ym); }
    catch (e) { UI.toast(e.message || 'Could not open the report.', 'error', 5000); return; }

    const cols = L.inquiryList(settings);
    const known = new Set(cols.map(norm));
    const n = cols.length + 1;
    const rows = buildInq(entries, ym, hospitals, cols), t = totalsInq(rows, n), info = monthInfo(ym, ctx.profile);
    let editing = false;
    const man = clone(saved);
    const skipped = entries.filter(e => e.nature_of_inquiry && !known.has(norm(e.nature_of_inquiry))).length;
    if (skipped) UI.toast(skipped + ' entr' + (skipped === 1 ? 'y uses' : 'ies use') + ' an inquiry that is no longer in the Admin list, so ' + (skipped === 1 ? 'it is' : 'they are') + ' not counted in this report.', 'warn', 9000);

    const body = document.createElement('div');
    body.innerHTML = `${metaHtml(info)}
      <div class="table-wrap rpt-wrap rpt-fill"><table class="rpt-table">${headInq('Day', cols)}<tbody>${inqDailyHtml(rows, n, man)}</tbody><tfoot>${totRowHtml('GRAND TOTAL', t.grand)}</tfoot></table></div>
      <div class="table-wrap rpt-wrap rpt-fill">${inqHciHtml(t, cols)}</div>`;
    bindNotePicker(body, man, () => editing);

    UI.modal({
      title: 'Nature of Inquiry', headIcon: 'file', size: 'xl', className: 'modal-report', body,
      beforeClose: discardGuard(man, () => saved),
      footer: [
        { label: 'Close', className: 'btn-ghost' },
        { id: 'rptEdit', label: 'Edit', className: 'btn-ghost', close: false, onClick: async (h, b) => {
          if (!editing) {
            editing = true; $$('button[data-note]', body).forEach(i => { i.disabled = false; });
            b.textContent = 'Save'; b.className = 'btn btn-primary'; return false;
          }
          try { await saveManual(ym, man); } catch (err) { UI.toast(err.message || 'Could not save.', 'error', 5000); return false; }
          saved = clone(man);
          editing = false; $$('button[data-note]', body).forEach(i => { i.disabled = true; });
          b.textContent = 'Edit'; b.className = 'btn btn-ghost';
          UI.toast('Changes saved.', 'success'); return false;
        } },
        { id: 'rptXls', label: 'Export Excel', className: 'btn-ghost', close: false, onClick: async (h, b) => {
          if (editing) { UI.toast('Press Save first, then export.', 'info'); return false; }
          if (!window.ExcelJS) { UI.toast('The Excel library did not load. Refresh the page and try again.', 'error', 5000); return false; }
          UI.setBusy(b, true);
          try { await ReportsXlsx.inquiry({ days: rows.map(r => ({ ...r, hci: r.v ? r.hci : noteOf(man, r.date) })), hcis: t.hcis, grand: t.grand, cols, info, ym, logo: C.LOGO_CARES }); UI.toast('Excel file downloaded.', 'success'); }
          catch (e) { UI.toast(e.message || 'Could not create the Excel file.', 'error', 5000); }
          UI.setBusy(b, false); return false;
        } },
        { id: 'rptPdf', label: 'Export PDF', className: 'btn-primary', close: false, onClick: async (h, b) => {
          if (editing) { UI.toast('Press Save first, then export.', 'info'); return false; }
          if (!window.PDFLib) { UI.toast('The PDF library did not load. Refresh the page and try again.', 'error', 5000); return false; }
          UI.setBusy(b, true);
          try { await exportInqPdf(rows, cols, info, ym, t, man); UI.toast('PDF downloaded.', 'success'); }
          catch (e) { UI.toast(e.message || 'Could not create the PDF.', 'error', 5000); }
          UI.setBusy(b, false); return false;
        } }
      ]
    });
  }

  async function exportInqPdf(rows, cols, info, ym, t, man) {
    const P = await startPdf('NATURE OF INQUIRY', 'Nature of Inquiry', info);
    const R0 = PW - 28 * K, n = cols.length + 1;
    const DAYW = 26, HCIW = 130, vw = (R0 - L0 - DAYW - HCIW) / n;
    P.X = [L0, L0 + DAYW, L0 + DAYW + HCIW]; for (let i = 0; i < n; i++) P.X.push(P.X[P.X.length - 1] + vw);
    const X = P.X, LASTC = n + 1;               // index of the last column
    const HT = 44, GAP = 15;
    const fitRH = (k) => ((PH - 20) - 91 * K - 2 * HT - GAP) / (rows.length + k + 2);
    let m = Math.max(t.hcis.length, 5);
    if (fitRH(m) < 9.5) m = Math.max(t.hcis.length, 4);   // only if there is no room: drop the 5th blank line
    P.RH = Math.min(10.9, fitRH(m));
    const { cell, hline, grid } = P;

    // sideways header text (reads bottom to top), at most 2 lines
    function vcell(text, c, y0, y1) {
      const maxL = (y1 - y0) - 6, txt = P.safe(text), fb = P.fb;
      let size = 6.4, lines = [];
      const wrapAt = (sz) => {
        const out = []; let cur = '';
        txt.split(' ').filter(Boolean).forEach(w => { const tt = cur ? cur + ' ' + w : w; if (fb.widthOfTextAtSize(tt, sz) <= maxL || !cur) cur = tt; else { out.push(cur); cur = w; } });
        if (cur) out.push(cur); return out;
      };
      lines = wrapAt(size);
      while ((lines.length > 2 || Math.max(0, ...lines.map(l => fb.widthOfTextAtSize(l, size))) > maxL) && size > 3.4) { size -= .3; lines = wrapAt(size); }
      const lh = size * 1.15, cx = (X[c] + X[c + 1]) / 2, mid = P.Yt((y0 + y1) / 2);
      lines.forEach((l, i) => {
        const w = fb.widthOfTextAtSize(l, size);
        P.page.drawText(l, { x: cx + (i - (lines.length - 1) / 2) * lh + size * .34, y: mid - w / 2, size, font: fb, color: P.black, rotate: PDFLib.degrees(90) });
      });
    }
    function header(y, first) {
      const y1 = y + HT; grid(0, LASTC, y, y1); hline(L0, P.right(), y1, THIN);
      cell(first, 0, 0, y, y1, { size: 6.4, pad: .6 }); cell('HCI', 1, 1, y, y1, { size: 6.4 });
      cols.forEach((c, i) => vcell(c, 2 + i, y, y1));
      cell('TOTAL', LASTC, LASTC, y, y1, { size: 6.4, nowrap: true });
      return y1;
    }

    const tableTop = P.top();
    let y = tableTop;
    y = header(y, 'Day');
    rows.forEach(r => {
      if (!r.v) P.dataRow(String(r.day), noteOf(man, r.date), new Array(n).fill(0), y, !!noteOf(man, r.date));
      else P.dataRow(String(r.day), r.hci, r.v, y);
      y += P.RH;
    });
    P.totalRow(t.grand, y); y += P.RH;
    P.box(L0, tableTop, P.right(), y, THICK);
    y += GAP;

    // HCI summary table
    const y2top = y;
    y = header(y, 'No.');
    for (let i = 0; i < m; i++) {
      const h = t.hcis[i];
      P.dataRow(String(i + 1), h ? h.hci : '', h ? h.v : new Array(n).fill(0), y);
      y += P.RH;
    }
    P.totalRow(t.grand, y); y += P.RH;
    P.box(L0, y2top, P.right(), y, THICK);

    await P.finish(`NatureOfInquiry.${ym.slice(5, 7)}${ym.slice(0, 4)}.pdf`);
  }

  window.Reports = { openList };
})();
