#!/usr/bin/env node
/**
 * Haalt de officiële pagina's uit docs/fiscale-bronnen-2026.json opnieuw op en
 * controleert of elk citaat er nog letterlijk staat.
 *   npm run fiscaal:bronnen
 * Exit: 0 alles klopt · 1 een citaat staat er niet meer (bron gewijzigd) ·
 *       2 register verlopen · 3 pagina niet bereikbaar (niet gecontroleerd).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const REGISTER = path.join(__dirname, '..', 'docs', 'fiscale-bronnen-2026.json');

function platteTekst(html) {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&euro;/g, '€').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

function citaatStaatErin(html, citaat) {
  return platteTekst(html).includes(citaat.replace(/\s+/g, ' '));
}

async function main() {
  const reg = JSON.parse(fs.readFileSync(REGISTER, 'utf8'));
  let code = 0;
  if (new Date() > new Date(reg.geldigTot + 'T23:59:59')) {
    console.log(`VERLOPEN: register ${reg.jaar} gold t/m ${reg.geldigTot}. Haal de nieuwe bronnen op.`);
    code = 2;
  }
  const paginas = new Map();
  for (const b of reg.bronnen) {
    if (!paginas.has(b.url)) {
      try {
        const r = await fetch(b.url, { headers: { 'user-agent': 'boekhoudbaar-bronnencheck' } });
        paginas.set(b.url, r.ok ? await r.text() : null);
      } catch (e) { paginas.set(b.url, null); }
    }
    const html = paginas.get(b.url);
    if (html === null) { console.log(`NIET BEREIKBAAR  ${b.id}  ${b.url}`); code = code || 3; continue; }
    if (citaatStaatErin(html, b.citaat)) console.log(`ok               ${b.id}`);
    else { console.log(`AFWIJKEND        ${b.id}  citaat staat niet meer op ${b.url}\n                 "${b.citaat}"`); code = 1; }
  }
  process.exitCode = code;
}

if (require.main === module) main();
module.exports = { platteTekst, citaatStaatErin };
