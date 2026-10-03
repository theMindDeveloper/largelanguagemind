(function () {
  const TAU = Math.PI * 2;
  const C = { ink: [228, 232, 238], blue: [116, 180, 242], amber: [232, 168, 92], green: [125, 203, 142], white: [255, 246, 232] };
  const THEMES = {
    night: { ink: [228, 232, 238], glow: [116, 180, 242], fire: [232, 168, 92], input: [116, 180, 242], core: [255, 246, 232], blend: 'lighter', somaHi: [255, 246, 232], nucleus: 'rgba(8,10,14,0.5)', ambFar: [110, 140, 185], ambNear: [190, 202, 218], ambA: 0.26, bgGlow: true },
    paper: { syn: [190, 90, 50], ink: [28, 23, 18], glow: null, fire: [168, 60, 38], input: [43, 74, 140], core: [28, 23, 18], blend: 'source-over', somaHi: [96, 80, 62], nucleus: 'rgba(237,227,204,0.6)', ambFar: [150, 136, 114], ambNear: [112, 98, 80], ambA: 0.3, bgGlow: false },
  };
  let TH = THEMES.night;
  const useTheme = (t) => { TH = THEMES[t] || THEMES.night; };
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a < 0 ? 0 : a > 1 ? 1 : a})`;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;

  function rng(seed) {
    let s = (Math.imul(seed | 0, 2654435761) >>> 0) || 7;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  function makeNoise(seed) {
    const r = rng(seed), base = [], perm = new Uint16Array(512), g = new Float32Array(256);
    for (let i = 0; i < 256; i++) base.push(i);
    for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = base[i]; base[i] = base[j]; base[j] = t; }
    for (let i = 0; i < 512; i++) perm[i] = base[i & 255];
    for (let i = 0; i < 256; i++) g[i] = r() * 2 - 1;
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
      const a = g[perm[perm[X] + Y]], b = g[perm[perm[X + 1] + Y]], c = g[perm[perm[X] + Y + 1]], d = g[perm[perm[X + 1] + Y + 1]];
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }
  const fbm = (n, x, y, o) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < (o || 4); i++) { s += a * n(x * f, y * f); f *= 2.03; a *= 0.5; } return s; };

  function cumul(pts) { const cd = [0]; for (let i = 1; i < pts.length; i++) cd.push(cd[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return cd; }
  function idxAt(cd, d) { let lo = 0, hi = cd.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cd[m] < d) lo = m + 1; else hi = m; } return lo; }
  function pointAt(pts, cd, d) {
    if (d <= 0) return pts[0]; const last = cd.length - 1; if (d >= cd[last]) return pts[last];
    const i = idxAt(cd, d), t = (d - cd[i - 1]) / ((cd[i] - cd[i - 1]) || 1);
    return [mix(pts[i - 1][0], pts[i][0], t), mix(pts[i - 1][1], pts[i][1], t)];
  }

  // ---------- neuron morphology ----------
  // Branches integrate a smooth heading (slow arc + sinuous wave); width tapers to a hair tip.
  function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }
  const TYPES = ['pyramidal', 'purkinje', 'stellate', 'bipolar'];
  function growNeuron(o) {
    const s = o.s, r = rng(o.seed), nz = makeNoise(o.seed * 3 + 1), type = o.type || 'pyramidal';
    const N = { x: o.x, y: o.y, s, type, R: 9.5 * s, segs: [], tips: [], apical: [], spines: [], maxD: 1, act: 0, hover: 0 };
    const TIP = 0.16 * s;
    function branch(sx, sy, ang, len, w0, d0, depth, maxDepth, chain, q) {
      q = q || {};
      const st = 1.7 * s, n = Math.max(6, Math.round(len / st));
      const forks = !q.noFork && depth < maxDepth && len > 14 * s && r() < (q.forkP || 0.72);
      const wEnd = q.keepW ? w0 * 0.6 : forks ? Math.max(TIP * 3, w0 * (0.5 + r() * 0.12)) : TIP;
      const bend = q.bend != null ? q.bend : ((r() - 0.5) * 0.022) / s;
      const wl = (26 + r() * 30) * s, A = (q.wave != null ? q.wave : 1) * (0.32 + r() * 0.3), ph = r() * TAU, wl2 = wl * (0.38 + r() * 0.1), ph2 = r() * TAU;
      const pts = [[sx, sy]], cd = [d0], ws = [w0];
      let a = ang, x = sx, y = sy, d = 0, h = ang;
      for (let i = 1; i <= n; i++) {
        d += st; const t = d / len;
        a += bend * st + nz(x * 0.007 / s + 11, y * 0.007 / s) * 0.018;
        if (q.home != null) a += angDiff(a, q.home) * 0.02;
        const ease = Math.min(1, d / (10 * s));
        h = a + ease * (A * Math.sin((TAU * d) / wl + ph) + A * 0.32 * Math.sin((TAU * d) / wl2 + ph2));
        x += Math.cos(h) * st; y += Math.sin(h) * st;
        const w = wEnd + (w0 - wEnd) * Math.pow(1 - t, forks || q.keepW ? 1.1 : 0.85);
        pts.push([x, y]); cd.push(d0 + d); ws.push(Math.max(TIP, w * (1 + 0.07 * nz(d * 0.08 / s, o.seed))));
        if (!q.axon && depth >= 1 && w < 2.4 * s && w > TIP * 1.4 && r() < 0.42) {
          const sd = r() < 0.5 ? 1 : -1, pa = h + sd * (1.15 + r() * 0.7), pl = w * 0.5 + (0.9 + r() * 1.8) * s, bend2 = sd * (r() - 0.3) * 0.6;
          const bx = x + Math.cos(pa) * w * 0.45, by = y + Math.sin(pa) * w * 0.45;
          N.spines.push([bx, by, bx + Math.cos(pa) * pl * 0.55 + Math.cos(pa + bend2) * pl * 0.45, by + Math.sin(pa) * pl * 0.55 + Math.sin(pa + bend2) * pl * 0.45, d0 + d, r() < 0.35 ? (0.26 + r() * 0.2) * s : 0, Math.max(0.28 * s, w * 0.28)]);
        }
        if (!q.noSide && depth < maxDepth + 1 && t > 0.12 && t < 0.9 && r() < (st / (30 * s)) * (q.sideRate || 1)) {
          const sd = r() < 0.5 ? 1 : -1, sw = w * (0.45 + r() * 0.15);
          if (sw > TIP * 2.5) branch(x, y, h + sd * (0.55 + r() * 0.5), (len - d) * (0.35 + r() * 0.45) + 10 * s, sw, d0 + d, depth + 1, maxDepth, chain && chain.concat(pts.slice(1)), { bend: (-sd * (0.004 + r() * 0.008)) / s, sideRate: q.sideRate, wave: q.wave, home: q.home, axon: q.axon });
        }
      }
      N.segs.push({ pts, cd, ws, axon: !!q.axon }); if (d0 + d > N.maxD) N.maxD = d0 + d;
      const ch = chain ? chain.concat(pts.slice(1)) : null;
      if (forks) {
        const sp = (q.spread || 1) * (0.32 + r() * 0.32), k = r() < 0.18 ? 3 : 2;
        for (let j = 0; j < k; j++) {
          const off = k === 2 ? (j ? sp : -sp * (0.7 + r() * 0.5)) : (j - 1) * sp;
          branch(x, y, h + off, len * (0.5 + r() * 0.4), wEnd * (0.82 + r() * 0.1), d0 + d, depth + 1, maxDepth, ch, { wave: q.wave, bend: ((r() - 0.5) * 0.02) / s, sideRate: q.sideRate, spread: q.spread, home: q.home, axon: q.axon });
        }
      } else if (ch) N.tips.push(ch.slice().reverse());
      return { pts, ws, cd, x, y, h };
    }
    const start = (an, k) => [o.x + Math.cos(an) * N.R * (k || 0.85), o.y + Math.sin(an) * N.R * (k || 0.85)];
    let somaA = -Math.PI / 2, somaE = 0.9, somaB = Math.PI / 2, somaE2 = 0.25, axA = Math.PI / 2 + (r() - 0.5) * 0.3;
    if (type === 'pyramidal') {
      const apA = -Math.PI / 2 + (r() - 0.5) * 0.2; somaA = apA;
      const p0 = start(apA, 1.3), apLen = (150 + r() * 50) * s * (o.apical || 1);
      const ap = branch(p0[0], p0[1], apA, apLen, 4.4 * s, 0, 0, 0, [[o.x, o.y]], { wave: 0.35, bend: ((r() - 0.5) * 0.004) / s, noSide: true, noFork: true });
      N.segs.pop(); N.tips = [];
      const tw = ap.ws.map((_, i) => mix(4.4 * s, 1.3 * s, Math.pow(i / (ap.ws.length - 1), 0.8)));
      N.segs.push({ pts: ap.pts, cd: ap.cd, ws: tw });
      const trunk = [[o.x, o.y]].concat(ap.pts);
      [0.12, 0.3, 0.46, 0.62, 0.78].forEach((f, i) => {
        if (i > 0 && r() < 0.2) return;
        const k = Math.round(f * (ap.pts.length - 1)), p = ap.pts[k], q2 = ap.pts[k + 1];
        N.apical.push(p);
        const hd = Math.atan2(q2[1] - p[1], q2[0] - p[0]), sd = i % 2 ? 1 : -1;
        branch(p[0], p[1], hd + sd * (0.9 + r() * 0.5), (40 + r() * 40) * s, tw[k] * (0.42 + r() * 0.1), ap.cd[k], 1, 2, trunk.slice(0, k + 2), { bend: (-sd * (0.006 + r() * 0.008)) / s });
      });
      const e = ap.pts[ap.pts.length - 1], ed = ap.cd[ap.cd.length - 1], eh = Math.atan2(e[1] - ap.pts[ap.pts.length - 4][1], e[0] - ap.pts[ap.pts.length - 4][0]);
      for (let j = 0; j < 3; j++) branch(e[0], e[1], eh + (j - 1) * (0.45 + r() * 0.25), (36 + r() * 30) * s, 1.15 * s, ed, 1, 3, trunk, {});
      const nb = 4 + ((r() * 3) | 0);
      for (let i = 0; i < nb; i++) {
        let an = Math.PI * ((i + 0.5) / nb) + (r() - 0.5) * 0.35;
        if (Math.abs(an - Math.PI / 2) < 0.28) an += an < Math.PI / 2 ? -0.36 : 0.36;
        const p = start(an); branch(p[0], p[1], an, (42 + r() * 50) * s, (2.5 + r() * 1.1) * s, 0, 0, 2, [[o.x, o.y]], { bend: ((an < Math.PI / 2 ? -1 : 1) * (0.002 + r() * 0.006)) / s });
      }
    } else if (type === 'purkinje') {
      N.R = 12 * s; somaE = 0.35; somaE2 = 0.15;
      const up = -Math.PI / 2 + (r() - 0.5) * 0.25, p0 = start(up, 1.0);
      const tr = branch(p0[0], p0[1], up, (26 + r() * 14) * s, 5 * s, 0, 0, 0, [[o.x, o.y]], { wave: 0.25, noSide: true, noFork: true, keepW: true });
      const nP = 2 + (r() < 0.5 ? 1 : 0);
      for (let j = 0; j < nP; j++) {
        const off = nP === 2 ? (j ? 1 : -1) * (1.0 + r() * 0.3) : (j - 1) * (1.1 + r() * 0.2);
        branch(tr.x, tr.y, tr.h + off, (44 + r() * 22) * s, 3.2 * s, tr.cd[tr.cd.length - 1], 0, 3, [[o.x, o.y]].concat(tr.pts), { wave: 0.5, sideRate: 3.2, home: -Math.PI / 2, spread: 1.1, bend: (-off * 0.006) / s });
      }
      N.apical.push([tr.x, tr.y]);
    } else if (type === 'stellate') {
      N.R = 8 * s; somaE = 0.2; somaE2 = 0.2;
      const n = 6 + ((r() * 3) | 0), base = r() * TAU;
      for (let i = 0; i < n; i++) {
        const an = base + (TAU * i) / n + (r() - 0.5) * 0.5, p = start(an);
        branch(p[0], p[1], an, (40 + r() * 46) * s, (2.1 + r() * 1.0) * s, 0, 0, 2 + (r() < 0.4 ? 1 : 0), [[o.x, o.y]], { sideRate: 1.2, bend: ((r() - 0.5) * 0.012) / s });
      }
      axA = base + TAU / n / 2;
    } else if (type === 'bipolar') {
      N.R = 7.5 * s; somaE = 0.7; somaE2 = 0.7;
      const up = -Math.PI / 2 + (r() - 0.5) * 0.3; somaA = up; somaB = up + Math.PI;
      [[up, 90, 3], [up + Math.PI, 70, 2]].forEach(([an, L, md]) => {
        const p = start(an, 1.5);
        const t1 = branch(p[0], p[1], an, (L * 0.55 + r() * 20) * s, 3.2 * s, 0, 0, 0, [[o.x, o.y]], { wave: 0.3, noSide: true, noFork: true, keepW: true });
        for (let j = 0; j < 2 + (r() < 0.5 ? 1 : 0); j++) branch(t1.x, t1.y, t1.h + (j - 0.5) * (0.7 + r() * 0.3), (L * 0.6 + r() * 20) * s, 1.9 * s, t1.cd[t1.cd.length - 1], 1, md, [[o.x, o.y]].concat(t1.pts), { sideRate: 1.3 });
      });
      axA = up + Math.PI / 2 * (r() < 0.5 ? 1 : -1) + 0.4;
    }
    // soma (guard: never let the arbor dwarf the cell body)
    { let ext = 0; for (const sg of N.segs) for (const p of sg.pts) { const dd = Math.hypot(p[0] - o.x, p[1] - o.y); if (dd > ext) ext = dd; } if (ext > 28 * N.R) N.R = Math.min(ext / 28, N.R * 1.25); }
    N.soma = [];
    for (let i = 0; i < 48; i++) {
      const t = (i / 48) * TAU; let rr = N.R * (1 + 0.08 * nz(Math.cos(t) * 1.5 + 5, Math.sin(t) * 1.5 + 5));
      const c = Math.cos(t - somaA); if (c > 0) rr *= 1 + somaE * Math.pow(c, 6);
      const cb = Math.cos(t - somaB); if (cb > 0) rr *= 1 + somaE2 * Math.pow(cb, 8);
      N.soma.push([o.x + Math.cos(t) * rr, o.y + Math.sin(t) * rr]);
    }
    // axon: hillock, meander that settles into a direct approach (no orbiting), bouton or small arbor at the end
    if (o.axonAng != null && type !== 'pyramidal' && type !== 'purkinje') axA = o.axonAng;
    const ax0 = start(axA, 1.1);
    const goal = o.goal || [ax0[0] + Math.cos(o.axonAng != null ? o.axonAng : axA) * o.axonLen, ax0[1] + Math.sin(o.axonAng != null ? o.axonAng : axA) * o.axonLen];
    const apts = [ax0], aws = [3.2 * s], st = 1.7 * s;
    let aa = axA, ax = ax0[0], ay = ax0[1], ad = 0;
    const awl = (48 + r() * 30) * s, aA = 0.3 + r() * 0.12, aph = r() * TAU;
    const L0 = Math.hypot(goal[0] - ax, goal[1] - ay), maxSteps = Math.ceil((L0 / st) * 1.7) + 40;
    for (let i = 0; i < maxSteps; i++) {
      const dx = goal[0] - ax, dy = goal[1] - ay, dist = Math.hypot(dx, dy);
      if (dist < st * 1.2) break;
      const prog = clamp(ad / L0, 0, 1), want = Math.atan2(dy, dx);
      const gain = ad < 24 * s ? 0.006 : 0.012 + 0.2 * prog * prog + (dist < 50 * s ? 0.25 : 0);
      aa += angDiff(aa, want) * Math.min(1, gain) + nz(ax * 0.004 / s, ay * 0.004 / s + 31) * 0.01 * (1 - prog);
      if (i > maxSteps - 60) aa = want;
      const amp = aA * clamp((dist - 30 * s) / (70 * s), 0, 1) * Math.min(1, ad / (20 * s));
      const hh = aa + amp * (Math.sin((TAU * ad) / awl + aph) + 0.3 * Math.sin((TAU * ad) / (awl * 0.41) + aph * 2));
      ax += Math.cos(hh) * st; ay += Math.sin(hh) * st; ad += st;
      apts.push([ax, ay]); aws.push((0.95 + 2.3 * sstep(14 * s, 0, ad)) * s * (1 + 0.06 * nz(ad * 0.05 / s, 4)));
    }
    apts.push([goal[0], goal[1]]); aws.push(aws[aws.length - 1]);
    const nA = aws.length;
    if (o.goal) {
      // terminal bouton: swell over the last few points then close
      const K = Math.min(9, nA - 2);
      for (let j = 0; j < K; j++) { const u = j / (K - 1); aws[nA - K + j] = s * (0.8 + 2.2 * Math.sin(Math.PI * Math.pow(u, 0.8)) * 0.8); }
      aws[nA - 1] = 0.9 * s;
    } else {
      for (let j = 1; j <= 8 && j < nA; j++) aws[nA - j] = mix(aws[nA - 9] || s, TIP, (9 - j) / 8);
    }
    const acd = cumul(apts);
    N.axon = { pts: apts, cd: acd, len: acd[acd.length - 1] };
    N.segs.push({ pts: apts, cd: acd, ws: aws, axon: true }); N.maxD = Math.max(N.maxD, N.axon.len);
    if (!o.goal) {
      const eh2 = Math.atan2(goal[1] - apts[Math.max(0, apts.length - 6)][1], goal[0] - apts[Math.max(0, apts.length - 6)][0]);
      for (let j = 0; j < 3; j++) branch(goal[0], goal[1], eh2 + (j - 1) * 0.6, (10 + r() * 14) * s, 0.65 * s, N.axon.len, 2, 2, null, { noSide: true, axon: true });
    } else {
      const k = Math.max(2, apts.length - 22), p = apts[k], q2 = apts[k + 1];
      branch(p[0], p[1], Math.atan2(q2[1] - p[1], q2[0] - p[0]) - 0.7, (14 + r() * 8) * s, 0.6 * s, acd[k], 2, 2, null, { noSide: true, axon: true });
    }
    [0.3, 0.58].forEach((f) => {
      const i = Math.round((apts.length - 1) * f * (o.goal ? 0.8 : 1)), p = apts[i], q2 = apts[i + 1]; if (!q2) return;
      branch(p[0], p[1], Math.atan2(q2[1] - p[1], q2[0] - p[0]) + (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.4), (26 + r() * 20) * s, 0.7 * s, acd[i], 2, 3, null, { axon: true });
    });
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const sg of N.segs) for (const p of sg.pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    for (const p of N.soma) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    N.tight = [x0, y0, x1, y1];
    const pad = 30 * s; N.bbox = [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
    return N;
  }

  function drawSoma(ctx, N, k, col, alpha) {
    if (k <= 0) return;
    ctx.beginPath();
    N.soma.forEach((p, i) => { const x = N.x + (p[0] - N.x) * k, y = N.y + (p[1] - N.y) * k; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath();
    const g = ctx.createRadialGradient(N.x - N.R * 0.25, N.y - N.R * 0.3, 0, N.x, N.y, N.R * 1.8);
    g.addColorStop(0, rgba(TH.somaHi, alpha)); g.addColorStop(0.55, rgba(col, alpha * 0.95)); g.addColorStop(1, rgba(col, alpha * 0.75));
    ctx.fillStyle = g; ctx.fill();
    if (k > 0.9) {
      ctx.fillStyle = TH.nucleus; ctx.beginPath(); ctx.ellipse(N.x + N.R * 0.05, N.y + N.R * 0.1, N.R * 0.44, N.R * 0.38, 0.3, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba(col, alpha * 0.9); ctx.beginPath(); ctx.arc(N.x + N.R * 0.12, N.y + N.R * 0.05, N.R * 0.12, 0, TAU); ctx.fill();
    }
  }
  function ribbon(ctx, pts, ws, n, wm) {
    const L = [], R = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const hw = ws[i] * wm * 0.5; L.push([p[0] - dy * hw, p[1] + dx * hw]); R.push([p[0] + dy * hw, p[1] - dx * hw]);
    }
    ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < n; i++) ctx.lineTo(L[i][0], L[i][1]);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], ws[0] * wm * 0.5, 0, TAU); ctx.fill();
  }
  function drawNeuron(ctx, N, P, col, alpha, wm, skipAxon) {
    wm = wm || 1; const lim = clamp((P - 0.14) / 0.86, 0, 1) * N.maxD;
    ctx.fillStyle = rgba(col, alpha); ctx.strokeStyle = rgba(col, alpha); ctx.lineCap = 'round';
    for (const sg of N.segs) {
      if (sg.cd[0] > lim || (skipAxon && sg.axon)) continue;
      if (lim <= 0) break;
      let n = sg.pts.length; while (n > 2 && sg.cd[n - 1] > lim) n--;
      if (n < 3 && sg.cd[1] > lim) continue;
      ribbon(ctx, sg.pts, sg.ws, n, wm);
    }
    if (N.spines) {
      ctx.lineCap = 'round';
      for (const sp of N.spines) {
        if (sp[4] > lim) continue;
        ctx.lineWidth = sp[6] * wm; ctx.beginPath(); ctx.moveTo(sp[0], sp[1]); ctx.lineTo(sp[2], sp[3]); ctx.stroke();
      }
      ctx.beginPath();
      for (const sp of N.spines) { if (sp[4] > lim || !sp[5]) continue; ctx.moveTo(sp[2] + sp[5] * wm, sp[3]); ctx.arc(sp[2], sp[3], sp[5] * wm, 0, TAU); }
      ctx.fill();
    }
    drawSoma(ctx, N, sstep(0, 0.14, P), col, alpha);
  }
  function layer(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function bake(N, dpr, opts) {
    const b = N.bbox, w = (b[2] - b[0]) * dpr, h = (b[3] - b[1]) * dpr;
    const draw = (col, a, wm) => { const c = layer(w, h), x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, -b[0] * dpr, -b[1] * dpr); drawNeuron(x, N, 1, col, a, wm, opts.skipAxon); return c; };
    const out = layer(w, h), o = out.getContext('2d');
    if (TH.glow) { const glow = draw(TH.glow, 1, 1.5); o.globalAlpha = 0.42; o.filter = `blur(${6 * N.s * dpr}px)`; o.drawImage(glow, 0, 0); }
    o.filter = 'none'; o.globalAlpha = 1; o.drawImage(draw(opts.col || TH.ink, opts.alpha || 0.9, 1), 0, 0);
    let tint = null;
    if (opts.tint) {
      tint = layer(w, h); const t = tint.getContext('2d');
      if (TH.blend === 'lighter') { const am = draw(TH.fire, 1, 1.6); t.filter = `blur(${9 * N.s * dpr}px)`; t.globalAlpha = 0.7; t.drawImage(am, 0, 0); t.filter = 'none'; t.globalAlpha = 0.5; t.drawImage(draw(TH.core, 1, 0.75), 0, 0); }
      else { t.drawImage(draw(TH.fire, 1, 1.15), 0, 0); }
    }
    return { base: out, tint, x: b[0], y: b[1], w: b[2] - b[0], h: b[3] - b[1] };
  }

  // ---------- pulses ----------
  function drawPulse(ctx, p) {
    const head = p.d, tail = Math.max(0, head - p.trail), pts = p.pts, cd = p.cd;
    ctx.lineCap = 'round';
    let prev = pointAt(pts, cd, tail);
    for (let i = idxAt(cd, tail); i < pts.length && cd[i] <= head; i++) {
      const f = (cd[i] - tail) / p.trail;
      ctx.strokeStyle = rgba(p.col, p.a * f * f); ctx.lineWidth = p.w * (0.35 + 0.65 * f);
      ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); prev = pts[i];
    }
    const h = pointAt(pts, cd, head);
    ctx.strokeStyle = rgba(p.col, p.a); ctx.lineWidth = p.w; ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(h[0], h[1]); ctx.stroke();
    const g = ctx.createRadialGradient(h[0], h[1], 0, h[0], h[1], p.glow);
    g.addColorStop(0, rgba(TH.core, p.a)); g.addColorStop(0.22, rgba(p.col, p.a * 0.75)); g.addColorStop(1, rgba(p.col, 0));
    ctx.fillStyle = g; ctx.fillRect(h[0] - p.glow, h[1] - p.glow, p.glow * 2, p.glow * 2);
  }

  // ---------- hero: Hebbian growth ----------
  // Both cells fire together; every co-firing, A's axon and a dendrite of B grow a little toward each other.
  // When they touch a synapse forms, and from then on A alone fires B. Then everything retracts and repeats.
  const LAYOUT = { a: { fx: 0.47, fy: 0.4, s: 1 }, b: { fx: 0.79, fy: 0.6, s: 0.86 } };
  const HERO_VARIANTS = [
    { a: ['pyramidal', 11], b: ['pyramidal', 29] },
    { a: ['pyramidal', 53], b: ['pyramidal', 71] },
    { a: ['pyramidal', 88], b: ['purkinje', 12] },
    { a: ['purkinje', 34], b: ['pyramidal', 19] },
    { a: ['pyramidal', 140], b: ['stellate', 63] },
    { a: ['stellate', 21], b: ['pyramidal', 207] },
    { a: ['bipolar', 45], b: ['pyramidal', 96] },
    { a: ['purkinje', 77], b: ['purkinje', 118] },
  ];
  function steerPath(from, goal, s, seed, amp) {
    const nz = makeNoise(seed), r = rng(seed), pts = [[from[0], from[1]]], st = 1.6 * s;
    let x = from[0], y = from[1], a = Math.atan2(goal[1] - y, goal[0] - x) + (r() - 0.5) * 0.9, d = 0;
    const L0 = Math.hypot(goal[0] - x, goal[1] - y), wl = (34 + r() * 22) * s, ph = r() * TAU, max = Math.ceil((L0 / st) * 1.8) + 30;
    for (let i = 0; i < max; i++) {
      const dx = goal[0] - x, dy = goal[1] - y, dist = Math.hypot(dx, dy); if (dist < st * 1.2) break;
      const prog = clamp(d / L0, 0, 1), want = Math.atan2(dy, dx);
      a += angDiff(a, want) * Math.min(1, 0.03 + 0.25 * prog * prog + (dist < 24 * s ? 0.3 : 0)) + nz(x * 0.01 / s, y * 0.01 / s) * 0.01;
      if (i > max - 40) a = want;
      const hh = a + amp * clamp((dist - 12 * s) / (36 * s), 0, 1) * Math.sin((TAU * d) / wl + ph);
      x += Math.cos(hh) * st; y += Math.sin(hh) * st; d += st; pts.push([x, y]);
    }
    pts.push([goal[0], goal[1]]);
    return pts;
  }
  function mountHero(canvas, opts) {
    opts = opts || {}; const theme = opts.theme || 'night'; useTheme(theme);
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1, raf = 0, last = performance.now(), T = 0, lastLt = null, phase = -1, visible = true, dead = false;
    // The ambient cells never change after their fade-in, so they live on a layer under the
    // animated canvas and are drawn once instead of every frame (absolute layouts only).
    let under = null, uctx = null, staticAlpha = -1;
    if (canvas.parentNode && getComputedStyle(canvas).position === 'absolute') {
      under = document.createElement('canvas'); under.className = canvas.className; under.setAttribute('aria-hidden', 'true');
      canvas.parentNode.insertBefore(under, canvas); uctx = under.getContext('2d');
    }
    let speed = opts.speed == null ? 0.7 : opts.speed, ambientN = opts.ambient == null ? 8 : opts.ambient;
    let A, B, cacheA, cacheB, bg, amb = [], pulses = [], hover = null, reach = null;
    const grow = { g: 0, target: 0 }, syn = { w: 0, flash: 0, p: [0, 0], formed: false };
    const INTRO = 2.6, L = 17;

    function build() {
      useTheme(theme);
      const rect = canvas.getBoundingClientRect(); W = Math.max(320, rect.width); H = Math.max(400, rect.height);
      // 1.5x is indistinguishable for soft ink lines and saves ~45% of the pixels on 2x screens
      dpr = Math.min(1.5, window.devicePixelRatio || 1); canvas.width = W * dpr; canvas.height = H * dpr;
      if (under) { under.width = canvas.width; under.height = canvas.height; staticAlpha = -1; }
      const sc = clamp(Math.min(W / 1180, H / 760), 0.72, 1.3) * 1.45;
      const nar = clamp((1500 - W) / 600, 0, 1);
      const pa = [(LAYOUT.a.fx + nar * 0.15) * W, LAYOUT.a.fy * H], pb = [(LAYOUT.b.fx + nar * 0.05) * W, LAYOUT.b.fy * H];
      const HV = HERO_VARIANTS[clamp((opts.variant | 0), 0, HERO_VARIANTS.length - 1)];
      B = growNeuron({ x: pb[0], y: pb[1], s: sc * LAYOUT.b.s, type: HV.b[0], seed: HV.b[1], axonAng: 1.25, axonLen: 300 * sc });
      // B: pick a dendrite point facing A, then a growth path from it toward A
      let best = null, bd = 1e9; const sB = B.s;
      B.segs.forEach((sg) => {
        if (sg.axon || sg.pts.length < 16) return;
        sg.pts.forEach((p, k) => {
          if (k < 5 || k > sg.pts.length - 6 || sg.ws[k] < 0.8 * sB) return;
          const d = Math.hypot(p[0] - pa[0], p[1] - pa[1]) + Math.hypot(p[0] - B.x, p[1] - B.y) * 0.5;
          if (d < bd) { bd = d; best = { sg, k }; }
        });
      });
      if (!best) { const sg = B.segs[0]; best = { sg, k: Math.round(sg.pts.length * 0.4) }; }
      const rp = best.sg.pts[best.k], toA = [pa[0] - rp[0], pa[1] - rp[1]], dA = Math.hypot(toA[0], toA[1]);
      const reachLen = Math.min(dA * 0.34, 120 * sc);
      const M = [rp[0] + (toA[0] / dA) * reachLen, rp[1] + (toA[1] / dA) * reachLen + 10 * sc];
      const rpts = steerPath(rp, M, sB, HV.b[1] + 5, 0.35), rcd = cumul(rpts), rlen = rcd[rcd.length - 1];
      reach = { pts: rpts, cd: rcd, len: rlen, ws: rpts.map((_, i) => mix(best.sg.ws[best.k] * 0.7, 0.75 * sB, Math.pow(i / (rpts.length - 1), 0.8))) };
      syn.p = M;
      A = growNeuron({ x: pa[0], y: pa[1], s: sc * LAYOUT.a.s, type: HV.a[0], seed: HV.a[1], goal: [M[0] - 1.2 * sc, M[1] - 1.6 * sc] });
      cacheA = bake(A, dpr, { tint: true, skipAxon: true }); cacheB = bake(B, dpr, { tint: true });
      // ambient field: fill the space around the pair, never the text column
      const r = rng(5); amb = [];
      bg = layer(W * dpr, H * dpr); const b = bg.getContext('2d'); b.setTransform(dpr, 0, 0, dpr, 0, 0);
      const tmp = layer(W * dpr, H * dpr), t = tmp.getContext('2d');
      [['far', 0.6, TH.ambFar, 2.2 * dpr], ['near', 0.4, TH.ambNear, 0]].forEach(([kind, frac, col, blur]) => {
        t.setTransform(1, 0, 0, 1, 0, 0); t.clearRect(0, 0, tmp.width, tmp.height); t.setTransform(dpr, 0, 0, dpr, 0, 0);
        const n = Math.round(ambientN * frac);
        for (let i = 0, tries = 0; i < n && tries < 600; tries++) {
          const x = W * (0.4 + r() * 0.65), y = r() * H * 1.05, far = kind === 'far';
          if (Math.hypot(x - pa[0], y - pa[1]) < 210 * sc || Math.hypot(x - pb[0], y - pb[1]) < 190 * sc) continue;
          if (amb.some((m) => Math.hypot(m.x - x, m.y - y) < 160 * sc)) continue;
          const N = growNeuron({ x, y, type: TYPES[(r() * TYPES.length) | 0], s: sc * (far ? 0.34 + r() * 0.12 : 0.4 + r() * 0.14), seed: 100 + tries, axonAng: 0.5 + r() * 2.2, axonLen: (180 + r() * 260) * sc });
          drawNeuron(t, N, 1, col, far ? 0.5 + r() * 0.3 : 0.55 + r() * 0.25, 1);
          N.far = far; amb.push(N); i++;
        }
        b.setTransform(1, 0, 0, 1, 0, 0); b.globalAlpha = TH.ambA;
        b.filter = blur ? `blur(${blur}px)` : 'none'; b.drawImage(tmp, 0, 0); b.filter = 'none'; b.globalAlpha = 1; b.setTransform(dpr, 0, 0, dpr, 0, 0);
      });
      pulses = []; grow.g = grow.target = 0; syn.w = 0; syn.formed = false;
    }

    function input(N, n) {
      for (let i = 0; i < n; i++) {
        const path = N.tips[(Math.random() * N.tips.length) | 0]; if (!path) return; if (!path._cd) path._cd = cumul(path);
        const len = path._cd[path._cd.length - 1], dur = 0.42 + Math.random() * 0.14;
        pulses.push({ pts: path, cd: path._cd, len, d: 0, v: len / dur, col: TH.input, a: 0.8, w: 1.4 * N.s, trail: 26 * N.s, glow: 5 * N.s });
      }
    }
    const aLen = () => grow.g * A.axon.len, rLen = () => grow.g * reach.len;
    function coFire() {
      A.act = 1; B.act = 1;
      const la = Math.max(4, aLen()), lr = Math.max(2, rLen());
      pulses.push({ pts: A.axon.pts, cd: A.axon.cd, len: la, d: 0, v: Math.max(la, 60) / 0.55, col: TH.fire, a: 0.9, w: 2 * A.s, trail: 60 * A.s, glow: 10 * A.s });
      pulses.push({ pts: reach.pts, cd: reach.cd, len: lr, d: 0, v: Math.max(lr, 30) / 0.45, col: TH.fire, a: 0.9, w: 1.6 * B.s, trail: 30 * B.s, glow: 8 * B.s,
        done: () => { grow.target = Math.min(1, grow.target + 0.25); } });
      // ambient neighbours fire too, briefly
      pulses.push({ pts: B.axon.pts, cd: B.axon.cd, len: B.axon.len, d: 0, v: B.axon.len / 1.1, col: TH.fire, a: 0.7, w: 1.8 * B.s, trail: 60 * B.s, glow: 9 * B.s });
    }
    function fireAlone() {
      A.act = 1;
      pulses.push({ pts: A.axon.pts, cd: A.axon.cd, len: A.axon.len, d: 0, v: A.axon.len / 0.85, col: TH.fire, a: 0.95, w: 2.1 * A.s, trail: 80 * A.s, glow: 11 * A.s,
        done: () => { syn.flash = 1; const rr = reach.pts.slice().reverse(), rc = cumul(rr); pulses.push({ pts: rr, cd: rc, len: rc[rc.length - 1], d: 0, v: rc[rc.length - 1] / 0.25, col: TH.fire, a: 0.9, w: 1.6 * B.s, trail: 26 * B.s, glow: 8 * B.s, done: () => { B.act = 1; pulses.push({ pts: B.axon.pts, cd: B.axon.cd, len: B.axon.len, d: 0, v: B.axon.len / 1.1, col: TH.fire, a: 0.95, w: 2.1 * B.s, trail: 80 * B.s, glow: 11 * B.s }); } }); } });
    }
    const EV = [[0, () => setPhase(0)]];
    [0.3, 2.6, 4.9, 7.2].forEach((t0, i) => { EV.push([t0, () => { input(A, 3); input(B, 3); }], [t0 + 0.45, () => coFire()]); if (i === 1) EV.push([t0 - 0.2, () => setPhase(1)]); });
    EV.push([9.4, () => { syn.formed = true; syn.flash = 1; }], [10.0, () => setPhase(2)], [10.2, () => input(A, 4)], [10.7, () => fireAlone()], [13.0, () => input(A, 4)], [13.5, () => fireAlone()],
      [15.8, () => { grow.target = 0; syn.formed = false; }]);
    function setPhase(p) { if (p !== phase) { phase = p; opts.onPhase && opts.onPhase(p); } }
    function runEvents(a, b) { for (const e of EV) if (e[0] > a && e[0] <= b) e[1](); }

    function drawCache(c, act) {
      ctx.drawImage(c.base, c.x, c.y, c.w, c.h);
      if (act > 0.01) { ctx.globalCompositeOperation = TH.blend; ctx.globalAlpha = Math.min(1, act); ctx.drawImage(c.tint, c.x, c.y, c.w, c.h); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    }
    function drawPartial(pts, cd, ws, lim, col) {
      if (lim <= 0) return null;
      let n = pts.length; while (n > 2 && cd[n - 1] - cd[0] > lim) n--;
      if (n < 2) return null;
      ctx.fillStyle = col; ribbon(ctx, pts, ws, n, 1); return pts[n - 1];
    }
    function frame(now) {
      if (dead) return; raf = requestAnimationFrame(frame);
      if (now - last < 15.5) return; // at most ~60 redraws a second, even on 120-240Hz screens
      const rdt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!visible) return;
      const dt = rdt * speed; T += dt; useTheme(theme);
      if (T >= INTRO) {
        const lt = (T - INTRO) % L;
        if (lastLt === null) runEvents(-1, lt); else if (lt >= lastLt) runEvents(lastLt, lt); else { runEvents(lastLt, L); runEvents(-1, lt); }
        lastLt = lt;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const ba = sstep(0, 1.6, T);
      if (under) {
        if (ba !== staticAlpha) { uctx.setTransform(1, 0, 0, 1, 0, 0); uctx.clearRect(0, 0, under.width, under.height); uctx.globalAlpha = ba; uctx.drawImage(bg, 0, 0); uctx.globalAlpha = 1; staticAlpha = ba; }
      } else { ctx.globalAlpha = ba; ctx.drawImage(bg, 0, 0, W, H); ctx.globalAlpha = 1; }
      if (T > INTRO && Math.random() < dt * 0.9 && amb.length) {
        const N = amb[(Math.random() * amb.length) | 0], ax = N.axon;
        pulses.push({ pts: ax.pts, cd: ax.cd, len: ax.len, d: 0, v: ax.len / (1.3 + Math.random()), col: TH.input, a: N.far ? 0.14 : 0.28, w: 1.2 * N.s, trail: 50 * N.s, glow: 6 * N.s });
      }
      const P = sstep(0, INTRO, T);
      A.act *= Math.exp(-dt * 2.1); B.act *= Math.exp(-dt * 2.1);
      A.hover += ((hover === 'a' ? 1 : 0) - A.hover) * Math.min(1, rdt * 8); B.hover += ((hover === 'b' ? 1 : 0) - B.hover) * Math.min(1, rdt * 8);
      const rate = grow.target < grow.g ? 1.2 : 1.6; grow.g += clamp(grow.target - grow.g, -rate * dt, rate * dt);
      syn.w += ((syn.formed ? 1 : 0) - syn.w) * Math.min(1, dt * 2.5); syn.flash *= Math.exp(-dt * 3);
      if (P < 1) { drawNeuron(ctx, A, P, TH.ink, 0.9, 1, true); drawNeuron(ctx, B, sstep(0.15, 1, P), TH.ink, 0.9, 1); }
      else { drawCache(cacheA, A.act * 0.85 + A.hover * 0.3); drawCache(cacheB, B.act * 0.85 + B.hover * 0.3); }
      // growing processes, drawn live
      if (P >= 1) {
        const inkA = rgba(TH.ink, 0.9);
        let tipA = null;
        A.segs.forEach((sg) => { if (!sg.axon) return; const lim = aLen() - (sg.cd[0] - A.axon.cd[0]); const tp = drawPartial(sg.pts, sg.cd, sg.ws, lim, inkA); if (sg.pts === A.axon.pts) tipA = tp; });
        const tipR = drawPartial(reach.pts, reach.cd, reach.ws, rLen(), rgba(TH.ink, 0.9));
        ctx.fillStyle = inkA;
        [[tipA, A.s], [tipR, B.s]].forEach(([tp, s]) => { if (tp && grow.g < 0.995) { ctx.beginPath(); ctx.arc(tp[0], tp[1], 1.5 * s, 0, TAU); ctx.fill(); } });
      }
      ctx.globalCompositeOperation = TH.blend;
      [A, B].forEach((N) => {
        const a = N.act + N.hover * 0.2; if (a < 0.01) return;
        const g = ctx.createRadialGradient(N.x, N.y, 0, N.x, N.y, N.R * 6);
        g.addColorStop(0, rgba(TH.fire, (TH.blend === 'lighter' ? 0.22 : 0.09) * a)); g.addColorStop(1, rgba(TH.fire, 0));
        ctx.fillStyle = g; ctx.fillRect(N.x - N.R * 6, N.y - N.R * 6, N.R * 12, N.R * 12);
      });
      if (P >= 1 && (syn.w > 0.01 || syn.flash > 0.01)) {
        const s = A.s, Rg = (7 + 12 * syn.w + syn.flash * 9) * s;
        const g = ctx.createRadialGradient(syn.p[0], syn.p[1], 0, syn.p[0], syn.p[1], Rg);
        g.addColorStop(0, rgba(TH.syn || TH.fire, 0.2 + 0.5 * syn.w + 0.25 * syn.flash)); g.addColorStop(1, rgba(TH.syn || TH.fire, 0));
        ctx.fillStyle = g; ctx.fillRect(syn.p[0] - Rg, syn.p[1] - Rg, Rg * 2, Rg * 2);
      }
      const curP = pulses; pulses = []; const keptP = curP.filter((p) => { p.d += p.v * dt; if (p.d >= p.len + p.trail * 0.2) { p.done && p.done(); return false; } drawPulse(ctx, p); return true; }); pulses = keptP.concat(pulses);
      ctx.globalCompositeOperation = 'source-over';
      if (P >= 1) {
        const s = A.s, txt = syn.w > 0.5 ? 'synapse formed' : 'gap ' + Math.round((1 - grow.g) * 100) + '%';
        const fl = -1, lx = syn.p[0] - 70 * s, ly = syn.p[1] + 84 * s;
        ctx.strokeStyle = rgba(TH.ink, 0.4); ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(syn.p[0] - 4 * s, syn.p[1] + 6 * s); ctx.lineTo(syn.p[0] - 40 * s, ly - 5 * s); ctx.lineTo(lx + 4 * s, ly - 5 * s); ctx.stroke();
        ctx.textAlign = fl > 0 ? 'left' : 'right';
        ctx.font = `italic ${Math.round(16 * clamp(s, 0.9, 1.15))}px "EB Garamond", Georgia, serif`;
        ctx.save(); ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = TH.blend === 'lighter' ? 'rgba(10,11,13,0.9)' : 'rgba(237,227,204,0.95)'; ctx.strokeText(txt, lx, ly); ctx.restore();
        ctx.fillStyle = rgba(TH.ink, 0.85); ctx.fillText(txt, lx, ly); ctx.textAlign = 'left';
      }
    }

    build();
    let rt = 0;
    const ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { if (!dead) build(); }, 160); });
    ro.observe(canvas);
    const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; }); io.observe(canvas);
    raf = requestAnimationFrame(frame);
    return {
      destroy() { dead = true; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); if (under) under.remove(); },
      setHover(k) { hover = k; },
      setSpeed(v) { speed = v; },
      setAmbient(n) { ambientN = n; build(); },
    };
  }

  // ---------- section background: low-opacity veins + blurred neurons (scrolls with content) ----------
  function renderField(canvas, seed, density) {
    const rect = canvas.getBoundingClientRect(), dpr = 1;
    const W = Math.max(50, rect.width), H = Math.max(50, rect.height); canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, W, H);
    if (canvas._field) { canvas._field(); canvas._field = null; }
    const live = [];
    const n = makeNoise(seed), r = rng(seed), paper = TH.blend !== 'lighter', U = 520;
    ctx.globalCompositeOperation = paper ? 'source-over' : 'lighter'; ctx.lineCap = 'round';
    const ang = (x, y) => Math.PI / 2 + fbm(n, x / U, y / U, 3) * 1.9;
    const count = Math.round((W * H) / 330);
    for (let k = 0; k < count; k++) {
      const sx = r() * W, sy = r() * H, a0 = ang(sx, sy), dx = Math.abs(Math.cos(a0)), dy = Math.abs(Math.sin(a0)), dz = 0.5 + 0.5 * n(sx / 300 + 9, sy / 300);
      const m = Math.max(dx, dy, dz * 0.8); let col = [(dx / m) * 235, (dy / m) * 245, ((dz * 0.8) / m) * 225]; if (paper) col = col.map((v) => v * 0.55);
      ctx.strokeStyle = rgba(col, paper ? 0.025 : 0.016); ctx.lineWidth = 0.35 + r() * 0.45; ctx.beginPath();
      for (const dir of [1, -1]) { let x = sx, y = sy; ctx.moveTo(x, y); for (let i = 0; i < 30; i++) { const a = ang(x, y); x += Math.cos(a) * 4.5 * dir; y += Math.sin(a) * 4.5 * dir; ctx.lineTo(x, y); } }
      ctx.stroke();
    }
    const nb = 0;
    for (let i = 0; i < nb; i++) {
      const x = r() * W, y = r() * H, R0 = 140 + r() * 200, g = ctx.createRadialGradient(x, y, 0, x, y, R0);
      g.addColorStop(0, paper ? 'rgba(196,92,70,0.16)' : 'rgba(200,70,60,0.12)'); g.addColorStop(1, 'rgba(196,92,70,0)');
      ctx.fillStyle = g; ctx.fillRect(x - R0, y - R0, R0 * 2, R0 * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    if (density > 0) {
      const tmp = layer(W, H), t = tmp.getContext('2d'), placed = [];
      const area = (W * H) / 200000;
      // [count, scale range, blur px, alpha, colour, min spacing]
      const layers = [
        // very big: rare and faintest
        [Math.max(1, Math.round(area * 0.07 * density)), [1.9, 2.4], 3.4, 1, TH.ambNear, 900, 0.22],
        // big: the main population
        [Math.max(2, Math.round(area * 0.32 * density)), [1.05, 1.4], 2.0, 1, TH.ambNear, 380, 0.34],
        // medium: sparse, crisp accents
        [Math.max(1, Math.round(area * 0.14 * density)), [0.6, 0.75], 0.6, 0.9, TH.ambNear, 260, 0.42],
      ];
      layers.forEach(([cnt, [s0, s1], blur, al, col, sp, ga], li) => {
        t.clearRect(0, 0, W, H);
        for (let i = 0, tries = 0; i < cnt && tries < 500; tries++) {
          const side = r() < 0.5 ? 0 : 1, band = Math.min(0.27, 440 / W), x = side ? W * (1 - band * r()) : W * band * r(), y = r() * H;
          const sc = s0 + r() * (s1 - s0), rad = 150 * sc, GAP = 160;
          if (placed.some((p) => Math.hypot(p[0] - x, p[1] - y) < p[3] + rad + GAP)) continue;
          const N = growNeuron({ x, y, type: TYPES[(r() * TYPES.length) | 0], s: sc, seed: seed * 31 + li * 977 + tries, axonAng: 0.5 + r() * 2.2, axonLen: (240 + r() * 320) * sc });
          drawNeuron(t, N, 1, col, al, 1);
          placed.push([x, y, li, rad]); if (li > 0) live.push({ N, ga, li }); i++;
        }
        ctx.globalAlpha = TH.blend === 'lighter' ? ga * 0.7 : ga; ctx.filter = `blur(${blur}px)`; ctx.drawImage(tmp, 0, 0); ctx.filter = 'none'; ctx.globalAlpha = 1;
      });
    }
    // live layer: impulses travelling along the background axons, only while on screen
    if (!live.length) return;
    const still = layer(W, H); still.getContext('2d').drawImage(canvas, 0, 0);
    const th = TH; let pul = [], raf = 0, lastT = performance.now(), vis = false, dead = false;
    const io = new IntersectionObserver((es) => { vis = es[0].isIntersecting; if (vis && !raf) { lastT = performance.now(); raf = requestAnimationFrame(tick); } }); io.observe(canvas);
    function tick(now) {
      raf = 0; if (dead || !vis) return;
      const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
      if (Math.random() < dt * (0.15 + live.length * 0.05)) {
        const L = live[(Math.random() * live.length) | 0], ax = L.N.axon;
        pul.push({ pts: ax.pts, cd: ax.cd, len: ax.len, d: 0, v: ax.len / (1.6 + Math.random() * 1.2), col: th.input, a: L.li === 1 ? 0.35 : 0.5, w: 1.3 * L.N.s, trail: 70 * L.N.s, glow: 7 * L.N.s });
      }
      const prev = TH; TH = th;
      ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, W, H); ctx.drawImage(still, 0, 0);
      ctx.globalCompositeOperation = th.blend;
      pul = pul.filter((p) => { p.d += p.v * dt; if (p.d >= p.len + p.trail * 0.2) return false; drawPulse(ctx, p); return true; });
      ctx.globalCompositeOperation = 'source-over'; TH = prev;
      raf = requestAnimationFrame(tick);
    }
    canvas._field = () => { dead = true; io.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }
  // ---------- page background, tiled ----------
  // The background spans the full page and scrolls with it, but it is cut into
  // window-sized tiles. Tiles are generated only near the viewport, preferably in a
  // Web Worker (assets/js/field-worker.js) so scrolling never waits for them; tiles far
  // away are freed. Travelling impulses repaint only the small box around themselves.

  // The model is pure: given a page size and theme it can render any tile. It runs in
  // the worker, or on the main thread when workers / OffscreenCanvas are unavailable.
  function fieldModel(o) {
    useTheme(o.theme); const th = TH;
    const seed = o.seed || 1, density = o.density == null ? 1 : o.density;
    const W = o.W, H = o.H, TILE = o.TILE, nT = Math.ceil(H / TILE), M = 16;
    const paper = th.blend !== 'lighter', U = 520, n = makeNoise(seed);
    const ang = (x, y) => Math.PI / 2 + fbm(n, x / U, y / U, 3) * 1.9;

    // neuron placement over the whole page: positions only, morphology grown on demand
    const cells = [];
    if (density > 0) {
      const r = rng(seed * 7 + 3), area = (W * H) / 200000;
      const layers = [
        [Math.max(1, Math.round(area * 0.07 * density)), [1.9, 2.4], 3.4, 1, th.ambNear, 0.22],
        [Math.max(2, Math.round(area * 0.32 * density)), [1.05, 1.4], 2.0, 1, th.ambNear, 0.34],
        [Math.max(1, Math.round(area * 0.14 * density)), [0.6, 0.75], 0.6, 0.9, th.ambNear, 0.42],
      ];
      layers.forEach(([cnt, [s0, s1], blur, al, col, ga], li) => {
        for (let i = 0, tries = 0; i < cnt && tries < 500 + cnt * 40; tries++) {
          const side = r() < 0.5 ? 0 : 1, band = Math.min(0.27, 440 / W), x = side ? W * (1 - band * r()) : W * band * r(), y = r() * H;
          const sc = s0 + r() * (s1 - s0), rad = 150 * sc, GAP = 160;
          if (cells.some((p) => Math.hypot(p.x - x, p.y - y) < p.rad + rad + GAP)) continue;
          const g = { x, y, type: TYPES[(r() * TYPES.length) | 0], s: sc, seed: seed * 31 + li * 977 + tries, axonAng: 0.5 + r() * 2.2, axonLen: (240 + r() * 320) * sc };
          cells.push({ id: cells.length, x, y, rad, sc, li, blur, al, col, ga, g, N: null, reach: g.axonLen + 260 * sc });
          i++;
        }
      });
    }
    const grow = (c) => {
      if (!c.N) {
        c.N = growNeuron(c.g);
        let a = Infinity, b = -Infinity; c.N.axon.pts.forEach((p) => { if (p[1] < a) a = p[1]; if (p[1] > b) b = p[1]; });
        c.ay0 = a; c.ay1 = b;
      }
      return c.N;
    };
    const cellsIn = (y0, y1) => cells.filter((c) => c.y + c.reach > y0 && c.y - c.reach < y1).filter((c) => { const b = grow(c).bbox; return b[3] > y0 && b[1] < y1; });

    function renderTile(i) {
      const prev = TH; TH = th;
      const top = i * TILE, h = Math.min(TILE, H - top);
      const c = layer(W, h), ctx = c.getContext('2d');
      // fibres: generated per band of the page so neighbouring tiles agree at their seams.
      // Paper uses plain source-over, not multiply: at 2.5% alpha on a transparent tile they
      // look the same, but multiply makes the GPU copy the canvas for every stroke.
      ctx.globalCompositeOperation = paper ? 'source-over' : 'lighter'; ctx.lineCap = 'round';
      ctx.setTransform(1, 0, 0, 1, 0, -top);
      for (let b = i - 1; b <= i + 1; b++) {
        if (b < 0 || b >= nT) continue;
        const rb = rng(seed * 1013 + b * 7919 + 1), bt = b * TILE, bh = Math.min(TILE, H - bt), count = Math.round((W * bh) / 330);
        for (let k = 0; k < count; k++) {
          const sx = rb() * W, sy = bt + rb() * bh, lw = 0.35 + rb() * 0.45;
          if (sy < top - 140 || sy > top + h + 140) continue;
          const a0 = ang(sx, sy), dx = Math.abs(Math.cos(a0)), dy = Math.abs(Math.sin(a0)), dz = 0.5 + 0.5 * n(sx / 300 + 9, sy / 300);
          const m = Math.max(dx, dy, dz * 0.8); let col = [(dx / m) * 235, (dy / m) * 245, ((dz * 0.8) / m) * 225]; if (paper) col = col.map((v) => v * 0.55);
          ctx.strokeStyle = rgba(col, paper ? 0.025 : 0.016); ctx.lineWidth = lw; ctx.beginPath();
          for (const dir of [1, -1]) { let x = sx, y = sy; ctx.moveTo(x, y); for (let j = 0; j < 30; j++) { const a = ang(x, y); x += Math.cos(a) * 4.5 * dir; y += Math.sin(a) * 4.5 * dir; ctx.lineTo(x, y); } }
          ctx.stroke();
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over';
      // neurons: three depth layers, each blurred as one image. The two blurred layers are
      // drawn at half resolution (a quarter of the pixels) since they are soft anyway.
      const live = [];
      if (cells.length) {
        const here = cellsIn(top - M, top + h + M);
        for (let li = 0; li < 3; li++) {
          const L = here.filter((cl) => cl.li === li); if (!L.length) continue;
          const blur = L[0].blur, k = blur >= 1.5 ? 0.5 : 1;
          const tmp = layer(W * k, (h + 2 * M) * k), tx = tmp.getContext('2d');
          tx.setTransform(k, 0, 0, k, 0, (M - top) * k);
          L.forEach((cl) => drawNeuron(tx, cl.N, 1, cl.col, cl.al, 1));
          ctx.globalAlpha = paper ? L[0].ga : L[0].ga * 0.7; ctx.filter = `blur(${blur * k}px)`;
          ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, 0, -M, W, h + 2 * M);
          ctx.filter = 'none'; ctx.globalAlpha = 1;
        }
        here.forEach((cl) => { if (cl.li > 0) live.push({ id: cl.id, li: cl.li, s: cl.N.s, pts: cl.N.axon.pts, cd: cl.N.axon.cd, len: cl.N.axon.len, ay0: cl.ay0, ay1: cl.ay1 }); });
      }
      TH = prev;
      return { canvas: c, live, top, h };
    }
    return { renderTile, nT, TILE, W, H };
  }

  // the box a pulse currently paints, in page coordinates
  function pulseBox(p) {
    const head = p.d, tail = Math.max(0, head - p.trail), pts = p.pts, cd = p.cd;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (q) => { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; };
    add(pointAt(pts, cd, tail)); add(pointAt(pts, cd, head));
    for (let i = idxAt(cd, tail); i < pts.length && cd[i] <= head; i++) add(pts[i]);
    const m = Math.max(p.glow, p.w) + 3;
    return [x0 - m, y0 - m, x1 + m, y1 + m];
  }

  function mountField(el, opts) {
    opts = opts || {};
    let theme = opts.theme;
    const W = Math.max(50, Math.round(el.clientWidth)), H = Math.max(50, Math.round(el.clientHeight));
    const TILE = Math.round(clamp(window.innerHeight || 900, 600, 1400)), nT = Math.ceil(H / TILE);
    const base = { seed: opts.seed || 1, density: opts.density == null ? 1 : opts.density, W, H, TILE };
    let gen = 0, dead = false, shown = false;

    // renderer: a worker when possible, else the same model on the main thread
    let worker = null, local = null;
    if (opts.workerUrl && window.Worker && window.OffscreenCanvas && window.createImageBitmap) {
      try {
        worker = new Worker(opts.workerUrl);
        worker.onmessage = (e) => { const m = e.data; if (m.gen === gen) receive(tiles[m.i], m.bitmap, m.live); else if (m.bitmap) m.bitmap.close(); };
        worker.onerror = () => { worker.terminate(); worker = null; local = null; tiles.forEach((t) => { t.pending = false; if (t.want && !t.drawn) want(t); }); };
      } catch (e) { worker = null; }
    }
    function init() {
      gen++;
      if (worker) worker.postMessage({ type: 'init', gen, opts: Object.assign({ theme }, base) });
      else local = null;
    }

    const tiles = [];
    for (let i = 0; i < nT; i++) {
      const c = document.createElement('canvas'), top = i * TILE, h = Math.min(TILE, H - top);
      c.style.cssText = `position:absolute;left:0;top:${top}px;width:${W}px;height:${h}px;display:block`;
      c.setAttribute('aria-hidden', 'true'); c.width = 0; c.height = 0;
      const t = { c, i, top, h, drawn: false, want: false, pending: false, vis: false, still: null, live: [], boxes: [], gen: 0 };
      c._tile = t; el.appendChild(c); tiles.push(t);
    }

    function receive(t, img, live) {
      if (!t || dead || !t.want) { if (img && img.close) img.close(); return; }
      t.pending = false;
      if (t.still && t.still.close) t.still.close();
      t.c.width = W; t.c.height = t.h;
      t.c.getContext('2d').drawImage(img, 0, 0);
      t.still = img; t.live = live; t.boxes = []; t.drawn = true; t.gen = gen;
      if (!shown) { shown = true; el.style.opacity = opts.opacity == null ? '1' : String(opts.opacity); }
      kick(); pump();
    }
    function freeTile(t) {
      if (t.still && t.still.close) t.still.close();
      t.c.width = 0; t.c.height = 0; t.drawn = false; t.still = null; t.live = []; t.boxes = []; t.pending = false;
    }

    // request queue: visible tiles first; one tile at a time on the main thread fallback
    let qt = 0;
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 16));
    function pump() {
      if (dead) return;
      const todo = tiles.filter((t) => t.want && !t.pending && (!t.drawn || t.gen !== gen)).sort((a, b) => b.vis - a.vis);
      if (!todo.length) return;
      if (worker) {
        todo.forEach((t) => { t.pending = true; worker.postMessage({ type: 'tile', gen, i: t.i }); });
      } else if (!qt) {
        qt = idle(() => {
          qt = 0; if (dead) return;
          const t = todo[0]; if (!t.want) return pump();
          if (!local) local = fieldModel(Object.assign({ theme }, base));
          const out = local.renderTile(t.i);
          receive(t, out.canvas, out.live);
        }, { timeout: 150 });
      }
    }
    function want(t) { t.want = true; pump(); }

    const near = new IntersectionObserver((es) => es.forEach((e) => {
      const t = e.target._tile;
      if (e.isIntersecting) want(t);
      else { t.want = false; if (t.drawn || t.pending) freeTile(t); }
    }), { rootMargin: '150% 0px' });
    const seen = new IntersectionObserver((es) => { es.forEach((e) => { e.target._tile.vis = e.isIntersecting; }); kick(); pump(); });
    tiles.forEach((t) => { near.observe(t.c); seen.observe(t.c); });

    // impulses: only on visible tiles, and only the small box around each pulse is repainted
    let pul = [], raf = 0, lastT = 0;
    function kick() { if (!raf && !dead && tiles.some((t) => t.vis && t.drawn)) { lastT = performance.now(); raf = requestAnimationFrame(tick); } }
    function tick(now) {
      raf = 0; if (dead) return;
      const vt = tiles.filter((t) => t.vis && t.drawn); if (!vt.length) return;
      if (now - lastT < 32) { raf = requestAnimationFrame(tick); return; }
      const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
      useTheme(theme); const th = TH;
      const pool = [], ids = {};
      vt.forEach((t) => t.live.forEach((c) => { if (!ids[c.id]) { ids[c.id] = 1; pool.push(c); } }));
      if (pool.length && Math.random() < dt * (0.15 + pool.length * 0.05)) {
        const L = pool[(Math.random() * pool.length) | 0], s = L.s;
        pul.push({ pts: L.pts, cd: L.cd, len: L.len, d: 0, v: L.len / (1.6 + Math.random() * 1.2), col: th.input, a: L.li === 1 ? 0.35 : 0.5, w: 1.3 * s, trail: 70 * s, glow: 7 * s, y0: L.ay0 - 10 * s, y1: L.ay1 + 10 * s });
      }
      pul.forEach((p) => { p.d += p.v * dt; });
      pul = pul.filter((p) => p.d < p.len + p.trail * 0.2);
      const boxes = pul.map((p) => ({ p, b: pulseBox(p) }));
      vt.forEach((t) => {
        const mine = boxes.filter((q) => q.b[3] > t.top && q.b[1] < t.top + t.h);
        if (!mine.length && !t.boxes.length) return;
        const ctx = t.c.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over';
        // restore last frame's boxes and this frame's boxes from the clean tile
        t.boxes.concat(mine.map((q) => q.b)).forEach((b) => {
          const x = Math.max(0, Math.floor(b[0])), y = Math.max(0, Math.floor(b[1] - t.top));
          const w = Math.min(W, Math.ceil(b[2])) - x, h = Math.min(t.h, Math.ceil(b[3] - t.top)) - y;
          if (w > 0 && h > 0) { ctx.clearRect(x, y, w, h); ctx.drawImage(t.still, x, y, w, h, x, y, w, h); }
        });
        if (mine.length) {
          ctx.globalCompositeOperation = th.blend; ctx.setTransform(1, 0, 0, 1, 0, -t.top);
          mine.forEach((q) => drawPulse(ctx, q.p));
          ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over';
        }
        t.boxes = mine.map((q) => q.b);
      });
      raf = requestAnimationFrame(tick);
    }

    init();
    return {
      // theme change: the current tiles stay on screen until their replacements arrive
      setTheme(t) { if (t === theme) return; theme = t; pul = []; tiles.forEach((x) => { x.pending = false; }); init(); pump(); },
      destroy() {
        dead = true; near.disconnect(); seen.disconnect();
        if (raf) cancelAnimationFrame(raf);
        if (worker) worker.terminate();
        tiles.forEach((t) => { freeTile(t); t.c.remove(); });
      },
    };
  }

  // ---------- logo: a single inked cell body ----------
  function renderLogo(canvas, theme, bg, inkOverride) {
    useTheme(theme);
    const rect = canvas.getBoundingClientRect(), dpr = Math.max(2, window.devicePixelRatio || 1);
    const S = Math.max(16, Math.min(rect.width, rect.height) || 32); canvas.width = S * dpr; canvas.height = S * dpr;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, S, S);
    const cx = S * 0.5, cy = S * 0.6, ink = inkOverride || rgba(TH.ink, 1); ctx.fillStyle = ink;
    const curve = (ex, ey, a, L, w0, w1, bend) => {
      const tx = ex + Math.cos(a) * L * S, ty = ey + Math.sin(a) * L * S;
      const mx = (ex + tx) / 2 - Math.sin(a) * bend * L * S * 0.5, my = (ey + ty) / 2 + Math.cos(a) * bend * L * S * 0.5;
      const pts = [], ws = [], K = 28;
      for (let i = 0; i <= K; i++) { const t = i / K, u = 1 - t; pts.push([u * u * ex + 2 * u * t * mx + t * t * tx, u * u * ey + 2 * u * t * my + t * t * ty]); ws.push(mix(w0 * S, w1 * S, Math.pow(t, 0.85))); }
      ribbon(ctx, pts, ws, pts.length, 1); return pts;
    };
    // [angle, length, width, bend, fork]
    const den = [[-Math.PI / 2 + 0.05, 0.42, 0.11, 0.15, 0.5], [-Math.PI / 2 - 1.3, 0.24, 0.075, -0.6, 0], [-Math.PI / 2 + 1.35, 0.25, 0.075, 0.6, 0], [Math.PI / 2 + 0.85, 0.3, 0.075, 0.5, 0.6], [Math.PI / 2 - 0.9, 0.29, 0.075, -0.5, -0.6], [Math.PI / 2 + 0.08, 0.34, 0.06, 0.25, 0]];
    den.forEach(([a, L, w0, bend, fork]) => {
      const ex = cx + Math.cos(a) * S * 0.1, ey = cy + Math.sin(a) * S * 0.11;
      const pts = curve(ex, ey, a, L, w0, 0.014, bend);
      if (fork) { const p = pts[14], q = pts[15], h = Math.atan2(q[1] - p[1], q[0] - p[0]); curve(p[0], p[1], h + (fork > 0 ? 0.75 : -0.75), L * 0.42, w0 * 0.45, 0.012, -bend); if (a < 0) curve(p[0], p[1], h - 0.8, L * 0.38, w0 * 0.42, 0.012, bend); }
    });
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) { const t = (i / 48) * TAU, c = Math.cos(t + Math.PI / 2); let rr = S * 0.155 * (1 + 0.6 * Math.pow(Math.max(0, -c), 5)); const x = cx + Math.cos(t) * rr, y = cy + Math.sin(t) * rr * 1.08; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = bg || '#EDE3CC'; ctx.beginPath(); ctx.ellipse(cx + S * 0.006, cy + S * 0.018, S * 0.066, S * 0.06, 0.3, 0, TAU); ctx.fill();
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(cx + S * 0.018, cy + S * 0.012, S * 0.024, 0, TAU); ctx.fill();
  }
  // ---------- page-wide vein texture ----------
  function renderVeins(canvas, seed) {
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const W = Math.max(50, rect.width), H = Math.max(50, rect.height); canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const n = makeNoise(seed), r = rng(seed), paper = TH.blend !== 'lighter', U = 520;
    ctx.globalCompositeOperation = paper ? 'source-over' : 'lighter'; ctx.lineCap = 'round';
    const ang = (x, y) => Math.PI / 2 + fbm(n, x / U, y / U, 3) * 1.9;
    const count = Math.round((W * H) / 260);
    for (let k = 0; k < count; k++) {
      const sx = r() * W, sy = r() * H, a0 = ang(sx, sy), dx = Math.abs(Math.cos(a0)), dy = Math.abs(Math.sin(a0)), dz = 0.5 + 0.5 * n(sx / 300 + 9, sy / 300);
      const m = Math.max(dx, dy, dz * 0.8); let col = [(dx / m) * 235, (dy / m) * 245, ((dz * 0.8) / m) * 225]; if (paper) col = col.map((v) => v * 0.55);
      ctx.strokeStyle = rgba(col, paper ? 0.17 : 0.09); ctx.lineWidth = 0.35 + r() * 0.5; ctx.beginPath();
      for (const dir of [1, -1]) { let x = sx, y = sy; ctx.moveTo(x, y); for (let i = 0; i < 34; i++) { const a = ang(x, y); x += Math.cos(a) * 4.5 * dir; y += Math.sin(a) * 4.5 * dir; ctx.lineTo(x, y); } }
      ctx.stroke();
    }
    // blood blooms: soft red bleeds where the fibres converge
    const nb = 2 + Math.round((W * H) / 900000);
    for (let i = 0; i < nb; i++) {
      const x = r() * W, y = r() * H, R0 = 140 + r() * 220, g = ctx.createRadialGradient(x, y, 0, x, y, R0);
      g.addColorStop(0, paper ? 'rgba(196,92,70,0.22)' : 'rgba(200,70,60,0.16)'); g.addColorStop(1, 'rgba(196,92,70,0)');
      ctx.fillStyle = g; ctx.fillRect(x - R0, y - R0, R0 * 2, R0 * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- thumbnails ----------
  function renderThumb(canvas, seed, ghost, theme, type) {
    useTheme(theme);
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = rect.width || 120, H = rect.height || 150; canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    const tp = type || TYPES[Math.abs(seed | 0) % TYPES.length];
    const N = growNeuron({ x: 0, y: 0, s: 1, seed, type: tp, axonLen: tp === 'stellate' ? 70 : 90, axonAng: tp === 'pyramidal' || tp === 'purkinje' ? Math.PI / 2 + 0.25 : null });
    const [x0, y0, x1, y1] = N.tight, k = Math.min(W / (x1 - x0), H / (y1 - y0)) * 0.92;
    ctx.setTransform(k * dpr, 0, 0, k * dpr, (W / 2 - ((x0 + x1) / 2) * k) * dpr, (H / 2 - ((y0 + y1) / 2) * k) * dpr);
    drawNeuron(ctx, N, ghost ? 0.5 : 1, TH.ink, ghost ? 0.32 : 0.92, Math.max(1, 0.5 / k));
  }


  // ---------- plates: cortex / tractography / connectome ----------
  function brainEdge(nx, ny) {
    const ay = Math.abs(ny); if (ay >= 1) return -1;
    const Wd = Math.pow(1 - ny * ny, 0.42) * (0.9 + 0.1 * ny);
    const fw = 0.012 + (ay > 0.76 ? 0.2 * Math.pow((ay - 0.76) / 0.24, 2) : 0);
    const ax = Math.abs(nx);
    return Math.min(Wd - ax, ax - fw);
  }
  function plateGeom(canvas) {
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(50, rect.width), H = Math.max(50, rect.height);
    canvas.width = W * dpr; canvas.height = H * dpr;
    const bh = Math.min(H * 0.9, (W * 0.9) / 0.8), bw = bh * 0.8;
    return { ctx: canvas.getContext('2d'), dpr, W, H, bw, bh, cx: W / 2, cy: H / 2 };
  }
  function renderCortex(canvas, seed) {
    const g = plateGeom(canvas), r = rng(seed), n1 = makeNoise(seed + 3), n2 = makeNoise(seed + 41);
    const paper = TH.blend !== 'lighter', dpr = g.dpr;
    const W = Math.ceil(g.bw * dpr), H = Math.ceil(g.bh * dpr), sx = W / 2, sy = H / 2;
    const L = layer(W, H), c = L.getContext('2d');
    const base = paper ? [238, 214, 204] : [232, 200, 196], red = paper ? [168, 34, 38] : [176, 30, 40], dark = paper ? [64, 8, 12] : [52, 4, 10];
    c.fillStyle = rgba(base, 1); c.fillRect(0, 0, W, H);
    // sulci: evenly spaced streamlines of a meandering direction field (per hemisphere)
    const dsep = 0.058, dtest = dsep * 0.5, step = 0.005, cell = dsep;
    const grid = new Map(), key = (x, y) => ((x / cell) | 0) + ',' + ((y / cell) | 0);
    const near = (x, y, dmin, own) => {
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const arr = grid.get((cx + i) + ',' + (cy + j)); if (!arr) continue;
        for (const p of arr) { if (own && p[2] === own && Math.abs(p[3] - own.cur) < 10) continue; if ((p[0] - x) ** 2 + (p[1] - y) ** 2 < dmin * dmin) return true; }
      }
      return false;
    };
    const add = (x, y, own) => { const k = Math.floor(x / cell) + ',' + Math.floor(y / cell); let a2 = grid.get(k); if (!a2) grid.set(k, (a2 = [])); a2.push([x, y, own, own.cur]); };
    const field = (x, y) => {
      const hx = Math.abs(x), side = x < 0 ? 0 : 17.3;
      const w = fbm(n2, hx * 1.6 + side, y * 1.6, 2) * 0.9;
      let a2 = fbm(n1, hx * 2.3 + side + w, y * 2.0 + w, 3) * 6.5;
      a2 += 0.6 * Math.sin(y * 2.2) * (x < 0 ? -1 : 1);
      return a2;
    };
    const inside = (x, y) => brainEdge(x, y) > 0.012;
    const lines = [];
    const seeds = [];
    for (let i = 0; i < 2200; i++) seeds.push([r() * 2 - 1, r() * 2 - 1]);
    for (const [x0, y0] of seeds) {
      if (!inside(x0, y0) || near(x0, y0, dsep, null)) continue;
      const own = { cur: 0 }, half = [[], []];
      const maxLen = (0.7 + r() * 1.1) / step;
      for (let dir = 0; dir < 2; dir++) {
        let x = x0, y = y0, prev = null;
        for (let k = 0; k < maxLen / 2; k++) {
          let a2 = field(x, y), dx = Math.cos(a2), dy = Math.sin(a2);
          if (dir) { dx = -dx; dy = -dy; }
          if (prev && dx * prev[0] + dy * prev[1] < 0) { dx = -dx; dy = -dy; }
          prev = [dx, dy];
          x += dx * step; y += dy * step;
          own.cur = dir ? -(k + 1) : k + 1;
          if (!inside(x, y) || near(x, y, dtest, own)) break;
          half[dir].push([x, y]); add(x, y, own);
        }
      }
      const pts = half[1].reverse().concat([[x0, y0]], half[0]);
      if (pts.length > 16) lines.push(pts); 
    }
    const toPx = (p) => [sx + p[0] * sx, sy + p[1] * sy];
    const path = (pts, ox, oy) => { c.beginPath(); pts.forEach((p, i) => { const q = toPx(p); i ? c.lineTo(q[0] + ox, q[1] + oy) : c.moveTo(q[0] + ox, q[1] + oy); }); };
    const ds = dsep * sx;
    c.lineCap = 'round'; c.lineJoin = 'round';
    // gyral walls: soft red shading around each sulcus, offset toward light (upper-left gives shadow lower-right)
    for (const pts of lines) { path(pts, ds * 0.08, ds * 0.1); c.strokeStyle = rgba(red, 0.22); c.lineWidth = ds * 0.9; c.stroke(); }
    for (const pts of lines) { path(pts, ds * 0.04, ds * 0.05); c.strokeStyle = rgba(red, 0.62); c.lineWidth = ds * 0.42; c.stroke(); }
    for (const pts of lines) { path(pts, 0, 0); c.strokeStyle = rgba(dark, 0.9); c.lineWidth = Math.max(1, ds * 0.13); c.stroke(); }
    // crown highlights on the lit side
    for (const pts of lines) { path(pts, -ds * 0.32, -ds * 0.3); c.strokeStyle = rgba([255, 246, 240], paper ? 0.5 : 0.35); c.lineWidth = ds * 0.16; c.stroke(); }
    // engraving: fine diagonal hatching, multiplied
    c.save(); c.globalCompositeOperation = 'multiply'; c.strokeStyle = rgba(red, 0.16); c.lineWidth = Math.max(0.6, dpr * 0.45);
    const hs = Math.max(2.2, 2.6 * dpr); c.beginPath();
    for (let k = -H; k < W; k += hs) { c.moveTo(k, 0); c.lineTo(k + H * 0.6, H); }
    c.stroke(); c.restore();
    // mask to hemispheres + rim darkening
    const img = c.getImageData(0, 0, W, H), d = img.data;
    for (let y = 0; y < H; y++) { const ny = (y / H) * 2 - 1; for (let x = 0; x < W; x++) {
      const nx = (x / W) * 2 - 1, e = brainEdge(nx, ny), i = (y * W + x) * 4;
      if (e <= 0) { d[i + 3] = 0; continue; }
      const k = 0.55 + 0.45 * sstep(0, 0.16, e); d[i] *= k; d[i + 1] *= k * 0.92; d[i + 2] *= k * 0.92; d[i + 3] = 255 * sstep(0, 0.01, e);
    } }
    c.putImageData(img, 0, 0);
    g.ctx.drawImage(L, (g.cx - g.bw / 2) * dpr, (g.cy - g.bh / 2) * dpr);
  }
  function renderTracts(canvas, seed) {
    const g = plateGeom(canvas), n = makeNoise(seed), r = rng(seed), ctx = g.ctx;
    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0); const paper = TH.blend !== 'lighter'; ctx.globalCompositeOperation = paper ? 'source-over' : 'lighter'; ctx.lineCap = 'round';
    const toPx = (nx, ny) => [g.cx + (nx * g.bw) / 2, g.cy + (ny * g.bh) / 2];
    const ang = (nx, ny) => {
      const cc = sstep(0.42, 0.12, Math.abs(ny + 0.04)) * sstep(0.62, 0.18, Math.abs(nx));
      let a = mix(Math.PI / 2, 0, cc); a += nx * ny * 1.2 * (1 - cc); a += fbm(n, nx * 2.6, ny * 2.6, 3) * 1.3; return a;
    };
    const count = Math.round(6500 * Math.min(1, (g.bw * g.bh) / 300000) + 1500);
    for (let k = 0; k < count; k++) {
      let sx = r() * 2 - 1, sy = r() * 2 - 1; if (brainEdge(sx, sy) <= 0.01) continue;
      const a0 = ang(sx, sy), dx = Math.abs(Math.cos(a0)), dy = Math.abs(Math.sin(a0)), dz = 0.5 + 0.5 * n(sx * 3 + 9, sy * 3);
      const m = Math.max(dx, dy, dz * 0.8);
      let col = [(dx / m) * 235, (dy / m) * 245, ((dz * 0.8) / m) * 225];
      if (paper) col = col.map((v) => v * 0.55);
      const halves = [];
      for (const dir of [1, -1]) {
        let x = sx, y = sy; const seg = [];
        for (let i = 0; i < 36; i++) { const a = ang(x, y); x += Math.cos(a) * 0.011 * dir; y += Math.sin(a) * 0.011 * dir; if (brainEdge(x, y) <= 0) break; seg.push([x, y]); }
        halves.push(seg);
      }
      const line = halves[0].reverse().concat([[sx, sy]], halves[1]);
      if (line.length < 6) continue;
      ctx.strokeStyle = rgba(col, paper ? 0.2 : 0.1); ctx.lineWidth = 0.35 + r() * 0.5; ctx.beginPath();
      line.forEach((p, i) => { const q = toPx(p[0], p[1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke();
    }
  }
  function renderConnectome(canvas, seed) {
    const g = plateGeom(canvas), r = rng(seed), ctx = g.ctx;
    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    const toPx = (p) => [g.cx + (p[0] * g.bw) / 2, g.cy + (p[1] * g.bh) / 2];
    const nodes = [];
    for (let t = 0; t < 9000 && nodes.length < 230; t++) {
      const p = [r() * 2 - 1, r() * 2 - 1]; if (brainEdge(p[0], p[1]) <= 0.02) continue;
      if (nodes.some((q) => Math.hypot(q[0] - p[0], (q[1] - p[1]) * 0.8) < 0.085)) continue; nodes.push(p);
    }
    const nb = nodes.map((p, i) => nodes.map((q, j) => [j, Math.hypot(q[0] - p[0], q[1] - p[1])]).filter((x) => x[0] !== i).sort((a, b) => a[1] - b[1]).slice(0, 6));
    const paper = TH.blend !== 'lighter'; const eb = paper ? '43,74,140' : '80,140,255';
    ctx.globalCompositeOperation = paper ? 'source-over' : 'lighter'; ctx.lineWidth = 0.6;
    nodes.forEach((p, i) => nb[i].forEach(([j, dd]) => { if (j < i) return; const a = toPx(p), b = toPx(nodes[j]), mx = (a[0] + b[0]) / 2 + (a[1] - b[1]) * 0.18, my = (a[1] + b[1]) / 2 + (b[0] - a[0]) * 0.18; ctx.strokeStyle = `rgba(${eb},${0.3 - dd * 0.6})`; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(mx, my, b[0], b[1]); ctx.stroke(); }));
    for (let k = 0; k < 70; k++) { const i = (r() * nodes.length) | 0, j = (r() * nodes.length) | 0; const a = toPx(nodes[i]), b = toPx(nodes[j]); if (Math.abs(nodes[i][0] - nodes[j][0]) > 0.35) continue; ctx.strokeStyle = `rgba(${eb},0.08)`; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    nodes.forEach((p) => { const a = toPx(p); const gr = ctx.createRadialGradient(a[0], a[1], 0, a[0], a[1], 5); gr.addColorStop(0, paper ? 'rgba(30,52,110,0.95)' : 'rgba(170,205,255,0.95)'); gr.addColorStop(1, `rgba(${eb},0)`); ctx.fillStyle = gr; ctx.fillRect(a[0] - 5, a[1] - 5, 10, 10); });
    ctx.globalCompositeOperation = 'source-over';
    const walk = (from, to) => {
      let i = 0, best = 1e9; nodes.forEach((p, k) => { const d = Math.hypot(p[0] - from[0], p[1] - from[1]); if (d < best) { best = d; i = k; } });
      const path = [i];
      for (let s = 0; s < 14; s++) { const p = nodes[i]; if (Math.hypot(p[0] - to[0], p[1] - to[1]) < 0.12) break; let nx = -1, bd = 1e9; nb[i].forEach(([j]) => { if (path.includes(j)) return; const d = Math.hypot(nodes[j][0] - to[0], nodes[j][1] - to[1]); if (d < bd) { bd = d; nx = j; } }); if (nx < 0) break; path.push(nx); i = nx; }
      return path.map((k) => toPx(nodes[k]));
    };
    [[[-0.4, -0.6], [-0.42, 0.62], paper ? [46, 112, 72] : C.green], [[0.3, -0.7], [0.36, 0.66], paper ? [168, 60, 38] : C.amber]].forEach(([f, t, col]) => {
      const pts = walk(f, t); ctx.lineWidth = 2; ctx.strokeStyle = rgba(col, 0.95); ctx.shadowColor = rgba(col, 0.9); ctx.shadowBlur = paper ? 0 : 10;
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      ctx.shadowBlur = 0; ctx.fillStyle = rgba(col, 1); [pts[0], pts[pts.length - 1]].forEach((p) => { ctx.beginPath(); ctx.arc(p[0], p[1], 3.5, 0, TAU); ctx.fill(); });
    });
  }
  function renderPlate(canvas, kind, seed, theme) {
    seed = seed || 1; useTheme(theme);
    if (kind === 'cortex') renderCortex(canvas, seed);
    else if (kind === 'tracts') renderTracts(canvas, seed);
    else if (kind === 'connectome') renderConnectome(canvas, seed);
    else if (kind === 'veins') renderVeins(canvas, seed);
    else if (kind === 'field') renderField(canvas, seed, +(canvas.getAttribute('data-neurons') || 0));
    const op = canvas.getAttribute('data-op'); canvas.style.opacity = op == null ? '1' : op;
  }

  function renderSpecimen(canvas, seed, theme, type, fx, fy) {
    useTheme(theme);
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = rect.width || 500, H = rect.height || 600; canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    const tp = type || TYPES[Math.abs(seed | 0) % TYPES.length];
    const N = growNeuron({ x: 0, y: 0, s: 1, seed, type: tp, axonLen: 110, axonAng: tp === 'pyramidal' || tp === 'purkinje' ? Math.PI / 2 + 0.25 : null });
    const [x0, y0, x1, y1] = N.tight, k = Math.min(Math.min(W / (x1 - x0), H / (y1 - y0)) * 1.1, 15 / N.R), oy = H * (fy == null ? 0.42 : fy);
    ctx.setTransform(k * dpr, 0, 0, k * dpr, (W * (fx == null ? 0.5 : fx)) * dpr, oy * dpr);
    drawNeuron(ctx, N, 1, TH.ink, 0.92, Math.max(1, 0.6 / k), true);
  }
  window.LLMEngine = { mountHero, mountField, fieldModel, renderPlate, renderThumb, renderSpecimen, renderLogo, growNeuron, TYPES };
})();
