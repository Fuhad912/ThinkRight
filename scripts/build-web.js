const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');

const ROOT_FILES = [
  'index.html',
  'dashboard.html',
  'leaderboard.html',
  'login.html',
  'signup.html',
  'syllabus.html',
  'test.html',
  'math-test.html',
  'reset-password.html',
  'payment-callback.html',
  'payment-debug.html',
  'manifest.json',
  'sw.js'
];

const ROOT_DIRS = [
  'assets',
  'css',
  'data',
  'icons',
  'js',
  'partials',
  'public'
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFileIfExists(fileName) {
  const src = path.join(ROOT, fileName);
  if (!fs.existsSync(src)) {
    return;
  }
  const dest = path.join(DIST, fileName);
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDirRecursive(src, dest) {
  const stats = fs.statSync(src);
  if (!stats.isDirectory()) {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
    return;
  }

  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      ensureDir(path.dirname(destPath));
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyDirIfExists(dirName) {
  const src = path.join(ROOT, dirName);
  if (!fs.existsSync(src)) {
    return;
  }
  const dest = path.join(DIST, dirName);
  copyDirRecursive(src, dest);
}

function buildWebDist() {
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true, force: true });
  }

  ensureDir(DIST);

  for (const file of ROOT_FILES) {
    copyFileIfExists(file);
  }

  for (const dir of ROOT_DIRS) {
    copyDirIfExists(dir);
  }

  console.log(`Web build complete: ${DIST}`);
}

buildWebDist();
