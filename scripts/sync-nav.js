#!/usr/bin/env node
/**
 * scripts/sync-nav.js — eenmalig hulpscript voor nav-consistentie-rollout.
 *
 * Achtergrond: audit toonde 17 unieke header-nav-blokken op 48 statische
 * pagina's. Dit script vervangt élke `<nav aria-label="Hoofdnavigatie">…
 * </nav>` (eerste match per file) door de canonieke variant uit
 * `website/nav.css` / `website/nav.js`, en voegt de includes toe in <head>
 * als ze nog niet aanwezig zijn.
 *
 * Skips: `website/en/index.html` (Engelse versie heeft eigen menu).
 *
 * Per-pagina wordt `aria-current="page"` toegepast op de rubriek die
 * overeenkomt met het pad (Functies / Vergelijking / Gidsen / Over / FAQ).
 *
 * Idempotent: meermalen draaien laat het resultaat onveranderd.
 *
 * Run: node scripts/sync-nav.js
 */
const fs = require('fs');
const path = require('path');

const WEBSITE = path.join(__dirname, '..', 'website');
const SKIP = new Set([path.join(WEBSITE, 'en', 'index.html')]);

const NAV_TEMPLATE = (huidig) => `<nav aria-label="Hoofdnavigatie">
  <div class="nav-inner">
    <a href="/" class="logo" aria-label="Boekhoudbaar — home">
      <img src="/logo.svg" alt="Boekhoudbaar" width="260" height="52">
    </a>
    <ul class="nav-links" id="nav-menu" role="list">
      <li><a href="/functies/"${huidig === 'Functies' ? ' aria-current="page"' : ''}>Functies</a></li>
      <li><a href="/vergelijking/"${huidig === 'Vergelijking' ? ' aria-current="page"' : ''}>Vergelijking</a></li>
      <li><a href="/gids/"${huidig === 'Gidsen' ? ' aria-current="page"' : ''}>Gidsen</a></li>
      <li><a href="/over/"${huidig === 'Over' ? ' aria-current="page"' : ''}>Over</a></li>
      <li><a href="/faq/"${huidig === 'FAQ' ? ' aria-current="page"' : ''}>FAQ</a></li>
      <li class="nav-cta-desktop"><a href="/kopen" class="nav-cta">Kopen</a></li>
    </ul>
    <ul class="nav-mobile-actions" role="list" aria-label="Snelle acties">
      <li class="nav-cta-mobile"><a href="/kopen" class="nav-cta">Kopen</a></li>
      <li><button class="nav-toggle" aria-expanded="false" aria-controls="nav-menu" aria-label="Menu openen">
        <svg class="icon-open" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        <svg class="icon-close" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="4" y1="4" x2="20" y2="20"/><line x1="20" y1="4" x2="4" y2="20"/></svg>
      </button></li>
    </ul>
  </div>
</nav>`;

function bepaalHuidig(absPath) {
  const rel = path.relative(WEBSITE, absPath).replace(/\\/g, '/');
  if (rel.startsWith('functies/')) return 'Functies';
  if (rel.startsWith('vergelijking/')) return 'Vergelijking';
  if (rel.startsWith('gids/')) return 'Gidsen';
  if (rel.startsWith('over/')) return 'Over';
  if (rel.startsWith('faq/')) return 'FAQ';
  return null;
}

function vervangNav(html, vervanging) {
  // Eerste <nav …>…</nav> = header-nav. Footer kan ook <nav class="footer-links">
  // bevatten, maar staat altijd ná de header.
  const regex = /<nav\b[^>]*>[\s\S]*?<\/nav>/;
  if (!regex.test(html)) return { html, gewijzigd: false };
  return { html: html.replace(regex, vervanging), gewijzigd: true };
}

function voegIncludesToe(html) {
  let nieuw = html;
  let gewijzigd = false;
  if (!nieuw.includes('href="/nav.css"')) {
    nieuw = nieuw.replace('</head>', '<link rel="stylesheet" href="/nav.css">\n</head>');
    gewijzigd = true;
  }
  if (!nieuw.includes('src="/nav.js"')) {
    nieuw = nieuw.replace('</head>', '<script defer src="/nav.js"></script>\n</head>');
    gewijzigd = true;
  }
  return { html: nieuw, gewijzigd };
}

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
  let aantalGewijzigd = 0;
  for (const f of bestanden) {
    if (SKIP.has(f)) {
      console.log('SKIP   ' + path.relative(WEBSITE, f));
      continue;
    }
    const origineel = fs.readFileSync(f, 'utf8');
    const huidig = bepaalHuidig(f);
    let h = origineel;
    const a = vervangNav(h, NAV_TEMPLATE(huidig));
    h = a.html;
    const b = voegIncludesToe(h);
    h = b.html;
    if (h !== origineel) {
      fs.writeFileSync(f, h);
      aantalGewijzigd++;
      console.log('UPDATE ' + path.relative(WEBSITE, f) + (huidig ? ' [' + huidig + ']' : ''));
    } else {
      console.log('SKIP   ' + path.relative(WEBSITE, f) + ' (al canoniek)');
    }
  }
  console.log('\n' + aantalGewijzigd + ' bestanden gewijzigd.');
}

main();
