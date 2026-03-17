#!/usr/bin/env node
/**
 * check-bundle-size.js
 * Fails CI if production bundle exceeds size limits.
 * Enforces sustainability — lean bundles = less energy.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const MAX_TOTAL_MB = 1.5;  // 1.5 MB total docs/
const MAX_TOTAL_B  = MAX_TOTAL_MB * 1024 * 1024;
const docsDir      = path.join(__dirname, '../docs');

if (!fs.existsSync(docsDir)) {
  console.log('⚠️  docs/ not found — run npm run build:github first');
  process.exit(0);
}

function getDirSize(dir) {
  let total = 0;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    total += item.isDirectory() ? getDirSize(full) : fs.statSync(full).size;
  }
  return total;
}

const totalBytes = getDirSize(docsDir);
const totalMB    = (totalBytes / 1024 / 1024).toFixed(2);

console.log('\n📦 Bundle Size Report');
console.log('━'.repeat(40));
console.log('   Total: ' + totalMB + ' MB  (limit: ' + MAX_TOTAL_MB + ' MB)');

if (totalBytes > MAX_TOTAL_B) {
  console.error('\n❌  Bundle exceeds size limit!');
  console.error('   Current: ' + totalMB + ' MB');
  console.error('   Limit:   ' + MAX_TOTAL_MB + ' MB');
  console.error('   → Check for large assets, enable lazy loading, or increase limit\n');
  process.exit(1);
} else {
  const pct = Math.round((totalBytes / MAX_TOTAL_B) * 100);
  console.log('   Usage:  ' + pct + '% of limit');
  console.log('\n✅  Bundle within limits ♻️\n');
}
