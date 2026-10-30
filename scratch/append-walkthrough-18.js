const fs = require('fs');
const path = 'C:\\\\Users\\\\basir\\\\.gemini\\\\antigravity-ide\\\\brain\\\\e95352d7-84b1-4586-a27c-97c41a6c08e3\\\\walkthrough.md';
let content = fs.readFileSync(path, 'utf8');

const section18 = `

---

## 18. JAMB Insider AI Chatbot (Groq API Powered & Strictly Domain-Locked)

### Overview
Transformed the **JAMB Insider** page (\`insider.html\`) into an AI Admissions Advisor powered by **Groq API** (\`llama-3.3-70b-versatile\`). Candidates can ask questions regarding JAMB UTME subject combinations for courses/departments, O'Level prerequisites (WAEC/NECO/NABTEB), cut-off marks, departmental catchment policies, and CBT exam preparation strategies.

### Core Architecture & Implementation

1. **Ironclad Domain Locking**:
   - The AI prompt is strictly restricted to Nigerian tertiary institution admissions and UTME strategies.
   - If a candidate asks anything outside this domain (e.g. general programming, creative writing, world politics, pop culture, non-JAMB homework), the AI firmly and politely deflects:
     > *"I am strictly specialized as your ThinkRight JAMB Insider AI advisor. I can only assist with JAMB subject combinations, course admission requirements, O'Level prerequisites, and UTME exam strategies. Please ask a question related to your JAMB journey!"*
   - Includes prompt injection and jailbreak guards to prevent breaking character.

2. **Backend Supabase Edge Function (\`supabase/functions/jamb-insider-ai/index.ts\`)**:
   - Implements CORS headers, POST verification, payload validation, and server-side secret reading (\`Deno.env.get("GROQ_API_KEY")\`).
   - Employs the fast \`llama-3.3-70b-versatile\` Groq model with temperature 0.2 for strict factual consistency.
   - Returns structured errors (\`MISSING_API_KEY\`) so the frontend gracefully prompts for the key or falls back to direct client test mode.

3. **Config & Direct Fallback (\`js/config.js\` & \`js/insider-ai.js\`)**:
   - \`js/config.js\`: Centralized config object \`THINKRIGHT_GROQ_CONFIG\` with \`getApiKey()\`, \`setApiKey()\`, and \`hasValidKey()\`.
   - In-app Groq API Key modal (\`#insiderConfigModal\`) allowing immediate local testing with user-provided Groq API keys stored securely in \`localStorage\`.

4. **Dual UI Layout & Starter Prompt Chips**:
   - **Tab 1: AI Admissions Advisor** (Active default): Full conversational interface with live pulse status, starter chips (Medicine & Surgery Combo, Law Requirements, Computer Science with Economics, Strategy to Score 300+, Compulsory English Novel Tips, Cut-Off Marks & Catchment), formatted markdown bubbles, auto-resizing input textarea, and bouncing typing indicator.
   - **Tab 2: Official Subject Directory**: Seamlessly toggles to the existing curated search directory and category filters from \`data/jamb_insider.json\`.

5. **Design System & Dark Mode (\`css/insider.css\`)**:
   - Strictly follows ThinkRight brand blue (\`#1d4ed8\`, \`#2563eb\`) with zero purple.
   - Full responsive support down to 320px mobile screens.
   - High-contrast dark mode styling (\`body.dark\`) on chat bubbles, markdown tables, badges, and modals.

6. **Automated Verification**:
   - Executed \`scratch/verify-jamb-insider-ai.js\` confirming 28/28 structural, styling, script, and API test cases passing.
   - Compiled and synchronized all production assets to \`dist/\` via \`npm run build\`.
`;

content = content.trimEnd() + section18;
fs.writeFileSync(path, content, 'utf8');
console.log('Successfully updated walkthrough.md with Section 18');
