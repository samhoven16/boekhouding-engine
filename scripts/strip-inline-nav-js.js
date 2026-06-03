#!/usr/bin/env node
/**
 * scripts/strip-inline-nav-js.js — orphan-cleanup na sync-nav.js.
 *
 * Negen pagina's hadden de hamburger-IIFE inline (in twee whitespace-
 * varianten). Nu `/nav.js` als gedeelde include het werk doet, zou de
 * inline IIFE een tweede click-handler registreren → menu opent + sluit
 * onmiddellijk. Dit script verwijdert het IIFE-block, niet meer dan dat;
 * eventuele andere code in hetzelfde <script>-blok blijft staan.
 *
 * Idempotent: tweede run is no-op.
 *
 * Run: node scripts/strip-inline-nav-js.js
 */
const fs = require('fs');
const path = require('path');

const WEBSITE = path.join(__dirname, '..', 'website');

// Twee inline-varianten in het wild:
//   1. IIFE met var+function: (function(){var btn=document.querySelector(...);...})();
//   2. Arrow-fn block: <script>const toggle = document.querySelector(...);...</script>
// Beide doen exact hetzelfde werk dat /nav.js nu gedeeld doet.
const PATRONEN = [
  /\(function\s*\(\s*\)\s*\{\s*var\s+btn\s*=\s*document\.querySelector\(\s*['"]\.nav-toggle['"]\s*\)[\s\S]*?\}\)\(\)\s*;\s*/,
  /<script>\s*const\s+toggle\s*=\s*document\.querySelector\(\s*['"]\.nav-toggle['"]\s*\)[\s\S]*?<\/script>\s*/,
];

function lijstHtml(dir) {
  const uit = [];
  for (const naam of fs.readdirSync(dir)) {
    const p = path.join(dir, naam);
    const st = fs.statSync(p);
    if (st.isDirectory()) uit.push(...lijstHtml(p));
    else if (naam.endsWith('.html')) uit.push(p);
  }
  return uit;
}

function main() {
  const bestanden = lijstHtml(WEBSITE);
  let aantal = 0;
  for (const f of bestanden) {
    const origineel = fs.readFileSync(f, 'utf8');
    let nieuw = origineel;
    for (const p of PATRONEN) {
      if (p.test(nieuw)) nieuw = nieuw.replace(p, '');
    }
    if (nieuw === origineel) continue;
    fs.writeFileSync(f, nieuw);
    aantal++;
    console.log('STRIP ' + path.relative(WEBSITE, f));
  }
  console.log('\n' + aantal + ' inline nav-handlers verwijderd.');
}

main();
