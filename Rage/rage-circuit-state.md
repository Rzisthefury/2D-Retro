# RAGE CIRCUIT — project state

**Direction:** Streets of Rage 3-style beat 'em up with Turtles in Time elements. Design: `claude/rage-circuit-plan.md`.

## Current build: BUILD 15 — TOUCH (2026-09-30)
- **Published artifact:** https://claude.ai/artifact/BMTcYjZFL3ivGBu94w3Php — **Version 17**. Republish `dist/rage-circuit-artifact.html` (same session) or pass that URL as `url` from another session. The URL must never change: the save lives in localStorage, which is per-origin.
- **Where builds go (set 2026-09-29): BOTH of these folders, every time.** Michael asked for the GitHub folder from Build 14.1 on and to keep the old one in sync, so a build is not delivered until it is in both:
  - `Documents\GitHub\Retro Games\Rage`  ← the one he works from now
  - `Desktop\Claude\Rage`  ← kept in sync
  **Write the files only. Do not run git** — no `add`, no `commit`, no `push`. He stages and commits himself, and the repo root is a level above the connected folder anyway, so `.git` is not reachable from here.
  Each folder holds: `rage-circuit.html`, `rage-circuit-src.zip`, `rage-circuit-plan.md`, `rage-circuit-state.md`, the cast and stage PNGs, and `soundtrack/` (all 35 mp3s, numbered in game order) — 50 files, verified identical in both on 2026-09-29.
  **How to deliver to both — use this recipe, and verify:**
  1. `device_commit_files` the file to a **filename that does not exist yet** in `Desktop\Claude\Rage` (e.g. `rage-circuit.html.new`).
  2. `device_bash`: `mv -f` it over the real name, then `cp` it into `Retro Games\Rage`.
  3. Verify: `find . -type f -printf "%p %s\n" | sort` in both folders and diff the two.

  **Why the detour: `device_commit_files` onto a path that already has a file is not reliable here.** On 2026-09-29 it repeatedly returned `{"written":[...]}` with no rejection, gave the file a fresh mtime, and left the **previous content in place** — a silent wrong-content write, which is the worst kind, and it happened in both folders, sometimes succeeding and sometimes not on the very same path. Committing to a filename that does not exist yet worked first time, every time. So write to a new name and `mv` it into place, and never treat `{"written":[...]}` as proof: step 3 is what tells you the file actually changed. `cp` and `mv -f` inside the device VM are reliable in both directions.
- Single HTML file, **backbuffer 854×480**, no assets, no build step at runtime. `build.sh` concatenates `p0_*` + `p1_core p1b_touch p2_audio p2b_band p3_poses p3b_pix p3c_props p4_data p5_fight p6_stage p6b_city p7_game` + tail.
- **Tests: 261 checks across 10 suites, all passing, zero page errors.** `verify.js` 55 · `newfeat.js` 46 · `flow.js` 40 · `chars.js` 26 · `touch.js` 25 · `boss.js` 21 · `music.js` 19 · `mastery.js` 15 · `wakeloop.js` 14. Plus `playthrough.js <diff> [ally] [stage] [char]`, `playlong.js`, `pt_long.js` (same as `playthrough.js` with a 700-step budget — stage 8 needs it to reach the tally), `smoke.js`, and the screen-inspection scripts (`stageshots.js`, `pick7shot.js`, `s7shot.js`, `s7cap.js`, `s7haz.js`, `pick8shot.js`, `s8shot.js`, `s8pad.js`, `cast3.js`, `zoomfig.js`), `perf.js`.
- **Perf at the new resolution:** ~598–627 tick+render/s headless (was ~1224 at 426×240), prewarm ~3.1 s (was ~1.55 s). Comfortably above the 60/s the game needs. The music and the touch layer cost nothing measurable: 638-748/s at Build 15. Single runs vary by well over 100/s on this container, so never read one number as a regression - take three.
- **`perf.js` must drain the prewarm queue before it starts timing.** Without the drain loop it reports ~44/s and looks like a catastrophic regression. This trap was documented after Build 5 but the fix had never actually been applied to the script; it is applied now.

## Build 15 — touch controls, for playing it on a phone

Michael's choices when asked (2026-09-30): **floating thumbstick**, **four buttons** (attack, jump, special, back attack) plus a dedicated **dodge**, run stays on a double tap, and the controls go **in the black bars beside the picture** so they never cover the game.

### How it is built
- `src/p1b_touch.js` — the whole layer. The controls are **DOM elements, not drawn into the canvas**, for two reasons: they have to sit outside the 426×240 picture, and a button sized in game pixels is unusable however crisp it is.
- Nothing in the fight code knows it exists. `Touch.take()` returns a set of flags once per tick and `Input.poll()` ORs them in beside the keyboard and the pad, so every move, every menu and every existing test keeps working off the same `Input`. The only game-side additions are the `confirm`/`cancel` ORs and the two lines that set `Input.dbl`.
- Layout adapts to the screen, and `Touch.mode` says which it picked: **`bars`** (phone landscape — controls in the side bars, nothing over the picture), **`below`** (tablet or portrait — a row under the picture), **`over`** (last resort, translucent over the corners).
- Buttons are listed nearest-thumb first and laid out reversed, so **attack ends up in the bottom corner** and back attack — the least used — ends up furthest away. Roll sits third because it is a panic button.
- `SAVE.options.touch` is `auto` / `on` / `off`, on the Options screen. `auto` shows them only on a touch screen, so nothing changes on the desktop build.
- Portrait gets a "turn your phone sideways" overlay you can tap away. It is playable, just small.

### The one place the answers had to be reconciled
Michael asked for a thumbstick **and** for run to stay on a double tap. Those fight each other: a stick returns to centre constantly while you weave, and two pushes inside a fifth of a second is a normal thing to do — counting them as a double tap breaks you into a run, or a roll, when you meant to sidestep. The test caught it immediately.

So **stick-driven directions are excluded from double-tap detection** (`tDir` in `Input.poll`), and instead:
- **run** comes from pushing the stick past 72% of its throw, and
- **roll** comes from the dodge button, which supplies both the direction and the `dbl` flag the fight code looks for — leaning the stick picks the direction, centred rolls toward the camera.

Keyboard and pad double taps are untouched.

### Traps hit while building it, all now guarded by `test/touch.js`
- **`typeof` does NOT protect against the temporal dead zone for `let`/`const`.** `fitCanvas()` ran at load time and checked `typeof Touch !== 'undefined'`, which *threw* because `Touch` is a const declared in a later file. The whole game failed to boot and every suite reported `window.__rc` undefined. The load-time call is gone; `boot()` calls it once `Touch` exists.
- **Assigning `style.cssText` replaces the entire inline declaration**, so it silently wiped the flex settings `setSize()` had just applied and the button order came out upside down — attack at the top of the screen, out of thumb reach. Position first, size second.
- **`flex-wrap: wrap` re-orders a reversed column.** It has to be `nowrap` or `column-reverse` does not do what it says.
- **The pause button sat directly on top of attack** in the first layout. It lives top-left in bars mode now, the only genuinely empty corner.
- A row of five buttons must be **sized to the width it is given** or the last one hangs off the edge, which is what portrait did.

### `test/touch.js` — 25 checks
The suite exists because a touch bug is invisible everywhere else: every other test drives `Input.keys` directly, so the entire layer could be dead and the other 236 checks would still pass. It runs in a phone-sized context with `hasTouch`, dispatches **real pointer events at the real elements**, and then looks at what the game did — walking, running only past the threshold, diagonals, attack, jump, roll direction, two thumbs at once, pause, menus, the option turning it off. It also **measures the layout**: no visible control overlaps the canvas in bars mode, attack is nearer the thumb than back attack, everything is on screen, and the pause button is not on top of anything.

## The music overhaul (BUILD 14 — in the game)

Michael's brief: melodic, not too repetitive, guitars and synth keyboard, no heavy techno but beats where a stage wants them, and a drum and bass stage. Same method as the backgrounds — four options per stage played against a still of the real backdrop, he picks, I write the stage's tracks off the winner.

**Finished and shipped: 35 tracks — 28 stage/boss, 5 front-end, 2 one-shot story cues. All rendered, measured, wired and tested.** Every one of the 21 rooms has a track of its own, and the old `TRACKS` engine is now used by nothing.


### Build 14.1 — the music stopped dead in the middle of fights

Michael: *"the music kept crashing out at the boss fight in stage 1, it would stop playing for a few seconds and then would come back in."* He was right, it was not a scheduler fault, and it was in **29 of the 33 looping tracks** — stage 1's boss was just the one he noticed, because it is the fight people replay.

**What was actually wrong.** Every track was written off the same nine-section template, and the template had two faults that only show up in a game:

1. **Section 0 is a sparse intro, and the form looped back to it.** An intro is right once. Coming back every 40-60 seconds it is not an intro, it is a hole — and on a boss track it landed the moment the boss walked on, then again every loop.
2. **Section 6 is a turnaround on half-time drums with one held bass note.** Standing on its own that is a breakdown. Under combat SFX at the default music volume it is silence. On the four worst boss tracks it had no lead line at all, which is why stage 1's boss was the one that got reported.

boss1 measured: two holes per loop, at 0s and 29.2s, each 3.1s long, the turnaround running at **27% of the density of the fullest bar**. A stage 1 boss fight lasts long enough to hear that four times. That is exactly "it kept crashing out".

**The fix.**
- `loopFrom` on the song, honoured by both `LivePlayer` and `scheduleSong` so the game and the renders agree: after the form plays through, it loops back to `S.loopFrom` instead of section 0. Set to 1 on all 30 tracks that open with an intro. The intro now plays once, when you walk into the room or the boss arrives.
- The turnaround keeps what makes it a turnaround — its own chord run, its clean guitar, its gain dip — and loses only the emptiness: real kit, real bassline, and on `boss1`/`boss2`/`boss3`/`boss4` the song's own riff instead of one ringing note.
- Stage 5 keeps its drum-and-bass drop. Losing the beat while the bass and the tune carry on IS the genre, and it does not read as the music stopping. Only the bass was put back under it.
- **A master soft limiter** in `initBand`: knee at 0.9, hard ceiling at 0.995, 4x oversampled. The chain ran the bus compressor straight into the output with nothing catching a peak, and several tracks sit at 0.97-0.98, so the loop seam — the last bar's ring meeting a full section as the form comes round — was enough to tip one over. Putting a kit under stage 7c's turnaround took it from 0.989 to **1.021 with 3 samples over full scale**, a regression this fix introduced. The limiter fixes it at the source for all 35 tracks and any future edit. Trimming levels was the wrong answer: it would make the music quieter, which is the opposite of what was wanted.

**Measured after, at 16kHz, intro plus a full loop:** every track 0 clipped samples, peaks 0.795-0.980, **quietest bar 43-72% of the loudest with no cliff anywhere** (boss1's was a 27% hole). RMS is identical before and after the limiter on every track measured — 0.1660, 0.1639, 0.1741 — so it is catching peaks, not squashing the mix.

### Three things this taught, all now enforced in code
- **`lab/mus/check_dropouts.js`** — run it after touching any song, before rendering. It walks the **looping body** of every track and fails if both the beat and the tune collapse together for over 2 seconds. The rule is deliberately **relative to each track's own texture**: the Birthing Floor runs on six kit hits a bar from end to end and never sounds like it stopped, while stage 1's boss fell to a quarter of its own norm. An absolute floor flags the first and misses the point of the second. It also catches a form section naming a pattern the song does not define, which is a **silent** fault — that lane simply plays nothing — and is how boss3 lost its entire kit during this very fix, because it has no `main` drum pattern, only `mech`.
- **`RCBand.audit()` and three new checks in `test/music.js`** — the same pattern-name validation plus "every combat track whose first section has no tune loops past it". Note that check is written against a flag saying whether section 0 has a tune, **not** against `introBars`: `introBars` is derived from `loopFrom`, so asserting on it gives a check that can only ever pass. The first version of it did exactly that and had to be rewritten.
- **`mkband.js` now fails the build if any of its string patches stop matching.** `String.replace` with no match is a silent no-op. Adding the limiter renamed the line the output patch was looking for, which would have connected the band straight to the speakers past the game's music bus — full-volume music, ignoring the volume option. Every patch is checked and the generator exits non-zero.
- **`lab/mus/verify_mix.js`** — renders any finished track and prints peak, RMS, clipped samples, the six-band split and the per-bar loudness envelope. Default 16kHz and one pass of the loop (~40-60s per track); `--hifi` for 32kHz and two passes when the spectral numbers have to be comparable with the settled figures. A naive DFT in the first version took longer than the render, so the band split runs on a real FFT.

### The engine (`lab/mus/`)
- `00_eng.js` — a synthesized rock band, all runtime Web Audio, no audio files. Waveshaper distortion (`makeCurve`), procedural convolution reverb (`makeVerbIR`), feedback delay, bus compressor, and a per-song high-shelf tone control (`setTone`). Voices: `Gtr` (lead/chug/power/clean/sustain), `Keys` (ep/organ/pad/stab/pluck), `Bass` (pick/sub/reese/syn), and a kit with kick/snare/hat/ride/crash/tom plus `hiss` (steam), `clank` (struck metal), `drop` (pile driver) and `breakHit` (chopped breaks).
- `01_seq.js` — the song format. A song is **sections, not a loop**: each names its chord run, drum pattern, bass line, guitar part and lead phrase, so the arrangement builds and drops out. `Band` plays live, `scheduleSong` renders offline, and both drive the same `stepEvents`, so the picker and the WAV are the same performance.
- `render*.js` — Playwright + headless Chromium + `OfflineAudioContext` → WAV → mp3. About 7 minutes per 64s track at 32kHz.
- `precheck.js` — **run this before rendering anything new.** Compares a song's voice levels, its top-to-bass ratio, and the tone and drive of its guitar voices against every settled track, and flags anything outside the range. Written after the fourth time a track came back far too bright to find out at the measuring stage; the tone/drive half was added after the level check alone let the Warlord Frame through at 4.6% midrange (two guitars at fuzz/2600 remove the melody's band however loud you set them).
- `19_front.js` — the five front-end tracks (`title` `menu` `shop` `training` `ending`), exported as `FRONT_TRACKS`. The ending uses K4's unpicked major-third idea.
- `20_cues.js` — the two one-shot story cues (`cue_unit9` 7.3s in D minor, `cue_roof` 6.4s in A minor), exported as `CUE_TRACKS`. Each plays once over the top of whatever is happening. `cue_unit9` spends G4's unpicked rising hook — the only melody in the game that ends higher than it starts — on the moment the capsule opens rather than on four minutes of a stage.
- `mkband.js` — **generates `src/p2b_band.js`. The lab is the source of truth: change a song here, re-run this, rebuild.** It wraps engine + sequencer + all ten song files in one closure that exposes only `RCBand`, because the lab engine and `p2_audio.js` both declare `AC` and `noiseBuf`, and because the band's master must go through the game's music bus or the volume option stops working. It also renames the lab's `Band` to `LivePlayer` so there is only ever one thing called `Band` in the file.

### The rules that emerged
- **Never swap the palette when arranging a picked theme.** Keep the voices, the waves and the drive; vary only tempo, density and tone. (Learned the hard way on stage 3: used the right melody with the wrong band and had to rebuild the track.)
- **Measure every render.** Peak, RMS, clipped samples, and a six-band spectral split. The settled tracks sit at sub 21–47%, mid 8–22%, himid 1.1–3.3% — outside that and it will not sit in the soundtrack.
- **Check every new melody against all settled stages before writing a song around it**, and against the other options in its own set. 28 tracks, worst cross-stage overlap 34%.
- `level` feeds the **bus compressor**, not the output, so lowering it to fix a peak can make the peak worse. The game's audio path is float end to end and never clips; clipped samples in a render are an artifact of packing to 16-bit WAV.

### What was picked
| stage | key | theme | tracks |
|---|---|---|---|
| 1 | A minor | M1 rock / M3 synths | `1A Under the El` `1B The Rooftops` `Big Brick Harlan` |
| 2 | G minor | N1 Neon Canyon | `2A Neon Canyon` `2B The Basement` `Ruby & Onyx` |
| 3 | Bb minor | T3 Sunset Steel | `3A Ground Level` `3B The Glass Floor` `Wrecker MK-II` |
| 4 | Ab minor | R4 Coupler Swing | `4A The Roundhouse` `4B The Bridge Run` `Gauge Hollis` |
| 5 | F minor | H2 Sunrise Roll (drum & bass) | `5A The Underpass` `5B Fast Lane` `Vex` |
| 6 | C minor | F2 Robot Line | `6A The Cast House` `6B The Line` `6C The Torpedo Yard` `Slag` |
| 7 | D minor | G3 Chiller | `7A The Clean Corridor` `7B The Cold Store` `7C The Birthing Floor` `Unit-8 Warden` |
| 8 | A minor | K1 The Last Floor | `8A The Blackout Lobby` `8B The Model Room` `8C The Helipad` `Marquess Dray` `Dray // Warlord Frame` |
| front | — | (not picked — written off the chosen stage themes) | `Title` `Menu` `Shop` `Training` `Ending` |
| cues | D / A minor | G4 and a falling-fifths idea | `Unit-9 Freed` `Off The Roof` |

Stage 8 returns to stage 1's key — the only repeat in the game. Files: `02_s1.js`…`17_s8.js` are option sets, `04_stage1.js`…`18_stage8.js` are the finished tracks, `90_viewer.js`…`97_viewer8.js` are the pickers. Picker artifact (reused stage to stage, Version 8 is stage 8): https://claude.ai/artifact/QF8nifBxet2sADue72ezQv

### How it is wired into the game
- `src/p2b_band.js` (~207KB, **generated — do not edit**) carries the whole band. It exposes `init(ctx, dest)`, `ready()`, `has(name)`, `names()`, `seconds(name)`, `play(name)`, `stop()`, `playing()`.
- `Music` in `p2_audio.js` is a facade over **both** engines: `play(name)` routes to `RCBand` when `RCBand.has(name)` and falls back to the old `TRACKS` otherwise. Nothing in the game calls either engine directly, so the fallback path still works even though no id uses it any more.
- `Music.cue(name, back)` plays a one-shot and restores `back` on a `setTimeout`. The capsule cue fires from `breakProp` in `p5_fight.js`; the roof cue fires from the stage-clear block in `p6_stage.js` at `G.clearT === 1`, which is also why that block no longer calls `Music.stop()` on the last fight of stage 8.
- **All 21 rooms now have their own track.** Five scene ids were reassigned in `p4_data.js`: Torpedo Yard → `stage6c`, Cold Store → `stage7b`, Birthing Floor → `stage7c`, Model Room → `stage8b`, Helipad → `stage8c`.
- **Dray's second form gets its own theme.** `BOSS_PHASE_MUSIC = { drayx: 'boss8x' }` in `p4_data.js`, read by `phaseInto` in `p5_fight.js`. `BOSS_RUSH_MUSIC` gained `drayx: 'boss8x'` to match.
- The sound test is now two columns and driven by `musicList()` in `p7_game.js`, so it lists everything both engines own. **`menuList`'s 6th parameter is `align`, not a cursor flag** — passing a boolean there silently left-aligns the column; pass `-1` as the cursor to draw a column with no cursor on it.
- `test/music.js` (16 checks) is the only suite that can catch a music bug at all: every other test passes with the game completely silent. It checks that every id the game can ask for resolves, that no room is silent, that no two rooms share a track, that all 35 have a real length, that routing and `stop` clear both engines, that a cue remembers what to return to, that the capsule frees Unit-9 and fires its cue, that Dray phases and the music switches, and that the band plays through the music bus rather than past it. Headless tests never create an audio context, so each block has to call `window.__rc.initAudio()` first or `Music.play` bails at `if (!AC) return`.

### Still to do for the music
- **Nothing outstanding.** The overhaul is complete and published.
- **The 35 mp3s are one build behind.** They were rendered before the dropout fix and the limiter, so they still have the repeating intros and the empty turnarounds. The game is correct; the files on disk are reference copies. Re-rendering all 35 at full rate is about four hours of unattended render time.
- If a song ever needs changing: edit `lab/mus/`, run `node lab/mus/precheck.js` **and `node lab/mus/check_dropouts.js`**, re-render and measure with `verify_mix.js`, then `node lab/mus/mkband.js` and `./build.sh`. Never edit `src/p2b_band.js`.

## Builds 6–13 — the background overhaul
Michael's brief: stage 1's background was too repetitive. Four *working* concept options per scene, rendered side by side in a lab picker, he picks, I finish the winner in the game. His standing answers: concept pass stage by stage · 4 options · genuinely different buildings, landmarks you walk past, street-level clutter, life in the windows · "anything goes" on renaming and rethinking sections.

**Every scene in the game now has a background of its own. Stages 1–6 settled in builds 6–11, stage 7 in build 12, stage 8 in build 13.**

### The lab
- `lab/bg/` holds the concept toolkit and the per-stage option files. Each stage gets its own picker page, its own `build*.sh`, and its own pick key so earlier stages' choices do not show pre-picked.
- The picker artifact is reused stage to stage: https://claude.ai/artifact/Ha9b1KxXJQqX1dN631epLa — **Version 7 is stage 7, Version 8 is stage 8.**
- Stage 7 files: `15_s7.js` (lab toolkit) · `16_s7a.js` · `17_s7b.js` · `18_s7c.js` · `97_viewer7.js` · `body7.html` + `build7.sh`. Pick key `rc_bg_picks_s7`.
- Stage 8 files: `19_s8.js` (tower toolkit) · `20_s8a.js` · `21_s8b.js` · `22_s8c.js` · `98_viewer8.js` · `body8.html` + `build8.sh`. Pick key `rc_bg_picks_s8`. `98_viewer8.js` exports `s8Overlays(g, L, t, cam, len)` so the picker and the contact sheets share one dispatcher.
- `test/pick7shot.js` renders contact sheets with the HUD band **and** the walkable band painted on, so occlusion mistakes are impossible to miss.

### Stage 7 — THE WORKS (chosen: A1, B3, C4)
| scene | name | `bg` | len |
|---|---|---|---|
| 1 | CLEAN CORRIDOR | `corridor` | 1500 |
| 2 | THE COLD STORE | `coldstore` | 1280 |
| 3 | THE BIRTHING FLOOR | `birth` | 1220 |

- Painters `corridorBg` / `coldStoreBg` / `birthingBg` live at the end of `p6b_city.js` with a stage-7 toolkit above them (`epoxyFloor`, `tileFloor`, `panelWall`, `hazardBand`, `lightStrip`, `cableTray`, `bulkhead`, `viewPane`, `tank`, `rack`, `ceilingSlab`, `ductRun`, `floorGlow`, `floorMark`). `const LAB_TOP = 148` is where every lab floor begins.
- Live overlays in `renderWorld()`: `drawLabHum()` on all three, `drawCryoFog()` on the cold store, `drawCapsuleBubbles()` on the birthing floor. `drawBeam` has a birthing-floor branch — a length of feed header with umbilicals, not a girder.
- The cold store's pit hazard is reskinned as `label: 'WELL'`.
- **The painted berth at x≈700 on the birthing floor is deliberately empty.** The Unit-9 capsule is a breakable the game spawns at that exact x; painting a figure there gives the player two capsules side by side.

### Stage 8 — TOWER TOP (chosen: A4, B3, C3)
| scene | name | `bg` | len |
|---|---|---|---|
| 1 | THE BLACKOUT LOBBY | `blackout` | 1540 |
| 2 | THE MODEL ROOM | `modelroom` | 1420 |
| 3 | THE HELIPAD | `stormpad` | 1240 |

- Painters `blackoutBg` / `modelRoomBg` / `stormPadBg` at the end of `p6b_city.js`, with a tower toolkit above them (`cityPlate`, `curtainWall`, `stoneFloor`, `deckFloor`, `floorVoid`, `railing`, `plantBox`, `mast`, `padMark`, `edgeLights`, `deckMarks`, `chopper`, `modelCity`). `const FLOOR8 = 148` for interiors, `DECK8 = 146` for the roof, `A8_PIT = 960` for the atrium's pit.
- Live overlays: `drawEmergPulse()` + `drawTorchBeams(cx)` on the blackout lobby, `drawCaseGlint(cx)` on the model room, `drawRain()` + `drawLightning()` on the helipad. `drawLightning` and `drawEmergPulse` are both gated on `SAVE.options.flashing`.
- **The pit hazard's default label is already `SHAFT`**, which is exactly right for the lift shaft the lobby's void is painted as — no `label` override needed.
- The model room's nine vitrines hold the earlier stages in miniature (`modelCity` paints `el`/`neon`/`frame`/`yard`/`road`/`works`/`lab`); the centrepiece at x≈1060 is this tower, gold-lit, stencilled **PHASE TWO**. Dray's gallery bio now points at it.
- The helipad's storm is why the finale happens at all: his aircraft is on the pad **strapped down**. `STAGE_TEXT[8]` closes with "THE WEATHER SAYS HE IS GOING TO MISS IT."
- `towerBg` in `p6_stage.js` (for `'atrium'`/`'roof'`) joins `labBg` as unreachable dead code, left in place deliberately.

### What the two lab stages taught
- A background that reads as flat stripes needs **vertical** structure — risers, ladders, mullions, column shafts — not more horizontal detail.
- Anything in the mid layer sitting at the same height as the near layer's subject will fight it. The model room's gallery wall had to be darkened twice before the vitrines won.
- On a roof, the drop only reads if you paint a strip of city **between the handrail and the parapet**; a far-layer city below y=150 is completely occluded by the deck.
- Floor paint (chevrons, keep-clear boxes, tie-down rings, stencilled numbers) is what stops the bottom 40% of a roof scene being a flat field, and none of it breaks the walkable-band rule.

### Hard-won constraints
- **y 0–34 is behind the HUD.** Anything drawn there is invisible in play.
- **y 150–230 is the walkable band** (`TUNING.bandTop/bandBot`). Anything painted there gets walked through; floors must start at y ≤ 150.
- Street scenes: `const GROUND = 142, WALK = 140, CURB = 196, ROAD = 201;` at the top of `p6b_city.js`.
- `buildBackground(kind, len)` in `p6_stage.js` caches into `BG_CACHE` and dispatches by `kind` string. `labBg` (for `'lab'`/`'vault'`) is now unreachable dead code, left in place deliberately.
- A background that reads as flat stripes needs *vertical* structure — risers, ladders, mullions — not more horizontal detail.

### Still to do
- **The overhaul is finished.** Every scene in all eight stages now has its own background.
- **Done in Build 14:** `rage-circuit.html`, `rage-circuit-state.md` and a fresh `rage-circuit-src.zip` are committed to `Desktop\Claude\Rage`, and all 35 soundtrack mp3s are in `Desktop\Claude\Rage\soundtrack\` numbered in game order. The zip excludes the generated picker pages (`lab/*/picker*.html`, `lab/lab.html`) — they are ~9MB of build output and rebuild from `build*.sh`.

## Build 5 — the character art overhaul
Michael's brief: everything about how the characters are *drawn* — shapes, not colours. Maximum detail at 854×480, rebuilt longer-legged rig, a per-character build, heroic comic-book proportions.

### Resolution: the `PX` device scale
- `p1_core.js`: world space stays **426×240** (every gameplay coordinate, hitbox, stage length and wave position is untouched); `const PX = 2` makes the canvas backbuffer 854×480 and `render()` sets `ctx.setTransform(PX,0,0,PX,0,0)`.
- Sprites bake at PX pixels per logical unit (`F = SS * PX` in the baker), so the pixel grid is genuinely twice as fine rather than upscaled.
- `p6_stage.js` `mkCanvas()` gives each background layer a PX-sized backing bitmap with a prescaled context and **shadows `width`/`height` to report the logical size**, so every existing painter gained real detail with no redraw. `bgDraw()` supplies the logical destination size when blitting.
- `fitCanvas` snaps to `Math.floor(s * PX) / PX` so integer scaling still lands on the device grid.

### `GS` vs `VS` — never conflate them again
`GS = 1.3` is the **gameplay** scale: `p5_fight.js` uses it directly for entity `w`/`h`, `hitRange`, `boxHit` z-ranges, `enemyRange` and the air-throw offset. Lowering it to fit the taller rig silently broke the double-flying-kick damage test. `VS = 0.715` is the new **visual trim**, used only inside `lookScale()` and the head scale. Change `VS` for how big a figure looks; never `GS`.

### The rebuilt rig
- `RIG = { thigh: 16.5, shin: 15.5, torso: 21, ua: 12, fa: 11.6, neck: 4.4 }` — longer legs, a shorter, denser torso, a real neck.
- `HEAD_PROP = true`: the head now scales with the whole sprite, so a 1.4× boss no longer wears a street punk's head.
- Every idle, walk and guard pose retuned for the longer forearms (a tighter guard).

### Per-character builds
- `BUILDS` archetype table — `heroic`, `blocky`, `wiry`, `lean`, `suit`, `robot`, `box` — each with shoulder/chest/rib/waist/hip widths, arm and leg thickness profiles, muscle `swell`, foot size, trap mass and neck thickness.
- `CAST_BUILD` assigns a build, a face and explicit overrides per character, so Tank is blocky, Jett wiry, Vex lean, Brick and Slag heavy.
- `buildOf(look)` (cached on `look._bd`) and `girthK(look)` feed every painter.

### New painters
- `taper()` — base tone across the form, a shadow band on the unlit edge, a highlight strip on the lit edge. (The first pass had the light model inverted: whole form in shade, lit half on top, which read flat and dark.)
- `inkLimb()` — one side-walk polygon with discs at interior bends, pad 2.0, no round caps. Sleeve widths add a `cuffW` so the contour clears clothing instead of being painted out.
- `hand2()` (fist longer than wide), `boot2()`, `joint()`.
- `paintTorso` builds a real silhouette from hip → waist → rib → chest → shoulder, then layers anatomy lines and every clothing type over it.
- **Constructed heads** (`HEADS = 'built'`): `paintHead()` / `paintHair()` / `faceOf()` / `FACES` build a skull, jaw and hair from geometry instead of the old 12×14 hand-pixeled stamps, so faces gain detail with the resolution. Branches for robot, helm, masked, hardhat, bald, shades, mohawk, spiky, flattop, slick, bandana, cap, goggles. The stamp path is still in the file behind `HEADS = 'stamp'`.

### Palette bug fixed (long-standing)
`ramp()` pushed saturation **up** on shadow steps and let `hueToward(h, 250, 14)` take the short way round, so a warm skin hue (25°) walked to 11° and the shade tone baked to nearly pure red (`#de3009`). The old tube limbs hid it; the tapered forms expose half the limb in shade. Shadows now cool and **desaturate** with small negative hue shifts.

### Traps hit (build 5)
- **Never call `Artifact action:"read"` between the Read sweep of a saved artifact source and the publish** — the read rewrites the saved file, which invalidates every prior Read and the publish is refused again.
- `process.env` is not available inside `page.evaluate`; pass values as evaluate arguments.
- The Read tool's token cap: `limit: 560` sometimes exceeds 25k tokens on this file; `limit: 500` is reliable.
- Perf looked catastrophic (46 tick+render/s) until the profiler was fixed: `updatePlay` spends 14 ms/tick draining the `G.loadQ` prewarm queue, so a naive measurement window is all prewarm. Drain the queue first, then measure steady state.
- A helper inserted **before** the `const` it references is a TDZ error, not a hoisted function — `BUILDS.box` and the `CAST_BUILD` apply loop have to sit after `buildOf`.

## Build 4 — what changed
**The game is now complete end to end: 8 stages, 6 fighters, 14 bosses, 3 endings, Boss Rush.**

### Two new playable fighters
- **BRUNO "TANK" KOVAČ** — power grappler. POWER 5 / SPEED 1. Heavy 4-hit combo, overhead smash, bull rush, spinning lariat, quake tackle, charged gut punch. **Unique: RUNNING CLUTCH (RUN + Y)** — a lunging strike that converts into a grab on contact (`h.grabs` hit flag → `clutchGrab()`). Shop: LONG CLUTCH, BULLDOZER, DOUBLE LARIAT, IRON HIDE (eats the first hit of any charge attack).
- **JETT RIVERA** — speedster. SPEED 5, lowest damage. 5-hit rapid combo, drill kick, slide kick, helix kick, blur rush, rising blade. **Unique: AIR DASH (Y in the air)** — 13 frames of i-frames and horizontal travel. Shop: DOUBLE AIR DASH, AIR COMBO, BOOST SLIDE, AFTERBURN (the dash burns whoever it passes through).
- `POSE_MAPS` + `mapPose(look, pose)` replace the old fem-only pose remap, so each fighter stands, walks and runs like himself. Used by both `renderEnt` and `buildPrewarm`.

### Stages 4–8
| # | Name | Scenes | Boss |
|---|------|--------|------|
| 4 | LAST TRAIN | Rail Yard → On The Roof | GAUGE HOLLIS |
| 5 | HIGHWAY HEAT | The On-Ramp → **Fast Lane (board run)** | VEX |
| 6 | SYNDICATE WORKS | Foundry → Assembly Line → The Crucible | SLAG |
| 7 | THE LAB | Clean Corridor → The Cold Store → The Birthing Floor *(renamed in build 12)* | UNIT-8 "WARDEN" |
| 8 | TOWER TOP | The Blackout Lobby → **The Model Room (rematches)** → The Helipad *(renamed in build 13)* | MARQUESS DRAY → DRAY // WARLORD FRAME |

- 8 new backgrounds (`yard`, `train`, `road`/`road2`, `works`/`assembly`/`crucible`, `lab`/`vault`, `atrium`/`roof`). `L.speed` makes a background scroll on its own, wrapped and tiled, with `drawSpeedLines()` over the top — used by the train roof and the highway.
- 4 new enemy types: `suit`, `guard` (baton), `biker`, `hvbot` (heavy robot).
- 16 new music tracks (`stage4a`…`stage8b`, `boss4`…`boss8`, `ending`).
- **Stage 5's second scene is a board run** (`scene.ride`): the camera pulls you forward on its own, → pushes and ← hangs back, and every fighter is drawn on a hoverboard.
- **Stage 8's middle scene is a rematch gauntlet** — Big Brick Harlan, then Ruby & Onyx, then Rivet on the helipad before Dray.

### Bosses
- New types: `vex` (its own state machine — blink-steps behind you, knife volleys, a telegraphed dash, enrages at half health) used by Vex and Dray; `beam` bosses (Warden) sight down your lane before firing; `fire` bosses (Slag) leave burning pools (`kind: 'fire'` projectiles that re-arm every 34 frames).
- **Two-phase finale:** a boss whose def names a `next` drops to `bphase` instead of dying and `phaseInto()` stands the next one up in its place. Dray → Dray // Warlord Frame.
- `bossHitReact` is now generic (`t.idleState` instead of a hardcoded `'bidle'`), so every boss type shares the stagger/daze/breakout logic.

### Mastery 4, 5 and 6 are live moves
- **4 — AIR THROW** (all fighters): attack in the air near an airborne enemy and you catch and spike him. `airThrowTarget()` / `startAirThrow()` / `heroAirThrow()`, state `'athrow'`.
- **5 — the air-down drop**: air + ↓ + attack. Cole ELBOW DROP, Anita HEEL DROP, Tank QUAKE PRESS, Jett METEOR KICK. Driven by `MOVES[x].drop` (fall speed) and `.shock` (landing radius).
- **6 — the forward special, upgraded**: `kit.spFPlus` swaps in a longer, harder-hitting version (BURNING CHARGE+, DRIVE KNEE+, QUAKE TACKLE+, BLUR RUSH+).
- 7–10 still name-only placeholders.

### Endings, unlocks, Boss Rush
- **Three endings** decided at the stage 8 tally by `endingFor()`: Easy → plain ending; Medium+ → good; Medium+ **and** the Unit-9 capsule broken on the Birthing Floor → best. Credits roll after.
- **Vex and Unit-9 are earned only** (removed from the shop): beat Vex on stage 5 and she joins; smash the capsule on The Birthing Floor and Unit-9 walks out.
- **Boss Rush** unlocks on a full clear (or in the shop): all 8 bosses back to back in one arena, timed, best time saved per difficulty.
- Move list screen rebuilt as two columns to fit the longer lists.

## Balance
Tier prices 30k/60k/110k/180k/280k; capstones 700k; move upgrades 50k–80k. Medium clears bank ~110–330k depending on stage and grade; the later stages pay much better. Maxing one fighter ≈ 25–30 Medium clears now that stages 4–8 exist.

## Traps hit (build 4)
- **A wave placed past `scene.len - 426` can never trigger** — the camera cannot reach it and the run soft-locks forever. Caught this on stage 8's Executive Floor. `stages48.js` now asserts it for every scene of every stage, including Boss Rush.
- **A boss wave that ends a middle scene must not end the stage.** The clear check needs `lastWave && lastScene`, not just `lastWave`.
- In a test, `const G = r.G` **before** `startRun()` captures the old run state — every arena helper must read `r.G` after starting the run.
- A prop off-screen cannot be hit: heroes are clamped to `camX + W - 12`, so any test that breaks a distant prop must move `G.camX` first.

## Earlier builds
- **Build 3:** boss breakout at 1.5 s or 10 pressure hits; whole cast restyled to a bolder cartoon look (brighter ramps, rim light, 8-way outline, heroic proportions).
- **Build 2:** the pixel-sprite pipeline (`p3b_pix.js`), Anita, stages 2–3, the multi-boss system.
- **Build 1:** the engine, Cole, stage 1, Big Brick.

## Not built yet
Mastery moves 7–10. The story is still placeholder-grade (written, but broad strokes). Mania crowds still bunch on one side sometimes. **The new soundtrack is written and rendered but not wired** — see the music section above for the four steps.
