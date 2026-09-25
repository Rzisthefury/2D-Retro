/* =========================================================================
 * entities.ts — player, enemies, projectiles, and damage resolution.
 * The world is 2.5D: x/y is the ground plane, z is height above it.
 * ========================================================================= */

const Z_TOLERANCE = 48; // how much height difference a melee swing forgives

interface DamageResult { dmg: number; crit: boolean; }

function physDamage(power: number, str: number, def: number): DamageResult {
  const base = power * (1 + str / 12) * (60 / (60 + Math.max(0, def)));
  const v = 1 + rnd(-TUNING.variance, TUNING.variance);
  const crit = Math.random() < TUNING.critChance;
  const dmg = Math.max(1, Math.round(base * v * (crit ? TUNING.critMult : 1)));
  return { dmg, crit };
}

function magicDamage(power: number, mag: number, mres: number): DamageResult {
  const base = power * (1 + mag / 10) * (60 / (60 + Math.max(0, mres))) * TUNING.spellPowerMult;
  const v = 1 + rnd(-TUNING.variance, TUNING.variance);
  const crit = Math.random() < TUNING.critChance * 0.5;
  const dmg = Math.max(1, Math.round(base * v * (crit ? TUNING.critMult : 1)));
  return { dmg, crit };
}

/** True if `t` sits inside the swept arc in front of `a`. */
function inArc(
  ax: number, ay: number, az: number, facing: number,
  range: number, arc: number,
  tx: number, ty: number, tz: number, tr: number,
): boolean {
  const d = dist(ax, ay, tx, ty);
  if (d > range + tr) return false;
  if (Math.abs(az - tz) > Z_TOLERANCE) return false;
  if (d < 6) return true;
  const ang = Math.atan2(ty - ay, tx - ax);
  return Math.abs(angleDiff(facing, ang)) <= arc;
}

/* ---------------------------------------------------------------- player */

type PState = 'idle' | 'attack' | 'cast' | 'hurt' | 'dead' | 'dash';

class Player {
  x = VIEW_W / 2; y = VIEW_H / 2 + 40; z = 0;
  vx = 0; vy = 0; vz = 0;
  facing = -Math.PI / 2;
  radius = 15;
  height = 40;

  state: PState = 'idle';
  stateFrame = 0;

  grounded = true;
  jumps = 0;
  maxJumps = 2;

  // combat
  attackDef: AttackDef | null = null;
  attackPhase: 'startup' | 'active' | 'recovery' = 'startup';
  attackFrame = 0;
  attackHits = new Set<Enemy>();
  comboIndex = 0;
  comboAir = false;
  comboTimer = 0;
  lungeVX = 0; lungeVY = 0;
  iframes = 0;
  hitstun = 0;
  queuedAttack = -1;   // frame the next swing was requested on, -1 = nothing queued
  queuedJump = -1;

  // dash
  dashCharges = 1;
  dashCd = 0;
  dashRe = 0;
  dashFrame = 0;
  dashVX = 1; dashVY = 0;

  // equipment and build
  weapon: WeaponDef = WEAPONS[0];
  armor: ArmorDef = ARMORS[0];
  talents: TalentSet = {};
  ownedWeapons: string[] = ['w1'];
  ownedArmors: string[] = ['a1'];
  inv: Inventory = {};
  secondWindUsed = false;

  // magic
  spell: SpellDef | null = null;
  charging = false;
  chargeT = 0;

  // resources
  level = 1;
  exp = 0;
  stats: Stats = statsForLevel(1);
  hp = this.stats.maxHp;
  mp = this.stats.maxMp;
  potions = 3;
  ethers = 2;

  lock: Enemy | null = null;

  // presentation
  flash = 0;
  swingT = 0;
  landSquash = 0;

  get alive() { return this.state !== 'dead'; }

  refreshStats(full: boolean) {
    const prev = this.stats;
    const s = statsForLevel(this.level);
    s.maxHp = Math.round((s.maxHp + this.armor.hpBonus) * (this.hasT('vitality') ? 1.2 : 1));
    s.mres += this.armor.mresBonus;
    s.mag += this.weapon.magBonus;
    this.stats = s;
    if (full) { this.hp = this.stats.maxHp; this.mp = this.stats.maxMp; this.charging = false; }
    else {
      this.hp = clamp(this.hp + (this.stats.maxHp - prev.maxHp), 1, this.stats.maxHp);
      this.mp = Math.min(this.stats.maxMp, this.mp + Math.max(0, this.stats.maxMp - prev.maxMp));
    }
  }

  hasT(id: string): boolean { return !!this.talents[id]; }

  /** Fraction of incoming damage removed by armour and Iron Skin. */
  dr(): number {
    return clamp(this.armor.dr + (this.hasT('ironskin') ? 0.08 : 0), 0, 0.55);
  }

  /** Every hitbox is measured with the equipped weapon's reach folded in. */
  reach(def: AttackDef): number { return def.range + this.weapon.rangeBonus; }

  maxDash(): number { return this.hasT('airdash') ? 2 : 1; }

  /** The ground string, grown by talents, ending in whichever finisher is unlocked. */
  groundTable(): AttackDef[] {
    const t: AttackDef[] = [GROUND_COMBO[0], GROUND_COMBO[1], GROUND_COMBO[2]];
    if (this.hasT('combo4')) t.push(COMBO_EXTRA[0]);
    if (this.hasT('combo5')) t.push(COMBO_EXTRA[1]);
    t.push(this.hasT('tempest') ? WHIRL_BIG : this.hasT('whirl') ? WHIRL : GROUND_COMBO[3]);
    return t;
  }

  airTable(): AttackDef[] {
    const t: AttackDef[] = [AIR_COMBO[0], AIR_COMBO[1]];
    if (this.hasT('aerial')) t.push(AIR_EXTRA);
    t.push(AIR_COMBO[2]);
    return t;
  }

  /* ------------------------------------------------------------- update */

  update(g: Game, dt: number) {
    if (this.state === 'dead') { this.decayFx(); return; }

    if (this.iframes > 0) this.iframes--;
    if (this.dashCd > 0) this.dashCd--;
    if (this.dashCharges < this.maxDash()) {
      if (++this.dashRe >= TUNING.dashRecharge) { this.dashRe = 0; this.dashCharges++; }
    } else this.dashRe = 0;
    if (this.comboTimer > 0 && --this.comboTimer === 0) { this.comboIndex = 0; }
    if (this.flash > 0) this.flash--;
    if (this.swingT > 0) this.swingT--;
    if (this.landSquash > 0) this.landSquash--;

    this.updateMp(dt);

    if (this.hitstun > 0) {
      this.hitstun--;
      if (this.hitstun === 0 && this.state === 'hurt') this.state = 'idle';
    }

    this.updateLock(g);

    // Dash is available from neutral AND out of attack recovery — the
    // dodge-cancel is most of why it feels good.
    if (this.state === 'idle' || this.state === 'attack') {
      if (g.input.consume('dash')) this.tryDash(g);
    }

    switch (this.state) {
      case 'idle': this.updateFree(g, dt); break;
      case 'attack': this.updateAttack(g, dt); break;
      case 'cast': this.updateCast(g, dt); break;
      case 'dash': this.updateDash(g, dt); break;
      case 'hurt': this.applyPhysics(g, dt, 0.86); break;
    }

    // Inputs that are legal from almost any state get buffered and retried.
    if (this.state === 'idle') this.pollActions(g);
  }

  private decayFx() {
    if (this.flash > 0) this.flash--;
  }

  private updateMp(dt: number) {
    if (!this.charging) return;
    this.chargeT += dt;
    const total = Math.max(0.2, TUNING.mpRechargeSeconds * (this.hasT('flow') ? 0.65 : 1));
    this.mp = clamp((this.chargeT / total) * this.stats.maxMp, 0, this.stats.maxMp);
    if (this.chargeT >= total) {
      this.charging = false;
      this.mp = this.stats.maxMp;
    }
  }

  private updateLock(g: Game) {
    if (this.lock && (!this.lock.alive)) this.lock = null;
    if (g.input.wasPressed('lock')) this.cycleLock(g);
    // On a phone there is no spare thumb for a lock-on button, so targeting
    // takes care of itself and re-acquires whenever the target dies.
    if (IS_TOUCH && !this.lock) this.lock = g.nearestEnemy(this.x, this.y, 460);
  }

  cycleLock(g: Game) {
    const live = g.enemies.filter((e) => e.alive);
    if (!live.length) { this.lock = null; return; }
    live.sort((a, b) => dist(this.x, this.y, a.x, a.y) - dist(this.x, this.y, b.x, b.y));
    if (!this.lock) { this.lock = live[0]; g.sfx.guard(); return; }
    const i = live.indexOf(this.lock);
    if (i === -1) { this.lock = live[0]; return; }
    // Cycling past the end releases the lock, same as tapping off in KH2.
    this.lock = i + 1 < live.length ? live[i + 1] : null;
  }

  private pollActions(g: Game) {
    if (g.input.consume('attack')) { this.startAttack(g); return; }
    if (g.input.consume('jump')) { this.doJump(g); return; }
  }

  private doJump(g: Game) {
    if (this.jumps >= this.maxJumps) return;
    this.vz = TUNING.jumpVel * (this.jumps === 0 ? 1 : 0.86);
    this.jumps++;
    this.grounded = false;
    g.sfx.jump();
  }

  tryDash(g: Game): boolean {
    if (!this.hasT('dash')) { g.toast('DASH NOT LEARNED'); return false; }
    if (!this.grounded && !this.hasT('airdash')) return false;
    if (this.dashCharges <= 0 || this.dashCd > 0) return false;

    const mv = g.input.moveVector();
    let ang = this.facing;
    if (mv.x || mv.y) ang = Math.atan2(mv.y, mv.x);
    else if (this.lock) ang = Math.atan2(this.lock.y - this.y, this.lock.x - this.x) + Math.PI;
    this.dashVX = Math.cos(ang);
    this.dashVY = Math.sin(ang);
    this.facing = ang;

    this.state = 'dash';
    this.dashFrame = 0;
    this.dashCharges--;
    this.dashCd = TUNING.dashCooldown;
    this.iframes = Math.max(this.iframes, TUNING.dashIframes);
    this.attackDef = null;
    this.queuedAttack = -1;
    this.vz = Math.max(this.vz, -30);
    g.sfx.jump();
    g.dashTrail(this);
    return true;
  }

  private updateDash(g: Game, dt: number) {
    this.dashFrame++;
    const n = Math.max(2, TUNING.dashFrames);
    const t = this.dashFrame / n;
    const sp = TUNING.dashSpeed * (1 - t * 0.62);
    this.vx = this.dashVX * sp;
    this.vy = this.dashVY * sp;
    if (!this.grounded) this.vz = Math.max(this.vz, -40); // air dash glides
    if (this.dashFrame % 2 === 0) g.dashTrail(this);
    if (this.dashFrame >= n) {
      this.state = 'idle';
      this.vx *= 0.35; this.vy *= 0.35;
      // buffered attack out of a dash starts a fresh combo
      if (g.input.consume('attack')) { this.comboIndex = 0; this.startAttack(g); return; }
    }
    this.applyPhysics(g, dt, 1);
  }

  /* ------------------------------------------------------- free movement */

  private updateFree(g: Game, dt: number) {
    const mv = g.input.moveVector();
    const speed = TUNING.moveSpeed;
    const ctrl = this.grounded ? 1 : TUNING.airControl;
    const targetVx = mv.x * speed;
    const targetVy = mv.y * speed;
    const accel = this.grounded ? 22 : 22 * ctrl;
    this.vx = lerp(this.vx, targetVx, clamp(accel * dt, 0, 1));
    this.vy = lerp(this.vy, targetVy, clamp(accel * dt, 0, 1));

    // Face movement, unless locked on — then keep the target in view.
    if (this.lock) {
      const want = Math.atan2(this.lock.y - this.y, this.lock.x - this.x);
      this.facing = angleLerp(this.facing, want, clamp(TUNING.turnRate * dt, 0, 1));
    } else if (mv.x || mv.y) {
      const want = Math.atan2(mv.y, mv.x);
      this.facing = angleLerp(this.facing, want, clamp(TUNING.turnRate * dt, 0, 1));
    }

    this.applyPhysics(g, dt, 1);
  }

  private applyPhysics(g: Game, dt: number, drag: number) {
    if (drag < 1) {
      this.vx *= Math.pow(drag, dt * 60);
      this.vy *= Math.pow(drag, dt * 60);
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Air attacks hang: reduced gravity while the swing is live.
    const floating = this.state === 'attack' && this.attackDef?.air && this.attackPhase !== 'recovery';
    this.vz -= TUNING.gravity * (floating ? 0.28 : 1) * dt;
    this.z += this.vz * dt;
    if (this.z <= 0) {
      if (!this.grounded && this.vz < -120) { this.landSquash = 8; }
      this.z = 0; this.vz = 0; this.grounded = true; this.jumps = 0;
      if (this.state === 'attack' && this.attackDef?.air && this.attackPhase === 'recovery') {
        // landing cancels aerial recovery — keeps the flow going
        this.attackFrame = Math.max(this.attackFrame, this.attackDef.recovery);
      }
    } else {
      this.grounded = false;
    }
    g.clampToArena(this);
  }

  /* -------------------------------------------------------------- attack */

  startAttack(g: Game) {
    const airborne = !this.grounded;
    if (this.comboIndex > 0 && this.comboAir !== airborne) this.comboIndex = 0;
    const table = airborne ? this.airTable() : this.groundTable();
    const def = table[Math.min(this.comboIndex, table.length - 1)];

    this.comboAir = airborne;
    this.queuedAttack = -1;
    this.queuedJump = -1;
    this.state = 'attack';
    this.attackDef = def;
    this.attackPhase = 'startup';
    this.attackFrame = 0;
    this.attackHits.clear();
    this.swingT = def.startup + def.active;

    if (def.radial) {
      // A spin has no front — stand your ground and let the ring do the work.
      this.lungeVX = 0; this.lungeVY = 0;
      g.sfx.swing();
      return;
    }

    // Lock-on homing: face the target and slide toward it during startup.
    const target = this.homingTarget(g);
    if (target) {
      const ang = Math.atan2(target.y - this.y, target.x - this.x);
      this.facing = ang;
      const d = dist(this.x, this.y, target.x, target.y);
      const need = Math.max(0, d - (this.reach(def) * 0.55 + target.radius));
      const closeSpeed = clamp(need / Math.max(1, def.startup * TICK), 0, 900);
      const lunge = (def.lunge + closeSpeed) * TUNING.lungeScale * TUNING.homingStrength;
      this.lungeVX = Math.cos(ang) * lunge;
      this.lungeVY = Math.sin(ang) * lunge;
      // Air finisher only spikes if there is something to spike.
      if (def.air && target.z > 20) this.vz = Math.max(this.vz, -40);
    } else {
      this.lungeVX = Math.cos(this.facing) * def.lunge * TUNING.lungeScale;
      this.lungeVY = Math.sin(this.facing) * def.lunge * TUNING.lungeScale;
    }
    g.sfx.swing();
  }

  private homingTarget(g: Game): Enemy | null {
    if (this.lock && this.lock.alive && dist(this.x, this.y, this.lock.x, this.lock.y) < TUNING.homingRange * 1.5) {
      return this.lock;
    }
    let best: Enemy | null = null;
    let bestScore = Infinity;
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const d = dist(this.x, this.y, e.x, e.y);
      if (d > TUNING.homingRange) continue;
      const ang = Math.atan2(e.y - this.y, e.x - this.x);
      const off = Math.abs(angleDiff(this.facing, ang));
      if (off > 1.5) continue;
      const score = d + off * 70;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  private updateAttack(g: Game, dt: number) {
    const def = this.attackDef!;
    this.attackFrame++;

    // A press at any point in the swing is remembered until the cancel window
    // opens. Without this, mashing at the wrong moment silently drops inputs.
    if (g.input.consume('attack')) this.queuedAttack = g.input.frame;
    if (g.input.consume('jump')) this.queuedJump = g.input.frame;
    const fresh = (f: number) => f >= 0 && g.input.frame - f <= TUNING.queueFrames;

    // Steer the swing: holding a direction turns you toward it mid-attack,
    // fast but not instantly, and the hitbox turns with you.
    const mv = g.input.moveVector();
    if (!def.radial && (mv.x || mv.y)) {
      const want = Math.atan2(mv.y, mv.x);
      this.facing = angleLerp(this.facing, want, clamp(TUNING.swingTurnRate * dt, 0, 1));
    }

    if (this.attackFrame <= def.startup) {
      this.attackPhase = 'startup';
      const t = this.attackFrame / def.startup;
      // the lunge follows wherever you are now facing
      const lunge = Math.hypot(this.lungeVX, this.lungeVY);
      this.vx = Math.cos(this.facing) * lunge * (1 - t * 0.5);
      this.vy = Math.sin(this.facing) * lunge * (1 - t * 0.5);
    } else if (this.attackFrame <= def.startup + def.active) {
      this.attackPhase = 'active';
      this.vx *= 0.82; this.vy *= 0.82;
      if (def.radial) {
        const into = this.attackFrame - def.startup;
        const per = Math.max(1, Math.floor(def.active / Math.max(1, def.ticks)));
        if ((into - 1) % per === 0) this.attackHits.clear();
        this.facing += def.spinRate;
        if (def.pull) {
          for (const e of g.enemies) {
            if (!e.alive) continue;
            const d = dist(this.x, this.y, e.x, e.y);
            if (d > this.reach(def) * 1.5 || d < 12) continue;
            const a = Math.atan2(this.y - e.y, this.x - e.x);
            e.x += Math.cos(a) * def.pull * dt;
            e.y += Math.sin(a) * def.pull * dt;
          }
        }
        if (this.attackFrame % 3 === 0) g.whirlFx(this, def);
      }
      this.resolveHits(g, def);
    } else {
      this.attackPhase = 'recovery';
      this.vx *= 0.9; this.vy *= 0.9;
      const intoRecovery = this.attackFrame - def.startup - def.active;

      // Cancel window: a queued attack chains into the next combo step.
      if (intoRecovery >= def.cancel && !def.finisher) {
        if (fresh(this.queuedAttack)) {
          this.comboIndex++;
          this.comboTimer = TUNING.comboResetFrames;
          this.startAttack(g);
          return;
        }
        if (fresh(this.queuedJump)) {
          this.queuedJump = -1;
          this.state = 'idle';
          this.attackDef = null;
          this.doJump(g);
          return;
        }
      }
      if (intoRecovery >= def.recovery) {
        this.state = 'idle';
        this.attackDef = null;
        if (def.finisher) { this.comboIndex = 0; this.comboTimer = 0; }
        else { this.comboIndex++; this.comboTimer = TUNING.comboResetFrames; }
        // Holding the button through a finisher rolls straight into a new combo.
        if (fresh(this.queuedAttack)) { this.startAttack(g); return; }
        if (fresh(this.queuedJump)) { this.queuedJump = -1; this.doJump(g); }
        this.queuedAttack = -1;
        this.queuedJump = -1;
      }
    }

    // Magic stays available mid-combo, like KH2's menu.
    this.pollMagic(g);
    this.applyPhysics(g, dt, 1);
  }

  private resolveHits(g: Game, def: AttackDef) {
    for (const e of g.enemies) {
      if (!e.alive || this.attackHits.has(e)) continue;
      if (!inArc(this.x, this.y, this.z, this.facing, this.reach(def), def.arc, e.x, e.y, e.z, e.radius)) continue;
      this.attackHits.add(e);
      g.hitEnemy(e, def, this);
    }
  }

  /* --------------------------------------------------------------- magic */

  pollMagic(g: Game) {
    const keys: Action[] = ['spell1', 'spell2', 'spell3', 'spell4'];
    for (let i = 0; i < keys.length; i++) {
      if (g.input.consume(keys[i])) { this.tryCast(g, SPELLS[i]); return; }
    }
    if (g.input.consume('item')) g.useItem();
  }

  canCast(s: SpellDef): boolean {
    if (this.charging || this.state === 'dead') return false;
    return s.drainAll ? this.mp > 0 : this.mp >= s.cost;
  }

  tryCast(g: Game, s: SpellDef): boolean {
    if (this.charging) { g.toast('MP CHARGING'); return false; }
    if (s.drainAll) {
      if (this.hasT('efficure')) {
        // Efficient Cure turns the all-or-nothing heal into a normal spell.
        const cost = Math.ceil(this.stats.maxMp * 0.45);
        if (this.mp < cost) { g.toast('NOT ENOUGH MP'); return false; }
        this.mp -= cost;
      } else {
        if (this.mp <= 0) { g.toast('NO MP'); return false; }
        this.mp = 0;
      }
    } else {
      if (this.mp < s.cost) { g.toast('NOT ENOUGH MP'); return false; }
      this.mp -= s.cost;
    }
    // KH2's model: the bar empties and then locks while it refills.
    if (this.mp <= 0.5) { this.mp = 0; this.charging = true; this.chargeT = 0; }
    this.state = 'cast';
    this.spell = s;
    this.stateFrame = 0;
    this.attackDef = null;
    if (this.lock) this.facing = Math.atan2(this.lock.y - this.y, this.lock.x - this.x);
    g.sfx.cast(s.id === 'cure' ? 600 : 340);
    return true;
  }

  private updateCast(g: Game, dt: number) {
    const s = this.spell!;
    this.stateFrame++;
    this.vx *= 0.84; this.vy *= 0.84;
    if (this.stateFrame === s.cast) g.fireSpell(s, this);
    const rec = s.recovery * (this.hasT('quickcast') ? 0.6 : 1);
    if (this.stateFrame >= s.cast + rec) {
      this.state = 'idle';
      this.spell = null;
    }
    this.applyPhysics(g, dt, 1);
  }

  /* ---------------------------------------------------------------- hurt */

  takeHit(g: Game, dmg: number, fromAngle: number, knockback: number, stun: number) {
    if (this.iframes > 0 || this.state === 'dead') return;
    dmg = Math.max(1, Math.round(dmg * (1 - this.dr())));
    this.hp -= dmg;
    this.flash = 8;
    this.iframes = TUNING.iframesOnHit;
    this.comboIndex = 0;
    this.attackDef = null;
    g.floatText(this.x, this.y, this.z + 30, String(dmg), PAL.danger, 20);
    g.shake(6 * TUNING.shakeScale);
    g.hitstop(4);
    g.sfx.hurt();
    if (this.hp <= 0 && this.hasT('secondwind') && !this.secondWindUsed) {
      this.secondWindUsed = true;
      this.hp = Math.round(this.stats.maxHp * 0.35);
      this.iframes = 80;
      this.state = 'hurt';
      this.hitstun = 18;
      g.floatText(this.x, this.y, this.z + 60, 'SECOND WIND', '#ffd54a', 18);
      g.ring(this.x, this.y, 0, 12, 160, '#ffd54a');
      g.shake(12); g.hitstop(10);
      g.sfx.levelUp();
      return;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'dead';
      this.vx = Math.cos(fromAngle) * 160;
      this.vy = Math.sin(fromAngle) * 160;
      g.onPlayerDeath();
      return;
    }
    this.state = 'hurt';
    this.hitstun = stun;
    this.vx = Math.cos(fromAngle) * knockback;
    this.vy = Math.sin(fromAngle) * knockback;
  }

  heal(g: Game, amount: number) {
    const before = this.hp;
    this.hp = Math.min(this.stats.maxHp, this.hp + amount);
    const gained = Math.round(this.hp - before);
    if (gained > 0) g.floatText(this.x, this.y, this.z + 40, '+' + gained, PAL.hp, 20);
  }
}

/* ---------------------------------------------------------------- enemy */

type EState = 'spawn' | 'idle' | 'chase' | 'reposition' | 'telegraph' | 'attack' | 'recover' | 'stagger' | 'dead' | 'special';

class Enemy {
  def: EnemyDef;
  x: number; y: number; z: number;
  vx = 0; vy = 0; vz = 0;
  facing = 0;
  radius: number;

  maxHp: number;
  hp: number;
  str: number;
  edef: number;
  mres: number;
  exp: number;
  speed: number;

  state: EState = 'spawn';
  stateFrame = 0;
  cooldown = 0;
  poise: number;
  maxPoise: number;
  poiseRegen = 0;
  hasHitThisSwing = false;

  flash = 0;
  guardFlash = 0;
  slow = 0;
  deathT = 0;
  wobble = Math.random() * Math.PI * 2;

  level: number;
  tier: number;

  // overworld: enemies idle near home until you come close, and give up
  // the chase if you drag them too far from it
  aggro = true;
  homeX = 0; homeY = 0;
  wanderX = 0; wanderY = 0;
  wanderT = 0;

  // bosses only: the signature-move state machine layered on the base AI
  boss: BossDefinition | null = null;
  superboss = false;
  move: BossMove | null = null;
  moveFrame = 0;
  moveStep = 0;
  moveX = 0; moveY = 0;       // where the move lands
  specialCd = 150;
  enraged = false;

  /**
   * `level` comes from the location's level band, `tier` from the location
   * (or the Wave Trial tier). `extra` is any further multiplier on top — a
   * wave's own escalation, or a superboss.
   */
  constructor(def: EnemyDef, x: number, y: number, level: number, tier: number, extra = 1) {
    this.def = def;
    this.x = x; this.y = y; this.z = def.hover;
    this.radius = def.radius;
    this.level = level;
    this.tier = tier;
    this.maxHp = Math.round(def.hp * LEVEL_SCALING.hp(level) * extra * TUNING.enemyHpMult);
    this.hp = this.maxHp;
    this.str = def.str * LEVEL_SCALING.attack(level) * (1 + (extra - 1) * 0.55);
    this.edef = def.def * (1 + (extra - 1) * 0.45);
    this.mres = def.mres * (1 + (extra - 1) * 0.45);
    this.exp = Math.round(def.exp * LEVEL_SCALING.xp(level) * extra * TUNING.expMult);
    this.speed = def.speed;
    this.maxPoise = def.poise;
    this.poise = def.poise;
    this.scale(tier);
  }

  /** Location tier on top of level: see TIER_SCALING in config.ts. */
  scale(tier: number) {
    const t = Math.max(1, tier);
    this.maxHp = Math.round(this.maxHp * TIER_SCALING.hpMultiplier(t));
    this.hp = this.maxHp;
    this.str *= TIER_SCALING.attackMultiplier(t);
    this.edef *= TIER_SCALING.defenseMultiplier(t);
    this.mres *= TIER_SCALING.defenseMultiplier(t);
    this.exp = Math.round(this.exp * TIER_SCALING.xpMultiplier(t));
  }

  get alive() { return this.state !== 'dead'; }

  update(g: Game, dt: number) {
    this.wobble += dt * 3;
    if (this.flash > 0) this.flash--;
    if (this.guardFlash > 0) this.guardFlash--;
    if (this.slow > 0) this.slow--;

    if (this.state === 'dead') {
      this.deathT += dt;
      this.z = Math.max(0, this.z - 120 * dt);
      return;
    }

    if (this.poise < this.maxPoise) {
      this.poiseRegen += dt;
      if (this.poiseRegen > 1.4) this.poise = Math.min(this.maxPoise, this.poise + this.maxPoise * dt * 0.7);
    }

    if (this.cooldown > 0) this.cooldown--;

    if (!this.aggro) { this.idle(g, dt); this.physics(g, dt); return; }
    if (g.screen === 'world' && this.state !== 'stagger' && this.state !== 'special'
      && dist(this.x, this.y, this.homeX, this.homeY) > LEASH
      && dist(this.x, this.y, g.player.x, g.player.y) > AGGRO_RANGE) {
      this.aggro = false;              // lost you: head home
      this.wanderX = this.homeX; this.wanderY = this.homeY; this.wanderT = 4;
    }

    if (this.boss && this.updateBoss(g, dt)) { this.physics(g, dt); return; }

    switch (this.def.ai) {
      case 'grunt': this.aiGrunt(g, dt); break;
      case 'bruiser': this.aiBruiser(g, dt); break;
      case 'caster': this.aiCaster(g, dt); break;
      case 'flyer': this.aiFlyer(g, dt); break;
    }

    this.physics(g, dt);
  }

  private physics(g: Game, dt: number) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= Math.pow(0.86, dt * 60);
    this.vy *= Math.pow(0.86, dt * 60);

    const rest = this.def.hover;
    if (this.z > rest || this.vz !== 0) {
      this.vz -= TUNING.gravity * 0.75 * dt;
      this.z += this.vz * dt;
      if (this.z <= rest) {
        if (this.vz < -260 && this.state === 'stagger') {
          // Slammed into the floor by an air finisher — extra stun, extra juice.
          this.stateFrame = Math.max(0, this.stateFrame - 20);
          g.shake(7 * TUNING.shakeScale);
          g.burst(this.x, this.y, 0, 10, '#ffd54a');
        }
        this.z = rest; this.vz = 0;
      }
    }

    g.clampToArena(this);
    g.separate(this);
  }

  faceTarget(p: Player, dt: number, rate = 9) {
    const want = Math.atan2(p.y - this.y, p.x - this.x);
    this.facing = angleLerp(this.facing, want, clamp(rate * dt, 0, 1));
  }

  private moveToward(tx: number, ty: number, dt: number, mult = 1) {
    const ang = Math.atan2(ty - this.y, tx - this.x);
    const sp = this.speed * TUNING.enemySpeedMult * mult * (this.slow > 0 ? 0.5 : 1);
    this.vx = lerp(this.vx, Math.cos(ang) * sp, clamp(9 * dt, 0, 1));
    this.vy = lerp(this.vy, Math.sin(ang) * sp, clamp(9 * dt, 0, 1));
  }

  private beginTelegraph(g: Game) {
    this.state = 'telegraph';
    this.stateFrame = 0;
    this.hasHitThisSwing = false;
    void g;
  }

  private stagger(frames: number) {
    this.state = 'stagger';
    this.stateFrame = frames;
    this.poise = this.maxPoise;
    this.poiseRegen = 0;
  }

  private tickStagger(dt: number): boolean {
    if (this.state !== 'stagger') return false;
    this.stateFrame--;
    this.vx *= Math.pow(0.9, dt * 60);
    this.vy *= Math.pow(0.9, dt * 60);
    if (this.stateFrame <= 0 && this.z <= this.def.hover + 1) this.state = 'chase';
    return true;
  }

  /* ------------------------------------------------------------- AI: grunt */

  private aiGrunt(g: Game, dt: number) {
    if (this.tickStagger(dt)) return;
    const p = g.player;
    const d = dist(this.x, this.y, p.x, p.y);
    const reach = this.def.reach + this.radius + p.radius * 0.5;

    if (this.state === 'spawn') {
      this.stateFrame++;
      if (this.stateFrame > 26) this.state = 'chase';
      return;
    }

    if (this.state === 'telegraph') {
      this.stateFrame++;
      this.faceTarget(p, dt, 4);
      this.vx *= 0.8; this.vy *= 0.8;
      if (this.stateFrame >= this.def.telegraph) { this.state = 'attack'; this.stateFrame = 0; }
      return;
    }
    if (this.state === 'attack') {
      this.stateFrame++;
      if (this.stateFrame <= 3) {
        this.vx = Math.cos(this.facing) * 240;
        this.vy = Math.sin(this.facing) * 240;
      }
      if (!this.hasHitThisSwing && this.stateFrame <= this.def.active + 2) g.enemyStrike(this, reach, 1.0);
      if (this.stateFrame >= this.def.active) { this.state = 'recover'; this.stateFrame = 0; }
      return;
    }
    if (this.state === 'recover') {
      this.stateFrame++;
      if (this.stateFrame >= this.def.recovery) { this.state = 'chase'; this.cooldown = this.def.cooldown / TUNING.enemyAggression; }
      return;
    }

    // chase
    this.faceTarget(p, dt);
    if (d > reach * 0.85) {
      this.moveToward(p.x, p.y, dt);
    } else if (this.cooldown <= 0 && p.alive && Math.abs(p.z - this.z) < Z_TOLERANCE) {
      this.beginTelegraph(g);
    } else {
      // Circle-strafe while waiting instead of standing in the player's face.
      const ang = Math.atan2(this.y - p.y, this.x - p.x) + 0.9;
      this.moveToward(p.x + Math.cos(ang) * reach, p.y + Math.sin(ang) * reach, dt, 0.6);
    }
  }

  /* ----------------------------------------------------------- AI: bruiser */

  private aiBruiser(g: Game, dt: number) {
    if (this.tickStagger(dt)) return;
    const p = g.player;
    const d = dist(this.x, this.y, p.x, p.y);
    const reach = this.def.reach + this.radius;

    if (this.state === 'spawn') {
      this.stateFrame++;
      if (this.stateFrame > 34) this.state = 'chase';
      return;
    }
    if (this.state === 'telegraph') {
      this.stateFrame++;
      this.faceTarget(p, dt, 2.5);
      this.vx *= 0.85; this.vy *= 0.85;
      if (this.stateFrame >= this.def.telegraph) { this.state = 'attack'; this.stateFrame = 0; }
      return;
    }
    if (this.state === 'attack') {
      this.stateFrame++;
      if (this.stateFrame === 1) { this.vx = Math.cos(this.facing) * 300; this.vy = Math.sin(this.facing) * 300; g.shake(4); }
      if (!this.hasHitThisSwing && this.stateFrame <= this.def.active + 2) g.enemyStrike(this, reach, 1.0);
      if (this.stateFrame >= this.def.active) { this.state = 'recover'; this.stateFrame = 0; }
      return;
    }
    if (this.state === 'recover') {
      this.stateFrame++;
      if (this.stateFrame >= this.def.recovery) { this.state = 'chase'; this.cooldown = this.def.cooldown / TUNING.enemyAggression; }
      return;
    }

    this.faceTarget(p, dt, 5);
    if (d > reach * 0.9) this.moveToward(p.x, p.y, dt);
    else if (this.cooldown <= 0 && p.alive) this.beginTelegraph(g);
  }

  /** Bruisers eat frontal hits. Returns damage multiplier and marks the guard. */
  guardCheck(fromX: number, fromY: number, def: AttackDef): number {
    if (!this.def.guard) return 1;
    if (this.state === 'stagger' || this.state === 'telegraph' || this.state === 'attack') return 1;
    const ang = Math.atan2(fromY - this.y, fromX - this.x);
    if (Math.abs(angleDiff(this.facing, ang)) > 1.15) return 1; // hit from behind
    if (def.finisher) return 1;                                 // finishers break guard
    this.guardFlash = 12;
    return 0.18;
  }

  /* ------------------------------------------------------------ AI: caster */

  private aiCaster(g: Game, dt: number) {
    if (this.tickStagger(dt)) return;
    const p = g.player;
    const d = dist(this.x, this.y, p.x, p.y);
    const ideal = 210;

    if (this.state === 'spawn') {
      this.stateFrame++;
      if (this.stateFrame > 30) this.state = 'chase';
      return;
    }
    if (this.state === 'telegraph') {
      this.stateFrame++;
      this.faceTarget(p, dt, 6);
      this.vx *= 0.8; this.vy *= 0.8;
      if (this.stateFrame >= this.def.telegraph) {
        this.state = 'recover';
        this.stateFrame = 0;
        g.spawnEnemyBolt(this);
      }
      return;
    }
    if (this.state === 'recover') {
      this.stateFrame++;
      if (this.stateFrame >= this.def.recovery) { this.state = 'chase'; this.cooldown = this.def.cooldown / TUNING.enemyAggression; }
      return;
    }

    this.faceTarget(p, dt, 6);
    if (d < ideal * 0.7) {
      // back off
      this.moveToward(this.x * 2 - p.x, this.y * 2 - p.y, dt, 1.1);
    } else if (d > ideal * 1.3) {
      this.moveToward(p.x, p.y, dt, 0.9);
    } else {
      const ang = Math.atan2(this.y - p.y, this.x - p.x) + 1.2;
      this.moveToward(p.x + Math.cos(ang) * ideal, p.y + Math.sin(ang) * ideal, dt, 0.7);
      if (this.cooldown <= 0 && p.alive && d < this.def.reach) this.beginTelegraph(g);
    }
  }

  /* ------------------------------------------------------------- AI: flyer */

  private aiFlyer(g: Game, dt: number) {
    if (this.tickStagger(dt)) return;
    const p = g.player;
    const d = dist(this.x, this.y, p.x, p.y);
    const reach = this.def.reach + this.radius;

    if (this.state === 'spawn') {
      this.stateFrame++;
      this.z = lerp(this.z, this.def.hover, clamp(4 * dt, 0, 1));
      if (this.stateFrame > 28) this.state = 'chase';
      return;
    }
    if (this.state === 'telegraph') {
      this.stateFrame++;
      this.faceTarget(p, dt, 5);
      this.vx *= 0.86; this.vy *= 0.86;
      // Drops to the player's height to strike — the window to punish it.
      this.z = lerp(this.z, p.z + 8, clamp(6 * dt, 0, 1));
      if (this.stateFrame >= this.def.telegraph) { this.state = 'attack'; this.stateFrame = 0; }
      return;
    }
    if (this.state === 'attack') {
      this.stateFrame++;
      if (this.stateFrame === 1) { this.vx = Math.cos(this.facing) * 340; this.vy = Math.sin(this.facing) * 340; }
      if (!this.hasHitThisSwing && this.stateFrame <= this.def.active + 2) g.enemyStrike(this, reach, 1.0);
      if (this.stateFrame >= this.def.active) { this.state = 'recover'; this.stateFrame = 0; }
      return;
    }
    if (this.state === 'recover') {
      this.stateFrame++;
      this.z = lerp(this.z, this.def.hover, clamp(3 * dt, 0, 1));
      if (this.stateFrame >= this.def.recovery) { this.state = 'chase'; this.cooldown = this.def.cooldown / TUNING.enemyAggression; }
      return;
    }

    this.z = lerp(this.z, this.def.hover + Math.sin(this.wobble) * 10, clamp(3 * dt, 0, 1));
    this.faceTarget(p, dt, 6);
    if (d > reach) this.moveToward(p.x, p.y, dt, 0.85);
    else if (this.cooldown <= 0 && p.alive) this.beginTelegraph(g);
  }

  /* --------------------------------------------------- overworld idling */

  /** Amble around home; notice the player when they come close. */
  private idle(g: Game, dt: number) {
    const p = g.player;
    if (p.alive && dist(this.x, this.y, p.x, p.y) < AGGRO_RANGE && Math.abs(p.z - this.z) < 200) {
      this.aggro = true;
      this.state = 'chase';
      this.cooldown = Math.max(this.cooldown, 20);
      g.floatText(this.x, this.y, this.z + this.def.height + 16, '!', this.def.accent, 20);
      return;
    }
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wanderT = rnd(1.8, 4);
      const a = rnd(0, Math.PI * 2), r = rnd(0, 110);
      this.wanderX = this.homeX + Math.cos(a) * r;
      this.wanderY = this.homeY + Math.sin(a) * r;
    }
    if (dist(this.x, this.y, this.wanderX, this.wanderY) > 10) {
      this.moveToward(this.wanderX, this.wanderY, dt, 0.35);
      this.facing = angleLerp(this.facing, Math.atan2(this.vy, this.vx), clamp(4 * dt, 0, 1));
    } else { this.vx *= 0.8; this.vy *= 0.8; }
    if (this.def.hover) this.z = lerp(this.z, this.def.hover + Math.sin(this.wobble) * 10, clamp(3 * dt, 0, 1));
  }

  /* ------------------------------------------------------------- bosses */

  /** Frames between signature moves; faster once enraged or Ascendant. */
  private moveCooldown(): number {
    return Math.round(230 * (this.enraged ? 0.7 : 1) * (this.superboss ? 0.8 : 1) / TUNING.enemyAggression);
  }

  /**
   * Runs the boss's signature moves. Returns true while a move owns the
   * boss this frame; otherwise the base AI (bruiser/caster/grunt/flyer) runs.
   */
  private updateBoss(g: Game, dt: number): boolean {
    const b = this.boss!;
    const p = g.player;
    if (!this.enraged && this.hp < this.maxHp * 0.5) {
      this.enraged = true;
      g.banner('ENRAGED', b.name, b.accent);
      g.shake(8);
      g.ring(this.x, this.y, this.z, 10, 140, b.accent);
    }
    if (this.state === 'special') { this.runMove(g, dt); return true; }
    if (this.state === 'stagger' || this.state === 'spawn') return false;
    if (this.specialCd > 0) { this.specialCd--; return false; }
    if (this.state !== 'chase' || !p.alive) return false;

    this.move = pick(b.moves);
    this.state = 'special';
    this.moveFrame = 0;
    this.moveStep = 0;
    this.hasHitThisSwing = false;
    this.moveX = this.x; this.moveY = this.y;
    return true;
  }

  private endMove() {
    this.state = 'chase';
    this.move = null;
    this.specialCd = this.moveCooldown();
    this.cooldown = Math.max(this.cooldown, 30);
  }

  /** Telegraph length for the current move: shorter when enraged. */
  tell(base: number): number { return Math.round(base * (this.enraged ? 0.75 : 1)); }

  private runMove(g: Game, dt: number) {
    const p = g.player;
    const f = ++this.moveFrame;
    this.vx *= 0.85; this.vy *= 0.85;
    switch (this.move) {
      case 'slam': {
        // Winds up, then shocks the ground in a ring. Jump or dash out.
        const t = this.tell(52);
        this.moveX = this.x; this.moveY = this.y;
        if (f === t) {
          g.bossShock(this, this.x, this.y, SLAM_RADIUS, SHOCK_MULT);
          g.shake(12);
          g.ring(this.x, this.y, 0, 20, SLAM_RADIUS, this.def.accent);
          g.burst(this.x, this.y, 0, 24, this.def.accent);
        }
        if (f >= t + 34) this.endMove();
        break;
      }
      case 'fan': {
        // A spread of bolts. Gaps between them are the way through.
        const t = this.tell(34);
        this.faceTarget(p, dt, 6);
        if (f === t) {
          const n = this.enraged || this.superboss ? 7 : 5;
          for (let i = 0; i < n; i++) g.spawnEnemyBolt(this, (i - (n - 1) / 2) * 0.22);
        }
        if (f >= t + 26) this.endMove();
        break;
      }
      case 'rush': {
        // A string of lunges, each with its own short tell.
        const lunges = this.enraged ? 4 : 3;
        const wind = this.tell(18), go = 11;
        const local = f - this.moveStep * (wind + go);
        if (local <= wind) {
          this.faceTarget(p, dt, 10);
          if (local === 1) this.hasHitThisSwing = false;
        } else if (local <= wind + go) {
          this.vx = Math.cos(this.facing) * 560;
          this.vy = Math.sin(this.facing) * 560;
          if (!this.hasHitThisSwing) g.enemyStrike(this, this.def.reach + this.radius, 1.1);
        } else {
          this.moveStep++;
          if (this.moveStep >= lunges) this.endMove();
        }
        break;
      }
      case 'dive': {
        // Rises out of reach, tracks you, then drops onto the marked spot.
        const rise = 30, track = this.tell(46), fall = 12;
        if (f <= rise) {
          this.z = lerp(this.z, DIVE_HEIGHT, clamp(6 * dt, 0, 1));
        } else if (f <= rise + track) {
          this.z = DIVE_HEIGHT;
          this.moveX = lerp(this.moveX, p.x, clamp(5 * dt, 0, 1));
          this.moveY = lerp(this.moveY, p.y, clamp(5 * dt, 0, 1));
          this.x = lerp(this.x, this.moveX, clamp(4 * dt, 0, 1));
          this.y = lerp(this.y, this.moveY, clamp(4 * dt, 0, 1));
        } else if (f <= rise + track + fall) {
          const k = (f - rise - track) / fall;
          this.x = lerp(this.x, this.moveX, k);
          this.y = lerp(this.y, this.moveY, k);
          this.z = DIVE_HEIGHT * (1 - k) + this.def.hover * k;
          if (f === rise + track + fall) {
            this.z = this.def.hover;
            g.bossShock(this, this.moveX, this.moveY, DIVE_RADIUS, SHOCK_MULT * 0.9);
            g.shake(10);
            g.ring(this.moveX, this.moveY, 0, 10, DIVE_RADIUS, this.def.accent);
            g.burst(this.moveX, this.moveY, 0, 18, this.def.accent);
          }
        } else if (f >= rise + track + fall + 28) this.endMove();
        break;
      }
      default: this.endMove();
    }
  }

  /* -------------------------------------------------------------- damage */

  applyDamage(g: Game, dmg: number, poiseDmg: number, angle: number, knockback: number, launch: number) {
    this.hp -= dmg;
    this.aggro = true;
    this.flash = 6;
    this.poiseRegen = 0;

    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'dead';
      this.deathT = 0;
      g.onEnemyDeath(this);
      return;
    }

    // A boss mid-move is committed: it takes the damage but not the stagger.
    if (this.state === 'special') return;

    this.poise -= poiseDmg;
    const launched = launch !== 0 && !this.boss;
    if (this.poise <= 0 || launched) {
      this.stagger(Math.max(18, Math.round(poiseDmg * 0.9)));
      this.vx = Math.cos(angle) * knockback;
      this.vy = Math.sin(angle) * knockback;
      if (launch > 0) this.vz = launch;
      else if (launch < 0) this.vz = launch;
    } else {
      this.vx += Math.cos(angle) * knockback * 0.35;
      this.vy += Math.sin(angle) * knockback * 0.35;
    }
  }
}

/* ----------------------------------------------------------- projectiles */

type ProjOwner = 'player' | 'enemy';

class Projectile {
  x: number; y: number; z: number;
  vx: number; vy: number;
  radius: number;
  life: number;
  color: string;
  owner: ProjOwner;
  power: number;
  pierce: boolean;
  homing: number;
  target: Enemy | null = null;
  hits = new Set<Enemy>();
  slowOnHit = false;
  mag = 8;            // caster strength behind an enemy bolt
  trail = 0;
  dead = false;

  constructor(o: {
    x: number; y: number; z: number; vx: number; vy: number;
    radius: number; life: number; color: string; owner: ProjOwner;
    power: number; pierce?: boolean; homing?: number; target?: Enemy | null; slowOnHit?: boolean;
    mag?: number;
  }) {
    this.mag = o.mag ?? 8;
    this.x = o.x; this.y = o.y; this.z = o.z;
    this.vx = o.vx; this.vy = o.vy;
    this.radius = o.radius; this.life = o.life; this.color = o.color;
    this.owner = o.owner; this.power = o.power;
    this.pierce = !!o.pierce; this.homing = o.homing || 0;
    this.target = o.target || null; this.slowOnHit = !!o.slowOnHit;
  }

  update(g: Game, dt: number) {
    if (this.homing && this.target && this.target.alive) {
      const want = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      const cur = Math.atan2(this.vy, this.vx);
      const sp = Math.hypot(this.vx, this.vy);
      const ang = angleLerp(cur, want, clamp(this.homing * dt, 0, 1));
      this.vx = Math.cos(ang) * sp;
      this.vy = Math.sin(ang) * sp;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    this.trail += dt;
    if (this.trail > 0.02) {
      this.trail = 0;
      g.particles.push({
        x: this.x, y: this.y, z: this.z,
        vx: rnd(-14, 14), vy: rnd(-14, 14), vz: rnd(4, 26),
        life: 0.3, maxLife: 0.3, size: this.radius * 0.6, color: this.color, gravity: 0,
      });
    }
    const b = g.bounds();
    if (this.life <= 0 || this.x < b.x - 60 || this.x > b.x + b.w + 60 || this.y < b.y - 60 || this.y > b.y + b.h + 60
      || g.blocksShot(this.x, this.y)) {
      this.dead = true;
      return;
    }
    g.projectileCollide(this);
  }
}

/* --------------------------------------------------------------- pickups */

type PickupKind = 'mat' | 'potion' | 'ether';

class Pickup {
  x: number; y: number; z: number;
  vx: number; vy: number; vz = 0;
  kind: PickupKind;
  matId: MatId | null;
  count: number;
  life = 14;
  radius = 8;
  collected = false;
  bob = Math.random() * 6.28;

  constructor(x: number, y: number, z: number, kind: PickupKind, matId: MatId | null, count: number) {
    this.x = x; this.y = y; this.z = z;
    this.kind = kind; this.matId = matId; this.count = count;
    const a = rnd(0, Math.PI * 2);
    const sp = rnd(30, 110);
    this.vx = Math.cos(a) * sp;
    this.vy = Math.sin(a) * sp * 0.6;
    this.vz = rnd(150, 260);
  }

  get color(): string {
    if (this.kind === 'potion') return PAL.hp;
    if (this.kind === 'ether') return PAL.mp;
    return MATS[this.matId as MatId].color;
  }

  update(g: Game, dt: number) {
    this.life -= dt;
    this.bob += dt * 5;
    const p = g.player;
    const d = dist(this.x, this.y, p.x, p.y);

    // Magnetise once you are close, so loot never becomes a chore.
    if (p.alive && d < 130) {
      const a = Math.atan2(p.y - this.y, p.x - this.x);
      const pull = 260 * (1 - d / 130) + 90;
      this.vx = lerp(this.vx, Math.cos(a) * pull, clamp(9 * dt, 0, 1));
      this.vy = lerp(this.vy, Math.sin(a) * pull, clamp(9 * dt, 0, 1));
    }
    if (p.alive && d < 22 && this.z < 44) { this.collected = true; g.collect(this); return; }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vz -= 900 * dt;
    this.z += this.vz * dt;
    if (this.z <= 6) { this.z = 6; this.vz = Math.abs(this.vz) * 0.32; if (this.vz < 40) this.vz = 0; }
    this.vx *= Math.pow(0.94, dt * 60);
    this.vy *= Math.pow(0.94, dt * 60);
    g.clampToArena(this);
  }
}

/* ----------------------------------------------------------- boss bodies */

const AGGRO_RANGE = 300;     // overworld: how close before an enemy notices you
const LEASH = 760;           // ...and how far it will follow you from home
const SLAM_RADIUS = 150;
const SHOCK_MULT = 1.5;       // slam / dive damage relative to a normal swing
const BOSS_HP_SCALE = 0.75;   // boss data HP -> fight HP, tuned so fights last ~40-90 hits
const DIVE_RADIUS = 96;
const DIVE_HEIGHT = 190;

/** Build a fightable EnemyDef from a boss: its pattern picks the base AI and body. */
function bossEnemyDef(b: BossDefinition): EnemyDef {
  const base: Record<BossPattern, Partial<EnemyDef>> = {
    brute:    { ai: 'bruiser', radius: 36, height: 66, speed: 72, reach: 70, telegraph: 30, active: 7, recovery: 32, cooldown: 70, poise: 260, hover: 0 },
    sorcerer: { ai: 'caster', radius: 24, height: 58, speed: 96, reach: 380, telegraph: 26, active: 4, recovery: 22, cooldown: 70, poise: 190, hover: 0 },
    stalker:  { ai: 'grunt', radius: 24, height: 52, speed: 150, reach: 52, telegraph: 18, active: 6, recovery: 20, cooldown: 46, poise: 210, hover: 0 },
    skylord:  { ai: 'flyer', radius: 28, height: 46, speed: 140, reach: 58, telegraph: 24, active: 6, recovery: 22, cooldown: 60, poise: 180, hover: 82 },
  };
  return {
    id: b.id, name: b.name,
    // `attack` is fed in gently: strength counts twice in physDamage (as a
    // power ratio and as the strength term), so a raw 20 would snowball
    // with tier and one-shot you late on.
    hp: Math.round(b.stats.hp * BOSS_HP_SCALE),
    str: 8 + (b.stats.attack - 12) * 0.25, def: b.stats.defense, mres: Math.round(b.stats.defense * 0.8),
    color: b.color, accent: b.accent, exp: 420, power: 12 + (b.stats.attack - 12) * 0.5,
    guard: false,
    ...base[b.pattern],
  } as EnemyDef;
}
