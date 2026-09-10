/**
 * tests/unit/factuur-doorbelaste-onkosten-hint.test.js
 *
 * Les uit een echte handmatige factuur (modelwerk + doorbelaste reiskosten):
 * ZZP'ers twijfelen over het BTW-tarief van DOORBELASTE onkosten/reiskosten.
 * Belastingdienst-hoofdregel: bijkomende doorbelaste kosten volgen het tarief
 * van de hoofddienst (meestal 21%) — NIET het 9%-vervoertarief van het los
 * gekochte treinkaartje. Boekhoudbaar hanteert één BTW-tarief per factuur, dus
 * een reiskosten-regel krijgt dat dienst-tarief automatisch; deze hint vertelt
 * de klant dat, zodat 'ie niet ten onrechte naar 9% grijpt.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const nb = fs.readFileSync(path.resolve(__dirname, '../../src/NieuweBoeking.gs'), 'utf8');

describe('Factuur-hint: doorbelaste onkosten volgen het dienst-BTW-tarief', () => {
  const m = nb.match(/<div class="tip">💡 <b>Reiskosten of onkosten doorbelasten[\s\S]*?<\/div>/);

  test('de hint bestaat in het factuurscherm', () => {
    expect(m).not.toBeNull();
  });

  test('de hint geeft het JUISTE advies: zelfde tarief als de dienst, niet 9%', () => {
    const hint = m ? m[0] : '';
    expect(hint).toMatch(/hetzelfde BTW-tarief als je dienst/);
    expect(hint).toMatch(/niet apart op 9%/);        // vangt de klassieke 9%-denkfout af
    expect(hint).toMatch(/extra regel/);              // stuurt naar de juiste handeling
  });

  test('de hint staat ONDER de factuurregels en VÓÓR de totalen (juiste plek)', () => {
    const iRegel = nb.indexOf('Nog een regel');
    const iHint = nb.indexOf('Reiskosten of onkosten doorbelasten');
    const iTot = nb.indexOf('class="totalen"');
    expect(iRegel).toBeGreaterThan(-1);
    expect(iHint).toBeGreaterThan(iRegel);
    expect(iTot).toBeGreaterThan(iHint);
  });
});
