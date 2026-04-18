#!/usr/bin/env node
/**
 * clasp-push.js
 * Pushes src/ to Google Apps Script with automatic retry.
 *
 * Fixes two environment issues:
 *  1. SSL proxy with self-signed cert → NODE_TLS_REJECT_UNAUTHORIZED=0
 *  2. Transient "DNS cache overflow" errors → exponential backoff retry
 *
 * Usage: node scripts/clasp-push.js
 *        npm run push:gas
 */

const { execSync } = require('child_process');

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 3000;

function push(attempt) {
  try {
    execSync('npx clasp push --force', {
      stdio: 'inherit',
      env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' },
    });
    console.log('\n✓ clasp push geslaagd.');
    process.exit(0);
  } catch (err) {
    if (attempt >= MAX_ATTEMPTS) {
      console.error(`\n✗ clasp push mislukt na ${MAX_ATTEMPTS} pogingen.`);
      console.error('Controleer uw internetverbinding en probeer later opnieuw.');
      process.exit(1);
    }
    const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
    console.log(`\nPoging ${attempt} mislukt — volgende poging over ${delay / 1000}s...`);
    setTimeout(() => push(attempt + 1), delay);
  }
}

console.log('→ Pushend naar Google Apps Script...');
push(1);
