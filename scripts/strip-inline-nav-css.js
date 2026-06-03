#!/usr/bin/env node
'use strict';

// Verwijdert inline nav-CSS-regels uit <style>-blokken op alle NL-pagina's.
// /nav.css is de bron van waarheid; inline regels zijn drift-residu van
// vóór de centralisatie (cycle nav-consistency).
//
// Conservatief: alleen regels waarvan ELKE selector demonstrabel nav-only
// is. .logo en .logo span blijven staan — minimaal risico op false positives.

const fs = require('fs');
const path = require('path');

const WEBSITE = path.join(__dirname, '..', 'website');

const NAV_SEL = [
  /^body\s*>\s*nav$/,
  /^\.nav$/,
  /^\.nav-inner$/,
  /^\.nav-toggle$/,
  /^\.nav-toggle\s+\S.*$/,
  /^\.nav-toggle\[[^\]]+\](?:\s+\S.*)?$/,
  /^\.nav-links$/,
  /^\.nav-links\.[\w-]+$/,
  /^\.nav-links\s+\S.*$/,
  /^\.nav-cta$/,
  /^\.nav-mobile-actions$/,
  /^\.nav-cta-mobile$/,
  /^\.nav-cta-desktop$/,
  /^\.nav-cta-mobile\s+a\.nav-cta$/,
  /^\.nav-cta-desktop\s+a\.nav-cta$/,
];

function isNav(sel) {
  const s = sel.trim();
  return NAV_SEL.some((re) => re.test(s));
}

function matchBrace(css, openIdx) {
  let depth = 1;
  for (let i = openIdx + 1; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function skipWsAndComments(css, start) {
  let i = start;
  while (i < css.length) {
    if (/\s/.test(css[i])) {
      i++;
      continue;
    }
    if (css[i] === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }
    break;
  }
  return i;
}

function stripNav(css) {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const prefixStart = i;
    i = skipWsAndComments(css, i);
    const prefix = css.slice(prefixStart, i);
    if (i >= css.length) {
      out += prefix;
      break;
    }

    const open = css.indexOf('{', i);
    if (open === -1) {
      out += prefix + css.slice(i);
      break;
    }
    const close = matchBrace(css, open);
    if (close === -1) {
      out += prefix + css.slice(i);
      break;
    }

    const headerRaw = css.slice(i, open);
    const header = headerRaw.trim();
    const body = css.slice(open + 1, close);

    if (/^@(media|supports|layer)\b/i.test(header)) {
      const cleanedBody = stripNav(body);
      if (cleanedBody.replace(/\s/g, '') !== '') {
        out += prefix + headerRaw + '{' + cleanedBody + '}';
      } else {
        out += prefix;
      }
    } else if (/^@/.test(header)) {
      out += prefix + headerRaw + '{' + body + '}';
    } else {
      const selectors = header.split(',').map((s) => s.trim()).filter(Boolean);
      const allNav = selectors.length > 0 && selectors.every(isNav);
      if (!allNav) {
        out += prefix + headerRaw + '{' + body + '}';
      } else {
        out += prefix;
      }
    }
    i = close + 1;
  }
  return out;
}

function processHtml(html) {
  return html.replace(/<style>([\s\S]*?)<\/style>/g, (full, css) => {
    const cleaned = stripNav(css);
    if (cleaned.replace(/\s/g, '') === '') return '';
    return '<style>' + cleaned + '</style>';
  });
}

function lijstHtml(dir, uit = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'en') continue;
      lijstHtml(p, uit);
    } else if (entry.name.endsWith('.html')) {
      uit.push(p);
    }
  }
  return uit;
}

function main() {
  const bestanden = lijstHtml(WEBSITE);
  let aantal = 0;
  for (const f of bestanden) {
    const origineel = fs.readFileSync(f, 'utf8');
    if (origineel.indexOf('<style>') === -1) continue;
    const nieuw = processHtml(origineel);
    if (nieuw === origineel) continue;
    fs.writeFileSync(f, nieuw);
    aantal++;
    const before = origineel.length;
    const after = nieuw.length;
    console.log('CLEAN ' + path.relative(WEBSITE, f) + '  (-' + (before - after) + ' bytes)');
  }
  console.log('\n' + aantal + ' bestanden opgeschoond.');
}

main();
