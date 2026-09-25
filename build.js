const fs = require('fs');
const js = fs.readFileSync('dist/game.js', 'utf8');
const shell = fs.readFileSync('shell.html', 'utf8');
const page = shell.replace('/*__GAME_JS__*/', () => js);
fs.writeFileSync('dist/page.html', page);
// standalone document for running the file locally
fs.writeFileSync('dist/index.html',
  '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
  + '<style>body{margin:0}</style>\n' + page.split('\n<header>')[0] + '\n</head>\n<body>\n<header>'
  + page.split('\n<header>')[1] + '\n</body>\n</html>\n');
console.log('page.html', (page.length / 1024).toFixed(1) + 'kb');
