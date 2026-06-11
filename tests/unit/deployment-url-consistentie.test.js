/**
 * tests/unit/deployment-url-consistentie.test.js
 *
 * Klant-blocker-klasse: een verouderde Apps Script deployment-URL ("fossiel")
 * ergens in de website laat een klant op een dode deployment landen na het
 * klikken op "Doorgaan" of na de betaling. Dit is al een keer gebeurd
 * (klant kreeg €49 i.p.v. €0,01 omdat /kopen naar een oude deployment wees).
 *
 * Tests valideren dat ALLE klant-zichtbare deployment-URLs naar EXACT
 * dezelfde deployment wijzen. Faalt zodra één bestand een afwijkende
 * deployment-ID krijgt — vangt de fossiel-bug vóór hij live gaat.
 *
 * Deze test test reachability/consistentie, niet logica — precies de laag
 * die de 2400+ unit-tests NIET dekken.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

// Bestanden die een klant-zichtbare deployment-URL bevatten.
const KLANT_BESTANDEN = [
  'website/kopen/index.html',
  'website/bedankt/index.html',
];

// Doc-bestand dat de canonical waarde documenteert (mag niet achterlopen).
const DOC_BESTAND = 'CONTEXT.md';

const RE_DEPLOY_ID = /AKfycb[A-Za-z0-9_-]{40,}/g;

function leesIds(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return [];
  const bron = fs.readFileSync(abs, 'utf8');
  const set = new Set();
  let m;
  while ((m = RE_DEPLOY_ID.exec(bron)) !== null) set.add(m[0]);
  return Array.from(set);
}

describe('deployment-URL consistentie — klant-zichtbare pagina\'s', () => {
  test('elk klant-bestand gebruikt precies één deployment-ID', () => {
    KLANT_BESTANDEN.forEach(function(f) {
      const ids = leesIds(f);
      expect(ids.length).toBeGreaterThan(0);     // er moet een URL in staan
      expect(ids.length).toBe(1);                // en niet meerdere verschillende
    });
  });

  test('alle klant-bestanden wijzen naar dezelfde deployment', () => {
    const alle = new Set();
    KLANT_BESTANDEN.forEach(function(f) {
      leesIds(f).forEach(function(id) { alle.add(id); });
    });
    if (alle.size > 1) {
      throw new Error(
        'Klant-bestanden wijzen naar VERSCHILLENDE deployments:\n  ' +
        Array.from(alle).join('\n  ') +
        '\nEén ervan is een fossiel — klant landt op een dode deployment.'
      );
    }
    expect(alle.size).toBe(1);
  });

  test('CONTEXT.md documenteert dezelfde deployment als de website', () => {
    const websiteIds = leesIds(KLANT_BESTANDEN[0]);
    const docIds = leesIds(DOC_BESTAND);
    // Het canonical website-ID moet ergens in CONTEXT.md voorkomen.
    expect(docIds).toContain(websiteIds[0]);
  });

  test('de bekende fossiel-deployment komt nergens klant-zichtbaar voor', () => {
    const FOSSIEL = 'AKfycbyq5Xrvh4bFXkcjpjsdaPS-UJm3b7h-X7kGyfdTnDNcNS2brUX0q86pRU7Q2nSMCOWsMg';
    KLANT_BESTANDEN.forEach(function(f) {
      const ids = leesIds(f);
      expect(ids).not.toContain(FOSSIEL);
    });
  });
});
