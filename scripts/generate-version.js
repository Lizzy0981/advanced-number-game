#!/usr/bin/env node
/**
 * generate-version.js
 * Creates docs/version.json for the PWA auto-update system.
 * Runs automatically after every build and commit.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const pkg  = require('../package.json');

let commitHash = 'local';
let commitDate = new Date().toISOString();

try {
  const { execSync } = require('child_process');
  commitHash = execSync('git rev-parse --short HEAD 2>/dev/null').toString().trim();
  commitDate = execSync('git log -1 --format=%cI 2>/dev/null').toString().trim();
} catch (_) { /* not a git repo or no commits yet */ }

const docsDir = path.join(__dirname, '../docs');
if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

const version = {
  version:     pkg.version,
  name:        pkg.name,
  description: pkg.description,
  buildDate:   new Date().toISOString(),
  commitHash,
  commitDate,
  languages:   pkg.config.languages,
  rtl:         pkg.config.rtlLanguages,
  algorithms:  pkg.config.algorithms,
  features:    pkg.config.features,
};

const outPath = path.join(docsDir, 'version.json');
fs.writeFileSync(outPath, JSON.stringify(version, null, 2));
console.log('✅  version.json → ' + outPath);
console.log('    v' + version.version + ' (' + commitHash + ') built ' + new Date().toLocaleDateString());
