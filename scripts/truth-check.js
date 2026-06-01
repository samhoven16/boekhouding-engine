#!/usr/bin/env node
/**
 * truth-check.js — "Truth-Police" audit-sweep.
 *
 * Scant de codebase op claims die de code niet honoreert. Geen runtime, geen
 * push: puur statische analyse over src/*.gs. Bedoeld om "Ghost Features" en
 * "Lying Strings" te vangen vóór een klant ze ziet (de bug-klasse van
 * cycles 65/66/68: een menu-item zonder backing, een tab die vers lijkt
 * maar niet is, een prijs-string die niet matcht met de constante).
 *
 * Checks (alleen deterministisch — geen heuristiek met false positives):
 *   1. GHOST MENU-ITEMS — elke addItem(label, 'handler') moet een bestaande
 *      function 'handler' hebben. Anders: "Script function not found" bij klik.
 *   2. GHOST TRIGGER-HANDLERS — elke ScriptApp.newTrigger('handler') verwijst
 *      naar een handler die bestaat; anders draait de trigger nooit.
 *
 * BEWUST NIET gecheckt: google.script.run.<fn>() in sidebar-HTML. Die calls
 * staan als HTML/JS-string ín .gs met inline-callback-argumenten; regel-
 * gebaseerde regex parseert dat niet betrouwbaar (parens in callbacks breken
 * de keten → false positives). Een noisy check is erger dan geen check.
 *
 * Exit code 1 als er ghosts zijn (CI-bruikbaar). Usage: npm run truth-check
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../src');

/** Alle .gs-bestanden in src/. */
function gsBestanden() {
  return fs.readdirSync(SRC).filter((f) => f.endsWith('.gs'));
}

/** Verzamelt elke top-level functienaam die in src/ gedefinieerd is. */
function verzamelGedefinieerd() {
  const defined = new Set();
  for (const f of gsBestanden()) {
    const txt = fs.readFileSync(path.join(SRC, f), 'utf8');
    const re = /^\s*function\s+([A-Za-z0-9_]+)\s*\(/gm;
    let m;
    while ((m = re.exec(txt))) defined.add(m[1]);
  }
  return defined;
}

/**
 * Vindt string→functie call-sites en geeft per site terug welke handler-naam
 * wordt aangeroepen. patroon moet capture-group 1 = handlernaam hebben.
 */
function vindHandlerRefs(patroon, naam) {
  const refs = [];
  for (const f of gsBestanden()) {
    const lines = fs.readFileSync(path.join(SRC, f), 'utf8').split('\n');
    lines.forEach((line, i) => {
      const re = new RegExp(patroon, 'g');
      let m;
      while ((m = re.exec(line))) {
        refs.push({ file: f, line: i + 1, handler: m[1], soort: naam });
      }
    });
  }
  return refs;
}

/** addItem('Label', 'handler') — label apart vastleggen voor leesbaarheid. */
function vindMenuItems() {
  const refs = [];
  for (const f of gsBestanden()) {
    const lines = fs.readFileSync(path.join(SRC, f), 'utf8').split('\n');
    lines.forEach((line, i) => {
      // addItem( <q>label<q> , <q>handler<q> )  — q ∈ ' " `
      const re = /addItem\(\s*(['"`])([\s\S]*?)\1\s*,\s*(['"`])([A-Za-z0-9_]+)\3/g;
      let m;
      while ((m = re.exec(line))) {
        refs.push({ file: f, line: i + 1, handler: m[4], label: m[2], soort: 'menu-item' });
      }
    });
  }
  return refs;
}

function main() {
  const defined = verzamelGedefinieerd();

  const menuItems = vindMenuItems();
  // Trigger-handlers: ScriptApp.newTrigger('handler') verwijst per string naar
  // een functie die moet bestaan, anders draait de trigger nooit.
  const triggerRefs = vindHandlerRefs("newTrigger\\(\\s*['\"`]([A-Za-z0-9_]+)['\"`]", 'trigger-handler');

  const alle = [].concat(menuItems, triggerRefs);
  const ghosts = alle.filter((r) => !defined.has(r.handler));

  console.log('── Truth-Police audit-sweep ───────────────────────────');
  console.log('Gedefinieerde functies      : ' + defined.size);
  console.log('Menu-items gecontroleerd    : ' + menuItems.length);
  console.log('Trigger-handlers            : ' + triggerRefs.length);
  console.log('───────────────────────────────────────────────────────');

  if (ghosts.length === 0) {
    console.log('✓ Geen ghost-handlers. Elke string→functie-referentie bestaat.');
    process.exit(0);
  }

  console.log('✗ ' + ghosts.length + ' GHOST-handler(s) — referentie zonder bestaande functie:\n');
  ghosts.forEach((g) => {
    console.log('  ' + g.soort + '  ' + g.file + ':' + g.line +
      '  → ' + g.handler + '()' + (g.label ? '   "' + g.label + '"' : ''));
  });
  console.log('\nEen ghost-handler geeft de klant "Script function not found" bij gebruik.');
  process.exit(1);
}

main();
