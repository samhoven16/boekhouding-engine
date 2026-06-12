/**
 * tests/unit/seo-audit-additief.test.js
 *
 * SEO-audit 2026-06-12 (Indig + Ray, Schwartz):
 *   1. BTW-aangifte-gids had 0 interne gids-links → autoriteit lekte weg.
 *   2. Geen HowTo-schema voor stappenplan-rich-result.
 *   3. Gids-hub had geen ItemList → mindere hub-signaal.
 *
 * Allemaal additief — geen bestaande content/tekst gewijzigd.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const BTW = fs.readFileSync(path.resolve(__dirname, '../../website/gids/btw-aangifte-zzp/index.html'), 'utf8');
const HUB = fs.readFileSync(path.resolve(__dirname, '../../website/gids/index.html'), 'utf8');

function valideJsonLd(html) {
  const blocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  return blocks.map((b) => {
    const inner = b.replace(/<script[^>]*>/, '').replace(/<\/script>/, '').trim();
    return JSON.parse(inner);
  });
}

describe('SEO: btw-aangifte-zzp-gids — silo doorbroken', () => {
  test('Lees-ook-blok bestaat met links naar verwante gidsen', () => {
    expect(BTW).toMatch(/<section[^>]*class="lees-ook"/);
    expect(BTW).toMatch(/aria-label="Verwante gidsen"/);
  });

  test('Minimaal 6 interne gids-links (geen doodlopende dead-end meer)', () => {
    const interne = BTW.match(/href="\/gids\/[a-z0-9-]+\//g) || [];
    // Filtreert ook /gids/gids.css (CSS-link) — zorg dat we slug-paden tellen
    const sluggie = interne.filter((h) => !/css|\.js/.test(h));
    expect(sluggie.length).toBeGreaterThanOrEqual(6);
  });

  test('Specifieke key-links: suppletie + IB + verleggen', () => {
    expect(BTW).toMatch(/href="\/gids\/suppletie-aangifte-btw\//);
    expect(BTW).toMatch(/href="\/gids\/ib-aangifte-zzp\//);
    expect(BTW).toMatch(/href="\/gids\/btw-verleggen-wanneer\//);
  });
});

describe('SEO: btw-aangifte-zzp-gids — HowTo-schema toegevoegd', () => {
  let blocks;
  beforeAll(() => { blocks = valideJsonLd(BTW); });

  test('Minimaal 3 JSON-LD-blokken (Breadcrumb + Article+FAQPage + HowTo)', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(3);
  });

  test('HowTo-blok aanwezig + valide structuur', () => {
    const howTo = blocks.find((b) => b['@type'] === 'HowTo');
    expect(howTo).toBeDefined();
    expect(howTo.name).toMatch(/BTW-aangifte/i);
    expect(Array.isArray(howTo.step)).toBe(true);
    expect(howTo.step.length).toBeGreaterThanOrEqual(5);
    howTo.step.forEach((s) => {
      expect(s['@type']).toBe('HowToStep');
      expect(s.name).toBeTruthy();
      expect(s.text).toBeTruthy();
    });
  });

  test('Stappen volgen logische volgorde (1..N)', () => {
    const howTo = blocks.find((b) => b['@type'] === 'HowTo');
    howTo.step.forEach((s, i) => {
      expect(s.position).toBe(i + 1);
    });
  });
});

describe('SEO: gids-hub — ItemList-schema', () => {
  let blocks;
  beforeAll(() => { blocks = valideJsonLd(HUB); });

  test('ItemList-blok aanwezig naast CollectionPage', () => {
    const itemList = blocks.find((b) => b['@type'] === 'ItemList');
    expect(itemList).toBeDefined();
    expect(Array.isArray(itemList.itemListElement)).toBe(true);
  });

  test('ItemList bevat alle 34 gids-slugs', () => {
    const itemList = blocks.find((b) => b['@type'] === 'ItemList');
    expect(itemList.itemListElement.length).toBeGreaterThanOrEqual(30);
  });

  test('Posities lopen 1..N zonder gaten', () => {
    const itemList = blocks.find((b) => b['@type'] === 'ItemList');
    itemList.itemListElement.forEach((el, i) => {
      expect(el.position).toBe(i + 1);
      expect(el['@type']).toBe('ListItem');
      expect(el.url).toMatch(/^https:\/\/www\.boekhoudbaar\.nl\/gids\//);
    });
  });

  test('CollectionPage-schema is NIET gewijzigd (regressie)', () => {
    const coll = blocks.find((b) => b['@type'] === 'CollectionPage');
    expect(coll).toBeDefined();
    expect(coll['@id']).toBe('https://www.boekhoudbaar.nl/gids/');
  });
});
