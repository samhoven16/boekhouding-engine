#!/usr/bin/env node
/* Genereert tmp/audit-ledger.md — één rij per in-scope file, 14 specialist-kolommen.
   Cel-waardes: "" (pending), "n.v.t.:<reden-code>", later "done" of vondst-IDs. */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = '/home/user/boekhouding-engine';
const sh = (c) => execSync(c, { cwd: ROOT, encoding: 'utf8' }).trim();

const list = (cmd) => sh(cmd).split('\n').filter(Boolean);

const srcGs = list('ls src/*.gs');
const licGs = list('ls licence-server/*.gs');
const scripts = list('ls scripts/*.js');
const tests = list('find tests -name "*.js" | sort');
const webHtml = list('find website -name "*.html" | sort');
const webOther = list('find website \\( -name "*.md" -o -name "*.json" -o -name "*.css" \\) | sort');
const docs = list('find docs -name "*.md" | sort');
const claudeMd = list('ls .claude/*.md');
const workflows = list('find .github/workflows -type f | sort');
const rootCfg = ['package.json', 'eslint.config.js', 'jest.config.js', '.clasp.json', 'README.md', 'CLAUDE.md', 'changelog.json'].filter(f => fs.existsSync(path.join(ROOT, f)));

const redRel = new Set(list('cat tmp/_red_relevant.txt'));
const voiceRel = new Set(list('cat tmp/_voice_relevant.txt'));

const FISCAAL = new Set(['Belastingadvies.gs','BTW.gs','BtwExport.gs','BTWReminder.gs','Belastingvoordeel.gs','BelastingOptimizer.gs','Fiscaal.gs','TaxRegistry.gs','Jaarafsluiting.gs','Boekingen.gs','Config.gs','Onboarding.gs','FormeelBewijs.gs','EUVerkoop.gs','Prive.gs','XafExport.gs','Urenregistratie.gs']);
const ACC = new Set(['Boekingen.gs','FormeelBewijs.gs','ExportAccountant.gs','XafExport.gs','BTW.gs','Jaarafsluiting.gs','Invariants.gs','Urenregistratie.gs','Bankboek.gs','BankImport.gs','Inkoopfacturen.gs','Verkoopfacturen.gs','Hygiene.gs','DataPortability.gs','Rapportages.gs']);
const INV = new Set(['Boekingen.gs','Invariants.gs','BoekingEngine.gs','BTW.gs','Jaarafsluiting.gs','Bankboek.gs','Triggers.gs','Utils.gs','Validaties.gs','FormeelBewijs.gs','HerhalendeKosten.gs','Prive.gs']);
const DOCSGS = new Set(['HelpTab.gs','Onboarding.gs','Menu.gs','Assistent.gs','Diagnostiek.gs','GezondheidCheck.gs','EersteKlantCheck.gs','Changelog.gs']);
const ONBO = new Set(['Onboarding.gs','Setup.gs','Menu.gs','EersteKlantCheck.gs','HelpTab.gs','AutoDefaults.gs']);
const FRICTION = new Set(['Setup.gs','Triggers.gs','Onboarding.gs','Licentie.gs','Menu.gs']);
const POS_PAGES = /(index|over|prijzen|functies|demo|faq|start|waarom|vergelijk)/i;
const TAX_TEST = /(btw|belasting|kia|zvw|tarief|fiscaal|suppletie|jaarafsl|kor|verlegd|art17|tariefsjaar)/i;
const INV_TEST = /(invariant|journaal|storno|balans|boeking|betaling-integriteit|immutable|atomic|grootboek|hashketen|audit)/i;

const NVT = {
  tax: 'n.v.t.:geen-fiscale-logica',
  acc: 'n.v.t.:geen-boekhoudkundige-vastlegging',
  red: 'n.v.t.:geen-netwerk/HTML/parse-oppervlak(grep)',
  gas: 'n.v.t.:draait-niet-in-GAS-runtime',
  onderh: 'n.v.t.:geen-onderhoudsoppervlak',
  crossPR: 'n.v.t.:dekking-via-repo-pass',
  inv: 'n.v.t.:raakt-I1-I10-niet',
  voice: 'n.v.t.:geen-klant-strings(grep)',
  docs: 'n.v.t.:geen-doc-oppervlak',
  onbo: 'n.v.t.:niet-in-onboardingpad',
  friction: 'n.v.t.:geen-verificatie/trigger-flow',
  seo: 'n.v.t.:geen-webpagina',
  gap: 'n.v.t.:geen-content-oppervlak',
  pos: 'n.v.t.:geen-positionerings-copy'
};

const COLS = ['tax','acc','red','gas','onderh','crossPR','inv','voice','docs','onbo','friction','seo','gap','pos'];

function row(file, kind) {
  const base = path.basename(file);
  const lines = sh(`wc -l < "${file}"`);
  const c = {}; COLS.forEach(k => c[k] = NVT[k]);
  if (kind === 'gs') {
    c.gas = ''; c.onderh = ''; c.crossPR = '';
    if (FISCAAL.has(base)) c.tax = '';
    if (ACC.has(base)) c.acc = '';
    if (redRel.has(file)) c.red = '';
    if (INV.has(base)) c.inv = '';
    if (voiceRel.has(file)) c.voice = '';
    if (DOCSGS.has(base)) c.docs = '';
    if (ONBO.has(base)) c.onbo = '';
    if (FRICTION.has(base)) c.friction = '';
  } else if (kind === 'script') {
    c.onderh = ''; c.crossPR = '';
    try { if (sh(`grep -lE 'https?://|fetch|child_process|execSync' "${file}" || true`)) c.red = ''; } catch (e) {}
  } else if (kind === 'test') {
    c.crossPR = '';
    if (TAX_TEST.test(base)) c.tax = '';
    if (INV_TEST.test(base)) c.inv = '';
  } else if (kind === 'webhtml') {
    c.seo = ''; c.voice = '';
    if (/^website\/(gids\/|index\.html|faq\/|functies\/|starters\/|gratis\/|vergelijking\/|bronnen\/|tools\/|demo\/|kopen\/)/.test(file)) c.gap = '';
    if (/^website\/(faq\/|functies\/|demo\/|bronnen\/|gids\/|start\/)/.test(file)) c.docs = '';
    if (/^website\/(index\.html|landing\.html|(over|functies|demo|faq|starters|vergelijking|gratis|kopen)\/index\.html)$/.test(file)) c.pos = '';
    let inhoud = '';
    try { inhoud = fs.readFileSync(path.join(ROOT, file), 'utf8'); } catch (e) {}
    if (/geverifieerd|niet.geverifieerd|unsafe|advanced protection|onveilig/i.test(inhoud)) c.friction = '';
    if (/^website\/(start\/|demo\/|faq\/)/.test(file)) c.onbo = '';
  } else if (kind === 'webother') {
    c.seo = ''; c.onderh = '';
  } else if (kind === 'doc') {
    c.docs = ''; c.voice = ''; c.onderh = '';
    if (/wiskundige|invariant/i.test(base)) c.inv = '';
    if (/belasting|btw|fiscaal/i.test(base)) c.tax = '';
  } else if (kind === 'claudemd') {
    c.docs = '';
    if (/wiskundige|invariant/i.test(base)) { c.inv = ''; c.tax = ''; }
    if (/sheet-schemas|flow-maps|repo-map|test-map/i.test(base)) c.crossPR = '';
  } else if (kind === 'cfg') {
    c.onderh = '';
    if (file.startsWith('.github/')) c.red = '';
    if (/jest|eslint|package/.test(base)) c.crossPR = '';
    if (/README|CLAUDE|changelog/i.test(base)) { c.docs = ''; }
    if (/README/i.test(base)) c.voice = '';
  }
  return { file, lines, c };
}

const rows = [];
srcGs.forEach(f => rows.push(row(f, 'gs')));
licGs.forEach(f => rows.push(row(f, 'gs')));
scripts.forEach(f => rows.push(row(f, 'script')));
tests.forEach(f => rows.push(row(f, 'test')));
webHtml.forEach(f => rows.push(row(f, 'webhtml')));
webOther.forEach(f => rows.push(row(f, 'webother')));
docs.forEach(f => rows.push(row(f, 'doc')));
claudeMd.forEach(f => rows.push(row(f, 'claudemd')));
workflows.forEach(f => rows.push(row(f, 'cfg')));
rootCfg.forEach(f => rows.push(row(f, 'cfg')));

let pending = 0, nvt = 0;
let md = `# AUDIT-LEDGER — boekhouding-engine — gegenereerd ${new Date().toISOString()}

Status per cel: leeg = nog te doen | \`done\` = onderzocht, geen vondst | \`F-XXX-nnn\` = vondst-ID(s) | \`n.v.t.:<reden>\` = niet van toepassing met reden.
Kolommen: tax=tax-compliance, acc=accountant-en-belastingdienst, red=red-team-adversary, gas=gas-runtime-auditor, onderh=langlopend-onderhoud, crossPR=cross-pr-regressie, inv=cross-validatie-invariants, voice=customer-voice-editor (incl. kruis-check #10), docs=documentatie-volledigheid, onbo=onboarding-doorloop, friction=friction-killer, seo=seo-strategist, gap=content-gap-detector, pos=positionering-redacteur.
n.v.t.-redenen zijn mechanisch bepaald (grep op oppervlak / bestandstype); zie tmp/gen-ledger.js.
crossPR voor src-files wordt gevuld door de repo-brede diff-pass (git log laatste merges); per-testfile = isolatie-check.

| file | regels | tax | acc | red | gas | onderh | crossPR | inv | voice | docs | onbo | friction | seo | gap | pos |
|------|--------|-----|-----|-----|-----|--------|---------|-----|-------|------|------|----------|-----|-----|-----|
`;
rows.forEach(r => {
  const cells = COLS.map(k => { if (r.c[k] === '') pending++; else nvt++; return r.c[k]; });
  md += `| ${r.file} | ${r.lines} | ${cells.join(' | ')} |\n`;
});
md += `\nTotaal files: ${rows.length}. Te onderzoeken cellen: ${pending}. n.v.t.-cellen: ${nvt}.\n`;
fs.writeFileSync(path.join(ROOT, 'tmp/audit-ledger.md'), md);
console.log(`files=${rows.length} pending=${pending} nvt=${nvt}`);
