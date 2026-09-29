# RAGE CIRCUIT — design plan (rev 5, updated 2026-09-22)

**Direction:** a side-scrolling beat 'em up built as close to **Streets of Rage 3** as possible, with **Turtles in Time** elements added. All characters, enemies, bosses, names and art are original. Nothing is reproduced from Sega or Konami.

**Build folder:** `C:\Users\shado\OneDrive\Desktop\Claude\Rage`

## Build 2 decisions (2026-09-22)
- **Art: hand-made pixel sprites.** Every fighter is baked to fixed pixel frames from a limited palette with outlines and hand-drawn faces, about 30% bigger than build 1 (~85 px, SoR3 scale). A short loading bar prepares each scene's sprites.
- **Anita Knockout** is the second playable fighter and replaces the placeholder Rena Vance. Red cropped jacket, skirt, high boots; fast kicker with a double jump. Her mastery moves are Scissor Takedown (2) and Axe Kick (3).
- **Move upgrades in the shop (new MOVES tab, per fighter).** Cole: Blitz Follow-Up 60k, Double Flying Kick 50k. Anita: Triple Jump 70k, Air Combo 60k, Spinning Dash Kick 60k, Stiletto Throw 80k. Off in Classic rules like every other upgrade. Cole's dash attack already existed as the Blitz (→ → + X).
- **Cornered bosses always break out.** Any boss pinned within ~64 px of a screen edge and taking hits for 2 seconds flashes for 24 frames, blasts everyone within 110 px away (6 damage, knockdown) and moves to the middle of the screen. It works from dazed, downed, hurt or grabbed.
- **Enemy names:** DONOVAN, Y SIGNAL, SQUIDWARD, DOOSH and SERGE are mixed into the pool at roughly 1 in 6.
- **Stage 2 — NIGHTCLUB NEON:** The Strip (live-wire puddles) → Dance Floor → **Ruby & Onyx**, the Voss twins. Cartwheel down a lane, flip over your head, tag-team flanking; grabbable only while dazed or taunting after a cartwheel; killing one enrages the other.
- **Stage 3 — STEEL SKELETON:** Ground Level (falling beams, open elevator shaft) → 30th Floor → **Wrecker MK-II**, a construction mech with claw, flamethrower and stomp. Steady damage overheats it (takes 1.5× while stalled); destroying it explodes and drops its pilot, **Rivet**, for a second round.
- **New enemies:** Whip (long reach, club) and Syndicate Robot (armored, ignores light hitstun, can't be grabbed, explodes on death).
- **Stage flow:** clearing a stage banks points, shows a short story screen, then starts the next stage with score and lives intact.

## Michael's decisions
- Solo play, with an **optional CPU partner** chosen on the select screen. The partner has its own lives and takes **commands** (Aggressive / Guard / Follow) with RB.
- **Friendly fire:** an option in the Options menu, **off by default**, never forced (not even on Mania).
- Setting: **city crime with a sci-fi twist.** A syndicate runs robots and mad-science projects. Early stages are grounded; later stages get wild.
- Roster: **4 starters + 2 unlockables.** Unlockables can be **earned in play OR entered with a secret code** on the select screen (and via the cheat menu).
- **Vertical slice first**, starring the **balanced brawler**.
- **5 lives, unlimited continues.** A continue resets the score to 0, restores 5 lives and restarts at the **current scene's checkpoint**, not the stage start.
- **1UP every 50,000 points.**
- **No stage timer.** The pace comes from enemy pressure.
- **2–3 endings**, decided by a scripted objective event in a late stage plus the difficulty (good ending needs Medium or higher). The event's own countdown is the only timer in the game.
- Difficulty: **Easy / Medium / Hard / Mania.**
- **Letter grade S–D** at every stage end, saved per stage and shown in stage select (best grade per difficulty).
- **16:9 widescreen**, PC + Xbox controller only (no touch controls).
- Story via **short skippable text cutscenes**: intro, between stages, endings.
- **Placeholder story** (the real story comes later): the Syndicate wants the heroes dead; the heroes fight through the city to its boss.

## Tech
- One HTML file with canvas and no external assets, same approach as DETONATOR '93. Publish as an artifact; Michael tests from the link.
- **426×240 logical resolution (16:9)**, integer-scaled, 60 fps fixed-step.
- **Gamepad API** with the Xbox layout, keyboard fallback and rebindable buttons. **Vibration** via the Gamepad haptics API where the browser supports it (Chrome/Edge do for Xbox pads; falls back silently).
- Save data in `localStorage`. Tests serve the page over HTTP, because saves do nothing on `file://`.

## Controls (Xbox)
| Button | Action |
|---|---|
| Left stick / D-pad | move (8-way, depth lane) |
| X | attack (combo string) |
| A | jump |
| B | special (meter) |
| Y | back attack |
| RB | ally command cycle |
| LB | pick up / use (attack also picks up) |
| Start | pause → move list / cheats / options |
| double-tap ←/→ | run |
| double-tap ↑/↓ | dodge-roll |

## Combat core (SoR3 model)
- 4–5 hit string with different hit reactions per hit. The last hit knocks down.
- **Grab** by walking into an enemy. Front: knees, then throw. Jump during the grab to vault over. Behind: suplex. You pick the throw direction.
- **Blitz:** run + attack, unique per character.
- **Special meter:** free when full, costs health when not. Refills over time.
- Jump attacks, back attack, and a defensive special that clears space.
- **Weapons:** knife, pipe, bat, katana, grenade. Durability, plus a per-character weapon special.
- **Star ranks (1–3):** specials strengthen with score. Lose a star on death.
- **Combo counter** on screen. Long combos pay a **hit bonus** that counts toward 1UPs.
- **Enemy name + health bar** for the last enemy you hit (bosses get a large bar).
- **Enemies pick up and use weapons.** Certain hits (knockdowns, throws, the Blitz) knock the weapon loose.
- Hitstop, screen shake and juggle limits get tuned in the slice first.

## Turtles in Time elements
- **Throw enemies into the screen** (toward the camera). It's a finisher, and at least one boss requires it.
- Stage hazards that hit enemies too: manholes, fire hydrants, falling signs, traffic, conveyors, electrified floors.
- One fast vehicle / hoverboard stage for pacing.
- Stat bars on the select screen: Power / Speed / Jump / Reach.

## Roster
1. **Cole Brennan** — balanced brawler, ex-cop. Unique: charge punch. *(slice character)*
2. **Rena Vance** — fast kicker, kickboxer. Unique: double jump.
3. **Bruno "Tank" Kovač** — power grappler, ex-wrestler. Unique: command grab that reaches a step away.
4. **Jett Rivera** — speedster, street racer/skater. Unique: air dash, fastest runner.
5. *Unlockable:* **Vex** — Syndicate enforcer and the Stage 5 boss. Earned by beating Vex, or bought in the shop.
6. *Unlockable:* **Unit-9** — Syndicate combat robot that turned on its makers. Earned by clearing on Hard or Mania, or bought in the shop.

### Secret codes (select screen, hold LB + RB)
- **Vex:** ← ← → → Y X
- **Unit-9:** ↓ ↓ ↑ ↑ B B A
- Codes unlock the character **for the current session only**. A permanent unlock still has to be earned or bought. Codes do not flag the run.
- **Sound test:** at the title screen, hold RB and press ↑ Y ↓ X.

## Enemies
- **Up to 6 enemies on screen**, with an attack-token system so only 2–3 attack at once (more on Hard/Mania).
- Enemy name plates and health bars (see Combat).

## Items
- Recovery: small (~30%) and full meal (100%).
- Points: cash 1,000 · gold bar 5,000.
- Power-ups (timed): **Rage** (2× damage) · **Iron Body** (no knockdown) · **Overdrive** (speed) · **Special refill** · **Star Up** · **1UP**.
- Items come from breakables (crates, barrels, phone booths, trash cans), never hidden without a visual tell.

## Stages
8 stages with 2–4 scenes each, a checkpoint at every scene, mid-bosses where they fit, and a boss at the end of every stage. Draft themes: city streets → nightclub → construction site → subway (moving train) → hoverboard/highway chase → syndicate factory → lab → tower rooftop.
**Every boss attack is telegraphed.**

### Stage 1 boss — "Big Brick" Harlan
A huge bouncer turned Syndicate muscle.
- **Shoulder charge** across the screen. Tell: he paws the ground, and the lane flashes red.
- **Two-handed ground slam** that knocks you down within a radius. Tell: arms raised, screen shake.
- **Grab and pile-driver** if you stand in front of him. Tell: a reaching wind-up.
- **At 50% HP** he rips out a lamppost and swings it. A knockdown or throw knocks it loose.
- **Weak point:** stagger → grab → throw him **into the screen** for big damage. This teaches the Turtles in Time throw in Stage 1.

## Stage-end tally and grade
Tally: life bonus + combo bonus + no-damage bonus + items-found bonus (no time bonus, since there is no timer). The grade (S / A / B / C / D) weighs damage taken, lives lost, best combo and clear speed. Speed only affects the grade; it never kills you.

## Difficulty scaling
Enemy HP, damage, aggression (attack tokens), group size (cap stays 6), boss pattern set, item drop rate. Mania adds new enemy moves. Lives stay at 5 everywhere.

## Progression — replayability (rev 3)
**System: hybrid point bank + per-character mastery.** Modelled on the shop in the fan-made *Streets of Rage Remake* (Bomber Games), where finished runs bank points that buy modes, characters, art and cheats.

**Point bank**
- Only points from **cleared stages** bank. A failed stage banks nothing. Cheat runs bank nothing.
- Banked amount = stage score × difficulty multiplier × grade multiplier (Easy 0.5 / Medium 1 / Hard 1.5 / Mania 2; grade D 0.8 → S 1.5). This stops Stage 1 on Easy from being the best farm.
- Spending never touches your in-run score, 1UPs or high scores.

**Shop (between stages, from the title and stage select)**
- **Pricing is front-loaded and slow:** early tiers are cheap, tier 5 and the capstones are expensive. Maxing ONE character takes **about 40+ Medium stage clears**.
- **Free full respec:** refund all of a character's upgrades at any time.
- **Consumables** (one stage only): extra starting life, starting weapon, Rage at stage start, etc.
- **Power upgrades, per character**, each 5 tiers:
  - Attack: +10% per tier, max +50%
  - Max health: +10% per tier
  - Special meter refill speed: +10% per tier
  - Defense: −6% damage taken per tier, max −30%
- **Capstone upgrades, per character** (expensive, need the tier-5 upgrades first):
  - **Star Lock:** start every stage at max stars, and stars are never lost on death.
  - **Free Specials:** specials never cost health, even with the meter empty.
- **Perks** (2 slots to start, **2 more slots bought**, 4 max): start with a weapon, sturdier weapons, food heals more, longer power-up timers, grab from further, etc.
- **Characters:** a third path to the two unlockables (alongside earning them and secret codes).
- **Modes and art:** Boss Rush (also unlocked by the first clear), gallery, endings viewer, sound test.
- **Bonus cheats:** novelty cheats bought here (big heads, weapon rain, turbo speed, mirror mode, etc.). The core cheats stay free from the start.

**Mastery (per character)**
- Earned from KOs, clears and grades with the character **you control**. **10 levels**, moves only.
- Each level unlocks a **move**, not stats: a new blitz, an air throw, a special variant, a new grab follow-up, and so on. Move lists show locked moves as silhouettes.

**Balance guards**
- **Mania enemies always get +25% HP** (Classic runs included).
- **The CPU partner always uses base stats** — no upgrades, perks or mastery moves — and its character earns **no mastery**.
- **Classic toggle** on the stage select: turns off all bought upgrades, perks and mastery moves for pure SoR3 rules. Classic runs keep their own best scores and grades. Banking still works.
- Grades are recorded separately for Classic and Upgraded runs.

## Modes
- **Story** (main game).
- **Training room:** dummy enemies (standing / walking / guarding / attacking), damage numbers, infinite meter, move list.
- **Boss Rush:** unlocked after the first clear. All bosses back to back, best time saved per difficulty.

## Menus and quality of life
- **Move list** in the pause menu, per character, with Xbox button glyphs.
- **Controller vibration** on heavy hits, specials and boss slams (toggle in Options).
- Options: music, SFX, vibration, friendly fire, button remap, scanlines, **erase save**.

## Save and progression
- Autosave on every stage clear: point bank, shop purchases, mastery per character, perk loadouts, stages reached, best grade per stage per difficulty, unlocks, best scores, Boss Rush times, options.
- Stage select shows reached stages only. Choose character, CPU partner and difficulty before playing.

## Cheats (title → CHEATS, pause → CHEATS)
Invincible · infinite lives · infinite special · all stages · one-hit KO · max stars · unlock all characters · weapon select · skip scene · kill all enemies.
Any active cheat blocks saving, grades and high scores, and the HUD shows a marker. Cheats are cleared on every load. The secret character codes are separate: session-only unlocks that do NOT flag the run.

## Audio
Synthesized hard techno in the style of the SoR3 soundtrack: one track per stage, boss and select themes, sound effects.

## Milestones
1. **Vertical slice:** balanced brawler, Stage 1 (2 scenes), 4 enemy types, 1 weapon (plus enemy weapon use), items, boss, CPU partner with commands, controller + vibration, title/select/pause/move list/cheat/options menus, training room, stage-end grade, autosave. Tune the feel here.
2. The other 3 starters.
3. Stages 2–8, enemy roster and bosses, cutscenes.
   *(the slice includes the point bank, a basic shop with the attack/health upgrades, and mastery levels 1–3 for the brawler)*
4. Unlockables + codes, full shop and mastery, endings, Boss Rush, difficulty tuning, polish.

## Known risk
Animation is where this genre succeeds or fails. Each character needs about 30+ poses, all drawn with code. The slice proves the art pipeline before it's used for eight stages.
