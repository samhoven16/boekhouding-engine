/**
 * tests/unit/specialist-agents-fase2.test.js
 *
 * 6 nieuwe specialist-agents toegevoegd na bevinding dat de eerste 6
 * audit-rondes blind vlekken hadden:
 *
 *   1. red-team-adversary       — denkt als aanvaller
 *   2. klantreis-simulator      — speelt nieuwe klant per persona
 *   3. accountant-en-belastingdienst — externe controle simuleren
 *   4. cross-pr-regressie       — naden tussen recent gemerged PRs
 *   5. langlopend-onderhoud     — werkt het over 5 jaar nog?
 *   6. documentatie-volledigheid — kan klant zelf vinden?
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

const NIEUWE_AGENTS = [
  'red-team-adversary',
  'klantreis-simulator',
  'accountant-en-belastingdienst',
  'cross-pr-regressie',
  'langlopend-onderhoud',
  'documentatie-volledigheid',
];

describe('Fase-2 agents — bestaan + geldige frontmatter', () => {
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
    test(naam + ': heeft "wat je niet doet"-sectie voor domein-disjoint', () => {
      const bron = leesAgent(naam);
      expect(bron).toMatch(/Wat je niet doet|What you do NOT do/i);
    });
  });
});

describe('red-team-adversary — adversariële denkwijze', () => {
  const bron = leesAgent('red-team-adversary');
  test('Simuleert ≥4 threat actors', () => {
    const actors = bron.match(/### \d\.\s+/g) || [];
    expect(actors.length).toBeGreaterThanOrEqual(4);
  });
  test('Noemt specifiek timing-attack op HMAC', () => {
    expect(bron).toMatch(/constant-time/i);
  });
  test('Noemt licence-piracy + payment-fraude paden', () => {
    expect(bron).toMatch(/License-pirate/);
    expect(bron).toMatch(/Payment fraudster/);
  });
});

describe('klantreis-simulator — 4 personas + 12 stappen', () => {
  const bron = leesAgent('klantreis-simulator');
  test('4 personas gedefinieerd', () => {
    expect(bron).toMatch(/### Persona 1/);
    expect(bron).toMatch(/### Persona 2/);
    expect(bron).toMatch(/### Persona 3/);
    expect(bron).toMatch(/### Persona 4/);
  });
  test('12 stappen in de klantreis', () => {
    for (let i = 1; i <= 12; i++) {
      expect(bron).toContain(i + '. **');
    }
  });
  test('Per gevonden frictie: persona + stap + verwachting + fix', () => {
    expect(bron).toMatch(/PERSONA:/);
    expect(bron).toMatch(/WAT VERWACHTEN ZE/);
    expect(bron).toMatch(/FIX-RICHTING/);
  });
});

describe('accountant-en-belastingdienst — wet-referenties', () => {
  const bron = leesAgent('accountant-en-belastingdienst');
  test('Citeert wettelijke artikelnummers', () => {
    expect(bron).toMatch(/art\. 52 AWR/i);
    expect(bron).toMatch(/art\. 35 Wet OB/i);
  });
  test('Twee rollen expliciet: accountant + Belastingdienst-controleur', () => {
    expect(bron).toMatch(/Externe accountant/);
    expect(bron).toMatch(/Belastingdienst-controleur/);
  });
  test('Test specifieke financiële constructies (XAF, RGS, saldibalans)', () => {
    expect(bron).toMatch(/XAF/);
    expect(bron).toMatch(/RGS/);
    expect(bron).toMatch(/[Ss]aldibalans/);
  });
});

describe('cross-pr-regressie — detecteert seam-issues', () => {
  const bron = leesAgent('cross-pr-regressie');
  test('Specifieke danger patterns benoemd', () => {
    expect(bron).toMatch(/_HYGIENE_VERWACHTE_TRIGGERS/);
    expect(bron).toMatch(/dagelijkseTaken/);
    expect(bron).toMatch(/_runTaak_/);
  });
  test('Methodiek: git log + git show + grep collisies', () => {
    expect(bron).toMatch(/git log/);
    expect(bron).toMatch(/git show/);
  });
});

describe('langlopend-onderhoud — 5-jaar-horizon', () => {
  const bron = leesAgent('langlopend-onderhoud');
  test('Drie scenarios: blijft, stopt, stopt-met-website-uit', () => {
    expect(bron).toMatch(/Scenario A/);
    expect(bron).toMatch(/Scenario B/);
    expect(bron).toMatch(/Scenario C/);
  });
  test('Checkt API-versies + hardcoded jaartallen', () => {
    expect(bron).toMatch(/hardcoded.*jaartallen/i);
    expect(bron).toMatch(/Mollie/);
    expect(bron).toMatch(/KvK/);
  });
  test('Sam-onbeschikbaarheid expliciet getest', () => {
    expect(bron).toMatch(/Sam.*onbeschikbaarheid|abandoned/i);
  });
});

describe('documentatie-volledigheid — typische klantvragen', () => {
  const bron = leesAgent('documentatie-volledigheid');
  test('Vragenset gedekt: pre-koop / setup / factuur / BTW-aangifte / opzeggen', () => {
    expect(bron).toMatch(/Pre-koop/);
    expect(bron).toMatch(/setup|Setup/);
    expect(bron).toMatch(/factuur/i);
    expect(bron).toMatch(/BTW-aangifte/);
    expect(bron).toMatch(/opzeggen/);
  });
  test('Check-mechanisme: FAQ + in-app help + error-messages', () => {
    expect(bron).toMatch(/FAQ/);
    expect(bron).toMatch(/in-app help/i);
    expect(bron).toMatch(/ui\.alert/);
  });
});

describe('Totaal: 12 agents in setup (na fase-3 SEO/positionering uitbreiding)', () => {
  test('3 fase-1 + 6 fase-2 + 3 fase-3 = 12 agents in .claude/agents/', () => {
    const files = fs.readdirSync(AGENTS_DIR).filter(function(f) {
      return f.endsWith('.md');
    });
    expect(files.length).toBe(12);
  });
});
