const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
let failures = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
  } else {
    console.error(`  [FAIL] ${message}`);
    failures++;
  }
}

console.log('--- TEST 1: js/config.js ---');
const configContent = fs.readFileSync(path.join(projectRoot, 'js', 'config.js'), 'utf8');
assert(configContent.includes('THINKRIGHT_GROQ_CONFIG'), 'Defines THINKRIGHT_GROQ_CONFIG');
assert(configContent.includes('llama-3.3-70b-versatile'), 'Sets model to llama-3.3-70b-versatile');
assert(configContent.includes('getApiKey'), 'Provides getApiKey function');
assert(configContent.includes('setApiKey'), 'Provides setApiKey function');
assert(configContent.includes('hasValidKey'), 'Provides hasValidKey function');

console.log('\n--- TEST 2: supabase/functions/jamb-insider-ai/index.ts ---');
const edgeFuncPath = path.join(projectRoot, 'supabase', 'functions', 'jamb-insider-ai', 'index.ts');
assert(fs.existsSync(edgeFuncPath), 'Edge function file exists');
const edgeFuncContent = fs.readFileSync(edgeFuncPath, 'utf8');
assert(edgeFuncContent.includes('CORS_HEADERS'), 'CORS headers configured');
assert(edgeFuncContent.includes('GROQ_API_KEY'), 'Reads GROQ_API_KEY from environment');
assert(edgeFuncContent.includes('CRITICAL DOMAIN RESTRICTIONS'), 'Enforces strict JAMB domain restrictions in system prompt');
assert(edgeFuncContent.includes('llama-3.3-70b-versatile'), 'Targets llama-3.3-70b-versatile model');
assert(edgeFuncContent.includes('MISSING_API_KEY'), 'Returns MISSING_API_KEY error code for frontend fallback');

console.log('\n--- TEST 3: js/insider-ai.js ---');
const aiContent = fs.readFileSync(path.join(projectRoot, 'js', 'insider-ai.js'), 'utf8');
assert(aiContent.includes('CLIENT_SYSTEM_PROMPT'), 'Includes client-side system prompt for direct fallback');
assert(aiContent.includes('I am strictly specialized as your ThinkRight JAMB Insider AI advisor'), 'Has exact refusal deflection message');
assert(aiContent.includes('formatMarkdown'), 'Provides markdown formatter for chat bubbles');
assert(aiContent.includes('openConfigModal'), 'Provides API Key config modal controller');
assert(aiContent.includes('starter-prompt-chip'), 'Binds quick starter question chips');

console.log('\n--- TEST 4: insider.html Markup & Script Integration ---');
const htmlContent = fs.readFileSync(path.join(projectRoot, 'insider.html'), 'utf8');
assert(htmlContent.includes('id="insiderTabChat"'), 'Chat tab exists');
assert(htmlContent.includes('id="insiderTabDirectory"'), 'Directory tab exists');
assert(htmlContent.includes('id="insiderChatView"'), 'AI Chat view container exists');
assert(htmlContent.includes('id="insiderStarterChips"'), 'Starter chips container exists');
assert(htmlContent.includes('id="insiderChatMessages"'), 'Chat messages container exists');
assert(htmlContent.includes('id="insiderChatForm"'), 'Chat form exists');
assert(htmlContent.includes('id="insiderChatInput"'), 'Chat textarea input exists');
assert(htmlContent.includes('id="insiderSendBtn"'), 'Chat send button exists');
assert(htmlContent.includes('id="insiderConfigModal"'), 'API key settings modal exists');
assert(htmlContent.includes('id="insiderDirectoryView"'), 'Curated directory view exists');
assert(htmlContent.includes('src="js/config.js'), 'Loads js/config.js');
assert(htmlContent.includes('src="js/insider-ai.js'), 'Loads js/insider-ai.js');
assert(htmlContent.includes('src="js/insider.js'), 'Loads js/insider.js');

console.log('\n--- TEST 5: css/insider.css Chat & Dark Mode Styles ---');
const cssContent = fs.readFileSync(path.join(projectRoot, 'css', 'insider.css'), 'utf8');
assert(cssContent.includes('.insider-mode-nav'), 'Styles .insider-mode-nav');
assert(cssContent.includes('.insider-mode-tab.is-active'), 'Styles active mode tab');
assert(cssContent.includes('.insider-chat-view'), 'Styles .insider-chat-view');
assert(cssContent.includes('.chat-top-bar'), 'Styles .chat-top-bar');
assert(cssContent.includes('.starter-prompt-chip'), 'Styles starter prompt chips');
assert(cssContent.includes('.chat-bubble.assistant-bubble'), 'Styles assistant chat bubbles');
assert(cssContent.includes('.chat-bubble.user-bubble'), 'Styles user chat bubbles');
assert(cssContent.includes('.typing-indicator'), 'Styles typing dots animation');
assert(cssContent.includes('.insider-config-modal-content'), 'Styles API key settings modal');
assert(cssContent.includes('body.dark .insider-chat-view'), 'Dark mode styling for chat view');
assert(cssContent.includes('body.dark .chat-bubble.assistant-bubble'), 'Dark mode styling for assistant bubble');
assert(cssContent.includes('body.dark .chat-input-wrapper'), 'Dark mode styling for input field');

console.log(`\n===========================================`);
if (failures === 0) {
  console.log('ALL 28 TESTS PASSED! JAMB Insider AI is structurally verified.');
  process.exit(0);
} else {
  console.error(`${failures} TEST(S) FAILED.`);
  process.exit(1);
}
