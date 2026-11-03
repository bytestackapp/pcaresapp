/* Shared constants and the summary calculation used by the log sheet, dashboard and PDF. */
(function () {
  const CATEGORIES = [
    { code: 'FG',     label: 'Formal Economy-Government',    name: 'Formal (Government)' },
    { code: 'FP',     label: 'Formal Economy-Private',       name: 'Formal (Private)' },
    { code: 'INF/SE', label: 'Informal Sector/Self-Earning', name: 'Informal Sector/Self-Earning' },
    { code: 'MW-LB',  label: 'Migrant Worker-Land Based',    name: 'Migrant Worker (Land Based)' },
    { code: 'IND',    label: 'Indigent',                     name: 'Indigent' },
    { code: 'SP',     label: 'Sponsored',                    name: 'Sponsored' },
    { code: 'LMP',    label: 'Lifetime',                     name: 'Lifetime' },
    { code: 'SC',     label: 'Senior Citizen (RA 10645)',    name: 'SC (RA 10645)' },
    { code: 'NM',     label: 'Non-Member',                   name: 'Non-Member' }
  ];
  const CAT_CODES = CATEGORIES.map(c => c.code);
  const MEMBER_CODES = CAT_CODES.filter(c => c !== 'NM');

  const SERVICES = [
    { key: 'at_post',    label: 'At Post',            short: 'At Post' },
    { key: 'ward_class', label: 'Ward Class',         short: 'Ward Class' },
    { key: 'outpatient', label: 'Outpatient Package', short: 'Outpatient' },
    { key: 'none',       label: 'Inquiry only',       short: 'Inquiry only' }
  ];

  const PCF1_REASONS = [
    { key: 'hci_downtime',       label: 'HCI Portal Downtime' },
    { key: 'record_not_updated', label: 'Record Not Updated in the System' },
    { key: 'poor_internet',      label: 'No/Poor Internet Connection' },
    { key: 'not_renewed',        label: 'Not Renewed in the System' }
  ];

  const zero = () => Object.fromEntries(CAT_CODES.map(c => [c, 0]));
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

  function computeSummary(entries) {
    const s = {
      total: entries.length,
      atPost: zero(), ward: zero(), outpatient: zero(),
      active: zero(), inactive: zero(),
      pcf1: Object.fromEntries(PCF1_REASONS.map(r => [r.key, zero()])),
      walkIn: 0, ppff: 0
    };
    for (const e of entries) {
      const c = e.member_category;
      if (e.walk_in) s.walkIn++;
      if (e.ppff) s.ppff++;
      if (!(c in s.atPost)) continue;
      if (e.service === 'at_post') s.atPost[c]++;
      else if (e.service === 'ward_class') s.ward[c]++;
      else if (e.service === 'outpatient') s.outpatient[c]++;
      if (c !== 'NM') {
        if (e.status === 'active') s.active[c]++;
        else if (e.status === 'inactive') s.inactive[c]++;
      }
      if (e.pcf1_reason && s.pcf1[e.pcf1_reason] && c !== 'NM') s.pcf1[e.pcf1_reason][c]++;
    }
    s.inpatient = Object.fromEntries(CAT_CODES.map(c => [c, s.atPost[c] + s.ward[c]]));
    s.totals = {
      atPost: sum(s.atPost), ward: sum(s.ward), inpatient: sum(s.inpatient),
      outpatient: sum(s.outpatient), active: sum(s.active), inactive: sum(s.inactive)
    };
    s.totals.status = s.totals.active + s.totals.inactive;
    s.statusTotal = Object.fromEntries(MEMBER_CODES.map(c => [c, s.active[c] + s.inactive[c]]));
    return s;
  }

  // ---- date helpers (all dates are 'YYYY-MM-DD' strings in the app's timezone) ----
  const tz = () => window.APP_CONFIG.TIMEZONE;
  function todayStr() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function toStr(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return toStr(d); }
  function fmtDate(s, style) {
    if (!s) return '';
    const d = parseDate(s);
    if (style === 'long')  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    if (style === 'wlong') return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (style === 'short') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (style === 'day')   return d.toLocaleDateString('en-US', { weekday: 'short' });
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  window.Logic = {
    CATEGORIES, CAT_CODES, MEMBER_CODES, SERVICES, PCF1_REASONS,
    catByCode: (c) => CATEGORIES.find(x => x.code === c),
    serviceLabel: (k) => (SERVICES.find(x => x.key === k) || {}).label || '',
    computeSummary, todayStr, parseDate, toStr, addDays, fmtDate
  };
})();
