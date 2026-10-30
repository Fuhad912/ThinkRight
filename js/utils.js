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
            // High-end Font Awesome animated icons instead of raw text emoji
            icon.innerHTML = theme === 'light'
                ? '<i class="fa-solid fa-moon theme-fa-icon theme-fa-moon" aria-hidden="true"></i>'
                : '<i class="fa-solid fa-sun theme-fa-icon theme-fa-sun" aria-hidden="true"></i>';
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
        christian_religious_studies: 'crs',
        christian_religious_knowledge: 'crs',
        christian_studies: 'crs',
        crk: 'crs',
        islamic_religious_studies: 'irs',
        islamic_religious_knowledge: 'irs',
        islamic_studies: 'irs',
        irk: 'irs',
        computer_studies: 'computer',
        computer_science: 'computer',
        agricultural_science: 'agriculture',
        agricultural_studies: 'agriculture',
        agric_science: 'agriculture',
        agric: 'agriculture',
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
        "Literature",
        "crs",
        "irs",
        "computer",
        "agriculture",
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
        literature: "literature in english",
        crs: "christian religious studies",
        irs: "islamic religious studies",
        computer: "computer studies",
        agriculture: "agricultural science",
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
    const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
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
// CAPACITOR MOBILE ENHANCEMENTS
//
// Native shell quality-of-life features for Android/iOS wrapper:
// - status bar style sync with theme
// - Android back-button handling (history + double-back to exit on home)
// - external link handoff to system browser
// - offline overlay for connectivity loss
// ============================================================================

function isCapacitorNativeRuntime() {
    try {
        return Boolean(
            window.Capacitor &&
            typeof window.Capacitor.isNativePlatform === 'function' &&
            window.Capacitor.isNativePlatform()
        );
    } catch (_e) {
        return false;
    }
}

function getCapacitorPlugin(pluginName) {
    try {
        return window.Capacitor?.Plugins?.[pluginName] || null;
    } catch (_e) {
        return null;
    }
}

function createOfflineOverlay() {
    if (document.getElementById('tr-offline-overlay')) {
        return document.getElementById('tr-offline-overlay');
    }

    const overlay = document.createElement('div');
    overlay.id = 'tr-offline-overlay';
    overlay.className = 'tr-offline-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-live', 'assertive');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('hidden', 'hidden');
    overlay.innerHTML = `
        <div class="tr-offline-card">
            <h2>No internet connection</h2>
            <p>Your connection dropped. Reconnect and retry to continue using ThinkRight.</p>
            <button type="button" class="tr-offline-retry-btn" id="trOfflineRetryBtn">Retry</button>
        </div>
    `;

    document.body.appendChild(overlay);

    const retryButton = document.getElementById('trOfflineRetryBtn');
    if (retryButton) {
        retryButton.addEventListener('click', () => {
            window.location.reload();
        });
    }

    return overlay;
}

function setupOfflineOverlay() {
    const overlay = createOfflineOverlay();

    const updateState = () => {
        if (navigator.onLine) {
            overlay.classList.remove('is-visible');
            overlay.setAttribute('hidden', 'hidden');
            return;
        }

        overlay.classList.add('is-visible');
        overlay.removeAttribute('hidden');
    };

    window.addEventListener('online', updateState);
    window.addEventListener('offline', updateState);
    updateState();
}

function showAndroidBackToast(message) {
    const existing = document.getElementById('tr-back-toast');
    if (existing) {
        existing.remove();
    }

    const toast = document.createElement('div');
    toast.id = 'tr-back-toast';
    toast.className = 'tr-back-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    window.setTimeout(() => {
        toast.classList.add('is-visible');
    }, 10);

    window.setTimeout(() => {
        toast.classList.remove('is-visible');
        window.setTimeout(() => toast.remove(), 250);
    }, 1800);
}

function setupAndroidBackButtonBehavior() {
    const appPlugin = getCapacitorPlugin('App');
    const platform = window.Capacitor?.getPlatform?.();
    if (!appPlugin || typeof appPlugin.addListener !== 'function' || platform !== 'android') {
        return;
    }

    let lastBackPress = 0;
    const EXIT_WINDOW_MS = 1800;

    const isHomeRoute = () => {
        const path = (window.location.pathname || '').replace(/\/+$/, '');
        return path === '' || path === '/' || path.endsWith('/index.html');
    };

    appPlugin.addListener('backButton', (event) => {
        const canGoBack = Boolean(event?.canGoBack);
        if (canGoBack && window.history.length > 1) {
            window.history.back();
            return;
        }

        if (!isHomeRoute()) {
            window.location.href = 'index.html';
            return;
        }

        const now = Date.now();
        if (now - lastBackPress < EXIT_WINDOW_MS) {
            appPlugin.exitApp();
            return;
        }

        lastBackPress = now;
        showAndroidBackToast('Press back again to exit');
    });
}

function setupStatusBarForTheme() {
    const statusBar = getCapacitorPlugin('StatusBar');
    if (!statusBar || typeof statusBar.setStyle !== 'function') {
        return;
    }

    const applyStyle = () => {
        const theme = document.documentElement.getAttribute('data-theme') || 'light';
        const style = theme === 'dark' ? 'LIGHT' : 'DARK';
        const backgroundColor = theme === 'dark' ? '#1a1a1a' : '#ffffff';

        try {
            statusBar.setStyle({ style });
            if (typeof statusBar.setBackgroundColor === 'function') {
                statusBar.setBackgroundColor({ color: backgroundColor });
            }
        } catch (error) {
            console.warn('Status bar style update failed:', error);
        }
    };

    applyStyle();

    const observer = new MutationObserver(() => applyStyle());
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
    });
}

function setupExternalBrowserHandoff() {
    const browserPlugin = getCapacitorPlugin('Browser');
    if (!browserPlugin || typeof browserPlugin.open !== 'function') {
        return;
    }

    document.addEventListener('click', (event) => {
        const anchor = event.target.closest('a[href]');
        if (!anchor) return;

        const rawHref = anchor.getAttribute('href');
        if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) {
            return;
        }

        const isMailOrTel = rawHref.startsWith('mailto:') || rawHref.startsWith('tel:');
        if (isMailOrTel) {
            event.preventDefault();
            window.location.href = rawHref;
            return;
        }

        let url;
        try {
            url = new URL(rawHref, window.location.href);
        } catch (_e) {
            return;
        }

        const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
        const shouldOpenExternal =
            anchor.target === '_blank' ||
            (isHttp && url.origin !== window.location.origin);

        if (!shouldOpenExternal) return;

        event.preventDefault();
        browserPlugin.open({ url: url.href });
    });
}

function initCapacitorMobileEnhancements() {
    if (!isCapacitorNativeRuntime()) {
        return;
    }

    setupOfflineOverlay();
    setupStatusBarForTheme();
    setupAndroidBackButtonBehavior();
    setupExternalBrowserHandoff();
}

// ============================================================================
// TEST START CONFIRMATION MODAL
// ============================================================================

const TR_SUBJECT_META = {
    'mathematics': { name: 'Mathematics', icon: 'fa-solid fa-calculator', color: '#2563eb', bg: 'rgba(37, 99, 235, 0.1)' },
    'english': { name: 'Use of English', icon: 'fa-solid fa-book-open', color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.1)' },
    'physics': { name: 'Physics', icon: 'fa-solid fa-atom', color: '#059669', bg: 'rgba(5, 150, 105, 0.1)' },
    'chemistry': { name: 'Chemistry', icon: 'fa-solid fa-flask', color: '#0891b2', bg: 'rgba(8, 145, 178, 0.1)' },
    'biology': { name: 'Biology', icon: 'fa-solid fa-dna', color: '#16a34a', bg: 'rgba(22, 163, 74, 0.1)' },
    'agriculture': { name: 'Agricultural Science', icon: 'fa-solid fa-seedling', color: '#65a30d', bg: 'rgba(101, 163, 13, 0.1)' },
    'computer': { name: 'Computer Studies', icon: 'fa-solid fa-laptop-code', color: '#0284c7', bg: 'rgba(2, 132, 199, 0.1)' },
    'crs': { name: 'Christian Religious Studies', icon: 'fa-solid fa-cross', color: '#9333ea', bg: 'rgba(147, 51, 234, 0.1)' },
    'irs': { name: 'Islamic Religious Studies', icon: 'fa-solid fa-moon', color: '#0d9488', bg: 'rgba(13, 148, 136, 0.1)' },
    'commerce': { name: 'Commerce', icon: 'fa-solid fa-scale-balanced', color: '#d97706', bg: 'rgba(217, 119, 6, 0.1)' },
    'economics': { name: 'Economics', icon: 'fa-solid fa-chart-line', color: '#ea580c', bg: 'rgba(234, 88, 12, 0.1)' },
    'government': { name: 'Government', icon: 'fa-solid fa-landmark', color: '#4f46e5', bg: 'rgba(79, 70, 229, 0.1)' },
    'literature': { name: 'Literature in English', icon: 'fa-solid fa-feather-pointed', color: '#db2777', bg: 'rgba(219, 39, 119, 0.1)' },
    'geography': { name: 'Geography', icon: 'fa-solid fa-earth-africa', color: '#0369a1', bg: 'rgba(3, 105, 161, 0.1)' },
    'history': { name: 'History', icon: 'fa-solid fa-landmark-dome', color: '#b45309', bg: 'rgba(180, 83, 9, 0.1)' }
};
window.TR_SUBJECT_META = TR_SUBJECT_META;

if (typeof window.getSubjectDisplayName !== 'function') {
    window.getSubjectDisplayName = function(subject) {
        const key = typeof normalizeSubject === 'function'
            ? normalizeSubject(subject)
            : (subject || '').toString().trim().toLowerCase();
        if (TR_SUBJECT_META[key]) {
            return TR_SUBJECT_META[key].name;
        }
        return subject ? (subject.charAt(0).toUpperCase() + subject.slice(1)) : 'Practice Test';
    };
}

function injectTestConfirmationModal() {
    let modal = document.getElementById('trTestConfirmModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'trTestConfirmModal';
    modal.className = 'tr-confirm-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'trConfirmSubjectTitle');
    modal.setAttribute('aria-hidden', 'true');

    modal.innerHTML = `
      <div class="tr-confirm-modal__backdrop" id="trConfirmBackdrop"></div>
      <div class="tr-confirm-modal__dialog" role="document">
        <button type="button" class="tr-confirm-modal__close" aria-label="Close dialog" id="trConfirmCloseBtn">
          <i class="fa-solid fa-xmark"></i>
        </button>
        <div class="tr-confirm-modal__header">
          <div class="tr-confirm-modal__icon-wrap" id="trConfirmIconWrap">
            <i class="fa-solid fa-book-open" id="trConfirmIcon"></i>
          </div>
          <div class="tr-confirm-modal__title-group">
            <span class="tr-confirm-modal__badge">JAMB UTME CBT</span>
            <h2 id="trConfirmSubjectTitle" class="tr-confirm-modal__title">Subject Test</h2>
            <p class="tr-confirm-modal__subtitle">Ready to begin your timed practice test?</p>
          </div>
        </div>

        <div class="tr-confirm-modal__grid">
          <div class="tr-confirm-stat">
            <div class="tr-confirm-stat__icon"><i class="fa-regular fa-clock"></i></div>
            <div class="tr-confirm-stat__content">
              <span class="tr-confirm-stat__label">Time Limit</span>
              <strong class="tr-confirm-stat__val">30 Minutes</strong>
            </div>
          </div>
          <div class="tr-confirm-stat">
            <div class="tr-confirm-stat__icon"><i class="fa-solid fa-list-ol"></i></div>
            <div class="tr-confirm-stat__content">
              <span class="tr-confirm-stat__label">Questions</span>
              <strong class="tr-confirm-stat__val">30 Questions</strong>
            </div>
          </div>
          <div class="tr-confirm-stat">
            <div class="tr-confirm-stat__icon"><i class="fa-solid fa-bolt"></i></div>
            <div class="tr-confirm-stat__content">
              <span class="tr-confirm-stat__label">Scoring</span>
              <strong class="tr-confirm-stat__val">Instant CBT</strong>
            </div>
          </div>
          <div class="tr-confirm-stat">
            <div class="tr-confirm-stat__icon"><i class="fa-solid fa-shuffle"></i></div>
            <div class="tr-confirm-stat__content">
              <span class="tr-confirm-stat__label">Question Pool</span>
              <strong class="tr-confirm-stat__val">Randomized</strong>
            </div>
          </div>
        </div>

        <div class="tr-confirm-modal__notice">
          <i class="fa-solid fa-circle-info tr-confirm-notice__icon"></i>
          <p class="tr-confirm-notice__text">The timer starts as soon as you confirm. Please ensure you have a quiet environment and stable connection.</p>
        </div>

        <div class="tr-confirm-modal__actions">
          <button type="button" class="tr-confirm-btn tr-confirm-btn--primary" id="trConfirmStartBtn">
            <span>Start Test Now</span>
            <i class="fa-solid fa-arrow-right"></i>
          </button>
          <button type="button" class="tr-confirm-btn tr-confirm-btn--secondary" id="trConfirmCancelBtn">
            Choose Another Subject
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('#trConfirmCloseBtn');
    const cancelBtn = modal.querySelector('#trConfirmCancelBtn');
    const backdrop = modal.querySelector('#trConfirmBackdrop');

    const handleDismiss = () => closeTestConfirmationModal();

    if (closeBtn) closeBtn.addEventListener('click', handleDismiss);
    if (cancelBtn) cancelBtn.addEventListener('click', handleDismiss);
    if (backdrop) backdrop.addEventListener('click', handleDismiss);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('is-active')) {
            closeTestConfirmationModal();
        }
    });

    return modal;
}

function showTestConfirmationModal(subjectKey, options = {}) {
    const rawKey = subjectKey || 'mathematics';
    const normalized = typeof normalizeSubject === 'function' ? normalizeSubject(rawKey) : rawKey;
    const meta = TR_SUBJECT_META[normalized] || {
        name: typeof getSubjectDisplayName === 'function' ? getSubjectDisplayName(normalized) : normalized,
        icon: 'fa-solid fa-graduation-cap',
        color: '#1d4ed8',
        bg: 'rgba(29, 78, 216, 0.1)'
    };

    const modal = injectTestConfirmationModal();
    const titleEl = modal.querySelector('#trConfirmSubjectTitle');
    const iconWrap = modal.querySelector('#trConfirmIconWrap');
    const iconEl = modal.querySelector('#trConfirmIcon');
    const startBtn = modal.querySelector('#trConfirmStartBtn');

    if (titleEl) titleEl.textContent = meta.name;
    if (iconWrap) {
        iconWrap.style.backgroundColor = meta.bg;
        iconWrap.style.color = meta.color;
    }
    if (iconEl) {
        iconEl.className = meta.icon;
    }

    if (startBtn) {
        startBtn.disabled = false;
        startBtn.innerHTML = `<span>Start Test Now</span><i class="fa-solid fa-arrow-right"></i>`;

        const newStartBtn = startBtn.cloneNode(true);
        startBtn.parentNode.replaceChild(newStartBtn, startBtn);

        newStartBtn.addEventListener('click', () => {
            newStartBtn.disabled = true;
            newStartBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Preparing Test...</span>`;

            try {
                if (window.StorageManager && typeof window.StorageManager.setSelectedSubject === 'function') {
                    window.StorageManager.setSelectedSubject(normalized);
                } else {
                    localStorage.setItem('selected_subject', normalized);
                }
            } catch (e) {
                // ignore
            }

            if (typeof options.onConfirm === 'function') {
                options.onConfirm(normalized);
                return;
            }

            setTimeout(() => {
                window.location.href = 'test.html';
            }, 180);
        });
    }

    modal.classList.add('is-active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    const activeStartBtn = modal.querySelector('#trConfirmStartBtn');
    if (activeStartBtn) {
        setTimeout(() => activeStartBtn.focus(), 60);
    }
}

function closeTestConfirmationModal() {
    const modal = document.getElementById('trTestConfirmModal');
    if (!modal) return;
    modal.classList.remove('is-active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

window.showTestConfirmationModal = showTestConfirmationModal;
window.closeTestConfirmationModal = closeTestConfirmationModal;

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

    // Apply native-shell polish only when running inside Capacitor.
    initCapacitorMobileEnhancements();

    // Set up theme toggle listeners on all theme buttons
    const themeButtons = document.querySelectorAll('.theme-toggle');
    themeButtons.forEach(btn => {
        btn.addEventListener('click', toggleTheme);
    });
});
