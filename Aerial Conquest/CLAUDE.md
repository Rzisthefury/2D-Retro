# Aerial Conquest: instructions for Claude Code

Read `PLAN.md` in this folder in full before writing any code. It is the complete, owner-approved spec. Don't redesign. If something in it is unclear or contradicts the engine, stop and ask Michael. Don't guess.

## Hard rules

- **Never run `git add`, `git commit` or `git push`.** Michael commits himself in GitHub Desktop. Deliver files only.
- **Never edit `../Aerial Finisher`.** It is the source you fork in Phase 0. Copy it, don't touch it.
- Work in this folder (`Retro Games/Aerial Conquest`). After every phase, also copy the playable `aerial-conquest.html`, `src/`, `build.js`, `shell.html`, `tsconfig.json`, `README.md` and `PLAN.md` to `C:\Users\shado\OneDrive\Desktop\Claude\Aerial Conquest`. A phase is not delivered until both folders match.
- No npm installs, no dependencies, no bundler. `tsc -p tsconfig.json` then `node build.js`, the same as Aerial Finisher.
- Build one phase at a time, in the order in PLAN.md section 14. Finish each phase's "done when" checks (headless Chromium, desktop and emulated phone) before starting the next.
- Put all new tunable numbers in the `WAR` object in `config.ts`.
- Read PLAN.md section 16 (traps carried over from Aerial Finisher) before Phase 0.

## After each phase

1. Build, run the checks, fix failures.
2. Add a README section for the phase: what changed, and what was verified versus assumed.
3. Sync to the Desktop folder.
4. Report to Michael in a few lines: what works, anything that deviated from the spec and why, and what's next. Then wait for his go-ahead before starting the next phase.

## Michael

Talk straight and keep it concise. Getting facts wrong is his biggest annoyance, so say "verified" only for things you actually ran. Suggest ideas he might not think of, but don't build anything outside the spec without asking.
