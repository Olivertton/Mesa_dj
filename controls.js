/* Componentes táctiles: botón, potenciómetro (knob) y fader. Usan pointer events (multitáctil). */
(function (root) {
  'use strict';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* o: { label, sub, cls, pending, onDown(e), onUp(e) } */
  function button(o) {
    var wrap = el('div', 'ctl btn' + (o.cls ? ' ' + o.cls : ''));
    var b = el('button', 'b', o.label || '');
    b.type = 'button';
    wrap.appendChild(b);
    if (o.sub) wrap.appendChild(el('span', 'sub', o.sub));
    var down = false;
    b.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch (x) { /* nada */ }
      down = true;
      b.classList.add('down');
      if (o.onDown) o.onDown(e);
    });
    function up(e) {
      if (!down) return;
      down = false;
      b.classList.remove('down');
      if (o.onUp) o.onUp(e);
    }
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    if (o.pending) wrap.classList.add('pending');
    return {
      el: wrap, btn: b,
      setOn: function (v) { b.classList.toggle('on', !!v); }
    };
  }

  /* o: { label, min, max, def, value, onChange(v), pending, cls } — arrastrar en vertical; doble toque = valor por defecto */
  function knob(o) {
    var wrap = el('div', 'ctl knob' + (o.cls ? ' ' + o.cls : ''));
    if (o.label) wrap.appendChild(el('span', 'klabel', o.label));
    var dial = el('div', 'kdial'), ind = el('i', 'kind');
    dial.appendChild(ind);
    wrap.appendChild(dial);
    if (o.sub) wrap.appendChild(el('span', 'sub', o.sub));
    var min = o.min == null ? 0 : o.min, max = o.max == null ? 1 : o.max;
    var def = o.def == null ? (min + max) / 2 : o.def;
    var v = o.value == null ? def : o.value;
    function render() {
      ind.style.transform = 'rotate(' + (-135 + 270 * (v - min) / (max - min)) + 'deg)';
    }
    function set(nv, fire) {
      // snap: fracción del recorrido alrededor del valor por defecto donde el knob "se pega" (útil para encontrar el centro al tacto)
      if (o.snap && Math.abs(nv - def) < o.snap * (max - min)) nv = def;
      v = Math.min(max, Math.max(min, nv));
      render();
      if (fire && o.onChange) o.onChange(v);
    }
    var sy = 0, sv = 0, active = false, lastTap = 0;
    dial.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      try { dial.setPointerCapture(e.pointerId); } catch (x) { /* nada */ }
      active = true; sy = e.clientY; sv = v;
      var now = Date.now();
      if (now - lastTap < 300) set(def, true);
      lastTap = now;
    });
    dial.addEventListener('pointermove', function (e) {
      if (!active) return;
      set(sv + (sy - e.clientY) / 160 * (max - min), true);
    });
    function end() { active = false; }
    dial.addEventListener('pointerup', end);
    dial.addEventListener('pointercancel', end);
    if (o.pending) wrap.classList.add('pending');
    render();
    return { el: wrap, get: function () { return v; }, set: function (nv) { set(nv, false); } };
  }

  /* o: { orient:'v'|'h', min, max, def, value, topIsMin, snap, onChange(v), pending, cls }
   * Vertical: por defecto arriba = máximo. Horizontal: izquierda = mínimo. */
  function fader(o) {
    var vert = o.orient !== 'h';
    var wrap = el('div', 'ctl fader ' + (vert ? 'v' : 'h') + (o.cls ? ' ' + o.cls : ''));
    var track = el('div', 'ftrack'), thumb = el('div', 'fthumb');
    track.appendChild(thumb);
    wrap.appendChild(track);
    var min = o.min, max = o.max;
    var def = o.def != null ? o.def : (min + max) / 2;
    var v = o.value != null ? o.value : def;
    var invert = vert && !o.topIsMin; // en vertical normal, el máximo está arriba

    function render() {
      var f = (v - min) / (max - min);
      if (invert) f = 1 - f;
      thumb.style[vert ? 'top' : 'left'] = (f * 100) + '%';
    }
    function set(nv, fire) {
      if (o.snap && Math.abs(nv - def) < o.snap) nv = def;
      v = Math.min(max, Math.max(min, nv));
      render();
      if (fire && o.onChange) o.onChange(v);
    }
    var off = 0, active = false, lastTap = 0;
    function fromPointer(e) {
      var r = track.getBoundingClientRect();
      var f = vert ? (e.clientY - off - r.top) / r.height : (e.clientX - off - r.left) / r.width;
      f = Math.min(1, Math.max(0, f));
      if (invert) f = 1 - f;
      return min + f * (max - min);
    }
    track.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      try { track.setPointerCapture(e.pointerId); } catch (x) { /* nada */ }
      active = true;
      var t = thumb.getBoundingClientRect();
      var hit = vert ? (e.clientY >= t.top && e.clientY <= t.bottom)
                     : (e.clientX >= t.left && e.clientX <= t.right);
      off = hit ? (vert ? e.clientY - (t.top + t.height / 2) : e.clientX - (t.left + t.width / 2)) : 0;
      var now = Date.now();
      if (hit && now - lastTap < 300) { set(def, true); active = false; }
      else if (!hit) set(fromPointer(e), true);
      lastTap = now;
    });
    track.addEventListener('pointermove', function (e) {
      if (active) set(fromPointer(e), true);
    });
    function end() { active = false; }
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    if (o.pending) wrap.classList.add('pending');
    render();
    return { el: wrap, get: function () { return v; }, set: function (nv) { set(nv, false); } };
  }

  root.UI = { el: el, button: button, knob: knob, fader: fader };
})(window);
