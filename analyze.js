/* Detección de BPM y rejilla de pulsos (beat grid).
 * Funciones puras: reciben canales de audio (Float32Array) y devuelven datos.
 * Sirve tanto en el navegador (window.Analyze) como en Node (para pruebas).
 */
(function (root) {
  'use strict';

  var HOP = 256; // muestras por fotograma de análisis (~5.8 ms a 44.1 kHz)
  var MIN_BPM = 75, MAX_BPM = 175;
  var MAX_SECONDS = 180; // se analiza como máximo este tramo (centrado en la pista)

  function mean(a) {
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i];
    return a.length ? s / a.length : 0;
  }

  // Envolventes de energía: banda grave (< ~150 Hz) y banda completa.
  function envelopes(channels, sr, startSample, frames) {
    var low = new Float32Array(frames), full = new Float32Array(frames);
    var a = 1 - Math.exp(-2 * Math.PI * 150 / sr);
    var y1 = 0, y2 = 0, nc = channels.length;
    for (var f = 0; f < frames; f++) {
      var sl = 0, sf = 0, s0 = startSample + f * HOP;
      for (var i = 0; i < HOP; i++) {
        var x = 0;
        for (var c = 0; c < nc; c++) x += channels[c][s0 + i];
        x /= nc;
        y1 += a * (x - y1);
        y2 += a * (y1 - y2);
        sl += y2 * y2;
        sf += x * x;
      }
      low[f] = Math.sqrt(sl / HOP);
      full[f] = Math.sqrt(sf / HOP);
    }
    return { low: low, full: full };
  }

  // Aumentos positivos de energía (en escala logarítmica) = ataques.
  function flux(env) {
    var m = mean(env) + 1e-12, n = env.length;
    var out = new Float32Array(n), prev = Math.log1p(8 * env[0] / m);
    for (var i = 1; i < n; i++) {
      var v = Math.log1p(8 * env[i] / m), d = v - prev;
      out[i] = d > 0 ? d : 0;
      prev = v;
    }
    return out;
  }

  function onsetFunction(channels, sr, startSample, frames) {
    var e = envelopes(channels, sr, startSample, frames);
    var fl = flux(e.low), ff = flux(e.full);
    var ml = mean(fl) + 1e-9, mf = mean(ff) + 1e-9;
    var o = new Float32Array(frames);
    for (var i = 0; i < frames; i++) o[i] = fl[i] / ml + 0.5 * ff[i] / mf;
    return { o: o, energy: mean(e.full) };
  }

  // Quita la media local (ventana ~0.5 s) para que la autocorrelación no vea "DC".
  function detrend(o, fps) {
    var n = o.length, w = Math.round(fps * 0.25);
    var cum = new Float64Array(n + 1);
    for (var i = 0; i < n; i++) cum[i + 1] = cum[i] + o[i];
    var out = new Float32Array(n);
    for (i = 0; i < n; i++) {
      var lo = Math.max(0, i - w), hi = Math.min(n, i + w + 1);
      out[i] = o[i] - (cum[hi] - cum[lo]) / (hi - lo);
    }
    return out;
  }

  // BPM aproximado: puntúa cada tempo candidato con la autocorrelación a 1,2,3,4 pulsos.
  function coarseBpm(od, fps) {
    var maxLag = Math.ceil(4 * fps * 60 / MIN_BPM) + 3;
    var N = od.length, R = new Float32Array(maxLag + 2);
    for (var lag = 1; lag <= maxLag; lag++) {
      var s = 0;
      for (var i = 0; i + lag < N; i++) s += od[i] * od[i + lag];
      R[lag] = s / (N - lag);
    }
    function at(x) { var i = Math.floor(x), f = x - i; return R[i] * (1 - f) + R[i + 1] * f; }
    var cands = [], minS = Infinity;
    for (var b = MIN_BPM; b <= MAX_BPM; b += 0.1) {
      var L = fps * 60 / b, sc = 0;
      for (var k = 1; k <= 4; k++) sc += at(k * L);
      cands.push([b, sc]);
      if (sc < minS) minS = sc;
    }
    var best = 0, bestScore = -Infinity;
    for (i = 0; i < cands.length; i++) {
      var oct = Math.log(cands[i][0] / 115) / Math.LN2;
      var prior = Math.exp(-0.5 * oct * oct / 0.49); // preferencia suave por ~115 BPM
      var v = (cands[i][1] - minS) * prior;
      if (v > bestScore) { bestScore = v; best = cands[i][0]; }
    }
    return best;
  }

  function smooth3(o) {
    var n = o.length, s = new Float32Array(n);
    for (var i = 1; i < n - 1; i++) s[i] = 0.25 * o[i - 1] + 0.5 * o[i] + 0.25 * o[i + 1];
    return s;
  }

  // Mejor fase (posición del primer pulso dentro del periodo), en fotogramas.
  function bestPhase(os, P) {
    var N = os.length, best = 0, bestSum = -1;
    for (var phi = 0; phi < P; phi++) {
      var s = 0, c = 0;
      for (var t = phi; t < N - 1; t += P) { s += os[Math.round(t)]; c++; }
      s /= Math.max(1, c);
      if (s > bestSum) { bestSum = s; best = phi; }
    }
    return best;
  }

  // Ajuste lineal t = a + b*k de los picos de ataque cerca de cada pulso previsto.
  function fitBeats(o, P, phi, kLo, kHi, win) {
    var N = o.length, pts = [];
    for (var k = kLo; k <= kHi; k++) {
      var tp = phi + k * P, c = Math.round(tp);
      var lo = Math.max(1, c - win), hi = Math.min(N - 2, c + win);
      if (hi <= lo) continue;
      var bi = lo;
      for (var i = lo; i <= hi; i++) if (o[i] > o[bi]) bi = i;
      if (o[bi] <= 0) continue;
      var a = o[bi - 1], b = o[bi], d = o[bi + 1], den = a - 2 * b + d;
      var delta = den !== 0 ? 0.5 * (a - d) / den : 0;
      if (delta > 0.5 || delta < -0.5) delta = 0;
      pts.push({ k: k, t: bi + delta, w: b });
    }
    if (pts.length < 4) return null;
    var res, inl = pts;
    for (var pass = 0; pass < 2; pass++) {
      var sw = 0, sk = 0, st = 0, skk = 0, skt = 0;
      for (i = 0; i < inl.length; i++) {
        var p = inl[i];
        sw += p.w; sk += p.w * p.k; st += p.w * p.t; skk += p.w * p.k * p.k; skt += p.w * p.k * p.t;
      }
      var det = sw * skk - sk * sk;
      if (det === 0) return null;
      var slope = (sw * skt - sk * st) / det, icpt = (st - slope * sk) / sw;
      res = { P: slope, phi: icpt, inliers: inl.length, total: pts.length };
      if (pass === 0) {
        var r = pts.map(function (q) { return Math.abs(q.t - (icpt + slope * q.k)); });
        var sorted = r.slice().sort(function (x, y) { return x - y; });
        var lim = Math.max(2.5 * sorted[Math.floor(sorted.length / 2)], 1.5);
        inl = pts.filter(function (q, j) { return r[j] <= lim; });
        if (inl.length < 4) return res;
      }
    }
    return res;
  }

  /* channels: array de Float32Array (1 o 2 canales); sr: frecuencia de muestreo.
   * Devuelve { bpm, firstBeat (s), period (s), confidence } o null si no hay pulso claro. */
  function analyzeBpm(channels, sr) {
    var total = Math.floor(channels[0].length / HOP);
    var maxFrames = Math.floor(MAX_SECONDS * sr / HOP);
    var frames = Math.min(total, maxFrames);
    if (frames < sr * 8 / HOP) return null; // pista demasiado corta
    var startFrame = Math.floor((total - frames) / 2);
    var fps = sr / HOP;

    var of = onsetFunction(channels, sr, startFrame * HOP, frames);
    if (of.energy < 1e-5) return null;
    var o = of.o, od = detrend(o, fps);

    var b0 = coarseBpm(od, fps);
    var P = fps * 60 / b0;
    var os = smooth3(o);
    var phi = bestPhase(os, P);

    // Refinado progresivo: se ajusta con pocos pulsos centrales y se va ampliando.
    var nb = Math.floor((frames - 2 - phi) / P);
    var kc = Math.floor(nb / 2), span = 8, fit = null;
    for (;;) {
      var kLo = Math.max(0, kc - span), kHi = Math.min(nb, kc + span);
      var win = Math.max(2, Math.round(P * 0.1));
      var f = fitBeats(os, P, phi, kLo, kHi, win);
      if (f && f.P > P * 0.9 && f.P < P * 1.1) { P = f.P; phi = f.phi; fit = f; }
      if (kLo === 0 && kHi === nb) break;
      span *= 2;
    }
    if (!fit) return null;

    var periodSec = P * HOP / sr;
    var bpm = 60 / periodSec;
    var segStart = startFrame * HOP / sr;
    var first = (segStart + (phi + 0.5) * HOP / sr) % periodSec;
    if (first < 0) first += periodSec;
    return { bpm: bpm, firstBeat: first, period: periodSec, confidence: fit.inliers / fit.total };
  }

  var api = { analyzeBpm: analyzeBpm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Analyze = api;
})(typeof window !== 'undefined' ? window : globalThis);
