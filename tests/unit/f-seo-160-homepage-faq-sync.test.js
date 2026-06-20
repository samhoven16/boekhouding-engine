/**
 * tests/unit/f-seo-160-homepage-faq-sync.test.js
 *
 * RATEL (F-SEO-160, seo): de homepage-FAQ-JSON-LD bevatte 3 spook-Q&A's die
 * NIET zichtbaar op de pagina stonden ("Werkt het ook op een Mac?", "Kan mijn
 * boekhouder meekijken?", "Hoe lang duurt het om te beginnen?") en miste juist
 * 4 zichtbare vragen. Google's FAQ-rich-result-beleid eist dat de structured
 * data 1-op-1 met de zichtbare FAQ matcht — anders weigert/bestraft Google de
 * rich-result. Deze test borgt de synchronisatie.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.resolve(__dirname, '../../website/index.html'), 'utf8');

function faqPageVragen() {
  const blocks = HTML.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  for (const b of blocks) {
    const json = JSON.parse(b.replace(/<\/?script[^>]*>/g, '').trim());
    const nodes = Array.isArray(json) ? json : (json['@graph'] || [json]);
    for (const n of nodes) {
      if (n['@type'] === 'FAQPage') return n.mainEntity.map((q) => norm(q.name));
    }
  }
  return null;
}

function zichtbareVragen() {
  const sec = HTML.slice(HTML.indexOf('<section id="faq">'), HTML.indexOf('</section>', HTML.indexOf('<section id="faq">')));
  const sums = sec.match(/<summary>([\s\S]*?)<\/summary>/g) || [];
  return sums.map((s) => norm(s.replace(/<\/?summary>/g, '')));
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();

describe('F-SEO-160 — homepage FAQ-JSON-LD == zichtbare FAQ', () => {
  const jsonld = faqPageVragen();
  const zichtbaar = zichtbareVragen();

  test('er is een parsebaar FAQPage-blok met vragen', () => {
    expect(jsonld).not.toBeNull();
    expect(jsonld.length).toBeGreaterThan(0);
  });

  test('exact evenveel JSON-LD-vragen als zichtbare <summary>-vragen', () => {
    expect(jsonld.length).toBe(zichtbaar.length);
  });

  test('GEEN spook-vraag: elke JSON-LD-vraag staat ook zichtbaar op de pagina', () => {
    const ontbreekt = jsonld.filter((q) => !zichtbaar.includes(q));
    expect(ontbreekt).toEqual([]);
  });

  test('GEEN gemiste vraag: elke zichtbare vraag zit ook in de JSON-LD', () => {
    const ontbreekt = zichtbaar.filter((q) => !jsonld.includes(q));
    expect(ontbreekt).toEqual([]);
  });

  test('de 3 oude spook-vragen zijn weg', () => {
    expect(jsonld).not.toContain(norm('Werkt het ook op een Mac?'));
    expect(jsonld).not.toContain(norm('Kan mijn boekhouder meekijken?'));
    expect(jsonld).not.toContain(norm('Hoe lang duurt het om te beginnen?'));
  });
});
