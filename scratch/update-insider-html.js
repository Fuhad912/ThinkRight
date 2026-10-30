const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'insider.html');
let content = fs.readFileSync(filePath, 'utf8');

const mainSection = `        <main id="insiderRoot" class="insider-main">
            <!-- Hero Header -->
            <section class="insider-hero">
                <div class="insider-hero-badge">
                    <i class="fa-solid fa-robot"></i>
                    <span>AI Admissions Advisor &bull; Powered by Groq</span>
                </div>
                <h1>JAMB Insider</h1>
                <p>Your intelligent UTME companion: instant course subject combinations, O'Level prerequisites, cut-off marks, and high-scoring exam strategies.</p>
                <div class="insider-domain-lock-badge" title="This AI assistant is strictly locked to Nigerian UTME admissions">
                    <i class="fa-solid fa-shield-halved"></i>
                    <span>Strictly Locked to JAMB &amp; University Admissions Intelligence</span>
                </div>
            </section>

            <!-- Mode Switcher Tabs -->
            <nav class="insider-mode-nav" role="tablist" aria-label="JAMB Insider Modes">
                <button type="button" class="insider-mode-tab is-active" id="insiderTabChat" role="tab" aria-selected="true" aria-controls="insiderChatView">
                    <i class="fa-solid fa-comments"></i>
                    <span>AI Admissions Advisor</span>
                </button>
                <button type="button" class="insider-mode-tab" id="insiderTabDirectory" role="tab" aria-selected="false" aria-controls="insiderDirectoryView">
                    <i class="fa-solid fa-book-bookmark"></i>
                    <span>Official Subject Directory</span>
                </button>
            </nav>

            <!-- 1. AI CHAT VIEW (Active by default) -->
            <section class="insider-chat-view" id="insiderChatView" role="tabpanel" aria-labelledby="insiderTabChat">
                <!-- Chat Action Bar -->
                <div class="chat-top-bar">
                    <div class="chat-model-info">
                        <span class="chat-live-pulse" aria-hidden="true"></span>
                        <span class="chat-model-name">Groq Llama 3.3 (70B)</span>
                    </div>
                    <div class="chat-top-actions">
                        <button type="button" class="chat-action-btn" id="insiderConfigBtn" title="Groq API Key Settings" aria-label="API Key Settings">
                            <i class="fa-solid fa-gear"></i>
                            <span>API Key</span>
                        </button>
                        <button type="button" class="chat-action-btn" id="insiderClearChatBtn" title="Clear conversation" aria-label="Clear chat">
                            <i class="fa-solid fa-trash-can"></i>
                            <span>Clear</span>
                        </button>
                    </div>
                </div>

                <!-- Starter Prompt Chips -->
                <div class="starter-prompts-section">
                    <p class="starter-prompts-label"><i class="fa-solid fa-wand-magic-sparkles"></i> Frequently Asked Questions:</p>
                    <div class="starter-prompts-grid" id="insiderStarterChips">
                        <button type="button" class="starter-prompt-chip" data-prompt="What is the official JAMB subject combination for Medicine and Surgery?">
                            <i class="fa-solid fa-stethoscope"></i>
                            <span>Medicine &amp; Surgery Combo</span>
                        </button>
                        <button type="button" class="starter-prompt-chip" data-prompt="What are the JAMB and WAEC requirements for Law in Nigerian universities?">
                            <i class="fa-solid fa-scale-balanced"></i>
                            <span>Law Requirements</span>
                        </button>
                        <button type="button" class="starter-prompt-chip" data-prompt="Can I study Computer Science with Economics instead of Physics or Chemistry in JAMB?">
                            <i class="fa-solid fa-laptop-code"></i>
                            <span>Computer Science with Economics?</span>
                        </button>
                        <button type="button" class="starter-prompt-chip" data-prompt="What is the best strategy to score 300+ in JAMB UTME?">
                            <i class="fa-solid fa-rocket"></i>
                            <span>Strategy to Score 300+</span>
                        </button>
                        <button type="button" class="starter-prompt-chip" data-prompt="What are the key themes and likely questions from the compulsory JAMB English novel?">
                            <i class="fa-solid fa-book-open"></i>
                            <span>Compulsory English Novel Tips</span>
                        </button>
                        <button type="button" class="starter-prompt-chip" data-prompt="How do Federal University departmental cut-off marks and catchment areas work?">
                            <i class="fa-solid fa-building-columns"></i>
                            <span>Cut-Off Marks &amp; Catchment</span>
                        </button>
                    </div>
                </div>

                <!-- Chat Message Stream -->
                <div class="chat-messages-container" id="insiderChatMessages" role="log" aria-live="polite">
                    <!-- Populated dynamically by insider-ai.js -->
                </div>

                <!-- Sticky Bottom Input Form -->
                <form class="chat-input-form" id="insiderChatForm" autocomplete="off">
                    <div class="chat-input-wrapper">
                        <textarea
                            id="insiderChatInput"
                            class="chat-textarea"
                            placeholder="Ask about any course, subject combination, or JAMB question..."
                            rows="1"
                            aria-label="Ask JAMB Insider AI"
                            required
                        ></textarea>
                        <button type="submit" class="chat-send-btn" id="insiderSendBtn" title="Send message" aria-label="Send message">
                            <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
                        </button>
                    </div>
                    <p class="chat-disclaimer">
                        <i class="fa-solid fa-lock"></i> Strictly locked to JAMB &amp; tertiary admissions. Powered by Groq AI.
                    </p>
                </form>
            </section>

            <!-- 2. DIRECTORY VIEW (The existing curated knowledge base, accessible via Tab 2) -->
            <section class="insider-directory-view" id="insiderDirectoryView" style="display: none;" role="tabpanel" aria-labelledby="insiderTabDirectory">
                <div class="insider-controls" aria-label="Insider filters">
                    <div class="insider-search-wrap">
                        <span class="insider-search-icon" aria-hidden="true">
                            <i class="fa-solid fa-magnifying-glass tr-navbar__search-icon-svg"></i>
                        </span>
                        <input
                            id="insiderSearchInput"
                            class="insider-search-input"
                            type="search"
                            autocomplete="off"
                            placeholder="Search course, strategy, or plan..."
                            aria-label="Search JAMB Insider"
                        >
                    </div>
                    <div id="insiderCategoryChips" class="insider-chips" role="tablist" aria-label="Insider categories"></div>
                    <p id="insiderStats" class="insider-stats">0 results</p>
                    <p class="insider-updated" id="insiderUpdated" style="display: none;">Updated: --</p>
                </div>

                <div aria-live="polite">
                    <div id="insiderResults" class="insider-results"></div>
                    <p id="insiderEmptyState" class="insider-empty" hidden>No matching insider tips found.</p>
                </div>
            </section>
        </main>

        <!-- API KEY SETTINGS MODAL -->
        <div class="modal" id="insiderConfigModal" style="display: none;" role="dialog" aria-modal="true" aria-labelledby="insiderModalTitle">
            <div class="modal-content insider-config-modal-content">
                <div class="modal-header">
                    <h3 id="insiderModalTitle"><i class="fa-solid fa-key"></i> Groq API Key Settings</h3>
                    <button type="button" class="modal-close-icon" id="insiderConfigCloseBtn" aria-label="Close modal">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <p class="config-desc">
                        To connect with the Groq AI service, paste your <strong>Groq API Key</strong> below. Keys are stored locally on your device for testing.
                    </p>
                    <div class="config-input-group">
                        <label for="insiderApiKeyInput">Groq API Key (starts with <code>gsk_</code>):</label>
                        <input type="password" id="insiderApiKeyInput" class="config-key-input" placeholder="gsk_..." autocomplete="off">
                    </div>
                    <p class="config-help">
                        Don't have a key? Get one 100% free at <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">console.groq.com/keys</a>.
                    </p>
                    <p id="insiderKeyStatusMsg" class="config-status-msg"></p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="config-save-btn" id="insiderSaveKeyBtn">Save API Key</button>
                </div>
            </div>
        </div>`;

// Replace main section
const mainRegex = /<main id="insiderRoot" class="insider-main">[\s\S]*?<\/main>/;
content = content.replace(mainRegex, mainSection);

// Update script tags to include config.js and insider-ai.js
const oldScripts = `<script defer src="js/navbar-load.js?v=20260321-sg"></script>
    <script defer src="js/insider.js?v=20260321-sg"></script>`;

const newScripts = `<script defer src="js/navbar-load.js?v=20260321-sg"></script>
    <script defer src="js/config.js?v=20260324a"></script>
    <script defer src="js/insider-ai.js?v=20260324a"></script>
    <script defer src="js/insider.js?v=20260324a"></script>`;

content = content.replace(oldScripts, newScripts);

fs.writeFileSync(filePath, content, 'utf8');
console.log('INSIDER_HTML_UPDATED');
