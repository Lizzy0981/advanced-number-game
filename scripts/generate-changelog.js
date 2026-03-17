#!/usr/bin/env node
/**
 * generate-changelog.js
 * Generates CHANGELOG_LATEST.md from git log using Conventional Commits.
 * Used by the release GitHub Actions workflow.
 */
'use strict';

const { execSync } = require('child_process');
const fs  = require('fs');
const pkg = require('../package.json');

// Get commits since last tag
let lastTag = '';
try { lastTag = execSync('git describe --tags --abbrev=0 HEAD~1 2>/dev/null').toString().trim(); } catch (_) {}

const range = lastTag ? lastTag + '..HEAD' : 'HEAD~30..HEAD';
let rawLog  = '';
try { rawLog = execSync('git log ' + range + ' --pretty=format:"%s|%an|%ad" --date=short 2>/dev/null').toString().trim(); } catch (_) {}

const cats = { feat: [], fix: [], perf: [], docs: [], chore: [], other: [] };

for (const line of rawLog.split('\n').filter(Boolean)) {
  const [msg, author, date] = line.split('|');
  const m    = msg.match(/^(feat|fix|perf|docs|chore|refactor|test|style)(\(.+\))?!?:\s*(.+)/i);
  const type = m ? m[1].toLowerCase() : 'other';
  const desc = m ? m[3] : msg;
  const key  = ['feat','fix','perf','docs','chore'].includes(type) ? type : 'other';
  cats[key].push('- ' + desc + ' *(' + author + ', ' + date + ')*');
}

const today = new Date().toISOString().slice(0, 10);
let md = '# Release v' + pkg.version + ' — ' + today + '\n\n';

if (cats.feat.length)  md += '## ✨ New Features\n'    + cats.feat.join('\n')  + '\n\n';
if (cats.fix.length)   md += '## 🐛 Bug Fixes\n'       + cats.fix.join('\n')   + '\n\n';
if (cats.perf.length)  md += '## ⚡ Performance\n'      + cats.perf.join('\n')  + '\n\n';
if (cats.docs.length)  md += '## 📚 Documentation\n'   + cats.docs.join('\n')  + '\n\n';
if (cats.chore.length) md += '## 🔧 Maintenance\n'     + cats.chore.join('\n') + '\n\n';
if (cats.other.length) md += '## 📌 Other Changes\n'   + cats.other.join('\n') + '\n\n';

md += '---\n';
md += '*Built with ♻️ by Elizabeth Díaz Familia — Sustainable AI Scientist*\n';
md += '*lizzy0981.github.io · MIT License*\n';

fs.writeFileSync('CHANGELOG_LATEST.md', md);
console.log('✅  CHANGELOG_LATEST.md generated for v' + pkg.version);
