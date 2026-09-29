/* Build: concatenate src into shell.html.
   Outputs:
     dist/Sundered Crown.html  — standalone document, open it locally
     dist/artifact.html        — content-only body for publishing as an Artifact
   Run: node build.js
*/
const fs = require('fs');
const path = require('path');

const ORDER = [
  'src/data/classes.js',
  'src/data/weapons.js',
  'src/data/terrain.js',
  'src/data/units.js',
  'src/data/story.js',
  'src/data/chapters.js',
  'src/data/worldmap.js',
  'src/core/rng.js',
  'src/systems/stats.js',
  'src/systems/supports.js',
  'src/systems/movement.js',
  'src/systems/combat.js',
  'src/systems/leveling.js',
  'src/systems/ai.js',
  'src/systems/arena.js',
  'src/core/state.js',
  'src/core/undo.js',
  'src/render/sprites.js',
  'src/render/portraits.js',
  'src/render/tiles.js',
  'src/render/ui.js',
  'src/render/map.js',
  'src/render/duel.js',
  'src/audio/music.js',
  'src/main.js'
];

const root = __dirname;
const bundle = ORDER.map(f => {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) throw new Error('missing ' + f);
  return '/* ===== ' + f + ' ===== */\n' + fs.readFileSync(p, 'utf8');
}).join('\n');

const shell = fs.readFileSync(path.join(root, 'shell.html'), 'utf8');
if (shell.indexOf('/*__BUNDLE__*/') === -1) throw new Error('shell.html has no bundle placeholder');
const body = shell.replace('/*__BUNDLE__*/', bundle);

const dist = path.join(root, 'dist');
if (!fs.existsSync(dist)) fs.mkdirSync(dist);

/* artifact: content only, no document wrapper (the host supplies one) */
fs.writeFileSync(path.join(dist, 'artifact.html'), body);

/* standalone: full document */
const standalone =
  '<!doctype html>\n<html lang="en">\n<head>\n' +
  '<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,maximum-scale=1,user-scalable=no">\n' +
  '<meta name="color-scheme" content="dark">\n' +
  '</head>\n<body>\n' + body + '\n</body>\n</html>\n';
fs.writeFileSync(path.join(dist, 'Sundered Crown.html'), standalone);

const kb = n => (n / 1024).toFixed(0) + ' KB';
console.log('bundle   ', kb(Buffer.byteLength(bundle)));
console.log('artifact ', kb(Buffer.byteLength(body)));
console.log('standalone', kb(Buffer.byteLength(standalone)));
