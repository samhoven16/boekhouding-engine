/**
 * tests/unit/kvk-cache-permanent.test.js
 *
 * Permanent KvK-cache: 1× per klant + expliciete "Ververs"-knop.
 *
 * Sam's principe: maximaal eenmalig €0,03 KvK Open Data-kost per klant.
 * Bestaande haalDataKvK_ heeft een 24u CacheService-cache — onvoldoende
 * voor een product met "klant raakt niet verrast". Deze module wikkelt
 * een permanent-in-sheet-cache eromheen:
 *   - Eerste klik: 1 API-call → Instellingen-sheet vullen
 *   - Geen impliciete re-fetch (cron, dashboard-refresh, etc.) — ooit
 *   - Bewust "Ververs" klikken: 1 nieuwe API-call, met waarschuwing als
 *     binnen 24u (anti-bombarding)
 *
 * Aanpak: bron-inspectie + functionele simulatie van de rate-limit-tak.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src');
const kvkBron  = fs.readFileSync(path.join(SRC, 'KvKCache.gs'), 'utf8');
const menuBron = fs.readFileSync(path.join(SRC, 'Menu.gs'), 'utf8');

describe('KvKCache.gs — bron-hygiëne', () => {
  test('Publieke menu-handler + private cache-lezer aanwezig', () => {
    expect(kvkBron).toMatch(/function ververseKvKBedrijfsgegevens\s*\(\s*\)/);
    expect(kvkBron).toMatch(/function getKvKCacheDatum_/);
  });

  test('Geen automatische ophalers (cron, onOpen, dagelijkseTaken)', () => {
    // Forward-protection: deze module mag NOOIT vanuit een trigger draaien.
    // Klant moet expliciet menu-item klikken.
    expect(kvkBron).not.toMatch(/dagelijkseTaken/);
    expect(kvkBron).not.toMatch(/_runTaak_/);
    expect(kvkBron).not.toMatch(/onOpen/);
    expect(kvkBron).not.toMatch(/ScriptApp\.newTrigger/);
  });

  test('Roept haalDataKvK_ exact 1× per uitvoering aan', () => {
    const matches = kvkBron.match(/haalDataKvK_\(/g) || [];
    expect(matches.length).toBe(1);
  });

  test('Schrijft naar bestaande Instellingen-keys (geen aparte data-store)', () => {
    // Dezelfde keys die Verkoopfacturen.gs leest voor brief-papier
    expect(kvkBron).toMatch(/setInstelling_\(['"]Bedrijfsnaam['"]/);
    expect(kvkBron).toMatch(/setInstelling_\(['"]Adres['"]/);
    expect(kvkBron).toMatch(/setInstelling_\(['"]Postcode['"]/);
    expect(kvkBron).toMatch(/setInstelling_\(['"]Plaats['"]/);
  });

  test('Schrijft verversingsdatum naar dedicated sleutel (audit-trail)', () => {
    expect(kvkBron).toMatch(/_KVK_CACHE_DATUM_KEY/);
    expect(kvkBron).toMatch(/new Date\(\)\.toISOString\(\)/);
  });

  test('Anti-bombarding: waarschuwt bij herhaling binnen 24u', () => {
    expect(kvkBron).toMatch(/_KVK_VERVERS_RATE_LIMIT_UREN\s*=\s*24/);
    expect(kvkBron).toMatch(/Math\.round\(urenSinds\)/);
    expect(kvkBron).toMatch(/€0,03/);  // klant ziet kosten-uitleg
  });

  test('Validatie: KvK-nummer moet 8 cijfers zijn', () => {
    expect(kvkBron).toMatch(/\/\^\\d\{8\}\$\//);
  });

  test('Geen overschrijving bij mislukte ophaal (fail-safe)', () => {
    const start = kvkBron.indexOf('if (!data)');
    const blok = kvkBron.slice(start, start + 600);
    expect(blok).toMatch(/NIET overschreven/);
    // Bij data=null returnt zonder setInstelling_ aanroepen
    expect(blok).toMatch(/return;/);
  });
});

describe('Menu.gs — wiring', () => {
  test('Menu-item "Ververs bedrijfsgegevens" bestaat onder Instellingen', () => {
    expect(menuBron).toMatch(/Ververs bedrijfsgegevens uit KvK/);
    expect(menuBron).toMatch(/ververseKvKBedrijfsgegevens/);
  });

  test('Label noemt "1× per klant" — zet verwachting van kosten-beperking', () => {
    expect(menuBron).toMatch(/1× per klant/);
  });
});

describe('Functionele simulatie — rate-limit-logic', () => {
  function magOpnieuw(laatsteISO, nuMs, drempelUren) {
    if (!laatsteISO) return { mag: true, urenSinds: null };
    const laatste = new Date(laatsteISO);
    if (!isFinite(laatste.getTime())) return { mag: true, urenSinds: null };
    const urenSinds = (nuMs - laatste.getTime()) / (1000 * 60 * 60);
    return { mag: urenSinds >= drempelUren, urenSinds: urenSinds };
  }

  test('Nooit eerder opgehaald → mag direct', () => {
    expect(magOpnieuw(null, Date.now(), 24).mag).toBe(true);
  });
  test('1 uur geleden → confirmation nodig', () => {
    const r = magOpnieuw(
      new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      Date.now(), 24
    );
    expect(r.mag).toBe(false);
    expect(Math.round(r.urenSinds)).toBe(1);
  });
  test('Net onder 24u (23.5u) → confirmation nodig', () => {
    const r = magOpnieuw(
      new Date(Date.now() - 23.5 * 60 * 60 * 1000).toISOString(),
      Date.now(), 24
    );
    expect(r.mag).toBe(false);
  });
  test('Boven 24u → mag direct', () => {
    const r = magOpnieuw(
      new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      Date.now(), 24
    );
    expect(r.mag).toBe(true);
  });
  test('Corrupte timestamp → fallback mag (geen blokkade)', () => {
    expect(magOpnieuw('niet-een-datum', Date.now(), 24).mag).toBe(true);
  });
});

describe('Anti-regressie: bestaande haalDataKvK_ blijft ongewijzigd', () => {
  test('Utils.gs bevat nog steeds 24u CacheService-cache (gebruikt door andere call-sites)', () => {
    // We veranderen haalDataKvK_ NIET — andere lookups (klant-KvK-validatie)
    // mogen hun korte-termijn cache houden. Onze permanent-cache zit eromheen.
    const utilsBron = fs.readFileSync(path.join(SRC, 'Utils.gs'), 'utf8');
    expect(utilsBron).toMatch(/function haalDataKvK_/);
    expect(utilsBron).toMatch(/cache\.put\(['"]kvk_['"]\s*\+\s*schoon/);
  });
});
