/* ------------------------------------------------------------------
   RNG
   The whole random stream lives in one integer held inside game state.
   Undo restores that integer along with everything else, so replaying
   the same action after an undo produces the same rolls. Rewind fixes
   positioning mistakes, not bad luck.
------------------------------------------------------------------ */
(function (FE) {
  'use strict';

  function Rng(seed) {
    this.s = (seed >>> 0) || 0x2545f491;
    this.count = 0;
  }

  Rng.prototype.next = function () {
    /* xorshift32 */
    var x = this.s >>> 0;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;  x >>>= 0;
    this.s = x;
    this.count++;
    return x;
  };

  /* 0..99 */
  Rng.prototype.roll100 = function () { return this.next() % 100; };

  /* 0..n-1 */
  Rng.prototype.int = function (n) { return this.next() % n; };

  /* GBA-style two-roll average. A displayed 85 behaves like 85. */
  Rng.prototype.hit = function (chance) {
    var a = this.roll100(), b = this.roll100();
    var avg = (a + b) / 2;
    return avg < chance;
  };

  /* single roll, used for crit and growths */
  Rng.prototype.chance = function (pct) {
    return this.roll100() < pct;
  };

  Rng.prototype.save = function () { return { s: this.s, count: this.count }; };
  Rng.prototype.load = function (o) { this.s = o.s; this.count = o.count; };

  Rng.prototype.pick = function (arr) { return arr[this.int(arr.length)]; };

  FE.Rng = Rng;

})(window.FE = window.FE || {});
