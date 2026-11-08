/* Local regression checks for post-auth routing. No live authentication or writes. */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const auth = readFileSync('js/auth.js', 'utf8');
const login = readFileSync('js/login.js', 'utf8');
const destinationStart = auth.indexOf('window.workspaceDestination = async function');
const destinationSource = auth.slice(destinationStart, auth.indexOf('\n};', destinationStart) + 3);
const handlerStart = login.indexOf('    async function handleSuccessfulAuth(');
const handlerSource = login.slice(handlerStart, login.indexOf('    // --- ASYNC AUTH CHECK', handlerStart));
assert.ok(destinationStart >= 0 && handlerStart >= 0, 'Routing functions must exist');

async function route({ role = 'teacher', metadataRole = 'teacher', tutor, next = null, override = null, google = false, credential = true }) {
  const user = { id: 'test-user', email: 'teacher@example.test', user_metadata: { full_name: 'Test teacher', role: metadataRole } };
  const params = new URLSearchParams();
  if (next) params.set('next', next);
  if (google) {
    params.set('oauth', 'google');
    params.set('mode', override ? 'signup' : 'login');
    params.set('role', 'teacher');
  }
  const redirects = [];
  const location = { origin: 'https://thinkright.com.ng', replace: value => redirects.push(value) };
  const errors = [];
  const window = {
    location,
    resolveWorkspaceIdentity: async () => ({ role, user }),
    ensureUserBootstrapData: async () => {},
    supabase: {
      auth: { updateUser: async () => ({ error: null }) },
      from: table => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: table === 'teacher_applications' ? { details: credential ? { credential_path: 'test-user/certificate.pdf' } : {} } : {},
        error: null
      }) }) }) })
    }
  };
  Object.defineProperty(location, 'href', { set: value => redirects.push(value) });
  const context = vm.createContext({
    window, location, URL, URLSearchParams, Date, console,
    urlParams: params,
    getTutorProfile: async () => tutor,
    localStorage: { getItem: () => null, setItem() {} },
    sessionStorage: { getItem: () => JSON.stringify({ version: 'test', acceptedAt: '2026-11-05' }), removeItem() {} },
    POLICY_VERSION: 'test', POLICY_ACCEPTANCE_KEY: 'test',
    setAuthenticatingState() {}, showError: message => errors.push(message)
  });
  vm.runInContext('let authRedirectHandled = false;\n' + destinationSource + '\n' + handlerSource, context);
  await context.handleSuccessfulAuth(user, override);
  assert.deepEqual(errors, [], 'Authentication must finish without a routing error');
  assert.equal(redirects.length, 1, 'Authentication must redirect once');
  return redirects[0];
}

(async () => {
  const active = { status: 'active' };
  const pending = {
    status: 'pending', display_name: 'Test teacher', whatsapp_number: '+2348012345678',
    bio: 'Experienced teacher preparing students for JAMB.', sample_video_url: 'https://example.test/sample', subjects: ['physics']
  };
  for (const google of [false, true]) {
    assert.equal(await route({ tutor: active, google, next: 'tutor-onboarding.html' }), 'tutor-dashboard.html');
    assert.equal(await route({ tutor: active, google, next: 'profile.html' }), 'tutor-dashboard.html');
    assert.equal(await route({ tutor: active, metadataRole: 'tutor', google }), 'tutor-dashboard.html');
    assert.equal(await route({ tutor: pending, google }), 'tutor-dashboard.html', 'Submitted teachers can reach home while under review');
    assert.equal(await route({ tutor: {}, google }), 'tutor-onboarding.html', 'Incomplete applications still need onboarding');
  }
  assert.equal(await route({ tutor: active, metadataRole: null }), 'tutor-dashboard.html', 'Server teacher identity controls routing');
  assert.equal(await route({ tutor: pending, credential: false }), 'tutor-onboarding.html');
  assert.equal(await route({ tutor: null, override: 'teacher', google: true }), 'tutor-onboarding.html', 'New Google teacher registrations finish onboarding');
  assert.equal(await route({ role: 'student', metadataRole: 'student', next: 'profile.html' }), '/profile.html');
  assert.equal(await route({ role: 'admin', metadataRole: 'admin' }), 'admin.html');
  console.log('PASS: returning teacher email/Google routing, pending and incomplete applications, teacher signup, student and admin destinations');
})().catch(error => { console.error(error); process.exitCode = 1; });
