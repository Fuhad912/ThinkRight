/**
 * THINKRIGHT - TEST INTERFACE & TIMER
 * 
 * This is the main test-taking module. It handles:
 * - Loading questions for the selected subject
 * - Displaying questions and multiple choice options
 * - Navigation between questions (next/previous)
 * - User answer tracking
 * - Timer countdown with persistence (survives page refresh)
 * - Auto-submit when timer reaches zero
 * - Score calculation and results display
 * - Results saving to localStorage
 * 
 * Architecture Notes:
 * - Timer state is saved to localStorage every second
 * - User answers are tracked in an array
 * - Questions persist in memory to avoid re-fetching
 * 
 * FUTURE-READY:
 * - Replace localStorage with API calls for backend sync
 * - Add analytics/tracking of user performance
 * - Support for timed section breaks
 */

// ============================================================================
// CONFIGURATION & CONSTANTS
// 
// Centralize all settings for easy adjustment.
// ============================================================================

const CONFIG = {
    QUESTIONS_PER_TEST: 30,        // Can be changed to 40 when more questions added
    TEST_DURATION_MINUTES: 30,     // 30 minutes
    TEST_DURATION_SECONDS: 30 * 60, // 30 minutes in seconds
    TIMER_WARNING_THRESHOLD: 5 * 60, // Show warning when 5 minutes left
    TIMER_DANGER_THRESHOLD: 1 * 60,  // Show danger when 1 minute left
    AUTO_SAVE_INTERVAL: 5000,        // Save test state every 5 seconds
};

// ============================================================================
// STATE MANAGEMENT
// 
// Keep track of the current test state.
// ============================================================================

const testState = {
    subject: null,
    questions: [],
    currentQuestionIndex: 0,
    answers: {},           // { questionIndex: selectedAnswer }
    flaggedQuestions: {},  // { questionIndex: true }
    timerInterval: null,
    timeRemaining: CONFIG.TEST_DURATION_SECONDS,
    isTestStarted: false,
    isTestSubmitted: false,
    submissionInProgress: false,
    paletteUiReady: false,
};

// ============================================================================
// DOM REFERENCES
// 
// Cache commonly used DOM elements.
// ============================================================================

const elements = {
    // Header elements
    testSubject: document.getElementById('testSubject'),
    questionCounter: document.getElementById('questionCounter'),
    timer: document.getElementById('timer'),

    // Question display
    questionText: document.getElementById('questionText'),
    optionsContainer: document.getElementById('optionsContainer'),
    skipWarning: document.getElementById('skipWarning'),
    markReviewBtn: document.getElementById('markReviewBtn'),
    questionTopRow: document.querySelector('.question-top-row'),
    questionMobileActions: document.getElementById('questionMobileActions'),

    // Navigation
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    navStatus: document.getElementById('navStatus'),

    // Submit
    submitBtn: document.getElementById('submitBtn'),

    // Exit controls
    exitTestBtn: document.getElementById('exitTestBtn'),
    calcToggleBtn: document.getElementById('calcToggleBtn'),
    exitConfirmModal: document.getElementById('exitConfirmModal'),
    cancelExitBtn: document.getElementById('cancelExitBtn'),
    confirmExitBtn: document.getElementById('confirmExitBtn'),

    // Results modal
    resultsModal: document.getElementById('resultsModal'),
    finalScore: document.getElementById('finalScore'),
    correctCount: document.getElementById('correctCount'),
    wrongCount: document.getElementById('wrongCount'),
    performanceInsights: document.getElementById('performanceInsights'),
    insightsBadge: document.getElementById('insightsBadge'),
    insightsSubjectTag: document.getElementById('insightsSubjectTag'),
    insightsSummary: document.getElementById('insightsSummary'),
    insightsTopicsWrap: document.getElementById('insightsTopicsWrap'),
    insightsTopics: document.getElementById('insightsTopics'),

    // Results action buttons
    retakeBtn: document.getElementById('retakeBtn'),
    reviewBtn: document.getElementById('reviewBtn'),
    homeBtn: document.getElementById('homeBtn'),

    // Review modal
    reviewModal: document.getElementById('reviewModal'),
    reviewBody: document.getElementById('reviewBody'),
    reviewCloseBtn: document.getElementById('reviewCloseBtn'),
    reviewFilterBar: document.getElementById('reviewFilterBar'),
    reviewCountAll: document.getElementById('reviewCountAll'),
    reviewCountCorrect: document.getElementById('reviewCountCorrect'),
    reviewCountIncorrect: document.getElementById('reviewCountIncorrect'),
    reviewRetakeBtn: document.getElementById('reviewRetakeBtn'),
    reviewReturnBtn: document.getElementById('reviewReturnBtn'),

    // Anti-cheat modal
    antiCheatModal: document.getElementById('antiCheatModal'),
    antiCheatCloseBtn: document.getElementById('antiCheatCloseBtn'),
    submitConfirmModal: document.getElementById('submitConfirmModal'),
    confirmSubmitBtn: document.getElementById('confirmSubmitBtn'),
    cancelSubmitBtn: document.getElementById('cancelSubmitBtn'),

    // OMR palette
    questionPalette: document.getElementById('questionPalette'),
    paletteGrid: document.getElementById('paletteGrid'),
    paletteToggleBtn: document.getElementById('paletteToggleBtn'),
    paletteCloseBtn: document.getElementById('paletteCloseBtn'),
    paletteOverlay: document.getElementById('paletteOverlay'),
    paletteAnsweredCount: document.getElementById('paletteAnsweredCount'),
    paletteRemainingCount: document.getElementById('paletteRemainingCount'),
    paletteMarkedCount: document.getElementById('paletteMarkedCount'),
    paletteTotalCount: document.getElementById('paletteTotalCount'),
    paletteProgressFill: document.getElementById('paletteProgressFill'),
    paletteProgressPercent: document.getElementById('paletteProgressPercent'),
    mobileProgressFill: document.getElementById('mobileProgressFill'),
    mobileProgressCount: document.getElementById('mobileProgressCount'),

    // Test container
    testContainer: document.querySelector('.test-container'),
};

// ============================================================================
// UTILITY FUNCTIONS - LOADING INDICATOR
// ============================================================================

// Question loader with progress percentage.
let testLoaderShownAt = 0;
let testLoaderProgressValue = 0;
let testLoaderProgressRaf = null;

function renderLoadingProgress(value) {
    const percentEl = document.getElementById('testLoadingPercent');
    const barEl = document.getElementById('testLoadingProgressBar');
    const clamped = Math.max(0, Math.min(100, Number(value) || 0));

    testLoaderProgressValue = clamped;
    if (percentEl) percentEl.textContent = String(Math.round(clamped));
    if (barEl) barEl.style.width = `${clamped}%`;
}

function setLoadingProgress(progress, label) {
    if (window.ThinkRightLoader) {
        window.ThinkRightLoader.setProgress(progress, label);
    }
    const labelEl = document.getElementById('testLoadingLabel');
    const clamped = Math.max(0, Math.min(100, Number(progress) || 0));
    if (labelEl && label) labelEl.textContent = label;
    renderLoadingProgress(clamped);
}

function showLoadingIndicator(show, progress = 0, label = 'Preparing your test...') {
    if (window.ThinkRightLoader) {
        if (show) {
            window.ThinkRightLoader.hold('page-controller', label);
            window.ThinkRightLoader.setProgress(progress, label);
        } else {
            window.ThinkRightLoader.done('Questions ready');
        }
    }

    const indicator = document.getElementById('testLoadingOverlay');
    if (!indicator) return;

    if (show) {
        indicator.classList.add('is-hidden');
        indicator.setAttribute('aria-hidden', 'true');
        testLoaderShownAt = Date.now();
        renderLoadingProgress(0);
        setLoadingProgress(progress, label);
        return;
    }

    indicator.classList.add('is-hidden');
    indicator.setAttribute('aria-hidden', 'true');
    indicator.setAttribute('aria-busy', 'false');
    renderLoadingProgress(100);
    document.body.classList.remove('tr-loading');
}

/**
 * Show a locked UI on the test page when access is denied
 */
function showTestLockedMessage() {
    // Tests are free and unlocked for all users.
}

// ============================================================================
// INITIALIZATION
// 
// Run when the page loads.
// ============================================================================

/**
 * Initialize the test page
 * 
 * Flow:
 * 1. Check if user is authenticated (redirect to login if not)
 * 2. Get selected subject from localStorage
 * 3. Check if there's a saved test state (for timer persistence)
 * 4. Either resume previous test or start a new test
 * 5. Load questions for the subject
 * 6. Render the first question
 * 7. Start the timer
 * 8. Set up event listeners
 */
async function initTest() {
    try {
        console.log('Initializing test...');
        let didShowLoader = true;
        updateTimerDisplay();
        showLoadingIndicator(true, 4, 'Initializing secure test session...');
        
        // Wait for Supabase to be initialized
        let retries = 0;
        while (!window.authInitialized && retries < 20) {
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }

        if (!window.authInitialized) {
            showLoadingIndicator(false);
            console.error('❌ Supabase not initialized');
            window.location.href = 'login.html?error=init';
            return;
        }
        setLoadingProgress(14, 'Checking your account...');
        
        // Check authentication first
        const user = await getCurrentUser().catch(err => {
            console.error('getCurrentUser error:', err);
            return null;
        });

        if (!user) {
            // Production guard: tests require authentication for correct scoping + freemium logic.
            console.log('User not authenticated, redirecting to login...');
            showLoadingIndicator(false);
            window.location.href = 'login.html?next=' + encodeURIComponent('test.html');
            return;
        }

        console.log('User authenticated:', user.email);
        testState.userId = user.id;
        setLoadingProgress(24, 'Loading your test access...');

        // Initialize subscription state (access is enforced only when starting a NEW test).
        try {
            if (window.Subscription && typeof window.Subscription.init === 'function') {
                await window.Subscription.init();
            }
        } catch (err) {
            console.error('Subscription init error:', err);
            // Do not block test loading due to subscription init errors; access enforced below.
        }
        setLoadingProgress(32, 'Resolving selected subject...');

        // Get subject from localStorage (set by app.js)
        const storedSubject = StorageManager.getSelectedSubject();
        const subject = typeof normalizeSubject === 'function'
            ? normalizeSubject(storedSubject)
            : storedSubject;
        
        if (!subject) {
            console.error('No subject selected. Redirecting to home...');
            showLoadingIndicator(false);
            window.location.href = 'index.html';
            return;
        }

        testState.subject = subject;
        StorageManager.setSelectedSubject(subject);
        setLoadingProgress(40, 'Preparing question set...');

        // Update Scientific Calculator visibility for this subject
        if (window.ScientificCalculator && typeof window.ScientificCalculator.checkSubject === 'function') {
            window.ScientificCalculator.checkSubject(subject);
        }

        // Check if user was already taking a test (timer persistence)
        const savedState = StorageManager.getTestState();
        
        if (savedState && savedState.subject === subject) {
            console.log('Resuming previous test...');
            setLoadingProgress(70, 'Restoring your previous test...');
            // Resume the test
            testState.questions = savedState.questions;
            testState.currentQuestionIndex = Number.isInteger(savedState.currentQuestionIndex)
                ? savedState.currentQuestionIndex
                : Number.isInteger(savedState.currentQuestion)
                    ? savedState.currentQuestion
                    : 0;
            testState.answers = savedState.answers || {};
            testState.flaggedQuestions = savedState.flaggedQuestions || {};
            testState.timeRemaining = Number.isFinite(savedState.timeRemaining) && savedState.timeRemaining > 0
                ? savedState.timeRemaining
                : CONFIG.TEST_DURATION_SECONDS;
        } else {
            // New test: all tests are free and unlimited for all users.
            console.log('Starting new test...');
            setLoadingProgress(52, 'Fetching questions...');
            let fetchOk = false;
            try {
                console.log('Fetching questions for subject:', subject);
                testState.questions = await getQuestionsForTest(subject, CONFIG.QUESTIONS_PER_TEST);
                setLoadingProgress(82, 'Finalizing questions...');
                console.log(`Fetched ${testState.questions.length} questions for ${subject}`);
                if (!Array.isArray(testState.questions) || testState.questions.length === 0) {
                    throw new Error('No questions returned from getQuestionsForTest');
                }
                fetchOk = true;
            } catch (err) {
                console.error('Error fetching questions:', err);
                // Show friendly inline error instead of redirecting
                const errDivId = 'testLoadError';
                let errDiv = document.getElementById(errDivId);
                if (!errDiv) {
                    errDiv = document.createElement('div');
                    errDiv.id = errDivId;
                    errDiv.style.cssText = 'position:fixed;top:120px;left:50%;transform:translateX(-50%);background:#fff8f0;border:1px solid #ffcc99;padding:16px;border-radius:8px;z-index:11000;max-width:95%;box-shadow:0 8px 24px rgba(0,0,0,0.12);';
                    errDiv.innerHTML = `<strong>Unable to load questions.</strong><div style="margin-top:8px;color:#333;font-size:0.95rem;">${(err && err.message) ? err.message : 'Unknown error'}. Please try again or contact support.</div>`;
                    document.body.appendChild(errDiv);
                } else {
                    errDiv.style.display = 'block';
                }
                // fallback: set empty questions array so UI doesn't break
                testState.questions = [];
            } finally {
                if (!fetchOk) {
                    showLoadingIndicator(false);
                    didShowLoader = false;
                }
            }
        }

        testState.isTestStarted = true;

        // Hard stop if questions failed to load (prevents undefined renders / console errors)
        if (!Array.isArray(testState.questions) || testState.questions.length === 0) {
            showLoadingIndicator(false);
            return;
        }

        setLoadingProgress(92, 'Rendering test interface...');
        // Update UI with subject name
        updateSubjectDisplay();
        
        // Render the first question
        renderCurrentQuestion();
        renderQuestionPalette();
        updatePaletteStates();

        if (didShowLoader) {
            showLoadingIndicator(false);
        }
        
        // Set up event listeners
        setupEventListeners();
        
        // Start the timer
        startTimer();

        // Auto-save test state periodically
        setInterval(saveTestState, CONFIG.AUTO_SAVE_INTERVAL);

        // Initialize anti-cheat module
        antiCheat.init();

        // Activate exam lock mode (prevents accidental navigation away)
        examLock.activate();

        console.log(`Test started with ${testState.questions.length} questions`);
    } catch (error) {
        console.error('Error initializing test:', error);
        showLoadingIndicator(false);
        alert('Error loading test. Please try again.');
        window.location.href = 'index.html';
    }
}

// ============================================================================
// SUBJECT & DISPLAY MANAGEMENT
// ============================================================================

/**
 * Get display name for subject
 */
function getSubjectDisplayName(subject) {
    const key = typeof normalizeSubject === 'function'
        ? normalizeSubject(subject)
        : (subject || '').toString().trim().toLowerCase();

    const subjectMap = {
        'mathematics': 'Mathematics',
        'english': 'Use of English',
        'physics': 'Physics',
        'chemistry': 'Chemistry',
        'biology': 'Biology',
        'agriculture': 'Agricultural Science',
        'computer': 'Computer Studies',
        'crs': 'Christian Religious Studies',
        'irs': 'Islamic Religious Studies',
        'commerce': 'Commerce',
        'economics': 'Economics',
        'government': 'Government',
        'literature': 'Literature in English',
        'geography': 'Geography',
        'history': 'History'
    };
    return subjectMap[key] || subject;
}

/**
 * Update subject display in header
 */
function updateSubjectDisplay() {
    const subjectDisplay = getSubjectDisplayName(testState.subject);
    elements.testSubject.textContent = subjectDisplay;
    if (window.ScientificCalculator && typeof window.ScientificCalculator.checkSubject === 'function') {
        window.ScientificCalculator.checkSubject(testState.subject);
    }
}

/**
 * Update question counter in header
 */
function updateQuestionCounter() {
    const currentNum = testState.currentQuestionIndex + 1;
    if (elements.questionCounter) {
        elements.questionCounter.textContent = '';
        elements.questionCounter.style.display = 'none';
    }
    if (elements.navStatus) {
        elements.navStatus.textContent = '';
        elements.navStatus.style.display = 'none';
    }
    const numberBadge = document.getElementById('questionNumberBadge');
    if (numberBadge) {
        numberBadge.textContent = `Question ${currentNum}`;
    }
}

// ============================================================================
// QUESTION RENDERING
// 
// Display questions and options to the user.
// ============================================================================

/**
 * Format mathematical expressions in questions for better display
 * 
 * @param {string} text - Raw question text
 * @returns {string} HTML formatted text
 */
function formatMathQuestion(text) {
    // Escape HTML to prevent XSS (since we're using innerHTML)
    let formatted = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    // Convert Unicode subscripts to HTML
    formatted = formatted
        .replace(/₀/g, '<sub>0</sub>')
        .replace(/₁/g, '<sub>1</sub>')
        .replace(/₂/g, '<sub>2</sub>')
        .replace(/₃/g, '<sub>3</sub>')
        .replace(/₄/g, '<sub>4</sub>')
        .replace(/₅/g, '<sub>5</sub>')
        .replace(/₆/g, '<sub>6</sub>')
        .replace(/₇/g, '<sub>7</sub>')
        .replace(/₈/g, '<sub>8</sub>')
        .replace(/₉/g, '<sub>9</sub>')
        .replace(/₊/g, '<sub>+</sub>')
        .replace(/₋/g, '<sub>-</sub>')
        .replace(/₌/g, '<sub>=</sub>')
        .replace(/₍/g, '<sub>(</sub>')
        .replace(/₎/g, '<sub>)</sub>');

    // Convert Unicode superscripts to HTML
    formatted = formatted
        .replace(/⁰/g, '<sup>0</sup>')
        .replace(/¹/g, '<sup>1</sup>')
        .replace(/²/g, '<sup>2</sup>')
        .replace(/³/g, '<sup>3</sup>')
        .replace(/⁴/g, '<sup>4</sup>')
        .replace(/⁵/g, '<sup>5</sup>')
        .replace(/⁶/g, '<sup>6</sup>')
        .replace(/⁷/g, '<sup>7</sup>')
        .replace(/⁸/g, '<sup>8</sup>')
        .replace(/⁹/g, '<sup>9</sup>')
        .replace(/⁺/g, '<sup>+</sup>')
        .replace(/⁻/g, '<sup>-</sup>')
        .replace(/⁼/g, '<sup>=</sup>')
        .replace(/⁽/g, '<sup>(</sup>')
        .replace(/⁾/g, '<sup>)</sup>');

    // Handle common mathematical expressions
    formatted = formatted
        .replace(/log/g, '<i>log</i>')
        .replace(/sin/g, '<i>sin</i>')
        .replace(/cos/g, '<i>cos</i>')
        .replace(/tan/g, '<i>tan</i>')
        .replace(/sqrt/g, '<i>√</i>')
        .replace(/pi/g, '<i>π</i>')
        .replace(/alpha/g, '<i>α</i>')
        .replace(/beta/g, '<i>β</i>')
        .replace(/gamma/g, '<i>γ</i>')
        .replace(/delta/g, '<i>δ</i>')
        .replace(/theta/g, '<i>θ</i>');

    // Handle fractions (basic pattern: a/b)
    formatted = formatted.replace(/(\d+)\/(\d+)/g, '<sup>$1</sup>&frasl;<sub>$2</sub>');

    return formatted;
}

/**
 * Render the current question and its options
 * 
 * Steps:
 * 1. Get the current question object
 * 2. Validate it
 * 3. Display question text
 * 4. Render multiple choice options
 * 5. Highlight previously selected answer if any
 * 6. Update navigation buttons state
 * 7. Hide skip warning
 * 8. Animate the question
 */
function renderCurrentQuestion() {
    const question = testState.questions[testState.currentQuestionIndex];

    // Validate question
    if (!isValidQuestion(question)) {
        console.error('Invalid question:', question);
        return;
    }

    // Update question text with HTML support for math formatting
    elements.questionText.innerHTML = formatMathQuestion(question.question);
    updateMarkForReviewButton();

    if (window.ScientificCalculator && typeof window.ScientificCalculator.syncQuestion === 'function') {
        window.ScientificCalculator.syncQuestion(
            elements.questionText.innerHTML,
            testState.currentQuestionIndex,
            testState.questions.length
        );
    }

    // PERSISTENT 4-SLOT OPTION SHELL:
    // Update existing option buttons in-place to prevent layout shifts and shape changes
    const optionLetters = ['A', 'B', 'C', 'D'];
    let optionBtns = elements.optionsContainer.querySelectorAll('.option-button');

    // Initialize the standard 4-slot shell once if not already present
    if (optionBtns.length !== 4) {
        elements.optionsContainer.innerHTML = '';
        optionLetters.forEach(letter => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'option-button';
            btn.setAttribute('data-option', letter);
            btn.setAttribute('role', 'radio');
            btn.setAttribute('aria-checked', 'false');
            btn.innerHTML = `
                <span class="option-badge">${letter}</span>
                <span class="option-text"></span>
                <span class="option-indicator" aria-hidden="true"><i class="fa-solid fa-check"></i></span>
            `;
            btn.addEventListener('click', () => handleOptionSelect(letter, btn));
            elements.optionsContainer.appendChild(btn);
        });
        optionBtns = elements.optionsContainer.querySelectorAll('.option-button');
    }

    // Update the 4 persistent option shells in-place without destroying DOM nodes
    const currentAnswer = testState.answers[testState.currentQuestionIndex];
    optionBtns.forEach((btn, idx) => {
        const letter = optionLetters[idx];
        const rawText = question.options 
            ? (question.options[letter] ?? question.options[letter.toLowerCase()] ?? (Array.isArray(question.options) ? question.options[idx] : ''))
            : '';
        const textSpan = btn.querySelector('.option-text');
        if (textSpan) {
            textSpan.innerHTML = formatMathQuestion(rawText || '');
        }

        btn.style.display = 'flex';
        const isSelected = currentAnswer === letter;
        btn.classList.toggle('selected', isSelected);
        btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    });

    // Update navigation state
    updateNavigationState();

    // Hide skip warning when changing questions
    elements.skipWarning.style.display = 'none';

    // Keep palette state in sync while navigating
    updatePaletteStates();

    // Smooth subtle micro-fade on question text only (no vertical displacement)
    gsap.fromTo(elements.questionText,
        { opacity: 0.4 },
        { opacity: 1, duration: 0.18, ease: 'power1.out' }
    );
}

/**
 * Create a single option button element (helper for standalone shells)
 * 
 * @param {string} letter - Option letter (A, B, C, D)
 * @param {string} text - Option text content
 * @returns {HTMLElement} Option button element
 */
function createOptionButton(letter, text) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'option-button';
    button.setAttribute('data-option', letter);
    button.setAttribute('role', 'radio');
    button.innerHTML = `
        <span class="option-badge">${letter}</span>
        <span class="option-text">${formatMathQuestion(text || '')}</span>
        <span class="option-indicator" aria-hidden="true"><i class="fa-solid fa-check"></i></span>
    `;

    button.addEventListener('click', () => handleOptionSelect(letter, button));
    return button;
}

/**
 * Handle when user selects an option
 * 
 * @param {string} letter - Selected option letter
 * @param {HTMLElement} button - The clicked button element
 */
function handleOptionSelect(letter, button) {
    const currentIndex = testState.currentQuestionIndex;
    const isCurrentlySelected = testState.answers[currentIndex] === letter;

    if (isCurrentlySelected) {
        // Deselect the currently chosen option
        delete testState.answers[currentIndex];
        button.classList.remove('selected');
        button.blur();
        console.log(`Question ${currentIndex + 1}: Deselected option ${letter}`);
    } else {
        // Save the answer
        testState.answers[currentIndex] = letter;

        // Remove 'selected' class from all options
        const allOptions = elements.optionsContainer
            ? elements.optionsContainer.querySelectorAll('.option-button')
            : document.querySelectorAll('.option-button');
        allOptions.forEach(opt => opt.classList.remove('selected'));

        // Add 'selected' class to clicked option
        button.classList.add('selected');

        // Hide skip warning since answer was selected
        if (elements.skipWarning) {
            elements.skipWarning.style.display = 'none';
        }

        console.log(`Question ${currentIndex + 1}: Selected option ${letter}`);
    }

    // Auto-save state and update question palette indicators
    saveTestState();
    updatePaletteStates();
}

function updateMarkForReviewButton() {
    if (!elements.markReviewBtn) return;

    const isFlagged = !!testState.flaggedQuestions[testState.currentQuestionIndex];
    elements.markReviewBtn.classList.toggle('is-flagged', isFlagged);
    elements.markReviewBtn.setAttribute('aria-pressed', isFlagged ? 'true' : 'false');
    const labelText = isFlagged ? 'Flagged' : 'Flag';
    const ariaLabel = isFlagged ? 'Question flagged for review (click to remove)' : 'Flag question for review';
    elements.markReviewBtn.setAttribute('aria-label', ariaLabel);
    elements.markReviewBtn.setAttribute('title', ariaLabel);

    const iconClass = isFlagged ? 'fa-solid fa-flag' : 'fa-regular fa-flag';
    elements.markReviewBtn.innerHTML = `
        <i class="${iconClass}" aria-hidden="true"></i>
        <span class="mark-review-btn-text">${labelText}</span>
    `;
}

function toggleCurrentQuestionFlag() {
    const index = testState.currentQuestionIndex;
    if (testState.flaggedQuestions[index]) {
        delete testState.flaggedQuestions[index];
    } else {
        testState.flaggedQuestions[index] = true;
    }
    updateMarkForReviewButton();
    updatePaletteStates();
    saveTestState();
}

// ============================================================================
// NAVIGATION
// 
// Handle moving between questions.
// ============================================================================

/**
 * Update navigation button states
 * 
 * - Disable "Previous" if on first question
 * - Disable "Next" if on last question
 */
function updateNavigationState() {
    const isFirst = testState.currentQuestionIndex === 0;
    const isLast = testState.currentQuestionIndex === testState.questions.length - 1;

    elements.prevBtn.disabled = isFirst;
    elements.nextBtn.disabled = isLast;

    updateQuestionCounter();
}

/**
 * Move to previous question
 */
function goToPreviousQuestion() {
    if (testState.currentQuestionIndex > 0) {
        testState.currentQuestionIndex--;
        renderCurrentQuestion();
        updatePaletteStates();
        saveTestState();
    }
}

/**
 * Move to next question
 */
function goToNextQuestion() {
    // Soft warning: remind user to select an answer
    if (!(testState.currentQuestionIndex in testState.answers)) {
        elements.skipWarning.style.display = 'flex';
        // Still allow moving forward
        console.warn('Question skipped without answer');
    }

    if (testState.currentQuestionIndex < testState.questions.length - 1) {
        testState.currentQuestionIndex++;
        renderCurrentQuestion();
        updatePaletteStates();
        saveTestState();
    }
}

// ============================================================================
// TIMER SYSTEM
// 
// Countdown timer with localStorage persistence.
// Timer survives page refresh.
// ============================================================================

/**
 * Start the countdown timer
 * 
 * The timer:
 * 1. Counts down every second
 * 2. Updates the display
 * 3. Changes color as time runs out (warning → danger)
 * 4. Auto-submits when time reaches zero
 * 5. Saves state periodically for persistence
 */
function startTimer() {
    // Clear any existing timer
    if (testState.timerInterval) {
        clearInterval(testState.timerInterval);
    }

    updateTimerDisplay();

    testState.timerInterval = setInterval(() => {
        testState.timeRemaining--;

        updateTimerDisplay();

        // Auto-submit when time is up
        if (testState.timeRemaining <= 0) {
            clearInterval(testState.timerInterval);
            console.log('Time\'s up! Auto-submitting test...');
            submitTest(true); // true = auto-submitted
        }
    }, 1000);
}

/**
 * Update the timer display with proper formatting and styling
 */
function updateTimerDisplay() {
    const remaining = Number.isFinite(testState.timeRemaining) && testState.timeRemaining >= 0
        ? Math.floor(testState.timeRemaining)
        : 0;
    const formattedTime = formatTime(remaining);
    if (elements.timer) {
        elements.timer.textContent = formattedTime;
        elements.timer.setAttribute('aria-label', `Time Remaining: ${formattedTime}`);

        // Change styling based on time remaining
        elements.timer.classList.remove('warning', 'danger');

        if (remaining <= CONFIG.TIMER_DANGER_THRESHOLD) {
            elements.timer.classList.add('danger');
        } else if (remaining <= CONFIG.TIMER_WARNING_THRESHOLD) {
            elements.timer.classList.add('warning');
        }
    }
}

// ============================================================================
// TEST STATE PERSISTENCE
// 
// Save and restore test state for timer persistence.
// ============================================================================

/**
 * Save current test state to localStorage
 * 
 * Saved to local storage to persist across page refreshes.
 * This allows the timer to continue counting down if user accidentally
 * refreshes or closes and reopens the page.
 */
function saveTestState() {
    const state = {
        subject: testState.subject,
        currentQuestion: testState.currentQuestionIndex,
        currentQuestionIndex: testState.currentQuestionIndex,
        answers: testState.answers,
        flaggedQuestions: testState.flaggedQuestions,
        timeRemaining: testState.timeRemaining,
        questions: testState.questions,
    };

    StorageManager.saveTestState(state);
}

// ============================================================================
// TEST SUBMISSION
// 
// Calculate score and display results.
// ============================================================================

/**
 * Submit the test
 * 
 * Steps:
 * 1. Stop the timer
 * 2. Calculate score
 * 3. Save result to localStorage
 * 4. Display results modal
 * 5. Clear test state
 * 
 * @param {boolean} autoSubmit - True if auto-submitted by timer
 */
// submitTest is defined later (modular).


/**
 * Calculate score based on user answers
 * 
 * @returns {Object} Result object with:
 *   - correct: number of correct answers
 *   - wrong: number of wrong answers
 *   - total: total questions
 *   - percentage: score as percentage
 */
function calculateScore() {
    let correctCount = 0;

    testState.questions.forEach((question, index) => {
        // Get the user's answer for this question
        const userAnswer = testState.answers[index];

        // Get the correct answer
        const correctAnswer = question.correct_option;

        // Compare
        if (userAnswer === correctAnswer) {
            correctCount++;
        }
    });

    const wrongCount = testState.questions.length - correctCount;
    const percentage = calculatePercentage(correctCount, testState.questions.length);

    return {
        correct: correctCount,
        wrong: wrongCount,
        total: testState.questions.length,
        percentage: percentage,
    };
}

/**
 * Build per-topic performance metrics from current test data.
 * Pure function: no side effects, depends only on inputs.
 *
 * @param {Array} questions - Question objects
 * @param {Object} answers - User answers map { index: option }
 * @returns {Array} Topic performance list
 */
function computeTopicBreakdown(questions, answers) {
    const topicMap = {};

    (questions || []).forEach((question, index) => {
        const rawTopic = question?.topic || question?.subtopic || '';
        const topic = String(rawTopic).trim();

        if (!topic) return;

        if (!topicMap[topic]) {
            topicMap[topic] = {
                topic,
                total: 0,
                correct: 0,
                wrong: 0,
                accuracy: 0,
            };
        }

        topicMap[topic].total += 1;
        const userAnswer = answers?.[index];
        if (userAnswer === question?.correct_option) {
            topicMap[topic].correct += 1;
        } else {
            topicMap[topic].wrong += 1;
        }
    });

    return Object.values(topicMap).map((item) => ({
        ...item,
        accuracy: item.total > 0 ? Math.round((item.correct / item.total) * 100) : 0,
    }));
}

/**
 * Generate concise and actionable performance insights.
 * Pure function: transforms metrics into UI-ready copy.
 *
 * @param {Object} input - Performance metrics
 * @returns {{badgeType: string, badgeIcon: string, badgeLabel: string, subjectName: string, summary: string, focusTopics: string[]}}
 */
function generatePerformanceInsights(input) {
    const {
        scorePercentage = 0,
        correctCount = 0,
        wrongCount = 0,
        totalQuestions = 0,
        subject = 'this subject',
        topicBreakdown = [],
    } = input || {};

    const weakestTopics = (topicBreakdown || [])
        .filter((topic) => topic && topic.total > 0 && (topic.accuracy < 80 || topic.wrong > 0))
        .sort((a, b) => (a.accuracy - b.accuracy) || (b.wrong - a.wrong) || (b.total - a.total))
        .slice(0, 3)
        .map((topic) => topic.topic);

    if (scorePercentage >= 80) {
        return {
            badgeType: 'excellent',
            badgeIcon: 'fa-solid fa-trophy',
            badgeLabel: 'Exam Ready',
            subjectName: subject,
            summary: `Outstanding mastery in ${subject}! You answered ${correctCount} of ${totalQuestions} questions correctly (${scorePercentage}%). Maintain this momentum with quick daily timed sets.`,
            focusTopics: weakestTopics,
        };
    }

    if (scorePercentage >= 50) {
        const focusMsg = weakestTopics.length > 0
            ? `Sharpening ${weakestTopics.slice(0, 2).join(' & ')} will quickly boost your score into top rank.`
            : 'Targeting questions you missed will elevate your consistency under timed exam conditions.';

        return {
            badgeType: 'good',
            badgeIcon: 'fa-solid fa-chart-line',
            badgeLabel: 'Good Foundation',
            subjectName: subject,
            summary: `Strong progress in ${subject} (${scorePercentage}%). ${focusMsg}`,
            focusTopics: weakestTopics,
        };
    }

    const basicMsg = weakestTopics.length > 0
        ? `Focus on core fundamentals in ${weakestTopics.slice(0, 2).join(' & ')} before retaking full sets.`
        : 'Review the detailed answer explanations below to turn missed concepts into quick points.';

    return {
        badgeType: 'needs-work',
        badgeIcon: 'fa-solid fa-seedling',
        badgeLabel: 'Building Mastery',
        subjectName: subject,
        summary: `Score: ${scorePercentage}% (${correctCount}/${totalQuestions}). ${basicMsg}`,
        focusTopics: weakestTopics,
    };
}

/**
 * Render insights content in the results modal.
 *
 * @param {{badgeType: string, badgeIcon: string, badgeLabel: string, subjectName: string, summary: string, focusTopics: string[]}} insights
 */
function renderPerformanceInsights(insights) {
    if (!elements.performanceInsights || !insights) return;

    if (elements.insightsBadge) {
        elements.insightsBadge.className = `insights-badge is-${insights.badgeType || 'good'}`;
        elements.insightsBadge.innerHTML = `<i class="${insights.badgeIcon || 'fa-solid fa-bullseye'}"></i> ${insights.badgeLabel || 'Ready'}`;
    }

    if (elements.insightsSubjectTag) {
        elements.insightsSubjectTag.textContent = insights.subjectName || getSubjectDisplayName(testState.subject);
    }

    if (elements.insightsSummary) {
        elements.insightsSummary.textContent = insights.summary || '';
    }

    if (elements.insightsTopicsWrap && elements.insightsTopics) {
        const topics = insights.focusTopics || [];
        if (topics.length > 0) {
            elements.insightsTopicsWrap.style.display = 'flex';
            elements.insightsTopics.innerHTML = '';
            topics.forEach((topic) => {
                const tag = document.createElement('span');
                tag.className = 'insights-topic-chip';
                tag.textContent = topic;
                elements.insightsTopics.appendChild(tag);
            });
        } else {
            elements.insightsTopicsWrap.style.display = 'none';
            elements.insightsTopics.innerHTML = '';
        }
    }
}

/**
 * Display the results modal to the user
 * 
 * @param {Object} result - Result object from calculateScore()
 */
function displayResults(result) {
    // Hide test content
    document.querySelector('.test-content').style.display = 'none';
    if (elements.questionPalette) {
        elements.questionPalette.style.display = 'none';
    }

    // Update result values
    elements.finalScore.textContent = `${result.percentage}%`;
    elements.correctCount.textContent = result.correct;
    elements.wrongCount.textContent = result.wrong;
    const insights = generatePerformanceInsights({
        scorePercentage: result.percentage,
        correctCount: result.correct,
        wrongCount: result.wrong,
        totalQuestions: result.total,
        subject: getSubjectDisplayName(testState.subject),
        topicBreakdown: computeTopicBreakdown(testState.questions, testState.answers),
    });
    renderPerformanceInsights(insights);

    // Show results modal with animation
    elements.resultsModal.style.display = 'flex';

    gsap.fromTo(elements.resultsModal,
        { opacity: 0 },
        { opacity: 1, duration: 0.3, ease: 'power2.out' }
    );

    gsap.fromTo(document.querySelector('.modal-content'),
        { opacity: 0, scale: 0.95 },
        { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out', delay: 0.1 }
    );
}

// ============================================================================
// RESULT ACTION HANDLERS
// 
// Handle user actions after test submission.
// ============================================================================

let currentReviewFilter = 'all';

/**
 * Handle retake test button
 * Seamlessly restarts the test session in-place with a fresh randomized question set for the current subject.
 */
async function handleRetakeTest() {
    // 1. Hide open modals
    if (elements.resultsModal) elements.resultsModal.style.display = 'none';
    if (elements.reviewModal) elements.reviewModal.style.display = 'none';

    // 2. Resolve current subject without clearing it
    const subject = testState.subject || StorageManager.getSelectedSubject();
    if (!subject) {
        console.warn('No subject found for retake, redirecting to home.');
        window.location.href = 'index.html';
        return;
    }

    // 3. Clear previous test attempt from storage
    StorageManager.clearTestState();

    // 4. Reset test state
    testState.isTestSubmitted = false;
    testState.submissionInProgress = false;
    testState.answers = {};
    testState.flaggedQuestions = {};
    testState.currentQuestionIndex = 0;
    testState.timeRemaining = CONFIG.TEST_DURATION_SECONDS;
    testState.isTestStarted = false;
    if (testState.timerInterval) {
        clearInterval(testState.timerInterval);
        testState.timerInterval = null;
    }

    // 5. Restore test content & question palette visibility and reset submit button
    const testContent = document.querySelector('.test-content');
    if (testContent) testContent.style.display = '';
    if (elements.questionPalette) elements.questionPalette.style.display = '';

    if (elements.submitBtn) {
        elements.submitBtn.disabled = false;
        elements.submitBtn.textContent = 'Submit Test';
    }

    // 6. Show loading indicator and load fresh randomized questions
    showLoadingIndicator(true, 15, 'Preparing fresh questions...');

    try {
        const freshQuestions = await getQuestionsForTest(subject, CONFIG.QUESTIONS_PER_TEST);
        if (!Array.isArray(freshQuestions) || freshQuestions.length === 0) {
            throw new Error('No questions returned for retake');
        }

        testState.questions = freshQuestions;
        testState.isTestStarted = true;

        setLoadingProgress(85, 'Rendering test interface...');

        // Update UI
        updateSubjectDisplay();
        renderCurrentQuestion();
        renderQuestionPalette();
        updatePaletteStates();

        // Update Scientific Calculator sync if available
        if (window.ScientificCalculator && typeof window.ScientificCalculator.checkSubject === 'function') {
            window.ScientificCalculator.checkSubject(subject);
        }

        showLoadingIndicator(false);

        // Start timer
        startTimer();

        // Re-arm anti-cheat and examLock
        antiCheat.init();
        examLock.activate();

        console.log(`Test retaken successfully with ${freshQuestions.length} new questions`);
    } catch (err) {
        showLoadingIndicator(false);
        console.error('Error retaking test:', err);
        alert('Could not start new test session. Please try again.');
        if (elements.resultsModal) elements.resultsModal.style.display = 'flex';
    }
}

/**
 * Handle review answers button
 * Shows modern modal with question breakdown and filter options
 */
function handleReviewAnswers() {
    if (!testState.questions || testState.questions.length === 0) {
        alert('No test data available to review.');
        return;
    }

    populateReviewModal('all');

    // Hide results modal so two full-screen modals aren't stacked over each other
    if (elements.resultsModal) {
        elements.resultsModal.style.display = 'none';
    }

    elements.reviewModal.style.display = 'flex';
    gsap.fromTo(elements.reviewModal,
        { opacity: 0 },
        { opacity: 1, duration: 0.3, ease: 'power2.out' }
    );
}

/**
 * Populate the review modal with modern question cards and choice comparisons
 *
 * @param {'all' | 'correct' | 'incorrect'} filter
 */
function populateReviewModal(filter = currentReviewFilter) {
    if (!elements.reviewBody) return;
    currentReviewFilter = filter;
    elements.reviewBody.innerHTML = '';

    const questions = testState.questions || [];
    let correctCount = 0;
    let incorrectCount = 0;

    questions.forEach((q, idx) => {
        const uAns = testState.answers ? testState.answers[idx] : undefined;
        if (uAns && uAns === q.correct_option) {
            correctCount++;
        } else {
            incorrectCount++;
        }
    });

    if (elements.reviewCountAll) elements.reviewCountAll.textContent = String(questions.length);
    if (elements.reviewCountCorrect) elements.reviewCountCorrect.textContent = String(correctCount);
    if (elements.reviewCountIncorrect) elements.reviewCountIncorrect.textContent = String(incorrectCount);

    if (elements.reviewFilterBar) {
        elements.reviewFilterBar.querySelectorAll('.review-filter-btn').forEach(btn => {
            const btnFilter = btn.getAttribute('data-filter');
            const isActive = btnFilter === filter;
            btn.classList.toggle('is-active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
    }

    let renderedCount = 0;

    questions.forEach((question, index) => {
        const userAnswer = testState.answers ? testState.answers[index] : undefined;
        const correctAnswer = question.correct_option;
        const isSkipped = !userAnswer;
        const isCorrect = !isSkipped && (userAnswer === correctAnswer);

        if (filter === 'correct' && !isCorrect) return;
        if (filter === 'incorrect' && isCorrect) return;

        renderedCount++;

        const reviewItem = document.createElement('div');
        reviewItem.className = `review-item ${isCorrect ? 'is-correct' : isSkipped ? 'is-skipped' : 'is-incorrect'}`;

        const headerDiv = document.createElement('div');
        headerDiv.className = 'review-item-header';

        let statusBadgeHtml = '';
        if (isCorrect) {
            statusBadgeHtml = `<span class="review-status-badge correct"><i class="fa-solid fa-circle-check"></i> Correct</span>`;
        } else if (isSkipped) {
            statusBadgeHtml = `<span class="review-status-badge skipped"><i class="fa-solid fa-circle-minus"></i> Skipped</span>`;
        } else {
            statusBadgeHtml = `<span class="review-status-badge incorrect"><i class="fa-solid fa-circle-xmark"></i> Incorrect</span>`;
        }

        headerDiv.innerHTML = `
            <span class="review-q-num">Question ${index + 1} of ${questions.length}</span>
            ${statusBadgeHtml}
        `;

        const questionTextDiv = document.createElement('div');
        questionTextDiv.className = 'review-question-text';
        questionTextDiv.innerHTML = formatMathQuestion(question.question || '');

        const choicesBox = document.createElement('div');
        choicesBox.className = 'review-choices-box';

        const userChoiceRow = document.createElement('div');
        if (isSkipped) {
            userChoiceRow.className = 'review-choice-row user-answer is-skipped';
            userChoiceRow.innerHTML = `
                <span class="choice-letter-badge"><i class="fa-solid fa-minus"></i></span>
                <div class="choice-details">
                    <strong>Your Answer:</strong> Skipped (No option selected)
                </div>
            `;
        } else {
            const userOptionValue = question[`option_${userAnswer}`] || 
                                   (question.options && question.options[userAnswer]) || 
                                   'Option not found';
            userChoiceRow.className = `review-choice-row user-answer ${isCorrect ? 'is-correct' : 'is-incorrect'}`;
            userChoiceRow.innerHTML = `
                <span class="choice-letter-badge">${userAnswer}</span>
                <div class="choice-details">
                    <strong>${isCorrect ? 'Your Answer (Correct)' : 'Your Answer (Incorrect)'}:</strong> ${formatMathQuestion(userOptionValue)}
                </div>
            `;
        }
        choicesBox.appendChild(userChoiceRow);

        if (!isCorrect) {
            const correctOptionValue = question[`option_${correctAnswer}`] || 
                                      (question.options && question.options[correctAnswer]) || 
                                      'Option not found';
            const correctChoiceRow = document.createElement('div');
            correctChoiceRow.className = 'review-choice-row correct-answer';
            correctChoiceRow.innerHTML = `
                <span class="choice-letter-badge">${correctAnswer}</span>
                <div class="choice-details">
                    <strong>Correct Answer:</strong> ${formatMathQuestion(correctOptionValue)}
                </div>
            `;
            choicesBox.appendChild(correctChoiceRow);
        }

        reviewItem.appendChild(headerDiv);
        reviewItem.appendChild(questionTextDiv);
        reviewItem.appendChild(choicesBox);

        if (question.explanation) {
            const explanationBox = document.createElement('div');
            explanationBox.className = 'review-explanation-box';
            explanationBox.innerHTML = `
                <div class="review-explanation-title"><i class="fa-solid fa-lightbulb"></i> Explanation</div>
                <div class="review-explanation-text">${formatMathQuestion(question.explanation).replace(/\n/g, '<br>')}</div>
            `;
            reviewItem.appendChild(explanationBox);
        }

        elements.reviewBody.appendChild(reviewItem);
    });

    if (renderedCount === 0) {
        const emptyNotice = document.createElement('div');
        emptyNotice.style.cssText = 'text-align: center; padding: 40px 20px; color: var(--text-secondary);';
        if (filter === 'incorrect') {
            emptyNotice.innerHTML = `
                <div style="font-size: 2.2rem; color: #16a34a; margin-bottom: 12px;"><i class="fa-solid fa-circle-check"></i></div>
                <h3 style="margin: 0 0 6px; color: var(--text-primary); font-size: 1.1rem;">Perfect Score!</h3>
                <p style="margin: 0; font-size: 0.88rem;">No incorrect questions to review. Outstanding work!</p>
            `;
        } else if (filter === 'correct') {
            emptyNotice.innerHTML = `
                <div style="font-size: 2.2rem; color: #dc2626; margin-bottom: 12px;"><i class="fa-solid fa-circle-xmark"></i></div>
                <h3 style="margin: 0 0 6px; color: var(--text-primary); font-size: 1.1rem;">No Correct Answers</h3>
                <p style="margin: 0; font-size: 0.88rem;">Use the explanations to master the key rules for next time.</p>
            `;
        } else {
            emptyNotice.innerHTML = `<p style="margin: 0;">No questions available.</p>`;
        }
        elements.reviewBody.appendChild(emptyNotice);
    }
}

/**
 * Handle review modal close
 */
function handleCloseReview() {
    if (elements.reviewModal) {
        elements.reviewModal.style.display = 'none';
    }
    // Re-show results modal if the test was submitted
    if (testState.isTestSubmitted && elements.resultsModal) {
        elements.resultsModal.style.display = 'flex';
    }
}

/**
 * Handle return home button
 */
function handleReturnHome() {
    // Clear test data
    StorageManager.clearSelectedSubject();
    StorageManager.clearTestState();

    // Redirect to home
    window.location.href = 'index.html';
}

function openSubmitConfirmation() {
    if (testState.isTestSubmitted || testState.submissionInProgress) return;
    closePalette();
    if (!elements.submitConfirmModal) {
        submitTest(false);
        return;
    }
    elements.submitConfirmModal.style.display = 'flex';
}

function closeSubmitConfirmation() {
    if (!elements.submitConfirmModal) return;
    elements.submitConfirmModal.style.display = 'none';
}

function openExitConfirmation() {
    if (testState.isTestSubmitted) {
        handleReturnHome();
        return;
    }
    closePalette();
    if (!elements.exitConfirmModal) {
        if (window.confirm('Are you sure you want to exit the test? Your answers and progress will not be saved.')) {
            handleExitTest();
        }
        return;
    }
    elements.exitConfirmModal.style.display = 'flex';
}

function closeExitConfirmation() {
    if (!elements.exitConfirmModal) return;
    elements.exitConfirmModal.style.display = 'none';
}

function handleExitTest() {
    closeExitConfirmation();
    if (window.ScientificCalculator && typeof window.ScientificCalculator.close === 'function') {
        window.ScientificCalculator.close();
    }
    if (typeof examLock !== 'undefined' && examLock && examLock.deactivate) {
        try { examLock.deactivate(); } catch (_e) {}
    }
    if (typeof antiCheat !== 'undefined' && antiCheat) {
        antiCheat.isActive = false;
        antiCheat.isSubmitted = true;
    }
    if (testState && testState.timerInterval) {
        clearInterval(testState.timerInterval);
        testState.timerInterval = null;
    }
    StorageManager.clearSelectedSubject();
    StorageManager.clearTestState();

    const targetUrl = document.referrer && document.referrer.includes('practice.html')
        ? 'practice.html'
        : 'index.html';
    window.location.href = targetUrl;
}

// ============================================================================
// EVENT LISTENER SETUP
// 
// Attach event handlers to UI elements.
// ============================================================================

/**
 * Set up all event listeners for the test page
 */
function setupEventListeners() {
    // Navigation buttons
    elements.prevBtn.addEventListener('click', goToPreviousQuestion);
    elements.nextBtn.addEventListener('click', goToNextQuestion);

    // Submit button
    elements.submitBtn.addEventListener('click', openSubmitConfirmation);

    if (elements.markReviewBtn) {
        elements.markReviewBtn.addEventListener('click', toggleCurrentQuestionFlag);
    }

    // Results action buttons
    elements.retakeBtn.addEventListener('click', handleRetakeTest);
    elements.reviewBtn.addEventListener('click', handleReviewAnswers);
    elements.homeBtn.addEventListener('click', handleReturnHome);

    // Review modal buttons
    if (elements.reviewCloseBtn) {
        elements.reviewCloseBtn.addEventListener('click', handleCloseReview);
    }
    if (elements.reviewRetakeBtn) {
        elements.reviewRetakeBtn.addEventListener('click', () => {
            handleCloseReview();
            handleRetakeTest();
        });
    }
    if (elements.reviewReturnBtn) {
        elements.reviewReturnBtn.addEventListener('click', () => {
            handleCloseReview();
            handleReturnHome();
        });
    }
    if (elements.reviewFilterBar) {
        elements.reviewFilterBar.addEventListener('click', (e) => {
            const btn = e.target.closest('.review-filter-btn');
            if (!btn) return;
            const filter = btn.getAttribute('data-filter') || 'all';
            populateReviewModal(filter);
        });
    }
    if (elements.reviewModal) {
        elements.reviewModal.addEventListener('click', (e) => {
            if (e.target === elements.reviewModal) {
                handleCloseReview();
            }
        });
    }

    if (elements.cancelSubmitBtn) {
        elements.cancelSubmitBtn.addEventListener('click', closeSubmitConfirmation);
    }
    if (elements.confirmSubmitBtn) {
        elements.confirmSubmitBtn.addEventListener('click', () => {
            closeSubmitConfirmation();
            submitTest(false);
        });
    }
    if (elements.submitConfirmModal) {
        elements.submitConfirmModal.addEventListener('click', (event) => {
            if (event.target === elements.submitConfirmModal) {
                closeSubmitConfirmation();
            }
        });
    }

    // Exit test listeners
    if (elements.exitTestBtn) {
        elements.exitTestBtn.addEventListener('click', openExitConfirmation);
    }
    if (elements.cancelExitBtn) {
        elements.cancelExitBtn.addEventListener('click', closeExitConfirmation);
    }
    if (elements.confirmExitBtn) {
        elements.confirmExitBtn.addEventListener('click', handleExitTest);
    }
    if (elements.exitConfirmModal) {
        elements.exitConfirmModal.addEventListener('click', (event) => {
            if (event.target === elements.exitConfirmModal) {
                closeExitConfirmation();
            }
        });
    }

    setupPaletteUi();

    // Keyboard navigation (optional enhancement)
    document.addEventListener('keydown', handleKeyboardNavigation);
}

/**
 * Handle keyboard shortcuts for navigation
 * 
 * Optional but improves UX for power users:
 * - Arrow Left: Previous question
 * - Arrow Right: Next question
 * 
 * @param {KeyboardEvent} event - Keyboard event
 */
function handleKeyboardNavigation(event) {
    if (testState.isTestSubmitted) return; // Disable after submission

    // If Scientific Calculator modal is open, let calculator handle keys
    const calcModal = document.getElementById('calcModal');
    if (calcModal && calcModal.classList.contains('is-open')) {
        return;
    }

    if (elements.submitConfirmModal && elements.submitConfirmModal.style.display === 'flex') {
        if (event.key === 'Escape') closeSubmitConfirmation();
        return;
    }
    if (elements.exitConfirmModal && elements.exitConfirmModal.style.display === 'flex') {
        if (event.key === 'Escape') closeExitConfirmation();
        return;
    }

    if (event.key === 'Escape' && isPaletteOpen()) {
        closePalette();
        return;
    }

    if ((event.key === 'f' || event.key === 'F') && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const active = document.activeElement;
        const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
        if (!isTyping) {
            event.preventDefault();
            toggleCurrentQuestionFlag();
            return;
        }
    }

    // Support option keys A, B, C, D (JAMB 8-key standard)
    const keyUpper = (event.key || '').toUpperCase();
    if (['A', 'B', 'C', 'D'].includes(keyUpper) && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const active = document.activeElement;
        const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
        if (!isTyping && elements.optionsContainer) {
            const targetBtn = elements.optionsContainer.querySelector(`.option-button[data-option="${keyUpper}"]`);
            if (targetBtn) {
                event.preventDefault();
                targetBtn.click();
                return;
            }
        }
    }

    if (event.key === 'ArrowLeft' && !elements.prevBtn.disabled) {
        goToPreviousQuestion();
    } else if (event.key === 'ArrowRight' && !elements.nextBtn.disabled) {
        goToNextQuestion();
    }
}

// ============================================================================
// THEME TOGGLE
// ============================================================================

/**
 * Setup theme toggle for test page
 */
function setupThemeToggle() {
    const themeToggleBtn = document.getElementById('themeToggle');
    
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
        console.log('✓ Theme toggle attached');
    }

    const currentTheme = document.documentElement.getAttribute('data-theme') || localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);

    const themeIcons = document.querySelectorAll('.theme-icon');
    themeIcons.forEach(icon => {
        icon.textContent = currentTheme === 'light' ? 'Dark' : 'Light';
    });
}

/**
 * Toggle between light and dark themes
 */
function toggleTheme(e) {
    if (e) e.preventDefault();
    
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    // Update theme attribute
    html.setAttribute('data-theme', newTheme);
    
    // Save to localStorage
    localStorage.setItem('theme', newTheme);
    
    // Update all theme icons
    const themeIcons = document.querySelectorAll('.theme-icon');
    themeIcons.forEach(icon => {
        icon.textContent = newTheme === 'light' ? 'Dark' : 'Light';
    });
    
    console.log(`🎨 Theme switched to: ${newTheme}`);
}

// ============================================================================
// ANTI-CHEAT MODULE
// ============================================================================

const antiCheat = {
    violationCount: 0,
    isActive: false,
    isSubmitted: false,
    hasWarnedUser: false,
    canAutoSubmitOnNextLeave: false,
    lastViolationAt: 0,
    modal: document.getElementById('antiCheatModal'),
    closeBtn: document.getElementById('antiCheatCloseBtn'),
    testContainer: document.querySelector('.test-container'),

    init() {
        this.isActive = true;
        this.isSubmitted = false;
        this.violationCount = 0;
        this.hasWarnedUser = false;
        this.canAutoSubmitOnNextLeave = false;
        this.lastViolationAt = 0;
        this.setupListeners();
        this.disableCheatActions();
    },
    setupListeners() {
        if (this.listenersAttached) return;
        this.listenersAttached = true;
        document.addEventListener('visibilitychange', () => {
            if (!this.isActive || this.isSubmitted) return;
            if (document.visibilityState === 'hidden') {
                this.handleViolation();
            } else if (document.visibilityState === 'visible') {
                this.handleReturnToPage();
            }
        });
        window.addEventListener('blur', () => {
            if (!this.isActive || this.isSubmitted) return;
            this.handleViolation();
        });
        window.addEventListener('focus', () => {
            if (!this.isActive || this.isSubmitted) return;
            this.handleReturnToPage();
        });
        if (this.closeBtn) {
            this.closeBtn.onclick = () => this.hideModal();
        }
    },
    handleViolation() {
        const now = Date.now();
        if (now - this.lastViolationAt < 1200) {
            return;
        }
        this.lastViolationAt = now;
        this.violationCount++;

        if (!this.hasWarnedUser) {
            this.hasWarnedUser = true;
            this.canAutoSubmitOnNextLeave = false;
            this.showModal();
            return;
        }

        if (this.canAutoSubmitOnNextLeave) {
            this.isActive = false;
            submitTest('Anti-cheat: Tab/App switch detected');
        } else {
            // User has not yet returned after first warning.
            this.showModal();
        }
    },
    handleReturnToPage() {
        if (!this.hasWarnedUser || this.isSubmitted) return;
        this.canAutoSubmitOnNextLeave = true;
    },
    showModal() {
        if (this.modal) this.modal.style.display = 'flex';
    },
    hideModal() {
        if (this.modal) this.modal.style.display = 'none';
    },
    disableCheatActions() {
        if (!this.testContainer) return;
        // Disable right-click
        this.testContainer.addEventListener('contextmenu', e => e.preventDefault());
        // Disable text selection
        this.testContainer.style.userSelect = 'none';
        // Disable copy
        this.testContainer.addEventListener('copy', e => e.preventDefault());
    },
    markSubmitted() {
        this.isSubmitted = true;
        this.isActive = false;
    }
};

// ============================================================================
// EXAM LOCK MODE
//
// Prevent accidental navigation away while a test is in progress.
// ============================================================================

const examLock = {
    active: false,
    pendingHref: null,
    modal: null,
    beforeUnloadHandler: null,
    clickCaptureHandler: null,
    popStateHandler: null,

    activate() {
        if (this.active) return;
        this.active = true;
        this.pendingHref = null;
        this.ensureModal();
        this.attach();
    },

    deactivate() {
        if (!this.active) return;
        this.active = false;
        this.pendingHref = null;
        this.detach();
        this.hideModal();
    },

    attach() {
        this.beforeUnloadHandler = (event) => {
            if (!this.active || testState.isTestSubmitted) return;
            event.preventDefault();
            event.returnValue = '';
            return '';
        };
        window.addEventListener('beforeunload', this.beforeUnloadHandler);

        this.clickCaptureHandler = (event) => {
            if (!this.active || testState.isTestSubmitted) return;
            if (this.modal && this.modal.contains(event.target)) return;

            const anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
            if (!anchor) return;
            if (anchor.hasAttribute('data-exam-lock-allow')) return;

            const href = (anchor.getAttribute('href') || '').trim();
            if (!href || href === '#' || href.startsWith('#')) return;
            if (href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

            let url;
            try { url = new URL(href, window.location.href); } catch (e) { return; }

            // Only block internal navigations (same origin).
            if (url.origin !== window.location.origin) return;
            if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;

            event.preventDefault();
            event.stopPropagation();
            this.showConfirm(url.toString());
        };
        document.addEventListener('click', this.clickCaptureHandler, true);

        // Block browser Back navigation while test is active.
        this.popStateHandler = () => {
            if (!this.active || testState.isTestSubmitted) return;
            try { history.pushState({ tr_exam_lock: 1 }, '', window.location.href); } catch (e) { /* ignore */ }
            this.showConfirm(null);
        };
        window.addEventListener('popstate', this.popStateHandler);
        try { history.pushState({ tr_exam_lock: 1 }, '', window.location.href); } catch (e) { /* ignore */ }
    },

    detach() {
        if (this.beforeUnloadHandler) {
            window.removeEventListener('beforeunload', this.beforeUnloadHandler);
            this.beforeUnloadHandler = null;
        }
        if (this.clickCaptureHandler) {
            document.removeEventListener('click', this.clickCaptureHandler, true);
            this.clickCaptureHandler = null;
        }
        if (this.popStateHandler) {
            window.removeEventListener('popstate', this.popStateHandler);
            this.popStateHandler = null;
        }
    },

    ensureModal() {
        if (this.modal) return;

        const modal = document.createElement('div');
        modal.className = 'tr-examlock-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="tr-examlock-dialog">
                <h2 class="tr-examlock-title">Test in progress</h2>
                <p class="tr-examlock-message">Your test is in progress. Submit before leaving.</p>
                <div class="tr-examlock-actions">
                    <button type="button" class="tr-btn tr-btn-secondary" data-examlock-action="stay">Stay</button>
                    <button type="button" class="tr-btn tr-btn-primary" data-examlock-action="submit">Submit test</button>
                </div>
            </div>
        `;

        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.hideModal();
        });

        modal.addEventListener('click', async (e) => {
            const btn = e.target && e.target.closest ? e.target.closest('[data-examlock-action]') : null;
            if (!btn) return;

            e.preventDefault();
            e.stopPropagation();

            const action = btn.getAttribute('data-examlock-action');
            if (action === 'stay') {
                this.hideModal();
                return;
            }

            if (action === 'submit') {
                const href = this.pendingHref;
                this.hideModal();
                await submitTest('Exam lock: user attempted to leave');
                if (href) window.location.href = href;
            }
        });

        document.body.appendChild(modal);
        this.modal = modal;
    },

    showConfirm(hrefOrNull) {
        this.pendingHref = hrefOrNull || null;
        if (!this.modal) this.ensureModal();
        if (this.modal) this.modal.style.display = 'flex';
    },

    hideModal() {
        if (this.modal) this.modal.style.display = 'none';
        this.pendingHref = null;
    }
};

// ===================== SUBMIT TEST (MODULAR) =====================
async function submitTest(arg) {
    if (testState.isTestSubmitted || antiCheat.isSubmitted || testState.submissionInProgress) return;
    closePalette();
    if (window.ScientificCalculator && typeof window.ScientificCalculator.close === 'function') {
        window.ScientificCalculator.close();
    }
    testState.submissionInProgress = true;
    if (elements.submitBtn) {
        elements.submitBtn.disabled = true;
        elements.submitBtn.textContent = 'Submitting...';
    }
    closeSubmitConfirmation();

    // Normalize submit metadata across callers:
    // - submitTest(true) => timer auto-submit
    // - submitTest(false/undefined) => manual submit
    // - submitTest('some reason') => forced submit with reason (e.g., anti-cheat)
    // - submitTest({ autoSubmitted, reason }) => explicit
    let autoSubmitted = false;
    let reason = 'Manual submission';
    if (arg === true) {
        autoSubmitted = true;
        reason = 'Timer expired';
    } else if (typeof arg === 'string' && arg.trim()) {
        reason = arg.trim();
    } else if (arg && typeof arg === 'object') {
        if (typeof arg.autoSubmitted === 'boolean') autoSubmitted = arg.autoSubmitted;
        if (typeof arg.reason === 'string' && arg.reason.trim()) reason = arg.reason.trim();
    }

    testState.isTestSubmitted = true;
    antiCheat.markSubmitted();
    // Remove navigation restrictions immediately once the test is submitted.
    try { examLock.deactivate(); } catch (e) { /* ignore */ }
    try {
        // Stop the timer
        clearInterval(testState.timerInterval);
        // Calculate results
        const result = calculateScore();

        console.log('Test submitted. Results:', result);

    // Save result for future reference
    // Get current user ID for data scoping (fallback to empty string if not available)
        const user = await getCurrentUser().catch(() => null);
        const userId = testState.userId || (user ? user.id : '');
    
        console.log('💾 Saving result with userId:', userId);

        const completedAt = new Date().toISOString();
        const durationTotal = CONFIG.TEST_DURATION_SECONDS || (30 * 60);
        const remaining = Number.isFinite(testState.timeRemaining) ? Math.max(0, testState.timeRemaining) : 0;
        const timeTakenSeconds = Math.max(0, Math.min(durationTotal, durationTotal - remaining));
        const minsSpent = Math.floor(timeTakenSeconds / 60);
        const secsSpent = timeTakenSeconds % 60;
        const timeSpent = minsSpent > 0 
            ? (secsSpent > 0 ? `${minsSpent}m ${secsSpent}s` : `${minsSpent}m`)
            : `${secsSpent}s`;
    
        StorageManager.saveResult({
        clientRef: buildClientResultRef({
            userId: userId,
            subject: testState.subject,
            score: result.percentage,
            correctCount: result.correct,
            wrongCount: result.wrong,
            totalQuestions: result.total,
            timestamp: completedAt,
        }),
        userId: userId,
        subject: testState.subject,
        score: result.percentage,
        correctCount: result.correct,
        wrongCount: result.wrong,
        totalQuestions: result.total,
        timeTakenSeconds: timeTakenSeconds,
        time_taken_seconds: timeTakenSeconds,
        timeSpent: timeSpent,
        timestamp: completedAt,
        answers: testState.answers,
        autoSubmitted: autoSubmitted,
        reason: reason,
    });

    // Best-effort: persist results to Supabase so history follows the user across browsers/devices.
    // Never block the UI if this fails (offline, RLS, table missing, etc.).
        try {
            const lastSaved = StorageManager.getLastResult ? StorageManager.getLastResult() : null;
            const clientRef = lastSaved?.clientRef || buildClientResultRef(lastSaved || {});
            const savedToSupabase = await saveResultToSupabase({
                clientRef,
                userId,
                subject: testState.subject,
                scorePercentage: result.percentage,
                correctCount: result.correct,
                wrongCount: result.wrong,
                totalQuestions: result.total,
                timeTakenSeconds,
                completedAt,
                autoSubmitted,
                reason,
            });
            if (savedToSupabase) {
                await refreshWeeklyLeaderboardForResult({
                    userId,
                    subject: testState.subject,
                    completedAt,
                });
            }
        } catch (e) {
            console.warn('[test] Result Supabase sync skipped/failed:', e);
        }

        // Display results
        displayResults(result);

        // Clear the active test state
        StorageManager.clearTestState();
    } catch (error) {
        console.error('Submit failed:', error);
        testState.isTestSubmitted = false;
        testState.submissionInProgress = false;
        if (elements.submitBtn) {
            elements.submitBtn.disabled = false;
            elements.submitBtn.textContent = 'Submit Test';
        }
        alert('Unable to submit test right now. Please try again.');
    }
}

// ============================================================================
// RESULTS SYNC (Supabase)
// ============================================================================

function buildClientResultRef(result) {
    // Deterministic-ish client ref so retries/backfills don't create duplicates.
    // Avoid crypto dependencies; use FNV-1a 32-bit over a stable string.
    const userId = (result?.userId || '').toString();
    const subject = (result?.subject || '').toString();
    const ts = (result?.timestamp || result?.completedAt || '').toString();
    const score = Number(result?.score ?? result?.scorePercentage ?? '');
    const correct = Number(result?.correctCount ?? '');
    const wrong = Number(result?.wrongCount ?? '');
    const total = Number(result?.totalQuestions ?? '');
    const base = [userId, subject, ts, score, correct, wrong, total].join('|');
    return 'tr_' + fnv1a32Hex(base);
}

function fnv1a32Hex(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        // 32-bit FNV prime: 16777619
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
}

function toLocalDayKey(dateValue) {
    const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if (Number.isNaN(d.getTime())) return null;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function saveResultToSupabase(payload) {
    const {
        clientRef,
        userId,
        subject,
        scorePercentage,
        correctCount,
        wrongCount,
        totalQuestions,
        completedAt,
        autoSubmitted,
        reason,
    } = payload || {};

    if (!userId) return false;
    if (!window.supabase || typeof window.supabase.from !== 'function') return false;

    // Derive time taken if we have remaining time and a configured duration.
    let timeTakenSeconds = null;
    try {
        if (typeof testState?.timeRemaining === 'number' && typeof CONFIG?.TEST_DURATION_MINUTES === 'number') {
            const total = Math.max(0, Math.floor(CONFIG.TEST_DURATION_MINUTES * 60));
            const remaining = Math.max(0, Math.floor(testState.timeRemaining));
            timeTakenSeconds = Math.max(0, total - remaining);
        }
    } catch (e) {
        // ignore
    }

    const row = {
        client_ref: (clientRef || buildClientResultRef({
            userId,
            subject,
            timestamp: completedAt,
            score: scorePercentage,
            correctCount,
            wrongCount,
            totalQuestions,
        })).toString(),
        user_id: userId,
        subject: (subject || '').toString(),
        score_percentage: Number(scorePercentage),
        correct_count: Number(correctCount),
        wrong_count: Number(wrongCount),
        total_questions: Number(totalQuestions),
        time_taken_seconds: timeTakenSeconds,
        auto_submitted: !!autoSubmitted,
        reason: (reason || '').toString(),
        completed_at: completedAt || new Date().toISOString(),
        local_day: toLocalDayKey(completedAt || new Date()),
    };

    // Guard invalid numbers (avoid inserting NaN).
    if (!Number.isFinite(row.score_percentage) || !Number.isFinite(row.correct_count) || !Number.isFinite(row.wrong_count) || !Number.isFinite(row.total_questions)) {
        return false;
    }

    try {
        let { error } = await window.supabase
            .from('test_results')
            .upsert(row, { onConflict: 'client_ref', ignoreDuplicates: true });

        // Backward compatibility for deployments that haven't added test_results.local_day yet.
        if (error && /local_day/i.test(String(error.message || ''))) {
            const fallbackRow = { ...row };
            delete fallbackRow.local_day;
            const retry = await window.supabase
                .from('test_results')
                .upsert(fallbackRow, { onConflict: 'client_ref', ignoreDuplicates: true });
            error = retry.error;
        }

        if (error) {
            console.warn('[test] Supabase test_results upsert error:', error);
            return false;
        }
        return true;
    } catch (e) {
        console.warn('[test] Supabase test_results upsert failed:', e);
        return false;
    }
}

async function refreshWeeklyLeaderboardForResult(payload) {
    const { userId, subject, completedAt } = payload || {};
    if (!userId) return false;
    if (!window.supabase || typeof window.supabase.rpc !== 'function') return false;

    try {
        const { error } = await window.supabase.rpc('tr_refresh_rankings_for_result', {
            p_user_id: userId,
            p_subject: (subject || '').toString(),
            p_completed_at: completedAt || new Date().toISOString(),
        });

        if (error) {
            console.warn('[test] Weekly leaderboard refresh RPC error:', error);
            return false;
        }

        return true;
    } catch (e) {
        console.warn('[test] Weekly leaderboard refresh RPC failed:', e);
        return false;
    }
}

// ============================================================================
// QUESTION PALETTE
// ============================================================================

const PALETTE_DESKTOP_BREAKPOINT = 1024;
const MARK_REVIEW_MOBILE_BREAKPOINT = 768;

function isDesktopPaletteMode() {
    return window.innerWidth >= PALETTE_DESKTOP_BREAKPOINT;
}

function isPaletteOpen() {
    return !!(elements.questionPalette && elements.questionPalette.classList.contains('is-open'));
}

function syncMarkReviewButtonPlacement() {
    // Keep markReviewBtn anchored in the question meta bar across all viewport sizes
    return;
}

function syncPaletteViewportMode() {
    if (!elements.questionPalette || !elements.paletteOverlay || !elements.paletteToggleBtn) return;

    if (isDesktopPaletteMode()) {
        elements.questionPalette.classList.remove('is-open');
        elements.questionPalette.setAttribute('aria-hidden', 'false');
        elements.paletteOverlay.classList.remove('is-open');
        elements.paletteOverlay.hidden = true;
        elements.paletteToggleBtn.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('tr-palette-open');
    } else if (!isPaletteOpen()) {
        elements.questionPalette.setAttribute('aria-hidden', 'true');
        elements.paletteOverlay.classList.remove('is-open');
        elements.paletteOverlay.hidden = true;
        elements.paletteToggleBtn.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('tr-palette-open');
    }
}

function openPalette() {
    if (isDesktopPaletteMode()) return;
    if (!elements.questionPalette || !elements.paletteOverlay || !elements.paletteToggleBtn) return;

    elements.questionPalette.classList.add('is-open');
    elements.questionPalette.setAttribute('aria-hidden', 'false');
    elements.paletteOverlay.hidden = false;
    elements.paletteOverlay.classList.add('is-open');
    elements.paletteToggleBtn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('tr-palette-open');
}

function closePalette() {
    if (isDesktopPaletteMode()) return;
    if (!elements.questionPalette || !elements.paletteOverlay || !elements.paletteToggleBtn) return;

    elements.questionPalette.classList.remove('is-open');
    elements.questionPalette.setAttribute('aria-hidden', 'true');
    elements.paletteOverlay.classList.remove('is-open');
    elements.paletteOverlay.hidden = true;
    elements.paletteToggleBtn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('tr-palette-open');
}

function setupPaletteUi() {
    if (testState.paletteUiReady) return;
    testState.paletteUiReady = true;

    if (elements.paletteToggleBtn) {
        elements.paletteToggleBtn.addEventListener('click', () => {
            if (isPaletteOpen()) closePalette();
            else openPalette();
        });
    }

    if (elements.paletteCloseBtn) {
        elements.paletteCloseBtn.addEventListener('click', closePalette);
    }

    if (elements.paletteOverlay) {
        elements.paletteOverlay.addEventListener('click', closePalette);
    }

    if (elements.paletteGrid) {
        elements.paletteGrid.addEventListener('click', (event) => {
            const item = event.target && event.target.closest ? event.target.closest('.palette-item') : null;
            if (!item) return;
            const index = Number(item.getAttribute('data-question-index'));
            if (Number.isInteger(index)) {
                goToQuestion(index);
            }
        });
    }

    const syncLayout = () => {
        syncPaletteViewportMode();
        syncMarkReviewButtonPlacement();
    };

    window.addEventListener('resize', syncLayout);
    syncLayout();
}

function renderQuestionPalette() {
    if (!elements.paletteGrid) return;

    elements.paletteGrid.innerHTML = '';
    const totalQuestions = testState.questions.length;

    if (elements.paletteTotalCount) {
        elements.paletteTotalCount.textContent = String(totalQuestions);
    }

    for (let index = 0; index < totalQuestions; index++) {
        const paletteItem = document.createElement('button');
        paletteItem.type = 'button';
        paletteItem.className = 'palette-item pending';
        paletteItem.textContent = `${index + 1}`;
        paletteItem.setAttribute('aria-label', `Go to question ${index + 1}`);
        paletteItem.setAttribute('data-question-index', `${index}`);
        elements.paletteGrid.appendChild(paletteItem);
    }
}

function updatePaletteStates() {
    if (!elements.paletteGrid) return;

    // State source mapping:
    // answered -> testState.answers[index] exists
    // current -> testState.currentQuestionIndex === index
    // flagged -> testState.flaggedQuestions[index] === true
    const items = elements.paletteGrid.querySelectorAll('.palette-item');
    let answeredCount = 0;
    let markedCount = 0;
    const total = testState.questions.length;

    items.forEach((item, index) => {
        item.classList.remove('current', 'answered', 'flagged', 'pending');
        item.removeAttribute('aria-current');

        const isAnswered = Object.prototype.hasOwnProperty.call(testState.answers, index);
        const isCurrent = testState.currentQuestionIndex === index;
        const isFlagged = !!testState.flaggedQuestions[index];
        const isPending = !isAnswered;

        if (isAnswered) {
            answeredCount++;
            item.classList.add('answered');
        } else {
            item.classList.add('pending');
        }

        if (isCurrent) {
            item.classList.add('current');
            item.setAttribute('aria-current', 'true');
        }

        if (isFlagged) {
            markedCount++;
            item.classList.add('flagged');
        }

        const statusBits = [];
        statusBits.push(isAnswered ? 'answered' : 'unanswered');
        if (isFlagged) statusBits.push('marked');
        if (isCurrent) statusBits.push('current');
        item.setAttribute('aria-label', `Go to question ${index + 1}, ${statusBits.join(', ')}`);
    });

    const remaining = Math.max(0, total - answeredCount);
    const percent = total > 0 ? Math.round((answeredCount / total) * 100) : 0;

    if (elements.paletteAnsweredCount) elements.paletteAnsweredCount.textContent = String(answeredCount);
    if (elements.paletteRemainingCount) elements.paletteRemainingCount.textContent = String(remaining);
    if (elements.paletteMarkedCount) elements.paletteMarkedCount.textContent = String(markedCount);
    if (elements.paletteTotalCount) elements.paletteTotalCount.textContent = String(total);

    // Update desktop progress bar in question palette
    const pFill = elements.paletteProgressFill || document.getElementById('paletteProgressFill');
    if (pFill) pFill.style.width = `${percent}%`;
    const pPercent = elements.paletteProgressPercent || document.getElementById('paletteProgressPercent');
    if (pPercent) pPercent.textContent = `${percent}%`;
    const pBar = document.getElementById('paletteProgressBar');
    if (pBar) pBar.setAttribute('aria-valuenow', String(percent));

    // Update mobile progress bar beside toggle button
    const mFill = elements.mobileProgressFill || document.getElementById('mobileProgressFill');
    if (mFill) mFill.style.width = `${percent}%`;
    const mCount = elements.mobileProgressCount || document.getElementById('mobileProgressCount');
    if (mCount) mCount.textContent = `${answeredCount}/${total} (${percent}%)`;

    // Ensure mobile toggle button is compact and clean
    if (elements.paletteToggleBtn) {
        elements.paletteToggleBtn.innerHTML = `<i class="fa-solid fa-table-cells" aria-hidden="true"></i> <span>Palette</span>`;
    }
}

function goToQuestion(index) {
    if (index < 0 || index >= testState.questions.length) return;

    testState.currentQuestionIndex = index;
    renderCurrentQuestion();
    updatePaletteStates();
    saveTestState();
    if (!isDesktopPaletteMode()) {
        closePalette();
    }
}

// ============================================================================
// PAGE LOAD INITIALIZATION
// 
// Run when the page is fully loaded.
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
    setupThemeToggle();
    initTest();
});
