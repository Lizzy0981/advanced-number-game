#!/usr/bin/env node
/**
 * i18n-report.js
 * Generates a JSON coverage report for all 11 languages.
 * Saved to reports/i18n-coverage.json and printed to console.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const LANGUAGES = ['es','en','fr','pt','ru','tr','ar','he','ko','ja','zh'];
const RTL       = ['ar','he'];
const DIR       = path.join(__dirname, '../src/app/i18n/translations');
const OUT       = path.join(__dirname, '../reports');

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

function parseTsExport(code) {
  const match = code.match(/=\s*(\{[\s\S]+\});\s*$/);
  if (!match) throw new Error('Cannot parse export');
  return Function('"use strict"; return (' + match[1] + ')')();
}

function countKeys(obj) {
  let n = 0;
  for (const v of Object.values(obj)) {
    n += (v !== null && typeof v === 'object') ? countKeys(v) : 1;
  }
  return n;
}

const refObj   = parseTsExport(fs.readFileSync(path.join(DIR, 'es.ts'), 'utf8'));
const refCount = countKeys(refObj);

const report = {
  generatedAt: new Date().toISOString(),
  reference: { lang: 'es', keys: refCount },
  summary: { total: LANGUAGES.length, complete: 0, partial: 0, missing: 0 },
  languages: {},
};

console.log('\n📊 i18n Coverage Report — Advanced Number Game v3');
console.log('━'.repeat(55));
console.log('Reference (es): ' + refCount + ' keys\n');

for (const lang of LANGUAGES) {
  const file = path.join(DIR, lang + '.ts');
  if (!fs.existsSync(file)) {
    report.languages[lang] = { status: 'missing', keys: 0, coverage: 0, rtl: RTL.includes(lang) };
    report.summary.missing++;
    console.log('❌  ' + lang + ': MISSING');
    continue;
  }
  try {
    const obj  = parseTsExport(fs.readFileSync(file, 'utf8'));
    const keys = countKeys(obj);
    const cov  = Math.round((keys / refCount) * 100);
    const ok   = cov === 100;
    report.languages[lang] = { status: ok ? 'complete' : 'partial', keys, coverage: cov, rtl: RTL.includes(lang) };
    ok ? report.summary.complete++ : report.summary.partial++;
    const icon = ok ? '✅' : '⚠️ ';
    const rtl  = RTL.includes(lang) ? ' [RTL]' : '';
    console.log(icon + ' ' + lang + ': ' + cov + '% (' + keys + '/' + refCount + ' keys)' + rtl);
  } catch (e) {
    report.languages[lang] = { status: 'error', error: e.message, keys: 0, coverage: 0 };
    report.summary.missing++;
    console.error('❌  ' + lang + ': ERROR — ' + e.message);
  }
}

const outFile = path.join(OUT, 'i18n-coverage.json');
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

console.log('\n' + '━'.repeat(55));
console.log('Complete: ' + report.summary.complete + '/' + LANGUAGES.length);
console.log('Partial:  ' + report.summary.partial);
console.log('Missing:  ' + report.summary.missing);
console.log('\n📄 Report saved: ' + outFile + '\n');
