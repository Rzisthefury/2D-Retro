# Checks

Headless-Chromium suites, one per phase (PLAN 14's "done when"). Each runs the built game,
desktop and emulated iPhone 13, and prints PASS/FAIL per check and a total.

They need Node and Playwright with its Chromium (installed globally, not in this folder:
the game itself has no dependencies). From `Aerial Conquest/`:

    tsc -p tsconfig.json && node build.js
    mkdir -p shots
    node tests/phase6.js aerial-conquest.html shots     # NODE_PATH may need to point at the global node_modules

- `phase0v2.js` … `phase6.js`: the phase suites. Run all of them after any change (regressions).
- `phase5.js`: `RUNS=3` sets the autopilot timing runs per battle type (time bands).
- `probe5.js aerial-conquest.html outpost,keep 2`: autopilot one or more battle types and print
  outcome, time and kills (`GOD=1`, `UPG=1,4` for god mode / upgrade ranks at tiers 1 and 2+).
