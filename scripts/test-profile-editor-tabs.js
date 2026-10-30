const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');

const root = path.resolve(__dirname, '..');
const { window, document } = parseHTML(fs.readFileSync(path.join(root, 'profile.html'), 'utf8'));
const values = new Map();
const localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key)
};
window.localStorage = localStorage;
window.matchMedia = () => ({ matches: false });
window.scrollTo = () => {};
// linkedom's select value is read-only; browsers support assignment.
document.querySelectorAll('select').forEach((select) => {
  let value = '';
  Object.defineProperty(select, 'value', { get: () => value, set: (next) => { value = String(next ?? ''); } });
});

vm.runInNewContext(fs.readFileSync(path.join(root, 'js/profile.js'), 'utf8'), {
  window, document, localStorage, navigator: {}, console, setTimeout, clearTimeout, URL
});
document.dispatchEvent(new window.Event('DOMContentLoaded'));

const panel = (id) => document.getElementById(id);
const tab = (id) => document.querySelector(`[data-editor-target="${id}"]`);
document.getElementById('openEditModalBtn').click();
assert.equal(panel('editorAbout').hidden, false);
assert.equal(panel('editorGoal').hidden, true);
assert.equal(panel('editorSubjects').hidden, true);

document.getElementById('inputUsername').value = 'Ada Student';
tab('editorGoal').click();
assert.equal(panel('editorAbout').hidden, true);
assert.equal(panel('editorGoal').hidden, false);
assert.equal(tab('editorGoal').getAttribute('aria-selected'), 'true');

tab('editorSubjects').click();
assert.equal(panel('editorGoal').hidden, true);
assert.equal(panel('editorSubjects').hidden, false);
tab('editorAbout').click();
assert.equal(document.getElementById('inputUsername').value, 'Ada Student');

console.log('Profile editor section switching: OK');
