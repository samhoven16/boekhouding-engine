/**
 * tests/unit/specialist-agents-fase3.test.js
 *
 * 3 nieuwe specialisten voor SEO + positionering:
 *
 *   1. seo-strategist          — meta-tags, schema.org, content-density,
 *                                internal linking, technische SEO
 *   2. positionering-redacteur — 3 persona's (starter / eenmanszaak-j2 /
 *                                freelance dev) × klant-facing pagina's
 *   3. content-gap-detector    — Dutch ZZP "People Also Ask" queries
 *                                vs bestaande content
 *
 * Aanleiding: Sam's vraag "site alleen vindbaar op exact 'boekhoudbaar' —
 * voor de rest onvindbaar" + ChatGPT-inspiratie miljardenbedrijf-agents.
 * Pragmatisch advies: zijn echte probleem is SEO + positionering, geen
 * Swarm-architectuur.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.resolve(__dirname, '../../.claude/agents');

function leesAgent(naam) {
  return fs.readFileSync(path.join(AGENTS_DIR, naam + '.md'), 'utf8');
}

function parseFrontmatter(bron) {
  const match = bron.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  const fm = {};
  match[1].split('\n').forEach(function(line) {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (m) fm[m[1]] = m[2].trim();
  });
  return { frontmatter: fm, body: match[2] };
}

const NIEUWE_AGENTS = ['seo-strategist', 'positionering-redacteur', 'content-gap-detector'];

describe('Fase-3 agents — geldige YAML-frontmatter', () => {
  NIEUWE_AGENTS.forEach(function(naam) {
    test(naam + '.md bestaat met name+description+tools+model', () => {
      const p = parseFrontmatter(leesAgent(naam));
      expect(p).not.toBeNull();
      expect(p.frontmatter.name).toBe(naam);
      expect(p.frontmatter.description).toMatch(/Use proactively/i);
      expect(p.frontmatter.description.length).toBeGreaterThan(80);
      expect(p.frontmatter.tools).toBeDefined();
      expect(p.frontmatter.model).toBeDefined();
    });
  });

  NIEUWE_AGENTS.forEach(function(naam) {
    test(naam + ': geen Write/Edit-rechten (reviewer-rol)', () => {
      const p = parseFrontmatter(leesAgent(naam));
      const tools = p.frontmatter.tools || '';
      expect(tools).not.toMatch(/\bWrite\b/);
      expect(tools).not.toMatch(/\bEdit\b/);
      expect(tools).not.toMatch(/\bNotebookEdit\b/);
    });
  });

  NIEUWE_AGENTS.forEach(function(naam) {
    test(naam + ': heeft WebFetch (live Google-data verificatie)', () => {
      const p = parseFrontmatter(leesAgent(naam));
      const tools = p.frontmatter.tools || '';
      expect(tools).toMatch(/WebFetch/);
    });
  });
});

describe('seo-strategist — target keywords + audit-checklist', () => {
  const bron = leesAgent('seo-strategist');

  test('Drie keyword-tiers expliciet: hoge intent / mid-funnel / long-tail', () => {
    expect(bron).toMatch(/Hoge intent/);
    expect(bron).toMatch(/Mid-funnel/);
    expect(bron).toMatch(/Long-tail/);
  });

  test('Concrete NL ZZP keywords genoemd (geen Engels)', () => {
    expect(bron).toMatch(/boekhoudprogramma zzp/);
    expect(bron).toMatch(/moneybird alternatief/);
    expect(bron).toMatch(/zonder abonnement/);
  });

  test('7-puntige audit-checklist (meta/H1/density/schema/linking/gaps/tech)', () => {
    for (let i = 1; i <= 7; i++) {
      expect(bron).toContain('### ' + i + '.');
    }
  });

  test('Schema.org types expliciet genoemd (rich-snippet kansen)', () => {
    expect(bron).toMatch(/WebApplication/);
    expect(bron).toMatch(/FAQPage/);
    expect(bron).toMatch(/BreadcrumbList/);
    expect(bron).toMatch(/Organization/);
  });

  test('Wat je NIET doet: geen content schrijven, geen voice-review', () => {
    expect(bron).toMatch(/Schrijf zelf geen meta-tags/);
    expect(bron).toMatch(/customer-voice/);
  });
});

describe('positionering-redacteur — 3 persona\'s', () => {
  const bron = leesAgent('positionering-redacteur');

  test('Persona A (Linde) — startende ZZP Q1 2026', () => {
    expect(bron).toMatch(/Persona A: Linde/);
    expect(bron).toMatch(/startende ZZP|net begonnen/i);
    expect(bron).toMatch(/Belastingdienst-fouten|overrompeling/i);
  });

  test('Persona B (Marco) — eenmanszaak jaar 2', () => {
    expect(bron).toMatch(/Persona B: Marco/);
    expect(bron).toMatch(/eenmanszaak jaar 2/i);
    expect(bron).toMatch(/Moneybird alternatief/i);
  });

  test('Persona C (Sara) — freelance developer / vendor-lock-in concern', () => {
    expect(bron).toMatch(/Persona C: Sara/);
    expect(bron).toMatch(/developer/i);
    expect(bron).toMatch(/vendor lock-in|open standards|exportable/i);
  });

  test('Score-rubric 1-5 expliciet per persona-pagina kruising', () => {
    expect(bron).toMatch(/5: persona voelt zich begrepen/);
    expect(bron).toMatch(/1: persona haakt af/);
  });

  test('ZZP vs freelancer vs eenmanszaak onderscheid in instructie', () => {
    expect(bron).toMatch(/ZZP'er ≠ freelancer ≠ eenmanszaak/);
  });
});

describe('content-gap-detector — 6 query-categorieën', () => {
  const bron = leesAgent('content-gap-detector');

  test('6 categorieën expliciet: starter / operationeel / strategisch / fiscaal-jaarrond / tools-vergelijking / edge-cases', () => {
    expect(bron).toMatch(/Categorie 1.*[Ss]tarter/);
    expect(bron).toMatch(/Categorie 2.*[Oo]perationeel/);
    expect(bron).toMatch(/Categorie 3.*[Ss]trategisch/);
    expect(bron).toMatch(/Categorie 4.*[Ff]iscaal/);
    expect(bron).toMatch(/Categorie 5.*[Tt]ools/);
    expect(bron).toMatch(/Categorie 6.*[Ee]dge/);
  });

  test('Score-systeem 1-3: BESTAAT / DEELS / ONTBREEKT', () => {
    expect(bron).toMatch(/BESTAAT \(1\)/);
    expect(bron).toMatch(/DEELS \(2\)/);
    expect(bron).toMatch(/ONTBREEKT \(3\)/);
  });

  test('Concrete query-voorbeelden per categorie genoemd (geen vage placeholders)', () => {
    expect(bron).toMatch(/ZZP starten administratie/);
    expect(bron).toMatch(/Credit-nota maken hoe/);
    expect(bron).toMatch(/Moneybird vs e-Boekhouden vs Excel/);
    expect(bron).toMatch(/Balans klopt niet/);
  });

  test('Outline-format voor ontbrekende pagina (anti-vaag advies)', () => {
    expect(bron).toMatch(/suggested slug/);
    expect(bron).toMatch(/outline/);
  });
});

describe('Domein-disjoint: elke nieuwe agent verwijst naar andere 2', () => {
  test('seo-strategist verwijst naar customer-voice (positionering = ander domein)', () => {
    const bron = leesAgent('seo-strategist');
    expect(bron).toMatch(/customer-voice/);
  });

  test('positionering-redacteur verwijst naar seo-strategist', () => {
    const bron = leesAgent('positionering-redacteur');
    expect(bron).toMatch(/seo-strategist/);
  });

  test('content-gap-detector verwijst naar seo-strategist + positionering-redacteur', () => {
    const bron = leesAgent('content-gap-detector');
    expect(bron).toMatch(/seo-strategist/);
    expect(bron).toMatch(/positionering-redacteur/);
  });
});

describe('Totaal: 12 agents in setup (3 + 6 + 3)', () => {
  test('Aantal .md bestanden in .claude/agents/', () => {
    const files = fs.readdirSync(AGENTS_DIR).filter(function(f) {
      return f.endsWith('.md');
    });
    expect(files.length).toBe(12);
  });
});
