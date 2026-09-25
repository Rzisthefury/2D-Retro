/* =========================================================================
 * render.ts — arena, characters, VFX, HUD and the KH2-style command menu.
 * Programmer art, but with real animation timing driven by the frame data.
 * ========================================================================= */

const Z_SCALE = 0.85; // how much world height translates to screen height

function sx(x: number): number { return x; }
function sy(y: number, z: number): number { return y - z * Z_SCALE; }

class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dpr = 1;

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
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, VIEW_W, VIEW_H);

    c.save();
    const sh = g.shakeAmount;
    if (sh > 0.1) c.translate(rnd(-sh, sh), rnd(-sh, sh));

    // The open world scrolls under a camera; rooms are drawn as they are.
    const outside = g.screen === 'world' || g.screen === 'title';
    let cam = { x: 0, y: 0 };
    if (outside) {
      cam = g.screen === 'title' ? cameraFor(g.player.x, g.player.y) : { x: g.camX, y: g.camY };
      c.translate(-Math.round(cam.x), -Math.round(cam.y));
      this.drawWorld(c, g, cam);
    } else {
      this.drawRoom(c, g);
    }
    const onScreen = (x: number, y: number) => !outside
      || (x > cam.x - 80 && x < cam.x + VIEW_W + 80 && y > cam.y - 80 && y < cam.y + VIEW_H + 160);

    // Ground-level markers sit under everything.
    for (const e of g.enemies) if (e.alive && onScreen(e.x, e.y)) this.drawTelegraph(c, e);
    this.drawLockRing(c, g);

    // Y-sorted so nearer things overlap farther ones.
    const drawables: { y: number; fn: () => void }[] = [];
    for (const e of g.enemies) if (onScreen(e.x, e.y)) drawables.push({ y: e.y, fn: () => this.drawEnemy(c, e, g) });
    const showPlayer = g.screen !== 'title' && (g.player.alive || g.deathT < 2);
    if (showPlayer) drawables.push({ y: g.player.y, fn: () => this.drawPlayer(c, g.player, g) });
    for (const p of g.projectiles) drawables.push({ y: p.y, fn: () => this.drawProjectile(c, p) });
    drawables.sort((a, b) => a.y - b.y);

    for (const e of g.enemies) {
      if ((!e.alive && e.deathT > 0.25) || !onScreen(e.x, e.y)) continue;
      this.drawShadow(c, e.x, e.y, e.radius, e.z);
    }
    if (showPlayer) this.drawShadow(c, g.player.x, g.player.y, g.player.radius, g.player.z);

    for (const d of drawables) d.fn();

    this.drawPickups(c, g);
    this.drawWhirlRing(c, g);
    this.drawSlashes(c, g);
    this.drawParticles(c, g);
    this.drawRings(c, g);
    this.drawFloatText(c, g);

    c.restore();

    this.drawHud(c, g);
  }

  /* ------------------------------------------------------- open world */

  /** Tiles in view, then the buildings standing on them. */
  private drawWorld(c: CanvasRenderingContext2D, g: Game, cam: { x: number; y: number }) {
    const tx0 = Math.max(0, Math.floor(cam.x / TILE) - 1), tx1 = Math.min(WORLD_TW - 1, Math.ceil((cam.x + VIEW_W) / TILE) + 1);
    const ty0 = Math.max(0, Math.floor(cam.y / TILE) - 1), ty1 = Math.min(WORLD_TH - 1, Math.ceil((cam.y + VIEW_H) / TILE) + 1);
    c.fillStyle = '#0a0b10';
    c.fillRect(cam.x - 10, cam.y - 10, VIEW_W + 20, VIEW_H + 20);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) this.drawTile(c, g, tx, ty);
    for (const b of WORLD_MAP.buildings) {
      const bx = b.tx * TILE, by = b.ty * TILE;
      if (bx > cam.x + VIEW_W + 100 || bx + b.tw * TILE < cam.x - 100 || by > cam.y + VIEW_H + 100 || by + b.th * TILE < cam.y - 140) continue;
      this.drawBuilding(c, g, b);
    }
  }

  private drawTile(c: CanvasRenderingContext2D, g: Game, tx: number, ty: number) {
    const i = ty * WORLD_TW + tx;
    const t = WORLD_MAP.tiles[i];
    const ri = WORLD_MAP.region[i];
    const x = tx * TILE, y = ty * TILE;
    const v = WORLD_MAP.variant[i];
    if (ri < 0) {
      // mountains between regions
      c.fillStyle = v % 3 ? '#15171f' : '#181a23';
      c.fillRect(x, y, TILE, TILE);
      if (v % 5 === 0) { c.fillStyle = '#20232e'; c.beginPath(); c.moveTo(x + 6, y + 34); c.lineTo(x + 20, y + 10); c.lineTo(x + 34, y + 34); c.fill(); }
      return;
    }
    const loc = locById(REGION_IDS[ri]);
    const look = loc.look;
    const theme = loc.theme;

    // ground
    c.fillStyle = look.floorAlt;
    c.fillRect(x, y, TILE, TILE);
    if ((tx + ty) % 2 === 0) { c.fillStyle = 'rgba(255,255,255,0.018)'; c.fillRect(x, y, TILE, TILE); }
    if (t === T_GROUND && v % 6 === 0) {
      c.fillStyle = look.grid;
      c.fillRect(x + (v % 29), y + (v % 23) + 6, 3, 3);
      c.fillRect(x + ((v * 7) % 31), y + ((v * 3) % 27) + 4, 2, 2);
    }
    if (t === T_PATH) {
      c.fillStyle = this.alpha(look.motif, 0.13);
      c.fillRect(x, y, TILE, TILE);
    }

    if (t === T_WALL) {
      // the cliff ring around a region
      c.fillStyle = '#0d0f16';
      c.fillRect(x, y, TILE, TILE);
      c.fillStyle = this.alpha(look.accent, 0.08);
      c.fillRect(x, y, TILE, 5);
      if (v % 4 === 0) { c.fillStyle = '#161923'; c.fillRect(x + 8, y + 12, 14, 10); }
    } else if (t === T_LIQUID) {
      this.drawLiquid(c, g, theme, x, y, v);
    } else if (t === T_SOLID) {
      this.drawObstacle(c, theme, look, x, y, v);
    }

    // a sealed passage
    if (WORLD_MAP.passageOf[i] >= 0 && barrierUp(g.world, tx, ty)) {
      const pulse = 0.35 + Math.sin(g.time * 3 + tx + ty) * 0.15;
      c.fillStyle = `rgba(190,120,255,${pulse})`;
      c.fillRect(x, y, TILE, TILE);
      c.strokeStyle = 'rgba(240,210,255,0.7)';
      c.lineWidth = 1.5;
      c.beginPath();
      for (let k = 6; k < TILE; k += 12) { c.moveTo(x + k, y); c.lineTo(x + k, y + TILE); }
      c.stroke();
    }
  }

  private drawLiquid(c: CanvasRenderingContext2D, g: Game, theme: Theme, x: number, y: number, v: number) {
    const t = g.time;
    if (theme === 'Volcano') {
      c.fillStyle = '#7a220c'; c.fillRect(x, y, TILE, TILE);
      c.fillStyle = `rgba(255,140,40,${0.35 + Math.sin(t * 2 + v) * 0.15})`;
      c.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
    } else if (theme === 'Sky' || theme === 'Rift') {
      c.fillStyle = '#04050a'; c.fillRect(x, y, TILE, TILE);
      if (v % 3 === 0) { c.fillStyle = theme === 'Rift' ? '#c070ff' : '#cfe0ff'; c.globalAlpha = 0.4 + Math.sin(t + v) * 0.3; c.fillRect(x + (v % 30), y + (v % 26), 2, 2); c.globalAlpha = 1; }
    } else if (theme === 'Tundra') {
      c.fillStyle = '#7c9ab4'; c.fillRect(x, y, TILE, TILE);
      c.strokeStyle = 'rgba(230,245,255,0.5)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x + 4, y + 10 + (v % 12)); c.lineTo(x + 30, y + 16 + (v % 12)); c.stroke();
    } else {
      c.fillStyle = '#1b4260'; c.fillRect(x, y, TILE, TILE);
      c.strokeStyle = 'rgba(160,220,255,0.35)'; c.lineWidth = 1.2;
      const o = Math.sin(t * 1.5 + v) * 3;
      c.beginPath(); c.moveTo(x + 6 + o, y + 14); c.lineTo(x + 18 + o, y + 14); c.moveTo(x + 18 - o, y + 28); c.lineTo(x + 32 - o, y + 28); c.stroke();
    }
  }

  /** Trees, rocks, pillars: whatever a region is cluttered with. */
  private drawObstacle(c: CanvasRenderingContext2D, theme: Theme, look: LocationLook, x: number, y: number, v: number) {
    const cx = x + TILE / 2, cy = y + TILE / 2;
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath(); c.ellipse(cx, cy + 12, 16, 6, 0, 0, Math.PI * 2); c.fill();
    switch (theme) {
      case 'Forest': case 'Haven': {
        c.fillStyle = '#3a2a1e'; c.fillRect(cx - 3, cy, 6, 12);
        c.fillStyle = theme === 'Haven' ? '#24402e' : (v % 2 ? '#1c4a2a' : '#235a30');
        c.beginPath(); c.arc(cx, cy - 4, 17, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(180,255,190,0.12)';
        c.beginPath(); c.arc(cx - 5, cy - 9, 8, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'Ruins': {
        c.fillStyle = '#4a4250'; c.fillRect(cx - 12, cy - 16, 24, 30);
        c.fillStyle = '#5e5566'; c.fillRect(cx - 14, cy - 20, 28, 7);
        c.fillStyle = this.alpha(look.accent, 0.25); c.fillRect(cx - 12, cy - 4, 24, 2);
        break;
      }
      case 'Desert': {
        if (v % 2) {
          c.fillStyle = '#4a7a3a'; c.fillRect(cx - 4, cy - 16, 8, 28);
          c.fillRect(cx - 12, cy - 6, 8, 4); c.fillRect(cx - 12, cy - 14, 4, 10);
          c.fillRect(cx + 4, cy - 2, 8, 4); c.fillRect(cx + 8, cy - 10, 4, 10);
        } else {
          c.fillStyle = '#7a6040'; c.beginPath(); c.ellipse(cx, cy, 16, 12, 0, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#9a7a52'; c.beginPath(); c.ellipse(cx - 4, cy - 4, 8, 5, 0, 0, Math.PI * 2); c.fill();
        }
        break;
      }
      case 'Volcano': {
        c.fillStyle = '#2a1a16'; c.beginPath(); c.moveTo(cx - 16, cy + 10); c.lineTo(cx - 6, cy - 16); c.lineTo(cx + 10, cy - 12); c.lineTo(cx + 16, cy + 10); c.fill();
        c.strokeStyle = '#ff6a2a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(cx - 4, cy - 8); c.lineTo(cx + 2, cy + 2); c.lineTo(cx - 2, cy + 8); c.stroke();
        break;
      }
      case 'Tundra': {
        c.fillStyle = '#c8dcec'; c.beginPath(); c.ellipse(cx, cy, 17, 13, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(cx - 4, cy - 5, 9, 5, 0, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'Sky': {
        c.fillStyle = '#d8e0f4'; c.globalAlpha = 0.9;
        c.beginPath(); c.arc(cx - 8, cy, 11, 0, Math.PI * 2); c.arc(cx + 7, cy - 2, 13, 0, Math.PI * 2); c.arc(cx, cy - 10, 10, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1;
        break;
      }
      case 'Rift': {
        c.fillStyle = v % 2 ? '#6a2a9a' : '#9a3ac0';
        c.beginPath(); c.moveTo(cx, cy - 20); c.lineTo(cx + 9, cy + 8); c.lineTo(cx, cy + 12); c.lineTo(cx - 9, cy + 8); c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,200,255,0.35)'; c.beginPath(); c.moveTo(cx, cy - 20); c.lineTo(cx + 3, cy); c.lineTo(cx, cy + 12); c.fill();
        break;
      }
      default: {  // Coast: a sea-worn boulder
        c.fillStyle = '#4a5a66'; c.beginPath(); c.ellipse(cx, cy, 16, 13, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#62747f'; c.beginPath(); c.ellipse(cx - 4, cy - 5, 8, 5, 0, 0, Math.PI * 2); c.fill();
      }
    }
  }

  /** Dungeon entrances, forges and the colosseum. */
  private drawBuilding(c: CanvasRenderingContext2D, g: Game, b: Building) {
    const loc = locById(b.region);
    const accent = loc.look.accent;
    const x = b.tx * TILE, y = b.ty * TILE, w = b.tw * TILE, h = b.th * TILE;
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(x + 6, y + h - 4, w, 10);
    if (b.kind === 'dungeon') {
      const cleared = loc.bosses.every((x) => bossDefeated(g.world, x.id));
      c.fillStyle = '#22242e'; c.fillRect(x, y + 16, w, h - 16);
      c.fillStyle = '#2c2f3c';
      for (let k = 0; k < b.tw; k++) c.fillRect(x + k * TILE + 4, y + 4, TILE - 8, 16);     // battlements
      c.fillStyle = '#1a1c24';
      for (let r = 0; r < 3; r++) c.fillRect(x, y + 36 + r * 30, w, 2);                    // courses of stone
      // the doorway
      const dx = x + w / 2;
      c.fillStyle = '#05060a';
      c.beginPath(); c.moveTo(dx - 22, y + h); c.lineTo(dx - 22, y + h - 40); c.arc(dx, y + h - 40, 22, Math.PI, 0); c.lineTo(dx + 22, y + h); c.fill();
      c.strokeStyle = accent; c.lineWidth = 2;
      c.globalAlpha = 0.6 + Math.sin(g.time * 2.5) * 0.25;
      c.beginPath(); c.moveTo(dx - 22, y + h); c.lineTo(dx - 22, y + h - 40); c.arc(dx, y + h - 40, 22, Math.PI, 0); c.lineTo(dx + 22, y + h); c.stroke();
      c.globalAlpha = 1;
      this.worldLabel(c, `${loc.name} dungeon${cleared ? '  ✓' : ''}`, dx, y - 8, accent);
    } else if (b.kind === 'forge') {
      c.fillStyle = '#3a2e28'; c.fillRect(x, y + 20, w, h - 20);
      c.fillStyle = this.mix(accent, '#2a2030', 0.55);
      c.beginPath(); c.moveTo(x - 8, y + 24); c.lineTo(x + w / 2, y - 12); c.lineTo(x + w + 8, y + 24); c.fill();   // roof
      c.fillStyle = '#2a2020'; c.fillRect(x + w - 34, y - 14, 12, 26);                                               // chimney
      for (let k = 0; k < 3; k++) {
        c.globalAlpha = 0.25; c.fillStyle = '#cfcfcf';
        const ph = (g.time * 0.6 + k / 3) % 1;
        c.beginPath(); c.arc(x + w - 28 + Math.sin(ph * 6) * 4, y - 18 - ph * 40, 5 + ph * 6, 0, Math.PI * 2); c.fill();
      }
      c.globalAlpha = 1;
      // the forge's glow through the door (door faces up, onto the road)
      const fg = c.createRadialGradient(x + w / 2, y + 26, 2, x + w / 2, y + 26, 30);
      fg.addColorStop(0, accent); fg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = fg; c.globalAlpha = 0.6 + Math.sin(g.time * 7) * 0.15;
      c.fillRect(x + w / 2 - 30, y, 60, 50);
      c.globalAlpha = 1;
      c.fillStyle = '#120c0a'; c.fillRect(x + w / 2 - 14, y + 22, 28, 30);
      this.worldLabel(c, `⚒ ${loc.stationName || 'Forge'}`, x + w / 2, y - 22, accent);
    } else {
      // the colosseum: a ring of arches
      c.fillStyle = '#4a3e2c'; c.beginPath(); c.ellipse(x + w / 2, y + h / 2, w / 2 + 6, h / 2 + 4, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#5e4e38'; c.beginPath(); c.ellipse(x + w / 2, y + h / 2 - 6, w / 2, h / 2 - 6, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#2a2218';
      for (let k = 0; k < 7; k++) {
        const ax = x + 14 + k * ((w - 28) / 6);
        c.fillRect(ax - 5, y + h / 2 + 2, 10, 20);
      }
      c.fillStyle = '#05060a'; c.fillRect(x + w / 2 - 18, y + h - 36, 36, 36);
      this.worldLabel(c, 'Colosseum  ·  Wave Trials', x + w / 2, y - 8, PAL.mpCharge);
    }
    c.restore();
  }

  private worldLabel(c: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
    c.save();
    c.font = '700 11px ui-monospace, Menlo, Consolas, monospace';
    c.textAlign = 'center';
    const w = c.measureText(text).width + 14;
    c.fillStyle = 'rgba(6,8,14,0.75)';
    this.roundRect(c, x - w / 2, y - 13, w, 18, 5); c.fill();
    c.fillStyle = color;
    c.fillText(text, x, y);
    c.restore();
  }

  /* ----------------------------------------------------------- rooms */

  /** A dungeon room or the colosseum: the fixed arena with its walls, door and props. */
  private drawRoom(c: CanvasRenderingContext2D, g: Game) {
    const a = g.arena;
    const trial = g.screen === 'trial';
    const look = trial ? locById(HUB_ID).look : g.place.look;
    c.fillStyle = trial ? '#1a150e' : '#07080d';
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    if (trial) {
      // the stands, full of a restless crowd
      for (let r = 0; r < 4; r++) for (let k = 0; k < 60; k++) {
        c.fillStyle = (k + r) % 3 ? '#3a2e20' : '#4a3a28';
        const bob = Math.sin(g.time * 6 + k * 1.7 + r) * (g.enemies.length ? 1.5 : 0.4);
        c.fillRect(k * 16 + (r % 2) * 8, 12 + r * 16 + bob, 10, 10);
      }
    }
    // floor
    c.fillStyle = trial ? '#3a3020' : this.mix(look.floorAlt, '#000000', 0.25);
    c.fillRect(a.x, a.y, a.w, a.h);
    c.strokeStyle = trial ? '#46392a' : look.grid;
    c.lineWidth = 1;
    c.beginPath();
    for (let x = a.x; x <= a.x + a.w + 0.5; x += 60) { c.moveTo(x, a.y); c.lineTo(x, a.y + a.h); }
    for (let y = a.y; y <= a.y + a.h + 0.5; y += 60) { c.moveTo(a.x, y); c.lineTo(a.x + a.w, y); }
    c.stroke();

    // walls
    const wall = trial ? '#2a2016' : '#171922';
    c.fillStyle = wall;
    c.fillRect(a.x - 24, a.y - 24, a.w + 48, 24);
    c.fillRect(a.x - 24, a.y + a.h, a.w + 48, 24);
    c.fillRect(a.x - 24, a.y, 24, a.h);
    c.fillRect(a.x + a.w, a.y, 24, a.h);
    c.strokeStyle = this.alpha(look.accent, 0.35);
    c.lineWidth = 2;
    c.strokeRect(a.x, a.y, a.w, a.h);

    if (!trial && g.dungeon) {
      // torches along the top wall
      for (let k = 0; k < 6; k++) {
        const tx = a.x + 70 + k * ((a.w - 140) / 5);
        const fl = Math.sin(g.time * 12 + k * 2) * 2;
        const tg = c.createRadialGradient(tx, a.y - 8, 1, tx, a.y - 8, 26);
        tg.addColorStop(0, look.accent); tg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = tg; c.globalAlpha = 0.5; c.fillRect(tx - 26, a.y - 34, 52, 52); c.globalAlpha = 1;
        c.fillStyle = look.accent; c.beginPath(); c.arc(tx, a.y - 12 + fl * 0.3, 4, 0, Math.PI * 2); c.fill();
      }
      this.drawRoomDoor(c, g);
      for (const pr of g.props) this.drawProp(c, g, pr);
    }
  }

  /** The east door: barred while the room is live, open once it is clear. */
  private drawRoomDoor(c: CanvasRenderingContext2D, g: Game) {
    const run = g.dungeon!;
    const a = g.arena;
    const dy = a.y + a.h / 2 - ROOM_DOOR.h / 2;
    const dx = a.x + a.w;
    c.fillStyle = '#020306';
    c.fillRect(dx, dy, 24, ROOM_DOOR.h);
    if (!run.doorOpen) {
      c.fillStyle = '#6a6e7e';
      for (let k = 0; k < 5; k++) c.fillRect(dx + 2, dy + 6 + k * 19, 20, 5);
    } else {
      const exit = g.nextRoom() < 0;
      c.fillStyle = this.alpha(g.place.look.accent, 0.35 + Math.sin(g.time * 4) * 0.15);
      c.fillRect(dx, dy, 24, ROOM_DOOR.h);
      c.save();
      c.font = '800 11px ui-monospace, Menlo, Consolas, monospace';
      c.textAlign = 'right';
      c.fillStyle = g.place.look.accent;
      c.fillText(exit ? 'EXIT →' : '→', dx - 8, dy + ROOM_DOOR.h / 2 + 4);
      c.restore();
    }
  }

  /** Waystones in the hall; altars in a beaten boss's room. */
  private drawProp(c: CanvasRenderingContext2D, g: Game, pr: RoomProp) {
    c.save();
    const near = dist(g.player.x, g.player.y, pr.x, pr.y) < 60;
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath(); c.ellipse(pr.x, pr.y + 4, 22, 8, 0, 0, Math.PI * 2); c.fill();
    if (pr.kind === 'waystone') {
      c.fillStyle = '#3a3e4e';
      c.beginPath(); c.moveTo(pr.x - 12, pr.y); c.lineTo(pr.x - 8, pr.y - 50); c.lineTo(pr.x, pr.y - 58); c.lineTo(pr.x + 8, pr.y - 50); c.lineTo(pr.x + 12, pr.y); c.fill();
      c.fillStyle = pr.color; c.globalAlpha = 0.6 + Math.sin(g.time * 3 + pr.x) * 0.3;
      c.beginPath(); c.arc(pr.x, pr.y - 32, 5, 0, Math.PI * 2); c.fill();
    } else {
      c.fillStyle = '#34303c'; c.fillRect(pr.x - 18, pr.y - 22, 36, 22);
      c.fillStyle = '#48424f'; c.fillRect(pr.x - 22, pr.y - 28, 44, 8);
      const fl = Math.sin(g.time * 10 + pr.x) * 2;
      c.fillStyle = pr.color; c.globalAlpha = 0.85;
      c.beginPath(); c.moveTo(pr.x - 8, pr.y - 28); c.quadraticCurveTo(pr.x, pr.y - 52 - fl, pr.x + 8, pr.y - 28); c.fill();
    }
    c.globalAlpha = 1;
    c.font = '700 10px ui-monospace, Menlo, Consolas, monospace';
    c.textAlign = 'center';
    c.fillStyle = near ? '#ffffff' : pr.color;
    c.fillText(pr.label, pr.x, pr.y + 20);
    c.restore();
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

  private bladeGeom(c: CanvasRenderingContext2D, p: Player, len: number) {
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
    const body = flash ? '#ffffff' : (telegraphing ? this.mix(d.color, d.accent, 0.45 + Math.sin(g.time * 26) * 0.25) : d.color);

    if (e.boss && !dying) {
      // a slow-pulsing aura so a boss reads at a glance in a crowd
      const ag = c.createRadialGradient(0, -d.height * 0.5, 4, 0, -d.height * 0.5, d.radius * 2.2);
      ag.addColorStop(0, e.superboss ? 'rgba(255,213,74,0.45)' : this.alpha(d.accent, 0.35));
      ag.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = ag;
      c.globalAlpha = fade * (0.7 + Math.sin(g.time * 3) * 0.2);
      c.beginPath(); c.arc(0, -d.height * 0.5, d.radius * 2.2, 0, Math.PI * 2); c.fill();
      c.globalAlpha = fade;
    }

    switch (d.ai) {
      case 'grunt': this.drawGrunt(c, e, body, flash ? '#fff' : d.accent, g); break;
      case 'bruiser': this.drawBruiser(c, e, body, flash ? '#fff' : d.accent); break;
      case 'caster': this.drawCaster(c, e, body, flash ? '#fff' : d.accent, g); break;
      case 'flyer': this.drawFlyer(c, e, body, flash ? '#fff' : d.accent, g); break;
    }

    if (e.boss && !dying) {
      // the crown: three points, gold on an Ascendant
      const h = d.height + (d.ai === 'grunt' ? 20 : 8);
      c.fillStyle = e.superboss ? '#ffd54a' : d.accent;
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
    if (e.hp >= e.maxHp && e.state !== 'stagger') return;
    const w = Math.max(26, e.radius * 2.4);
    const top = ey - e.def.height - 20;
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(ex - w / 2 - 1, top - 1, w + 2, 5);
    c.fillStyle = e.state === 'stagger' ? '#ffd54a' : '#ff6b6b';
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
    const e = g.battle?.bossEnemy;
    if (!e || !e.alive) return;
    const b = e.boss!;
    const w = 460, x = (VIEW_W - w) / 2, y = VIEW_H - 40;
    c.save();
    c.textAlign = 'center';
    c.font = '800 14px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = e.superboss ? '#ffd54a' : b.accent;
    c.fillText((e.superboss ? ascendantName(b) : b.name).toUpperCase() + (e.enraged ? '  —  ENRAGED' : ''), VIEW_W / 2, y - 8);
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
    const p = g.player;

    // ---- top-left: level, HP, MP
    const x = 18, y = 18;
    c.save();
    c.font = '700 13px ui-monospace, Menlo, Consolas, monospace';
    c.textAlign = 'left';

    c.fillStyle = PAL.text;
    c.fillText(`Lv ${p.level}`, x, y + 10);

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

    // EXP
    const need = expToNext(p.level);
    const ratio = p.level >= MAX_LEVEL ? 1 : clamp(p.exp / need, 0, 1);
    this.bar(c, x + 52, y + 31, barW * 0.8, 5, ratio, PAL.exp, 'rgba(0,0,0,0.5)');
    c.fillStyle = PAL.dim;
    c.font = '600 10px ui-monospace, Menlo, Consolas, monospace';
    c.fillText(p.level >= MAX_LEVEL ? 'MAX' : `EXP ${p.exp}/${need}`, x + 52 + barW * 0.8 + 8, y + 35.5);
    c.restore();

    // ---- top-right: where you are and what is happening
    c.save();
    c.textAlign = 'right';
    const scene = g.scene();
    if (g.screen === 'trial' && g.battle) {
      c.font = '800 20px ui-monospace, Menlo, Consolas, monospace';
      c.fillStyle = PAL.text;
      c.fillText(`WAVE ${g.wave}`, VIEW_W - 18, 32);
      c.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
      c.fillStyle = PAL.dim;
      c.fillText(`trial tier ${g.battle.tier}   best ${g.world.trialBest[g.battle.tier] || 1}   enemies ${g.enemies.filter((e) => e.alive).length}`, VIEW_W - 18, 50);
      c.font = '700 11px ui-monospace, Menlo, Consolas, monospace';
      c.fillStyle = PAL.mpCharge;
      c.fillText('THE COLOSSEUM', VIEW_W - 18, 66);
    } else if (g.screen === 'dungeon' && g.dungeon) {
      const run = g.dungeon;
      const room = run.rooms[run.index];
      c.font = '800 16px ui-monospace, Menlo, Consolas, monospace';
      c.fillStyle = scene.look.accent;
      c.fillText(`${scene.name.toUpperCase()} DUNGEON`, VIEW_W - 18, 30);
      c.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
      c.fillStyle = PAL.dim;
      const bossesLeft = scene.bosses.filter((b) => !bossDefeated(g.world, b.id)).length;
      c.fillText(room.kind === 'hall' ? `entrance hall  ·  ${bossesLeft} boss${bossesLeft === 1 ? '' : 'es'} remain`
        : `room ${run.index}/${run.rooms.length - 1}  ·  ${room.kind === 'boss' ? 'boss' : `toward ${scene.bosses[room.section].name}`}`, VIEW_W - 18, 48);
    } else {
      c.font = '800 18px ui-monospace, Menlo, Consolas, monospace';
      c.fillStyle = scene.look.accent;
      c.fillText(scene.name.toUpperCase(), VIEW_W - 18, 30);
      c.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
      c.fillStyle = PAL.dim;
      c.fillText(scene.tier ? `tier ${scene.tier}  ·  recommended Lv ${recommendedLevel(scene)}` : 'safe ground', VIEW_W - 18, 48);
      this.drawMinimap(c, g, VIEW_W - 18 - 110, 58, 110);
    }
    c.restore();

    // equipped gear, small, under the bars
    c.save();
    c.font = '600 10px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.dim;
    c.fillText(`${p.weapon.name}  ·  ${p.armor.name}`, 18, 76);
    if (g.apFree() > 0) {
      c.fillStyle = PAL.mpCharge;
      c.font = '700 11px ui-monospace, Menlo, Consolas, monospace';
      c.fillText(`${g.apFree()} AP unspent — ${IS_TOUCH ? 'MENU' : 'TAB'}`, 18, 92);
    }
    c.restore();

    if (!IS_TOUCH && g.inCombat()) this.drawCommandMenu(c, g);
    if (g.inRoom() && p.alive) this.drawBackButton(c, g);
    if (g.screen === 'dungeon') this.drawBossBar(c, g);
    if (g.prompt && p.alive && !g.menuOpen) this.drawPrompt(c, g);
    if (g.screen === 'world' && p.alive && !g.menuOpen) {
      c.save();
      c.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
      c.fillStyle = PAL.mpCharge;
      c.fillText(this.clip(c, nextObjective(g.world), 300), 18, 110);
      c.restore();
    }

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

    if (g.waveIntro > 0 && p.alive && g.inCombat()) this.drawGrace(c, g);
    if (IS_TOUCH && g.inCombat() && !g.menuOpen && p.alive) this.drawTouch(c, g);
    if (!p.alive) this.drawGameOver(c, g);
    if (g.paused) this.drawPause(c);
    if (g.menuOpen) this.drawBigMenu(c, g);
  }

  /** The minimap: the region grid, what you have found, and where you are. */
  private drawMinimap(c: CanvasRenderingContext2D, g: Game, x: number, y: number, w: number) {
    const cw = w / GRID_W, ch = cw * (REG_H / REG_W);
    c.save();
    c.fillStyle = 'rgba(6,8,14,0.7)';
    this.roundRect(c, x - 4, y - 4, w + 8, ch * GRID_H + 8, 5); c.fill();
    for (let ry = 0; ry < GRID_H; ry++) for (let rx = 0; rx < GRID_W; rx++) {
      const id = REGION_GRID[ry][rx];
      if (!id) continue;
      const known = g.world.discoveredLocations.has(id);
      const open = g.world.unlockedAreas.has(id);
      c.fillStyle = !open ? '#262a38' : known ? this.alpha(locById(id).look.accent, 0.55) : 'rgba(120,130,160,0.25)';
      c.fillRect(x + rx * cw + 1, y + ry * ch + 1, cw - 2, ch - 2);
    }
    c.fillStyle = '#ffffff';
    const px = x + (g.player.x / WORLD_PW) * w, py = y + (g.player.y / WORLD_PH) * ch * GRID_H;
    c.beginPath(); c.arc(px, py, 2.5 + Math.sin(g.time * 6) * 0.6, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  /** "ENTER: go in" — the thing you are standing at. Tappable on a phone. */
  private drawPrompt(c: CanvasRenderingContext2D, g: Game) {
    const pr = g.prompt!;
    const B = PROMPT_BTN;
    c.save();
    c.fillStyle = 'rgba(10,14,28,0.9)';
    this.roundRect(c, B.x, B.y, B.w, B.h, 8); c.fill();
    c.strokeStyle = pr.color; c.lineWidth = 1.5;
    this.roundRect(c, B.x, B.y, B.w, B.h, 8); c.stroke();
    c.textAlign = 'center';
    c.font = '800 13px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = pr.color;
    c.fillText(this.clip(c, `${IS_TOUCH ? '' : 'ENTER  '}${pr.label}`, B.w - 20), B.x + B.w / 2, B.y + (pr.sub ? 17 : 25));
    if (pr.sub) {
      c.font = '600 10px ui-monospace, Menlo, Consolas, monospace';
      c.fillStyle = PAL.dim;
      c.fillText(this.clip(c, pr.sub, B.w - 20), B.x + B.w / 2, B.y + 32);
    }
    c.restore();
  }

  /** B on the keyboard, or this button: leave a dungeon or the colosseum. */
  private drawBackButton(c: CanvasRenderingContext2D, g: Game) {
    if (g.battleOver > 0) return;
    const B = BACK_BTN;
    c.save();
    c.fillStyle = 'rgba(20,24,44,0.8)';
    this.roundRect(c, B.x, B.y, B.w, B.h, 6); c.fill();
    c.strokeStyle = 'rgba(160,190,255,0.45)';
    c.lineWidth = 1.2;
    this.roundRect(c, B.x, B.y, B.w, B.h, 6); c.stroke();
    c.font = '700 11px ui-monospace, Menlo, Consolas, monospace';
    c.textAlign = 'center';
    c.fillStyle = '#cfe0ff';
    c.fillText(`${IS_TOUCH ? '' : 'B  '}LEAVE`, B.x + B.w / 2, B.y + 17);
    c.restore();
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
      const cp = g.world.checkpoint;
      c.fillText(`Level ${g.player.level}  ·  you will wake at your checkpoint in ${locById(regionAtPx(cp.x, cp.y) || HUB_ID).name}`, VIEW_W / 2, VIEW_H / 2 + 14);
      c.fillStyle = PAL.dim;
      c.fillText(IS_TOUCH ? 'Tap to continue — you keep everything.'
                          : 'Press R to continue — you keep everything.', VIEW_W / 2, VIEW_H / 2 + 40);
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

    const tabs = ['GEAR', g.atStation() ? 'FORGE' : 'RECIPES', 'TALENTS', 'STATUS', 'MAP'];
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

    // AP badge
    const ap = g.apFree();
    c.textAlign = 'right';
    c.fillStyle = ap > 0 ? PAL.mpCharge : PAL.dim;
    c.font = '800 14px ui-monospace, Menlo, Consolas, monospace';
    c.fillText(`AP ${ap}`, VIEW_W - 26, 38);
    c.textAlign = 'left';

    const top = MENU_LIST.y;
    if (g.menuTab === 0) this.drawGearTab(c, g, top);
    else if (g.menuTab === 1) this.drawSynthTab(c, g, top);
    else if (g.menuTab === 2) this.drawTalentTab(c, g, top);
    else if (g.menuTab === 3) this.drawStatusTab(c, g, top);
    else this.drawMapTab(c, g, top);
    void g.forgeOpen;

    c.fillStyle = PAL.dim;
    c.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
    c.fillText(IS_TOUCH
      ? 'tap a tab  ·  tap a row to select, tap again to confirm  ·  \u2715 to close'
      : g.menuTab === 4 ? '1-5 tabs  ·  arrows move between regions  ·  TAB or ESC close'
      : '1-5 tabs  ·  \u2190\u2192 switch  ·  \u2191\u2193 select  ·  ENTER confirm  ·  TAB or ESC close',
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
    const station = g.atStation();
    const accent = station ? g.place.look.accent : 'rgba(120,150,220,0.28)';
    this.listBox(c, 26, top, lw, VIEW_H - top - 46);
    if (station) {
      c.strokeStyle = accent; c.lineWidth = 2;
      this.roundRect(c, 26, top, lw, VIEW_H - top - 46, 8); c.stroke();
    }
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
    // the station banner: where you are forging, or that you are not at one
    c.font = '800 13px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = station ? accent : '#ff9d9d';
    c.fillText(station ? `\u2692 ${(g.place.stationName || 'Forge').toUpperCase()}  ·  ${g.place.name}`
      : 'NO FORGE HERE — recipes are read-only', dx + 16, y);
    y += 17;
    c.font = '500 11px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.dim;
    c.fillText(this.clip(c, station ? (STATION_FLAVOR[g.place.id] || '') : 'Stations: ' + LOCATION_LIST.filter((l) => l.hasCraftingStation).map((l) => l.name).join(', '), dw - 32), dx + 16, y);
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
      c.fillText(MATS[k].name + (BOSS_MATS.includes(k) ? (k === 'star' ? '  (superboss)' : '  (boss)') : ''), dx + 32, y);
      c.textAlign = 'right';
      c.fillStyle = has >= need ? '#69e29a' : '#ff6b6b';
      c.fillText(`${has} / ${need}`, dx + dw - 16, y);
      c.textAlign = 'left';
      y += 20;
    }
    c.fillStyle = sel.state === 'ready' && station ? PAL.mpCharge : PAL.dim;
    c.font = '700 12px ui-monospace, Menlo, Consolas, monospace';
    c.fillText(!station ? 'Forge at the Haven or any station on the map'
      : sel.state === 'ready' ? `${IS_TOUCH ? 'Tap again' : 'ENTER'} to forge and equip`
      : sel.state === 'owned' ? 'Already yours — equip it from GEAR' : 'Keep hunting materials', dx + 16, VIEW_H - 62);
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
    c.fillText(owned ? 'LEARNED' : `${t.cost} AP  ·  ENTER to learn`, VIEW_W - 42, y + 27);
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
    c.fillText(`Level ${p.level}`, 42, y);
    y += 24;
    const s = p.stats;
    const rows: [string, string][] = [
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
    c.fillText('* boss drops only', mx + 16, my + 4);
  }

  private drawMapTab(c: CanvasRenderingContext2D, g: Game, top: number) {
    const w = g.world;
    const M = MAP_BOX;
    this.listBox(c, M.x, M.y, M.w, M.h);
    void top;

    for (let i = 0; i < REGION_IDS.length; i++) {
      const id = REGION_IDS[i];
      const l = locById(id);
      const r = mapRect(id);
      const open = w.unlockedAreas.has(id);
      const known = w.discoveredLocations.has(id);
      const beaten = l.bosses.filter((b) => bossDefeated(w, b.id)).length;
      c.save();
      c.fillStyle = !open ? '#1c1f2c' : this.alpha(l.look.accent, known ? 0.28 : 0.1);
      this.roundRect(c, r.x, r.y, r.w, r.h, 6); c.fill();
      c.strokeStyle = i === g.mapIndex ? '#ffffff' : open ? this.alpha(l.look.accent, 0.6) : 'rgba(90,100,140,0.3)';
      c.lineWidth = i === g.mapIndex ? 2.5 : 1.2;
      if (!open) c.setLineDash([4, 5]);
      this.roundRect(c, r.x, r.y, r.w, r.h, 6); c.stroke();
      c.setLineDash([]);
      c.textAlign = 'center';
      c.font = '700 11px ui-monospace, Menlo, Consolas, monospace';
      c.fillStyle = open ? PAL.text : '#5d6480';
      c.fillText(this.clip(c, known || open ? l.name : '? ? ?', r.w - 10), r.x + r.w / 2, r.y + r.h / 2 - 6);
      c.font = '600 10px ui-monospace, Menlo, Consolas, monospace';
      c.fillStyle = PAL.dim;
      const tags = [l.tier ? `T${l.tier}` : 'Haven'];
      if (l.bosses.length && open) tags.push(`${beaten}/${l.bosses.length}`);
      if (l.hasCraftingStation) tags.push('⚒');
      if (!open) tags.push('sealed');
      c.fillText(tags.join('  '), r.x + r.w / 2, r.y + r.h / 2 + 10);
      c.restore();
    }
    // you are here
    const gx = M.x + 12, gy = M.y + 12, gw = M.w - 24, gh = M.h - 24;
    const px = gx + (g.player.x / WORLD_PW) * gw, py = gy + (g.player.y / WORLD_PH) * gh;
    c.fillStyle = PAL.mpCharge;
    c.beginPath(); c.arc(px, py, 5 + Math.sin(g.time * 5), 0, Math.PI * 2); c.fill();

    // detail panel
    const dx = M.x + M.w + 14;
    const dw = VIEW_W - dx - 26;
    this.listBox(c, dx, M.y, dw, M.h);
    const l = locById(REGION_IDS[g.mapIndex]);
    const open = w.unlockedAreas.has(l.id);
    const known = w.discoveredLocations.has(l.id);
    let y = M.y + 26;
    c.font = '800 16px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = open ? l.look.accent : '#5d6480';
    c.fillText(this.clip(c, known || open ? l.name : 'Unknown region', dw - 32), dx + 16, y);
    y += 18;
    c.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.dim;
    c.fillText(l.tier ? `${l.theme}  ·  tier ${l.tier}  ·  Lv ${l.enemyLevelRange[0]}-${l.enemyLevelRange[1]}` : 'Haven  ·  safe', dx + 16, y);
    y += 22;
    c.font = '500 11px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.text;
    for (const line of this.wrap(c, open ? l.description : lockedAreaText(l.id), dw - 32).slice(0, 4)) {
      c.fillText(line, dx + 16, y); y += 15;
    }
    y += 8;
    const rows: [string, string][] = [];
    if (l.tier) rows.push(['Recommended', `Lv ${recommendedLevel(l)}`]);
    rows.push(['Forge', l.hasCraftingStation ? (l.stationName || 'yes') : '-']);
    if (l.tier) rows.push(['Foes', l.enemyTypes.map((id) => ENEMIES[id].name).join(', ')]);
    if (l.tier === 0) rows.push(['Colosseum', 'Wave Trials']);
    c.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
    for (const [k, v] of rows) {
      c.fillStyle = PAL.dim; c.fillText(k, dx + 16, y);
      c.fillStyle = PAL.text; c.textAlign = 'right';
      c.fillText(this.clip(c, v, dw - 120), dx + dw - 16, y);
      c.textAlign = 'left';
      y += 17;
    }
    if (open && l.bosses.length) {
      y += 6;
      c.fillStyle = PAL.dim;
      c.fillText('DUNGEON BOSSES, IN ORDER', dx + 16, y); y += 16;
      for (const b of l.bosses) {
        const done = bossDefeated(w, b.id);
        const sup = superDefeated(w, b.id);
        c.fillStyle = done ? '#69e29a' : PAL.text;
        c.fillText(`${done ? '✓' : '·'} ${b.name}${sup ? ' ★' : ''}`, dx + 16, y);
        y += 15;
      }
    }
    c.font = '700 12px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.dim;
    c.fillText(l.id === w.currentLocation ? 'You are here' : !open ? 'Sealed by a barrier' : 'Walk there', dx + 16, M.y + M.h - 14);
  }

  /** Greedy word wrap to `w` pixels in the current font. */
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
    const w1 = 'AERIAL ', w2 = 'FINISHER';
    const m1 = c.measureText(w1).width, m2 = c.measureText(w2).width;
    const wx = (VIEW_W - (m1 + m2)) / 2;
    c.fillStyle = PAL.text;
    c.fillText(w1, wx, 168);
    c.fillStyle = PAL.mpCharge;
    c.fillText(w2, wx + m1, 168);

    c.textAlign = 'center';
    c.font = '600 13px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.dim;
    c.fillText('an open world  ·  12 dungeons  ·  30 bosses  ·  forges  ·  Lv 1-100', VIEW_W / 2, 198);

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
      } else {
        c.fillText(rows[i], VIEW_W / 2, y + 26);
      }
    }

    c.font = '600 12px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = PAL.dim;
    if (g.titleMode === 'options') {
      c.fillText(IS_TOUCH ? 'tap either side of a bar to adjust' : '\u2190 \u2192 to adjust  ·  ESC to go back', VIEW_W / 2, VIEW_H - 46);
    } else if (g.hasSave()) {
      c.fillText(`Level ${g.player.level}  ·  ${g.place.name}  ·  ${g.world.completedBosses.size}/${ALL_BOSSES.length} bosses  ·  ${g.player.weapon.name} / ${g.player.armor.name}`, VIEW_W / 2, VIEW_H - 62);
      c.fillStyle = '#ff9d9d';
      c.fillText('New Game wipes that progress.', VIEW_W / 2, VIEW_H - 44);
    } else {
      c.fillText(IS_TOUCH ? 'tap an option to begin' : 'arrow keys and ENTER, or click', VIEW_W / 2, VIEW_H - 46);
    }
    c.textAlign = 'left';
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
        ['Menu', 'the icon on the right: gear, forge, talents, map'],
        ['Use / Leave', 'tap the prompt at a door  ·  LEAVE button inside'],
      ]
      : [
        ['Move', 'W A S D'],
        ['Attack / Jump', 'J  ·  K or Space'],
        ['Dash / Lock-on', 'Shift  ·  L'],
        ['Magic', '1 Fire  2 Blizzard  3 Thunder  4 Cure'],
        ['Menu', 'Tab for gear, forge, talents, status and the world map'],
        ['Use / Leave', 'ENTER at a door or forge  ·  B leaves a dungeon'],
        ['Potion / Pause', 'Q  ·  P'],
        ['Tuning panel', '` opens every combat constant as a live slider'],
      ];

    const rules: string[] = [
      'Walk the open world. Enemies roam each region and chase you when you',
      'get close. Glowing barriers seal regions you have not opened yet.',
      'Each region has a dungeon: rooms lock until you clear them, and its',
      'bosses wait in order. Its last boss breaks the barrier to the next region.',
      'Towns have forges (heal, restock, craft any recipe). Towns and dungeon',
      'doors are checkpoints. The Haven colosseum runs endless Wave Trials.',
      'Dying loses nothing. Stand at a door and press ENTER to go in; B leaves.',
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

  private hex(h: string): [number, number, number] {
    const s = h.replace('#', '');
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }
}
