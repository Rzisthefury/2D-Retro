/* =========================================================================
 * render.ts — battlefields, characters, VFX, HUD and the KH2-style command menu.
 * Programmer art, but with real animation timing driven by the frame data.
 * ========================================================================= */

/** Everything a hero drawing needs, worked out once per frame. */
interface HeroCtx {
  h: number; plate: string; trim: string; cape: string; look: ArmorLook;
  hurt: boolean; away: boolean; fx: number; stride: number; drag: number; t: number;
  ink: string; outline: (w?: number) => void;
}

const Z_SCALE = 0.85; // how much world height translates to screen height

function sx(x: number): number { return x; }
function sy(y: number, z: number): number { return y - z * Z_SCALE; }

class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dpr = 1;
  bladeStyle: BladeStyle = 'longsword';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    const wrap = this.canvas.parentElement!;
    const availW = wrap.clientWidth;
    const availH = wrap.clientHeight;
    const scale = Math.max(0.2, Math.min(availW / VIEW_W, availH / VIEW_H));
    this.canvas.style.width = Math.floor(VIEW_W * scale) + 'px';
    this.canvas.style.height = Math.floor(VIEW_H * scale) + 'px';
    this.canvas.width = Math.floor(VIEW_W * dpr);
    this.canvas.height = Math.floor(VIEW_H * dpr);
  }

  /* ------------------------------------------------------------- frame */

  draw(g: Game) {
    const c = this.ctx;
    this.bladeStyle = g.bladeStyle;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, VIEW_W, VIEW_H);
    if (g.screen === 'campaign') { this.drawMap(c, g); return; }

    c.save();
    const sh = g.shakeAmount;
    if (sh > 0.1) c.translate(rnd(-sh, sh), rnd(-sh, sh));

    // The battlefield scrolls under the camera (the title screen shows it behind the menu).
    const cam = { x: g.camX, y: g.camY };
    c.translate(-Math.round(cam.x), -Math.round(cam.y));
    this.drawField(c, g, cam);
    const onScreen = (x: number, y: number) =>
      x > cam.x - 80 && x < cam.x + VIEW_W + 80 && y > cam.y - 80 && y < cam.y + VIEW_H + 160;

    // Ground-level markers sit under everything.
    for (const e of g.enemies) if (e.alive && onScreen(e.x, e.y)) this.drawTelegraph(c, e);
    this.drawLockRing(c, g);

    // Y-sorted so nearer things overlap farther ones.
    const drawables: { y: number; fn: () => void }[] = [];
    for (const e of g.enemies) if (onScreen(e.x, e.y)) drawables.push({ y: e.y, fn: () => this.drawEnemy(c, e, g) });
    const showPlayer = g.screen !== 'title' && (g.player.alive || g.deathT < 2);
    if (showPlayer) drawables.push({ y: g.player.y, fn: () => this.drawPlayer(c, g.player, g) });
    for (const p of g.projectiles) drawables.push({ y: p.y, fn: () => this.drawProjectile(c, p) });
    for (const s of g.battle.structures) if (onScreen(s.x, s.y)) drawables.push({ y: s.y, fn: () => this.drawStructure(c, s, g) });
    drawables.sort((a, b) => a.y - b.y);

    for (const e of g.enemies) {
      if ((!e.alive && e.deathT > 0.25) || !onScreen(e.x, e.y)) continue;
      this.drawShadow(c, e.x, e.y, e.radius, e.z);
    }
    if (showPlayer) this.drawShadow(c, g.player.x, g.player.y, g.player.radius, g.player.z);

    // Minions: on-screen slots sorted by y, then merged into the y-sorted
    // drawables, so a crowd and the knight overlap correctly without a closure each.
    const a = g.army;
    let n = 0;
    for (let i = 0; i < a.cap; i++) {
      if (!a.used[i] || !onScreen(a.x[i], a.y[i])) continue;
      this.minionOrder[n++] = i;
    }
    const order = this.minionOrder.subarray(0, n);
    order.sort((p, q) => a.y[p] - a.y[q]);
    this.drawMinionShadows(c, a, order);
    let m = 0;
    for (const d of drawables) {
      while (m < n && a.y[order[m]] <= d.y) this.drawMinion(c, a, order[m++], g);
      d.fn();
    }
    while (m < n) this.drawMinion(c, a, order[m++], g);
    this.drawArrows(c, a);

    this.drawPickups(c, g);
    this.drawWhirlRing(c, g);
    this.drawSlashes(c, g);
    this.drawParticles(c, g);
    this.drawRings(c, g);
    this.drawFloatText(c, g);

    c.restore();

    this.drawHud(c, g);
  }

  /* --------------------------------------------------------- minions */

  private minionOrder = new Int32Array(WAR.unitCapacity);

  /** One batched path for every minion's ground shadow. */
  private drawMinionShadows(c: CanvasRenderingContext2D, a: Army, order: Int32Array) {
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.beginPath();
    for (let k = 0; k < order.length; k++) {
      const i = order[k];
      if (!a.alive[i]) continue;
      const r = a.def(i).radius;
      c.moveTo(a.x[i] + r, a.y[i] + 1);
      c.ellipse(a.x[i], a.y[i] + 1, r, r * 0.42, 0, 0, Math.PI * 2);
    }
    c.fill();
  }

  /**
   * A minion: simple team-coloured figure (PLAN 17 default), by type. Blue
   * tunics for the player's side, crimson for the Dominion. ~16 px tall.
   * Drawn directly each frame: cached sprites and a pre-rendered ground were
   * tried and measured slower in headless Chromium's software canvas (see
   * README, Phase 2), so they are not used.
   */
  private drawMinion(c: CanvasRenderingContext2D, a: Army, i: number, g: Game) {
    const d = a.def(i);
    const x = a.x[i], y = a.y[i];
    const ally = a.team[i] === TEAM_PLAYER;
    const dead = !a.alive[i];
    if (dead) {
      const k = 1 - a.deadT[i] / WAR.unitCorpseTime;
      if (k <= 0) return;
      c.globalAlpha = k * 0.8;
    }
    const flash = a.flash[i] > 0;
    const fx = Math.cos(a.facing[i]) >= 0 ? 1 : -1;
    const moving = Math.abs(a.vx[i]) + Math.abs(a.vy[i]) > 12 && !dead;
    const step = moving ? Math.sin(a.walk[i]) * 3 : 0;
    const wind = a.wind[i] > 0 ? 1 - a.wind[i] / d.windup : 0;   // 0..1 through the windup
    c.translate(x, y);
    this.paintMinionFigure(c, d, ally, flash, fx, step, wind, a.facing[i]);
    c.translate(-x, -y);
    if (dead) { c.globalAlpha = 1; return; }
    // health, once hurt
    if (a.hp[i] < a.maxHp[i]) {
      const w = d.id === 'ram' ? 34 : 16, top = y - (d.id === 'ram' ? 30 : 27);
      c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(x - w / 2, top, w, 3);
      c.fillStyle = ally ? PAL.ally : '#ff6b6b'; c.fillRect(x - w / 2, top, w * (a.hp[i] / a.maxHp[i]), 3);
    }
    void g;
  }

  /** One minion figure with its feet at the origin. */
  private paintMinionFigure(c: CanvasRenderingContext2D, d: UnitDef, ally: boolean, flash: boolean, fx: number, step: number, wind: number, facing: number) {
    const tunic = flash ? '#ffffff' : ally ? '#3f7fd0' : PAL.dominion;
    const trim = flash ? '#ffffff' : ally ? '#a8d4ff' : '#3a1f28';
    const steel = flash ? '#ffffff' : '#b9c0cc';
    if (d.id === 'ram') {
      // a capped log on a frame, four crew
      c.save(); c.rotate(facing);
      c.fillStyle = flash ? '#ffffff' : '#6b4a2b';
      c.fillRect(-22, -10, 44, 9);
      c.fillStyle = steel; c.fillRect(20, -11, 6, 11);
      c.restore();
      for (let k = 0; k < 4; k++) {
        const ox = (k % 2 ? 8 : -8) * fx + (k < 2 ? -6 : 6), oy = (k < 2 ? -9 : 7);
        c.fillStyle = tunic; c.fillRect(ox - 3, oy - 10 + (k % 2 ? step : -step) * 0.4, 6, 8);
        c.fillStyle = '#e2c3a0'; c.beginPath(); c.arc(ox, oy - 13, 2.6, 0, Math.PI * 2); c.fill();
      }
    } else if (d.id === 'hound') {
      // a low, thorny beast
      c.fillStyle = flash ? '#ffffff' : '#5a2f2a';
      c.beginPath(); c.ellipse(0, -7, 11, 5, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(fx * 10, -10, 5, 4, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = flash ? '#ffffff' : '#9fd36b'; c.lineWidth = 1.5;
      c.beginPath();
      for (let k = -1; k <= 1; k++) { c.moveTo(k * 5, -11); c.lineTo(k * 5 - fx * 2, -16); }
      c.stroke();
      c.strokeStyle = '#2a1714'; c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-6, -4); c.lineTo(-6 + step, 0);
      c.moveTo(6, -4); c.lineTo(6 - step, 0);
      c.stroke();
      c.fillStyle = '#ffd54a'; c.fillRect(fx * 12 - 1, -11, 2, 2);
    } else {
      // legs
      c.strokeStyle = '#2a2a33'; c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-2.5, -5); c.lineTo(-2.5 + step, 0);
      c.moveTo(2.5, -5); c.lineTo(2.5 - step, 0);
      c.stroke();
      // tunic and head
      c.fillStyle = tunic;
      c.fillRect(-5, -15, 10, 11);
      c.fillStyle = trim;
      c.fillRect(-5, -9, 10, 2);
      c.fillStyle = flash ? '#ffffff' : '#e2c3a0';
      c.beginPath(); c.arc(0, -18, 3.6, 0, Math.PI * 2); c.fill();
      c.fillStyle = ally ? trim : steel;
      c.beginPath(); c.arc(0, -19, 3.8, Math.PI, 0); c.fill();
      // the weapon, raised through the windup
      const hx = fx * 5, hy = -11;
      c.strokeStyle = steel; c.lineWidth = 2;
      c.beginPath();
      if (d.id === 'sword') {
        const ang = -0.9 - wind * 1.4;
        c.moveTo(hx, hy); c.lineTo(hx + fx * Math.cos(ang) * 11, hy + Math.sin(ang) * 11);
      } else if (d.id === 'spear') {
        const lift = wind * 4;
        c.moveTo(hx - fx * 8, hy + 2 - lift); c.lineTo(hx + fx * 16, hy - 4 - lift);
      } else if (d.id === 'archer') {
        c.strokeStyle = flash ? '#ffffff' : '#8a5a2b';
        c.arc(hx, hy - 2, 7, fx > 0 ? -1.2 : Math.PI - 1.2, fx > 0 ? 1.2 : Math.PI + 1.2);
      }
      c.stroke();
      if (d.id === 'shield') {
        c.fillStyle = flash ? '#ffffff' : ally ? '#2c5c9c' : '#5a1f26';
        c.fillRect(fx * 5 - (fx > 0 ? 0 : 5), -16, 5, 13);
        c.fillStyle = steel; c.fillRect(fx * 5 - (fx > 0 ? 0 : 5) + 1.5, -11, 2, 2);
      }
    }
  }

  /** Battle HUD (PLAN 13): the objective, a progress bar, and an exit marker on your edge. */
  private drawObjective(c: CanvasRenderingContext2D, g: Game) {
    const b = g.battle;
    const text = b.objective.toUpperCase();
    c.save();
    // as wide as the line needs, between the HP bars and the battle name (measured, never guessed: PLAN 16)
    let size = 12;
    c.font = `800 ${size}px ui-monospace, Menlo, Consolas, monospace`;
    while (size > 9 && c.measureText(text).width > 352) { size--; c.font = `800 ${size}px ui-monospace, Menlo, Consolas, monospace`; }
    const w = clamp(c.measureText(text).width + 28, 300, 380), x = (VIEW_W - w) / 2, y = 14;
    c.fillStyle = 'rgba(10,14,28,0.72)';
    this.roundRect(c, x, y, w, 36, 8); c.fill();
    c.textAlign = 'center';
    c.fillStyle = '#ffd54a';
    c.fillText(text, VIEW_W / 2, y + 15);
    this.bar(c, x + 14, y + 22, w - 28, 6, b.progress(g), '#ff9d4a', 'rgba(0,0,0,0.55)');
    c.restore();
    // the way out: your own edge, while you are near it
    const p = g.player, sx0 = g.field.x - g.camX, sy0 = g.field.y - g.camY;
    if (b.exitSide === 'top') {
      if (sy0 > -40 && p.y - g.field.y < 300) {
        c.save();
        c.globalAlpha = 0.55 + Math.sin(g.time * 4) * 0.2;
        c.fillStyle = '#8fb4ff';
        c.font = '800 11px ui-monospace, Menlo, Consolas, monospace';
        c.textAlign = 'center';
        c.fillText('\u25B2 LEAVE', clamp(p.x - g.camX, 120, VIEW_W - 120), Math.max(70, sy0 + 66));
        c.restore();
      }
    } else if (sx0 > -40 && p.x - g.field.x < 400) {
      c.save();
      c.globalAlpha = 0.55 + Math.sin(g.time * 4) * 0.2;
      c.fillStyle = '#8fb4ff';
      c.font = '800 11px ui-monospace, Menlo, Consolas, monospace';
      c.textAlign = 'left';
      c.fillText('\u25C0 LEAVE', Math.max(6, sx0 + 6), clamp(p.y - g.camY - 40, 140, VIEW_H - 140));
      c.restore();
    }
  }

  /** The results screen (PLAN 10.1): outcome, time, kills, losses, spoils. */
  private drawResults(c: CanvasRenderingContext2D, g: Game) {
    const b = g.battle;
    const a = clamp(b.resultT / 0.4, 0, 1);
    c.save();
    c.fillStyle = `rgba(6,8,14,${0.9 * a})`;
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    c.globalAlpha = a;
    const title = b.result === 'win' ? 'VICTORY' : b.result === 'lose' ? 'DEFEAT' : 'WITHDRAWN';
    const col = b.result === 'win' ? '#ffd54a' : b.result === 'lose' ? '#ff6b6b' : '#8fb4ff';
    c.textAlign = 'center';
    c.font = '900 44px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = col;
    c.fillText(title, VIEW_W / 2, 92);
    c.font = '700 14px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.text;
    c.fillText(b.outcome, VIEW_W / 2, 120);
    c.fillStyle = '#c7b8ff';
    c.font = '600 12px ui-monospace, Menlo, Consolas, monospace';
    b.notes.forEach((n, k) => c.fillText(n, VIEW_W / 2, 140 + k * 16));

    const left = VIEW_W / 2 - 250, right = VIEW_W / 2 + 30;
    const row = (x: number, y: number, k: string, v: string, vc = PAL.text) => {
      c.textAlign = 'left'; c.fillStyle = PAL.dim; c.font = '600 13px ui-monospace, Menlo, Consolas, monospace'; c.fillText(k, x, y);
      c.textAlign = 'right'; c.fillStyle = vc; c.font = '700 13px ui-monospace, Menlo, Consolas, monospace'; c.fillText(v, x + 220, y);
    };
    let y = 170 + b.notes.length * 12;
    row(left, y, 'Time', fmtTime(b.time)); y += 22;
    row(left, y, 'Killed by you', String(b.kills.byKnight)); y += 22;
    row(left, y, 'Killed by your army', String(b.kills.byArmy)); y += 22;
    row(left, y, 'Elites felled', String(b.kills.elites)); y += 22;
    row(left, y, 'Dominion routed', String(g.army.routedCount[TEAM_ENEMY])); y += 22;
    row(left, y, 'Your troops lost', String(b.losses.troops), b.losses.troops ? '#ff9d9d' : PAL.text); y += 22;
    y = 170 + b.notes.length * 12;
    c.textAlign = 'left'; c.fillStyle = '#ffd54a'; c.font = '800 13px ui-monospace, Menlo, Consolas, monospace';
    c.fillText('SPOILS', right, y); y += 22;
    if (b.result === 'win') {
      row(right, y, 'Gold', `+${b.spoils.gold}`, '#ffd54a'); y += 22;
      for (const m of Object.keys(b.spoils.mats) as MatId[]) { row(right, y, MATS[m].name, `+${b.spoils.mats[m]}`, MATS[m].color); y += 22; }
    } else {
      c.fillStyle = PAL.dim; c.font = '600 13px ui-monospace, Menlo, Consolas, monospace';
      c.fillText('none — spoils come with victory', right, y); y += 22;
    }
    row(right, y + 8, 'Treasury', String(g.player.gold), '#ffd54a');
    c.textAlign = 'center';
    c.fillStyle = PAL.dim;
    c.font = '600 12px ui-monospace, Menlo, Consolas, monospace';
    if (b.resultT > 0.6) c.fillText(IS_TOUCH ? 'tap to return to the map' : 'ENTER to return to the map', VIEW_W / 2, VIEW_H - 40);
    c.restore();
  }

  /* ------------------------------------------------------------ the map */

  /** The map's unchanging art (sea, land, forests, mountains, rivers, borders, roads), drawn once. */
  private mapLayer: HTMLCanvasElement | null = null;
  private static readonly MAP_RES = 0.75;   // layer px per map unit

  private buildMapLayer(camp: Campaign): HTMLCanvasElement {
    const K = Renderer.MAP_RES;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(CONTINENT.w * K); cv.height = Math.ceil(CONTINENT.h * K);
    const c = cv.getContext('2d')!;
    c.scale(K, K);
    const rng = seededRng(424242);
    const path = (poly: { x: number; y: number }[]) => { c.beginPath(); poly.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath(); };
    const line = (pts: { x: number; y: number }[]) => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); };

    // sea, with wave marks
    const sea = c.createLinearGradient(0, 0, 0, CONTINENT.h);
    sea.addColorStop(0, '#1b3550'); sea.addColorStop(1, '#22496a');
    c.fillStyle = sea; c.fillRect(0, 0, CONTINENT.w, CONTINENT.h);
    c.strokeStyle = 'rgba(160,200,230,0.18)'; c.lineWidth = 2.2;
    for (let k = 0; k < 260; k++) {
      const x = rng() * CONTINENT.w, y = rng() * CONTINENT.h;
      c.beginPath(); c.arc(x, y, 9, Math.PI * 1.15, Math.PI * 1.85); c.arc(x + 17, y, 9, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
    }
    // shallows around the coast
    for (const w of [70, 44, 22]) {
      c.strokeStyle = `rgba(110,170,195,${w === 70 ? 0.12 : w === 44 ? 0.16 : 0.22})`; c.lineWidth = w; c.lineJoin = 'round';
      for (const t of camp.territories) { path(t.poly); c.stroke(); }
    }
    // land, by scenery
    const land: Record<Scenery, [string, string]> = { forest: ['#6d8a4b', '#5f7c42'], coast: ['#93a462', '#86985a'], ruins: ['#8c8467', '#7e7759'] };
    for (const t of camp.territories) {
      path(t.poly); c.fillStyle = land[t.scenery][0]; c.fill();
      c.save(); path(t.poly); c.clip();
      // speckled ground
      c.fillStyle = land[t.scenery][1];
      for (let k = 0; k < 500; k++) { c.beginPath(); c.arc(t.cx + (rng() - 0.5) * 760, t.cy + (rng() - 0.5) * 560, 2 + rng() * 6, 0, Math.PI * 2); c.fill(); }
      c.restore();
    }
    // a spot for decor: inside its territory, clear of nodes and roads
    const nearRoad = (x: number, y: number, r: number) => camp.roads.some(([a, b]) => {
      const A = camp.nodes[a], B = camp.nodes[b], vx = B.x - A.x, vy = B.y - A.y, L = vx * vx + vy * vy;
      const t = clamp(((x - A.x) * vx + (y - A.y) * vy) / L, 0, 1);
      return (A.x + vx * t - x) ** 2 + (A.y + vy * t - y) ** 2 < r * r;
    });
    const spot = (t: Territory, clear: number) => {
      for (let tries = 0; tries < 40; tries++) {
        const x = t.cx + (rng() - 0.5) * 640, y = t.cy + (rng() - 0.5) * 480;
        if (!Campaign.inPoly(x, y, t.poly)) continue;
        if (t.poly.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < 40 * 40)) continue;
        if (camp.nodes.some((n) => (n.x - x) ** 2 + (n.y - y) ** 2 < clear * clear)) continue;
        if (nearRoad(x, y, 34)) continue;
        return { x, y };
      }
      return null;
    };
    // rivers, under everything that stands up
    for (const r of CONTINENT.rivers) {
      const pts = r.map(([x, y]) => ({ x, y }));
      for (let i = 0; i < pts.length - 1; i++) {
        c.strokeStyle = '#3f7ea3'; c.lineCap = 'round'; c.lineWidth = 6 + i * 2.2;
        line([pts[i], pts[i + 1]]); c.stroke();
        c.strokeStyle = 'rgba(170,215,235,0.45)'; c.lineWidth = 2;
        line([pts[i], pts[i + 1]]); c.stroke();
      }
    }
    // mountains (ruins and the borders' high ground) and forests
    const mountain = (x: number, y: number, s: number) => {
      c.fillStyle = '#6b6252'; c.beginPath(); c.moveTo(x - s, y); c.lineTo(x, y - s * 1.25); c.lineTo(x + s, y); c.closePath(); c.fill();
      c.fillStyle = '#8f8670'; c.beginPath(); c.moveTo(x - s, y); c.lineTo(x, y - s * 1.25); c.lineTo(x - s * 0.1, y); c.closePath(); c.fill();
      c.fillStyle = '#ece9df'; c.beginPath(); c.moveTo(x - s * 0.32, y - s * 0.85); c.lineTo(x, y - s * 1.25); c.lineTo(x + s * 0.32, y - s * 0.85); c.lineTo(x + s * 0.08, y - s * 0.78); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(40,34,26,0.55)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x - s, y); c.lineTo(x, y - s * 1.25); c.lineTo(x + s, y); c.stroke();
    };
    const tree = (x: number, y: number, s: number) => {
      c.fillStyle = 'rgba(20,30,15,0.35)'; c.beginPath(); c.ellipse(x + 2, y + s * 0.7, s, s * 0.45, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#2f5a2c'; c.beginPath(); c.arc(x, y, s, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#3f7339'; c.beginPath(); c.arc(x - s * 0.3, y - s * 0.3, s * 0.55, 0, Math.PI * 2); c.fill();
    };
    for (const t of camp.territories) {
      const ranges = t.scenery === 'ruins' ? 4 : t.scenery === 'forest' ? 1 : 1;
      const woods = t.scenery === 'forest' ? 6 : t.scenery === 'coast' ? 3 : 2;
      const peaks: { x: number; y: number; s: number }[] = [];
      for (let k = 0; k < ranges; k++) {
        const p = spot(t, 120);
        if (!p) continue;
        const n = 3 + Math.floor(rng() * 4), ang = rng() * Math.PI;
        for (let m = 0; m < n; m++) {
          const d = (m - n / 2) * 34;
          const x = p.x + Math.cos(ang) * d + (rng() - 0.5) * 16, y = p.y + Math.sin(ang) * d * 0.5 + (rng() - 0.5) * 12;
          if (Campaign.inPoly(x, y, t.poly) && !camp.nodes.some((nd) => (nd.x - x) ** 2 + (nd.y - y) ** 2 < 70 * 70) && !nearRoad(x, y, 28)) peaks.push({ x, y, s: 20 + rng() * 16 });
        }
      }
      const trees: { x: number; y: number; s: number }[] = [];
      for (let k = 0; k < woods; k++) {
        const p = spot(t, 90);
        if (!p) continue;
        for (let m = 0; m < 14; m++) {
          const x = p.x + (rng() - 0.5) * 120, y = p.y + (rng() - 0.5) * 80;
          if (Campaign.inPoly(x, y, t.poly) && !camp.nodes.some((nd) => (nd.x - x) ** 2 + (nd.y - y) ** 2 < 55 * 55) && !nearRoad(x, y, 22)) trees.push({ x, y, s: 8 + rng() * 6 });
        }
      }
      // back to front
      const all = [...peaks.map((p) => ({ ...p, m: true })), ...trees.map((p) => ({ ...p, m: false }))].sort((a, b) => a.y - b.y);
      for (const d of all) if (d.m) mountain(d.x, d.y, d.s); else tree(d.x, d.y, d.s);
    }
    // inland borders: dashed ink
    c.setLineDash([14, 10]); c.lineCap = 'round';
    for (const b of camp.borders) {
      c.strokeStyle = 'rgba(52,38,24,0.55)'; c.lineWidth = 4; line(b.pts); c.stroke();
    }
    c.setLineDash([]);
    // coastline
    c.strokeStyle = '#2d2a20'; c.lineWidth = 4; c.lineJoin = 'round';
    for (const p of camp.coast) { line(p); c.stroke(); }
    // roads: packed earth with a darker edge, gently bowed
    for (const pass of [0, 1]) {
      for (const [a, b] of camp.roads) {
        const A = camp.nodes[a], B = camp.nodes[b];
        const mx = (A.x + B.x) / 2 + (B.y - A.y) * 0.08, my = (A.y + B.y) / 2 - (B.x - A.x) * 0.08;
        c.beginPath(); c.moveTo(A.x, A.y); c.quadraticCurveTo(mx, my, B.x, B.y);
        c.strokeStyle = pass ? '#c9ad7a' : '#5e4a2e'; c.lineWidth = pass ? 6 : 10; c.stroke();
      }
    }
    return cv;
  }

  /** The campaign map (PLAN 7.1): the continent, who holds what, the nodes and the selected node's panel. */
  private drawMap(c: CanvasRenderingContext2D, g: Game) {
    const camp = g.camp;
    if (!this.mapLayer) this.mapLayer = this.buildMapLayer(camp);
    const s = g.mapScale(), K = Renderer.MAP_RES;
    c.fillStyle = '#1b3550'; c.fillRect(0, 0, VIEW_W, VIEW_H);
    const o = g.mapToScreen(0, 0);
    c.drawImage(this.mapLayer, o.x, o.y, CONTINENT.w * s, CONTINENT.h * s);
    void K;

    c.save();
    c.translate(o.x, o.y); c.scale(s, s);
    // who holds each territory (its castle): a wash of their colour
    for (const t of camp.territories) {
      const mine = camp.holds(t.id, 'player');
      c.beginPath(); t.poly.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath();
      c.fillStyle = mine ? 'rgba(70,140,255,0.26)' : 'rgba(170,30,45,0.14)';
      c.fill();
      // the frontier: territories you can strike into get a bright edge
      if (!mine && t.nodes.some((n) => camp.canAttack(n))) {
        c.strokeStyle = `rgba(255,213,74,${0.45 + Math.sin(g.time * 3) * 0.2})`; c.lineWidth = 3 / s; c.stroke();
      }
    }
    c.restore();

    // territory names
    c.save();
    c.textAlign = 'center';
    for (const t of camp.territories) {
      const p = g.mapToScreen(t.cx, t.cy);
      const size = Math.round(lerp(10, 17, g.mapZoom));
      c.font = `800 ${size}px Georgia, 'Times New Roman', serif`;
      c.lineWidth = 3; c.strokeStyle = 'rgba(25,20,12,0.7)';
      const label = t.name.toUpperCase();
      c.strokeText(label, p.x, p.y); c.fillStyle = 'rgba(245,232,200,0.92)'; c.fillText(label, p.x, p.y);
      c.font = `600 ${size - 3}px Georgia, serif`;
      c.fillStyle = 'rgba(245,232,200,0.75)';
      c.strokeText(`tier ${t.tier}`, p.x, p.y + size); c.fillText(`tier ${t.tier}`, p.x, p.y + size);
    }
    c.restore();

    // convoys on the roads
    for (const cv of g.war.convoys) this.drawMapConvoy(c, g, cv);
    // nodes
    for (const n of camp.nodes) this.drawMapNode(c, g, n);
    this.drawMapHud(c, g);
  }

  /** A convoy: a small covered wagon in its side's colour, gold aboard; ambushable ones pulse. */
  private drawMapConvoy(c: CanvasRenderingContext2D, g: Game, cv: Convoy) {
    const q = g.war.convoyPos(cv), p = g.mapToScreen(q.x, q.y);
    if (p.x < -30 || p.x > VIEW_W + 30 || p.y < -30 || p.y > VIEW_H + 30) return;
    const k = lerp(0.8, 1.15, g.mapZoom), mine = cv.team === 'player';
    c.save(); c.translate(p.x, p.y); c.scale(k, k);
    if (g.war.canAmbush(cv)) {
      c.strokeStyle = `rgba(255,213,74,${0.5 + Math.sin(g.time * 5 + cv.id) * 0.3})`; c.lineWidth = 2;
      c.beginPath(); c.arc(0, -3, 13, 0, Math.PI * 2); c.stroke();
    }
    if (g.mapConvoy === cv.id) { c.strokeStyle = '#ffffff'; c.lineWidth = 2.5; c.beginPath(); c.arc(0, -3, 16, 0, Math.PI * 2); c.stroke(); }
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(0, 5, 10, 3.5, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#6b4a2b'; c.fillRect(-9, -4, 18, 7);
    c.fillStyle = mine ? '#cfe3ff' : '#f0d8c8';
    c.beginPath(); c.moveTo(-8, -4); c.quadraticCurveTo(0, -15, 8, -4); c.closePath(); c.fill();
    c.fillStyle = mine ? PAL.ally : PAL.dominion; c.fillRect(-2, -10, 4, 4);
    c.fillStyle = '#2a1e10'; c.beginPath(); c.arc(-5, 4, 2.6, 0, Math.PI * 2); c.arc(5, 4, 2.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffd54a'; c.beginPath(); c.arc(8, -8, 2.4, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  /** One node icon: type by shape, owner by colour, level by pips; attackable ones pulse. */
  private drawMapNode(c: CanvasRenderingContext2D, g: Game, n: MapNode) {
    const p = g.mapToScreen(n.x, n.y);
    if (p.x < -40 || p.x > VIEW_W + 40 || p.y < -40 || p.y > VIEW_H + 40) return;
    const k = lerp(0.7, 1.25, g.mapZoom);
    const mine = n.owner === 'player';
    const body = mine ? '#4f8fe0' : '#b83a44', dark = mine ? '#1d3b66' : '#4a1418', hi = mine ? '#9fd0ff' : '#ff9a8a';
    const attackable = g.camp.canAttack(n);
    c.save();
    c.translate(p.x, p.y); c.scale(k, k);
    if (attackable) {
      c.strokeStyle = `rgba(255,213,74,${0.5 + Math.sin(g.time * 4 + n.id) * 0.3})`; c.lineWidth = 2.5;
      c.beginPath(); c.arc(0, 0, 17, 0, Math.PI * 2); c.stroke();
    }
    if (g.mapSel === n.id) {
      c.strokeStyle = '#ffffff'; c.lineWidth = 3;
      c.beginPath(); c.arc(0, 0, 21, 0, Math.PI * 2); c.stroke();
    }
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(0, 9, 14, 5, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = dark; c.lineWidth = 1.6; c.lineJoin = 'round';
    const box = (x: number, y: number, w: number, h: number) => { c.fillRect(x, y, w, h); c.strokeRect(x, y, w, h); };
    c.fillStyle = body;
    switch (n.type) {
      case 'castle': {
        box(-12, -10, 24, 18);
        box(-15, -18, 8, 26); box(7, -18, 8, 26);
        c.fillStyle = hi; c.fillRect(-15, -20, 8, 3); c.fillRect(7, -20, 8, 3);
        c.fillStyle = dark; c.fillRect(-3, -1, 6, 9);
        // banner
        c.strokeStyle = '#2a1e10'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, -10); c.lineTo(0, -28); c.stroke();
        c.fillStyle = mine ? '#ffd54a' : '#1a1a1a'; c.beginPath(); c.moveTo(0, -28); c.lineTo(13, -24); c.lineTo(0, -20); c.fill();
        break;
      }
      case 'keep':
        box(-10, -12, 20, 20);
        c.fillStyle = hi; for (let x = -10; x < 10; x += 6) c.fillRect(x, -15, 4, 3);
        c.fillStyle = dark; c.fillRect(-3, 0, 6, 8);
        break;
      case 'village':
        box(-13, -4, 11, 10); box(2, -7, 12, 13);
        c.fillStyle = mine ? '#c9e4ff' : '#e0b070';
        c.beginPath(); c.moveTo(-15, -4); c.lineTo(-7.5, -11); c.lineTo(0, -4); c.closePath(); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(0, -7); c.lineTo(8, -15); c.lineTo(16, -7); c.closePath(); c.fill(); c.stroke();
        break;
      case 'outpost':
        box(-5, -20, 10, 28);
        c.fillStyle = hi; c.fillRect(-7, -23, 14, 4);
        c.fillStyle = dark; c.fillRect(-2, -12, 4, 5);
        break;
    }
    // your castles show their garrison, your villages the gold waiting for the next convoy
    if (mine && n.type === 'castle') {
      const gn = g.war.garrison[n.id] ? troopTotal(g.war.garrison[n.id]!) : 0;
      c.fillStyle = 'rgba(10,20,40,0.85)'; c.fillRect(13, -20, 20, 11);
      c.fillStyle = '#cfe6ff'; c.font = '700 9px ui-monospace, Menlo, Consolas, monospace'; c.textAlign = 'center';
      c.fillText(String(gn), 23, -11.5);
    }
    if (mine && n.type === 'village') {
      const f = g.war.stock[n.id] / WAR.villageStockCap;
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(-12, 18, 24, 4);
      c.fillStyle = '#ffd54a'; c.fillRect(-12, 18, 24 * f, 4);
    }
    // level pips
    if (n.type !== 'outpost') {
      for (let i = 0; i < n.level; i++) {
        c.fillStyle = '#ffd54a'; c.strokeStyle = '#3a2a08'; c.lineWidth = 1;
        c.beginPath(); c.arc(-6 + i * 6, 14, 2.4, 0, Math.PI * 2); c.fill(); c.stroke();
      }
    }
    c.restore();
    // names when close (or selected); far out, the territory names do the talking
    if (g.mapZoom > 0.5 || g.mapSel === n.id) {
      c.save();
      c.textAlign = 'center';
      c.font = `700 ${n.type === 'castle' ? 11 : 10}px ui-monospace, Menlo, Consolas, monospace`;
      c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.75)';
      c.strokeText(n.name, p.x, p.y + 28 * k); c.fillStyle = mine ? '#cfe6ff' : '#ffe1d6'; c.fillText(n.name, p.x, p.y + 28 * k);
      c.restore();
    }
  }

  /** Toasts and banners (battle HUD and map). */
  private drawNotices(c: CanvasRenderingContext2D, g: Game) {
    // ---- toast
    if (g.toastT > 0) {
      c.save();
      c.globalAlpha = clamp(g.toastT / 0.5, 0, 1);
      c.textAlign = 'center';
      c.font = '800 15px ui-monospace, Menlo, Consolas, monospace';
      c.fillStyle = '#ffd54a';
      c.fillText(g.toastMsg, VIEW_W / 2, VIEW_H - 150);
      c.restore();
    }

    // ---- wave banner
    if (g.bannerT > 0) {
      c.save();
      const t = clamp(g.bannerT / 1.6, 0, 1);
      c.globalAlpha = Math.min(1, t * 2);
      c.textAlign = 'center';
      c.font = '900 46px ui-monospace, Menlo, Consolas, monospace';
      c.strokeStyle = 'rgba(0,0,0,0.8)';
      c.lineWidth = 7;
      c.strokeText(g.bannerMsg, VIEW_W / 2, VIEW_H / 2 - 40);
      c.fillStyle = g.bannerColor;
      c.fillText(g.bannerMsg, VIEW_W / 2, VIEW_H / 2 - 40);
      if (g.bannerSub) {
        c.font = '700 15px ui-monospace, Menlo, Consolas, monospace';
        c.fillStyle = PAL.text;
        c.fillText(g.bannerSub, VIEW_W / 2, VIEW_H / 2 - 10);
      }
      c.restore();
    }
  }

  /** The map's top bar, help line and the selected node's panel. */
  private drawMapHud(c: CanvasRenderingContext2D, g: Game) {
    const p = g.player, camp = g.camp;
    c.save();
    c.fillStyle = 'rgba(10,14,28,0.82)'; c.fillRect(0, 0, VIEW_W, MAP_BAR.h);
    c.textAlign = 'left'; c.font = '900 17px Georgia, serif'; c.fillStyle = '#ffd54a';
    c.fillText('THE VERDANT REACH', 16, 28);
    c.font = '700 13px ui-monospace, Menlo, Consolas, monospace';
    const items: [string, string][] = [
      ['gold', String(p.gold)], ['warband', `${troopTotal(g.war.warband)} / ${g.warbandCap()}`], ['SP', String(p.skillPoints)], ['territories', `${camp.territoriesHeld('player')} / ${camp.territories.length}`],
    ];
    let x = 260;
    for (const [k, v] of items) {
      c.fillStyle = PAL.dim; c.fillText(k, x, 27); x += c.measureText(k).width + 6;
      c.fillStyle = PAL.text; c.fillText(v, x, 27); x += c.measureText(v).width + 22;
    }
    c.textAlign = 'center'; c.font = '600 11px ui-monospace, Menlo, Consolas, monospace'; c.fillStyle = 'rgba(232,236,247,0.75)';
    const help = IS_TOUCH ? 'drag to pan  ·  pinch to zoom  ·  tap a node' : 'drag / WASD pan  ·  wheel / Z zoom  ·  arrows pick a node  ·  ENTER attack  ·  ESC title';
    c.fillStyle = 'rgba(10,14,28,0.6)'; c.fillRect(0, VIEW_H - 24, VIEW_W, 24);
    c.fillStyle = 'rgba(232,236,247,0.75)'; c.fillText(help, VIEW_W / 2, VIEW_H - 8);
    c.restore();
    const cv = g.selectedConvoy();
    if (cv) this.drawConvoyPanel(c, g, cv);
    else if (g.mapSel >= 0) this.drawNodePanel(c, g, camp.nodes[g.mapSel]);
    this.drawNotices(c, g);
  }

  /** A selected convoy: whose, what it carries, where it's going; Ambush for theirs. */
  private drawConvoyPanel(c: CanvasRenderingContext2D, g: Game, cv: Convoy) {
    const P = MAP_PANEL, camp = g.camp, mine = cv.team === 'player';
    c.save();
    c.fillStyle = 'rgba(12,16,30,0.92)'; this.roundRect(c, P.x, P.y, P.w, P.h, 10); c.fill();
    c.strokeStyle = mine ? '#5f9bff' : '#d0505a'; c.lineWidth = 2; this.roundRect(c, P.x, P.y, P.w, P.h, 10); c.stroke();
    const x = P.x + P.pad; let y = P.y + P.pad + 18;
    c.textAlign = 'left'; c.font = '900 18px Georgia, serif'; c.fillStyle = '#ffffff';
    c.fillText(mine ? 'Your convoy' : 'Dominion convoy', x, y); y += 22;
    const row = (k: string, v: string, col = PAL.text) => {
      c.fillStyle = PAL.dim; c.font = '600 12px ui-monospace, Menlo, Consolas, monospace'; c.fillText(k, x, y);
      c.textAlign = 'right'; c.fillStyle = col; c.font = '700 12px ui-monospace, Menlo, Consolas, monospace'; c.fillText(v, P.x + P.w - P.pad, y);
      c.textAlign = 'left'; y += 19;
    };
    row('Cargo', `${cv.cargo} gold`, '#ffd54a');
    row('From', camp.nodes[cv.path[0]].name);
    row('To', camp.nodes[cv.path[cv.path.length - 1]].name);
    if (!mine) {
      y += 4;
      c.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
      c.fillStyle = g.war.canAmbush(cv) ? '#c7b8ff' : '#ff9a8a';
      c.fillText(g.war.canAmbush(cv) ? 'Ambush: a convoy battle; win to take the cargo' : 'out of reach until it nears your frontier', x, y);
    }
    const btns = g.mapButtons();
    btns.forEach((b, i) => {
      const at = g.mapButtonAt(i, btns.length), main = b.label === 'Ambush';
      c.fillStyle = !b.enabled ? 'rgba(60,60,70,0.6)' : main ? 'rgba(200,60,70,0.9)' : 'rgba(40,50,80,0.9)';
      this.roundRect(c, at.x, at.y, MAP_BTN.w, MAP_BTN.h, 8); c.fill();
      c.textAlign = 'center'; c.font = `900 ${main ? 16 : 14}px ui-monospace, Menlo, Consolas, monospace`;
      c.fillStyle = b.enabled ? '#ffffff' : '#8a8a96';
      c.fillText(b.label.toUpperCase(), at.x + MAP_BTN.w / 2, at.y + MAP_BTN.h / 2 + 5);
    });
    c.restore();
  }

  /** The selected node's panel (PLAN 7.1). Buttons come from Game.mapButtons so taps and drawing agree. */
  private drawNodePanel(c: CanvasRenderingContext2D, g: Game, n: MapNode) {
    const camp = g.camp, t = camp.territories[n.territory];
    const P = MAP_PANEL;
    c.save();
    c.fillStyle = 'rgba(12,16,30,0.92)';
    this.roundRect(c, P.x, P.y, P.w, P.h, 10); c.fill();
    c.strokeStyle = n.owner === 'player' ? '#5f9bff' : '#d0505a'; c.lineWidth = 2;
    this.roundRect(c, P.x, P.y, P.w, P.h, 10); c.stroke();
    let y = P.y + P.pad + 18;
    const x = P.x + P.pad;
    c.textAlign = 'left';
    c.font = '900 18px Georgia, serif'; c.fillStyle = '#ffffff';
    c.fillText(n.name, x, y); y += 20;
    const typeName = { castle: 'Castle', keep: 'Keep', village: 'Village', outpost: 'Outpost' }[n.type];
    c.font = '700 12px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = n.owner === 'player' ? '#9fc8ff' : '#ff9a8a';
    c.fillText(`${typeName}${n.type !== 'outpost' ? ` · level ${n.level}` : ''} · ${n.owner === 'player' ? 'yours' : 'Dominion'}`, x, y); y += 17;
    c.fillStyle = PAL.dim;
    c.fillText(`${t.name} · tier ${t.tier}`, x, y); y += 24;
    const row = (k: string, v: string, col = PAL.text) => {
      c.fillStyle = PAL.dim; c.font = '600 12px ui-monospace, Menlo, Consolas, monospace'; c.fillText(k, x, y);
      c.textAlign = 'right'; c.fillStyle = col; c.font = '700 12px ui-monospace, Menlo, Consolas, monospace'; c.fillText(v, P.x + P.w - P.pad, y);
      c.textAlign = 'left'; y += 19;
    };
    const note = (s: string, col = '#c7b8ff') => {
      // wrapped to the panel (measured, PLAN 16)
      c.fillStyle = col; c.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
      let lineText = '';
      for (const w of s.split(' ')) {
        const tryText = lineText ? lineText + ' ' + w : w;
        if (c.measureText(tryText).width > P.w - P.pad * 2 && lineText) { c.fillText(lineText, x, y); y += 15; lineText = w; } else lineText = tryText;
      }
      if (lineText) { c.fillText(lineText, x, y); y += 17; }
    };
    if (n.owner === 'enemy') {
      const kind = Campaign.battleKind(n), tier = camp.battleTier(n);
      const names: Record<string, string> = { castle: 'Castle siege', keep: 'Keep assault', village: 'Village raid', outpost: 'Outpost capture' };
      row('Battle', names[kind]);
      row('Battle tier', String(tier), tier > t.tier ? '#ff9a8a' : PAL.text);
      row('Defenders', String(camp.garrison(n)));
      row('Reinforcements', `+${WAR.battleReinforce[kind]}`);
      y += 4;
      const keep = t.nodes.find((m) => m.type === 'keep'), op = t.nodes.find((m) => m.type === 'outpost');
      if (n.type === 'castle') {
        if (keep && keep.owner !== 'player') note('+50% garrison and an iron gate: their keep stands');
        const thin = t.nodes.filter((m) => m.owner === 'player' && (m.type === 'village' || m.type === 'outpost')).length;
        if (thin) note(`garrison thinned ${Math.round(Math.min(WAR.thinMax, WAR.thinPerNode * thin) * 100)}% by ${thin} node${thin > 1 ? 's' : ''} you hold`, '#9fe8b0');
      }
      if ((n.type === 'castle' || n.type === 'keep') && op && op.owner !== 'player') note('+1 tier of defenders: their watchtower stands');
      if (!camp.canAttack(n)) note('out of reach: take a bordering territory first', '#ff9a8a');
    } else {
      const w = g.war;
      if (n.type === 'castle') {
        const gr = w.garrison[n.id] || emptyReserve(), tot = troopTotal(gr), cap = w.cap(n);
        row('Garrison', `${tot} / ${cap}`);
        note(`sword ${gr.sword} · spear ${gr.spear} · archer ${gr.archer} · shield ${gr.shield} · ram ${gr.ram}`, PAL.dim);
        const status = tot >= cap ? 'full' : g.player.gold < WAR.troopCost.sword ? 'waiting for gold' : `+${w.production(n)} / min`;
        row('Recruiting', status, tot >= cap || g.player.gold < WAR.troopCost.sword ? '#ffb070' : '#9fe8b0');
        row('Warband', `${troopTotal(w.warband)} / ${g.warbandCap()}`);
        note('Send army and generals arrive in Phases 8 and 10', PAL.dim);
      } else if (n.type === 'village') {
        row('Income', `${w.income(n)} gold / min`, '#ffd54a');
        row('Gold waiting', `${Math.floor(w.stock[n.id])} / ${WAR.villageStockCap}`);
        row('Next convoy', `${Math.ceil(w.convoyT[n.id])} s`);
      } else if (n.type === 'keep') {
        row('Defense (sim)', `x${[1.5, 1.7, 2.0][n.level - 1]}`);
        row('Defenders', `+${WAR.keepDefenders[n.level - 1]}`);
      } else {
        note('outposts don\'t level; while you hold it, this territory\'s castle and keep fight a tier lower', PAL.dim);
      }
    }
    // buttons
    const btns = g.mapButtons();
    btns.forEach((b, i) => {
      const at = g.mapButtonAt(i, btns.length);
      const main = b.label === 'Attack';
      c.fillStyle = !b.enabled ? 'rgba(60,60,70,0.6)' : main ? 'rgba(200,60,70,0.9)' : 'rgba(40,50,80,0.9)';
      this.roundRect(c, at.x, at.y, MAP_BTN.w, MAP_BTN.h, 8); c.fill();
      c.textAlign = 'center'; c.font = `900 ${main ? 16 : 14}px ui-monospace, Menlo, Consolas, monospace`;
      c.fillStyle = b.enabled ? '#ffffff' : '#8a8a96';
      c.fillText(b.label.toUpperCase(), at.x + MAP_BTN.w / 2, at.y + MAP_BTN.h / 2 + 5);
    });
    c.restore();
  }

  /** Debug battle list (the Phase 4-5 stub): one battle of each type. */
  private drawSandbox(c: CanvasRenderingContext2D, g: Game) {
    c.save();
    c.fillStyle = 'rgba(6,8,14,0.9)';
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    c.textAlign = 'center';
    c.font = '900 30px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.mpCharge;
    c.fillText('BATTLE LIST', VIEW_W / 2, 92);
    c.font = '600 12px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.dim;
    c.fillText('debug: one battle of each type (the campaign map is New Game / Continue)', VIEW_W / 2, 116);
    c.fillStyle = '#ffd54a';
    c.fillText(`treasury ${g.player.gold} gold  ·  warband ${g.warbandCap()}`, VIEW_W / 2, 140);
    const rows = g.campaignRows();
    for (let i = 0; i < rows.length; i++) {
      const { x, y } = g.campRowAt(i);
      const on = i === g.campIndex;
      c.fillStyle = on ? 'rgba(80,140,255,0.26)' : 'rgba(19,23,40,0.75)';
      this.roundRect(c, x, y, CAMP_ROW.w, CAMP_ROW.h, 8); c.fill();
      c.strokeStyle = on ? '#6f9bff' : 'rgba(120,150,220,0.22)'; c.lineWidth = on ? 2 : 1.4;
      this.roundRect(c, x, y, CAMP_ROW.w, CAMP_ROW.h, 8); c.stroke();
      c.textAlign = 'left';
      c.font = '800 14px ui-monospace, Menlo, Consolas, monospace';
      c.fillStyle = on ? '#ffffff' : PAL.text;
      c.fillText(rows[i].label, x + 16, y + (rows[i].sub ? 21 : 30));
      if (rows[i].sub) {
        c.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
        c.fillStyle = PAL.dim;
        c.fillText(rows[i].sub, x + 16, y + 39);
      }
    }
    c.textAlign = 'center';
    c.font = '600 12px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.dim;
    c.fillText(IS_TOUCH ? 'tap a battle to start it' : '\u2191\u2193 choose  ·  ENTER start  ·  ESC title', VIEW_W / 2, VIEW_H - 30);
    c.restore();
  }

  /** The order wheel: four slices around the knight (Q / LB) or under the thumb (CMD). */
  private drawWheel(c: CanvasRenderingContext2D, g: Game) {
    const cx = clamp(g.wheelX, 90, VIEW_W - 90), cy = clamp(g.wheelY, 90, VIEW_H - 90);
    const R = 74, r = 26;
    c.save();
    for (let s = 0; s < 4; s++) {
      const o = Game.WHEEL[s];
      const mid = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][s];
      const on = s === g.wheelDir, cur = o === g.order;
      c.beginPath();
      c.arc(cx, cy, R, mid - Math.PI / 4 + 0.04, mid + Math.PI / 4 - 0.04);
      c.arc(cx, cy, r, mid + Math.PI / 4 - 0.04, mid - Math.PI / 4 + 0.04, true);
      c.closePath();
      c.fillStyle = on ? this.alpha(ORDER_COLOR[o], 0.55) : 'rgba(12,16,32,0.78)';
      c.fill();
      c.strokeStyle = cur || on ? ORDER_COLOR[o] : 'rgba(140,170,240,0.35)';
      c.lineWidth = cur ? 2.5 : 1.5;
      c.stroke();
      c.font = '800 11px ui-monospace, Menlo, Consolas, monospace';
      c.textAlign = 'center';
      c.fillStyle = on ? '#ffffff' : ORDER_COLOR[o];
      c.fillText(o.toUpperCase(), cx + Math.cos(mid) * (R + r) / 2, cy + Math.sin(mid) * (R + r) / 2 + 4);
    }
    c.restore();
  }

  /** Arrows in flight: short shafts along their velocity. */
  private drawArrows(c: CanvasRenderingContext2D, a: Army) {
    if (!a.arrows) return;
    c.strokeStyle = '#e8dcc0'; c.lineWidth = 1.5;
    c.beginPath();
    for (let k = 0; k < a.arrows; k++) {
      const sp = Math.hypot(a.avx[k], a.avy[k]) || 1;
      const ux = a.avx[k] / sp, uy = a.avy[k] / sp;
      const x = a.ax[k], y = a.ay[k] - 12;
      c.moveTo(x - ux * 8, y - uy * 8); c.lineTo(x, y);
    }
    c.stroke();
  }

  /* ------------------------------------------------------- battlefield */

  /**
   * Open ground: a grass base, mown bands, worn dirt patches, tufts and
   * pebbles, and a treeline hedge round the edge. Everything is placed from a
   * hash of its cell, so it stays put while the camera moves. New art for
   * Aerial Conquest; nothing here comes from Aerial Finisher's regions.
   */
  private drawField(c: CanvasRenderingContext2D, g: Game, cam: { x: number; y: number }) {
    this.pal = SCENERY[g.battle.spec.scenery];
    this.paintField(c, g.field, cam, VIEW_W, VIEW_H);
    this.drawDecor(c, g, cam);
    this.drawGroundRings(c, g);
  }

  private pal = SCENERY.forest;

  /** Paint the field (and the treeline around it) for the view rectangle at `cam`, `vw` x `vh`. */
  private paintField(c: CanvasRenderingContext2D, f: { x: number; y: number; w: number; h: number }, cam: { x: number; y: number }, vw: number, vh: number) {
    // beyond the field: dark forest
    c.fillStyle = this.pal.forest;
    c.fillRect(cam.x - 10, cam.y - 10, vw + 20, vh + 20);
    // grass, in broad mown bands
    const band = 96;
    const b0 = Math.max(0, Math.floor((cam.y - f.y) / band)), b1 = Math.ceil((cam.y + vh - f.y) / band);
    for (let b = b0; b <= b1; b++) {
      const y = f.y + b * band;
      if (y >= f.y + f.h) break;
      c.fillStyle = b % 2 ? this.pal.grassA : this.pal.grassB;
      c.fillRect(Math.max(f.x, cam.x - 10), y, Math.min(f.w, vw + 20), Math.min(band, f.y + f.h - y));
    }
    // per-cell details
    const cell = 64;
    const cx0 = Math.max(0, Math.floor((cam.x - f.x) / cell) - 1), cx1 = Math.min(Math.ceil(f.w / cell), Math.ceil((cam.x + vw - f.x) / cell) + 1);
    const cy0 = Math.max(0, Math.floor((cam.y - f.y) / cell) - 1), cy1 = Math.min(Math.ceil(f.h / cell), Math.ceil((cam.y + vh - f.y) / cell) + 1);
    for (let cy = cy0; cy < cy1; cy++) for (let cx = cx0; cx < cx1; cx++) {
      const h = this.cellHash(cx, cy);
      const x = f.x + cx * cell, y = f.y + cy * cell;
      if (h % 23 === 0) {
        // a worn dirt patch
        c.fillStyle = this.pal.dirt;
        c.beginPath(); c.ellipse(x + 32, y + 32, 26 + (h % 9), 14 + (h % 5), (h % 7) * 0.4, 0, Math.PI * 2); c.fill();
      }
      // grass tufts
      const tufts = h % 4;
      c.strokeStyle = (h >> 3) % 2 ? this.pal.tuftA : this.pal.tuftB;
      c.lineWidth = 1.5;
      for (let k = 0; k < tufts; k++) {
        const tx = x + ((h >> (k * 3)) % cell), ty = y + ((h >> (k * 3 + 5)) % cell);
        c.beginPath();
        c.moveTo(tx - 3, ty); c.lineTo(tx - 4, ty - 6);
        c.moveTo(tx, ty); c.lineTo(tx, ty - 8);
        c.moveTo(tx + 3, ty); c.lineTo(tx + 4, ty - 6);
        c.stroke();
      }
      if (h % 11 === 0) {
        // a pebble
        c.fillStyle = '#8a8f86';
        c.beginPath(); c.ellipse(x + (h % 50) + 7, y + ((h >> 4) % 50) + 7, 4, 2.6, 0, 0, Math.PI * 2); c.fill();
      }
      if (h % 37 === 0) {
        // a few wildflowers
        c.fillStyle = (h >> 2) % 2 ? '#f3e27a' : '#e9eef7';
        for (let k = 0; k < 3; k++) c.fillRect(x + ((h >> k) % 48) + 8, y + ((h >> (k + 6)) % 48) + 8, 3, 3);
      }
    }
    // the treeline round the edge
    c.strokeStyle = '#1f3522';
    c.lineWidth = 3;
    c.strokeRect(f.x, f.y, f.w, f.h);
    const tree = (tx: number, ty: number, s: number) => {
      if (tx < cam.x - 60 || tx > cam.x + vw + 60 || ty < cam.y - 60 || ty > cam.y + vh + 60) return;
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.beginPath(); c.ellipse(tx + 4, ty + 10, s * 0.9, s * 0.4, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = this.pal.tree;
      c.beginPath(); c.arc(tx, ty - s * 0.3, s, 0, Math.PI * 2); c.fill();
      c.fillStyle = this.pal.treeHi;
      c.beginPath(); c.arc(tx - s * 0.3, ty - s * 0.6, s * 0.6, 0, Math.PI * 2); c.fill();
    };
    for (let x = f.x; x <= f.x + f.w; x += 44) {
      const h = this.cellHash(x, 7);
      tree(x, f.y - 6, 20 + (h % 8));
      tree(x + 22, f.y + f.h + 18, 20 + ((h >> 3) % 8));
    }
    for (let y = f.y; y <= f.y + f.h; y += 44) {
      const h = this.cellHash(3, y);
      tree(f.x - 14, y, 20 + (h % 8));
      tree(f.x + f.w + 14, y + 22, 20 + ((h >> 3) % 8));
    }
  }

  /** Roads, crop plots, fences, the well, rocks and bushes (ground level, not solid). */
  private drawDecor(c: CanvasRenderingContext2D, g: Game, cam: { x: number; y: number }) {
    const vis = (d: Decor) => d.x + d.w > cam.x - 40 && d.x - d.w < cam.x + VIEW_W + 40 && d.y + d.h > cam.y - 40 && d.y - d.h < cam.y + VIEW_H + 40;
    for (const d of g.battle.decor) {
      if (d.kind === 'road') {
        c.fillStyle = 'rgba(150,120,80,0.55)';
        c.fillRect(Math.max(d.x, cam.x - 10), d.y, Math.min(d.w, VIEW_W + 20), d.h);
        c.fillStyle = 'rgba(110,86,56,0.35)';
        c.fillRect(Math.max(d.x, cam.x - 10), d.y + 8, Math.min(d.w, VIEW_W + 20), 3);
        c.fillRect(Math.max(d.x, cam.x - 10), d.y + d.h - 11, Math.min(d.w, VIEW_W + 20), 3);
        continue;
      }
      if (!vis(d)) continue;
      if (d.kind === 'stone') {
        // paving inside walls: flagstones, only the part on screen
        const x0 = Math.max(d.x - d.w / 2, cam.x - 10), x1 = Math.min(d.x + d.w / 2, cam.x + VIEW_W + 10);
        const y0 = Math.max(d.y - d.h / 2, cam.y - 10), y1 = Math.min(d.y + d.h / 2, cam.y + VIEW_H + 10);
        c.fillStyle = '#6e6a63'; c.fillRect(x0, y0, x1 - x0, y1 - y0);
        c.strokeStyle = 'rgba(40,38,34,0.35)'; c.lineWidth = 1;
        c.beginPath();
        const gy0 = d.y - d.h / 2, gx0 = d.x - d.w / 2;
        for (let yy = gy0 + Math.ceil((y0 - gy0) / 32) * 32; yy < y1; yy += 32) { c.moveTo(x0, yy); c.lineTo(x1, yy); }
        for (let yy = gy0 + Math.floor((y0 - gy0) / 32) * 32; yy < y1; yy += 32) {
          const off = (Math.round((yy - gy0) / 32) % 2) * 24;
          for (let xx = gx0 + off + Math.floor((x0 - gx0 - off) / 48) * 48; xx < x1; xx += 48) { c.moveTo(xx, Math.max(yy, y0)); c.lineTo(xx, Math.min(yy + 32, y1)); }
        }
        c.stroke();
        continue;
      }
      if (d.kind === 'rise') {
        c.fillStyle = 'rgba(255,255,220,0.07)';
        c.beginPath(); c.ellipse(d.x, d.y, d.w / 2, d.h / 2, 0, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.ellipse(d.x + 10, d.y - 8, d.w * 0.38, d.h * 0.36, 0, 0, Math.PI * 2); c.fill();
        continue;
      }
      if (d.kind === 'carpet') {
        c.fillStyle = '#6e1f2a'; c.fillRect(d.x - d.w / 2, d.y - d.h / 2, d.w, d.h);
        c.strokeStyle = '#d4a73a'; c.lineWidth = 3; c.strokeRect(d.x - d.w / 2 + 5, d.y - d.h / 2 + 5, d.w - 10, d.h - 10);
        continue;
      }
      if (d.kind === 'crops') {
        c.fillStyle = '#6b5a33';
        c.fillRect(d.x - d.w / 2, d.y - d.h / 2, d.w, d.h);
        c.strokeStyle = '#a3b24f'; c.lineWidth = 3;
        c.beginPath();
        for (let yy = d.y - d.h / 2 + 8; yy < d.y + d.h / 2; yy += 12) { c.moveTo(d.x - d.w / 2 + 6, yy); c.lineTo(d.x + d.w / 2 - 6, yy); }
        c.stroke();
      } else if (d.kind === 'fence') {
        c.strokeStyle = '#7a5a36'; c.lineWidth = 2;
        c.beginPath();
        c.moveTo(d.x - d.w / 2, d.y - 8); c.lineTo(d.x + d.w / 2, d.y - 8);
        c.moveTo(d.x - d.w / 2, d.y - 3); c.lineTo(d.x + d.w / 2, d.y - 3);
        for (let xx = d.x - d.w / 2; xx <= d.x + d.w / 2; xx += 15) { c.moveTo(xx, d.y); c.lineTo(xx, d.y - 12); }
        c.stroke();
      } else if (d.kind === 'well') {
        c.fillStyle = '#7d7f86'; c.beginPath(); c.ellipse(d.x, d.y, d.w / 2, d.w / 3, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#1c2a3a'; c.beginPath(); c.ellipse(d.x, d.y - 2, d.w / 3, d.w / 5, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#6b4a2b'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(d.x - d.w / 2 + 2, d.y); c.lineTo(d.x - d.w / 2 + 2, d.y - 26); c.lineTo(d.x + d.w / 2 - 2, d.y - 26); c.lineTo(d.x + d.w / 2 - 2, d.y); c.stroke();
      } else if (d.kind === 'rock') {
        c.fillStyle = '#7b7f78'; c.beginPath(); c.ellipse(d.x, d.y, d.w / 2, d.h / 2, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#9a9e95'; c.beginPath(); c.ellipse(d.x - 2, d.y - 2, d.w / 3, d.h / 3, 0, 0, Math.PI * 2); c.fill();
      } else {
        c.fillStyle = this.pal.tree; c.beginPath(); c.arc(d.x, d.y, d.w / 2, 0, Math.PI * 2); c.fill();
        c.fillStyle = this.pal.treeHi; c.beginPath(); c.arc(d.x - 3, d.y - 3, d.w / 3, 0, Math.PI * 2); c.fill();
      }
    }
  }

  /** Structures: houses, walls and towers, gates, the throne, wagons, the rescue cell (rings are ground marks). */
  private drawStructure(c: CanvasRenderingContext2D, s: Structure, g: Game) {
    switch (s.kind) {
      case 'building': this.drawHouse(c, s, g); return;
      case 'wall': if (s.look === 'tower') this.drawTower(c, s); else this.drawWall(c, s); return;
      case 'gate': this.drawGate(c, s, g); return;
      case 'throne': this.drawThrone(c, s, g); return;
      case 'wagon': this.drawWagon(c, s, g); return;
      case 'cell': this.drawCell(c, s); return;
      default: return;
    }
  }

  /** An HP bar over a hurt structure. */
  private structureBar(c: CanvasRenderingContext2D, s: Structure, top: number, col = '#ff9d4a') {
    if (!s.alive || s.hp >= s.maxHp) return;
    const w = Math.max(60, Math.min(110, s.w));
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(s.x - w / 2, top - 12, w, 6);
    c.fillStyle = col; c.fillRect(s.x - w / 2, top - 12, w * (s.hp / s.maxHp), 6);
  }

  /** Stone wall: a footprint seen from above, its south face showing. */
  private drawWall(c: CanvasRenderingContext2D, s: Structure) {
    const H = 24, x0 = s.x - s.w / 2, y0 = s.y - s.h;
    c.fillStyle = '#5b5a60';
    c.fillRect(x0, s.y - H, s.w, H);                       // south face
    c.fillStyle = '#8d8b92';
    c.fillRect(x0, y0 - H, s.w, s.h);                      // top
    c.strokeStyle = 'rgba(40,40,46,0.6)'; c.lineWidth = 1;
    c.beginPath();
    for (let yy = s.y - H + 8; yy < s.y; yy += 8) { c.moveTo(x0, yy); c.lineTo(x0 + s.w, yy); }
    c.stroke();
    // crenellations along the top
    c.fillStyle = '#a7a5ad';
    if (s.w > s.h) for (let xx = x0 + 4; xx < x0 + s.w - 8; xx += 18) c.fillRect(xx, y0 - H - 5, 9, 6);
    else for (let yy = y0 - H + 4; yy < s.y - H - 8; yy += 18) c.fillRect(x0 + s.w / 2 - 4, yy, 8, 9);
    c.strokeStyle = '#3d3c42'; c.lineWidth = 2;
    c.strokeRect(x0, y0 - H, s.w, s.h + H);
  }

  /** The outpost's watchtower: a round stone tower with a banner. */
  private drawTower(c: CanvasRenderingContext2D, s: Structure) {
    const r = s.w / 2, cy = s.y - s.h / 2, H = 70;
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(s.x + 8, cy + 6, r + 6, r * 0.7, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#5b5a60'; c.fillRect(s.x - r, cy - H, r * 2, H);
    c.beginPath(); c.ellipse(s.x, cy, r, r * 0.55, 0, 0, Math.PI); c.fill();
    c.fillStyle = '#8d8b92'; c.beginPath(); c.ellipse(s.x, cy - H, r, r * 0.55, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#3d3c42'; c.beginPath(); c.ellipse(s.x, cy - H, r - 8, r * 0.4, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#1b1a20'; c.fillRect(s.x - 6, cy - H * 0.6, 12, 18);
    c.strokeStyle = '#6b4a2b'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(s.x, cy - H); c.lineTo(s.x, cy - H - 46); c.stroke();
    c.fillStyle = PAL.dominion; c.beginPath(); c.moveTo(s.x, cy - H - 46); c.lineTo(s.x + 30, cy - H - 38); c.lineTo(s.x, cy - H - 30); c.fill();
  }

  /** A gate: banded timber doors in the wall's gap (iron-bound for a castle whose keep still stands). */
  private drawGate(c: CanvasRenderingContext2D, s: Structure, g: Game) {
    const H = 24, x0 = s.x - s.w / 2, y0 = s.y - s.h;
    if (!s.alive) {
      c.fillStyle = '#4a3420';
      for (let k = 0; k < 5; k++) c.fillRect(x0 - 10 + ((k * 23) % 40), y0 + 10 + k * (s.h - 20) / 5, 26, 7);
      return;
    }
    const iron = g.battle.spec.ironGate;
    c.fillStyle = s.flash > 0 ? '#ffffff' : '#7a5230';
    c.fillRect(x0, y0 - H, s.w, s.h + H);
    c.strokeStyle = iron ? '#9aa3ad' : '#3b2614'; c.lineWidth = iron ? 4 : 3;
    c.beginPath();
    for (let yy = y0 - H + 12; yy < s.y; yy += 22) { c.moveTo(x0, yy); c.lineTo(x0 + s.w, yy); }
    c.stroke();
    c.strokeStyle = '#2a1a0e'; c.lineWidth = 2; c.strokeRect(x0, y0 - H, s.w, s.h + H);
    // cracks as it weakens
    const hurt = 1 - s.hp / s.maxHp;
    if (hurt > 0.3) {
      c.strokeStyle = '#1a0f06'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x0 + 4, y0 + s.h * 0.3); c.lineTo(x0 + s.w - 6, y0 + s.h * 0.45); c.lineTo(x0 + 6, y0 + s.h * 0.6); c.stroke();
    }
    this.structureBar(c, s, y0 - H, iron ? '#c7d0da' : '#ff9d4a');
  }

  /** The castle throne on its dais. */
  private drawThrone(c: CanvasRenderingContext2D, s: Structure, g: Game) {
    const x0 = s.x - s.w / 2;
    c.fillStyle = '#4d4652'; c.fillRect(x0 - 14, s.y - 10, s.w + 28, 14);   // dais
    if (!s.alive) {
      c.fillStyle = '#3b2c22';
      for (let k = 0; k < 6; k++) c.fillRect(x0 + (k * 17) % s.w, s.y - 18 - (k % 3) * 6, 14, 6);
      return;
    }
    const flash = s.flash > 0;
    c.fillStyle = flash ? '#ffffff' : '#6a2c8a';
    c.fillRect(x0 + 6, s.y - s.h - 26, s.w - 12, s.h + 16);                // back
    c.fillStyle = flash ? '#ffffff' : '#d4a73a';
    c.fillRect(x0, s.y - s.h * 0.55, s.w, 10);                             // arms
    c.fillRect(x0 + 6, s.y - s.h - 32, s.w - 12, 7);
    c.beginPath(); c.moveTo(s.x - 10, s.y - s.h - 32); c.lineTo(s.x, s.y - s.h - 48); c.lineTo(s.x + 10, s.y - s.h - 32); c.fill();
    c.fillStyle = '#8a3a9e'; c.fillRect(x0 + 12, s.y - s.h * 0.5, s.w - 24, s.h * 0.4);   // seat
    void g;
    this.structureBar(c, s, s.y - s.h - 50, '#c79bff');
  }

  /** A covered supply wagon with the Dominion's red cloth; wrecked when destroyed. */
  private drawWagon(c: CanvasRenderingContext2D, s: Structure, g: Game) {
    if (s.escaped) return;
    const x0 = s.x - s.w / 2;
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x0 + 4, s.y - 4, s.w, 9);
    if (!s.alive) {
      c.fillStyle = '#3a2a1c'; c.fillRect(x0, s.y - 16, s.w * 0.7, 14);
      c.strokeStyle = '#1e140c'; c.lineWidth = 3;
      c.beginPath(); c.arc(x0 + s.w - 10, s.y - 6, 9, 0, Math.PI * 2); c.stroke();
      return;
    }
    const roll = (g.battle.time * s.speed) / 10;
    c.fillStyle = s.flash > 0 ? '#ffffff' : '#7a5230';
    c.fillRect(x0, s.y - 26, s.w, 18);
    c.fillStyle = s.flash > 0 ? '#ffffff' : '#c9c2ae';
    c.beginPath(); c.moveTo(x0 + 4, s.y - 26); c.quadraticCurveTo(s.x, s.y - s.h - 16, x0 + s.w - 4, s.y - 26); c.fill();
    c.fillStyle = PAL.dominion; c.fillRect(s.x - 8, s.y - s.h - 4, 16, 14);
    c.strokeStyle = '#2a1a0e'; c.lineWidth = 3;
    for (const wx of [x0 + 12, x0 + s.w - 12]) {
      c.beginPath(); c.arc(wx, s.y - 6, 9, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(wx + Math.cos(roll) * 9, s.y - 6 + Math.sin(roll) * 9); c.lineTo(wx - Math.cos(roll) * 9, s.y - 6 - Math.sin(roll) * 9); c.stroke();
    }
    c.fillStyle = '#ffd54a'; c.beginPath(); c.arc(s.x + 14, s.y - 30, 4, 0, Math.PI * 2); c.fill();
    this.structureBar(c, s, s.y - s.h - 18);
  }

  /** The rescue cell: an iron cage, open once the general is out. */
  private drawCell(c: CanvasRenderingContext2D, s: Structure) {
    const x0 = s.x - s.w / 2, top = s.y - s.h - 20;
    c.fillStyle = '#2b2a30'; c.fillRect(x0, s.y - 8, s.w, 8);
    c.strokeStyle = '#9aa3ad'; c.lineWidth = 3;
    c.beginPath();
    const open = s.hp <= 0;
    for (let k = 0; k <= 6; k++) {
      const xx = x0 + (s.w * k) / 6;
      if (open && k >= 2 && k <= 4) continue;
      c.moveTo(xx, s.y - 4); c.lineTo(xx, top);
    }
    c.moveTo(x0, top); c.lineTo(x0 + s.w, top);
    c.stroke();
    if (!open) {
      // someone inside
      c.fillStyle = '#2d4f7a'; c.beginPath(); c.arc(s.x, s.y - 22, 9, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#f1d3b0'; c.beginPath(); c.arc(s.x, s.y - 36, 6, 0, Math.PI * 2); c.fill();
    }
  }

  /** Capture rings and the cell's ring: ground marks with a progress arc. */
  private drawGroundRings(c: CanvasRenderingContext2D, g: Game) {
    for (const s of g.battle.structures) {
      if (s.kind !== 'captureRing' && s.kind !== 'cell') continue;
      if (s.kind === 'cell' && s.hp <= 0) continue;
      const cx = s.x, cy = s.y;
      const k = s.need ? clamp(s.progress / s.need, 0, 1) : 0;
      c.save();
      c.fillStyle = s.contested ? 'rgba(255,90,90,0.12)' : 'rgba(255,213,74,0.10)';
      c.beginPath(); c.ellipse(cx, cy, s.ringR, s.ringR, 0, 0, Math.PI * 2); c.fill();
      c.setLineDash([10, 8]); c.lineDashOffset = -g.time * 20;
      c.strokeStyle = s.contested ? '#ff6b6b' : '#ffd54a'; c.lineWidth = 2;
      c.beginPath(); c.ellipse(cx, cy, s.ringR, s.ringR, 0, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
      if (k > 0) {
        c.strokeStyle = '#4fe08a'; c.lineWidth = 5;
        c.beginPath(); c.ellipse(cx, cy, s.ringR, s.ringR, 0, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); c.stroke();
      }
      c.restore();
    }
  }

  /** A house (timber and thatch), smoking when hurt, a burned shell when destroyed. */
  private drawHouse(c: CanvasRenderingContext2D, s: Structure, g: Game) {
    const x0 = s.x - s.w / 2, y1 = s.y, wallH = s.h * 0.55;
    const flash = s.flash > 0;
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.fillRect(x0 + 6, y1 - 4, s.w, 10);
    if (!s.alive) {
      // charred frame and embers
      c.fillStyle = '#2a2420'; c.fillRect(x0, y1 - wallH * 0.5, s.w, wallH * 0.5);
      c.strokeStyle = '#141110'; c.lineWidth = 4;
      c.beginPath();
      c.moveTo(x0 + 8, y1); c.lineTo(x0 + 14, y1 - wallH * 1.1);
      c.moveTo(x0 + s.w - 8, y1); c.lineTo(x0 + s.w - 18, y1 - wallH * 0.9);
      c.moveTo(x0 + s.w * 0.45, y1); c.lineTo(x0 + s.w * 0.55, y1 - wallH * 1.3);
      c.stroke();
      const glow = Math.max(0, 1 - s.burnT / 8);
      if (glow > 0) {
        for (let k = 0; k < 6; k++) {
          const fx = x0 + 10 + ((k * 37 + Math.floor(g.time * 10)) % (s.w - 20)), fy = y1 - 6 - (k % 3) * 8;
          c.fillStyle = `rgba(255,${120 + (k % 3) * 40},40,${0.5 * glow})`;
          c.beginPath(); c.arc(fx, fy - Math.sin(g.time * 6 + k) * 4, 4 + (k % 2) * 2, 0, Math.PI * 2); c.fill();
        }
      }
      return;
    }
    // walls
    c.fillStyle = flash ? '#ffffff' : '#c9b48a';
    c.fillRect(x0, y1 - wallH, s.w, wallH);
    c.strokeStyle = flash ? '#ffffff' : '#5e4026'; c.lineWidth = 3;
    c.strokeRect(x0, y1 - wallH, s.w, wallH);
    c.beginPath();
    for (let k = 1; k < 4; k++) { c.moveTo(x0 + (s.w * k) / 4, y1 - wallH); c.lineTo(x0 + (s.w * k) / 4, y1); }
    c.stroke();
    // door and window
    c.fillStyle = '#3d2716'; c.fillRect(s.x - 9, y1 - 26, 18, 26);
    c.fillStyle = '#ffd58a'; c.fillRect(x0 + 12, y1 - wallH + 10, 14, 11);
    // thatched roof
    c.fillStyle = flash ? '#ffffff' : '#a07a3c';
    c.beginPath();
    c.moveTo(x0 - 8, y1 - wallH + 2); c.lineTo(s.x, y1 - s.h - 12); c.lineTo(x0 + s.w + 8, y1 - wallH + 2);
    c.closePath(); c.fill();
    c.strokeStyle = '#7a5a2a'; c.lineWidth = 1.5;
    c.beginPath();
    for (let k = 1; k < 6; k++) { const t = k / 6; c.moveTo(x0 - 8 + (s.x - x0 + 8) * t, y1 - wallH + 2 - (s.h + 14 - wallH) * t); c.lineTo(x0 + s.w + 8 - (x0 + s.w + 8 - s.x) * t, y1 - wallH + 2 - (s.h + 14 - wallH) * t); }
    c.stroke();
    // damage: smoke, then flames, as HP falls
    const hurt = 1 - s.hp / s.maxHp;
    if (hurt > 0.25) {
      for (let k = 0; k < 3; k++) {
        const t = (g.time * 0.6 + k / 3) % 1;
        c.fillStyle = `rgba(60,60,60,${0.35 * (1 - t)})`;
        c.beginPath(); c.arc(s.x - 20 + k * 20 + Math.sin(t * 6) * 6, y1 - s.h - 10 - t * 60, 8 + t * 14, 0, Math.PI * 2); c.fill();
      }
    }
    if (hurt > 0.55) {
      for (let k = 0; k < 4; k++) {
        const fx = x0 + 14 + k * (s.w - 28) / 3, fy = y1 - wallH - 6;
        c.fillStyle = k % 2 ? '#ff9d4a' : '#ffd54a';
        c.beginPath(); c.moveTo(fx - 6, fy + 6); c.quadraticCurveTo(fx, fy - 18 - Math.sin(g.time * 12 + k) * 5, fx + 6, fy + 6); c.fill();
      }
    }
    // HP bar once hurt
    if (s.hp < s.maxHp) {
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(s.x - 40, y1 - s.h - 30, 80, 6);
      c.fillStyle = '#ff9d4a'; c.fillRect(s.x - 40, y1 - s.h - 30, 80 * (s.hp / s.maxHp), 6);
    }
  }

  /** A stable pseudo-random number for a grid cell. */
  private cellHash(x: number, y: number): number {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return (h ^ (h >>> 16)) >>> 0;
  }

  private drawShadow(c: CanvasRenderingContext2D, x: number, y: number, r: number, z: number) {
    const shrink = clamp(1 - z / 320, 0.35, 1);
    c.save();
    c.globalAlpha = 0.34 * shrink;
    c.fillStyle = '#000';
    c.beginPath();
    c.ellipse(x, y + 3, r * 1.05 * shrink, r * 0.45 * shrink, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  /* ------------------------------------------------------------ player */

  /**
   * The knight. Dark plate, gold trim, red half-cape, a lit visor slit where
   * a face would be. Armour tier is read through silhouette first — pauldron
   * width, spikes, cape length — and ornament second.
   */
  private drawPlayer(c: CanvasRenderingContext2D, p: Player, g: Game) {
    const px = sx(p.x), py = sy(p.y, p.z);
    const dead = p.state === 'dead';
    const look = p.armor.look;
    const squash = p.landSquash > 0 ? 1 + p.landSquash / 40 : 1;
    const stretch = p.landSquash > 0 ? 1 - p.landSquash / 46 : 1;

    const fx = Math.cos(p.facing);
    const fy = Math.sin(p.facing);
    const away = fy < -0.3;
    const speed = Math.hypot(p.vx, p.vy);
    const moving = speed > 25 && p.grounded;
    const stride = moving ? Math.sin(g.time * 15) * clamp(speed / 210, 0, 1) * 5 : 0;
    const bob = moving ? Math.abs(Math.sin(g.time * 15)) * 1.6 : Math.sin(g.time * 2.2) * 0.8;

    const h = p.height * stretch;
    const hurt = p.flash > 0;
    const plate = hurt ? '#ffffff' : look.plate;
    const trim = hurt ? '#ffffff' : look.trim;
    const ink = '#080a11';

    // A soft rim behind the figure — the player must always be the brightest
    // thing on the floor, or you lose yourself in a crowded wave.
    c.save();
    c.globalAlpha = 0.22;
    const rg = c.createRadialGradient(px, py - h * 0.45, 4, px, py - h * 0.45, h * 1.15);
    rg.addColorStop(0, look.trim);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = rg;
    c.beginPath();
    c.ellipse(px, py - h * 0.45, h * 1.05, h * 0.95, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();

    c.save();
    c.translate(px, py - bob);
    if (dead) c.rotate(clamp(g.deathT * 2.2, 0, 1) * 1.4);
    if (p.iframes > 0 && !dead && Math.floor(g.time * 30) % 2 === 0) c.globalAlpha = 0.5;
    if (squash !== 1) c.scale(squash, 1 / squash);

    const outline = (w = 2) => { c.strokeStyle = ink; c.lineWidth = w; c.stroke(); };
    const k: HeroCtx = {
      h, plate, trim, cape: hurt ? '#ffffff' : look.cape, look, hurt, away, fx, stride,
      drag: clamp(-p.vx / 260, -0.5, 0.5), t: g.time, ink, outline,
    };
    switch (g.heroStyle) {
      case 'wayfarer': this.heroWayfarer(c, k); break;
      case 'dreamer': this.heroDreamer(c, k); break;
      case 'paladin': this.heroPaladin(c, k); break;
      case 'ronin': this.heroRonin(c, k); break;
      default: this.heroKnight(c, k);
    }

    // ---- weapon arm and blade
    if (p.state === 'attack' && p.attackDef) this.drawBlade(c, p, h);
    else this.drawIdleBlade(c, p, h, fx);

    c.restore();

    if (p.charging) {
      c.save();
      c.globalAlpha = 0.5 + Math.sin(g.time * 12) * 0.2;
      c.strokeStyle = PAL.mpCharge;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(px, py - 6, 28 + Math.sin(g.time * 6) * 3, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }
    // dash charge pips float above the helm
    if (p.hasT('dash') && p.dashCharges < p.maxDash()) {
      for (let i = 0; i < p.maxDash(); i++) {
        c.fillStyle = i < p.dashCharges ? '#8fb4ff' : '#3a4260';
        c.fillRect(px - p.maxDash() * 4 + i * 8, py - p.height - 30, 5, 3);
      }
    }
  }

  /** The original knight: dark plate, gold trim, half-cape, a lit visor slit. */
  private heroKnight(c: CanvasRenderingContext2D, k: HeroCtx) {
    const { h, plate, trim, look, hurt, away, fx, stride, outline } = k;
    void fx;
    const p = { vx: -k.drag * 260 };

    // ---- cape, behind everything, dragged by movement
    const capeLen = look.capeLen * (away ? 1.15 : 1);
    const drag = clamp(-p.vx / 260, -0.5, 0.5);
    c.beginPath();
    c.moveTo(-9, -h * 0.86);
    c.quadraticCurveTo(-13 + drag * 16, -h * 0.35, -7 + drag * 26, -h * 0.9 + capeLen);
    c.lineTo(7 + drag * 26, -h * 0.9 + capeLen);
    c.quadraticCurveTo(13 + drag * 16, -h * 0.35, 9, -h * 0.86);
    c.closePath();
    c.fillStyle = hurt ? '#ffffff' : look.cape;
    c.fill(); outline(2);

    // ---- legs
    c.fillStyle = plate;
    for (const side of [-1, 1]) {
      const off = side * 5;
      c.beginPath();
      this.roundRect(c, off - 4.2, -h * 0.46, 8.4, h * 0.46 + side * stride * 0.5, 3);
      c.fill(); outline(1.6);
      // greave band
      c.fillStyle = trim;
      c.fillRect(off - 4.2, -h * 0.16, 8.4, 2);
      c.fillStyle = plate;
    }

    // ---- torso
    c.beginPath();
    c.moveTo(-10, -h * 0.44);
    c.lineTo(-11.5, -h * 0.9);
    c.lineTo(11.5, -h * 0.9);
    c.lineTo(10, -h * 0.44);
    c.closePath();
    c.fillStyle = plate;
    c.fill(); outline(2);

    // lit edge down the left, shade on the right — cheap volume
    c.save();
    c.globalAlpha = 0.5;
    c.fillStyle = trim;
    c.fillRect(-11, -h * 0.88, 2, h * 0.42);
    c.globalAlpha = 0.28;
    c.fillStyle = '#000';
    c.fillRect(7.5, -h * 0.88, 3.5, h * 0.42);
    c.restore();

    if (!away) {
      // gold filigree on the breastplate
      c.strokeStyle = trim;
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(0, -h * 0.86); c.lineTo(0, -h * 0.52);
      c.moveTo(-5, -h * 0.78); c.lineTo(0, -h * 0.7); c.lineTo(5, -h * 0.78);
      c.stroke();
    }
    // belt
    c.fillStyle = trim;
    c.fillRect(-10, -h * 0.48, 20, 2.6);

    // ---- pauldrons: the tier read
    for (const side of [-1, 1]) {
      const w = look.shoulder;
      c.beginPath();
      c.moveTo(side * 8, -h * 0.92);
      c.quadraticCurveTo(side * (8 + w), -h * 0.94, side * (8 + w * 0.85), -h * 0.66);
      c.lineTo(side * 9, -h * 0.62);
      c.closePath();
      c.fillStyle = plate;
      c.fill(); outline(1.8);
      // spikes break the outline as the tier climbs
      c.fillStyle = trim;
      for (let i = 0; i < look.spikes; i++) {
        const t = (i + 1) / (look.spikes + 1);
        const bx = side * (8 + w * t);
        const by = -h * 0.93 + t * 6;
        c.beginPath();
        c.moveTo(bx, by);
        c.lineTo(bx + side * 3, by - 8 - i);
        c.lineTo(bx + side * 5, by + 1);
        c.closePath();
        c.fill();
      }
    }

    // ---- head and helm
    const hy = -h - 8;
    c.beginPath();
    this.roundRect(c, -8, hy - 8, 16, 17, 5);
    c.fillStyle = plate;
    c.fill(); outline(1.8);
    // crown / crest
    if (look.crest > 0) {
      c.beginPath();
      c.moveTo(-2, hy - 8);
      c.lineTo(0, hy - 8 - look.crest);
      c.lineTo(2, hy - 8);
      c.closePath();
      c.fillStyle = trim;
      c.fill();
    }
    if (!away) {
      // visor slit — the face is a light, not a face
      const glow = hurt ? '#ffffff' : '#8fe4ff';
      c.save();
      c.shadowColor = glow;
      c.shadowBlur = 7;
      c.fillStyle = glow;
      c.fillRect(-5.5 + fx * 1.6, hy - 2.5, 11, 2.6);
      c.restore();
      // brow trim
      c.fillStyle = trim;
      c.fillRect(-8, hy - 5, 16, 1.6);
    } else {
      c.fillStyle = trim;
      c.fillRect(-7, hy - 3, 14, 1.6);
    }

  }

  /** A hooded traveller in a long split coat, a scarf trailing behind. */
  private heroWayfarer(c: CanvasRenderingContext2D, k: HeroCtx) {
    const { h, plate, trim, cape, look, away, fx, stride, drag, t, outline } = k;
    const flutter = Math.sin(t * 9) * 3;
    // scarf tail, behind everything
    const tail = 14 + look.capeLen * 0.6;
    c.beginPath();
    c.moveTo(-3, -h * 0.93);
    c.quadraticCurveTo(-10 + drag * 24, -h * 0.75 + flutter, -8 - fx * 6 + drag * 34, -h * 0.93 + tail);
    c.lineTo(-2 - fx * 6 + drag * 34, -h * 0.93 + tail - 3);
    c.quadraticCurveTo(-3 + drag * 18, -h * 0.72 - flutter, 4, -h * 0.9);
    c.closePath();
    c.fillStyle = cape; c.fill(); outline(1.6);
    // boots
    for (const side of [-1, 1]) {
      c.beginPath();
      this.roundRect(c, side * 4.6 - 3.8, -h * 0.22 + side * stride * 0.4, 7.6, h * 0.22 - side * stride * 0.4, 2.5);
      c.fillStyle = '#231e2c'; c.fill(); outline(1.4);
    }
    // the long coat, split up the front
    c.beginPath();
    c.moveTo(-9, -h * 0.9); c.lineTo(9, -h * 0.9);
    c.lineTo(13 + stride * 0.3, -h * 0.1); c.lineTo(3, -h * 0.15); c.lineTo(0, -h * 0.34);
    c.lineTo(-3, -h * 0.15); c.lineTo(-13 - stride * 0.3, -h * 0.1);
    c.closePath();
    c.fillStyle = plate; c.fill(); outline(2);
    c.save(); c.globalAlpha = 0.3; c.fillStyle = '#000'; c.fillRect(6, -h * 0.88, 4, h * 0.7); c.restore();
    c.strokeStyle = trim; c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(-13 - stride * 0.3, -h * 0.1); c.lineTo(-3, -h * 0.15);
    c.moveTo(13 + stride * 0.3, -h * 0.1); c.lineTo(3, -h * 0.15);
    if (!away) { c.moveTo(0, -h * 0.84); c.lineTo(0, -h * 0.34); }
    c.stroke();
    // belt and buckle
    c.fillStyle = '#2a2230'; c.fillRect(-10, -h * 0.54, 20, 3);
    c.fillStyle = trim; c.fillRect(-2, -h * 0.55, 4, 4);
    // a single pauldron on the sword arm, growing with the armour tier
    const sw = 4 + look.shoulder * 0.5;
    const side = fx >= 0 ? 1 : -1;
    c.beginPath(); c.ellipse(side * 9, -h * 0.86, sw, 4.5, 0, 0, Math.PI * 2);
    c.fillStyle = trim; c.fill(); outline(1.4);
    for (let i = 0; i < look.spikes; i++) {
      c.beginPath(); c.moveTo(side * (7 + i * 3), -h * 0.9); c.lineTo(side * (8 + i * 3), -h * 0.9 - 6); c.lineTo(side * (10 + i * 3), -h * 0.9); c.fillStyle = trim; c.fill();
    }
    // scarf wrap at the neck
    c.beginPath(); this.roundRect(c, -8, -h * 0.97, 16, 6, 3);
    c.fillStyle = cape; c.fill(); outline(1.4);
    // the hood
    const hy = -h - 7;
    c.beginPath();
    c.moveTo(-9, hy + 9);
    c.quadraticCurveTo(-12, hy - 9, 0, hy - 13 - look.crest * 0.4);
    c.quadraticCurveTo(12, hy - 9, 9, hy + 9);
    c.closePath();
    c.fillStyle = plate; c.fill(); outline(1.8);
    c.save(); c.globalAlpha = 0.25; c.fillStyle = '#000'; c.fill(); c.restore();
    if (!away) {
      c.beginPath(); c.ellipse(fx * 1.6, hy + 2, 6, 6.5, 0, 0, Math.PI * 2);
      c.fillStyle = '#07080e'; c.fill();
      c.save(); c.shadowColor = k.hurt ? '#fff' : '#8fe4ff'; c.shadowBlur = 6; c.fillStyle = k.hurt ? '#fff' : '#bff0ff';
      c.fillRect(fx * 2.2 - 3.6, hy + 1, 2.4, 2); c.fillRect(fx * 2.2 + 1.2, hy + 1, 2.4, 2);
      c.restore();
    } else {
      c.strokeStyle = trim; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(0, hy - 11); c.lineTo(0, hy + 8); c.stroke();
    }
  }

  /** A spiky-haired young hero: short jacket, baggy shorts, big shoes. */
  private heroDreamer(c: CanvasRenderingContext2D, k: HeroCtx) {
    const { h, plate, trim, cape, look, away, fx, stride, drag, outline, hurt } = k;
    const skin = hurt ? '#ffffff' : '#f2cfa8';
    const hair = hurt ? '#ffffff' : '#6a3c20';
    // big shoes
    for (const side of [-1, 1]) {
      c.beginPath(); c.ellipse(side * 5.5 + fx * 2, -2.5 + side * stride * 0.2, 7, 3.8, 0, 0, Math.PI * 2);
      c.fillStyle = cape; c.fill(); outline(1.5);
    }
    // legs, then baggy shorts
    c.fillStyle = skin;
    for (const side of [-1, 1]) c.fillRect(side * 5 - 2, -h * 0.26, 4, h * 0.22 + side * stride * 0.3);
    c.beginPath();
    c.moveTo(-9, -h * 0.52); c.lineTo(9, -h * 0.52); c.lineTo(12, -h * 0.24); c.lineTo(1, -h * 0.26); c.lineTo(0, -h * 0.34);
    c.lineTo(-1, -h * 0.26); c.lineTo(-12, -h * 0.24); c.closePath();
    c.fillStyle = '#2b2f48'; c.fill(); outline(1.6);
    // jacket with a hood-collar
    c.beginPath();
    c.moveTo(-9, -h * 0.9); c.lineTo(9, -h * 0.9); c.lineTo(10.5, -h * 0.5); c.lineTo(-10.5, -h * 0.5); c.closePath();
    c.fillStyle = plate; c.fill(); outline(1.8);
    if (!away) {
      c.fillStyle = '#16182a'; c.fillRect(-3.5, -h * 0.88, 7, h * 0.36);
      // a small crown pendant
      c.fillStyle = trim;
      c.beginPath(); c.moveTo(-3, -h * 0.66); c.lineTo(-3, -h * 0.72); c.lineTo(-1.5, -h * 0.69); c.lineTo(0, -h * 0.74);
      c.lineTo(1.5, -h * 0.69); c.lineTo(3, -h * 0.72); c.lineTo(3, -h * 0.66); c.closePath(); c.fill();
    }
    c.strokeStyle = trim; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(-10.5, -h * 0.5); c.lineTo(10.5, -h * 0.5); c.stroke();
    // shoulder plates arrive with better armour
    if (look.shoulder > 12) {
      for (const side of [-1, 1]) { c.beginPath(); c.ellipse(side * 10, -h * 0.86, look.shoulder * 0.35, 4, 0, 0, Math.PI * 2); c.fillStyle = trim; c.fill(); outline(1.2); }
    }
    // collar
    c.beginPath(); this.roundRect(c, -9, -h * 0.98, 18, 6, 3); c.fillStyle = trim; c.fill(); outline(1.2);
    // head
    const hy = -h - 8;
    c.beginPath(); c.arc(0, hy + 2, 9, 0, Math.PI * 2);
    c.fillStyle = skin; c.fill(); outline(1.6);
    if (!away) {
      c.fillStyle = '#1a2a4a';
      c.beginPath(); c.ellipse(fx * 2 - 3.4, hy + 2, 1.7, 2.4, 0, 0, Math.PI * 2); c.ellipse(fx * 2 + 3.4, hy + 2, 1.7, 2.4, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff'; c.fillRect(fx * 2 - 3.8, hy + 0.6, 1, 1); c.fillRect(fx * 2 + 3, hy + 0.6, 1, 1);
    }
    // spiky hair, swept by movement
    const sweep = drag * 6;
    const spikes: [number, number][] = [[-11, hy + 4], [-15 + sweep, hy - 4], [-9, hy - 6], [-10 + sweep, hy - 15], [-3, hy - 9],
      [0 + sweep, hy - 18 - look.crest * 0.3], [3, hy - 9], [9 + sweep, hy - 15], [8, hy - 6], [14 + sweep, hy - 3], [10, hy + 4]];
    c.beginPath();
    c.moveTo(-10, hy + (away ? 8 : 0));
    for (const [x, y] of spikes) c.lineTo(x, y);
    c.lineTo(10, hy + (away ? 8 : 0));
    if (!away) { c.lineTo(6, hy - 3); c.lineTo(2, hy); c.lineTo(-2, hy - 3); c.lineTo(-6, hy); }
    c.closePath();
    c.fillStyle = hair; c.fill(); outline(1.6);
  }

  /** A lighter knight: tabard, long cape, a winged helm. */
  private heroPaladin(c: CanvasRenderingContext2D, k: HeroCtx) {
    const { h, plate, trim, cape, look, away, fx, stride, drag, t, outline, hurt } = k;
    // long cape
    const len = Math.min(look.capeLen + 12, h * 0.95);
    const wave = Math.sin(t * 5) * 2;
    c.beginPath();
    c.moveTo(-10, -h * 0.88);
    c.quadraticCurveTo(-16 + drag * 18, -h * 0.3, -11 + drag * 30 + wave, -h * 0.9 + len);
    c.lineTo(11 + drag * 30 - wave, -h * 0.9 + len);
    c.quadraticCurveTo(16 + drag * 18, -h * 0.3, 10, -h * 0.88);
    c.closePath();
    c.fillStyle = cape; c.fill(); outline(1.8);
    // legs
    for (const side of [-1, 1]) {
      c.beginPath(); this.roundRect(c, side * 4.5 - 3.6, -h * 0.46, 7.2, h * 0.46 + side * stride * 0.5, 2.5);
      c.fillStyle = plate; c.fill(); outline(1.5);
      c.fillStyle = trim; c.beginPath(); c.arc(side * 4.5, -h * 0.24, 2.2, 0, Math.PI * 2); c.fill();
    }
    // slim cuirass
    c.beginPath();
    c.moveTo(-10, -h * 0.9); c.lineTo(10, -h * 0.9); c.lineTo(7, -h * 0.62); c.lineTo(8.5, -h * 0.44); c.lineTo(-8.5, -h * 0.44); c.lineTo(-7, -h * 0.62);
    c.closePath(); c.fillStyle = plate; c.fill(); outline(1.8);
    // tabard with an emblem
    c.beginPath(); c.moveTo(-5, -h * 0.66); c.lineTo(5, -h * 0.66); c.lineTo(5.5, -h * 0.14); c.lineTo(0, -h * 0.08); c.lineTo(-5.5, -h * 0.14); c.closePath();
    c.fillStyle = cape; c.fill(); outline(1.3);
    if (!away) {
      c.strokeStyle = trim; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(0, -h * 0.58); c.lineTo(0, -h * 0.3); c.moveTo(-3, -h * 0.48); c.lineTo(3, -h * 0.48); c.stroke();
    }
    c.fillStyle = trim; c.fillRect(-9, -h * 0.47, 18, 2.4);
    // rounded pauldrons with fins
    for (const side of [-1, 1]) {
      const w = 5 + look.shoulder * 0.45;
      c.beginPath(); c.ellipse(side * 10, -h * 0.84, w, 5.5, side * 0.2, 0, Math.PI * 2);
      c.fillStyle = plate; c.fill(); outline(1.5);
      c.strokeStyle = trim; c.lineWidth = 1.2; c.beginPath(); c.ellipse(side * 10, -h * 0.84, w - 2, 3.5, side * 0.2, Math.PI, Math.PI * 2); c.stroke();
      for (let i = 0; i < Math.min(3, look.spikes); i++) {
        c.fillStyle = trim; c.beginPath();
        c.moveTo(side * (8 + i * 3), -h * 0.9); c.lineTo(side * (10 + i * 3), -h * 0.9 - 5 - i); c.lineTo(side * (11 + i * 3), -h * 0.88); c.fill();
      }
    }
    // helm with wings
    const hy = -h - 8;
    const wing = 7 + look.crest * 0.5;
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(side * 7, hy - 1);
      c.quadraticCurveTo(side * (9 + wing), hy - 4 - wing * 0.4, side * (8 + wing), hy - 10 - wing * 0.6);
      c.quadraticCurveTo(side * (9 + wing * 0.4), hy - 6, side * 7, hy - 5);
      c.closePath(); c.fillStyle = trim; c.fill(); outline(1.2);
    }
    c.beginPath(); c.arc(0, hy + 1, 8.5, 0, Math.PI * 2);
    c.fillStyle = plate; c.fill(); outline(1.8);
    if (!away) {
      const glow = hurt ? '#ffffff' : '#bff0ff';
      c.save(); c.shadowColor = glow; c.shadowBlur = 6; c.fillStyle = glow;
      c.fillRect(-5 + fx * 1.4, hy, 10, 2.2); c.fillRect(-1 + fx * 1.4, hy, 2, 7);
      c.restore();
    }
  }

  /** A wandering swordsman: wide sleeves, flared hakama, a headband that trails. */
  private heroRonin(c: CanvasRenderingContext2D, k: HeroCtx) {
    const { h, plate, trim, cape, look, away, fx, stride, drag, t, outline, hurt } = k;
    const skin = hurt ? '#ffffff' : '#eac4a0';
    const flutter = Math.sin(t * 10) * 2.5;
    // sash tail behind
    c.beginPath();
    c.moveTo(-6, -h * 0.5); c.quadraticCurveTo(-12 + drag * 20, -h * 0.35 + flutter, -14 + drag * 30, -h * 0.1);
    c.lineTo(-10 + drag * 30, -h * 0.1); c.quadraticCurveTo(-8 + drag * 16, -h * 0.3, -2, -h * 0.48); c.closePath();
    c.fillStyle = cape; c.fill(); outline(1.3);
    // hakama
    c.beginPath();
    c.moveTo(-8, -h * 0.5); c.lineTo(8, -h * 0.5); c.lineTo(13 + stride * 0.4, -1); c.lineTo(1, -1); c.lineTo(0, -h * 0.2);
    c.lineTo(-1, -1); c.lineTo(-13 - stride * 0.4, -1); c.closePath();
    c.fillStyle = '#23273a'; c.fill(); outline(1.7);
    c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(-6, -h * 0.45); c.lineTo(-9, -3); c.moveTo(6, -h * 0.45); c.lineTo(9, -3); c.stroke();
    // wide sleeves
    for (const side of [-1, 1]) {
      c.beginPath(); c.moveTo(side * 8, -h * 0.9); c.lineTo(side * (16 + look.shoulder * 0.2), -h * 0.72); c.lineTo(side * (15 + look.shoulder * 0.2), -h * 0.5); c.lineTo(side * 9, -h * 0.56); c.closePath();
      c.fillStyle = plate; c.fill(); outline(1.5);
    }
    // haori body with a crossed collar
    c.beginPath(); c.moveTo(-9, -h * 0.92); c.lineTo(9, -h * 0.92); c.lineTo(9, -h * 0.48); c.lineTo(-9, -h * 0.48); c.closePath();
    c.fillStyle = plate; c.fill(); outline(1.8);
    if (!away) {
      c.strokeStyle = trim; c.lineWidth = 2;
      c.beginPath(); c.moveTo(-6, -h * 0.92); c.lineTo(3, -h * 0.6); c.moveTo(6, -h * 0.92); c.lineTo(-1, -h * 0.72); c.stroke();
    }
    // armour plates on the shoulders at higher tiers
    if (look.spikes > 0) {
      for (const side of [-1, 1]) {
        c.fillStyle = trim; c.fillRect(side > 0 ? 8 : -16, -h * 0.9, 8, 4);
        c.fillStyle = plate; c.fillRect(side > 0 ? 8 : -16, -h * 0.84, 8, 3);
      }
    }
    // obi
    c.fillStyle = cape; c.fillRect(-9.5, -h * 0.54, 19, 5);
    c.fillStyle = trim; c.fillRect(-9.5, -h * 0.53, 19, 1);
    // head: face, hair, topknot, headband with trailing tails
    const hy = -h - 7;
    c.beginPath(); c.arc(0, hy + 2, 7.5, 0, Math.PI * 2);
    c.fillStyle = away ? '#15131c' : skin; c.fill(); outline(1.6);
    c.beginPath(); c.arc(0, hy - 1, 7.8, Math.PI, Math.PI * 2); c.fillStyle = '#15131c'; c.fill();
    c.beginPath(); c.arc(-fx * 2, hy - 10, 3.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = trim; c.fillRect(-fx * 2 - 1.5, hy - 8, 3, 2);
    c.fillStyle = hurt ? '#fff' : cape; c.fillRect(-8, hy - 3, 16, 2.6);
    c.strokeStyle = hurt ? '#fff' : cape; c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-fx * 7, hy - 2); c.quadraticCurveTo(-fx * 13 + drag * 12, hy + flutter, -fx * 18 + drag * 22, hy + 4 + flutter);
    c.moveTo(-fx * 7, hy - 1); c.quadraticCurveTo(-fx * 12 + drag * 12, hy + 4 - flutter, -fx * 15 + drag * 20, hy + 9 - flutter);
    c.stroke();
    if (!away) {
      c.strokeStyle = '#15131c'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(fx * 2 - 4.5, hy + 2); c.lineTo(fx * 2 - 1.5, hy + 2.6); c.moveTo(fx * 2 + 1.5, hy + 2.6); c.lineTo(fx * 2 + 4.5, hy + 2); c.stroke();
    }
    void look.crest;
  }

  /** The sword, laid along +x from the hilt; the shape comes from the chosen blade style. */
  private bladeGeom(c: CanvasRenderingContext2D, p: Player, len: number) {
    switch (this.bladeStyle) {
      case 'longsword': return this.bladeLongsword(c, p, len);
      case 'katana': return this.bladeKatana(c, p, len);
      case 'crystal': return this.bladeCrystal(c, p, len);
      case 'greatblade': return this.bladeGreat(c, p, len);
      case 'starlight': return this.bladeStarlight(c, p, len);
      default: return this.bladeKey(c, p, len);
    }
  }

  private bladeGlow(c: CanvasRenderingContext2D, p: Player, extra = 0) {
    const b = p.weapon.blade;
    if (b.glow + extra > 0) { c.shadowColor = b.edge; c.shadowBlur = 10 * (b.glow + extra); }
  }

  private grip(c: CanvasRenderingContext2D, from: number, to: number, w: number, wrap: string, pommel: string) {
    c.fillStyle = '#2a2230';
    c.fillRect(from, -w / 2, to - from, w);
    c.fillStyle = wrap;
    for (let x = from + 1.5; x < to - 1; x += 3.5) c.fillRect(x, -w / 2, 1.5, w);
    c.fillStyle = pommel;
    c.beginPath(); c.arc(from - 2, 0, w * 0.6, 0, Math.PI * 2); c.fill();
  }

  private bladeLongsword(c: CanvasRenderingContext2D, p: Player, len: number) {
    const b = p.weapon.blade;
    const w = b.width + 1;
    const trim = p.armor.look.trim;
    this.grip(c, -8, 8, 4.5, '#5a4232', trim);
    // crossguard with flared tips
    c.fillStyle = trim;
    c.beginPath();
    c.moveTo(8, -w - 4); c.lineTo(11.5, -w - 2); c.lineTo(11.5, w + 2); c.lineTo(8, w + 4); c.lineTo(9.5, 0); c.closePath();
    c.fill();
    c.strokeStyle = '#080a11'; c.lineWidth = 1; c.stroke();
    // blade
    c.save();
    this.bladeGlow(c, p);
    c.beginPath();
    c.moveTo(11.5, -w / 2); c.lineTo(len - w * 1.6, -w * 0.42); c.lineTo(len, 0); c.lineTo(len - w * 1.6, w * 0.42); c.lineTo(11.5, w / 2); c.closePath();
    c.fillStyle = b.color; c.fill();
    c.restore();
    c.beginPath();
    c.moveTo(11.5, -w / 2); c.lineTo(len - w * 1.6, -w * 0.42); c.lineTo(len, 0); c.lineTo(11.5, 0); c.closePath();
    c.fillStyle = this.alpha(b.edge, 0.55); c.fill();
    c.strokeStyle = this.mix(b.color, '#000000', 0.45); c.lineWidth = Math.max(1, w * 0.18);
    c.beginPath(); c.moveTo(14, 0); c.lineTo(len * 0.62, 0); c.stroke();
    c.strokeStyle = '#080a11'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(11.5, -w / 2); c.lineTo(len - w * 1.6, -w * 0.42); c.lineTo(len, 0); c.lineTo(len - w * 1.6, w * 0.42); c.lineTo(11.5, w / 2); c.stroke();
  }

  private bladeKatana(c: CanvasRenderingContext2D, p: Player, len: number) {
    const b = p.weapon.blade;
    const w = Math.max(4, b.width * 0.75);
    const bend = len * 0.07;
    this.grip(c, -14, 8, 4.2, p.armor.look.trim, '#2a2230');
    // tsuba and collar
    c.fillStyle = '#2a2a34';
    c.beginPath(); c.ellipse(10, 0, 2.6, w + 3, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = p.armor.look.trim; c.lineWidth = 1; c.stroke();
    c.fillStyle = p.armor.look.trim; c.fillRect(12, -w / 2, 3, w);
    // curved blade: spine on top, edge below, rising to the tip
    c.save();
    this.bladeGlow(c, p);
    c.beginPath();
    c.moveTo(15, -w / 2);
    c.quadraticCurveTo(len * 0.6, -w / 2 - bend * 0.4, len, -bend * 1.5);
    c.quadraticCurveTo(len * 0.62, w / 2 - bend * 0.7, 15, w / 2);
    c.closePath();
    c.fillStyle = b.color; c.fill();
    c.restore();
    // the hamon: a bright line near the edge
    c.strokeStyle = b.edge; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(16, w / 2 - 1.4); c.quadraticCurveTo(len * 0.62, w / 2 - bend * 0.7 - 1.4, len - 2, -bend * 1.5); c.stroke();
    c.strokeStyle = '#080a11'; c.lineWidth = 1;
    c.beginPath();
    c.moveTo(15, -w / 2); c.quadraticCurveTo(len * 0.6, -w / 2 - bend * 0.4, len, -bend * 1.5);
    c.quadraticCurveTo(len * 0.62, w / 2 - bend * 0.7, 15, w / 2); c.stroke();
  }

  private bladeCrystal(c: CanvasRenderingContext2D, p: Player, len: number) {
    const b = p.weapon.blade;
    const w = b.width + 2;
    const trim = p.armor.look.trim;
    this.grip(c, -7, 7, 4, trim, trim);
    // winged guard
    c.fillStyle = trim;
    c.beginPath(); c.moveTo(6, -w - 5); c.lineTo(12, -2.5); c.lineTo(12, 2.5); c.lineTo(6, w + 5); c.lineTo(9, 0); c.closePath(); c.fill();
    // faceted blade: a lit upper face and a darker lower face around a ridge
    c.save();
    this.bladeGlow(c, p, 0.5);
    c.beginPath(); c.moveTo(12, -w * 0.5); c.lineTo(len * 0.58, -w * 0.72); c.lineTo(len, 0); c.lineTo(12, 0); c.closePath();
    c.fillStyle = this.alpha(b.edge, 0.85); c.fill();
    c.restore();
    c.beginPath(); c.moveTo(12, w * 0.5); c.lineTo(len * 0.58, w * 0.72); c.lineTo(len, 0); c.lineTo(12, 0); c.closePath();
    c.fillStyle = this.alpha(b.color, 0.9); c.fill();
    c.strokeStyle = this.alpha(b.edge, 0.9); c.lineWidth = 1;
    c.beginPath(); c.moveTo(12, -w * 0.5); c.lineTo(len * 0.58, -w * 0.72); c.lineTo(len, 0); c.lineTo(len * 0.58, w * 0.72); c.lineTo(12, w * 0.5); c.closePath(); c.stroke();
    c.beginPath(); c.moveTo(12, 0); c.lineTo(len, 0); c.stroke();
    // a glint that runs along the blade
    const glint = ((performance.now() / 900) % 1) * (len - 16) + 14;
    c.fillStyle = '#ffffff';
    c.beginPath(); c.moveTo(glint, -3); c.lineTo(glint + 1, 0); c.lineTo(glint, 3); c.lineTo(glint - 1, 0); c.closePath(); c.fill();
  }

  private bladeGreat(c: CanvasRenderingContext2D, p: Player, len: number) {
    const b = p.weapon.blade;
    const W = b.width * 1.9 + 3;
    this.grip(c, -14, 7, 5, '#5a4232', '#4a5068');
    // heavy guard
    c.fillStyle = '#3a3e52'; c.fillRect(7, -W / 2 - 3, 6, W + 6);
    c.fillStyle = p.armor.look.trim; c.fillRect(7, -W / 2 - 3, 6, 2); c.fillRect(7, W / 2 + 1, 6, 2);
    // broad blade with a chisel tip
    c.save();
    this.bladeGlow(c, p);
    c.beginPath(); c.moveTo(13, -W / 2); c.lineTo(len - W * 0.55, -W / 2); c.lineTo(len, -W * 0.12); c.lineTo(len - W * 0.3, W / 2); c.lineTo(13, W / 2); c.closePath();
    c.fillStyle = b.color; c.fill();
    c.restore();
    c.strokeStyle = b.edge; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(15, W / 2 - 1); c.lineTo(len - W * 0.3, W / 2 - 1); c.lineTo(len - 1, -W * 0.12); c.stroke();
    c.fillStyle = this.mix(b.color, '#000000', 0.4);
    c.fillRect(17, -W / 2 + 2.5, len * 0.45, 2);
    c.fillStyle = p.armor.look.trim;
    c.beginPath(); c.arc(19, -W * 0.18, 1.6, 0, Math.PI * 2); c.arc(19, W * 0.18, 1.6, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#080a11'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(13, -W / 2); c.lineTo(len - W * 0.55, -W / 2); c.lineTo(len, -W * 0.12); c.lineTo(len - W * 0.3, W / 2); c.lineTo(13, W / 2); c.closePath(); c.stroke();
  }

  private bladeStarlight(c: CanvasRenderingContext2D, p: Player, len: number) {
    const b = p.weapon.blade;
    const trim = p.armor.look.trim;
    this.grip(c, -8, 7, 3.6, trim, trim);
    // crescent guard
    c.strokeStyle = trim; c.lineWidth = 2.6;
    c.beginPath(); c.arc(8, 0, b.width * 0.9 + 3, -Math.PI / 2, Math.PI / 2); c.stroke();
    // a slim, softly curved blade of light
    const bend = len * 0.08;
    c.save();
    c.shadowColor = b.edge; c.shadowBlur = 12 + b.glow * 8;
    c.strokeStyle = b.edge; c.lineWidth = Math.max(2.5, b.width * 0.5); c.lineCap = 'round';
    c.beginPath(); c.moveTo(10, 0); c.quadraticCurveTo(len * 0.6, -bend * 0.2, len, -bend); c.stroke();
    c.strokeStyle = '#ffffff'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(12, 0); c.quadraticCurveTo(len * 0.6, -bend * 0.2, len - 2, -bend); c.stroke();
    c.restore();
    // a star at the tip
    const tx = len, ty = -bend;
    c.fillStyle = '#ffffff';
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, r = i % 2 ? 1.6 : 5;
      c.lineTo(tx + Math.cos(a) * r, ty + Math.sin(a) * r);
    }
    c.closePath(); c.fill();
  }

  /** The original key-toothed blade. */
  private bladeKey(c: CanvasRenderingContext2D, p: Player, len: number) {
    const b = p.weapon.blade;
    // grip
    c.strokeStyle = '#4a5470';
    c.lineWidth = 5;
    c.lineCap = 'butt';
    c.beginPath(); c.moveTo(-6, 0); c.lineTo(10, 0); c.stroke();
    // guard
    c.strokeStyle = p.armor.look.trim;
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(10, -6); c.lineTo(10, 6); c.stroke();
    // blade
    if (b.glow > 0) { c.shadowColor = b.edge; c.shadowBlur = 10 * b.glow; }
    c.strokeStyle = b.color;
    c.lineWidth = b.width;
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(10, 0); c.lineTo(len, 0); c.stroke();
    // bright edge
    c.strokeStyle = b.edge;
    c.lineWidth = Math.max(1.5, b.width * 0.35);
    c.beginPath(); c.moveTo(12, -b.width * 0.22); c.lineTo(len - 2, -b.width * 0.22); c.stroke();
    c.shadowBlur = 0;
    // key tooth
    if (b.teeth) {
      c.strokeStyle = b.color;
      c.lineWidth = Math.max(3, b.width * 0.55);
      c.beginPath();
      c.moveTo(len - 14, 0); c.lineTo(len - 14, -12); c.lineTo(len - 2, -12);
      c.stroke();
    }
  }

  private drawIdleBlade(c: CanvasRenderingContext2D, p: Player, h: number, fx: number) {
    const len = 40 * p.weapon.blade.length;
    c.save();
    c.translate(fx >= 0 ? 11 : -11, -h * 0.62);
    c.rotate(fx >= 0 ? -1.15 : Math.PI + 1.15);
    c.scale(0.9, 0.9);
    this.bladeGeom(c, p, len);
    c.restore();
  }

  /** Swing position comes straight out of the live frame data. */
  private drawBlade(c: CanvasRenderingContext2D, p: Player, h: number) {
    const def = p.attackDef!;
    const total = def.startup + def.active;
    const t = clamp(p.attackFrame / total, 0, 1);
    // Reach can exceed what looks sane on a 40px figure — especially the
    // Whirl's 120px ring — so the drawn blade is capped independently.
    const reach = def.range + p.weapon.rangeBonus;
    const len = Math.min(reach * (def.radial ? 0.62 : 0.9), 84 * p.weapon.blade.length);

    let ang: number;
    if (def.radial) {
      ang = p.facing; // facing is already spinning, so the blade sweeps the ring
    } else {
      const arc = Math.min(def.arc, 1.5);
      const swing = t < def.startup / total
        ? -arc * (1 - (t / (def.startup / total)) * 0.25)
        : -arc + 2 * arc * ((t - def.startup / total) / (def.active / total || 1));
      ang = p.facing + clamp(swing, -arc * 1.1, arc * 1.1);
    }

    c.save();
    c.translate(0, -h * 0.6 + (def.air ? -6 : 0));
    c.rotate(ang);
    this.bladeGeom(c, p, len);
    c.restore();
  }

  /* ------------------------------------------------------------ enemies */

  private drawEnemy(c: CanvasRenderingContext2D, e: Enemy, g: Game) {
    const ex = sx(e.x), ey = sy(e.y, e.z);
    const d = e.def;
    const dying = e.state === 'dead';
    const fade = dying ? clamp(1 - e.deathT / 0.45, 0, 1) : 1;
    if (fade <= 0) return;

    c.save();
    c.globalAlpha = fade;
    c.translate(ex, ey);
    if (dying) c.scale(1 + (1 - fade) * 0.5, 1 - (1 - fade) * 0.6);
    if (e.state === 'stagger') c.rotate(Math.sin(g.time * 40) * 0.09);

    const flash = e.flash > 0;
    const telegraphing = e.state === 'telegraph';
    // allies wear the team colour: a blue-washed body and blue eyes/trim
    const ally = e.team === 'player';
    const baseCol = ally ? this.mix(d.color, PAL.ally, 0.5) : d.color;
    const accent = ally ? PAL.ally : d.accent;
    const body = flash ? '#ffffff' : (telegraphing ? this.mix(baseCol, accent, 0.45 + Math.sin(g.time * 26) * 0.25) : baseCol);

    if (ally && !dying) {
      c.strokeStyle = this.alpha(PAL.ally, 0.75);
      c.lineWidth = 2;
      c.beginPath(); c.ellipse(0, e.z * Z_SCALE, d.radius * 1.35, d.radius * 0.55, 0, 0, Math.PI * 2); c.stroke();
    }

    if (e.elite && !dying) {
      c.fillStyle = 'rgba(255,213,74,0.22)';
      c.globalAlpha = fade * (0.6 + Math.sin(g.time * 5) * 0.3);
      c.beginPath(); c.ellipse(0, -2, d.radius * 1.9, d.radius * 0.9, 0, 0, Math.PI * 2); c.fill();
      c.globalAlpha = fade;
    }
    if (e.boss && !dying) {
      // a slow-pulsing aura so a boss reads at a glance in a crowd
      const ag = c.createRadialGradient(0, -d.height * 0.5, 4, 0, -d.height * 0.5, d.radius * 2.2);
      ag.addColorStop(0, this.alpha(d.accent, 0.35));
      ag.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = ag;
      c.globalAlpha = fade * (0.7 + Math.sin(g.time * 3) * 0.2);
      c.beginPath(); c.arc(0, -d.height * 0.5, d.radius * 2.2, 0, Math.PI * 2); c.fill();
      c.globalAlpha = fade;
    }

    switch (d.ai) {
      case 'grunt': this.drawGrunt(c, e, body, flash ? '#fff' : accent, g); break;
      case 'bruiser': this.drawBruiser(c, e, body, flash ? '#fff' : accent); break;
      case 'caster': this.drawCaster(c, e, body, flash ? '#fff' : accent, g); break;
      case 'flyer': this.drawFlyer(c, e, body, flash ? '#fff' : accent, g); break;
    }

    if (e.boss && !dying) {
      // the crown: three points
      const h = d.height + (d.ai === 'grunt' ? 20 : 8);
      c.fillStyle = d.accent;
      c.beginPath();
      c.moveTo(-12, -h); c.lineTo(-12, -h - 10); c.lineTo(-6, -h - 5); c.lineTo(0, -h - 14);
      c.lineTo(6, -h - 5); c.lineTo(12, -h - 10); c.lineTo(12, -h);
      c.closePath(); c.fill();
      if (e.enraged) {
        c.strokeStyle = '#ff5f56'; c.lineWidth = 2;
        c.globalAlpha = fade * (0.5 + Math.sin(g.time * 12) * 0.3);
        c.beginPath(); c.arc(0, -d.height * 0.5, d.radius + 10, 0, Math.PI * 2); c.stroke();
        c.globalAlpha = fade;
      }
    }

    if (e.guardFlash > 0) {
      c.save();
      c.globalAlpha = e.guardFlash / 12;
      c.strokeStyle = '#9fd8ff';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, -d.height * 0.5, d.radius + 12, e.facing - 1.1, e.facing + 1.1);
      c.stroke();
      c.restore();
    }
    c.restore();

    if (!dying && !e.boss) this.drawEnemyBar(c, e, ex, ey);
    if (e.elite && !dying) {
      c.save();
      c.font = '800 9px ui-monospace, Menlo, Consolas, monospace';
      c.textAlign = 'center';
      c.fillStyle = PAL.mpCharge;
      c.fillText('ELITE', ex, ey - d.height - 26);
      c.restore();
    }
  }

  private drawGrunt(c: CanvasRenderingContext2D, e: Enemy, body: string, accent: string, g: Game) {
    const r = e.radius, h = e.def.height;
    c.fillStyle = body;
    c.beginPath();
    c.moveTo(-r, 0);
    c.quadraticCurveTo(-r * 1.1, -h, 0, -h);
    c.quadraticCurveTo(r * 1.1, -h, r, 0);
    c.closePath();
    c.fill();
    // antennae
    c.strokeStyle = body;
    c.lineWidth = 3;
    const wob = Math.sin(g.time * 6 + e.wobble) * 4;
    c.beginPath();
    c.moveTo(-5, -h + 3); c.quadraticCurveTo(-9, -h - 12, -3 + wob, -h - 18);
    c.moveTo(5, -h + 3); c.quadraticCurveTo(9, -h - 12, 3 + wob, -h - 18);
    c.stroke();
    // eyes
    c.fillStyle = accent;
    c.beginPath();
    c.arc(-4.5 + Math.cos(e.facing) * 3, -h * 0.62, 2.8, 0, Math.PI * 2);
    c.arc(4.5 + Math.cos(e.facing) * 3, -h * 0.62, 2.8, 0, Math.PI * 2);
    c.fill();
  }

  private drawBruiser(c: CanvasRenderingContext2D, e: Enemy, body: string, accent: string) {
    const r = e.radius, h = e.def.height;
    c.fillStyle = body;
    this.roundRect(c, -r, -h, r * 2, h, 12);
    c.fill();
    // belly plate
    c.fillStyle = accent;
    c.globalAlpha *= 0.35;
    this.roundRect(c, -r * 0.6, -h * 0.62, r * 1.2, h * 0.5, 8);
    c.fill();
    c.globalAlpha /= 0.35;
    // eyes
    c.fillStyle = accent;
    const ox = Math.cos(e.facing) * 4;
    c.fillRect(-9 + ox, -h * 0.86, 6, 3.5);
    c.fillRect(3 + ox, -h * 0.86, 6, 3.5);
    // guard arms
    c.strokeStyle = body;
    c.lineWidth = 8;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-r, -h * 0.55); c.lineTo(-r - 10, -h * 0.28);
    c.moveTo(r, -h * 0.55); c.lineTo(r + 10, -h * 0.28);
    c.stroke();
  }

  private drawCaster(c: CanvasRenderingContext2D, e: Enemy, body: string, accent: string, g: Game) {
    const r = e.radius, h = e.def.height;
    c.fillStyle = body;
    c.beginPath();
    c.moveTo(-r, 0);
    c.lineTo(-r * 0.55, -h * 0.85);
    c.quadraticCurveTo(0, -h - 6, r * 0.55, -h * 0.85);
    c.lineTo(r, 0);
    c.closePath();
    c.fill();
    c.fillStyle = accent;
    c.beginPath();
    c.arc(Math.cos(e.facing) * 3, -h * 0.72, 3.4, 0, Math.PI * 2);
    c.fill();
    // staff orb
    const charge = e.state === 'telegraph' ? clamp(e.stateFrame / e.def.telegraph, 0, 1) : 0;
    c.strokeStyle = '#8b7a5e';
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(r * 0.8, -2); c.lineTo(r * 0.9, -h * 0.95); c.stroke();
    if (charge > 0) {
      c.fillStyle = accent;
      c.globalAlpha *= 0.5 + charge * 0.5;
      c.beginPath();
      c.arc(r * 0.9, -h * 0.98, 3 + charge * 7 + Math.sin(g.time * 20) * 1.2, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha /= 0.5 + charge * 0.5;
    }
  }

  private drawFlyer(c: CanvasRenderingContext2D, e: Enemy, body: string, accent: string, g: Game) {
    const r = e.radius, h = e.def.height;
    const flap = Math.sin(g.time * 16 + e.wobble) * 6;
    c.fillStyle = body;
    c.beginPath();
    c.moveTo(0, -h - 4); c.lineTo(r, -h * 0.5); c.lineTo(0, 0); c.lineTo(-r, -h * 0.5);
    c.closePath();
    c.fill();
    c.strokeStyle = accent;
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(-r * 0.6, -h * 0.6); c.quadraticCurveTo(-r * 2, -h * 0.7 - flap, -r * 2.2, -h * 0.2);
    c.moveTo(r * 0.6, -h * 0.6); c.quadraticCurveTo(r * 2, -h * 0.7 - flap, r * 2.2, -h * 0.2);
    c.stroke();
    c.fillStyle = accent;
    c.beginPath();
    c.arc(Math.cos(e.facing) * 3, -h * 0.55, 3, 0, Math.PI * 2);
    c.fill();
  }

  private drawEnemyBar(c: CanvasRenderingContext2D, e: Enemy, ex: number, ey: number) {
    if (e.hp >= e.maxHp && e.state !== 'stagger' && !e.elite) return;
    const w = Math.max(26, e.radius * 2.4);
    const top = ey - e.def.height - 20;
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(ex - w / 2 - 1, top - 1, w + 2, 5);
    c.fillStyle = e.state === 'stagger' ? '#ffd54a' : e.team === 'player' ? PAL.ally : '#ff6b6b';
    c.fillRect(ex - w / 2, top, w * clamp(e.hp / e.maxHp, 0, 1), 3);
    // poise pips
    if (e.poise < e.maxPoise) {
      c.fillStyle = '#9fd8ff';
      c.fillRect(ex - w / 2, top + 4.5, w * clamp(e.poise / e.maxPoise, 0, 1), 1.5);
    }
  }

  /** Ground arc showing exactly where an incoming attack will land. */
  private drawTelegraph(c: CanvasRenderingContext2D, e: Enemy) {
    if (e.state === 'special') { this.drawBossTell(c, e); return; }
    if (e.state !== 'telegraph') return;
    const t = clamp(e.stateFrame / e.def.telegraph, 0, 1);
    const reach = e.def.ai === 'caster' ? 0 : e.def.reach + e.radius;
    if (reach <= 0) return;
    c.save();
    c.translate(e.x, e.y);
    c.rotate(e.facing);
    c.globalAlpha = 0.16 + t * 0.4;
    c.fillStyle = e.def.accent;
    c.beginPath();
    c.moveTo(0, 0);
    c.ellipse(0, 0, reach * t, reach * 0.45 * t, 0, -0.95, 0.95);
    c.closePath();
    c.fill();
    c.restore();
  }

  /** Ground markings for a boss's signature move: where it will land, and when. */
  private drawBossTell(c: CanvasRenderingContext2D, e: Enemy) {
    const f = e.moveFrame;
    const accent = e.def.accent;
    c.save();
    if (e.move === 'slam') {
      const t = clamp(f / e.tell(52), 0, 1);
      if (t < 1) {
        c.globalAlpha = 0.12 + t * 0.25;
        c.fillStyle = accent;
        c.beginPath(); c.ellipse(e.moveX, e.moveY, SLAM_RADIUS * t, SLAM_RADIUS * 0.55 * t, 0, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 0.7;
        c.strokeStyle = accent; c.lineWidth = 2;
        c.beginPath(); c.ellipse(e.moveX, e.moveY, SLAM_RADIUS, SLAM_RADIUS * 0.55, 0, 0, Math.PI * 2); c.stroke();
      }
    } else if (e.move === 'dive') {
      const track = e.tell(46);
      if (f > 30 && f <= 30 + track + 12) {
        const t = clamp((f - 30) / track, 0, 1);
        c.globalAlpha = 0.25 + t * 0.4;
        c.strokeStyle = accent; c.lineWidth = 2.5;
        c.beginPath(); c.ellipse(e.moveX, e.moveY, DIVE_RADIUS, DIVE_RADIUS * 0.55, 0, 0, Math.PI * 2); c.stroke();
        c.beginPath();
        c.moveTo(e.moveX - 10, e.moveY); c.lineTo(e.moveX + 10, e.moveY);
        c.moveTo(e.moveX, e.moveY - 6); c.lineTo(e.moveX, e.moveY + 6);
        c.stroke();
      }
    } else if (e.move === 'rush') {
      c.globalAlpha = 0.35;
      c.strokeStyle = accent; c.lineWidth = 3;
      c.setLineDash([8, 8]);
      c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(e.x + Math.cos(e.facing) * 170, e.y + Math.sin(e.facing) * 170); c.stroke();
    } else if (e.move === 'fan') {
      const t = clamp(f / e.tell(34), 0, 1);
      if (t < 1) {
        c.globalAlpha = 0.18 + t * 0.3;
        c.fillStyle = accent;
        c.beginPath(); c.moveTo(e.x, e.y);
        c.arc(e.x, e.y, 200 * t, e.facing - 0.7, e.facing + 0.7);
        c.closePath(); c.fill();
      }
    }
    c.restore();
  }

  /** The big bar along the bottom while a boss is up. */
  private drawBossBar(c: CanvasRenderingContext2D, g: Game) {
    const e = g.enemies.find((x) => x.alive && x.boss && x.aggro && !x.fleeing);
    if (!e) return;
    const b = e.boss!;
    const w = 460, x = (VIEW_W - w) / 2, y = VIEW_H - 40;
    c.save();
    c.textAlign = 'center';
    c.font = '800 14px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = b.accent;
    c.fillText(b.name.toUpperCase() + (e.enraged ? '  —  ENRAGED' : ''), VIEW_W / 2, y - 8);
    this.bar(c, x, y, w, 12, e.hp / e.maxHp, e.enraged ? '#ff5f56' : b.accent, 'rgba(0,0,0,0.6)');
    c.font = '600 10px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.dim;
    c.fillText(`Lv ${e.level}  ·  ${Math.ceil(e.hp)} / ${e.maxHp}`, VIEW_W / 2, y + 26);
    c.restore();
  }

  /** '#rrggbb' at an alpha. */
  private alpha(hex: string, a: number): string {
    const [r, gg, bb] = this.hex(hex);
    return `rgba(${r},${gg},${bb},${a})`;
  }

  private drawLockRing(c: CanvasRenderingContext2D, g: Game) {
    const t = g.player.lock;
    if (!t || !t.alive) return;
    c.save();
    c.translate(t.x, t.y);
    c.globalAlpha = 0.85;
    c.strokeStyle = '#ffd54a';
    c.lineWidth = 2;
    const r = t.radius + 12;
    for (let i = 0; i < 4; i++) {
      const a0 = g.time * 1.6 + (i * Math.PI) / 2;
      c.beginPath();
      c.ellipse(0, 0, r, r * 0.45, 0, a0, a0 + 0.5);
      c.stroke();
    }
    c.restore();
    // floating reticle above the head
    const ty = sy(t.y, t.z) - t.def.height - 30;
    c.save();
    c.strokeStyle = '#ffd54a';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(t.x - 7, ty - 6); c.lineTo(t.x, ty); c.lineTo(t.x + 7, ty - 6);
    c.stroke();
    c.restore();
  }

  private drawProjectile(c: CanvasRenderingContext2D, p: Projectile) {
    const x = sx(p.x), y = sy(p.y, p.z);
    c.save();
    const grd = c.createRadialGradient(x, y, 1, x, y, p.radius * 2.4);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.35, p.color);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = grd;
    c.beginPath();
    c.arc(x, y, p.radius * 2.4, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  /* ---------------------------------------------------------------- vfx */

  private drawSlashes(c: CanvasRenderingContext2D, g: Game) {
    for (const s of g.slashes) {
      const t = 1 - s.life / s.maxLife;
      c.save();
      c.globalAlpha = (1 - t) * 0.85;
      c.translate(sx(s.x), sy(s.y, s.z));
      c.rotate(s.angle);
      c.strokeStyle = s.color;
      c.lineWidth = s.width * (1 - t * 0.6);
      c.lineCap = 'round';
      c.beginPath();
      c.ellipse(0, 0, s.range * (0.75 + t * 0.35), s.range * 0.5 * (0.75 + t * 0.35), 0, -s.arc, s.arc);
      c.stroke();
      c.restore();
    }
  }

  private drawParticles(c: CanvasRenderingContext2D, g: Game) {
    for (const p of g.particles) {
      const t = p.life / p.maxLife;
      c.save();
      c.globalAlpha = clamp(t, 0, 1);
      c.fillStyle = p.color;
      const s = p.size * (0.4 + t * 0.6);
      c.fillRect(sx(p.x) - s / 2, sy(p.y, p.z) - s / 2, s, s);
      c.restore();
    }
  }

  private drawRings(c: CanvasRenderingContext2D, g: Game) {
    for (const r of g.rings) {
      const t = 1 - r.life / r.maxLife;
      c.save();
      c.globalAlpha = (1 - t) * 0.7;
      c.strokeStyle = r.color;
      c.lineWidth = 3 * (1 - t) + 1;
      c.beginPath();
      c.ellipse(sx(r.x), sy(r.y, r.z), r.r + (r.maxR - r.r) * t, (r.r + (r.maxR - r.r) * t) * 0.45, 0, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }
  }

  private drawFloatText(c: CanvasRenderingContext2D, g: Game) {
    for (const f of g.floats) {
      const t = f.life / f.maxLife;
      c.save();
      c.globalAlpha = clamp(t * 1.6, 0, 1);
      c.font = `900 ${f.size}px ui-monospace, Menlo, Consolas, monospace`;
      c.textAlign = 'center';
      c.lineWidth = 4;
      c.strokeStyle = 'rgba(0,0,0,0.8)';
      c.strokeText(f.text, sx(f.x), sy(f.y, f.z));
      c.fillStyle = f.color;
      c.fillText(f.text, sx(f.x), sy(f.y, f.z));
      c.restore();
    }
  }

  /* ---------------------------------------------------------------- HUD */

  private drawHud(c: CanvasRenderingContext2D, g: Game) {
    if (g.screen === 'title') { this.drawTitle(c, g); return; }
    if (g.screen === 'sandbox') { this.drawSandbox(c, g); return; }
    // full-screen results: nothing of the HUD underneath (PLAN 16: early-return under overlays)
    if (g.battle.result) { this.drawResults(c, g); return; }
    const p = g.player;

    // ---- top-left: HP, MP
    const x = 18, y = 18;
    c.save();
    c.font = '700 13px ui-monospace, Menlo, Consolas, monospace';
    c.textAlign = 'left';

    c.fillStyle = PAL.text;
    c.fillText('HP', x, y + 10);
    c.fillText('MP', x, y + 25);

    // HP
    const barW = 210;
    this.bar(c, x + 52, y, barW, 12, p.hp / p.stats.maxHp,
      p.hp / p.stats.maxHp < 0.3 ? PAL.hpLow : PAL.hp, 'rgba(0,0,0,0.55)');
    c.fillStyle = PAL.text;
    c.font = '700 11px ui-monospace, Menlo, Consolas, monospace';
    c.fillText(`${Math.ceil(p.hp)} / ${p.stats.maxHp}`, x + 58, y + 9.5);

    // MP
    const mpRatio = p.mp / p.stats.maxMp;
    this.bar(c, x + 52, y + 17, barW * 0.8, 9, mpRatio, p.charging ? PAL.mpCharge : PAL.mp, 'rgba(0,0,0,0.55)');
    c.fillStyle = p.charging ? PAL.mpCharge : PAL.text;
    c.fillText(p.charging ? 'MP CHARGE!' : `MP ${Math.floor(p.mp)}`, x + 58, y + 24.5);
    c.restore();

    // ---- top-right: where you are and what is happening
    c.save();
    c.textAlign = 'right';
    const b = g.battle, test = b.spec.kind === 'test';
    c.font = '800 18px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = test ? '#8fb4ff' : '#ffd54a';
    c.fillText(test ? 'TEST FIELD' : b.spec.name.toUpperCase(), VIEW_W - 18, 30);
    c.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.dim;
    const allies = g.alliesAlive();
    const resE = g.army.reserveCount('enemy'), resP = g.army.reserveCount('player');
    const counts = `foes ${g.foesAlive() - resE}${resE ? ` +${resE} reserve` : ''}  ·  allies ${allies}${resP ? ` +${resP}` : ''}`;
    c.fillText(test ? `groups cleared ${g.groupsCleared}  ·  ${counts}` : `${fmtTime(b.time)}  ·  ${counts}`, VIEW_W - 18, 48);
    c.restore();
    if (!test) this.drawObjective(c, g);

    // equipped gear, small, under the bars
    c.save();
    c.font = '600 10px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.dim;
    c.fillText(`${p.weapon.name}  ·  ${p.armor.name}`, 18, 62);
    if (g.apFree() > 0) {
      c.fillStyle = PAL.mpCharge;
      c.font = '700 11px ui-monospace, Menlo, Consolas, monospace';
      c.fillText(`${g.apFree()} SP unspent — ${IS_TOUCH ? 'MENU' : 'TAB'}`, 18, 78);
    }
    // the standing order
    c.font = '800 12px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = ORDER_COLOR[g.order];
    c.fillText(`ORDERS: ${g.order.toUpperCase()}`, 18, 96);
    c.font = '600 10px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.dim;
    c.fillText(IS_TOUCH ? 'CMD: drag to a slice · tap to cycle' : 'hold Q + direction · tap Q to cycle', 18, 110);
    c.restore();

    if (!IS_TOUCH && g.inCombat()) this.drawCommandMenu(c, g);
    this.drawBossBar(c, g);

    // ---- combo counter
    if (g.comboCount > 1 && g.comboDisplay > 0) {
      c.save();
      c.globalAlpha = clamp(g.comboDisplay / 40, 0, 1);
      c.textAlign = 'center';
      c.font = '900 34px ui-monospace, Menlo, Consolas, monospace';
      c.fillStyle = '#ffd54a';
      c.strokeStyle = 'rgba(0,0,0,0.75)';
      c.lineWidth = 5;
      const s = `${g.comboCount} HIT`;
      c.strokeText(s, VIEW_W / 2, 92);
      c.fillText(s, VIEW_W / 2, 92);
      c.restore();
    }

    this.drawNotices(c, g);

    if (g.orderT > 0 && p.alive) {
      c.save();
      c.globalAlpha = clamp(g.orderT / 0.3, 0, 1);
      c.textAlign = 'center';
      c.font = '900 22px ui-monospace, Menlo, Consolas, monospace';
      c.strokeStyle = 'rgba(0,0,0,0.75)'; c.lineWidth = 5;
      const s = `ORDER: ${g.order.toUpperCase()}`;
      c.strokeText(s, VIEW_W / 2, 132);
      c.fillStyle = ORDER_COLOR[g.order];
      c.fillText(s, VIEW_W / 2, 132);
      c.restore();
    }
    if (g.wheelOpen && p.alive && !g.menuOpen) this.drawWheel(c, g);
    if (g.waveIntro > 0 && p.alive && g.inCombat()) this.drawGrace(c, g);
    if (IS_TOUCH && g.inCombat() && !g.menuOpen && p.alive) this.drawTouch(c, g);
    if (!p.alive) this.drawGameOver(c, g);
    if (g.paused) this.drawPause(c);
    if (g.menuOpen) this.drawBigMenu(c, g);
    if (g.fadeT > 0) { c.fillStyle = `rgba(0,0,0,${clamp(g.fadeT / WAR.fadeTime, 0, 1)})`; c.fillRect(0, 0, VIEW_W, VIEW_H); }
  }

  /** Trim a string with an ellipsis so it fits `w` pixels in the current font. */
  private clip(c: CanvasRenderingContext2D, s: string, w: number): string {
    if (c.measureText(s).width <= w) return s;
    while (s.length > 1 && c.measureText(s + '\u2026').width > w) s = s.slice(0, -1);
    return s + '\u2026';
  }

  /** KH2's bottom-left command list: Attack / Magic / Items. */
  private drawCommandMenu(c: CanvasRenderingContext2D, g: Game) {
    const rows = g.menuRows();
    const x = 18;
    const rowH = 24;
    const w = 168;
    const h = rows.length * rowH + 10;
    const y = VIEW_H - 18 - h;

    c.save();
    c.fillStyle = 'rgba(12,18,40,0.82)';
    this.roundRect(c, x, y, w, h, 8);
    c.fill();
    c.strokeStyle = 'rgba(140,180,255,0.45)';
    c.lineWidth = 2;
    this.roundRect(c, x, y, w, h, 8);
    c.stroke();

    c.font = '700 13px ui-monospace, Menlo, Consolas, monospace';
    c.textAlign = 'left';
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const ry = y + 5 + i * rowH;
      if (i === g.menuIndex) {
        c.fillStyle = 'rgba(80,140,255,0.45)';
        this.roundRect(c, x + 4, ry + 1, w - 8, rowH - 2, 5);
        c.fill();
        c.fillStyle = '#ffd54a';
        c.fillText('>', x + 9, ry + 16);
      }
      c.fillStyle = !r.enabled ? '#5d6480' : (i === g.menuIndex ? '#ffffff' : PAL.text);
      c.fillText(r.label, x + 24, ry + 16);
      if (r.right) {
        c.textAlign = 'right';
        c.fillStyle = r.enabled ? PAL.dim : '#4a5068';
        c.fillText(r.right, x + w - 10, ry + 16);
        c.textAlign = 'left';
      }
    }
    c.restore();
  }

  private drawGameOver(c: CanvasRenderingContext2D, g: Game) {
    c.save();
    c.fillStyle = `rgba(8,10,18,${clamp(g.deathT / 1.4, 0, 0.82)})`;
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    if (g.deathT > 0.7) {
      c.globalAlpha = clamp((g.deathT - 0.7) / 0.6, 0, 1);
      c.textAlign = 'center';
      c.font = '900 52px ui-monospace, Menlo, Consolas, monospace';
      c.fillStyle = PAL.danger;
      c.fillText('DEFEATED', VIEW_W / 2, VIEW_H / 2 - 20);
      c.font = '700 15px ui-monospace, Menlo, Consolas, monospace';
      c.fillStyle = PAL.text;
      c.fillText(`${g.groupsCleared} group${g.groupsCleared === 1 ? '' : 's'} cleared on the test field`, VIEW_W / 2, VIEW_H / 2 + 14);
      c.fillStyle = PAL.dim;
      c.fillText(IS_TOUCH ? 'Tap to try again — gear, talents and materials are kept.'
                          : 'Press R to try again — gear, talents and materials are kept.', VIEW_W / 2, VIEW_H / 2 + 40);
    }
    c.restore();
  }

  private drawPause(c: CanvasRenderingContext2D) {
    c.save();
    c.fillStyle = 'rgba(8,10,18,0.6)';
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    c.textAlign = 'center';
    c.font = '900 40px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.text;
    c.fillText('PAUSED', VIEW_W / 2, VIEW_H / 2);
    c.font = '600 13px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.dim;
    c.fillText('P to resume  ·  ` for tuning panel', VIEW_W / 2, VIEW_H / 2 + 26);
    c.restore();
  }

  private drawPickups(c: CanvasRenderingContext2D, g: Game) {
    for (const p of g.pickups) {
      const x = sx(p.x), y = sy(p.y, p.z);
      const blink = p.life < 3 && Math.floor(p.life * 8) % 2 === 0;
      c.save();
      if (blink) c.globalAlpha = 0.4;
      // ground shadow
      c.globalAlpha *= 0.9;
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.beginPath();
      c.ellipse(p.x, p.y + 2, 6, 2.6, 0, 0, Math.PI * 2);
      c.fill();

      const s = 5 + Math.sin(p.bob) * 0.7;
      c.translate(x, y);
      c.shadowColor = p.color;
      c.shadowBlur = 9;
      c.fillStyle = p.color;
      if (p.kind === 'mat') {
        c.rotate(p.bob * 0.4);
        c.beginPath();
        c.moveTo(0, -s * 1.4); c.lineTo(s, 0); c.lineTo(0, s * 1.4); c.lineTo(-s, 0);
        c.closePath();
        c.fill();
      } else {
        // flask silhouette for consumables
        c.beginPath();
        this.roundRect(c, -3.6, -6, 7.2, 11, 3);
        c.fill();
        c.fillStyle = '#ffffff';
        c.globalAlpha *= 0.7;
        c.fillRect(-2.4, -7.5, 4.8, 2);
      }
      c.restore();
    }
  }

  /** The Whirl reads as a ring on the floor plus a blur at blade height. */
  private drawWhirlRing(c: CanvasRenderingContext2D, g: Game) {
    const p = g.player;
    const def = p.attackDef;
    if (!def || !def.radial || p.state !== 'attack') return;
    const into = p.attackFrame - def.startup;
    if (into < 0) return;
    const r = p.reach(def);
    const a = clamp(into / Math.max(1, def.active), 0, 1);
    c.save();
    c.globalAlpha = 0.30 * (1 - a * 0.4);
    c.strokeStyle = p.weapon.blade.edge;
    c.lineWidth = 5;
    c.beginPath();
    c.ellipse(p.x, p.y, r, r * 0.45, 0, 0, Math.PI * 2);
    c.stroke();
    c.globalAlpha = 0.16;
    c.fillStyle = p.weapon.blade.edge;
    c.beginPath();
    c.ellipse(p.x, p.y, r, r * 0.45, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  /* ---------------------------------------------------------- pause menu */

  private drawBigMenu(c: CanvasRenderingContext2D, g: Game) {
    const p = g.player;
    c.save();
    c.fillStyle = 'rgba(6,8,14,0.975)';
    c.fillRect(0, 0, VIEW_W, VIEW_H);

    const tabs = ['GEAR', 'FORGE', 'TALENTS', 'STATUS'];
    c.font = '700 13px ui-monospace, Menlo, Consolas, monospace';
    for (let i = 0; i < tabs.length; i++) {
      const on = i === g.menuTab;
      const tx = MENU_TAB.x + i * (MENU_TAB.w + MENU_TAB.gap);
      c.fillStyle = on ? 'rgba(80,140,255,0.28)' : 'rgba(30,36,58,0.7)';
      this.roundRect(c, tx, MENU_TAB.y, MENU_TAB.w, MENU_TAB.h, 6); c.fill();
      c.strokeStyle = on ? '#6f9bff' : 'rgba(120,150,220,0.22)';
      c.lineWidth = 1.5;
      this.roundRect(c, tx, MENU_TAB.y, MENU_TAB.w, MENU_TAB.h, 6); c.stroke();
      c.fillStyle = on ? '#ffffff' : PAL.dim;
      c.textAlign = 'center';
      c.fillText(`${i + 1} ${tabs[i]}`, tx + MENU_TAB.w / 2, MENU_TAB.y + 19);
      c.textAlign = 'left';
    }
    // close box, so a phone has a way out
    c.fillStyle = 'rgba(60,30,40,0.8)';
    this.roundRect(c, VIEW_W - 56, 18, 34, 28, 6); c.fill();
    c.strokeStyle = 'rgba(255,120,120,0.5)'; c.lineWidth = 1.5;
    this.roundRect(c, VIEW_W - 56, 18, 34, 28, 6); c.stroke();
    c.fillStyle = '#ff9d9d';
    c.textAlign = 'center';
    c.fillText('\u2715', VIEW_W - 39, 37);
    c.textAlign = 'left';

    // skill point badge, left of the close box
    const ap = g.apFree();
    c.textAlign = 'right';
    c.fillStyle = ap > 0 ? PAL.mpCharge : PAL.dim;
    c.font = '800 14px ui-monospace, Menlo, Consolas, monospace';
    c.fillText(`SP ${ap}`, VIEW_W - 70, 38);
    c.textAlign = 'left';

    const top = MENU_LIST.y;
    if (g.menuTab === 0) this.drawGearTab(c, g, top);
    else if (g.menuTab === 1) this.drawSynthTab(c, g, top);
    else if (g.menuTab === 2) this.drawTalentTab(c, g, top);
    else this.drawStatusTab(c, g, top);

    c.fillStyle = PAL.dim;
    c.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
    c.fillText(IS_TOUCH
      ? 'tap a tab  ·  tap a row to select, tap again to confirm  ·  \u2715 to close'
      : '1-4 tabs  ·  \u2190\u2192 switch  ·  \u2191\u2193 select  ·  ENTER confirm  ·  TAB or ESC close',
      26, VIEW_H - 18);
    void p;
    c.restore();
  }

  private listBox(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    c.fillStyle = 'rgba(19,23,40,0.9)';
    this.roundRect(c, x, y, w, h, 8); c.fill();
    c.strokeStyle = 'rgba(120,150,220,0.28)'; c.lineWidth = 1.5;
    this.roundRect(c, x, y, w, h, 8); c.stroke();
  }

  private rowHighlight(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    c.fillStyle = 'rgba(80,140,255,0.30)';
    this.roundRect(c, x, y, w, h, 5); c.fill();
  }

  private drawGearTab(c: CanvasRenderingContext2D, g: Game, top: number) {
    const p = g.player;
    const entries = g.gearEntries();
    const lw = MENU_LIST.w, rowH = MENU_LIST.rowH;
    this.listBox(c, 26, top, lw, VIEW_H - top - 46);
    c.font = '700 13px ui-monospace, Menlo, Consolas, monospace';

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const y = top + MENU_LIST.pad + i * rowH;
      const eq = e.kind === 'w' ? p.weapon.id === e.w!.id : p.armor.id === e.a!.id;
      if (i === g.gearIndex) this.rowHighlight(c, 32, y - 4, lw - 12, rowH - 2);
      c.fillStyle = eq ? PAL.mpCharge : PAL.text;
      const name = e.kind === 'w' ? e.w!.name : e.a!.name;
      const tier = e.kind === 'w' ? e.w!.tier : e.a!.tier;
      c.fillText(`${e.kind === 'w' ? 'WPN' : 'ARM'}  ${name}`, 42, y + 13);
      c.textAlign = 'right';
      c.fillStyle = eq ? PAL.mpCharge : PAL.dim;
      c.fillText(eq ? 'EQUIPPED' : 'T' + tier, 26 + lw - 12, y + 13);
      c.textAlign = 'left';
    }

    // detail panel
    const dx = 26 + lw + 14;
    const dw = VIEW_W - dx - 26;
    this.listBox(c, dx, top, dw, VIEW_H - top - 46);
    const sel = entries[g.gearIndex];
    if (!sel) return;
    let y = top + 26;
    c.font = '800 18px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.text;
    c.fillText(sel.kind === 'w' ? sel.w!.name : sel.a!.name, dx + 16, y);
    y += 24;
    c.font = '500 12px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.dim;
    c.fillText(sel.kind === 'w' ? sel.w!.desc : sel.a!.desc, dx + 16, y);
    y += 26;

    const rows: [string, string][] = sel.kind === 'w'
      ? [
        ['Power', `x${sel.w!.powerMult.toFixed(2)}`],
        ['Reach', `+${sel.w!.rangeBonus}px`],
        ['Crit', `+${Math.round(sel.w!.critBonus * 100)}%`],
        ['Magic', `+${sel.w!.magBonus}`],
        ['Stagger', `x${sel.w!.poiseMult.toFixed(2)}`],
      ]
      : [
        ['Damage cut', `${Math.round(sel.a!.dr * 100)}%`],
        ['Max HP', `+${sel.a!.hpBonus}`],
        ['M.Resist', `+${sel.a!.mresBonus}`],
        ['Pauldrons', `${sel.a!.look.shoulder}px`],
        ['Spikes', `${sel.a!.look.spikes}`],
      ];
    c.font = '600 13px ui-monospace, Menlo, Consolas, monospace';
    for (const [k, v] of rows) {
      c.fillStyle = PAL.dim; c.fillText(k, dx + 16, y);
      c.fillStyle = PAL.text; c.textAlign = 'right';
      c.fillText(v, dx + dw - 16, y);
      c.textAlign = 'left';
      y += 20;
    }
    c.fillStyle = PAL.mpCharge;
    c.font = '700 12px ui-monospace, Menlo, Consolas, monospace';
    c.fillText('ENTER to equip', dx + 16, VIEW_H - 62);
  }

  private drawSynthTab(c: CanvasRenderingContext2D, g: Game, top: number) {
    const p = g.player;
    const entries = g.synthEntries();
    const lw = MENU_LIST.w, rowH = SYNTH_ROW_H;
    const accent = '#ffd54a';
    this.listBox(c, 26, top, lw, VIEW_H - top - 46);
    c.font = '700 12px ui-monospace, Menlo, Consolas, monospace';
    const stateColor: Record<string, string> = { owned: '#69e29a', ready: '#ffd54a', lack: '#949dbd' };
    const stateLabel: Record<string, string> = { owned: 'FORGED', ready: 'READY', lack: 'MATS' };
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const y = top + MENU_LIST.pad + i * rowH;
      if (i === g.synthIndex) this.rowHighlight(c, 32, y - 3, lw - 12, rowH - 1);
      c.fillStyle = PAL.text;
      c.fillText(`${e.kind === 'w' ? 'WPN' : 'ARM'}  ${e.name}`, 42, y + 11);
      c.textAlign = 'right';
      c.fillStyle = stateColor[e.state];
      c.fillText(stateLabel[e.state], 26 + lw - 12, y + 11);
      c.textAlign = 'left';
    }

    const dx = 26 + lw + 14;
    const dw = VIEW_W - dx - 26;
    this.listBox(c, dx, top, dw, VIEW_H - top - 46);
    let y = top + 24;
    c.font = '800 13px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = accent;
    c.fillText('\u2692 FORGE', dx + 16, y);
    y += 17;
    c.font = '500 11px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.dim;
    c.fillText(this.clip(c, 'Forging works anywhere for now; castles and the gold fee come later.', dw - 32), dx + 16, y);
    y += 26;
    const sel = entries[g.synthIndex];
    if (!sel) return;
    c.font = '800 18px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.text;
    c.fillText(sel.name, dx + 16, y);
    y += 22;
    c.font = '500 12px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.dim;
    const def = sel.kind === 'w' ? weaponById(sel.id) : armorById(sel.id);
    c.fillText(this.clip(c, (def as WeaponDef | ArmorDef).desc, dw - 32), dx + 16, y);
    y += 26;

    c.font = '700 12px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.dim;
    c.fillText('MATERIALS', dx + 16, y);
    y += 18;
    c.font = '600 13px ui-monospace, Menlo, Consolas, monospace';
    for (const k of Object.keys(sel.recipe.needs) as MatId[]) {
      const need = sel.recipe.needs[k] || 0;
      const has = have(p.inv, k);
      c.fillStyle = MATS[k].color;
      c.fillRect(dx + 16, y - 8, 8, 8);
      c.fillStyle = PAL.text;
      c.fillText(MATS[k].name + (BOSS_MATS.includes(k) ? '  (rare)' : ''), dx + 32, y);
      c.textAlign = 'right';
      c.fillStyle = has >= need ? '#69e29a' : '#ff6b6b';
      c.fillText(`${has} / ${need}`, dx + dw - 16, y);
      c.textAlign = 'left';
      y += 20;
    }
    c.fillStyle = sel.state === 'ready' ? PAL.mpCharge : PAL.dim;
    c.font = '700 12px ui-monospace, Menlo, Consolas, monospace';
    c.fillText(sel.state === 'ready' ? `${IS_TOUCH ? 'Tap again' : 'ENTER'} to forge and equip`
      : sel.state === 'owned' ? 'Already yours — equip it from GEAR' : 'Materials come from battle spoils', dx + 16, VIEW_H - 62);
  }

  private drawTalentTab(c: CanvasRenderingContext2D, g: Game, top: number) {
    const p = g.player;
    const colW = (VIEW_W - 52 - 20) / 3;
    for (let b = 0; b < 3; b++) {
      const br = BRANCHES[b];
      const x = 26 + b * (colW + 10);
      const active = b === g.talentBranch;
      this.listBox(c, x, top, colW, VIEW_H - top - 100);
      if (active) {
        c.strokeStyle = br.color; c.lineWidth = 2;
        this.roundRect(c, x, top, colW, VIEW_H - top - 100, 8); c.stroke();
      }
      c.font = '800 13px ui-monospace, Menlo, Consolas, monospace';
      c.fillStyle = br.color;
      c.fillText(br.name.toUpperCase(), x + 14, top + 24);

      const list = talentsIn(br.id);
      c.font = '600 12px ui-monospace, Menlo, Consolas, monospace';
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        const y = top + 40 + i * 26;
        const owned = !!p.talents[t.id];
        const locked = !!t.needs && !p.talents[t.needs];
        if (active && i === g.talentIndex) this.rowHighlight(c, x + 8, y - 2, colW - 16, 24);
        c.fillStyle = owned ? br.color : locked ? '#5d6480' : PAL.text;
        c.fillText(t.name, x + 16, y + 15);
        c.textAlign = 'right';
        c.fillStyle = owned ? br.color : PAL.dim;
        c.fillText(owned ? '\u2713' : String(t.cost), x + colW - 14, y + 15);
        c.textAlign = 'left';
      }
    }

    // description strip for the highlighted node
    const list = talentsIn(BRANCHES[g.talentBranch].id);
    const t = list[g.talentIndex];
    if (!t) return;
    const y = VIEW_H - 92;
    this.listBox(c, 26, y, VIEW_W - 52, 44);
    c.font = '700 13px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = BRANCHES[g.talentBranch].color;
    c.fillText(t.name, 42, y + 19);
    c.font = '500 12px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.dim;
    c.fillText(t.desc, 42, y + 35);
    c.textAlign = 'right';
    const owned = !!p.talents[t.id];
    c.fillStyle = owned ? '#69e29a' : g.apFree() >= t.cost ? PAL.mpCharge : '#ff6b6b';
    c.font = '700 12px ui-monospace, Menlo, Consolas, monospace';
    c.fillText(owned ? 'LEARNED' : `${t.cost} SP  ·  ENTER to learn`, VIEW_W - 42, y + 27);
    c.textAlign = 'left';
  }

  private drawStatusTab(c: CanvasRenderingContext2D, g: Game, top: number) {
    const p = g.player;
    const halfW = (VIEW_W - 66) / 2;
    this.listBox(c, 26, top, halfW, VIEW_H - top - 46);
    this.listBox(c, 40 + halfW, top, halfW, VIEW_H - top - 46);

    let y = top + 26;
    c.font = '800 15px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.text;
    c.fillText('The Knight', 42, y);
    y += 24;
    const s = p.stats;
    const u = p.upgrades;
    const rows: [string, string][] = [
      ['Upgrades (V/M/A)', `${u.vitality} / ${u.might} / ${u.arcana}`],
      ['Skill points', `${g.apFree()} free of ${p.skillPoints}`],
      ['Max HP', String(s.maxHp)],
      ['Max MP', String(s.maxMp)],
      ['Strength', s.str.toFixed(1)],
      ['Magic', s.mag.toFixed(1)],
      ['Defense', s.def.toFixed(1)],
      ['M.Resist', s.mres.toFixed(1)],
      ['Damage cut', `${Math.round(p.dr() * 100)}%`],
      ['Weapon', `${p.weapon.name} (+${p.weapon.rangeBonus} reach)`],
      ['Armour', p.armor.name],
      ['Combo hits', String(p.groundTable().length)],
      ['Dash charges', p.hasT('dash') ? String(p.maxDash()) : 'not learned'],
      ['Potions / Ethers', `${p.potions} / ${p.ethers}`],
    ];
    c.font = '600 13px ui-monospace, Menlo, Consolas, monospace';
    for (const [k, v] of rows) {
      c.fillStyle = PAL.dim; c.fillText(k, 42, y);
      c.fillStyle = PAL.text; c.textAlign = 'right';
      c.fillText(v, 26 + halfW - 16, y);
      c.textAlign = 'left';
      y += 20;
    }

    let my = top + 26;
    const mx = 40 + halfW;
    c.font = '800 15px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.text;
    c.fillText('Materials', mx + 16, my);
    my += 20;
    c.font = '600 12px ui-monospace, Menlo, Consolas, monospace';
    for (const k of MAT_ORDER) {
      const n = have(p.inv, k);
      c.fillStyle = MATS[k].color;
      c.fillRect(mx + 16, my - 8, 9, 9);
      c.fillStyle = n > 0 ? PAL.text : '#5d6480';
      c.fillText(MATS[k].name + (BOSS_MATS.includes(k) ? '  *' : ''), mx + 32, my);
      c.textAlign = 'right';
      c.fillText(String(n), mx + halfW - 16, my);
      c.textAlign = 'left';
      my += 20;
    }
    c.fillStyle = PAL.dim;
    c.font = '500 11px ui-monospace, Menlo, Consolas, monospace';
    c.fillText('* rare: paid by castle lords', mx + 16, my + 4);
  }

  private wrap(c: CanvasRenderingContext2D, text: string, w: number): string[] {
    const out: string[] = [];
    let line = '';
    for (const word of text.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (c.measureText(test).width > w && line) { out.push(line); line = word; } else line = test;
    }
    if (line) out.push(line);
    return out;
  }

  /** A shrinking ring while the wave is still frozen. */
  private drawGrace(c: CanvasRenderingContext2D, g: Game) {
    const total = Math.max(0.01, TUNING.waveIntro);
    const t = clamp(g.waveIntro / total, 0, 1);
    c.save();
    c.textAlign = 'center';
    c.font = '800 15px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.mpCharge;
    c.globalAlpha = 0.55 + Math.sin(g.time * 8) * 0.2;
    c.fillText('GET READY', VIEW_W / 2, 118);
    c.globalAlpha = 0.9;
    c.strokeStyle = PAL.mpCharge;
    c.lineWidth = 3;
    c.beginPath();
    c.arc(VIEW_W / 2, 140, 12, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2);
    c.stroke();
    c.restore();
  }

  /* ------------------------------------------------------ touch controls */

  private drawTouch(c: CanvasRenderingContext2D, g: Game) {
    const inp = g.input;
    c.save();

    // floating thumbstick — base follows your thumb once you put it down
    const bx = inp.stick.active ? inp.stick.ox : TOUCH_STICK.x;
    const by = inp.stick.active ? inp.stick.oy : TOUCH_STICK.y;
    c.globalAlpha = inp.stick.active ? 0.40 : 0.22;
    c.strokeStyle = '#9db2e0';
    c.lineWidth = 3;
    c.beginPath(); c.arc(bx, by, TOUCH_STICK.r, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(20,26,45,0.45)';
    c.beginPath(); c.arc(bx, by, TOUCH_STICK.r, 0, Math.PI * 2); c.fill();
    c.globalAlpha = inp.stick.active ? 0.85 : 0.35;
    c.fillStyle = '#c8d6f5';
    c.beginPath();
    c.arc(bx + inp.stick.x * TOUCH_STICK.r, by + inp.stick.y * TOUCH_STICK.r, TOUCH_STICK.knob, 0, Math.PI * 2);
    c.fill();

    // action buttons
    c.font = '800 13px ui-monospace, Menlo, Consolas, monospace';
    c.textAlign = 'center';
    for (const b of TOUCH_BTNS) {
      const lit = inp.touchHeld(b.id);
      const usable = b.id !== 'dash' || g.player.hasT('dash');
      c.globalAlpha = usable ? (lit ? 0.85 : 0.42) : 0.16;
      c.fillStyle = 'rgba(16,20,36,0.7)';
      c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2); c.fill();
      c.strokeStyle = b.color;
      c.lineWidth = lit ? 4 : 2.5;
      c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2); c.stroke();
      c.fillStyle = b.color;
      c.fillText(b.label, b.x, b.y + 5);
      // dash charges as pips under the button
      if (b.id === 'dash' && usable) {
        for (let i = 0; i < g.player.maxDash(); i++) {
          c.fillStyle = i < g.player.dashCharges ? b.color : '#39415f';
          c.fillRect(b.x - g.player.maxDash() * 5 + i * 10, b.y + b.r + 5, 7, 3);
        }
      }
    }

    // spell chips above the MAG button
    c.font = '700 11px ui-monospace, Menlo, Consolas, monospace';
    for (let i = 0; i < SPELLS.length; i++) {
      const s = SPELLS[i];
      const cy = TOUCH_CHIPS.y + i * TOUCH_CHIPS.dy;
      const on = g.touchSpell === i;
      const ok = g.player.canCast(s);
      c.globalAlpha = on ? 0.9 : 0.38;
      c.fillStyle = on ? s.color : 'rgba(16,20,36,0.7)';
      c.beginPath(); c.arc(TOUCH_CHIPS.x, cy, TOUCH_CHIPS.r, 0, Math.PI * 2); c.fill();
      c.strokeStyle = ok ? s.color : '#5d6480';
      c.lineWidth = 2;
      c.beginPath(); c.arc(TOUCH_CHIPS.x, cy, TOUCH_CHIPS.r, 0, Math.PI * 2); c.stroke();
      c.fillStyle = on ? '#0d1020' : (ok ? s.color : '#5d6480');
      c.fillText(s.name[0], TOUCH_CHIPS.x, cy + 4);
    }

    // menu button
    c.globalAlpha = 0.42;
    c.fillStyle = 'rgba(16,20,36,0.7)';
    c.beginPath(); c.arc(TOUCH_MENU.x, TOUCH_MENU.y, TOUCH_MENU.r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = g.apFree() > 0 ? PAL.mpCharge : '#9db2e0';
    c.lineWidth = 2.5;
    c.beginPath(); c.arc(TOUCH_MENU.x, TOUCH_MENU.y, TOUCH_MENU.r, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = g.apFree() > 0 ? PAL.mpCharge : '#c8d6f5';
    c.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      c.beginPath();
      c.moveTo(TOUCH_MENU.x - 8, TOUCH_MENU.y + i * 5);
      c.lineTo(TOUCH_MENU.x + 8, TOUCH_MENU.y + i * 5);
      c.stroke();
    }
    c.textAlign = 'left';
    c.restore();
  }

  /* ---------------------------------------------------------- title screen */

  private drawTitle(c: CanvasRenderingContext2D, g: Game) {
    c.save();
    const grad = c.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, 'rgba(6,8,14,0.93)');
    grad.addColorStop(0.55, 'rgba(8,10,20,0.86)');
    grad.addColorStop(1, 'rgba(6,8,14,0.95)');
    c.fillStyle = grad;
    c.fillRect(0, 0, VIEW_W, VIEW_H);

    if (g.titleMode === 'help') { this.drawHelpScreen(c, g); c.restore(); return; }

    c.font = '900 62px ui-monospace, Menlo, Consolas, monospace';
    c.textAlign = 'left';
    const w1 = 'AERIAL ', w2 = 'CONQUEST';
    const m1 = c.measureText(w1).width, m2 = c.measureText(w2).width;
    const wx = (VIEW_W - (m1 + m2)) / 2;
    c.fillStyle = PAL.text;
    c.fillText(w1, wx, 168);
    c.fillStyle = PAL.mpCharge;
    c.fillText(w2, wx + m1, 168);

    c.textAlign = 'center';
    c.font = '600 13px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.dim;
    c.fillText('take back the Verdant Reach  ·  one territory at a time', VIEW_W / 2, 198);

    // a thin gold rule under the wordmark
    c.strokeStyle = 'rgba(255,213,74,0.45)';
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(VIEW_W / 2 - 250, 216); c.lineTo(VIEW_W / 2 + 250, 216); c.stroke();

    const rows = g.titleRows();
    const sel = g.titleMode === 'options' ? g.optionIndex : g.titleIndex;
    c.font = '700 17px ui-monospace, Menlo, Consolas, monospace';
    for (let i = 0; i < rows.length; i++) {
      const y = TITLE_ROW.y0 + i * (TITLE_ROW.h + TITLE_ROW.gap);
      const on = i === sel;
      c.fillStyle = on ? 'rgba(80,140,255,0.26)' : 'rgba(19,23,40,0.75)';
      this.roundRect(c, TITLE_ROW.x, y, TITLE_ROW.w, TITLE_ROW.h, 8); c.fill();
      c.strokeStyle = on ? '#6f9bff' : 'rgba(120,150,220,0.22)';
      c.lineWidth = on ? 2 : 1.4;
      this.roundRect(c, TITLE_ROW.x, y, TITLE_ROW.w, TITLE_ROW.h, 8); c.stroke();

      c.fillStyle = on ? '#ffffff' : PAL.text;
      if (g.titleMode === 'options' && i < 2) {
        c.textAlign = 'left';
        c.font = '700 14px ui-monospace, Menlo, Consolas, monospace';
        c.fillText(rows[i], TITLE_ROW.x + 16, y + 25);
        const v = i === 0 ? TUNING.musicVolume : TUNING.sfxVolume;
        const bx = TITLE_ROW.x + 150, bw = 100;
        c.fillStyle = 'rgba(0,0,0,0.5)';
        this.roundRect(c, bx, y + 14, bw, 9, 4); c.fill();
        c.fillStyle = i === 0 ? '#c39bff' : '#7fb4ff';
        this.roundRect(c, bx, y + 14, Math.max(3, bw * v), 9, 4); c.fill();
        c.fillStyle = PAL.text;
        c.textAlign = 'right';
        c.fillText(`${Math.round(v * 100)}%`, TITLE_ROW.x + TITLE_ROW.w - 14, y + 25);
        c.textAlign = 'center';
        c.font = '700 17px ui-monospace, Menlo, Consolas, monospace';
      } else if (g.titleMode === 'options' && i < 4) {
        c.textAlign = 'left';
        c.font = '700 14px ui-monospace, Menlo, Consolas, monospace';
        c.fillText(rows[i], TITLE_ROW.x + 16, y + 25);
        const name = i === 2 ? HERO_STYLES.find((h) => h.id === g.heroStyle)!.name : BLADE_STYLES.find((b) => b.id === g.bladeStyle)!.name;
        c.textAlign = 'right';
        c.fillStyle = PAL.mpCharge;
        c.fillText(`\u25C0 ${name} \u25B6`, TITLE_ROW.x + TITLE_ROW.w - 14, y + 25);
        c.textAlign = 'center';
        c.font = '700 17px ui-monospace, Menlo, Consolas, monospace';
      } else {
        c.fillText(rows[i], VIEW_W / 2, y + 26);
      }
    }

    if (g.titleMode === 'options') this.drawHeroPreview(c, g, 800, 430, 2.4);

    c.font = '600 12px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.dim;
    if (g.titleMode === 'options') {
      c.fillText(IS_TOUCH ? 'tap either side of a bar to adjust' : '\u2190 \u2192 to adjust  ·  ESC to go back', VIEW_W / 2, VIEW_H - 46);
    } else if (g.hasSave()) {
      c.fillText(`${g.player.weapon.name} / ${g.player.armor.name}  ·  ${Object.keys(g.player.talents).length} talents`, VIEW_W / 2, VIEW_H - 62);
      c.fillStyle = '#ff9d9d';
      c.fillText('New Game wipes that progress.', VIEW_W / 2, VIEW_H - 44);
    } else {
      c.fillText(IS_TOUCH ? 'tap an option to begin' : 'arrow keys and ENTER, or click', VIEW_W / 2, VIEW_H - 46);
    }
    c.textAlign = 'left';
    c.restore();
  }

  private previewHero: Player | null = null;

  /** The hero, big, standing then swinging: for choosing a look. */
  drawHeroPreview(c: CanvasRenderingContext2D, g: Game, x: number, y: number, scale: number) {
    if (!this.previewHero) this.previewHero = new Player();
    const p = this.previewHero;
    p.weapon = g.player.weapon; p.armor = g.player.armor;
    p.x = 0; p.y = 0; p.z = 0; p.vx = 0; p.vy = 0;
    p.facing = 0.35;
    const cycle = g.time % 2.4;
    const def = GROUND_COMBO[1];
    const total = def.startup + def.active + def.recovery;
    if (cycle > 1.4) {
      p.state = 'attack'; p.attackDef = def;
      p.attackFrame = Math.min(total, Math.floor(((cycle - 1.4) / 0.6) * total));
    } else { p.state = 'idle'; p.attackDef = null; }
    c.save();
    const glow = c.createRadialGradient(x, y - 50, 10, x, y - 50, 140);
    glow.addColorStop(0, 'rgba(111,155,255,0.18)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = glow; c.fillRect(x - 150, y - 200, 300, 260);
    c.translate(x, y);
    c.scale(scale, scale);
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.beginPath(); c.ellipse(0, 0, 18, 6, 0, 0, Math.PI * 2); c.fill();
    const saved = this.bladeStyle;
    this.bladeStyle = g.bladeStyle;
    this.drawPlayer(c, p, g);
    this.bladeStyle = saved;
    c.restore();
  }

  private drawHelpScreen(c: CanvasRenderingContext2D, g: Game) {
    c.textAlign = 'center';
    c.font = '900 30px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.mpCharge;
    c.fillText('HOW TO PLAY', VIEW_W / 2, 64);

    const controls: [string, string][] = IS_TOUCH
      ? [
        ['Move', 'left thumbstick — put your thumb anywhere on the left'],
        ['ATK', 'attack; hold to keep the combo going'],
        ['JMP', 'jump, tap twice to double jump into an air combo'],
        ['DSH', 'dash with i-frames (learn it in the talent tree first)'],
        ['MAG', 'cast the highlighted spell; tap a chip to change it'],
        ['Lock-on', 'automatic on touch — it picks the nearest enemy'],
        ['CMD', 'press, drag to an order, release  ·  tap to cycle'],
        ['Menu', 'the icon on the right: gear, forge, talents, status'],
      ]
      : [
        ['Move', 'W A S D'],
        ['Attack / Jump', 'J  ·  K or Space'],
        ['Dash / Lock-on', 'Shift  ·  L'],
        ['Magic', '1 Fire  2 Blizzard  3 Thunder  4 Cure'],
        ['Menu', 'Tab for gear, forge, talents and status'],
        ['Orders', 'hold Q + direction  ·  tap Q to cycle'],
        ['Potion / Pause', 'E  ·  P'],
        ['Tuning panel', '` opens every combat constant as a live slider'],
      ];

    const rules: string[] = [
      'The Umbral Dominion holds the Verdant Reach. You are the last knight of the',
      'Aerial Order. (Early build: the campaign map, armies and generals come later.)',
      'For now, New Game opens a test battlefield: groups of Shades keep coming, so',
      'you can try the full moveset. Talents cost skill points (SP); the Status tab',
      'shows your knight. Dying restarts the field and keeps your gear and talents.',
    ];

    c.textAlign = 'left';
    let y = 112;
    c.font = '700 13px ui-monospace, Menlo, Consolas, monospace';
    for (const [k, v] of controls) {
      c.fillStyle = PAL.text;
      c.fillText(k, 70, y);
      c.fillStyle = PAL.dim;
      c.fillText(v, 250, y);
      y += 22;
    }
    y += 12;
    c.fillStyle = 'rgba(255,213,74,0.5)';
    c.fillRect(70, y - 12, VIEW_W - 140, 1.5);
    y += 12;
    c.font = '500 12px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.dim;
    for (const line of rules) { c.fillText(line, 70, y); y += 18; }

    // Back button, matching the title row geometry so taps line up
    const by = VIEW_H - 58;
    c.fillStyle = 'rgba(80,140,255,0.26)';
    this.roundRect(c, TITLE_ROW.x, by, TITLE_ROW.w, 36, 8); c.fill();
    c.strokeStyle = '#6f9bff'; c.lineWidth = 2;
    this.roundRect(c, TITLE_ROW.x, by, TITLE_ROW.w, 36, 8); c.stroke();
    c.fillStyle = '#ffffff';
    c.textAlign = 'center';
    c.font = '700 15px ui-monospace, Menlo, Consolas, monospace';
    c.fillText('Back', VIEW_W / 2, by + 24);
    c.textAlign = 'left';
    void g;
  }

  /* -------------------------------------------------------------- utils */

  private bar(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ratio: number, fill: string, bg: string) {
    c.fillStyle = bg;
    this.roundRect(c, x - 1, y - 1, w + 2, h + 2, 3);
    c.fill();
    c.fillStyle = fill;
    this.roundRect(c, x, y, Math.max(0, w * clamp(ratio, 0, 1)), h, 2);
    c.fill();
  }

  roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  private mix(a: string, b: string, t: number): string {
    const pa = this.hex(a), pb = this.hex(b);
    const r = Math.round(lerp(pa[0], pb[0], t));
    const g = Math.round(lerp(pa[1], pb[1], t));
    const bl = Math.round(lerp(pa[2], pb[2], t));
    return `rgb(${r},${g},${bl})`;
  }

  /** '#rrggbb' or '#rgb' -> [r, g, b]. Anything unparseable reads as mid-grey rather than NaN. */
  private hex(h: string): [number, number, number] {
    let s = h.replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const v = [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
    return v.some((n) => Number.isNaN(n)) ? [128, 128, 128] : v as [number, number, number];
  }
}
