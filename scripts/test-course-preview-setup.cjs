const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');

async function main() {
  const { window, document } = parseHTML(fs.readFileSync('previews/course-studio.html', 'utf8'));
  window.scrollTo = () => {};
  const session = { user: { id: 'teacher-one' } };
  window.ThinkRightAuth = {
    initSupabase: async () => true,
    getSession: async () => session
  };
  window.supabase = {
    from(table) {
      return {
        select() { return this; },
        eq(key, value) {
          assert.equal(key, 'id');
          assert.equal(value, session.user.id);
          return this;
        },
        single: async () => ({ data: { subjects: ['chemistry'] } }),
        order: async () => ({ data: [
          { id: 'physics', name: 'Physics' },
          { id: 'chemistry', name: 'Chemistry' }
        ] })
      };
    }
  };
  const saved = new Map();
  const context = {
    window, document, console, Intl,
    URL: { createObjectURL: () => 'blob:lesson-preview', revokeObjectURL: () => {} },
    crypto: require('node:crypto').webcrypto,
    localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) },
    setTimeout: () => 0, clearTimeout: () => {},
    FileReader: class {
      readAsDataURL() {
        this.result = 'data:image/png;base64,aW1hZ2U=';
        this.onload();
      }
    }
  };
  vm.runInNewContext(fs.readFileSync('previews/course-studio.js', 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  const click = selector => {
    const control = document.querySelector(selector);
    assert(control, selector);
    control.dispatchEvent(new window.Event('click', { bubbles: true }));
  };
  const change = control => control.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(document.querySelector('[aria-label="Exam"]'), null);
  assert.equal(document.querySelector('[data-topic]'), null);
  const subject = document.querySelector('[data-field="subject_id"]');
  assert.equal(subject.querySelector('[value="physics"]'), null);
  assert(subject.querySelector('[value="chemistry"]'));
  subject.querySelector('[value="chemistry"]').selected = true;
  change(subject);
  click('[data-action="next"]');
  assert.equal(document.querySelectorAll('.lesson').length, 1);
  assert.equal(document.querySelectorAll('[data-action="add"]').length, 1);
  assert.equal(document.querySelector('.lesson-list').nextElementSibling.dataset.action, 'add');
  const title = document.querySelector('[data-lesson="0"][data-key="title"]');
  title.value = 'Understanding motion';
  title.dispatchEvent(new window.Event('input', { bubbles: true }));
  const recording = document.querySelector('[data-video="0"]');
  Object.defineProperty(recording, 'files', { value: [{ type: 'video/mp4', size: 100, name: 'motion.mp4' }] });
  change(recording);
  assert.equal(document.querySelector('video').getAttribute('src'), 'blob:lesson-preview');
  assert(document.querySelector('.tw-inline-video video-player video-skin video'));
  assert(document.querySelector('script[src^="../js/studio-player.js"]'));
  click('[data-action="next"]');
  assert.match(document.querySelector('#form-error').textContent, /topic/i);
  const topic = document.querySelector('[data-lesson="0"][data-key="topic"]');
  assert(topic.hasAttribute('required'));
  topic.value = 'Motion';
  topic.dispatchEvent(new window.Event('input', { bubbles: true }));
  click('[data-action="add"]');
  assert.equal(document.querySelectorAll('.lesson').length, 2);
  assert.equal(document.querySelector('[data-lesson="1"][data-key="title"]').value, '');
  assert.equal(document.querySelector('video').getAttribute('src'), 'blob:lesson-preview');
  click('[data-remove="1"]');
  assert.equal(document.querySelectorAll('.lesson').length, 1);
  click('[data-action="next"]');
  assert.match(document.querySelector('#teacher-share').textContent, /2,700/);
  assert.match(document.querySelector('#platform-share').textContent, /300/);
  click('[data-action="next"]');
  assert(document.querySelector('[data-action="submit"]'));
  click('[data-action="submit"]');
  assert.match(document.querySelector('#form-error').textContent, /cover/i);
  const cover = document.querySelector('[data-cover]');
  Object.defineProperty(cover, 'files', { value: [{ type: 'image/png', size: 100 }] });
  change(cover);
  assert.match(document.querySelector('img[alt="Selected course cover"]').src, /^data:image\/png/);
  const topics = document.querySelector('[data-field="focused_topics"]');
  topics.value = '';
  topics.dispatchEvent(new window.Event('input', { bubbles: true }));
  click('[data-action="next"]');
  assert.match(document.querySelector('#form-error').textContent, /topic/i);
  const complete = document.querySelector('[name="type"][value="complete"]');
  complete.checked = true;
  change(complete);
  assert.equal(document.querySelector('[data-field="focused_topics"]'), null);
  assert.equal(document.querySelector('[data-topic]'), null);
  click('[data-action="next"]');
  assert.equal(document.querySelectorAll('.lesson').length, 1);
  assert.equal(document.querySelector('[aria-label="Syllabus coverage"]'), null);
  assert.equal(document.querySelector('select[data-key="topic"]'), null);
  console.log('PASS: setup, cover submission checks, one initial lesson, adding lessons, required topics and inline video preview');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
