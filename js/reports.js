/* Reports: list of reports for one month (opened from Monthly Log Sheet → Report).
   Report 1: Summary (Inpatient). Numbers come from the saved entries; only NO CO-PAY, OPD classes conducted
   and CS during OPD class are typed by the user (saved on this laptop, per month). Export PDF = landscape A4. */
(function () {
  const L = Logic, C = APP_CONFIG, { $, $$, esc, icon } = UI;
  const CATS = L.CAT_CODES;
  const MANUAL = ['copay', 'opdN', 'opdC'];
  const MKEY = (ym) => 'pc_report_manual_' + ym;

  function loadManual(ym) { try { return JSON.parse(localStorage.getItem(MKEY(ym)) || '{}') || {}; } catch (e) { return {}; } }
  function saveManual(ym, obj) { try { localStorage.setItem(MKEY(ym), JSON.stringify(obj)); } catch (e) {} }

  /* ---------- build the report data from the entries ---------- */
  function blank() { return { at: Object.fromEntries(CATS.map(c => [c, 0])), ward: Object.fromEntries(CATS.map(c => [c, 0])), atA: 0, atI: 0, wdA: 0, wdI: 0 }; }

  function build(entries, ym, hospitals) {
    const hName = (id, fallback) => { const h = hospitals.find(x => x.id === id); return h ? (h.short_name || h.name) : (fallback || 'Unknown'); };
    const last = +L.monthBounds(ym)[1].slice(8, 10);
    const rows = [];
    for (let d = 1; d <= last; d++) {
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

  /* one flat array of 31 numbers/strings for a row, in the same column order as the sheet */
  function cells(r, man) {
    const d = r.d, m = man[r.key] || {};
    const at = CATS.map(c => d.at[c]), wd = CATS.map(c => d.ward[c]);
    const S = (a) => a.reduce((x, y) => x + y, 0);
    return [...at, S(at), d.atA, d.atI, d.atA + d.atI, ...wd, S(wd), d.wdA, d.wdI, d.wdA + d.wdI, num(m.copay), num(m.opdN), num(m.opdC)];
  }
  const num = (v) => { const n = parseInt(v, 10); return isFinite(n) && n > 0 ? n : 0; };
  const TOTAL_IDX = [9, 12, 22, 25];   // columns that show a number whenever the row has an HCI

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

  /* ---------- on-screen table ---------- */
  const HEAD_CATS = CATS.map(c => `<th>${esc(c)}</th>`).join('');
  function head(first) {
    return `<thead>
      <tr><th rowspan="3" class="c-day">${first}</th><th rowspan="3" class="c-hci">HCI</th><th colspan="13">Inpatient (At post)</th><th colspan="13">Inpatient (Ward Class)</th><th rowspan="3">NO CO-PAY</th><th rowspan="3">No. of OPD Class Conducted</th><th rowspan="3">No. of CS During OPD Class</th></tr>
      <tr><th colspan="10">Category</th><th colspan="3">Status</th><th colspan="10">Category</th><th colspan="3">Status</th></tr>
      <tr>${HEAD_CATS}<th>TOTAL</th><th>Active</th><th>Inactive</th><th>TOTAL</th>${HEAD_CATS}<th>TOTAL</th><th>Active</th><th>Inactive</th><th>TOTAL</th></tr>
    </thead>`;
  }
  const show = (v, always) => (v || always) ? v : '';

  function dayRowsHtml(rows, man) {
    return rows.map((r, i) => {
      const dayCell = `<td class="c-day">${r.day}</td>`;
      if (!r.d) return `<tr class="rpt-empty">${dayCell}<td class="c-hci"></td>${'<td></td>'.repeat(26)}${'<td></td>'.repeat(3)}</tr>`;
      const v = cells(r, man), m = man[r.key] || {};
      const body = v.slice(0, 26).map((x, k) => `<td class="${TOTAL_IDX.includes(k) ? 'tot' : ''}">${show(x, TOTAL_IDX.includes(k))}</td>`).join('');
      const inp = MANUAL.map(f => `<td class="in"><input type="number" min="0" inputmode="numeric" data-k="${esc(r.key)}" data-f="${f}" value="${m[f] ? esc(m[f]) : ''}" aria-label="${f} day ${r.day}"></td>`).join('');
      return `<tr>${dayCell}<td class="c-hci">${esc(r.hci)}</td>${body}${inp}</tr>`;
    }).join('');
  }
  const totRowHtml = (label, t) => `<tr class="rpt-total"><td colspan="2">${label}</td>${t.map(x => `<td>${x}</td>`).join('')}</tr>`;

  function hciTableHtml(t) {
    const rows = t.hcis.map((h, i) => `<tr><td class="c-day">${i + 1}</td><td class="c-hci">${esc(h.hci)}</td>${h.v.map((x, k) => `<td class="${TOTAL_IDX.includes(k) ? 'tot' : ''}">${x}</td>`).join('')}</tr>`).join('');
    return `<table class="rpt-table">${head('No.')}<tbody>${rows || '<tr><td colspan="31" class="rpt-none">No entries for this month.</td></tr>'}</tbody><tfoot>${totRowHtml('GRAND TOTAL', t.grand)}</tfoot></table>`;
  }

  /* ---------- modals ---------- */
  function monthInfo(ym, profile) {
    const [from, to] = L.monthBounds(ym);
    const mon = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1).toLocaleDateString('en-US', { month: 'long' });
    return {
      name: String(profile.full_name || '').toUpperCase(),
      month: mon + ' ' + ym.slice(0, 4),
      covered: mon + ' 1 to ' + (+to.slice(8, 10)) + ', ' + ym.slice(0, 4)
    };
  }

  function openList(ym, ctx) {
    UI.modal({
      title: 'Reports · ' + L.monthLabel(ym), headIcon: 'file', size: 'sm',
      body: `<div class="rpt-list"><button type="button" class="rpt-item" data-rpt="summary_inpatient">${icon('file', 20)}<span><b>Summary (Inpatient)</b><small>At post and ward class, by category and status</small></span>${icon('chevronRight', 18)}</button></div>`
    }).el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-rpt]'); if (!b) return;
      if (b.dataset.rpt === 'summary_inpatient') openSummary(ym, ctx);
    });
  }

  async function openSummary(ym, ctx) {
    let entries, hospitals;
    try { [entries, hospitals] = await Promise.all([API.entries.range('', ...L.monthBounds(ym)), API.hospitals.list()]); }
    catch (e) { UI.toast(e.message || 'Could not open the report.', 'error', 5000); return; }
    const rows = build(entries, ym, hospitals), man = loadManual(ym), info = monthInfo(ym, ctx.profile);

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="rpt-meta"><div><span>Name of P-CARES</span><b>${esc(info.name)}</b></div><div><span>Month</span><b>${esc(info.month)}</b></div><div><span>Date/s Covered</span><b>${esc(info.covered)}</b></div></div>
      <div class="table-wrap rpt-wrap"><table class="rpt-table" id="rptDaily">${head('Day')}<tbody>${dayRowsHtml(rows, man)}</tbody><tfoot id="rptFoot"></tfoot></table></div>
      <div class="table-wrap rpt-wrap" id="rptHci"></div>`;

    function refresh() {
      const t = totals(rows, man);
      $('#rptFoot', body).innerHTML = totRowHtml('GRAND TOTAL', t.grand);
      $('#rptHci', body).innerHTML = hciTableHtml(t);
    }
    refresh();
    body.addEventListener('input', (ev) => {
      const i = ev.target.closest('input[data-k]'); if (!i) return;
      const v = i.value.replace(/\D/g, '');
      (man[i.dataset.k] = man[i.dataset.k] || {})[i.dataset.f] = v;
      if (!v) delete man[i.dataset.k][i.dataset.f];
      if (!Object.keys(man[i.dataset.k]).length) delete man[i.dataset.k];
      saveManual(ym, man); refresh();
    });

    UI.modal({
      title: 'Summary (Inpatient)', headIcon: 'file', size: 'xl', className: 'modal-report', body,
      footer: [
        { label: 'Close', className: 'btn-ghost' },
        { id: 'rptClear', label: 'Clear', className: 'btn-ghost', close: false, onClick: async () => {
          if (!Object.keys(man).length) { UI.toast('There is nothing to clear.', 'info'); return false; }
          const go = await UI.confirm({ title: 'Clear typed values?', confirmText: 'Clear', danger: true, iconName: 'alert',
            message: '<p>This clears NO CO-PAY, No. of OPD Class Conducted and No. of CS During OPD Class for this month. The counts from your entries are not affected.</p>' });
          if (!go) return false;
          Object.keys(man).forEach(k => delete man[k]); saveManual(ym, man);
          $$('input[data-k]', body).forEach(i => { i.value = ''; });
          refresh(); UI.toast('Typed values cleared.', 'success'); return false;
        } },
        { id: 'rptPdf', label: 'Export PDF', className: 'btn-primary', close: false, onClick: async (h, b) => {
          if (!window.PDFLib) { UI.toast('The PDF library did not load. Check your internet connection and try again.', 'error', 5000); return false; }
          UI.setBusy(b, true);
          try { await exportPdf(rows, man, info, ym, totals(rows, man)); UI.toast('PDF downloaded.', 'success'); }
          catch (e) { UI.toast(e.message || 'Could not create the PDF.', 'error', 5000); }
          UI.setBusy(b, false); return false;
        } }
      ]
    });
  }

  /* ---------- PDF (A4 landscape) ---------- */
  async function exportPdf(rows, man, info, ym, t) {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const doc = await PDFDocument.create();
    const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
    doc.setTitle('Summary (Inpatient) · ' + info.month); doc.setProducer(C.APP_NAME); doc.setCreator(C.APP_NAME);
    const PW = 841.89, PH = 595.28, M = 22, black = rgb(0, 0, 0), shade = rgb(.9, .9, .9);
    const safe = (s, font) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().split('').map(ch => { try { font.widthOfTextAtSize(ch, 8); return ch; } catch (e) { return '?'; } }).join('');

    // column widths: Day, HCI, 26 data columns, 3 manual columns
    const wDay = 22, wHci = 38, wMan = 31, wData = (PW - 2 * M - wDay - wHci - 3 * wMan) / 26;
    const W = [wDay, wHci, ...new Array(26).fill(wData), wMan, wMan, wMan];
    const X = [M]; W.forEach(w => X.push(X[X.length - 1] + w));
    const RH = 10, HH = 11;

    let page = doc.addPage([PW, PH]);
    const Yt = (y) => PH - y;                                  // y from top
    function line(x0, y0, x1, y1, th = .5) { page.drawLine({ start: { x: x0, y: Yt(y0) }, end: { x: x1, y: Yt(y1) }, thickness: th, color: black }); }
    function cell(text, c0, c1, y0, y1, o = {}) {              // c0..c1 = column indexes (inclusive), centered text, wraps to fit
      const x0 = X[c0], x1 = X[c1 + 1], font = o.bold ? fb : f; let size = o.size || 6.2;
      const maxW = x1 - x0 - 2;
      if (o.fill) page.drawRectangle({ x: x0, y: Yt(y1), width: x1 - x0, height: y1 - y0, color: shade });
      page.drawRectangle({ x: x0, y: Yt(y1), width: x1 - x0, height: y1 - y0, borderColor: black, borderWidth: .5 });
      const words = o.nowrap ? [safe(text, font)] : safe(text, font).split(' ').filter(Boolean), lines = []; let cur = '';
      words.forEach(w => { const tt = cur ? cur + ' ' + w : w; if (font.widthOfTextAtSize(tt, size) <= maxW || !cur) cur = tt; else { lines.push(cur); cur = w; } });
      if (cur) lines.push(cur);
      const widest = Math.max(0, ...lines.map(l => font.widthOfTextAtSize(l, size)));
      if (widest > maxW) size = Math.max(3.6, size * maxW / widest);
      const lh = size * 1.15, cy = Yt((y0 + y1) / 2);
      lines.forEach((l, i) => page.drawText(l, { x: x0 + (x1 - x0 - font.widthOfTextAtSize(l, size)) / 2, y: cy + ((lines.length - 1) / 2 - i) * lh - size * .34, size, font, color: black }));
    }
    function header(y, first) {
      const y1 = y + HH, y2 = y + 2 * HH, y3 = y + 3 * HH;
      cell(first, 0, 0, y, y3, { bold: true, fill: true }); cell('HCI', 1, 1, y, y3, { bold: true, fill: true });
      cell('Inpatient (At post)', 2, 14, y, y1, { bold: true, fill: true }); cell('Inpatient (Ward Class)', 15, 27, y, y1, { bold: true, fill: true });
      [['NO CO-PAY', 28], ['No. of OPD Class Conducted', 29], ['No. of CS During OPD Class', 30]].forEach(([s, c]) => cell(s, c, c, y, y3, { bold: true, fill: true, size: 5.4 }));
      [2, 15].forEach(s => { cell('Category', s, s + 9, y1, y2, { bold: true, fill: true }); cell('Status', s + 10, s + 12, y1, y2, { bold: true, fill: true }); });
      [2, 15].forEach(s => {
        CATS.forEach((c, i) => cell(c, s + i, s + i, y2, y3, { bold: true, fill: true, size: 5.6 }));
        ['TOTAL', 'Active', 'Inactive', 'TOTAL'].forEach((l, i) => cell(l, s + 9 + i, s + 9 + i, y2, y3, { bold: true, fill: true, size: 5.4 }));
      });
      return y3;
    }
    function rowOut(first, hci, vals, y, o = {}) {
      cell(first, 0, 0, y, y + RH, o); cell(hci, 1, 1, y, y + RH, { ...o, nowrap: true });
      vals.forEach((v, i) => cell(v === '' ? '' : String(v), 2 + i, 2 + i, y, y + RH, { ...o, bold: o.bold || (o.totCols && TOTAL_IDX.includes(i)) }));
    }

    // title block
    const title = 'SUMMARY ( INPATIENT )', tw = fb.widthOfTextAtSize(title, 12);
    page.drawText(title, { x: (PW - tw) / 2, y: Yt(M + 10), size: 12, font: fb, color: black });
    const sub = `Name of P-CARES:  ${safe(info.name, f)}        Month:  ${safe(info.month, f)}        Date/s Covered:  ${safe(info.covered, f)}`;
    page.drawText(sub, { x: M, y: Yt(M + 28), size: 8, font: f, color: black });

    // daily table
    let y = header(M + 36, 'Day');
    rows.forEach(r => {
      if (y + 2 * RH > PH - M) { page = doc.addPage([PW, PH]); y = header(M, 'Day'); }   // keep room for the grand total
      if (!r.d) rowOut(String(r.day), '', new Array(29).fill(''), y);
      else { const v = cells(r, man); rowOut(String(r.day), r.hci, v.map((x, i) => (x || TOTAL_IDX.includes(i)) ? x : ''), y, { totCols: true }); }
      y += RH;
    });
    const tot = (label, arr, yy) => { cell(label, 0, 1, yy, yy + RH, { bold: true, fill: true }); arr.forEach((v, i) => cell(String(v), 2 + i, 2 + i, yy, yy + RH, { bold: true, fill: true })); };
    tot('GRAND TOTAL', t.grand, y); y += RH + 14;

    // HCI summary table (new page if it does not fit)
    const need = 3 * HH + (t.hcis.length + 1) * RH;
    if (y + need > PH - M) { page = doc.addPage([PW, PH]); y = M; }
    y = header(y, 'No.');
    t.hcis.forEach((h, i) => { rowOut(String(i + 1), h.hci, h.v, y, { totCols: true }); y += RH; });
    tot('GRAND TOTAL', t.grand, y);

    const bytes = await doc.save();
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a'); a.href = url; a.download = `Summary.Inpatient.${ym.slice(5, 7)}${ym.slice(0, 4)}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  window.Reports = { openList };
})();
