#!/usr/bin/env node
/* Usage: node tmp/mark.js <col> <status> <file> [file...]
   Of:    node tmp/mark.js --pending <col>   → lijst pending files voor kolom */
const fs = require('fs');
const P = '/home/user/boekhouding-engine/tmp/audit-ledger.md';
const COLS = ['tax','acc','red','gas','onderh','crossPR','inv','voice','docs','onbo','friction','seo','gap','pos'];
const args = process.argv.slice(2);
const md = fs.readFileSync(P, 'utf8').split('\n');

if (args[0] === '--pending') {
  const ci = COLS.indexOf(args[1]);
  if (ci < 0) { console.error('onbekende kolom'); process.exit(1); }
  md.forEach(l => {
    if (!l.startsWith('| ') || l.startsWith('| file')) return;
    const p = l.split('|').map(s => s.trim());
    if (p[3 + ci] === '') console.log(p[1] + '\t' + p[2]);
  });
  process.exit(0);
}

const [col, status, ...files] = args;
const ci = COLS.indexOf(col);
if (ci < 0) { console.error('onbekende kolom: ' + col); process.exit(1); }
const set = new Set(files);
let hits = 0;
const out = md.map(l => {
  if (!l.startsWith('| ') || l.startsWith('| file')) return l;
  const p = l.split('|');
  const file = p[1].trim();
  if (!set.has(file)) return l;
  p[3 + ci] = ' ' + status + ' ';
  hits++; set.delete(file);
  return p.join('|');
});
fs.writeFileSync(P, out.join('\n'));
if (set.size) console.error('NIET GEVONDEN: ' + [...set].join(', '));
console.log(`updated ${hits} cellen in kolom ${col}`);
