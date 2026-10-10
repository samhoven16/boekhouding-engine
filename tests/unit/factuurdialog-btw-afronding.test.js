/**
 * Regressie B-2: de BTW-weergave in de factuurdialog moet half-up op hele centen
 * afronden, gelijk aan rondTariefCent_ op de server. Eerder: Math.round(excl*pct*100)/100
 * gaf voor EUR 21,50 x 21% = 4,515 de waarde 4,51 (float 451.49999999999994).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'NieuweBoeking.gs'), 'utf8');
const m = src.match(/function btwBedrag\(excl, pct\) \{[\s\S]*?\n\}/);
// De dialogcode staat in een template-literal; we draaien exact die functietekst.
const btwBedrag = m ? new Function(m[0] + '; return btwBedrag;')() : null;

// Server-kant: Utils.gs is een GAS-bestand zonder exports; laad de functie uit de bron.
const u = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'Utils.gs'), 'utf8');
const rondTariefCent_ = new Function(u.match(/function rondTariefCent_\([\s\S]*?\n\}/)[0] + '; return rondTariefCent_;')();

describe('factuurdialog BTW-afronding (B-2)', () => {
  test('btwBedrag bestaat in de dialog', () => {
    expect(btwBedrag).toBeInstanceOf(Function);
  });

  test('21,50 x 21% = 4,52 (was 4,51)', () => {
    expect(btwBedrag(21.5, 0.21)).toBe(4.52);
  });

  test('gelijk aan de server voor 0-4000 euro in 1-cent-stappen bij 21%, 9% en 0%', () => {
    for (const t of [0.21, 0.09, 0]) {
      for (let c = 0; c <= 400000; c += 1) {
        const e = c / 100;
        if (btwBedrag(e, t) !== rondTariefCent_(e, t)) throw new Error('verschil bij ' + e + ' tarief ' + t);
      }
    }
  });

  test('de dialog gebruikt btwBedrag en niet meer het float-product', () => {
    expect(src).toMatch(/var btw = btwBedrag\(excl, pct\);/);
    expect(src).not.toMatch(/Math\.round\(excl\*pct\*100\)/);
  });
});
