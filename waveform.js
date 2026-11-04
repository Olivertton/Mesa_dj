/* Forma de onda: cálculo de picos y dibujo (vista general + vista con scroll y rejilla de pulsos). */
(function (root) {
  'use strict';

  var PEAKS_PER_SEC = 200;
  var VIEW_SECONDS = 6; // segundos reales visibles en la vista con scroll

  // Un pico (valor absoluto máximo de los canales) cada 1/200 s aprox.
  function computePeaks(buffer) {
    var sr = buffer.sampleRate;
    var spp = Math.max(1, Math.floor(sr / PEAKS_PER_SEC));
    var n = Math.ceil(buffer.length / spp);
    var peaks = new Float32Array(n);
    var nc = buffer.numberOfChannels;
    for (var c = 0; c < nc; c++) {
      var d = buffer.getChannelData(c);
      for (var p = 0; p < n; p++) {
        var s = p * spp, e = Math.min(buffer.length, s + spp), m = peaks[p];
        for (var i = s; i < e; i++) {
          var v = d[i] < 0 ? -d[i] : d[i];
          if (v > m) m = v;
        }
        peaks[p] = m;
      }
    }
    return { peaks: peaks, perSec: sr / spp };
  }

  function fit(canvas) {
    var dpr = window.devicePixelRatio || 1;
    var w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    var h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return { w: w, h: h, dpr: dpr };
  }

  function drawOverview(canvas, deck, color) {
    var z = fit(canvas), ctx = canvas.getContext('2d'), w = z.w, h = z.h;
    ctx.clearRect(0, 0, w, h);
    if (!deck.buffer || !deck.peaks) return;
    var dur = deck.duration, peaks = deck.peaks, per = deck.peaksPerSec;
    var played = Math.floor(deck.position() / dur * w);
    for (var x = 0; x < w; x++) {
      var a = Math.floor(x / w * dur * per), b = Math.max(a + 1, Math.floor((x + 1) / w * dur * per));
      var m = 0;
      for (var i = a; i < b && i < peaks.length; i++) if (peaks[i] > m) m = peaks[i];
      var bh = Math.max(1, m * h * 0.95);
      ctx.fillStyle = color;
      ctx.globalAlpha = x < played ? 0.35 : 0.9;
      ctx.fillRect(x, (h - bh) / 2, 1, bh);
    }
    ctx.globalAlpha = 1;
    // punto cue
    ctx.fillStyle = '#ffb020';
    ctx.fillRect(Math.floor(deck.cuePoint / dur * w), 0, Math.max(1, z.dpr), h);
    // cabezal
    ctx.fillStyle = '#fff';
    ctx.fillRect(played, 0, Math.max(2, z.dpr * 1.5), h);
  }

  function drawScroll(canvas, deck, color) {
    var z = fit(canvas), ctx = canvas.getContext('2d'), w = z.w, h = z.h;
    ctx.clearRect(0, 0, w, h);
    if (!deck.buffer || !deck.peaks) return;
    var pos = deck.position(), rate = deck.rate;
    var span = VIEW_SECONDS * rate;           // segundos de pista visibles (escala con el tempo)
    var t0 = pos - span / 2, perPx = span / w;
    var peaks = deck.peaks, per = deck.peaksPerSec;

    ctx.fillStyle = color;
    for (var x = 0; x < w; x++) {
      var t = t0 + x * perPx;
      if (t < 0 || t > deck.duration) continue;
      var a = Math.floor(t * per), b = Math.max(a + 1, Math.floor((t + perPx) * per));
      var m = 0;
      for (var i = a; i < b && i < peaks.length; i++) if (peaks[i] > m) m = peaks[i];
      var bh = Math.max(1, m * h * 0.92);
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, (h - bh) / 2, 1, bh);
    }
    ctx.globalAlpha = 1;

    // rejilla de pulsos
    if (deck.bpm) {
      var period = 60 / deck.bpm;
      var k0 = Math.ceil((t0 - deck.firstBeat) / period);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (var k = k0; ; k++) {
        var bt = deck.firstBeat + k * period;
        if (bt > t0 + span) break;
        if (bt < 0) continue;
        var bx = Math.round((bt - t0) / perPx);
        ctx.fillRect(bx, 0, Math.max(1, z.dpr), h);
      }
    }

    // punto cue
    var cx = (deck.cuePoint - t0) / perPx;
    if (cx >= 0 && cx <= w) {
      ctx.fillStyle = '#ffb020';
      ctx.fillRect(Math.round(cx), 0, Math.max(2, z.dpr * 2), h);
    }
    // cabezal central
    ctx.fillStyle = '#ff3b3b';
    ctx.fillRect(Math.round(w / 2) - 1, 0, Math.max(2, z.dpr * 2), h);
  }

  var api = { computePeaks: computePeaks, drawOverview: drawOverview, drawScroll: drawScroll };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Waveform = api;
})(typeof window !== 'undefined' ? window : globalThis);
