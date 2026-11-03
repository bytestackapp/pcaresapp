/* PDF export — redraws the two official sheets (A4 portrait) with the day's data.
   Layout numbers below are pixel positions measured from the original forms at 909px page width. */
(function () {
  const K = 595.2 / 909, PW = 595.2, PH = 841.68;
  const X = (v) => v * K, Y = (v) => PH - v * K;
  const GRID = 0.7, OUT = 1;

  async function generate({ days, sheets, hospital, logo, appName, rowsPerPage }) {
    const { PDFDocument, StandardFonts, rgb, degrees } = PDFLib;
    const L = Logic, N = rowsPerPage || 15;
    const doc = await PDFDocument.create();
    const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
    const ft = await doc.embedFont(StandardFonts.TimesRomanBold);
    let fn = f, fnb = fb;   // Arial Narrow (falls back to Helvetica if the font files are missing)
    try {
      doc.registerFontkit(fontkit);
      const [r1, r2] = await Promise.all([fetch('/fonts/arialn.ttf'), fetch('/fonts/arialnb.ttf')]);
      if (r1.ok && r2.ok) {
        fn = await doc.embedFont(await r1.arrayBuffer(), { subset: true });
        fnb = await doc.embedFont(await r2.arrayBuffer(), { subset: true });
      }
    } catch (e) { fn = f; fnb = fb; }
    doc.setTitle('Log sheet · ' + hospital); doc.setProducer(appName || 'LogSheet'); doc.setCreator(appName || 'LogSheet');
    const black = rgb(0, 0, 0), gray = rgb(.45, .45, .45);

    let logoImg = null;
    try {
      const res = await fetch(logo); if (res.ok) {
        const buf = await res.arrayBuffer(), b = new Uint8Array(buf);
        logoImg = (b[0] === 0x89 && b[1] === 0x50) ? await doc.embedPng(buf) : await doc.embedJpg(buf);
      }
    } catch (e) { logoImg = null; }

    const safe = (s, font) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().split('').map(ch => { try { font.widthOfTextAtSize(ch, 10); return ch; } catch (e) { return '?'; } }).join('');

    function wrap(str, font, size, maxW, maxLines) {
      const words = safe(str, font).split(' '), lines = []; let cur = '';
      const push = () => { if (cur) lines.push(cur); cur = ''; };
      for (let w of words) {
        while (font.widthOfTextAtSize(w, size) > maxW) {            // break very long words
          let i = w.length; while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > maxW) i--;
          if (cur) push(); lines.push(w.slice(0, i)); w = w.slice(i);
        }
        const t = cur ? cur + ' ' + w : w;
        if (font.widthOfTextAtSize(t, size) <= maxW) cur = t; else { push(); cur = w; }
      }
      push();
      if (lines.length > maxLines) { lines.length = maxLines; let l = lines[maxLines - 1]; while (l.length > 1 && font.widthOfTextAtSize(l + '…', size) > maxW) l = l.slice(0, -1); lines[maxLines - 1] = l + '...'; }
      return lines;
    }

    function drawing(page) {
      const hl = (x0, x1, y, t = GRID) => page.drawLine({ start: { x: X(x0), y: Y(y) }, end: { x: X(x1), y: Y(y) }, thickness: t, color: black });
      const vl = (x, y0, y1, t = GRID) => page.drawLine({ start: { x: X(x), y: Y(y0) }, end: { x: X(x), y: Y(y1) }, thickness: t, color: black });
      const box = (x0, y0, x1, y1, t = OUT) => page.drawRectangle({ x: X(x0), y: Y(y1), width: X(x1) - X(x0), height: (y1 - y0) * K, borderColor: black, borderWidth: t });
      // text inside a cell. align: center | left
      function txt(str, x0, y0, x1, y1, o = {}) {
        let size = o.size || 8; const font = o.narrow ? (o.bold ? fnb : fn) : (o.bold ? fb : f), pad = o.pad == null ? 3 : o.pad, align = o.align || 'center';
        const maxW = X(x1) - X(x0) - pad * 2;
        let lines;
        if (o.nowrap || String(str).includes('\n')) {          // fixed lines: shrink the text to fit the cell
          lines = String(str == null ? '' : str).split('\n').map(l => safe(l, font));
          const widest = Math.max(...lines.map(l => font.widthOfTextAtSize(l, size)));
          if (widest > maxW && widest > 0) size = Math.max(4.4, size * maxW / widest);
        } else lines = wrap(str, font, size, maxW, o.maxLines || 3);
        const lh = size * 1.18, cy = (Y(y0) + Y(y1)) / 2;
        lines.forEach((ln, i) => {
          const w = font.widthOfTextAtSize(ln, size);
          const x = align === 'left' ? X(x0) + pad : X(x0) + (X(x1) - X(x0) - w) / 2;
          const y = cy + ((lines.length - 1) / 2 - i) * lh - size * 0.34;
          page.drawText(ln, { x, y, size, font, color: black });
        });
      }
      function vtxt(str, x0, y0, x1, y1, o = {}) {
        const size = o.size || 8, font = o.narrow ? (o.bold ? fnb : fn) : (o.bold ? fb : f), w = font.widthOfTextAtSize(str, size);
        page.drawText(str, { x: (X(x0) + X(x1)) / 2 + size * 0.34, y: (Y(y0) + Y(y1)) / 2 - w / 2, size, font, color: black, rotate: degrees(90) });
      }
      function check(x0, y0, x1, y1) {
        const cx = (X(x0) + X(x1)) / 2, cy = (Y(y0) + Y(y1)) / 2, t = 1.3;
        page.drawLine({ start: { x: cx - 3.6, y: cy - 0.2 }, end: { x: cx - 1.1, y: cy - 2.9 }, thickness: t, color: black });
        page.drawLine({ start: { x: cx - 1.1, y: cy - 2.9 }, end: { x: cx + 3.8, y: cy + 3.2 }, thickness: t, color: black });
      }
      // dashed line with NOTHING FOLLOWS in the middle, drawn across the row y0..y1
      function nothing(x0, x1, y0, y1) {
        const cy = (Y(y0) + Y(y1)) / 2, cx = (X(x0) + X(x1)) / 2, size = 12, t = 'NOTHING FOLLOWS', w = ft.widthOfTextAtSize(t, size);
        page.drawLine({ start: { x: X(x0), y: cy }, end: { x: X(x1), y: cy }, thickness: 0.8, color: black, dashArray: [3, 2] });
        page.drawRectangle({ x: cx - w / 2 - 3, y: cy - size * 0.45, width: w + 6, height: size * 0.95, color: rgb(1, 1, 1) });
        page.drawText(t, { x: cx - w / 2, y: cy - size * 0.32, size, font: ft, color: black });
      }
      return { hl, vl, box, txt, vtxt, check, nothing };
    }

    const sigImgs = {};
    const fmtShort = (s) => s ? String(s).slice(5, 7) + '/' + String(s).slice(8, 10) + '/' + String(s).slice(0, 4) : '';
    const parts = (cn, date) => { const p = String(cn || '').split('-'); return [p[0] || date.slice(0, 4), p[1] || date.slice(5, 7), p[2] || '']; };

    /* ============ SHEET 1 — P-CARES log ============ */
    function sheet1(day, pageIdx, pageCount) {
      const page = doc.addPage([PW, PH]); const d = drawing(page);
      const sh = day.sheet || {};
      // title strip
      d.box(30, 30, 840, 59); [160, 538, 680].forEach(x => d.vl(x, 30, 59));
      d.txt('Name of P-CARES', 30, 30, 160, 59, { bold: true, size: 8.4, narrow: true });
      d.txt(String(sh.pcare_name || '').toUpperCase(), 160, 30, 538, 59, { size: 9, align: 'left', pad: 6, nowrap: true });
      d.txt('Date', 538, 30, 680, 59, { bold: true, size: 8.4, narrow: true });
      d.txt(L.fmtDate(day.date, 'long').toUpperCase(), 680, 30, 840, 59, { size: 9, align: 'left', pad: 6, nowrap: true });
      // grid
      const top = 74, hb = 117, bot = 915, rh = (bot - hb) / N;
      d.box(30, top, 840, bot); d.hl(30, 840, hb, OUT);
      [65, 207, 349, 491, 586, 680, 745].forEach(x => d.vl(x, top, bot));
      d.vl(712, 93, bot); d.hl(680, 745, 93);
      for (let i = 1; i < N; i++) d.hl(30, 840, hb + i * rh);
      const H = (s, a, b, o) => d.txt(s, a, top, b, hb, { bold: true, size: 7.2, pad: 1.5, nowrap: true, narrow: true, ...o });
      H('No.', 30, 65); H('Name of Client', 65, 207); H('Name of PhilHealth Member', 207, 349); H('Name of Patient', 349, 491);
      H('Contact Number\n(Optional)', 491, 586); H('Signature', 586, 680); H('Admission\nDate', 745, 840);
      d.txt('Patient is:', 680, top, 745, 93, { bold: true, size: 7.2, pad: 1, nowrap: true, narrow: true }); d.txt('Mem', 680, 93, 712, hb, { bold: true, size: 7.2, pad: .8, nowrap: true, narrow: true }); d.txt('Dep', 712, 93, 745, hb, { bold: true, size: 7.2, pad: .8, nowrap: true, narrow: true });
      // rows
      const rows = day.entries.slice(pageIdx * N, pageIdx * N + N);
      for (let i = 0; i < N; i++) {
        const y0 = hb + i * rh, y1 = y0 + rh, e = rows[i];
        d.txt(String(pageIdx * N + i + 1), 30, y0, 65, y1, { size: 7 });
        if (!e) { if (i === rows.length && pageIdx === pageCount - 1) d.nothing(10, 860, y0, y1); continue; }
        d.txt(e.client_name, 65, y0, 207, y1, { size: 8, align: 'left', pad: 4 });
        d.txt(e.member_name, 207, y0, 349, y1, { size: 8, align: 'left', pad: 4 });
        d.txt(e.patient_name, 349, y0, 491, y1, { size: 8, align: 'left', pad: 4 });
        d.txt(e.contact_no, 491, y0, 586, y1, { size: 7.5, pad: 3 });
        const sg = sigImgs[e.id];
        if (sg) {
          const bw = X(680) - X(586) - 4, bh = (y1 - y0) * K - 4, sc = Math.min(bw / sg.width, bh / sg.height);
          const w = sg.width * sc, hh = sg.height * sc;
          page.drawImage(sg, { x: X(586) + (X(680) - X(586) - w) / 2, y: Y(y1) + ((y1 - y0) * K - hh) / 2, width: w, height: hh });
        }
        if (e.patient_is === 'member') d.check(680, y0, 712, y1);
        if (e.patient_is === 'dependent') d.check(712, y0, 745, y1);
        d.txt(fmtShort(e.admission_date), 745, y0, 840, y1, { size: 7.5, nowrap: true });
      }
      if (pageIdx === pageCount - 1) {
        const s = L.computeSummary(day.entries);
        // PCF1 issuance
        const px = [30, 160, 254, 349, 443, 538];
        d.box(30, 931, 538, 1256); d.hl(30, 538, 946); d.hl(30, 538, 971);
        [160, 254, 349, 443].forEach(x => d.vl(x, 946, 1256));
        d.txt('PCF1 Issuance', 30, 931, 538, 946, { bold: true, size: 7.2, narrow: true });
        d.txt('Member Category', 30, 946, 160, 971, { bold: true, size: 7.2, narrow: true });
        L.PCF1_REASONS.forEach((r, i) => d.txt(r.label, px[i + 1], 946, px[i + 2], 971, { bold: true, size: 4.8, pad: 2, maxLines: 2, narrow: true }));
        const rh2 = (1256 - 971) / 8;
        L.MEMBER_CODES.forEach((c, i) => {
          const y0 = 971 + i * rh2, y1 = y0 + rh2;
          if (i) d.hl(30, 538, y0);
          d.txt(L.catByCode(c).name, 30, y0, 160, y1, { bold: true, size: 7.2, align: 'left', pad: 4, nowrap: true, narrow: true });
          L.PCF1_REASONS.forEach((r, j) => { const n = s.pcf1[r.key][c]; if (n) d.txt(String(n), px[j + 1], y0, px[j + 2], y1, { size: 9, bold: true }); });
        });
        // legend
        d.box(585, 931, 779, 1113); d.hl(585, 779, 946); d.vl(633, 946, 1113);
        d.txt('Legend', 585, 931, 779, 946, { bold: true, size: 6.6, narrow: true });
        const lr = (1113 - 946) / 9;
        L.CATEGORIES.forEach((c, i) => {
          const y0 = 946 + i * lr, y1 = y0 + lr; if (i) d.hl(585, 779, y0);
          d.txt(c.code, 585, y0, 633, y1, { bold: true, size: 6.6, align: 'left', pad: 3, nowrap: true, narrow: true });
          d.txt(c.label, 633, y0, 779, y1, { size: 6.6, align: 'left', pad: 3, nowrap: true, narrow: true });
        });
      }
    }

    /* ============ SHEET 2 — Daily report ============ */
    function sheet2(day, pageIdx, pageCount) {
      const page = doc.addPage([PW, PH]); const d = drawing(page);
      const sh = day.sheet || {};
      d.box(91, 35, 603, 65); d.vl(265, 35, 65);
      d.txt('Name of Health Care Institution', 91, 35, 265, 65, { bold: true, size: 7.8, pad: 4, narrow: true });
      d.txt(String(day.hospital || hospital || '').toUpperCase(), 265, 35, 603, 65, { size: 9, align: 'left', pad: 6, nowrap: true });
      if (logoImg) {
        const LOGO_W = 190, LOGO_RIGHT = 854, LOGO_TOP = 34;   // width, right edge = higher moves right, top edge = higher moves down (form units)
        const w = X(LOGO_W), h = w * logoImg.height / logoImg.width;
        page.drawImage(logoImg, { x: X(LOGO_RIGHT) - w, y: Y(LOGO_TOP) - h, width: w, height: h });
      }
      const xs = [91, 126, 161, 196, 231, 265, 301, 335, 370, 405, 440, 474, 509, 602, 637, 672, 707, 742, 777, 868];
      const top = 80, hb = 128, bot = 926, rh = (bot - hb) / N;
      d.box(91, top, 868, bot); d.hl(91, 868, hb, OUT);
      const vtop = { 126: 80, 161: 113, 196: 98, 231: 113, 265: 98, 301: 98, 335: 98, 370: 98, 405: 80, 440: 80, 474: 98, 509: 80, 602: 80, 637: 98, 672: 80, 707: 80, 742: 80, 777: 80 };
      Object.keys(vtop).forEach(x => d.vl(+x, vtop[x], bot));
      d.hl(126, 405, 98); d.hl(440, 509, 98); d.hl(602, 672, 98); d.hl(126, 265, 113);
      for (let i = 1; i < N; i++) d.hl(91, 868, hb + i * rh);
      const T = (s, a, y0, b, y1, o) => d.txt(s, a, y0, b, y1, { bold: true, size: 7.2, pad: .8, nowrap: true, narrow: true, ...o });
      T('No.', 91, top, 126, hb); T('Member Category', 126, top, 405, 98);
      T('Formal', 126, 98, 196, 113); T('Informal', 196, 98, 265, 113);
      T('G', 126, 113, 161, hb); T('P', 161, 113, 196, hb); T('INF/SE', 196, 113, 231, hb, { size: 6.6 }); T('MW-LB', 231, 113, 265, hb, { size: 6.6 });
      ['IND', 'SP', 'LMP', 'SC'].forEach((c, i) => T(c, xs[5 + i], 98, xs[6 + i], hb));
      T('Non\nMember', 405, top, 440, hb, { size: 6 });
      T('Status', 440, top, 509, 98); T('Active', 440, 98, 474, hb); T('Inactive', 474, 98, 509, hb, { size: 6 });
      T('Nature of Inquiry', 509, top, 602, hb);
      T('Inpatient', 602, top, 672, 98); T('At Post', 602, 98, 637, hb, { size: 6.6 }); T('Ward\nClass', 637, 98, 672, hb, { size: 6.6 });
      T('Outpt\nPackage', 672, top, 707, hb, { size: 5.4 }); T('Walk-\nin', 707, top, 742, hb);
      T('PPFF', 742, top, 777, hb); T('Remarks', 777, top, 868, hb);
      // rows
      const rows = day.entries.slice(pageIdx * N, pageIdx * N + N), catIdx = {}; L.CAT_CODES.forEach((c, i) => { catIdx[c] = 1 + i; });
      for (let i = 0; i < N; i++) {
        const y0 = hb + i * rh, y1 = y0 + rh, e = rows[i];
        d.txt(String(pageIdx * N + i + 1), 91, y0, 126, y1, { size: 7 });
        if (!e) { if (i === rows.length && pageIdx === pageCount - 1) d.nothing(70, 889, y0, y1); continue; }
        const ci = catIdx[e.member_category]; if (ci) d.check(xs[ci], y0, xs[ci + 1], y1);
        if (e.status === 'active') d.check(440, y0, 474, y1); if (e.status === 'inactive') d.check(474, y0, 509, y1);
        d.txt(String(e.nature_of_inquiry || '').toUpperCase(), 509, y0, 602, y1, { size: 7, align: 'left', pad: 3, maxLines: 4 });
        if (e.service === 'at_post') d.check(602, y0, 637, y1); if (e.service === 'ward_class') d.check(637, y0, 672, y1); if (e.service === 'outpatient') d.check(672, y0, 707, y1);
        if (e.walk_in) d.check(707, y0, 742, y1); if (e.ppff) d.check(742, y0, 777, y1);
        d.txt(String(e.remarks || '').toUpperCase(), 777, y0, 868, y1, { size: 7, align: 'left', pad: 3, maxLines: 4 });
      }
      if (pageIdx !== pageCount - 1) return;

      const s = L.computeSummary(day.entries);
      const cx = [196, 230, 265, 300, 335, 370, 405, 440, 476, 510, 556], labels = L.CAT_CODES.concat(['Total']);
      const lab = (a, y0, b, y1, o) => d.txt(a, cx[0], y0, cx[1], y1, o);
      const numRow = (obj, total, y0, y1) => { L.CAT_CODES.forEach((c, i) => d.txt(String(obj[c]), cx[i], y0, cx[i + 1], y1, { size: 7.2, narrow: true })); d.txt(String(total), cx[9], y0, cx[10], y1, { size: 7.2, bold: true, narrow: true }); };
      const head = (y0, y1) => labels.forEach((l, i) => d.txt(l, cx[i], y0, cx[i + 1], y1, { bold: true, size: (l === 'INF/SE' || l === 'MW-LB') ? 6 : 7.2, pad: .8, nowrap: true, narrow: true }));
      // Daily summary
      d.box(91, 943, 556, 1089); d.hl(91, 556, 962); d.hl(91, 556, 982); d.hl(126, 556, 1017); d.hl(91, 556, 1053);
      cx.forEach(x => d.vl(x, 962, 1089)); d.vl(126, 982, 1053);
      d.txt('Daily Summary of Patients Served', 91, 943, 556, 962, { bold: true, size: 7.2, narrow: true });
      d.txt('Member Category', 91, 962, 196, 982, { bold: true, size: 7.2, nowrap: true, narrow: true }); head(962, 982);
      d.vtxt('Inpatient', 91, 982, 126, 1053, { bold: true, size: 7.2, narrow: true });
      d.txt('At Post', 126, 982, 196, 1017, { bold: true, size: 7.2, nowrap: true, narrow: true }); d.txt('Ward Class', 126, 1017, 196, 1053, { bold: true, size: 7.2, nowrap: true, narrow: true });
      d.txt('Total', 91, 1053, 196, 1089, { bold: true, size: 7.2, narrow: true });
      numRow(s.atPost, s.totals.atPost, 982, 1017); numRow(s.ward, s.totals.ward, 1017, 1053); numRow(s.inpatient, s.totals.inpatient, 1053, 1089);
      // Outpatient
      d.box(91, 1106, 556, 1142); d.hl(91, 556, 1124); cx.forEach(x => d.vl(x, 1106, 1142)); head(1106, 1124);
      d.txt('Outpatient', 91, 1124, 196, 1142, { bold: true, size: 7.2, narrow: true }); numRow(s.outpatient, s.totals.outpatient, 1124, 1142);
      // Membership status (no NM column)
      d.box(91, 1158, 556, 1250); [1177, 1195, 1213].forEach(y => d.hl(91, 556, y));
      cx.slice(0, 9).forEach(x => d.vl(x, 1158, 1250));
      d.txt('Membership Status', 91, 1158, 196, 1177, { bold: true, size: 7.2, nowrap: true, narrow: true });
      L.MEMBER_CODES.forEach((c, i) => d.txt(c, cx[i], 1158, cx[i + 1], 1177, { bold: true, size: 7.2, pad: .8, nowrap: true, narrow: true }));
      d.txt('Total', 476, 1158, 556, 1177, { bold: true, size: 7.2, narrow: true });
      [['Active', s.active, s.totals.active, 1177, 1195], ['Inactive', s.inactive, s.totals.inactive, 1195, 1213], ['Total', s.statusTotal, s.totals.status, 1213, 1250]].forEach(([n, obj, tot, y0, y1]) => {
        d.txt(n, 91, y0, 196, y1, { bold: true, size: 7.2, narrow: true });
        L.MEMBER_CODES.forEach((c, i) => d.txt(String(obj[c]), cx[i], y0, cx[i + 1], y1, { size: 7.2, narrow: true }));
        d.txt(String(tot), 476, y0, 556, y1, { size: 7.2, bold: true, narrow: true });
      });
      // Right-hand totals
      d.box(603, 943, 868, 1160); d.vl(778, 943, 1160); [982, 1017, 1053, 1089, 1125].forEach(y => d.hl(603, 868, y));
      const metrics = [
        ['No. of Times OPD Class is Conducted (if applicable)', sh.opd_class_count, 943, 982],
        ['No. of Clients Served During OPD Class (if applicable)', sh.opd_class_clients, 982, 1017],
        ['Total No. of Inpatient Clients Served (At Post + Ward Class)', s.totals.inpatient, 1017, 1053],
        ['Total No. of Outpatient Clients', s.totals.outpatient, 1053, 1089],
        ['Total No. of Walk-in Clients', s.walkIn, 1089, 1125],
        ['Total No. of PPFF Administered', (sh.ppff_total !== null && sh.ppff_total !== undefined && sh.ppff_total !== '') ? sh.ppff_total : s.ppff, 1125, 1160]
      ];
      metrics.forEach(([l, v, y0, y1]) => {
        d.txt(l, 603, y0, 778, y1, { bold: true, size: 7.2, align: 'left', pad: 4, maxLines: 2, narrow: true });
        if (v !== null && v !== undefined && v !== '') d.txt(String(v), 778, y0, 868, y1, { bold: true, size: 7.2, narrow: true });
      });
      // Control number
      const [cy, cm, cs] = parts(sh.control_no, day.date);
      d.txt('Control No.', 640, 1212, 706, 1232, { bold: true, size: 7.8, align: 'left', pad: 0, nowrap: true, narrow: true });
      d.txt(cy, 708, 1212, 732, 1230, { bold: true, size: 7.8, nowrap: true, narrow: true, pad: 0 }); d.txt('-', 728, 1212, 752, 1230, { bold: true, size: 7.8, narrow: true, pad: 0 });
      d.txt(cm, 752, 1212, 768, 1230, { bold: true, size: 7.8, nowrap: true, narrow: true, pad: 0 }); d.txt('-', 770, 1212, 776, 1230, { bold: true, size: 7.8, narrow: true, pad: 0 });
      d.txt(cs, 776, 1212, 824, 1230, { bold: true, size: 7.8, nowrap: true, narrow: true, pad: 0 });
      d.hl(710, 868, 1232, 1.2);
      d.txt('Year', 707, 1236, 745, 1248, { size: 5.4, nowrap: true, narrow: true }); d.txt('Month', 736, 1236, 788, 1248, { size: 5.4, nowrap: true, narrow: true }); d.txt('Series No.', 766, 1236, 834, 1248, { size: 5.4, nowrap: true, narrow: true });
    }

    for (const day of days) for (const e of day.entries) {
      if (e.signature && !sigImgs[e.id]) { try { sigImgs[e.id] = await doc.embedPng(e.signature); } catch (x) {} }
    }
    for (const day of days) {
      const pages = Math.max(1, Math.ceil(day.entries.length / N));
      if (sheets.s1) for (let p = 0; p < pages; p++) sheet1(day, p, pages);
      if (sheets.s2) for (let p = 0; p < pages; p++) sheet2(day, p, pages);
    }
    return await doc.save();
  }

  window.PDFExport = { generate };
})();
