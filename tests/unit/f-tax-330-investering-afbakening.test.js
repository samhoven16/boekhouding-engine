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

const mStart = src.indexOf('function _isMilieuInvesteringsRekening_');
const mEind = src.indexOf('\nfunction ', mStart + 1);
const isMilieu = (new Function(src.slice(mStart, mEind) + '\n;return _isMilieuInvesteringsRekening_;'))();

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

  test('de KIA-, EIA- én MIA-grondslagscan gebruiken de chokepoint', () => {
    expect(src).toContain('_isInvesteringsRekening02_(r[0])');
    expect(src).toContain('_isInvesteringsRekening02_(code)');
    expect(src).toContain('_isMilieuInvesteringsRekening_(r[0])');  // F-TAX-335 (MIA)
  });

  test('CODEBASE-BREED + SYNTAX-VOLLEDIG: geen kale grootboek-prefix-grondslagscan zonder chokepoint', () => {
    // Twee lekken in deze klasse-10-ban (2e + 3e ronde): (1) file-scoped → een
    // 4e instantie in Notificaties.gs ontsnapte (F-TAX-334); (2) syntax-scoped →
    // de MIA-scan gebruikte `/^02[67]/.test()` i.p.v. `startsWith('02')` en
    // glipte erlangs (F-TAX-335). De ban scant nu ÉLK src/*.gs én vangt BEIDE
    // syntaxvormen: een grondslag-sommatie = `parseFloat(r[5])` op dezelfde regel
    // als een KALE 0x-prefix-test (startsWith('0…') OF /^0…/-regex), zónder de
    // chokepoint (_is…Rekening…). Élke nieuwe vorm in welk bestand dan ook faalt.
    const SRC_DIR = path.resolve(__dirname, '../../src');
    const overtreders = [];
    fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.gs')).forEach((f) => {
      fs.readFileSync(path.join(SRC_DIR, f), 'utf8').split('\n').forEach((regel, i) => {
        const heeftSaldoSom = /parseFloat\(\s*r\[5\]\s*\)/.test(regel);
        const kalePrefix = /startsWith\(\s*'0\d/.test(regel) || /\/\^0\d/.test(regel);
        const chokepoint = /_is\w*Rekening\w*\(/.test(regel);
        if (heeftSaldoSom && kalePrefix && !chokepoint) overtreders.push(`${f}:${i + 1}`);
      });
    });
    expect(overtreders).toEqual([]); // leeg = klasse-10-ban codebase-breed én syntax-volledig dicht
  });
});

describe('F-TAX-335 — MIA-grondslag-afbakening (klasse 10, 3e ronde)', () => {
  test('milieu-investering 026x/027x telt mee', () => {
    expect(isMilieu('0260')).toBe(true);
    expect(isMilieu('0275')).toBe(true);
  });
  test('contra/afschrijving x90 in de MIA-range telt NIET mee', () => {
    expect(isMilieu('02690')).toBe(false);   // 5-cijferige contra
    expect(isMilieu('02790')).toBe(false);
  });
  test('buiten de MIA-range (gewone 02xx, 0290, niet-02) telt niet mee', () => {
    expect(isMilieu('0200')).toBe(false);   // wél KIA, geen MIA
    expect(isMilieu('0290')).toBe(false);   // afschrijving
    expect(isMilieu('8000')).toBe(false);
    expect(isMilieu('')).toBe(false);
  });
});
