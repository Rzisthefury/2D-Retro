/* =========================================================================
 * superboss.ts — Ascendant bosses: hard-mode variants of every boss.
 * Optional by design: they open nothing, but pay double and drop Star
 * Fragments, the only source of the Starforged / Starwoven recipes.
 * ========================================================================= */

/** Ascendants unlock once the ordinary boss has been beaten. */
function ascendantAvailable(w: WorldState, b: BossDefinition): boolean {
  return bossDefeated(w, b.id);
}

function ascendantName(b: BossDefinition): string { return `${b.name}, Ascendant`; }

/** Turn a freshly spawned boss into its Ascendant form. */
function makeAscendant(e: Enemy, b: BossDefinition) {
  const m = b.superboss.statMultiplier;
  e.superboss = true;
  e.maxHp = Math.round(e.maxHp * m);
  e.hp = e.maxHp;
  e.str *= m;
  e.edef *= m;
  e.mres *= m;
  e.exp = Math.round(e.exp * b.superboss.dropMultiplier);
  e.speed *= 1.12;
  e.maxPoise = Math.round(e.maxPoise * m);
  e.poise = e.maxPoise;
  e.specialCd = 90;            // it opens with a signature move
}

/** Record the kill and drop the Ascendant-only spoils on top of the normal ones. */
function winAscendant(g: Game, b: BossDefinition, e: Enemy) {
  const first = !superDefeated(g.world, b.id);
  g.world.completedSuperbosses.set(b.id, true);
  const stars = first ? 3 : rndInt(1, 2);
  g.pickups.push(new Pickup(e.x, e.y, 30, 'mat', 'star', stars));
  g.pickups.push(new Pickup(e.x, e.y, 30, 'ether', null, 1));
}
