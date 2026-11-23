(function(){
  try { if (/(^|\.)animetrix\.lat$/.test(location.hostname) || window.__axBuf) return; } catch (e) { return; }
  window.__axBuf = 1;
  var P = window.SourceBuffer && window.SourceBuffer.prototype; if (!P) return;
  var KEEP = 10, SLACK = 20; // deja 10 s detrás del video; recorta cuando hay más de 30 s viejos
  var nAppend = P.appendBuffer, nRemove = P.remove, nAdd = P.addEventListener, nRem = P.removeEventListener;
  var upd = Object.getOwnPropertyDescriptor(P, 'updating');
  var EV = { updatestart: 1, update: 1, updateend: 1 };
  // Los eventos que provoca nuestro recorte no llegan al reproductor (para él, no pasó nada).
  P.addEventListener = function (t, fn, o) {
    if (EV[t] && typeof fn === 'function') { if (!fn.__axW) fn.__axW = function (e) { if (this.__axBusy) return; return fn.call(this, e); }; return nAdd.call(this, t, fn.__axW, o); }
    return nAdd.call(this, t, fn, o);
  };
  P.removeEventListener = function (t, fn, o) { return nRem.call(this, t, (fn && fn.__axW) || fn, o); };
  ['onupdatestart', 'onupdate', 'onupdateend'].forEach(function (k) {
    var d = Object.getOwnPropertyDescriptor(P, k); if (!d || !d.set) return;
    Object.defineProperty(P, k, { configurable: true, get: function () { return this['__ax' + k] || null; }, set: function (fn) { var self = this; this['__ax' + k] = fn; d.set.call(this, fn ? function (e) { if (self.__axBusy) return; return fn.call(self, e); } : null); } });
  });
  // Mientras recortamos, el reproductor ve el búfer libre; si agrega datos, se ponen en cola.
  if (upd && upd.get) Object.defineProperty(P, 'updating', { configurable: true, get: function () { return this.__axBusy ? !!this.__axQ && this.__axQ.length > 0 : upd.get.call(this); } });
  function video() { return document.querySelector('video'); }
  function done(sb) {
    sb.__axBusy = false;
    var q = sb.__axQ; sb.__axQ = null;
    if (q) for (var i = 0; i < q.length; i++) { try { nAppend.call(sb, q[i]); } catch (e) {} break; }
  }
  function trim(sb, slack) {
    if (slack == null) slack = SLACK;
    try {
      var v = video(); if (!v || sb.__axBusy || upd.get.call(sb)) return;
      var b = sb.buffered; if (!b.length) return;
      var start = b.start(0), cut = v.currentTime - KEEP;
      if (cut - start < slack) return;
      sb.__axBusy = true;
      nAdd.call(sb, 'updateend', function h() { nRem.call(sb, 'updateend', h); setTimeout(function () { done(sb); }, 0); });
      nRemove.call(sb, start, cut);
    } catch (e) { sb.__axBusy = false; }
  }
  var all = [];
  P.appendBuffer = function (data) {
    if (this.__axBusy) { (this.__axQ = this.__axQ || []).push(data); return; }
    var self = this;
    if (!this.__axHooked) { this.__axHooked = 1; all.push(this); nAdd.call(this, 'updateend', function () { if (!self.__axBusy) setTimeout(function () { trim(self); }, 0); }); }
    return nAppend.call(this, data);
  };
  // Al pausar también se libera lo ya visto.
  document.addEventListener('pause', function (e) {
    var v = e.target; if (!v || v.tagName !== 'VIDEO') return;
    for (var i = 0; i < all.length; i++) { trim(all[i], 2); }
  }, true);
})();
