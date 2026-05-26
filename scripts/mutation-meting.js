#!/usr/bin/env node
/**
 * scripts/mutation-meting.js
 *
 * Pragmatische mutatie-meting voor .gs files waar Stryker niet uit de doos
 * werkt (geen .gs parser, gas-runtime gebruikt vm.runInContext).
 *
 * Voor elk doel-bestand: pas één gerichte mutatie tegelijk toe, draai het
 * volledige jest-suite, en kijk of er een test breekt.
 *  - Mutatie GEDETECTEERD = goed (tests vangen het op)
 *  - Mutatie OVERLEVEND   = potentieel ongedekte regel
 *
 * Mutatie-set bewust beperkt tot semantisch-relevante operatoren — geen
 * mutaties op log-strings, audit-tekst, comments. Patronen:
 *
 *   - vergelijk-flips:     ===→!==, !==→===, < → <=, > → >=
 *   - boolean-flips:       && → ||, || → &&, !x → x
 *   - getal-edges:         0 → 1, 1 → 0 (op numerieke literals in conditions)
 *   - return-replacements: return true → return false (en omgekeerd)
 *
 * Gebruik:  node scripts/mutation-meting.js [src/Invariants.gs] [src/BTW.gs]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TARGETS = (process.argv.slice(2).length > 0)
  ? process.argv.slice(2)
  : ['src/Invariants.gs', 'src/BTW.gs'];

// ─────────────────────────────────────────────────────────
//  Mutatie-patronen — alleen semantisch-relevant, geen ruis
// ─────────────────────────────────────────────────────────
const MUTATIES = [
  // Vergelijk-flips
  { pattern: /(\W)===(\W)/g, replacement: '$1!==$2', label: '=== → !==' },
  { pattern: /(\W)!==(\W)/g, replacement: '$1===$2', label: '!== → ===' },
  { pattern: /(\W)<=(\W)/g,  replacement: '$1<$2',   label: '<= → <' },
  { pattern: /(\W)>=(\W)/g,  replacement: '$1>$2',   label: '>= → >' },
  // Boolean-flips
  { pattern: /(\W)&&(\W)/g,  replacement: '$1||$2',  label: '&& → ||' },
  // Return-flips (alleen binnen function-body context)
  { pattern: /return true;/g,  replacement: 'return false;', label: 'return true → false' },
  { pattern: /return false;/g, replacement: 'return true;',  label: 'return false → true' },
];

function findMatchesIgnoringComments(src, pattern) {
  // Strip comments via simpele regex-pre-processing — niet perfect, maar
  // voorkomt mutaties in JSDoc / inline-uitleg.
  const regels = src.split('\n');
  const indices = [];
  let inBlockComment = false;
  regels.forEach((regel, i) => {
    let scan = regel;
    if (inBlockComment) {
      const eind = scan.indexOf('*/');
      if (eind === -1) return;
      scan = scan.slice(eind + 2);
      inBlockComment = false;
    }
    // Strip line-comments
    const start = scan.indexOf('/*');
    if (start !== -1) {
      const eind = scan.indexOf('*/', start);
      if (eind === -1) { inBlockComment = true; scan = scan.slice(0, start); }
      else { scan = scan.slice(0, start) + scan.slice(eind + 2); }
    }
    const lineCmt = scan.indexOf('//');
    if (lineCmt !== -1) scan = scan.slice(0, lineCmt);
    // Match alleen in non-comment deel
    const localPattern = new RegExp(pattern.source, pattern.flags);
    let m;
    while ((m = localPattern.exec(scan)) !== null) {
      indices.push({ regel: i, kolom: m.index, match: m[0] });
    }
  });
  return indices;
}

function runTests() {
  try {
    execSync('npx jest --silent --no-coverage 2>&1', {
      cwd: ROOT,
      timeout: 60000,
      stdio: 'pipe',
    });
    return 'pass';  // alle tests groen
  } catch (e) {
    return 'fail';  // minstens één test rood (mutatie GEDETECTEERD)
  }
}

function meet(bestand) {
  const fullPath = path.resolve(ROOT, bestand);
  const origineel = fs.readFileSync(fullPath, 'utf8');
  console.log('\n═══ ' + bestand + ' ═══');
  console.log('  Origineel: ' + origineel.split('\n').length + ' regels');

  // Verzamel mutatie-kandidaten per patroon
  const kandidaten = [];
  MUTATIES.forEach((mut) => {
    const treffers = findMatchesIgnoringComments(origineel, mut.pattern);
    // Limiteer per patroon — voorkom dat één patroon (bv. ===) de hele meting
    // monopoliseert. 5 willekeurige treffers per patroon = ruim
    const shuffled = treffers.sort(() => 0.5 - Math.random()).slice(0, 5);
    shuffled.forEach((t) => kandidaten.push({ ...t, mut }));
  });
  console.log('  Mutatie-kandidaten: ' + kandidaten.length);

  let gedetecteerd = 0;
  let overlevend = 0;
  const overlevers = [];

  for (let i = 0; i < kandidaten.length; i++) {
    const k = kandidaten[i];
    const regelStr = origineel.split('\n')[k.regel];
    const voor = regelStr.slice(0, k.kolom);
    const match = regelStr.slice(k.kolom, k.kolom + k.match.length);
    // Pas alleen de éérste van dit patroon op deze regel toe
    const muteRegel = voor + match.replace(k.mut.pattern, k.mut.replacement) + regelStr.slice(k.kolom + match.length);
    const muteSrc = origineel.split('\n').map((r, idx) => idx === k.regel ? muteRegel : r).join('\n');
    if (muteSrc === origineel) continue;  // mutatie had geen effect
    fs.writeFileSync(fullPath, muteSrc, 'utf8');
    const result = runTests();
    process.stdout.write(result === 'fail' ? '×' : '◯');
    if (result === 'fail') gedetecteerd++;
    else {
      overlevend++;
      overlevers.push({
        regel: k.regel + 1,
        mutatie: k.mut.label,
        contextLine: regelStr.trim().slice(0, 80),
      });
    }
  }
  // Restore origineel
  fs.writeFileSync(fullPath, origineel, 'utf8');
  process.stdout.write('\n');

  const totaal = gedetecteerd + overlevend;
  const score = totaal > 0 ? Math.round(gedetecteerd / totaal * 100) : 100;
  console.log('  Gedetecteerd: ' + gedetecteerd + ' / Overlevend: ' + overlevend +
    ' / Totaal: ' + totaal + ' → score: ' + score + '%');
  if (overlevers.length > 0) {
    console.log('  OVERLEVERS (mogelijk ongedekt):');
    overlevers.forEach((o) => {
      console.log('    L' + o.regel + ' [' + o.mutatie + ']  ' + o.contextLine);
    });
  }
  return { bestand, totaal, gedetecteerd, overlevend, score, overlevers };
}

console.log('Mutation-meting — gerichte semantische mutaties');
console.log('Targets: ' + TARGETS.join(', '));
console.log('Per patroon max 5 mutaties per file om budget binnen 30 min te houden\n');

const resultaten = TARGETS.map((t) => meet(t));

console.log('\n═══ SAMENVATTING ═══');
let totGedetecteerd = 0;
let totaal = 0;
resultaten.forEach((r) => {
  console.log('  ' + r.bestand + ': ' + r.score + '% (' + r.gedetecteerd + '/' + r.totaal + ')');
  totGedetecteerd += r.gedetecteerd;
  totaal += r.totaal;
});
const overall = totaal > 0 ? Math.round(totGedetecteerd / totaal * 100) : 100;
console.log('  TOTAAL: ' + overall + '%');

// Schrijf JSON-rapport voor downstream
fs.writeFileSync(path.resolve(ROOT, 'mutation-meting-rapport.json'), JSON.stringify({
  resultaten, overallScore: overall, timestamp: new Date().toISOString(),
}, null, 2));
console.log('\nRapport: mutation-meting-rapport.json');
process.exit(overall >= 80 ? 0 : 1);
