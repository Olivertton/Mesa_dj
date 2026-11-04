/* Mezclador: trim → fader de canal → crossfader → master → limitador → salida.
 * Las curvas son funciones puras (se prueban en Node); la clase Mixer solo conecta nodos de Web Audio.
 * En la etapa 3 el EQ y el CFX se insertan entre el trim y el fader de canal.
 */
(function (root) {
  'use strict';

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  // Trim: la posición central es 0 dB; hacia la izquierda baja hasta –∞ y hacia la derecha sube hasta +9 dB.
  function trimGain(v) {
    v = clamp(v, 0, 1);
    if (v < 0.01) return 0;
    var db = v >= 0.5 ? (v - 0.5) * 2 * 9 : (v - 0.5) * 2 * 40;
    return Math.pow(10, db / 20);
  }

  // Fader de canal: arriba = 1 (0 dB). Curva cuadrática: la mitad del recorrido son unos –12 dB.
  function channelGain(v) {
    v = clamp(v, 0, 1);
    return v * v;
  }

  // Crossfader (x de –1 = deck 1 a +1 = deck 2): el centro deja pasar los dos decks al máximo.
  function crossfaderGains(x) {
    x = clamp(x, -1, 1);
    var g1 = x <= 0 ? 1 : (x > 0.999 ? 0 : Math.cos(x * Math.PI / 2));
    var g2 = x >= 0 ? 1 : (x < -0.999 ? 0 : Math.cos(-x * Math.PI / 2));
    return [g1, g2];
  }

  // Master: con el knob en 0.8 (valor por defecto) la ganancia es 0.9, como antes.
  function masterGain(v) {
    v = clamp(v, 0, 1);
    return 0.9 * Math.pow(v / 0.8, 2);
  }

  // Pico (0..1) → número de LEDs encendidos (0..6) del vúmetro.
  var LED_DB = [-42, -30, -20, -12, -6, -1.5];
  function ledCount(peak) {
    if (!(peak > 0)) return 0;
    var db = 20 * Math.log(peak) / Math.LN10, n = 0;
    for (var i = 0; i < LED_DB.length; i++) if (db >= LED_DB[i]) n = i + 1;
    return n;
  }

  function Mixer(ctx) {
    var self = this;
    this.ctx = ctx;
    this.master = ctx.createGain();
    // limitador: evita que la suma de dos decks distorsione de golpe (y protege los oídos)
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.08;
    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    this.ch = [0, 1].map(function () {
      var c = {
        trim: ctx.createGain(), fader: ctx.createGain(), xf: ctx.createGain(),
        meter: ctx.createAnalyser()
      };
      c.meter.fftSize = 1024;
      c.buf = new Float32Array(c.meter.fftSize);
      c.trim.connect(c.fader);
      c.fader.connect(c.xf);
      c.fader.connect(c.meter);       // el vúmetro mide después del trim y del fader, antes del crossfader
      c.xf.connect(self.master);
      return c;
    });
  }

  // Suaviza los cambios para que no haya chasquidos al mover un control.
  Mixer.prototype._set = function (param, v) {
    param.setTargetAtTime(v, this.ctx.currentTime, 0.01);
  };
  Mixer.prototype.input = function (i) { return this.ch[i].trim; };
  Mixer.prototype.setTrim = function (i, v) { this._set(this.ch[i].trim.gain, trimGain(v)); };
  Mixer.prototype.setChannel = function (i, v) { this._set(this.ch[i].fader.gain, channelGain(v)); };
  Mixer.prototype.setCrossfader = function (x) {
    var g = crossfaderGains(x);
    this._set(this.ch[0].xf.gain, g[0]);
    this._set(this.ch[1].xf.gain, g[1]);
  };
  Mixer.prototype.setMaster = function (v) { this._set(this.master.gain, masterGain(v)); };

  // state: { trim: [v, v], chan: [v, v], xf: x, master: v }
  Mixer.prototype.apply = function (s) {
    for (var i = 0; i < 2; i++) { this.setTrim(i, s.trim[i]); this.setChannel(i, s.chan[i]); }
    this.setCrossfader(s.xf);
    this.setMaster(s.master);
  };

  // Pico reciente (0..1) del canal i.
  Mixer.prototype.peak = function (i) {
    var c = this.ch[i], b = c.buf, m = 0;
    c.meter.getFloatTimeDomainData(b);
    for (var k = 0; k < b.length; k++) { var a = b[k] < 0 ? -b[k] : b[k]; if (a > m) m = a; }
    return m;
  };

  Mixer.curves = { trimGain: trimGain, channelGain: channelGain, crossfaderGains: crossfaderGains, masterGain: masterGain, ledCount: ledCount };
  if (typeof module !== 'undefined' && module.exports) module.exports = Mixer;
  else root.Mixer = Mixer;
})(typeof window !== 'undefined' ? window : globalThis);
