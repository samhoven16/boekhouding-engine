#!/usr/bin/env node
/* Usage: node tmp/setcells.js <col> < tsvfile
   TSV lines: <file>\t<status>   (status = done | n.v.t.:reason | F-XXX-nnn[,F-YYY-mmm])
   Reads mapping from stdin, applies per-file status to the given ledger column. */
const fs = require('fs');
const P = '/home/user/boekhouding-engine/tmp/audit-ledger.md';
const COLS = ['tax','acc','red','gas','onderh','crossPR','inv','voice','docs','onbo','friction','seo','gap','pos'];
const col = process.argv[2];
const ci = COLS.indexOf(col);
if (ci < 0) { console.error('onbekende kolom: ' + col); process.exit(1); }
const tsv = fs.readFileSync(0, 'utf8').split('\n').filter(Boolean);
const map = new Map();
for (const line of tsv) {
  const t = line.indexOf('\t');
  if (t < 0) continue;
  const file = line.slice(0, t).trim();
  const status = line.slice(t + 1).trim().replace(/\|/g, '/'); // never break table
  if (file) map.set(file, status);
}
const md = fs.readFileSync(P, 'utf8').split('\n');
let hits = 0;
const out = md.map(l => {
  if (!l.startsWith('| ') || l.startsWith('| file')) return l;
  const p = l.split('|');
  const file = p[1].trim();
  if (!map.has(file)) return l;
  p[3 + ci] = ' ' + map.get(file) + ' ';
  hits++; map.delete(file);
  return p.join('|');
});
fs.writeFileSync(P, out.join('\n'));
if (map.size) console.error('NIET GEVONDEN (' + col + '): ' + [...map.keys()].join(', '));
console.log('updated ' + hits + ' cellen in kolom ' + col);
