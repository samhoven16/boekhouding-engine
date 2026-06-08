#!/usr/bin/env node
/**
 * scripts/deploy-licence-release.js
 *
 * `npm run deploy:licence:release` — sync code naar Apps Script (clasp push)
 * EN maak een nieuwe deploy-versie op dezelfde deploymentId.
 *
 * Waarom apart van push:licence:
 *   - `npm run push:licence` synct alleen de code (geen nieuwe versie). Snel,
 *     maakt geen 1/200 budget op. Goed voor staging/dev en lokale testen.
 *   - `npm run deploy:licence:release` doet WEL een nieuwe versie + bumpt
 *     de live /exec URL. Trager, kost 1/200 versies. Voor echte releases.
 *
 * Versie-budget bescherming:
 *   - Toont aantal huidige versies vóór deploy.
 *   - WAARSCHUWING als > 180 (90% van 200-cap).
 *   - HARDE FOUT als ≥ 198 (alleen door owner manueel opruimen via UI).
 *
 * Vereist:
 *   - LICENCE_DEPLOYMENT_ID env var (vaste deployment-ID om te hergebruiken)
 *   - Geauthenticeerde clasp (~/.clasprc.json)
 */

const { execSync } = require('child_process');
const path = require('path');

const DEPLOYMENT_ID = process.env.LICENCE_DEPLOYMENT_ID;
const VERSIE_HARD_CAP = 200;
const VERSIE_WAARSCHUW_DREMPEL = 180;
const VERSIE_BLOCK_DREMPEL = 198;
const LICENCE_DIR = path.resolve(__dirname, '..', 'licence-server');

function run(cmd, opts = {}) {
  return execSync(cmd, {
    cwd: LICENCE_DIR,
    encoding: 'utf8',
    env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' },
    stdio: opts.silent ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    ...opts,
  });
}

function telVersies() {
  try {
    const out = run('npx clasp versions', { silent: true });
    const lijnen = String(out).split('\n').filter((l) => /^[0-9]+ - /.test(l));
    return lijnen.length;
  } catch (e) {
    console.warn('⚠️  Kon versies niet tellen (clasp versions faalde):', e.message);
    return 0;
  }
}

console.log('=== deploy:licence:release ===');
console.log('Doel: code syncen + nieuwe versie op deployment', DEPLOYMENT_ID || '(niet gezet)');
console.log('');

if (!DEPLOYMENT_ID) {
  console.error('❌ Geen LICENCE_DEPLOYMENT_ID env-var gezet.');
  console.error('   Gebruik: LICENCE_DEPLOYMENT_ID=<id> npm run deploy:licence:release');
  console.error('   Of zet hem permanent in .env.local of via shell-profile.');
  process.exit(1);
}

// 1. Versie-budget check
const versies = telVersies();
console.log(`📊 Versie-budget: ${versies}/${VERSIE_HARD_CAP}`);
if (versies >= VERSIE_BLOCK_DREMPEL) {
  console.error('');
  console.error(`❌ STOP: ${versies}/${VERSIE_HARD_CAP} versies. Apps Script weigert nieuwe deploys.`);
  console.error('   Open Apps Script → Versies (klok-icoontje) en verwijder 100+ oude versies.');
  console.error('   Daarna deze command opnieuw draaien.');
  process.exit(1);
}
if (versies >= VERSIE_WAARSCHUW_DREMPEL) {
  console.warn(`⚠️  ${versies}/${VERSIE_HARD_CAP} — ruim binnenkort oude versies op om de cap te ontwijken.`);
  console.warn('');
}

// 2. Code syncen (zonder nieuwe versie)
console.log('📤 Stap 1/2: clasp push (code-sync)');
try {
  run('npx clasp push --force');
} catch (e) {
  console.error('❌ clasp push faalde:', e.message);
  process.exit(1);
}
console.log('✅ Code gepusht naar HEAD');
console.log('');

// 3. Nieuwe versie op bestaande deployment
console.log('🚀 Stap 2/2: clasp deploy (nieuwe versie op deploymentId)');
const beschrijving = `Release ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`;
try {
  run(`npx clasp deploy --deploymentId "${DEPLOYMENT_ID}" --description "${beschrijving}"`);
} catch (e) {
  console.error('');
  console.error('❌ clasp deploy faalde:', e.message);
  console.error('');
  console.error('Mogelijke oorzaken:');
  console.error('  - Versie-limiet 200 bereikt (ondanks pre-check) → opruim via UI');
  console.error('  - LICENCE_DEPLOYMENT_ID is verkeerd of niet meer actief');
  console.error('  - Auth verlopen → npx clasp login opnieuw');
  process.exit(1);
}
console.log('');
console.log(`✅ Live deploy bijgewerkt. Nu ${versies + 1}/${VERSIE_HARD_CAP} versies in gebruik.`);
console.log('   /exec URL ongewijzigd, draait nu op nieuwste code.');
