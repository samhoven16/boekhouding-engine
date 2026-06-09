/**
 * tests/unit/specialist-agents.test.js
 *
 * Valideert dat .claude/agents/*.md correct geformatteerd zijn en dat de
 * agent-definities consistent zijn met hun beoogde reviewer-rol.
 *
 * Drie agents:
 *   1. tax-compliance       — NL fiscaal-review vóór merge
 *   2. gas-runtime-auditor  — GAS-quota-impact
 *   3. customer-voice-editor — klant-facing strings tegen Sam's principes
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

describe('.claude/agents — alle drie specialisten gedefinieerd', () => {
  test('tax-compliance.md bestaat', () => {
    expect(fs.existsSync(path.join(AGENTS_DIR, 'tax-compliance.md'))).toBe(true);
  });
  test('gas-runtime-auditor.md bestaat', () => {
    expect(fs.existsSync(path.join(AGENTS_DIR, 'gas-runtime-auditor.md'))).toBe(true);
  });
  test('customer-voice-editor.md bestaat', () => {
    expect(fs.existsSync(path.join(AGENTS_DIR, 'customer-voice-editor.md'))).toBe(true);
  });
});

describe('Frontmatter geldigheid', () => {
  ['tax-compliance', 'gas-runtime-auditor', 'customer-voice-editor'].forEach(function(naam) {
    test(naam + ': heeft geldige YAML-frontmatter met name, description, tools, model', () => {
      const p = parseFrontmatter(leesAgent(naam));
      expect(p).not.toBeNull();
      expect(p.frontmatter.name).toBe(naam);
      expect(p.frontmatter.description).toMatch(/Use proactively|review|audit|edit/i);
      expect(p.frontmatter.tools).toBeDefined();
      expect(p.frontmatter.model).toBeDefined();
    });
  });
});

describe('Reviewer-rollen: geen schrijfrechten (alleen Read/Grep/Glob/Bash/WebFetch)', () => {
  ['tax-compliance', 'gas-runtime-auditor', 'customer-voice-editor'].forEach(function(naam) {
    test(naam + ': bevat geen Write/Edit-tools', () => {
      const p = parseFrontmatter(leesAgent(naam));
      const tools = p.frontmatter.tools || '';
      expect(tools).not.toMatch(/\bWrite\b/);
      expect(tools).not.toMatch(/\bEdit\b/);
      expect(tools).not.toMatch(/\bNotebookEdit\b/);
    });
  });
});

describe('Domein-overlap voorkomen: elke agent zegt expliciet wat hij NIET doet', () => {
  ['tax-compliance', 'gas-runtime-auditor', 'customer-voice-editor'].forEach(function(naam) {
    test(naam + ': heeft "wat ik niet doe"-sectie + verwijst naar andere agents', () => {
      const bron = leesAgent(naam);
      expect(bron).toMatch(/Wat je niet doet|What you do NOT do/i);
    });
  });
});

describe('tax-compliance: kent de 10 axioma\'s + KIA-staffel', () => {
  const bron = leesAgent('tax-compliance');
  test('Noemt alle 10 axioma-codes I₁ t/m I₁₀', () => {
    // Subscript-cijfers — staan in .claude/wiskundige-fundering.md
    ['I₁', 'I₂', 'I₃', 'I₄', 'I₅', 'I₆', 'I₇', 'I₈', 'I₉', 'I₁₀'].forEach(function(code) {
      expect(bron).toContain(code);
    });
  });
  test('Bevat KIA-staffel-grenzen die overeenkomen met BelastingOptimizer.gs', () => {
    expect(bron).toMatch(/2\.901/);
    expect(bron).toMatch(/69\.765/);
    expect(bron).toMatch(/19\.535/);
    expect(bron).toMatch(/129\.194/);
  });
  test('Bevat verdict-format: AKKOORD / ZORGEN / BLOKKEER', () => {
    expect(bron).toMatch(/AKKOORD/);
    expect(bron).toMatch(/ZORGEN/);
    expect(bron).toMatch(/BLOKKEER/);
  });
  test('Verwijst naar bron-priority (Belastingdienst.nl + .claude/wiskundige-fundering.md)', () => {
    expect(bron).toMatch(/Belastingdienst\.nl/);
    expect(bron).toMatch(/wiskundige-fundering\.md/);
  });
});

describe('gas-runtime-auditor: kent GAS-quota-limits', () => {
  const bron = leesAgent('gas-runtime-auditor');
  test('Vermeldt script-execution-cap 6 min (consumer) + 30 min (Workspace)', () => {
    expect(bron).toMatch(/6 minutes/);
    expect(bron).toMatch(/30 minutes/);
  });
  test('Vermeldt ScriptProperties 500KB total + 9KB/key', () => {
    expect(bron).toMatch(/500KB/);
    expect(bron).toMatch(/9KB/);
  });
  test('Vermeldt mail-quota 100/1500 per dag', () => {
    expect(bron).toMatch(/100 emails/);
    expect(bron).toMatch(/1\.500 emails/);
  });
  test('Vermeldt 20 triggers cap', () => {
    expect(bron).toMatch(/20 installed triggers/);
  });
  test('Flag-rules markeren batched setValues + EmailQuotaGuard', () => {
    expect(bron).toMatch(/setValues\(\)/);
    expect(bron).toMatch(/EmailQuotaGuard/);
  });
});

describe('customer-voice-editor: kent Sam\'s 10 stem-principes', () => {
  const bron = leesAgent('customer-voice-editor');
  test('10 principes genummerd', () => {
    for (let i = 1; i <= 10; i++) {
      expect(bron).toContain('### ' + i + '.');
    }
  });
  test('Principe #1 dekt "klant nooit verrast door kosten"', () => {
    expect(bron).toMatch(/Klant nooit verrast door kosten/);
  });
  test('Concreet voorbeeld uit recente PRs (BYOK)', () => {
    expect(bron).toMatch(/Gemini-key/);
  });
  test('Dutch-first principe', () => {
    expect(bron).toMatch(/Dutch first/);
  });
});

describe('Activatie-richting voor orchestrator', () => {
  ['tax-compliance', 'gas-runtime-auditor', 'customer-voice-editor'].forEach(function(naam) {
    test(naam + ': description bevat concrete trigger-files (geen vage "use sometimes")', () => {
      const p = parseFrontmatter(leesAgent(naam));
      const desc = p.frontmatter.description || '';
      // Description moet expliciet noemen wanneer te gebruiken
      expect(desc.length).toBeGreaterThan(50);
      expect(desc).toMatch(/Use proactively|when reviewing/i);
    });
  });
});
