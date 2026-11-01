const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');

const ROOT_FILES = [
  'index.html',
  'practice.html',
  'classes.html',
  'cohort.html',
  'my-classes.html',
  'my-cohorts.html',
  'tutor-onboarding.html',
  'tutor-dashboard.html',
  'tutor-payouts.html',
  'tutor-classes.html',
  'tutor-class.html',
  'tutor-students.html',
  'tutor-analytics.html',
  'tutor-discussions.html',
  'admin.html',
  'dashboard.html',
  'profile.html',
  'leaderboard.html',
  'insider.html',
  'login.html',
  'privacy-policy.html',
  'terms-of-use.html',
  'news.html',
  'signup.html',
  'syllabus.html',
  'textbooks.html',
  'test.html',
  'reset-password.html',
  'payment-callback.html',
  'onboarding.html',
  'robots.txt',
  'favicon.png',
  'favicon.ico',
  'sitemap.xml',
  'manifest.json',
  'sw.js'
];

const ROOT_DIRS = [
  'assets',
  'css',
  'data',
  'icons',
  'js',
  'partials'
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
  try {
    fs.copyFileSync(src, dest);
  } catch (err) {
    if (err.code !== 'EBUSY') throw err;
  }
}

function copyDirRecursive(src, dest) {
  const stats = fs.statSync(src);
  if (!stats.isDirectory()) {
    ensureDir(path.dirname(dest));
    try {
      fs.copyFileSync(src, dest);
    } catch (err) {
      if (err.code !== 'EBUSY') throw err;
    }
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
      try {
        fs.copyFileSync(srcPath, destPath);
      } catch (err) {
        if (err.code !== 'EBUSY') throw err;
      }
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
