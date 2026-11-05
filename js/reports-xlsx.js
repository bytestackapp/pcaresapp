/* Excel export for the monthly reports. Same layout as the PDFs (A4 landscape, Times New Roman bold,
   same column widths and row heights in points). Used by reports.js. */
(function () {
  const K = 841.92 / 1280, FONT = 'Times New Roman', RH = 10.9;
  const BLACK = 'FF000000', GRAY = 'FF808080';
  const thin = { style: 'thin', color: { argb: BLACK } }, med = { style: 'medium', color: { argb: BLACK } };
  const wChars = (pt) => Math.max(1, (pt / 0.75 - 5) / 7);   // points to Excel column width

  const starts = (w) => { const s = [0]; w.forEach(x => s.push(s[s.length - 1] + x)); return s; };
  function colNear(w, x) { const s = starts(w); let best = 1; s.forEach((v, i) => { if (Math.abs(v - x) < Math.abs(s[best - 1] - x)) best = i + 1; }); return best; }
  function colPos(w, x) { const s = starts(w); for (let i = 0; i < w.length; i++) if (x < s[i + 1]) return i + (x - s[i]) / w[i]; return w.length - 0.5; }

  function mergeRange(ws, r1, c1, r2, c2) {
    if (ws.mergeCellsWithoutStyle) ws.mergeCellsWithoutStyle(r1, c1, r2, c2); else ws.mergeCells(r1, c1, r2, c2);
  }

  /* writes a value into a cell (or merged block) with the report font and alignment */
  function put(ws, r1, c1, r2, c2, value, o = {}) {
    const wrap = !!o.wrap, rot = o.rot || 0;
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(r, c);
      cell.font = { name: FONT, bold: true, size: o.size || 6, color: { argb: o.gray ? GRAY : BLACK } };
      cell.alignment = { horizontal: o.left ? 'left' : 'center', vertical: 'middle', wrapText: wrap, textRotation: rot, shrinkToFit: !wrap && !rot && o.shrink !== false, indent: o.indent || 0 };
      if (o.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF808080' } };
    }
    ws.getCell(r1, c1).value = value;
    if (r2 > r1 || c2 > c1) mergeRange(ws, r1, c1, r2, c2);
  }

  /* borders: thin lines inside (when inner), thick line around the outside */
  function outline(ws, r1, c1, r2, c2, inner) {
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
      const b = {}, t = r === r1 ? med : inner ? thin : null, bt = r === r2 ? med : inner ? thin : null,
        l = c === c1 ? med : inner ? thin : null, rt = c === c2 ? med : inner ? thin : null;
      if (t) b.top = t; if (bt) b.bottom = bt; if (l) b.left = l; if (rt) b.right = rt;
      ws.getCell(r, c).border = b;
    }
  }

  function setup(ws, w, onePage) {
    w.forEach((x, i) => { ws.getColumn(i + 1).width = wChars(x); });
    ws.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: onePage ? 1 : 0, horizontalCentered: true,
      margins: { left: .3, right: .3, top: .4, bottom: .4, header: .2, footer: .2 } };
  }

  async function addLogo(wb, ws, url, w) {
    try {
      const res = await fetch(url); if (!res.ok) return;
      const buf = await res.arrayBuffer(), dv = new DataView(buf);
      if (dv.getUint32(0) !== 0x89504E47) return;
      const iw = dv.getUint32(16), ih = dv.getUint32(20);
      let wpx = 160, hpx = wpx * ih / iw;
      if (hpx > 50) { hpx = 50; wpx = hpx * iw / ih; }
      const u8 = new Uint8Array(buf); let bin = '';
      for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
      const id = wb.addImage({ base64: 'data:image/png;base64,' + btoa(bin), extension: 'png' });
      ws.addImage(id, { tl: { col: colPos(w, 860 * K), row: Math.max(0, (53 - hpx) / 2 / 53) }, ext: { width: wpx, height: hpx } });
    } catch (e) { /* the report is still fine without the logo */ }
  }

  /* title, name / month / dates box. Returns the row where the table starts. */
  function topBlock(ws, w, title, info) {
    const n = w.length, k = (px) => colNear(w, px * K);
    ws.getRow(1).height = 40; ws.getRow(2).height = 12; ws.getRow(3).height = 5;
    put(ws, 1, 1, 1, Math.min(n, Math.max(2, k(1028)) - 1), title, { size: 10.6, shrink: false });
    const m = Math.min(Math.max(2, k(349)), n - 1), d = Math.min(Math.max(m + 1, k(510)), n);
    put(ws, 2, 1, 2, m - 1, 'Name of P-CARES: ' + info.name, { size: 6.6, left: true });
    put(ws, 2, m, 2, d - 1, 'Month: ' + info.month, { size: 6.6, left: true });
    put(ws, 2, d, 2, n, 'Date/s Covered: ' + info.covered, { size: 6.6, left: true });
    outline(ws, 2, 1, 2, n, false);
    return 4;
  }

  function dataRow(ws, r, first, hci, vals, c0, off) {
    const f = off ? { fill: true } : {};
    put(ws, r, 1, r, 1, first, { left: true, ...f });
    put(ws, r, 2, r, 2, hci, { left: true, indent: 2, ...f });
    vals.forEach((v, i) => put(ws, r, c0 + i, r, c0 + i, v || 0, { gray: !v && !off, ...f }));
    ws.getRow(r).height = RH;
  }
  function totalRow(ws, r, arr, c0) {
    put(ws, r, 1, r, 2, 'GRAND TOTAL', { left: true, size: 6.2, indent: 1 });
    arr.forEach((v, i) => put(ws, r, c0 + i, r, c0 + i, v || 0, { gray: !v }));
    ws.getRow(r).height = RH;
  }

  async function save(wb, name) {
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ===================== Summary (Inpatient) ===================== */
  function headSummary(ws, r, first, cats) {
    put(ws, r, 1, r + 2, 1, first, { size: 6.4 });
    put(ws, r, 2, r + 2, 2, 'HCI', { size: 6.4 });
    put(ws, r, 3, r, 15, 'Inpatient (At post)', { size: 6.2 });
    put(ws, r, 16, r, 28, 'Inpatient (Ward Class)', { size: 6.2 });
    [['NO CO-PAY', 29], ['No. of OPD Class Conducted', 30], ['No. of CS During OPD Class', 31]].forEach(([s, c]) => put(ws, r, c, r + 2, c, s, { size: 5.8, wrap: true }));
    [3, 16].forEach(s => {
      put(ws, r + 1, s, r + 1, s + 9, 'Category', { size: 6 });
      put(ws, r + 1, s + 10, r + 1, s + 12, 'Status', { size: 6 });
      cats.forEach((c, i) => put(ws, r + 2, s + i, r + 2, s + i, c, { size: 5.8 }));
      ['TOTAL', 'Active', 'Inactive', 'TOTAL'].forEach((l, i) => put(ws, r + 2, s + 9 + i, r + 2, s + 9 + i, l, { size: 5.4 }));
    });
    ws.getRow(r).height = 10; ws.getRow(r + 1).height = 10; ws.getRow(r + 2).height = 13.5;
    return r + 3;
  }

  async function summary(o) {
    const wb = new ExcelJS.Workbook(); wb.creator = 'PCaresApp';
    const ws = wb.addWorksheet('Summary (Inpatient)', { views: [{ showGridLines: false }] });
    const PXW = [22, 208, ...new Array(9).fill(32.3), 37, 32.3, 32.3, 32.3, ...new Array(9).fill(32.3), 37, 34, 34, 34, 32, 35, 37];
    const w = PXW.map(p => p * K), zeros = new Array(29).fill(0);
    setup(ws, w, false);
    let r = topBlock(ws, w, 'SUMMARY ( INPATIENT )', o.info);
    const t1 = r;
    r = headSummary(ws, r, 'Day', o.cats);
    o.days.forEach(d => { dataRow(ws, r, d.day, d.hci, d.v || zeros, 3, !d.v && !!d.hci); r++; });
    totalRow(ws, r, o.grand, 3); outline(ws, t1, 1, r, 31, true); r++;
    ws.getRow(r).height = 15; r++;
    const t2 = r;
    r = headSummary(ws, r, 'No.', o.cats);
    const m = Math.max(5, o.hcis.length);
    for (let i = 0; i < m; i++) { const h = o.hcis[i]; dataRow(ws, r, i + 1, h ? h.hci : '', h ? h.v : zeros, 3); r++; }
    totalRow(ws, r, o.grand, 3); outline(ws, t2, 1, r, 31, true);
    await addLogo(wb, ws, o.logo, w);
    await save(wb, `Summary.Inpatient.${o.ym.slice(5, 7)}${o.ym.slice(0, 4)}.xlsx`);
  }

  /* ===================== Nature of Inquiry ===================== */
  function headInq(ws, r, first, cols) {
    const n = cols.length + 1;
    put(ws, r, 1, r, 1, first, { size: 6.4 });
    put(ws, r, 2, r, 2, 'HCI', { size: 6.4 });
    cols.forEach((c, i) => put(ws, r, 3 + i, r, 3 + i, c, { size: 6.4, rot: 90, wrap: true }));
    put(ws, r, n + 2, r, n + 2, 'TOTAL', { size: 6.4 });
    ws.getRow(r).height = 44;
    return r + 1;
  }

  async function inquiry(o) {
    const wb = new ExcelJS.Workbook(); wb.creator = 'PCaresApp';
    const ws = wb.addWorksheet('Nature of Inquiry', { views: [{ showGridLines: false }] });
    const n = o.cols.length + 1, last = n + 2;
    const vw = (841.92 - 2 * 28 * K - 156) / n;
    const w = [26, 130]; for (let i = 0; i < n; i++) w.push(vw);
    const zeros = new Array(n).fill(0);
    setup(ws, w, true);
    let r = topBlock(ws, w, 'NATURE OF INQUIRY', o.info);
    const t1 = r;
    r = headInq(ws, r, 'Day', o.cols);
    o.days.forEach(d => { dataRow(ws, r, d.day, d.hci, d.v || zeros, 3, !d.v && !!d.hci); r++; });
    totalRow(ws, r, o.grand, 3); outline(ws, t1, 1, r, last, true); r++;
    ws.getRow(r).height = 15; r++;
    const t2 = r;
    r = headInq(ws, r, 'No.', o.cols);
    const m = Math.max(5, o.hcis.length);
    for (let i = 0; i < m; i++) { const h = o.hcis[i]; dataRow(ws, r, i + 1, h ? h.hci : '', h ? h.v : zeros, 3); r++; }
    totalRow(ws, r, o.grand, 3); outline(ws, t2, 1, r, last, true);
    await addLogo(wb, ws, o.logo, w);
    await save(wb, `NatureOfInquiry.${o.ym.slice(5, 7)}${o.ym.slice(0, 4)}.xlsx`);
  }

  window.ReportsXlsx = { summary, inquiry };
})();