/**
 * THINKRIGHT - UTILITY FUNCTIONS MODULE
 * 
 * This module contains reusable utility functions that are shared across
 * the application. It's designed to be independent and easy to test.
 * 
 * Functions:
 * - Theme Management (initTheme, toggleTheme, getTheme, setTheme)
 * - Data Loading (fetchQuestions, getQuestionsForTest)
 * - Array Utilities (shuffleArray, getRandomItems)
 * - Storage Management (StorageManager class)
 * 
 * FUTURE-PROOFING: This module is structured to support future features
 * like API integration, authentication, and analytics.
 */

// ============================================================================
// THEME MANAGEMENT
// 
// Handles light/dark mode switching with localStorage persistence.
// Defaults to light mode on first visit.
// ============================================================================

/**
 * Initialize theme on page load
 * 
 * Logic:
 * 1. Check if user has saved a theme preference in localStorage
 * 2. If not, default to light mode (system preference ignored)
 * 3. Apply the theme and set data-theme attribute on html element
 */
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    let theme = 'light';

    if (savedTheme) {
        // User has explicitly set a theme before
        theme = savedTheme;
    }
    // Always default to light mode, ignore system preference

    setTheme(theme);
}

/**
 * Set theme and update DOM + localStorage
 * @param {string} theme - 'light' or 'dark'
 */
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    updateThemeIcon(theme);
}

/**
 * Toggle between light and dark theme
 */
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
}

/**
 * Get current theme
 * @returns {string} 'light' or 'dark'
 */
function getTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
}

/**
 * Update theme toggle button icon based on current theme
 * @param {string} theme - Current theme
 */
function updateThemeIcon(theme) {
    const themeButtons = document.querySelectorAll('.theme-toggle');
    themeButtons.forEach(btn => {
        const icon = btn.querySelector('.theme-icon');
        if (icon) {
            // Show moon icon in light mode, sun icon in dark mode
            icon.textContent = theme === 'light' ? '🌙' : '☀️';
        }
    });
}

// ============================================================================
// DATA LOADING & QUESTION MANAGEMENT
// 
// Handles fetching questions from JSON files and selecting random questions
// for tests without repetition.
// ============================================================================

/**
 * Fetch questions from JSON file
 * 
 * @param {string} subject - 'mathematics' or 'english'
 * @returns {Promise<Array>} Array of question objects
 * 
 * Note: This function loads from static JSON files.
 * FUTURE: Replace with API call to backend:
 *   return fetch(`/api/questions/${subject}`).then(r => r.json())
 */
async function fetchQuestions(subject) {
    const normalizedSubject = normalizeSubject(subject);
    const fetchErrors = [];

    // Local file:// support: if an embedded question bank exists, use it first.
    // In production (http/https), prefer loading from /data/*.json so updates deploy cleanly.
    if (window.location.protocol === "file:") {
        // Ensure the global exists even if question-bank.js isn't loaded for some reason.
        window.THINKRIGHT_QUESTION_BANK = window.THINKRIGHT_QUESTION_BANK || {};

        let embedded = window.THINKRIGHT_QUESTION_BANK[normalizedSubject];
        if (!Array.isArray(embedded) || embedded.length === 0) {
            // Auto-load the per-subject bank script on-demand (fixes file:// fetch CORS).
            const loaded = await loadEmbeddedBankScript(normalizedSubject);
            if (loaded) {
                embedded = window.THINKRIGHT_QUESTION_BANK[normalizedSubject];
            }
        }

        if (Array.isArray(embedded) && embedded.length > 0) {
            const validEmbedded = embedded.filter(isValidQuestion);
            if (validEmbedded.length > 0) {
                return validEmbedded;
            }
            fetchErrors.push(`embedded-bank -> no valid question objects for key "${normalizedSubject}"`);
        } else {
            fetchErrors.push(`embedded-bank -> missing key "${normalizedSubject}"`);
            // In file:// mode, don't continue to fetch() data/*.json (it will be blocked).
            fetchErrors.push("file-protocol -> fetch blocked (use embedded banks)");
            const details = ` Tried: ${fetchErrors.join(' | ')}`;
            const err = new Error(`Unable to load questions for subject "${subject}".${details}`);
            console.error(err.message);
            throw err;
        }
    }

    // Resolve filename differences between subject keys and physical files.
    const fileCandidates = [
        normalizedSubject,
        normalizedSubject.toLowerCase(),
        normalizedSubject.charAt(0).toUpperCase() + normalizedSubject.slice(1),
    ];

    if (normalizedSubject === 'government') {
        fileCandidates.push('goverment');
    }
    if (normalizedSubject === 'literature') {
        fileCandidates.push('Literature');
    }

    const uniqueCandidates = [...new Set(fileCandidates)];

    for (const fileName of uniqueCandidates) {
        try {
            const response = await fetch(`data/${fileName}.json`);
            if (!response.ok) {
                fetchErrors.push(`${fileName}.json -> ${response.status}`);
                continue;
            }

            const questions = await response.json();
            if (!Array.isArray(questions) || questions.length === 0) {
                fetchErrors.push(`${fileName}.json -> empty or invalid JSON array`);
                continue;
            }

            // Discard malformed entries rather than crashing at render-time.
            const validQuestions = questions.filter(isValidQuestion);
            if (validQuestions.length === 0) {
                fetchErrors.push(`${fileName}.json -> no valid question objects`);
                continue;
            }

            return validQuestions;
        } catch (error) {
            fetchErrors.push(`${fileName}.json -> ${error.message}`);
        }
    }

    // Last-resort fallback: load known banks and match by subject field.
    // Skip this on file:// because fetch() is blocked there and only creates noisy CORS errors.
    if (window.location.protocol !== "file:") {
        try {
            const fallbackQuestions = await fetchQuestionsFromKnownBanks(normalizedSubject);
            if (Array.isArray(fallbackQuestions) && fallbackQuestions.length > 0) {
                return fallbackQuestions;
            }
        } catch (fallbackError) {
            fetchErrors.push(`known-bank-fallback -> ${fallbackError.message}`);
        }
    } else {
        fetchErrors.push("file-protocol -> fetch fallback disabled");
    }

    const details = fetchErrors.length > 0 ? ` Tried: ${fetchErrors.join(' | ')}` : '';
    const err = new Error(`Unable to load questions for subject "${subject}".${details}`);
    console.error(err.message);
    throw err;
}

/**
 * Dynamically load a per-subject embedded bank script (file:// support).
 *
 * @param {string} normalizedSubject
 * @returns {Promise<boolean>}
 */
async function loadEmbeddedBankScript(normalizedSubject) {
    if (window.location.protocol !== "file:") return false;

    try {
        // Cache per-subject load to avoid duplicate <script> injections.
        const cache = window.__tr_bank_loads || (window.__tr_bank_loads = {});
        if (cache[normalizedSubject]) return cache[normalizedSubject];

        cache[normalizedSubject] = new Promise((resolve) => {
            const script = document.createElement("script");
            script.defer = true;
            script.src = `js/banks/${normalizedSubject}.js`;
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
        });

        return await cache[normalizedSubject];
    } catch (e) {
        return false;
    }
}

/**
 * Get random questions for a test
 * 
 * @param {string} subject - 'mathematics' or 'english'
 * @param {number} count - Number of questions to select (default: 30)
 * @returns {Promise<Array>} Shuffled array of selected questions
 * 
 * This function:
 * 1. Fetches all questions
 * 2. Shuffles them randomly
 * 3. Selects the first 'count' questions
 * 4. Returns them in shuffled order for test
 */
async function getQuestionsForTest(subject, count = 30) {
    const allQuestions = await fetchQuestions(subject);
    
    // Ensure we don't try to get more questions than available
    const actualCount = Math.min(count, allQuestions.length);
    
    // Shuffle and select
    const shuffled = shuffleArray([...allQuestions]); // Create copy to avoid mutation
    return shuffled.slice(0, actualCount);
}

/**
 * Normalize subject keys from UI/storage into canonical keys used by data files.
 *
 * @param {string} subject
 * @returns {string}
 */
function normalizeSubject(subject) {
    if (!subject) return '';

    const cleaned = subject
        .toString()
        .trim()
        .toLowerCase()
        .replace(/-/g, '_')
        .replace(/\s+/g, '_');

    const aliasMap = {
        use_of_english: 'english',
        english_language: 'english',
        literature_in_english: 'literature',
        lit_in_english: 'literature',
        gov: 'government',
        govt: 'government',
        goverment: 'government',
    };

    return aliasMap[cleaned] || cleaned;
}

/**
 * Fallback loader that scans known data files and filters by subject metadata.
 *
 * @param {string} normalizedSubject
 * @returns {Promise<Array>}
 */
async function fetchQuestionsFromKnownBanks(normalizedSubject) {
    const knownBanks = [
        "mathematics",
        "english",
        "physics",
        "chemistry",
        "biology",
        "commerce",
        "economics",
        "geography",
        "history",
        "goverment",
        "Literature"
    ];

    const aliasToDisplay = {
        mathematics: "mathematics",
        english: "use of english",
        physics: "physics",
        chemistry: "chemistry",
        biology: "biology",
        commerce: "commerce",
        economics: "economics",
        geography: "geography",
        history: "history",
        government: "government",
        literature: "literature in english"
    };

    const expected = aliasToDisplay[normalizedSubject] || normalizedSubject;

    for (const bank of knownBanks) {
        try {
            const response = await fetch(`data/${bank}.json`);
            if (!response.ok) continue;

            const payload = await response.json();
            if (!Array.isArray(payload) || payload.length === 0) continue;

            const scoped = payload.filter((q) => {
                const subjectLabel = (q?.subject || "").toString().trim().toLowerCase();
                return subjectLabel === expected || subjectLabel.includes(expected);
            }).filter(isValidQuestion);

            if (scoped.length > 0) {
                return scoped;
            }
        } catch (error) {
            // Continue through fallback banks.
        }
    }

    return [];
}

// ============================================================================
// ARRAY UTILITIES
// 
// Helper functions for common array operations.
// ============================================================================

/**
 * Shuffle an array using Fisher-Yates algorithm
 * 
 * @param {Array} array - Array to shuffle
 * @returns {Array} Shuffled array (mutates original)
 * 
 * Algorithm explanation:
 * - Start from the end of the array
 * - For each position, pick a random element from the remaining unshuffled portion
 * - Swap the current position with the random element
 * - Move to the previous position
 * This ensures every permutation has equal probability
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const randomIndex = Math.floor(Math.random() * (i + 1));
        // Swap
        [array[i], array[randomIndex]] = [array[randomIndex], array[i]];
    }
    return array;
}

/**
 * Get n random items from an array without repetition
 * 
 * @param {Array} array - Source array
 * @param {number} count - Number of items to select
 * @returns {Array} Array of random items
 */
function getRandomItems(array, count) {
    const shuffled = shuffleArray([...array]);
    return shuffled.slice(0, Math.min(count, array.length));
}

// ============================================================================
// STORAGE MANAGER CLASS
// 
// Centralized storage management for localStorage operations.
// Designed for easy migration to backend storage in the future.
// 
// FUTURE: Replace localStorage calls with API calls
// ============================================================================

class StorageManager {
    /**
     * Save test result to localStorage
     * 
     * @param {Object} result - Result object containing:
     *   - subject: 'mathematics' or 'english'
     *   - score: percentage (0-100)
     *   - correctCount: number of correct answers
     *   - wrongCount: number of wrong answers
     *   - totalQuestions: total questions attempted
     *   - timestamp: when test was completed
     *   - answers: array of user's answers
     * 
     * FUTURE: POST to /api/results instead of storing locally
     */
    static saveResult(result) {
        try {
            const results = StorageManager.getResults();
            
            // Add timestamp if not provided
            if (!result.timestamp) {
                result.timestamp = new Date().toISOString();
            }

            results.push(result);
            localStorage.setItem('test_results', JSON.stringify(results));
            
            console.log('Result saved successfully:', result);
            return true;
        } catch (error) {
            console.error('Error saving result:', error);
            return false;
        }
    }

    /**
     * Get all test results from localStorage
     * 
     * @returns {Array} Array of all test results
     * 
     * FUTURE: GET from /api/results instead
     */
    static getResults() {
        try {
            const results = localStorage.getItem('test_results');
            return results ? JSON.parse(results) : [];
        } catch (error) {
            console.error('Error retrieving results:', error);
            return [];
        }
    }

    /**
     * Get results for a specific subject
     * 
     * @param {string} subject - 'mathematics' or 'english'
     * @returns {Array} Results for that subject
     */
    static getResultsBySubject(subject) {
        return StorageManager.getResults().filter(r => r.subject === subject);
    }

    /**
     * Get the most recent test result
     * 
     * @returns {Object|null} Most recent result or null if none exist
     */
    static getLastResult() {
        const results = StorageManager.getResults();
        return results.length > 0 ? results[results.length - 1] : null;
    }

    /**
     * Save current test state (for persistent timer)
     * 
     * @param {Object} testState - Object containing:
     *   - subject: current subject
     *   - currentQuestion: index of current question
     *   - answers: user's answers so far
     *   - timeRemaining: seconds left on timer
     *   - questions: the questions array for this test
     */
    static saveTestState(testState) {
        try {
            localStorage.setItem('current_test_state', JSON.stringify(testState));
            return true;
        } catch (error) {
            console.error('Error saving test state:', error);
            return false;
        }
    }

    /**
     * Get current test state (for timer persistence on refresh)
     * 
     * @returns {Object|null} Current test state or null if none
     */
    static getTestState() {
        try {
            const state = localStorage.getItem('current_test_state');
            return state ? JSON.parse(state) : null;
        } catch (error) {
            console.error('Error retrieving test state:', error);
            return null;
        }
    }

    /**
     * Clear current test state
     * Called when test is submitted or cancelled
     */
    static clearTestState() {
        localStorage.removeItem('current_test_state');
    }

    /**
     * Get selected subject from localStorage
     * 
     * @returns {string|null} 'mathematics', 'english', or null
     */
    static getSelectedSubject() {
        return localStorage.getItem('selected_subject');
    }

    /**
     * Save selected subject to localStorage
     * 
     * @param {string} subject - Subject to save
     */
    static setSelectedSubject(subject) {
        localStorage.setItem('selected_subject', subject);
    }

    /**
     * Clear selected subject
     */
    static clearSelectedSubject() {
        localStorage.removeItem('selected_subject');
    }
}

// ============================================================================
// TIME UTILITIES
// 
// Helper functions for time formatting and calculation.
// ============================================================================

/**
 * Convert seconds to MM:SS format
 * 
 * @param {number} seconds - Total seconds
 * @returns {string} Formatted string like "59:45"
 */
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Calculate percentage
 * 
 * @param {number} correct - Number of correct answers
 * @param {number} total - Total questions
 * @returns {number} Percentage (0-100)
 */
function calculatePercentage(correct, total) {
    if (total === 0) return 0;
    return Math.round((correct / total) * 100);
}

// ============================================================================
// VALIDATION UTILITIES
// 
// Helper functions for validating data.
// ============================================================================

/**
 * Validate that an answer option is valid
 * 
 * @param {string} answer - Answer to validate (A, B, C, D)
 * @returns {boolean} True if valid
 */
function isValidAnswer(answer) {
    return ['A', 'B', 'C', 'D'].includes(answer);
}

/**
 * Validate question object structure
 * 
 * @param {Object} question - Question to validate
 * @returns {boolean} True if question has required fields
 */
function isValidQuestion(question) {
    return (
        question &&
        typeof question === 'object' &&
        'question' in question &&
        'options' in question &&
        'correct_option' in question &&
        question.options.A &&
        question.options.B &&
        question.options.C &&
        question.options.D &&
        isValidAnswer(question.correct_option)
    );
}

// ============================================================================
// PWA SUPPORT
//
// Conservative installability support:
// - Inject required manifest/theme tags
// - Register service worker only on secure production origins
// - Show a small dismissible install prompt when supported
// ============================================================================

const PWA_THEME_COLOR = '#1d4ed8';
const PWA_INSTALL_DISMISS_KEY = 'tr_pwa_install_dismiss_until';
const PWA_INSTALL_DISMISS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
let deferredInstallPromptEvent = null;

function initPwaSupport() {
    ensurePwaHeadTags();
    registerThinkRightServiceWorker();
    setupPwaInstallPrompt();
}

function ensurePwaHeadTags() {
    const head = document.head;
    if (!head) return;

    if (!head.querySelector('link[rel="manifest"]')) {
        const manifest = document.createElement('link');
        manifest.rel = 'manifest';
        manifest.href = '/manifest.json';
        head.appendChild(manifest);
    }

    if (!head.querySelector('meta[name="theme-color"]')) {
        const themeMeta = document.createElement('meta');
        themeMeta.name = 'theme-color';
        themeMeta.content = PWA_THEME_COLOR;
        head.appendChild(themeMeta);
    }

    if (!head.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
        const capMeta = document.createElement('meta');
        capMeta.name = 'apple-mobile-web-app-capable';
        capMeta.content = 'yes';
        head.appendChild(capMeta);
    }

    if (!head.querySelector('link[rel="apple-touch-icon"]')) {
        const appleIcon = document.createElement('link');
        appleIcon.rel = 'apple-touch-icon';
        appleIcon.href = '/icons/icon-192.png';
        head.appendChild(appleIcon);
    }
}

function registerThinkRightServiceWorker() {
    const isLocalhost = window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.endsWith('.local');

    if (!('serviceWorker' in navigator) || isLocalhost || !window.isSecureContext) {
        return;
    }

    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('[PWA] Service worker registered:', registration.scope);
            })
            .catch((error) => {
                console.error('[PWA] Service worker registration failed:', error);
            });
    });
}

function setupPwaInstallPrompt() {
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
        return;
    }

    const dismissedUntil = Number(localStorage.getItem(PWA_INSTALL_DISMISS_KEY) || 0);
    if (dismissedUntil > Date.now()) {
        return;
    }

    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredInstallPromptEvent = event;
        showPwaInstallPrompt();
    });

    window.addEventListener('appinstalled', () => {
        deferredInstallPromptEvent = null;
        hidePwaInstallPrompt();
        console.log('[PWA] App installed successfully');
    });
}

function showPwaInstallPrompt() {
    if (document.getElementById('trPwaInstallPrompt')) return;
    if (!deferredInstallPromptEvent) return;

    const prompt = document.createElement('div');
    prompt.id = 'trPwaInstallPrompt';
    prompt.setAttribute('role', 'status');
    prompt.style.cssText = [
        'position: fixed',
        'left: 16px',
        'right: 16px',
        'bottom: 16px',
        'z-index: 11000',
        'max-width: 460px',
        'margin: 0 auto',
        'border: 1px solid rgba(148,163,184,0.35)',
        'border-radius: 12px',
        'background: #ffffff',
        'color: #0f172a',
        'box-shadow: 0 18px 38px rgba(15,23,42,0.22)',
        'padding: 12px',
        'font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif'
    ].join(';');

    prompt.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
            <div style="font-size:0.92rem;font-weight:600;">Install ThinkRight for faster access.</div>
            <div style="display:flex;gap:8px;">
                <button type="button" id="trPwaInstallNow" style="min-height:40px;padding:8px 12px;border:none;border-radius:8px;background:${PWA_THEME_COLOR};color:#fff;font-weight:600;cursor:pointer;">Install</button>
                <button type="button" id="trPwaInstallDismiss" style="min-height:40px;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;font-weight:600;cursor:pointer;">Not now</button>
            </div>
        </div>
    `;

    document.body.appendChild(prompt);

    const installBtn = document.getElementById('trPwaInstallNow');
    const dismissBtn = document.getElementById('trPwaInstallDismiss');

    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (!deferredInstallPromptEvent) {
                hidePwaInstallPrompt();
                return;
            }

            deferredInstallPromptEvent.prompt();
            try {
                await deferredInstallPromptEvent.userChoice;
            } catch (error) {
                console.warn('[PWA] Install prompt result unavailable:', error);
            }
            deferredInstallPromptEvent = null;
            hidePwaInstallPrompt();
        });
    }

    if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
            localStorage.setItem(PWA_INSTALL_DISMISS_KEY, String(Date.now() + PWA_INSTALL_DISMISS_MS));
            hidePwaInstallPrompt();
        });
    }
}

function hidePwaInstallPrompt() {
    const prompt = document.getElementById('trPwaInstallPrompt');
    if (prompt) prompt.remove();
}

// ============================================================================
// INITIALIZATION
// 
// Run on page load to set up the app.
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
    // Initialize Supabase auth (must be first!)
    initSupabase();
    
    // Initialize theme system
    initTheme();

    // PWA installability support (safe, conservative)
    initPwaSupport();
    
    // Set up theme toggle listeners on all theme buttons
    const themeButtons = document.querySelectorAll('.theme-toggle');
    themeButtons.forEach(btn => {
        btn.addEventListener('click', toggleTheme);
    });
});
