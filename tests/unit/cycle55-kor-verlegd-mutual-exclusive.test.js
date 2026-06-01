/**
 * tests/unit/cycle55-kor-verlegd-mutual-exclusive.test.js
 *
 * Cycle 55 — klant-facing correctie. Een KOR-ondernemer die een verlegde
 * (EU-B2B) transactie factureert kreeg ZOWEL de KOR-verklaring (art. 25
 * Wet OB) ALS de verleggings-verklaring (art. 12 lid 3) op één factuur.
 *
 * Beide claimen "geen BTW" maar op verschillende rechtsgronden →
 * tegenstrijdig + audit-risico. Verlegging is leidend (specifieke
 * EU-B2B-grond); KOR-tekst hoort er niet bij.
 *
 * Oorzaak: korVerklaring-conditie miste `!isVerlegd`. Verlegde factuur
 * heeft heeftBtw=false, dus de oude conditie (korActief && !isVrijgesteld
 * && !heeftBtw) was true.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const VF_SRC = fs.readFileSync(path.join(__dirname, '../../src/Verkoopfacturen.gs'), 'utf8');

describe('CYCLE 55: KOR + verlegd wederzijds exclusief op factuur', () => {
  test('korVerklaring-conditie bevat nu !isVerlegd', () => {
    expect(VF_SRC).toMatch(/korVerklaring\s*=\s*\(korActief\s*&&\s*!isVrijgesteld\s*&&\s*!isVerlegd\s*&&\s*!heeftBtw\)/);
  });

  test('verleggingsVerklaring blijft ongewijzigd op isVerlegd (regressie)', () => {
    expect(VF_SRC).toMatch(/const verleggingsVerklaring\s*=\s*isVerlegd/);
  });

  test('Logische simulatie: KOR-ondernemer + verlegd → alleen verlegging', () => {
    // Repliceer de conditie-logica zoals in source
    const sim = (korActief, isVrijgesteld, isVerlegd, heeftBtw) => ({
      kor: korActief && !isVrijgesteld && !isVerlegd && !heeftBtw,
      verlegd: isVerlegd,
    });

    // KOR-ondernemer doet verlegde EU-B2B-transactie (geen BTW geheven)
    const r = sim(/* korActief */ true, /* vrijgesteld */ false, /* verlegd */ true, /* heeftBtw */ false);
    expect(r.kor).toBe(false);       // KOR-tekst NIET tonen
    expect(r.verlegd).toBe(true);    // verleggings-tekst WEL
  });

  test('Logische simulatie: KOR-ondernemer + binnenlands (geen BTW) → alleen KOR', () => {
    const sim = (korActief, isVrijgesteld, isVerlegd, heeftBtw) => ({
      kor: korActief && !isVrijgesteld && !isVerlegd && !heeftBtw,
      verlegd: isVerlegd,
    });
    const r = sim(true, false, false, false);
    expect(r.kor).toBe(true);
    expect(r.verlegd).toBe(false);
  });

  test('Logische simulatie: normaal BTW-plichtig + verlegd → alleen verlegging', () => {
    const sim = (korActief, isVrijgesteld, isVerlegd, heeftBtw) => ({
      kor: korActief && !isVrijgesteld && !isVerlegd && !heeftBtw,
      verlegd: isVerlegd,
    });
    const r = sim(false, false, true, false);
    expect(r.kor).toBe(false);
    expect(r.verlegd).toBe(true);
  });

  test('Nooit beide verklaringen tegelijk (exhaustieve check)', () => {
    const sim = (korActief, isVrijgesteld, isVerlegd, heeftBtw) => ({
      kor: korActief && !isVrijgesteld && !isVerlegd && !heeftBtw,
      verlegd: isVerlegd,
    });
    for (const kor of [true, false]) {
      for (const vrij of [true, false]) {
        for (const verl of [true, false]) {
          for (const btw of [true, false]) {
            const r = sim(kor, vrij, verl, btw);
            expect(r.kor && r.verlegd).toBe(false);   // nooit beide
          }
        }
      }
    }
  });
});
