/* Construye la pantalla (formas de onda) y el panel con la distribución del Pioneer DDJ-FLX4.
 * Los controles con { pending: true } están dibujados pero se activan en etapas posteriores. */
(function (root) {
  'use strict';
  var UI = root.UI, el = UI.el;

  function screenDeck(n) {
    var s = el('section', 'dscreen d' + n);
    s.innerHTML =
      '<div class="dhead">' +
        '<span class="dnum">' + n + '</span>' +
        '<span class="dtitle">Sin pista · pulsa LOAD</span>' +
        '<span class="dbpm"><b class="bpmv">--.-</b><small>BPM</small></span>' +
        '<span class="dtempo">+0.0%</span>' +
        '<span class="dtime">0:00.0</span>' +
        '<span class="dremain">-0:00</span>' +
        '<button type="button" class="half" title="Dividir BPM entre 2">½</button>' +
        '<button type="button" class="dbl" title="Multiplicar BPM por 2">×2</button>' +
      '</div>' +
      '<canvas class="ov"></canvas>' +
      '<canvas class="wf"></canvas>';
    return s;
  }

  function buildDeck(n, refs) {
    var d = { n: n };
    var root = el('section', 'deck d' + n);

    // fila superior
    var top = el('div', 'd-top');
    top.appendChild(UI.button({ label: 'IN', sub: 'IN ADJ', cls: 'round', pending: true }).el);
    top.appendChild(UI.button({ label: 'OUT', sub: 'OUT ADJ', cls: 'round', pending: true }).el);
    top.appendChild(UI.button({ label: '4 BEAT', sub: 'ACTIVE', cls: 'round', pending: true }).el);
    var call = el('div', 'callgrp');
    call.appendChild(UI.button({ label: '◄', sub: '1/2X · DEL', cls: 'small', pending: true }).el);
    call.appendChild(el('span', 'calltxt', 'CUE/LOOP CALL'));
    call.appendChild(UI.button({ label: '►', sub: '2X · MEMORY', cls: 'small', pending: true }).el);
    top.appendChild(call);
    top.appendChild(UI.button({ label: 'SYNC', sub: 'TEMPO RANGE', cls: 'round sync', pending: true }).el);
    root.appendChild(top);

    // jog
    var jw = el('div', 'jogwrap');
    var jog = el('div', 'jog');
    var ring = el('div', 'jring'), plat = el('div', 'jplat'), mark = el('i', 'jmark');
    plat.appendChild(mark);
    plat.appendChild(el('span', 'jlogo', 'DDJ-FLX4'));
    jog.appendChild(ring); jog.appendChild(plat);
    jw.appendChild(jog);
    root.appendChild(jw);
    d.jog = jog; d.jplat = plat;

    // fila inferior
    var bot = el('div', 'd-bottom');
    var tr = el('div', 'transport');
    tr.appendChild(UI.button({ label: 'SHIFT', cls: 'shift', pending: true }).el);
    d.cue = UI.button({ label: 'CUE', cls: 'big cue' });
    d.play = UI.button({ label: '▶ ❚❚', sub: 'PLAY / PAUSE', cls: 'big play' });
    tr.appendChild(d.cue.el);
    tr.appendChild(d.play.el);
    bot.appendChild(tr);

    var padsArea = el('div', 'padsarea');
    var modes = el('div', 'modes');
    [['HOT CUE', 'KEYBOARD'], ['PAD FX1', 'PAD FX2'], ['BEAT JUMP', 'BEAT LOOP'], ['SAMPLER', 'KEY SHIFT']].forEach(function (m, i) {
      modes.appendChild(UI.button({ label: m[0], sub: m[1], cls: 'mode' + (i === 0 ? ' sel' : ''), pending: true }).el);
    });
    padsArea.appendChild(modes);
    var pads = el('div', 'pads pending');
    for (var i = 0; i < 8; i++) pads.appendChild(el('div', 'pad p' + i));
    padsArea.appendChild(pads);
    bot.appendChild(padsArea);

    var tempoCol = el('div', 'tempocol');
    d.tempo = UI.fader({
      orient: 'v', min: -tempoRange(), max: tempoRange(), def: 0, topIsMin: true, snap: 0.003, cls: 'tempo',
      onChange: function (v) { if (refs.onTempo) refs.onTempo(n - 1, v); }
    });
    tempoCol.appendChild(el('span', 'tmark', '–'));
    tempoCol.appendChild(d.tempo.el);
    tempoCol.appendChild(el('span', 'tmark', '+'));
    tempoCol.appendChild(el('span', 'sub', 'TEMPO'));
    bot.appendChild(tempoCol);
    root.appendChild(bot);

    d.el = root;
    d.load = null; // se crea en el mezclador
    refs.decks.push(d);
    return d;
  }

  function tempoRange() { return root.Deck.TEMPO_RANGE; }

  function channelStrip(n, refs) {
    var c = el('div', 'chan c' + n);
    var knobs = el('div', 'cknobs');
    knobs.appendChild(UI.knob({
      label: 'TRIM', min: 0, max: 1, def: 0.5,
      onChange: function (v) { if (refs.onTrim) refs.onTrim(n - 1, v); }
    }).el);
    knobs.appendChild(UI.knob({ label: 'HI', min: -1, max: 1, def: 0, pending: true }).el);
    knobs.appendChild(UI.knob({ label: 'MID', min: -1, max: 1, def: 0, pending: true }).el);
    knobs.appendChild(UI.knob({ label: 'LOW', min: -1, max: 1, def: 0, pending: true }).el);
    knobs.appendChild(UI.knob({ label: 'CFX', sub: 'LOW · HI', min: -1, max: 1, def: 0, pending: true }).el);
    c.appendChild(knobs);
    var low = el('div', 'clow');
    low.appendChild(UI.button({ label: 'CUE', cls: 'hpcue', pending: true }).el);
    low.appendChild(el('span', 'cnum', String(n)));
    low.appendChild(UI.fader({
      orient: 'v', min: 0, max: 1, def: 1, value: 1, cls: 'chfader',
      onChange: function (v) { if (refs.onChannel) refs.onChannel(n - 1, v); }
    }).el);
    c.appendChild(low);
    return c;
  }

  function buildMixer(refs) {
    var m = el('section', 'mixer');

    // fila superior: LOAD 1 · selector · LOAD 2
    var top = el('div', 'm-top');
    refs.load1 = UI.button({ label: 'LOAD', sub: '', cls: 'load' });
    refs.load2 = UI.button({ label: 'LOAD', sub: '', cls: 'load' });
    top.appendChild(refs.load1.el);
    top.appendChild(UI.knob({ label: '', sub: 'BACK', min: 0, max: 1, def: 0.5, cls: 'browse', pending: true }).el);
    top.appendChild(refs.load2.el);
    m.appendChild(top);

    var main = el('div', 'm-main');

    // columna izquierda: micro, smart cfx, auriculares
    var left = el('div', 'mcol mleft');
    left.appendChild(UI.knob({ label: 'MIC LEVEL', min: 0, max: 1, def: 0.5, cls: 'na', pending: true }).el);
    left.appendChild(UI.button({ label: 'SMART CFX', sub: 'FX SELECT', cls: 'round na', pending: true }).el);
    left.appendChild(UI.knob({ label: '🎧 MIX', sub: 'CUE · MST', min: 0, max: 1, def: 0.5, pending: true }).el);
    left.appendChild(UI.knob({ label: '🎧 LEVEL', min: 0, max: 1, def: 0.5, pending: true }).el);
    left.appendChild(UI.button({ label: 'SMART FADER', cls: 'round na', pending: true }).el);
    main.appendChild(left);

    main.appendChild(channelStrip(1, refs));

    var vu = el('div', 'vu');
    refs.vu = []; // refs.vu[canal] = LEDs de arriba (rojo) a abajo
    for (var s = 0; s < 2; s++) {
      var col = el('div', 'vucol'), leds = [];
      for (var i = 0; i < 6; i++) { var led = el('i', 'led'); leds.push(led); col.appendChild(led); }
      refs.vu.push(leds);
      vu.appendChild(col);
    }
    main.appendChild(vu);

    main.appendChild(channelStrip(2, refs));

    // columna derecha: master y Beat FX
    var right = el('div', 'mcol mright');
    right.appendChild(UI.knob({
      label: 'MASTER LEVEL', min: 0, max: 1, def: 0.8,
      onChange: function (v) { if (refs.onMaster) refs.onMaster(v); }
    }).el);
    right.appendChild(UI.button({ label: 'CUE', cls: 'hpcue', pending: true }).el);
    right.appendChild(el('div', 'fxtitle', 'BEAT FX'));
    var sw = el('div', 'fxswitch pending');
    ['1', '2', '1&2'].forEach(function (t) { sw.appendChild(el('span', '', t)); });
    right.appendChild(sw);
    var sel = el('div', 'fxrow');
    sel.appendChild(UI.button({ label: '▼', cls: 'small', pending: true }).el);
    sel.appendChild(UI.button({ label: '▲', cls: 'small', pending: true }).el);
    right.appendChild(sel);
    var beat = el('div', 'fxrow');
    beat.appendChild(UI.button({ label: '◄', sub: 'AUTO', cls: 'small', pending: true }).el);
    beat.appendChild(UI.button({ label: '►', sub: 'TAP', cls: 'small', pending: true }).el);
    right.appendChild(beat);
    right.appendChild(UI.knob({ label: 'LEVEL/DEPTH', min: 0, max: 1, def: 0.5, pending: true }).el);
    right.appendChild(UI.button({ label: 'ON/OFF', sub: 'RELEASE FX', cls: 'round', pending: true }).el);
    main.appendChild(right);

    m.appendChild(main);

    // crossfader
    var xf = el('div', 'm-xf');
    xf.appendChild(UI.fader({
      orient: 'h', min: -1, max: 1, def: 0, cls: 'crossfader', snap: 0.02,
      onChange: function (v) { if (refs.onCrossfader) refs.onCrossfader(v); }
    }).el);
    m.appendChild(xf);

    return m;
  }

  function build(screenRoot, panelRoot) {
    var refs = { decks: [] };
    screenRoot.appendChild(screenDeck(1));
    var mid = el('div', 'smid');
    mid.innerHTML = '<div class="brand">MESA DJ</div><div class="status">Etapa 2 · audio sin iniciar</div>' +
                    '<div class="legend">Controles atenuados = próximas etapas</div>';
    screenRoot.appendChild(mid);
    screenRoot.appendChild(screenDeck(2));

    var d1 = buildDeck(1, refs);
    var mixer = buildMixer(refs);
    var d2 = buildDeck(2, refs);
    panelRoot.appendChild(d1.el);
    panelRoot.appendChild(mixer);
    panelRoot.appendChild(d2.el);
    d1.load = refs.load1; d2.load = refs.load2;
    refs.status = mid.querySelector('.status');
    return refs;
  }

  root.Panel = { build: build };
})(window);
