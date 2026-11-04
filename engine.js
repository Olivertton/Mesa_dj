/* Motor de audio de un deck: reproducción, pausa, cue, tempo y búsqueda.
 * Sin dependencias del DOM. Funciona en el navegador (window.Deck) y en Node (pruebas con un ctx falso).
 */
(function (root) {
  'use strict';

  var TEMPO_RANGE = 0.08; // el fader de tempo llega a ±8 %

  function Deck(id) {
    this.id = id;
    this.ctx = null;
    this.input = null;        // salida del deck; en etapas siguientes irá a canal/EQ/crossfader
    this.buffer = null;
    this.src = null;
    this.playing = false;
    this.pos = 0;             // posición (s) cuando está en pausa
    this.anchorT = 0;         // ctx.currentTime en el último ancla
    this.anchorPos = 0;       // posición (s) en ese instante
    this.tempo = 0;           // fracción: 0.03 = +3 %
    this.cuePoint = 0;
    this.cuePreview = false;  // CUE mantenido: suena mientras se pulsa
    this.name = '';
    this.bpm = 0;             // BPM de la pista a velocidad 1.0 (0 = desconocido)
    this.firstBeat = 0;
    this.peaks = null;
    this.peaksPerSec = 0;
  }

  Deck.TEMPO_RANGE = TEMPO_RANGE;

  Deck.prototype.init = function (ctx, destination) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.input.connect(destination);
  };

  Object.defineProperty(Deck.prototype, 'rate', {
    get: function () { return 1 + this.tempo; }
  });

  Object.defineProperty(Deck.prototype, 'duration', {
    get: function () { return this.buffer ? this.buffer.duration : 0; }
  });

  Deck.prototype.position = function () {
    if (!this.buffer) return 0;
    if (!this.playing) return this.pos;
    var p = this.anchorPos + (this.ctx.currentTime - this.anchorT) * this.rate;
    return Math.min(p, this.buffer.duration);
  };

  Deck.prototype.currentBpm = function () {
    return this.bpm ? this.bpm * this.rate : 0;
  };

  Deck.prototype._stopSource = function () {
    var s = this.src;
    if (!s) return;
    this.src = null;
    s.onended = null;
    try { s.stop(); } catch (e) { /* ya parado */ }
    try { s.disconnect(); } catch (e) { /* ya desconectado */ }
  };

  Deck.prototype._startSource = function (pos) {
    var self = this;
    this._stopSource();
    if (!this.buffer || pos >= this.buffer.duration) {
      this.playing = false;
      this.pos = this.buffer ? this.buffer.duration : 0;
      return;
    }
    var s = this.ctx.createBufferSource();
    s.buffer = this.buffer;
    s.playbackRate.value = this.rate;
    s.connect(this.input);
    s.onended = function () {
      if (self.src !== s) return; // fue parada a mano
      self.src = null;
      self.playing = false;
      self.cuePreview = false;
      self.pos = self.buffer.duration;
    };
    s.start(0, pos);
    this.src = s;
    this.anchorT = this.ctx.currentTime;
    this.anchorPos = pos;
    this.playing = true;
  };

  Deck.prototype.setTrack = function (name, buffer, peaks, peaksPerSec, analysis) {
    this._stopSource();
    this.playing = false;
    this.cuePreview = false;
    this.name = name;
    this.buffer = buffer;
    this.peaks = peaks;
    this.peaksPerSec = peaksPerSec;
    this.bpm = analysis ? analysis.bpm : 0;
    this.firstBeat = analysis ? analysis.firstBeat : 0;
    this.cuePoint = this.firstBeat;
    this.pos = this.firstBeat;
  };

  Deck.prototype.play = function () {
    if (!this.buffer || this.playing) return;
    var p = this.pos >= this.buffer.duration - 0.05 ? 0 : this.pos;
    this._startSource(p);
  };

  Deck.prototype.pause = function () {
    if (!this.buffer || !this.playing) return;
    var p = this.position();
    this._stopSource();
    this.playing = false;
    this.pos = p;
  };

  // Botón PLAY/PAUSE. Si se pulsa con CUE mantenido, la reproducción continúa al soltar CUE.
  Deck.prototype.playButton = function () {
    if (!this.buffer) return;
    if (this.cuePreview) { this.cuePreview = false; return; }
    if (this.playing) this.pause(); else this.play();
  };

  Deck.prototype.seek = function (sec) {
    if (!this.buffer) return;
    sec = Math.max(0, Math.min(this.buffer.duration, sec));
    if (this.playing) this._startSource(sec);
    else this.pos = sec;
  };

  Deck.prototype.setTempo = function (t) {
    t = Math.max(-TEMPO_RANGE, Math.min(TEMPO_RANGE, t));
    if (this.playing) {
      this.anchorPos = this.position();
      this.anchorT = this.ctx.currentTime;
    }
    this.tempo = t;
    if (this.src) this.src.playbackRate.value = this.rate;
  };

  // Cambia la interpretación del BPM (½ o ×2) sin tocar el audio.
  Deck.prototype.scaleBpm = function (factor) {
    if (this.bpm) this.bpm *= factor;
  };

  /* Comportamiento CUE (estilo Pioneer):
   *  - sonando: vuelve al punto cue y se pausa.
   *  - en pausa y fuera del cue: fija el punto cue aquí.
   *  - en pausa sobre el cue: suena mientras se mantiene pulsado; al soltar vuelve al cue. */
  Deck.prototype.cueDown = function () {
    if (!this.buffer) return;
    if (this.playing) {
      this._stopSource();
      this.playing = false;
      this.pos = this.cuePoint;
    } else if (Math.abs(this.pos - this.cuePoint) < 0.02) {
      this.cuePreview = true;
      this._startSource(this.cuePoint);
    } else {
      this.cuePoint = this.pos;
    }
  };

  Deck.prototype.cueUp = function () {
    if (!this.cuePreview) return;
    this.cuePreview = false;
    this._stopSource();
    this.playing = false;
    this.pos = this.cuePoint;
  };

  var api = Deck;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Deck = api;
})(typeof window !== 'undefined' ? window : globalThis);
