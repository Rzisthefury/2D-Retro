# THE SUNDERED CROWN

A Fire Emblem–style tactics game modelled on the Game Boy Advance titles
(*The Blazing Blade*, *The Sacred Stones*).

Play: open `dist/Sundered Crown.html` in a browser, or use the published
artifact link (works on desktop and iPhone).

---

## Build

```
node build.js
```

Concatenates `src/` in dependency order into `shell.html` and writes:

| File | What it is |
|---|---|
| `dist/Sundered Crown.html` | standalone document — open it locally |
| `dist/artifact.html` | content-only body for publishing as an Artifact |

No dependencies, no bundler, no build step beyond `node build.js`.

## Test

```
node test/headless.js    # 334 checks: map integrity, combat math, balance probes
node test/browser.js     # drives the real UI in Chromium, screenshots to dist/shots
```

`headless.js` verifies combat numbers against hand calculations, proves undo
replays identical rolls, and simulates five runs of every chapter on both
difficulties. `browser.js` clicks through title → difficulty → dialogue → prep →
arena → shop → battle → move → undo → enemy phase at both desktop and phone
sizes, and fails on any console error.

---

## Source layout

```
src/
  data/
    classes.js    30 classes, stat caps, branching promotions, move types
    weapons.js    weapons, staves, items, both weapon triangles
    terrain.js    terrain table with per-move-type movement costs
    units.js      recruitable roster, bosses, enemy stat generation
    story.js      all narrative text — nothing in the engine reads it
    chapters.js   maps as character grids, enemy placement, events
  core/
    rng.js        seeded xorshift; the whole random stream is one integer
    state.js      campaign and battle state, fog, turn flow, victory checks
    undo.js       snapshot stack
  systems/
    stats.js      derived stats (Atk, AS, Hit, Avoid, Crit, Dodge)
    combat.js     forecast and resolution
    movement.js   Dijkstra reachability, distance fields, danger zone
    leveling.js   experience, growth rolls, promotion, stat boosters
    supports.js   affinity table, adjacency bonuses, rank thresholds
    ai.js         aggressive / dormant / guard / boss / raider behaviours
  render/
    sprites.js    16x16 pixel grids composited body + weapon + accent
    tiles.js      procedural GBA-depth tile painting
    ui.js         DOM window frames and panels
    map.js        canvas renderer, camera, popups
  audio/
    music.js      4-channel chiptune sequencer and the score
  main.js         scenes, input, action flow
```

Everything hangs off one global `FE`. No modules, no imports — `build.js`
concatenates in a fixed order.

---

## The rules it implements

**Combat** — GBA formulas throughout:

```
Atk    = Str or Mag + Mt (x3 vs effective) + triangle
Damage = Atk - (Def or Res) - terrain Def
Hit    = WHit + Skl*2 + Lck/2 + triangle +/-15
Shown  = Hit - target Avoid, rolled 2RN (two dice averaged)
Crit   = WCrit + Skl/2 + class - target Lck, x3 damage
Double = attack speed >= target's + 4
AS     = Spd - max(0, Weight - Con)
```

Two triangles: sword > axe > lance > sword, and anima > light > dark > anima.
Bows and staves sit outside both. Bows deal triple damage to fliers.

**Undo** — step by step, and it crosses turn boundaries. A snapshot is taken
before every action and once more the instant before you end your turn, and the
stack is never cleared, so keep pressing and undo walks back through the enemy
phase into the turn before it: a unit lost to a counterattack you did not see
coming can be un-lost by not making the move that caused it. The RNG stream is
part of every snapshot, so a rewound enemy phase replays exactly as it did unless
you change something — undo fixes positioning, not luck. History is bounded by
bytes (8 MB, ~18 KB a snapshot on the largest chapter), which in practice is the
whole chapter, and it is not written into the suspend file.

**Levels** — cap 20 per tier, per-stat growth rates rolled independently, with a
guard so a level can never grant nothing. Promotion from level 10 into one of two
classes. Per-class stat caps.

**Death** — a fallen unit is benched for the chapter and returns for the next.
If Seren falls the chapter restarts.

**Arena** — wager gold, fight escalating opponents, cash out between rounds.
Seven rounds per unit per chapter, purse decays after the third, and undoing
rewinds the whole visit including the winnings.

---

## Editing content

**Maps** are character grids in `src/data/chapters.js`. The legend is at the top
of that file. `node test/headless.js` will tell you if a row is the wrong width,
an enemy is standing in a wall, or a chest is not on a chest tile.

**Story** is entirely in `src/data/story.js`. Rewriting every line of it changes
nothing else.

**Balance** lives in `src/data/units.js` (rosters, bosses, enemy stat lines) and
`src/data/weapons.js`. The headless test prints, per chapter and difficulty, how
much of the enemy force a greedy bot clears and whether the party as issued can
kill the boss inside three turns — that last check is the one that catches a boss
whose defence has quietly become unbeatable.

---

## Built so far

The whole campaign: twenty chapters, three world map regions, and the engine
behind them. A new chapter is one entry in `chapters.js`; nothing in the engine
knows how many there are.

Chapter 20 ends on the only branch in the game — the third consent is Seren's
to give or refuse, and the two endings are both in `story.js`. Its boss is the
one two-phase fight in the campaign: see `FE.enterPhase2` in `core/state.js`.

Still open: written C/B/A support conversations, and battle-scene combatant art
(the duel still scales up the 16x16 map sprites).
