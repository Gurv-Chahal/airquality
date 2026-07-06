/* AQData — data layer for the BC AirCast design mockups.
   Real constants come from the repo: README.md, baseline_metrics.csv, W&B run gwi71yr6.
   Hourly series are seeded synthetic data calibrated so that, over the displayed
   7-day window, the LSTM's MAE matches the published live rolling MAE per station
   (0.95 / 1.48 / 1.90 µg/m³) and the naive same-hour-yesterday baseline lands on
   its published/plausible live MAE (~2.9 at Prince George). */
(function () {
  const HOUR = 3600e3;
  const NOW = Math.floor(Date.now() / HOUR) * HOUR;
  const N_PAST = 15 * 24, N_FUT = 24;

  const STATIONS = [
    { id: 'prince_george', name: 'Prince George', sub: 'Plaza 400', sensor: 4098, lat: 53.91472, lon: -122.74194,
      liveMae: 1.90, persistTarget: 2.90, base: 6.6, amp: 3.6, noise: 0.9, seed: 11, smokePeak: 168 },
    { id: 'vancouver', name: 'Vancouver', sub: 'Clark Drive', sensor: 9146190, lat: 49.26029, lon: -123.077811,
      liveMae: 0.95, persistTarget: 2.05, base: 4.0, amp: 1.8, noise: 0.5, seed: 22, smokePeak: 84 },
    { id: 'kelowna', name: 'Kelowna', sub: 'KLO Road', sensor: 1325038, lat: 49.862119, lon: -119.467461,
      liveMae: 1.48, persistTarget: 2.60, base: 5.2, amp: 2.4, noise: 0.7, seed: 33, smokePeak: 131 },
  ];

  const BANDS = [
    { max: 12,       label: 'Good',                           color: '#22c55e', fg: '#052e16' },
    { max: 35.4,     label: 'Moderate',                       color: '#eab308', fg: '#422006' },
    { max: 55.4,     label: 'Unhealthy for Sensitive Groups', color: '#f97316', fg: '#ffffff' },
    { max: 150.4,    label: 'Unhealthy',                      color: '#ef4444', fg: '#ffffff' },
    { max: 250.4,    label: 'Very Unhealthy',                 color: '#a855f7', fg: '#ffffff' },
    { max: Infinity, label: 'Hazardous',                      color: '#7f1d1d', fg: '#ffffff' },
  ];
  const band = v => BANDS.find(b => v <= b.max) || BANDS[BANDS.length - 1];

  /* Offline held-out test metrics — baseline_metrics.csv + W&B summary (exact). */
  const OFFLINE = [
    { model: 'Climatology',           mae: 4.094, rmse: 5.294, note: 'typical value for this hour of day' },
    { model: 'Seasonal persistence',  mae: 2.879, rmse: 5.019, note: 'same as this hour yesterday' },
    { model: 'XGBoost (tuned)',       mae: 2.847, rmse: 4.276, note: 'gradient-boosted trees on the flattened window' },
    { model: 'LSTM — ours',           mae: 2.790, rmse: 4.138, note: '48 h × 13 features → 64 hidden units', ours: true },
  ];

  const FACTS = {
    windows: 63942, featureRows: 67000, nFeatures: 13, seqLen: 48, horizonH: 24,
    epochs: 60, hidden: 64, layers: 1, batch: 64, lr: '1e-3', artifact: 'pm25-lstm:v1',
    rmseVsPersistencePct: 17.6, rmseVsXgbPct: 3.2, persistOfflineMae: 2.879,
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const bump = (h, c, w) => { const d = ((h - c + 36) % 24) - 12; return Math.exp(-0.5 * (d / w) * (d / w)); };

  function gen(st, smoke) {
    const seedBase = st.seed + (smoke ? 77 : 0);
    const tPeak = NOW - 30 * HOUR;

    // Build the ground-truth series for a given day-to-day regime-shift scale `s`.
    // The regime shifts (weather systems moving through) are what make the naive
    // t−24h copy WRONG — without them persistence would be unbeatable on clean
    // diurnal data, which is not how real PM2.5 behaves.
    const build = (s) => {
      const rnd = mulberry32(seedBase);
      const nDays = Math.ceil((N_PAST + N_FUT) / 24) + 3;
      const anchors = [], ampF = [];
      let v = 0;
      for (let d = 0; d < nDays; d++) {
        v = v * 0.5 + (rnd() * 2 - 1);
        anchors.push(v);
        ampF.push(0.85 + rnd() * 0.3);
      }
      const raw = []; let ar = 0, em = 0;
      for (let i = -N_PAST; i <= N_FUT; i++) {
        const t = NOW + i * HOUR, h = new Date(t).getHours();
        const dIdx = Math.floor((i + N_PAST) / 24), frac = ((i + N_PAST) % 24) / 24;
        const shift = s * (anchors[dIdx] * (1 - frac) + anchors[dIdx + 1] * frac);
        const af = ampF[dIdx] * (1 - frac) + ampF[dIdx + 1] * frac;
        const diurnal = st.amp * af * (0.95 * bump(h, 8, 2.5) + 0.65 * bump(h, 20, 3.2));
        ar = ar * 0.8 + (rnd() * 2 - 1) * st.noise;
        let truth = st.base + shift + diurnal + ar;
        if (smoke) {
          const dt = (t - tPeak) / HOUR, w = dt < 0 ? 13 : 30;   // fast onset, slow decay
          truth += st.smokePeak * Math.exp(-0.5 * (dt / w) * (dt / w));
        }
        em = em * 0.72 + (rnd() * 2 - 1);
        raw.push({ t, truth: Math.max(0.4, truth), e: em + 0.35 * (rnd() * 2 - 1) });
      }
      return raw;
    };

    // Persistence MAE over the displayed last-7-days window.
    const pMae = arr => {
      const cut = NOW - 7 * 24 * HOUR;
      let sm = 0, n = 0;
      arr.forEach((p, i) => {
        const q = arr[i - 24];
        if (q && p.t > cut && p.t <= NOW) { sm += Math.abs(p.truth - q.truth); n++; }
      });
      return sm / Math.max(n, 1);
    };

    // Tune the regime-shift scale so naive persistence lands on its target MAE.
    let s = 1.4, raw = build(s);
    if (!smoke) {
      for (let it = 0; it < 6; it++) {
        const m = pMae(raw);
        if (Math.abs(m - st.persistTarget) < 0.04) break;
        s = Math.max(0.2, Math.min(9, s * st.persistTarget / Math.max(m, 0.2)));
        raw = build(s);
      }
    }

    // Calibrate the model-error process over the SAME displayed 7-day window,
    // so the on-page computed LSTM MAE equals the published live rolling MAE.
    const win = raw.filter(p => p.t > NOW - 7 * 24 * HOUR && p.t <= NOW);
    const meanAbs = win.reduce((a, p) => a + Math.abs(p.e), 0) / Math.max(win.length, 1);
    const k = st.liveMae / Math.max(meanAbs, 1e-6);

    const points = raw.map((p, idx) => {
      const errScale = smoke ? k * (1 + p.truth / 45) : k;      // errors grow with level during events
      let pred = p.truth + p.e * errScale;
      if (smoke) {                                              // model reacts ~1 h late, shaves extreme peaks
        const prev = raw[Math.max(0, idx - 1)];
        pred = 0.55 * pred + 0.45 * (prev.truth + p.e * errScale);
        if (p.truth > 100) pred -= (p.truth - 100) * 0.10;
      }
      const p24 = raw[idx - 24];
      return {
        t: p.t,
        actual: p.t <= NOW ? +p.truth.toFixed(2) : null,
        pred: +Math.max(0.2, pred).toFixed(2),
        persist: p24 ? +p24.truth.toFixed(2) : null,            // naive: same as this hour yesterday
        future: p.t > NOW,
      };
    });
    return { now: NOW, points };
  }

  const cache = {};
  function series(mode, id) {
    const key = mode + ':' + id;
    if (!cache[key]) cache[key] = gen(STATIONS.find(s => s.id === id), mode === 'smoke');
    return cache[key];
  }

  function windowMae(mode, id, days, field) {
    const S = series(mode, id), cut = S.now - days * 24 * HOUR;
    let s = 0, n = 0;
    S.points.forEach(p => {
      if (p.actual != null && p.t > cut && p.t <= S.now) {
        const v = field === 'persist' ? p.persist : p.pred;
        if (v != null) { s += Math.abs(v - p.actual); n++; }
      }
    });
    return n ? { mae: s / n, n } : { mae: null, n: 0 };
  }

  const fmt = {
    hm: t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    dayShort: t => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }),
    full: t => new Date(t).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric' }),
    date: t => new Date(t).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
  };

  window.AQData = { HOUR, NOW, STATIONS, BANDS, band, OFFLINE, FACTS, series, windowMae, fmt };
})();
