/**
 * tests/unit/f-tax-330-investering-afbakening.test.js
 *
 * RATEL (F-TAX-330, tax-compliance-as, klasse 10 — grondslag-afbakening uit
 * grootboek-prefix). De KIA/EIA-investeringssom telde élke 02xx-rekening met
 * positief saldo — inclusief 0290 (cumulatieve afschrijving, contra-actief). Een
 * positief afschrijvingssaldo (na desinvestering-correctie/terugboeking) zou de
 * grondslag opblazen → te hoog advies → naheffing. De chokepoint
 * _isInvesteringsRekening02_ sluit 0x90 expliciet uit i.p.v. te leunen op het
 * saldo-teken. Deze test borgt de afbakening.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.resolve(__dirname, '../../src/Belastingadvies.gs'), 'utf8');
const start = src.indexOf('function _isInvesteringsRekening02_');
const eind = src.indexOf('\nfunction ', start + 1);
const isInvestering = (new Function(src.slice(start, eind) + '\n;return _isInvesteringsRekening02_;'))();

describe('F-TAX-330 — investeringsgrondslag-afbakening (klasse 10)', () => {
  test('echte materiële investering (02xx, niet x90) telt mee', () => {
    expect(isInvestering('0200')).toBe(true);   // machines/installaties
    expect(isInvestering('0250')).toBe(true);   // inventaris
    expect(isInvestering('0210')).toBe(true);
  });

  test('afschrijvings/contra-rekening 0290 telt NIET mee', () => {
    expect(isInvestering('0290')).toBe(false);  // cumulatieve afschrijving
  });

  test('niet-02xx rekeningen tellen niet mee', () => {
    expect(isInvestering('8000')).toBe(false);  // omzet
    expect(isInvestering('0120')).toBe(false);  // 01xx software (RB-grens, nog niet meegeteld)
    expect(isInvestering('4000')).toBe(false);  // kosten
  });

  test('robuust tegen lege/whitespace input', () => {
    expect(isInvestering('')).toBe(false);
    expect(isInvestering(null)).toBe(false);
    expect(isInvestering(' 0200 ')).toBe(true);
  });

  test('de KIA- én EIA-grondslagscan gebruiken de chokepoint', () => {
    expect(src).toContain('_isInvesteringsRekening02_(r[0])');
    expect(src).toContain('_isInvesteringsRekening02_(code)');
  });

  test('CODEBASE-BREED: geen enkele kale `startsWith(\'02\') && parseFloat`-grondslagscan in src/', () => {
    // F-TAX-330-lek (2e ronde): de ban was eerst file-scoped (alleen
    // Belastingadvies.gs) → een 4e instantie in Notificaties.gs ontsnapte. De
    // ban scant nu ÉLK src/*.gs-bestand (omgekeerd, zoals klasse 1) zodat een
    // nieuwe kale 02xx-grondslagscan in welk bestand dan ook in CI faalt.
    const SRC_DIR = path.resolve(__dirname, '../../src');
    const overtreders = [];
    fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.gs')).forEach((f) => {
      const txt = fs.readFileSync(path.join(SRC_DIR, f), 'utf8');
      if (/startsWith\(\s*'02'\s*\)\s*&&\s*parseFloat/.test(txt)) overtreders.push(f);
    });
    expect(overtreders).toEqual([]); // leeg = klasse-10-ban codebase-breed dicht
  });
});
