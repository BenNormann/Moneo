#!/usr/bin/env node
/**
 * Prepare extension for release by writing supabase.config.json from env.
 * Run before packaging (e.g. in CI) so the built extension has Supabase config.
 *
 * Required env:
 *   SUPABASE_URL       - e.g. https://xxxx.supabase.co
 *   SUPABASE_ANON_KEY  - Supabase anon/public JWT
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/prepare-release.js
 *   # or in CI: set secrets and run this step before zipping the extension
 */

const fs = require('fs');
const path = require('path');

const url = process.env.SUPABASE_URL || '';
const anonKey = process.env.SUPABASE_ANON_KEY || '';

if (!url.trim() || !anonKey.trim()) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY. Set env before running.');
  process.exit(1);
}

if (!anonKey.startsWith('eyJ')) {
  console.error('SUPABASE_ANON_KEY should be a JWT starting with eyJ');
  process.exit(1);
}

const config = {
  supabase_url: url.trim(),
  supabase_anon_key: anonKey.trim()
};

const outPath = path.join(__dirname, '..', 'supabase.config.json');
fs.writeFileSync(outPath, JSON.stringify(config, null, 2), 'utf8');
console.log('Wrote supabase.config.json (do not commit; use only for packaging).');
console.log('Package the extension (zip) including this file for Chrome Web Store or distribution.');
