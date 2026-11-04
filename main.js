/* Une el panel con los decks: carga de archivos, controles activos y bucle de dibujo. */
(function () {
  'use strict';

  var refs = Panel.build(document.getElementById('screen'), document.getElementById('panel'));
  var decks = [new Deck(1), new Deck(2)];
  var colors = ['#3da9ff', '#ff4fa3'];
  var audio = { ctx: null, master: null };
  var fileInput = document.getElementById('file');
  var targetDeck = null;

  // ---- audio -------------------------------------------------------------
  function ensureAudio() {
    if (!audio.ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audio.ctx = new AC({ latencyHint: 'interactive' });
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = 0.9;
      audio.master.connect(audio.ctx.destination);
      decks.forEach(function (d) { d.init(audio.ctx, audio.master); });
    }
    if (audio.ctx.state !== 'running') audio.ctx.resume();
    return audio.ctx;
  }
  // El navegador solo permite audio tras un gesto del usuario: se activa en el primer toque.
  document.addEventListener('pointerdown', ensureAudio, true);

  // ---- pantalla de cada deck --------------------------------------------
  var screens = [].map.call(document.querySelectorAll('.dscreen'), function (s, i) {
    return {
      title: s.querySelector('.dtitle'), bpm: s.querySelector('.bpmv'),
      tempo: s.querySelector('.dtempo'), time: s.querySelector('.dtime'),
      remain: s.querySelector('.dremain'),
      ov: s.querySelector('.ov'), wf: s.querySelector('.wf'),
      half: s.querySelector('.half'), dbl: s.querySelector('.dbl'),
      last: {}
    };
  });

  function setText(node, key, obj, text) {
    if (obj.last[key] !== text) { obj.last[key] = text; node.textContent = text; }
  }
  function fmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    var m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }
  function fmtShort(t) {
    t = Math.max(0, Math.round(t));
    var m = Math.floor(t / 60), s = t % 60;
    return '-' + m + ':' + (s < 10 ? '0' : '') + s;
  }

  // ---- carga de pistas ---------------------------------------------------
  function loadFile(deck, scr, file) {
    var ctx = ensureAudio();
    if (!ctx) { scr.title.textContent = 'Este navegador no soporta Web Audio'; return; }
    var name = file.name.replace(/\.[^.]+$/, '');
    scr.title.textContent = 'Cargando… ' + name;
    file.arrayBuffer()
      .then(function (ab) { return ctx.decodeAudioData(ab); })
      .then(function (buf) {
        scr.title.textContent = 'Analizando… ' + name;
        return new Promise(function (resolve) {
          setTimeout(function () {
            var wf = Waveform.computePeaks(buf);
            var channels = [];
            for (var c = 0; c < Math.min(2, buf.numberOfChannels); c++) channels.push(buf.getChannelData(c));
            var analysis = null;
            try { analysis = Analyze.analyzeBpm(channels, buf.sampleRate); } catch (e) { analysis = null; }
            deck.setTrack(name, buf, wf.peaks, wf.perSec, analysis);
            deck.setTempo(deck.tempo);
            scr.title.textContent = name;
            resolve();
          }, 30);
        });
      })
      .catch(function () {
        scr.title.textContent = 'No se pudo leer ese archivo (¿es un audio?)';
      });
  }

  fileInput.addEventListener('change', function () {
    var f = fileInput.files && fileInput.files[0];
    var d = targetDeck;
    fileInput.value = '';
    if (f && d !== null) loadFile(decks[d], screens[d], f);
  });

  [0, 1].forEach(function (i) {
    // LOAD
    refs.decks[i].load.btn.addEventListener('click', function () {
      targetDeck = i;
      fileInput.click();
    });
    // arrastrar y soltar un audio sobre la pantalla del deck (útil en ordenador)
    var box = screens[i].ov.parentNode;
    box.addEventListener('dragover', function (e) { e.preventDefault(); });
    box.addEventListener('drop', function (e) {
      e.preventDefault();
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadFile(decks[i], screens[i], f);
    });

    // PLAY / CUE
    var deck = decks[i], ui = refs.decks[i];
    ui.play.btn.addEventListener('pointerdown', function () { deck.playButton(); });
    ui.cue.btn.addEventListener('pointerdown', function () { deck.cueDown(); });
    ui.cue.btn.addEventListener('pointerup', function () { deck.cueUp(); });
    ui.cue.btn.addEventListener('pointercancel', function () { deck.cueUp(); });

    // ½ / ×2
    screens[i].half.addEventListener('click', function () { deck.scaleBpm(0.5); });
    screens[i].dbl.addEventListener('click', function () { deck.scaleBpm(2); });

    // seek en la vista general
    var ov = screens[i].ov, dragging = false, moved = false, lastSeek = 0;
    function seekFrom(e) {
      var r = ov.getBoundingClientRect();
      deck.seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * deck.duration);
    }
    ov.addEventListener('pointerdown', function (e) {
      if (!deck.buffer) return;
      ov.setPointerCapture(e.pointerId);
      dragging = true; moved = false;
      seekFrom(e);
    });
    ov.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      moved = true;
      if (!deck.playing && Date.now() - lastSeek > 30) { lastSeek = Date.now(); seekFrom(e); }
    });
    function endSeek(e) {
      if (dragging && moved && deck.playing) seekFrom(e);
      dragging = false;
    }
    ov.addEventListener('pointerup', endSeek);
    ov.addEventListener('pointercancel', function () { dragging = false; });
  });

  // fader de tempo → deck
  refs.onTempo = function (i, v) { decks[i].setTempo(v); };

  // ---- bucle de dibujo ---------------------------------------------------
  var jogAngle = [null, null], ringPct = [null, null], lastStatus = 0;

  function frame(now) {
    for (var i = 0; i < 2; i++) {
      var d = decks[i], s = screens[i], ui = refs.decks[i];
      var pos = d.position(), dur = d.duration;

      var bpm = d.currentBpm();
      setText(s.bpm, 'bpm', s, bpm ? bpm.toFixed(1) : '--.-');
      setText(s.tempo, 'tempo', s, (d.tempo >= 0 ? '+' : '–') + Math.abs(d.tempo * 100).toFixed(1) + '%');
      setText(s.time, 'time', s, fmt(pos));
      setText(s.remain, 'remain', s, d.buffer ? fmtShort((dur - pos) / d.rate) : '-0:00');

      if (d.buffer) {
        Waveform.drawOverview(s.ov, d, colors[i]);
        Waveform.drawScroll(s.wf, d, colors[i]);
      }

      ui.play.setOn(d.playing);
      ui.cue.setOn(d.cuePreview || (d.buffer && !d.playing && Math.abs(d.pos - d.cuePoint) < 0.02));

      // jog: gira a 33⅓ rpm y el anillo muestra el progreso de la pista
      var ang = Math.round(((pos * 200) % 360) * 2) / 2;
      if (ang !== jogAngle[i]) { jogAngle[i] = ang; ui.jplat.style.transform = 'rotate(' + ang + 'deg)'; }
      var pct = dur ? Math.round(pos / dur * 1000) / 10 : 0;
      if (pct !== ringPct[i]) { ringPct[i] = pct; ui.jog.style.setProperty('--p', pct + '%'); }
    }
    if (now - lastStatus > 1000) {
      lastStatus = now;
      var c = audio.ctx;
      if (!c) refs.status.textContent = 'Toca LOAD para empezar';
      else {
        var lat = ((c.baseLatency || 0) + (c.outputLatency || 0)) * 1000;
        refs.status.textContent = Math.round(c.sampleRate / 100) / 10 + ' kHz · latencia ' +
          (lat ? '~' + Math.round(lat) + ' ms' : 'n/d') + (c.state !== 'running' ? ' · toca para activar' : '');
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
