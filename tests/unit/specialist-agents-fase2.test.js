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

// klantreis-simulator gearchiveerd en vervangen door onboarding-doorloop +
// friction-killer-google-niet-geverifieerd (concreter, scherper).
const NIEUWE_AGENTS = [
  'red-team-adversary',
  'onboarding-doorloop',
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

describe('onboarding-doorloop — concreet per scherm, niet abstract', () => {
  const bron = leesAgent('onboarding-doorloop');
  test('Walks 18 specifieke schermen door, niet 12 abstracte stappen', () => {
    expect(bron).toMatch(/18 schermen|alle 18|18 \|/);
  });
  test('Focus op EXACTE tekst en knoppen, niet "verwachtingen"', () => {
    expect(bron).toMatch(/EXACTE tekst/i);
    expect(bron).toMatch(/klikbare elementen/i);
  });
  test('Vervangt verouderde klantreis-simulator (gearchiveerd)', () => {
    const fs = require('fs');
    const path = require('path');
    const archive = path.resolve(__dirname, '../../.claude/agents/_archived-klantreis-simulator.md.deprecated');
    expect(fs.existsSync(archive)).toBe(true);
  });
});

describe('friction-killer-google-niet-geverifieerd — één gericht probleem', () => {
  const bron = leesAgent('friction-killer-google-niet-geverifieerd');
  test('Beperkt zich tot HET ene scherm dat klanten doodt', () => {
    expect(bron).toMatch(/Geavanceerd/);
    expect(bron).toMatch(/Terug naar veiligheid/);
  });
  test('Audit checkt 5 dimensies: timing, voorbereiding, begeleiding, recovery, vertrouwen', () => {
    expect(bron).toMatch(/A\. Timing/i);
    expect(bron).toMatch(/B\. Voorbereiding/i);
    expect(bron).toMatch(/C\. Begeleiding/i);
    expect(bron).toMatch(/D\. Recovery/i);
    expect(bron).toMatch(/E\. Vertrouwen/i);
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

describe('Totaal: 13 actieve agents (klantreis-simulator → onboarding-doorloop + friction-killer)', () => {
  test('Aantal actieve .md bestanden (deprecated tellen niet)', () => {
    const files = fs.readdirSync(AGENTS_DIR).filter(function(f) {
      return f.endsWith('.md') && !f.endsWith('.deprecated');
    });
    expect(files.length).toBe(13);
  });
});
