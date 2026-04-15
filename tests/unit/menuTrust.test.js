/**
 * tests/unit/menuTrust.test.js
 *
 * Menu trust consolidation regressietest (Phase 3K).
 *
 * Doel:
 *   Factuurlijst (openFactuurlijst) is de enige trusted plek voor het
 *   post-hoc versturen van verkoopfacturen. Het oude ui.prompt-tweemaal
 *   pad `stuurVerkoopfactuurPdf` mag NIET meer in het menu staan en mag
 *   NIET meer in de codebase gedefinieerd zijn (anders raakt het alsnog
 *   geëxposeerd via een typo of oude menu-ref).
 *
 * Deze test valideert de menu-source als tekst — het menu zelf kan niet
 * in de GAS-runtime worden aangeroepen zonder een echte SpreadsheetApp.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', '..', 'src');
const MENU_SRC = fs.readFileSync(path.join(SRC_DIR, 'Menu.gs'), 'utf8');
const VF_SRC = fs.readFileSync(path.join(SRC_DIR, 'Verkoopfacturen.gs'), 'utf8');

describe('Menu trust consolidation (Phase 3K)', () => {
  test('Menu.gs referentie naar openFactuurlijst bestaat nog', () => {
    expect(MENU_SRC).toMatch(/addItem\(.*['"]openFactuurlijst['"]\s*\)/);
  });

  test('Menu.gs heeft géén verwijzing meer naar het oude stuurVerkoopfactuurPdf', () => {
    expect(MENU_SRC).not.toContain('stuurVerkoopfactuurPdf');
  });

  test('Het oude stuurVerkoopfactuurPdf is volledig verwijderd uit Verkoopfacturen.gs', () => {
    // Geen function-definitie meer
    expect(VF_SRC).not.toMatch(/function\s+stuurVerkoopfactuurPdf\b/);
    // Geen losse referentie meer
    expect(VF_SRC).not.toMatch(/\bstuurVerkoopfactuurPdf\b(?!\s*\/\/)/);
  });

  test('stuurFactuurNaarEmailAdres (het trusted pad) bestaat nog', () => {
    expect(VF_SRC).toMatch(/function\s+stuurFactuurNaarEmailAdres\s*\(/);
  });

  test('Factuurlijst & Betalingsherinneringen zijn de enige verzend-entry-points in de Facturen-submenu', () => {
    // Het submenu-blok isoleren: van "Facturen & Betalingen" tot het volgende createMenu
    const submenuMatch = MENU_SRC.match(
      /createMenu\(['"]Facturen & Betalingen['"]\)([\s\S]*?)createMenu\(/
    );
    expect(submenuMatch).not.toBeNull();
    const submenu = submenuMatch[1];

    // Verzend-gerelateerde items die wél mogen bestaan
    expect(submenu).toContain("'openFactuurlijst'");
    expect(submenu).toContain("'stuurBetalingsherinneringen'");

    // Het oude pad mag NIET in de submenu staan
    expect(submenu).not.toContain('stuurVerkoopfactuurPdf');
  });
});
