#!/usr/bin/env node
/**
 * validate-i18n.js
 * Validates that all 11 languages have exactly the same keys as Spanish (es).
 * Exits with code 1 if any key is missing — blocks CI/CD pipeline.
 * Run: node scripts/validate-i18n.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const LANGUAGES = ['es','en','fr','pt','ru','tr','ar','he','ko','ja','zh'];
const DIR       = path.join(__dirname, '../src/app/i18n/translations');

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseTsExport(code) {
  // Extract the object literal after "export const XX = "
  const match = code.match(/=\s*(\{[\s\S]+\});\s*$/);
  if (!match) throw new Error('Cannot find export object in file');
  // Safe eval of our own controlled source
  return Function('"use strict"; return (' + match[1] + ')')();
}

function flatKeys(obj, prefix) {
  prefix = prefix || '';
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? prefix + '.' + k : k;
    if (v !== null && typeof v === 'object') {
      keys.push(...flatKeys(v, full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

// ── Main ─────────────────────────────────────────────────────────────────────

let hasErrors = false;

// Load reference (Spanish)
const refCode = fs.readFileSync(path.join(DIR, 'es.ts'), 'utf8');
const refObj  = parseTsExport(refCode);
const refKeys = flatKeys(refObj).sort();

console.log('\n🌍 i18n Validation — Advanced Number Game v3');
console.log('━'.repeat(50));
console.log('📋 Reference (es): ' + refKeys.length + ' keys\n');

for (const lang of LANGUAGES) {
  if (lang === 'es') continue;

  const filePath = path.join(DIR, lang + '.ts');

  if (!fs.existsSync(filePath)) {
    console.error('❌  ' + lang + ': FILE MISSING — create src/app/i18n/translations/' + lang + '.ts');
    hasErrors = true;
    continue;
  }

  let obj;
  try {
    obj = parseTsExport(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error('❌  ' + lang + ': PARSE ERROR — ' + e.message);
    hasErrors = true;
    continue;
  }

  const keys    = flatKeys(obj).sort();
  const missing = refKeys.filter(k => !keys.includes(k));
  const extra   = keys.filter(k => !refKeys.includes(k));

  if (missing.length === 0 && extra.length === 0) {
    console.log('✅  ' + lang + ': ' + keys.length + '/' + refKeys.length + ' keys — COMPLETE');
  } else {
    hasErrors = true;
    if (missing.length) {
      console.error('❌  ' + lang + ': ' + missing.length + ' MISSING keys:');
      missing.forEach(k => console.error('       • ' + k));
    }
    if (extra.length) {
      console.warn('⚠️   ' + lang + ': ' + extra.length + ' EXTRA keys (not in reference):');
      extra.forEach(k => console.warn('       + ' + k));
    }
  }
}

console.log('\n' + '━'.repeat(50));

if (hasErrors) {
  console.error('❌  Validation FAILED — fix missing keys before merging\n');
  process.exit(1);
} else {
  console.log('✅  All 11 languages validated successfully\n');
  process.exit(0);
}
