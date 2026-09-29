/* ------------------------------------------------------------------
   UI
   GBA-flavoured window frames rendered as DOM over the map canvas.
------------------------------------------------------------------ */
(function (FE) {
  'use strict';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function $(id) { return document.getElementById(id); }

  var UI = {
    el: el, clear: clear, $: $,

    button: function (label, cls, onClick) {
      var b = el('button', 'btn ' + (cls || ''), label);
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        FE.Sfx.select();
        onClick(ev);
      });
      return b;
    },

    row: function (left, right, cls) {
      var r = el('div', 'row ' + (cls || ''));
      r.appendChild(el('span', 'row-l', left));
      r.appendChild(el('span', 'row-r', right));
      return r;
    },

    sprite: function (clsKey, faction, size) {
      var wrap = el('div', 'spr');
      var cv = FE.spriteCanvas(clsKey, faction, 1, 0);
      var img = el('canvas');
      img.width = size; img.height = size;
      var g = img.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(cv, 0, 0, size, size);
      wrap.appendChild(img);
      return wrap;
    },

    portrait: function (clsKey, faction, size) {
      var wrap = el('div', 'portrait');
      var cv = FE.portraitCanvas(clsKey, faction, size);
      var img = el('canvas');
      img.width = size; img.height = Math.round(size * cv.height / cv.width);
      var g = img.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(cv, 0, 0, img.width, img.height);
      wrap.appendChild(img);
      return wrap;
    },

    hpBar: function (cur, max, w) {
      var wrap = el('div', 'hpbar');
      if (w) wrap.style.width = w;
      var fill = el('div', 'hpbar-f');
      var frac = Math.max(0, cur / max);
      fill.style.width = (frac * 100) + '%';
      if (frac < 0.25) fill.style.background = '#e0544a';
      else if (frac < 0.5) fill.style.background = '#e8b23a';
      wrap.appendChild(fill);
      return wrap;
    },

    expBar: function (exp) {
      var wrap = el('div', 'expbar');
      var fill = el('div', 'expbar-f');
      fill.style.width = exp + '%';
      wrap.appendChild(fill);
      return wrap;
    },

    /* ---------------- item line ---------------- */
    itemLine: function (it, opts) {
      opts = opts || {};
      var d = FE.itemData(it) || FE.EXTRA_ITEMS[it.key];
      var r = el('div', 'item' + (opts.dim ? ' dim' : ''));
      var nm = el('span', 'item-n', d ? d.name : it.key);
      r.appendChild(nm);
      var uses = el('span', 'item-u', it.uses === null ? '∞' : String(it.uses));
      r.appendChild(uses);
      if (d && d.type && d.type !== 'item') {
        var tag = el('span', 'item-t ' + d.type, FE.typeGlyph(d.type));
        r.insertBefore(tag, nm);
      } else {
        var tag2 = el('span', 'item-t item', '•');
        r.insertBefore(tag2, nm);
      }
      return r;
    },

    /* ---------------- panels ---------------- */

    panel: function (title) {
      var p = el('div', 'panel');
      if (title) p.appendChild(el('div', 'panel-h', title));
      var body = el('div', 'panel-b');
      p.appendChild(body);
      p._body = body;
      return p;
    },

    modal: function (title, wide) {
      var back = el('div', 'modal-back');
      var box = el('div', 'modal' + (wide ? ' wide' : ''));
      if (title) box.appendChild(el('div', 'modal-h', title));
      var body = el('div', 'modal-b');
      box.appendChild(body);
      back.appendChild(box);
      back._body = body;
      back._box = box;
      return back;
    },

    toast: function (msg, kind) {
      var host = $('toasts');
      if (!host) return;
      var t = el('div', 'toast ' + (kind || ''), msg);
      host.appendChild(t);
      setTimeout(function () { t.classList.add('out'); }, 2100);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2600);
    }
  };

  FE.typeGlyph = function (t) {
    return ({
      sword: 'SW', lance: 'LN', axe: 'AX', bow: 'BW',
      anima: 'AN', light: 'LT', dark: 'DK', staff: 'ST', item: '•'
    })[t] || '?';
  };

  FE.typeName = function (t) {
    return ({
      sword: 'Sword', lance: 'Lance', axe: 'Axe', bow: 'Bow',
      anima: 'Anima', light: 'Light', dark: 'Dark', staff: 'Staff', item: 'Item'
    })[t] || t;
  };

  FE.UI = UI;

})(window.FE = window.FE || {});
