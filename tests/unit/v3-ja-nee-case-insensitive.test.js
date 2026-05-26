/**
 * tests/unit/v3-ja-nee-case-insensitive.test.js
 *
 * V3-FIX (boete-preventie + besparingsverlies-preventie):
 * isJa_ / isNee_ centraliseren case-insensitive interpretatie van klant-
 * toggles in Instellingen. Strikte === 'Ja'-checks lieten één typo silent
 * een feature uitzetten — onverdedigbaar voor BTW-reminder (boete-risico)
 * en auto-boeking herhalende kosten (gemiste aftrek).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createGasRuntime } = require('../__helpers__/gas-runtime');

const SRC = path.resolve(__dirname, '../../src');

describe('V3: isJa_ — vergevingsgezinde matcher', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs']);
  });

  test.each([
    ['Ja'], ['ja'], ['JA'], ['jA'], [' Ja '], ['ja '], ['  ja  '],
    ['yes'], ['Yes'], ['YES'], ['y'], ['Y'],
    ['true'], ['True'], ['TRUE'],
    ['1'],
    ['aan'], ['Aan'], ['AAN'],
    ['on'], ['On'], ['ON'],
  ])('"%s" → true', (v) => {
    expect(ctx.isJa_(v)).toBe(true);
  });

  test.each([
    ['Nee'], ['nee'], ['NEE'], ['no'], ['n'],
    ['false'], ['FALSE'], ['0'], ['uit'], ['off'],
    [''], ['  '], ['abc'], ['Misschien'], ['onbekend'],
  ])('"%s" → false', (v) => {
    expect(ctx.isJa_(v)).toBe(false);
  });

  test('boolean true → true, boolean false → false', () => {
    expect(ctx.isJa_(true)).toBe(true);
    expect(ctx.isJa_(false)).toBe(false);
  });

  test('null/undefined → false (geen crash)', () => {
    expect(ctx.isJa_(null)).toBe(false);
    expect(ctx.isJa_(undefined)).toBe(false);
  });

  test('getal 1 → true, getal 0 → false (via String-coercion)', () => {
    expect(ctx.isJa_(1)).toBe(true);
    expect(ctx.isJa_(0)).toBe(false);
  });
});

describe('V3: isNee_ — expliciete tegenhanger (niet !isJa_)', () => {
  let ctx;
  beforeAll(() => {
    ctx = createGasRuntime(['Config.gs', 'Utils.gs']);
  });

  test.each([['Nee'], ['nee'], ['NEE'], ['no'], ['n'], ['false'], ['0'], ['uit'], ['off']])(
    '"%s" → true (expliciet nee)',
    (v) => { expect(ctx.isNee_(v)).toBe(true); }
  );

  test('Leeg/null/onbekend → false (= niet expliciet nee)', () => {
    expect(ctx.isNee_('')).toBe(false);
    expect(ctx.isNee_(null)).toBe(false);
    expect(ctx.isNee_(undefined)).toBe(false);
    expect(ctx.isNee_('abc')).toBe(false);
    expect(ctx.isNee_('Misschien')).toBe(false);
  });

  test('Ja-varianten → false (NIET nee)', () => {
    expect(ctx.isNee_('Ja')).toBe(false);
    expect(ctx.isNee_('ja')).toBe(false);
    expect(ctx.isNee_('yes')).toBe(false);
  });

  test('Boolean true → false, false → true', () => {
    expect(ctx.isNee_(true)).toBe(false);
    expect(ctx.isNee_(false)).toBe(true);
  });
});

describe('V3: featureAan_ gebruikt nu isJa_/isNee_ (alle varianten werken)', () => {
  function maakCtx(klantOverride) {
    const ctx = createGasRuntime(['Config.gs', 'Utils.gs']);
    // Override getInstelling_ om de Feature:-key te simuleren
    ctx.getInstelling_ = (k) => (k === 'Feature: testpijl' ? klantOverride : null);
    return ctx;
  }

  test('"Ja" → aan', () => { expect(maakCtx('Ja').featureAan_('testpijl')).toBe(true); });
  test('"ja" → aan (was voorheen STIL uit)', () => { expect(maakCtx('ja').featureAan_('testpijl')).toBe(true); });
  test('"JA" → aan', () => { expect(maakCtx('JA').featureAan_('testpijl')).toBe(true); });
  test('" Ja " → aan', () => { expect(maakCtx(' Ja ').featureAan_('testpijl')).toBe(true); });
  test('"yes" → aan', () => { expect(maakCtx('yes').featureAan_('testpijl')).toBe(true); });
  test('"Nee" → uit', () => { expect(maakCtx('Nee').featureAan_('testpijl')).toBe(false); });
  test('"nee" → uit', () => { expect(maakCtx('nee').featureAan_('testpijl')).toBe(false); });
  test('"" leeg → valt door naar default (false voor onbekende feature)', () => {
    expect(maakCtx('').featureAan_('testpijl')).toBe(false);
  });
});

describe('V3: silent-fail callsites zijn gefixt (broncode-check)', () => {
  test('Triggers.gs:1386 — BTW-reminder via isJa_, niet via === "Ja"', () => {
    const src = fs.readFileSync(path.join(SRC, 'Triggers.gs'), 'utf8');
    expect(src).toMatch(/isJa_\(getInstelling_\(['"]BTW aangifte herinnering['"]\)\)/);
    expect(src).not.toMatch(/getInstelling_\(['"]BTW aangifte herinnering['"]\)\s*===\s*['"]Ja['"]/);
  });

  test('HerhalendeKosten.gs:300 — auto-boeking via isJa_, niet via === "Ja"', () => {
    const src = fs.readFileSync(path.join(SRC, 'HerhalendeKosten.gs'), 'utf8');
    expect(src).toMatch(/isJa_\(auto\)/);
    expect(src).not.toMatch(/auto\s*===\s*['"]Ja['"]/);
  });

  test('Geen overgebleven === "Ja"/"Nee" toggle-checks elders in src/', () => {
    // Scan álle src-bestanden — exclude generieke "string === 'Ja'" buiten
    // toggle-context (bv. status-vergelijkingen die WEL strict moeten zijn).
    const files = fs.readdirSync(SRC).filter(f => f.endsWith('.gs'));
    const probleemRegels = [];
    for (const f of files) {
      const inhoud = fs.readFileSync(path.join(SRC, f), 'utf8');
      inhoud.split('\n').forEach((regel, i) => {
        // Match: getInstelling_(...)  === 'Ja' / 'Nee'   (= silent-fail patroon)
        if (/getInstelling_\([^)]+\)\s*===\s*['"](Ja|Nee)['"]/.test(regel)) {
          probleemRegels.push(`${f}:${i + 1}  ${regel.trim()}`);
        }
      });
    }
    if (probleemRegels.length > 0) {
      console.error('Resterende silent-fail callsites:\n' + probleemRegels.join('\n'));
    }
    expect(probleemRegels).toEqual([]);
  });
});
