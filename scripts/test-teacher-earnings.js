/* Local earnings-page interaction checks. No live accounts or bank data. */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const { parseHTML } = require('linkedom');
const settle = () => new Promise(resolve => setImmediate(resolve));
const source = readFileSync('js/teacher-workspace.js', 'utf8');
const account = { tutor_id: 'teacher', bank: 'Example bank', account_number: '0123456789', account_name: 'Test Teacher', reviewed: false };

async function mount({ banks = [], width = 375, status = 'active', loadError = false } = {}) {
  const { window } = parseHTML(readFileSync('tutor-payouts.html', 'utf8'));
  const document = window.document;
  const identity = { role: 'teacher', status, name: 'Test Teacher' };
  const recent = new Date().toISOString(), older = new Date(Date.now() - 45 * 86400000).toISOString();
  const snapshot = {
    identity, subjects: [{ id: 'physics', name: 'Physics' }], tutors: [{ id: 'teacher', status, display_name: 'Test Teacher' }],
    classes: [{ id: 'class', title: 'Physics <script>unsafe</script>', tutor_id: 'teacher' }], revisions: [],
    students: [], enrollments: [], progress: [], lessons: [], posts: [], banks, audit: [],
    earnings: [recent, older].map((created_at, index) => ({ teacher_kobo: 35000, gross_kobo: 70000, cohort_id: 'class', created_at, reference: 'TR-' + index })),
    payouts: [{ amount_kobo: 20000, paid_at: recent, reference: 'PAY-1' }, { amount_kobo: 10000, paid_at: recent, reference: 'PAY-2', reversed: true, reversal_reason: 'Correction <img src=x>' }]
  };
  const calls = [];
  const location = { pathname: '/tutor-payouts.html', search: '', hash: '', replace(value) { throw Error('Unexpected redirect: ' + value); } };
  const localStorage = { getItem: () => null, setItem() {} };
  const matchMedia = query => ({ matches: query.includes('639') ? width <= 639 : width <= 1023 });
  const dialog = document.getElementById('workspace-dialog');
  let opens = 0, failSave = false, releaseSave = null, blockSave = false;
  dialog.showModal = function () { this.open = true; this.setAttribute('open', ''); opens++; };
  dialog.close = function () { this.open = false; this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
  class FormData {
    constructor(form) { this.values = [...form.querySelectorAll('input[name]')].map(input => [input.name, input.value]); }
    [Symbol.iterator]() { return this.values[Symbol.iterator](); }
    has(name) { return this.values.some(([key]) => key === name); }
    getAll(name) { return this.values.filter(([key]) => key === name).map(([, value]) => value); }
  }
  Object.assign(window, {
    ThinkRightVideo: { unmountInline() {}, mountInline() {}, busy: () => false },
    location, localStorage, matchMedia, authInitialized: true, resolveWorkspaceIdentity: async () => identity,
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: 'teacher', email: 'teacher@example.test' } } }) },
      rpc: async (name, args) => {
        if (name === 'workspace_snapshot') return loadError ? { error: { message: 'Connection unavailable' } } : { data: snapshot };
        calls.push(args);
        if (blockSave) await new Promise(resolve => { releaseSave = resolve; });
        if (failSave) return { error: { message: 'Could not save. Try again.' } };
        assert.equal(args.p_action, 'bank');
        snapshot.banks = [{ tutor_id: 'teacher', ...args.p_data, reviewed: false }];
        return { data: {} };
      }
    }
  });
  runInNewContext(source, {
    window, document, location, localStorage, history: { replaceState() {} }, matchMedia,
    URL, URLSearchParams, Intl, Date, structuredClone, console, FormData,
    confirm: () => true, setTimeout: () => 1, clearTimeout() {}
  });
  await settle();
  function submit() {
    const form = dialog.querySelector('form');
    const event = new window.Event('submit', { bubbles: true, cancelable: true });
    event.submitter = form.querySelector('[type="submit"]');
    form.dispatchEvent(event);
    return event.submitter;
  }
  function fill(number = '0123456789') {
    for (const [key, value] of Object.entries({ bank: 'Example bank', account_number: number, account_name: 'Test Teacher' })) dialog.querySelector(`[name="${key}"]`).value = value;
  }
  return { window, document, dialog, calls, snapshot, submit, fill, opens: () => opens, fail: value => { failSave = value; }, block: () => { blockSave = true; }, release: () => { blockSave = false; releaseSave(); } };
}

(async () => {
  for (const width of [320, 375, 768, 1440]) {
    const ui = await mount({ width });
    assert.equal(ui.dialog.open, true, 'Missing bank account opens on entry');
    assert.ok(ui.dialog.classList.contains('tw-bank-drawer'));
    assert.equal(ui.dialog.getAttribute('aria-describedby'), 'bank-form-description');
    assert.match(ui.document.querySelector('.tw-earnings-balance strong').textContent, /500/);
    assert.match(ui.document.querySelector('.tw-earnings-totals').textContent, /700/);
    assert.equal(ui.document.querySelectorAll('.tw-earning-row').length, 1);
    assert.match(ui.document.querySelector('.tw-earning-side small').textContent, /50%/, 'Show the recorded split');
    assert.equal(ui.document.querySelectorAll('.tw-payout-row').length, 2, 'Reversals remain visible');
    assert.equal(ui.document.querySelector('.tw-payouts-page script, .tw-payouts-page img'), null, 'Ledger text is escaped');
    ui.dialog.querySelector('[data-action="close-dialog"]').click();
    assert.equal(ui.dialog.open, false);
    assert.notEqual(ui.document.body.style.overflow, 'hidden', 'Dismissal restores scrolling');
    assert.equal(ui.document.querySelector('.tw-payouts-page select'), null);
    ui.document.querySelector('[data-picker="period"]').click();
    ui.dialog.querySelector('[data-value="90"]').click();
    assert.equal(ui.document.querySelectorAll('.tw-earning-row').length, 2);
    assert.equal(ui.opens(), 2, 'Only the selection modal opens');
    assert.match(ui.document.querySelector('.tw-earnings-balance strong').textContent, /500/, 'Filtering does not change the all-time balance');
    const revisit = new ui.window.Event('pageshow'); revisit.persisted = true; ui.window.dispatchEvent(revisit);
    assert.equal(ui.opens(), 3, 'Returning to the page prompts again');
  }
  const ui = await mount();
  ui.fill('123'); ui.submit(); await settle();
  assert.equal(ui.calls.length, 0, 'Invalid numbers cannot be saved');
  assert.equal(ui.dialog.querySelector('[data-bank-error]').hidden, false);
  assert.match(ui.dialog.querySelector('[data-bank-error]').textContent, /10-digit/);
  ui.fill(); ui.fail(true); ui.submit(); await settle();
  assert.equal(ui.dialog.open, true, 'Save errors leave the form open');
  assert.equal(ui.dialog.querySelector('[name="account_number"]').value, '0123456789');
  assert.match(ui.dialog.querySelector('[data-bank-error]').textContent, /Could not save/);
  ui.fail(false); ui.block(); const saveButton = ui.submit(); await settle();
  assert.equal(saveButton.disabled, true);
  ui.submit();
  ui.dialog.querySelector('[data-action="close-dialog"]').click();
  assert.equal(ui.dialog.open, true, 'An active save cannot be dismissed');
  const cancel = new ui.window.Event('cancel', { cancelable: true }); ui.dialog.dispatchEvent(cancel);
  assert.equal(cancel.defaultPrevented, true);
  assert.equal(ui.calls.length, 2, 'Duplicate submissions are blocked');
  ui.release(); await settle();
  assert.equal(ui.dialog.open, false);
  assert.equal(ui.calls[1].p_data.account_number, '0123456789', 'Preserve the leading zero');
  assert.match(ui.document.querySelector('.tw-payout-account').textContent, /Awaiting ThinkRight review/);
  assert.equal(ui.document.querySelector('.tw-payout-account').textContent.includes('0123456789'), false, 'Account summary is masked');
  ui.document.querySelector('[data-action="edit-payout-bank"]').click();
  assert.equal(ui.dialog.querySelector('[name="account_number"]').value, '0123456789', 'Saved details can be edited');
  for (const reviewed of [false, true]) {
    const saved = await mount({ banks: [{ ...account, reviewed }] });
    assert.equal(saved.opens(), 0, 'Saved accounts do not automatically prompt');
  }
  const incomplete = await mount({ banks: [{ ...account, account_number: '' }] });
  assert.equal(incomplete.opens(), 1);
  const otherAccount = await mount({ banks: [{ ...account, tutor_id: 'other-teacher' }] });
  assert.equal(otherAccount.opens(), 1, 'Only the current teacher account suppresses the prompt');
  const suspended = await mount({ status: 'suspended' });
  assert.equal(suspended.opens(), 0);
  assert.equal(suspended.document.querySelector('[data-action="edit-payout-bank"]'), null);
  const offline = await mount({ loadError: true });
  assert.equal(offline.opens(), 0);
  assert.equal(offline.document.querySelector('.tw-earnings-balance'), null, 'Failed loading must not show a zero balance');
  assert.match(offline.document.querySelector('h1').textContent, /earnings couldn’t load/);
  console.log('PASS: earnings balances and filters, payout reversals, bank prompts on entry/return, saving and retry, validation, duplicate-submit protection, masking and load errors');
})().catch(error => { console.error(error); process.exitCode = 1; });
