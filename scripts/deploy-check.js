#!/usr/bin/env node
/**
 * deploy-check.js
 * Toont overzicht van geconfigureerde Apps Script projecten + clasp-status.
 * Geen push, geen test — alleen verificatie.
 *
 * Usage: npm run deploy:check
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');

function readClasp(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return null;
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (e) {
    return { error: e.message };
  }
}

function checkAdminEmail() {
  const file = path.join(root, 'src', 'Licentie.gs');
  if (!fs.existsSync(file)) return { ok: false, reason: 'src/Licentie.gs ontbreekt' };
  const txt = fs.readFileSync(file, 'utf8');
  const heeftAdmin = /ADMIN_EMAILS\s*=\s*\[/.test(txt);
  const heeftSam = /samhoven16@gmail\.com/.test(txt);
  return {
    ok: heeftAdmin && heeftSam,
    heeftAdmin: heeftAdmin,
    heeftSam: heeftSam,
  };
}

function getClaspLogin() {
  try {
    execSync('npx clasp --version', { stdio: 'pipe' });
    return 'clasp geinstalleerd';
  } catch (_) {
    return null;
  }
}

console.log('═'.repeat(60));
console.log('  Boekhoudbaar — Deploy-check');
console.log('═'.repeat(60));

const main = readClasp('.clasp.json');
const lic  = readClasp('licence-server/.clasp.json');

console.log('\n📦 Apps Script projecten geconfigureerd:\n');

if (main && main.scriptId) {
  console.log(`  1. Boekhoudbaar (master) — scriptId: ${main.scriptId.slice(0, 20)}...`);
  console.log(`     rootDir: ${main.rootDir || './src'}`);
  console.log(`     Push met: npm run deploy`);
} else {
  console.log('  ⚠️  .clasp.json ontbreekt of leeg in repo-root');
}

console.log();

if (lic && lic.scriptId) {
  console.log(`  2. Boekhoudbaar Licentieserver — scriptId: ${lic.scriptId.slice(0, 20)}...`);
  console.log(`     rootDir: ${lic.rootDir || '.'}`);
  console.log(`     Push met: npm run deploy:licence`);
} else {
  console.log('  ⚠️  licence-server/.clasp.json ontbreekt');
}

console.log('\n🔐 Admin-bypass status:\n');
const adm = checkAdminEmail();
if (adm.ok) {
  console.log('  ✓ samhoven16@gmail.com staat in ADMIN_EMAILS — bypass actief na push');
} else {
  console.log('  ✗ admin-email niet correct geconfigureerd');
  console.log('    heeftAdmin:', adm.heeftAdmin);
  console.log('    heeftSam:', adm.heeftSam);
}

console.log('\n🔧 Clasp:\n');
const claspStatus = getClaspLogin();
console.log('  ' + (claspStatus || 'clasp niet gevonden — npm install'));

console.log('\n💡 Volgende stappen:\n');
if (adm.ok && main) {
  console.log('  → Run: npm run deploy');
  console.log('  → Daarna: herlaad Boekhoudbaar spreadsheet');
} else {
  console.log('  → Fix admin-email check (zie src/Licentie.gs)');
}

console.log('\n📖 Volledige documentatie: DEPLOY.md\n');
