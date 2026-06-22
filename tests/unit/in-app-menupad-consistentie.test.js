/**
 * tests/unit/in-app-menupad-consistentie.test.js
 *
 * DRIFT-KLASSE-SLUITER (2026-06-22): in-app navigatie-instructies ("ga naar
 * X → Y → Z") in de Apps-Script-code mogen niet verwijzen naar een menu-naam
 * die niet meer bestaat. Het top-level menu is hernoemd van "Boekhouding" naar
 * **"Boekhoudbaar"** en het submenu "Controle" naar **"Controle & Export"**,
 * maar ~90 strings (alerts, toasts, comments, changelog, e-mailacties) bleven
 * naar de oude namen wijzen → een klant die de instructie volgt zoekt een menu
 * dat er niet is en loopt vast.
 *
 * menu-pad-consistentie.test.js dekt de WEBSITE ↔ Menu.gs; deze dekt de
 * IN-APP-strings in src/*.gs. Faalt zodra een oude menu-naam terugkeert.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '../../src');
const gsFiles = fs.readdirSync(srcDir).filter((f) => f.endsWith('.gs'));

// Stale menu-namen die niet meer in een navigatie-pad mogen voorkomen.
// (Het echte menu: top-level "Boekhoudbaar"; submenu "Controle & Export";
//  item "Alles werkt-check" i.p.v. "Werkt-alles-test".)
const VERBODEN = [
  { token: /Boekhouding →/, uitleg: 'oude top-level-menunaam (nu "Boekhoudbaar →")' },
  { token: /→ Controle →/, uitleg: 'oude submenu-naam (nu "Controle & Export")' },
  { token: /Werkt-alles-test/, uitleg: 'oud item (nu "Alles werkt-check")' },
  { token: /→ Facturen →/, uitleg: 'oude submenu-naam (nu "Facturen & Betalingen")' },
  { token: /→ Overzichten →/, uitleg: 'oude submenu-naam (nu "Overzichten & Rapporten")' },
  { token: /→ Nieuw invoeren/, uitleg: 'oud item (nu "Nieuwe boeking — factuur, kosten of declaratie")' },
];

describe('in-app menu-pad-consistentie (src/*.gs ↔ echte menu-namen)', () => {
  test.each(VERBODEN)('geen enkel src/*.gs-bestand bevat "$token" ($uitleg)', ({ token }) => {
    const treffers = [];
    for (const f of gsFiles) {
      const inhoud = fs.readFileSync(path.join(srcDir, f), 'utf8');
      inhoud.split('\n').forEach((regel, i) => {
        if (token.test(regel)) treffers.push(`${f}:${i + 1}`);
      });
    }
    expect(treffers).toEqual([]);
  });

  test('het echte top-level menu heet "Boekhoudbaar" (anker tegen een toekomstige hernoeming)', () => {
    const menu = fs.readFileSync(path.join(srcDir, 'Menu.gs'), 'utf8');
    expect(menu).toMatch(/createMenu\('Boekhoudbaar'\)/);
  });
});
