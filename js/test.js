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
    TEST_DURATION_SECONDS: 15 * 60, // 15 minutes in seconds
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

    // Navigation
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    navStatus: document.getElementById('navStatus'),

    // Submit
    submitBtn: document.getElementById('submitBtn'),

    // Results modal
    resultsModal: document.getElementById('resultsModal'),
    finalScore: document.getElementById('finalScore'),
    correctCount: document.getElementById('correctCount'),
    wrongCount: document.getElementById('wrongCount'),
    performanceInsights: document.getElementById('performanceInsights'),
    insightsSummary: document.getElementById('insightsSummary'),
    insightsTips: document.getElementById('insightsTips'),
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
    paletteTotalCount: document.getElementById('paletteTotalCount'),

    // Test container
    testContainer: document.querySelector('.test-container'),
};

// ============================================================================
// UTILITY FUNCTIONS - LOADING INDICATOR
// ============================================================================

/**
 * Show/hide loader while questions load
 */
function showLoadingIndicator(show) {
    let indicator = document.getElementById('loadingIndicator');
    
    if (!indicator && show) {
        // Create loading indicator if it doesn't exist
        indicator = document.createElement('div');
        indicator.id = 'loadingIndicator';
        indicator.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 28px;
            border-radius: 14px;
            border: 1px solid rgba(15, 23, 42, 0.10);
            box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.35), 0 18px 60px rgba(0,0,0,0.18);
            z-index: 12000;
            text-align: center;
            font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
            max-width: 360px;
            width: min(360px, 92vw);
        `;
        indicator.innerHTML = `
            <div style="font-size: 3rem; margin-bottom: 20px;">📚</div>
            <div style="font-size: 18px; font-weight: 600; margin-bottom: 10px;">Loading Questions...</div>
            <div style="font-size: 14px; color: #999;">Preparing your test</div>
            <div style="margin-top: 20px;">
                <div style="width: 50px; height: 4px; background: #f0f0f0; border-radius: 2px; margin: 0 auto; overflow: hidden;">
                    <div style="width: 100%; height: 100%; background: linear-gradient(90deg, #667eea, #764ba2); animation: loading 1.5s infinite;"></div>
                </div>
            </div>
            <style>
                @keyframes loading {
                    0% { transform: translateX(-100%); }
                    50% { transform: translateX(0%); }
                    100% { transform: translateX(100%); }
                }
            </style>
        `;
        document.body.appendChild(indicator);
    }
    
    if (indicator) {
        indicator.style.display = show ? 'block' : 'none';
    }

    document.body.classList.toggle('tr-loading', !!show);
}

/**
 * Show a locked UI on the test page when access is denied
 */
function showTestLockedMessage() {
    const pageContent = document.querySelector('.test-container') || document.querySelector('main') || document.body;
    if (!pageContent) return;

    // Clear existing test content and show locked message
    const container = document.querySelector('.test-content') || pageContent;
    if (container) {
        container.innerHTML = `
            <div style="text-align:center; padding: 3rem;">
                <div style="font-size:3rem; margin-bottom:1rem;">🔒</div>
                <h2 style="color:var(--color-accent); margin-bottom:0.5rem;">Tests Locked</h2>
                <p style="color:var(--color-text-secondary); margin-bottom:1.5rem;">You've used up your free tests. Upgrade to Premium to continue taking tests and access analytics.</p>
                <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
                    <button onclick="window.Subscription.showPaywallModal('tests')" style="background:var(--color-accent); color:#fff; padding:10px 18px; border-radius:8px; border:none; font-weight:600;">Upgrade Now</button>
                    <button onclick="window.location.href='index.html'" style="background:transparent; color:var(--color-accent); padding:10px 18px; border-radius:8px; border:2px solid var(--color-accent);">Back to Tests</button>
                </div>
            </div>
        `;
    }
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
        let didShowLoader = false;
        
        // Wait for Supabase to be initialized
        let retries = 0;
        while (!window.authInitialized && retries < 20) {
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }

        if (!window.authInitialized) {
            console.error('❌ Supabase not initialized');
            window.location.href = 'login.html?error=init';
            return;
        }
        
        // Check authentication first
        const user = await getCurrentUser().catch(err => {
            console.error('getCurrentUser error:', err);
            return null;
        });

        if (!user) {
            // Production guard: tests require authentication for correct scoping + freemium logic.
            console.log('User not authenticated, redirecting to login...');
            window.location.href = 'login.html?next=' + encodeURIComponent('test.html');
            return;
        }

        console.log('User authenticated:', user.email);
        testState.userId = user.id;

        // Initialize subscription state (access is enforced only when starting a NEW test).
        try {
            if (window.Subscription && typeof window.Subscription.init === 'function') {
                await window.Subscription.init();
            }
        } catch (err) {
            console.error('Subscription init error:', err);
            // Do not block test loading due to subscription init errors; access enforced below.
        }

        // Get subject from localStorage (set by app.js)
        const storedSubject = StorageManager.getSelectedSubject();
        const subject = typeof normalizeSubject === 'function'
            ? normalizeSubject(storedSubject)
            : storedSubject;
        
        if (!subject) {
            console.error('No subject selected. Redirecting to home...');
            window.location.href = 'index.html';
            return;
        }

        testState.subject = subject;
        StorageManager.setSelectedSubject(subject);

        // Check if user was already taking a test (timer persistence)
        const savedState = StorageManager.getTestState();
        
        if (savedState && savedState.subject === subject) {
            console.log('Resuming previous test...');
            // Resume the test
            testState.questions = savedState.questions;
            testState.currentQuestionIndex = Number.isInteger(savedState.currentQuestionIndex)
                ? savedState.currentQuestionIndex
                : Number.isInteger(savedState.currentQuestion)
                    ? savedState.currentQuestion
                    : 0;
            testState.answers = savedState.answers || {};
            testState.flaggedQuestions = savedState.flaggedQuestions || {};
            testState.timeRemaining = savedState.timeRemaining;
        } else {
            // New test: enforce access + consume free attempt if applicable.
            let startResult = { allowed: true, premium: false };
            try {
                if (window.Subscription && typeof window.Subscription.tryStartTest === 'function') {
                    startResult = await window.Subscription.tryStartTest();
                }
            } catch (err) {
                console.error('Subscription tryStartTest error:', err);
                // Do not block test loading due to subscription check errors
                startResult = { allowed: true, premium: false };
            }

            if (!startResult || !startResult.allowed) {
                console.log('User cannot access test:', (startResult && startResult.reason) ? startResult.reason : 'unknown');
                if (window.Subscription && typeof window.Subscription.showPaywallModal === 'function') {
                    window.Subscription.showPaywallModal('tests');
                }
                return;
            }

            console.log('Test access granted:', { premium: startResult.premium, free_tests_used: startResult.free_tests_used });

            console.log('Starting new test...');
            // Show loading indicator
            showLoadingIndicator(true);
            didShowLoader = true;
            let fetchOk = false;
            try {
                console.log('Fetching questions for subject:', subject);
                testState.questions = await getQuestionsForTest(subject, CONFIG.QUESTIONS_PER_TEST);
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
}

/**
 * Update question counter in header
 */
function updateQuestionCounter() {
    const currentNum = testState.currentQuestionIndex + 1;
    const total = testState.questions.length;
    elements.questionCounter.textContent = `${currentNum} / ${total}`;
    elements.navStatus.textContent = `Question ${currentNum} of ${total}`;
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

    // Clear previous options
    elements.optionsContainer.innerHTML = '';

    // Render all option buttons (A, B, C, D)
    const optionLetters = ['A', 'B', 'C', 'D'];
    optionLetters.forEach(letter => {
        const optionText = question.options[letter];
        const optionBtn = createOptionButton(letter, optionText);
        
        // Check if this option was previously selected
        if (testState.answers[testState.currentQuestionIndex] === letter) {
            optionBtn.classList.add('selected');
        }

        elements.optionsContainer.appendChild(optionBtn);
    });

    // Update navigation state
    updateNavigationState();

    // Hide skip warning when changing questions
    elements.skipWarning.style.display = 'none';

    // Keep palette state in sync while navigating
    updatePaletteStates();

    // Animate question appearance
    gsap.fromTo(elements.questionText,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }
    );
}

/**
 * Create a single option button element
 * 
 * @param {string} letter - Option letter (A, B, C, D)
 * @param {string} text - Option text content
 * @returns {HTMLElement} Option button element
 */
function createOptionButton(letter, text) {
    const button = document.createElement('button');
    button.className = 'option-button';
    button.innerHTML = `
        <span class="option-letter">${letter}.</span>
        <span class="option-text">${formatMathQuestion(text)}</span>
    `;

    // Handle option selection
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
    // Save the answer
    testState.answers[testState.currentQuestionIndex] = letter;

    // Remove 'selected' class from all options
    const allOptions = document.querySelectorAll('.option-button');
    allOptions.forEach(opt => opt.classList.remove('selected'));

    // Add 'selected' class to clicked option
    button.classList.add('selected');

    // Hide skip warning since answer was selected
    elements.skipWarning.style.display = 'none';

    // Auto-save state
    saveTestState();
    updatePaletteStates();

    console.log(`Question ${testState.currentQuestionIndex + 1}: Selected ${letter}`);
}

function updateMarkForReviewButton() {
    if (!elements.markReviewBtn) return;

    const isFlagged = !!testState.flaggedQuestions[testState.currentQuestionIndex];
    elements.markReviewBtn.classList.toggle('is-flagged', isFlagged);
    elements.markReviewBtn.setAttribute('aria-pressed', isFlagged ? 'true' : 'false');
    elements.markReviewBtn.textContent = isFlagged ? 'Marked for review' : 'Mark for review';
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
        elements.skipWarning.style.display = 'block';
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
    const formattedTime = formatTime(testState.timeRemaining);
    elements.timer.textContent = formattedTime;

    // Change styling based on time remaining
    elements.timer.classList.remove('warning', 'danger');

    if (testState.timeRemaining <= CONFIG.TIMER_DANGER_THRESHOLD) {
        elements.timer.classList.add('danger');
    } else if (testState.timeRemaining <= CONFIG.TIMER_WARNING_THRESHOLD) {
        elements.timer.classList.add('warning');
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
 * @returns {{summary: string, tips: string[], focusTopics: string[]}}
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
        .filter((topic) => topic && topic.total > 0)
        .sort((a, b) => (a.accuracy - b.accuracy) || (b.wrong - a.wrong) || (b.total - a.total))
        .slice(0, 3)
        .map((topic) => topic.topic);

    if (scorePercentage >= 80) {
        return {
            summary: `Excellent result in ${subject}: ${scorePercentage}% (${correctCount}/${totalQuestions}) with strong consistency.`,
            tips: [
                'Maintain your current study rhythm with short, consistent daily reviews.',
                'Keep mixed practice sessions (easy + hard) to preserve breadth and accuracy.',
                'Run timed drills 2-3 times weekly to sustain exam-speed decision making.',
            ],
            focusTopics: weakestTopics,
        };
    }

    if (scorePercentage >= 50) {
        const weakTopicLine = weakestTopics.length > 0
            ? `Prioritize ${weakestTopics.slice(0, 2).join(' and ')} in your next revision cycle.`
            : 'Prioritize the question types you missed most in your next revision cycle.';

        return {
            summary: `Solid progress in ${subject}: ${scorePercentage}% (${correctCount}/${totalQuestions}); focused refinement will raise consistency.`,
            tips: [
                weakTopicLine,
                'Use targeted drills of 15-20 questions per weak topic, then review explanations immediately.',
                'After each targeted block, take one timed mixed set to improve transfer under pressure.',
            ],
            focusTopics: weakestTopics,
        };
    }

    const basicsTopicLine = weakestTopics.length > 0
        ? `Start with fundamentals in ${weakestTopics.slice(0, 2).join(' and ')} before full mixed tests.`
        : 'Start with core concepts first before returning to full mixed tests.';

    return {
        summary: `You are building core mastery in ${subject}: ${scorePercentage}% (${correctCount}/${totalQuestions}); steady fundamentals-first practice will lift performance.`,
        tips: [
            basicsTopicLine,
            'Study in small sets of 8-10 questions per weak topic and review each explanation right away.',
            'Retake missed questions after each set to lock method, accuracy, and confidence.',
        ],
        focusTopics: weakestTopics,
    };
}

/**
 * Render insights content in the results modal.
 *
 * @param {{summary: string, tips: string[], focusTopics: string[]}} insights
 */
function renderPerformanceInsights(insights) {
    if (!elements.performanceInsights || !insights) return;

    elements.insightsSummary.textContent = insights.summary || '';

    elements.insightsTips.innerHTML = '';
    (insights.tips || []).slice(0, 4).forEach((tip) => {
        const li = document.createElement('li');
        li.textContent = tip;
        elements.insightsTips.appendChild(li);
    });

    if ((insights.focusTopics || []).length > 0) {
        elements.insightsTopicsWrap.style.display = '';
        elements.insightsTopics.innerHTML = '';
        insights.focusTopics.slice(0, 3).forEach((topic) => {
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

/**
 * Handle retake test button
 */
function handleRetakeTest() {
    // Clear the saved subject and test state
    StorageManager.clearSelectedSubject();
    StorageManager.clearTestState();

    // Redirect to home
    window.location.href = 'index.html';
}

/**
 * Handle review answers button
 * 
 * Shows a modal with all questions, user answers, and correct answers
 */
function handleReviewAnswers() {
    if (!testState.questions || testState.questions.length === 0) {
        alert('No test data available to review.');
        return;
    }

    // Populate review modal
    populateReviewModal();

    // Show review modal
    elements.reviewModal.style.display = 'flex';
    gsap.fromTo(elements.reviewModal,
        { opacity: 0 },
        { opacity: 1, duration: 0.3, ease: 'power2.out' }
    );
}

/**
 * Populate the review modal with all questions and answers
 */
function populateReviewModal() {
    elements.reviewBody.innerHTML = '';

    testState.questions.forEach((question, index) => {
        const userAnswer = testState.answers[index];
        const correctAnswer = question.correct_option;
        const isCorrect = userAnswer === correctAnswer;

        const reviewItem = document.createElement('div');
        reviewItem.className = `review-item ${isCorrect ? 'correct' : 'incorrect'}`;

        // Question text
        const questionDiv = document.createElement('div');
        questionDiv.className = 'review-question';
        questionDiv.innerHTML = `<strong>Q${index + 1}: ${question.question}</strong>`;

        // Options display
        const optionsDiv = document.createElement('div');
        optionsDiv.className = 'review-options';

        // Show user's answer (if exists)
        if (userAnswer) {
            // Handle both formats: option_A style and options.A style
            const userOptionValue = question[`option_${userAnswer}`] || 
                                   (question.options && question.options[userAnswer]) || 
                                   'Not found';
            
            const userOptionDiv = document.createElement('div');
            userOptionDiv.className = isCorrect ? 'review-option correct-answer' : 'review-option user-incorrect';
            userOptionDiv.innerHTML = `
                <div class="option-header">${isCorrect ? '✓ Your Answer (Correct)' : '✗ Your Answer (Incorrect)'}</div>
                <span class="option-label">${userAnswer}:</span> <span class="option-text">${userOptionValue}</span>
            `;
            optionsDiv.appendChild(userOptionDiv);
        } else {
            // User didn't answer this question
            const noAnswerDiv = document.createElement('div');
            noAnswerDiv.className = 'review-option user-incorrect';
            noAnswerDiv.innerHTML = `
                <div class="option-header">✗ Not Answered</div>
                <span class="option-text">You skipped this question</span>
            `;
            optionsDiv.appendChild(noAnswerDiv);
        }

        // Show correct answer (always show, but especially if user was wrong)
        if (!isCorrect) {
            const correctOptionValue = question[`option_${correctAnswer}`] || 
                                      (question.options && question.options[correctAnswer]) || 
                                      'Not found';
            
            const correctOptionDiv = document.createElement('div');
            correctOptionDiv.className = 'review-option correct-answer';
            correctOptionDiv.innerHTML = `
                <div class="option-header">✓ Correct Answer</div>
                <span class="option-label">${correctAnswer}:</span> <span class="option-text">${correctOptionValue}</span>
            `;
            optionsDiv.appendChild(correctOptionDiv);
        }

        // Result message
        const resultDiv = document.createElement('div');
        resultDiv.className = 'review-result';
        resultDiv.innerHTML = isCorrect ? '✓ Correct' : '✗ Incorrect';
        optionsDiv.appendChild(resultDiv);

        // Explanation (show for all questions, whether correct or incorrect)
        if (question.explanation) {
            const explanationDiv = document.createElement('div');
            explanationDiv.className = 'review-explanation';
            explanationDiv.innerHTML = `
                <div class="explanation-header">📚 Explanation</div>
                <div class="explanation-text">${formatMathQuestion(question.explanation).replace(/\n/g, '<br>')}</div>
            `;
            optionsDiv.appendChild(explanationDiv);
        } else {
            console.warn(`Q${index + 1}: No explanation found`);
        }

        reviewItem.appendChild(questionDiv);
        reviewItem.appendChild(optionsDiv);

        elements.reviewBody.appendChild(reviewItem);
    });
}

/**
 * Handle review modal close
 */
function handleCloseReview() {
    if (elements.reviewModal) {
        elements.reviewModal.style.display = 'none';
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
    if (elements.reviewReturnBtn) {
        elements.reviewReturnBtn.addEventListener('click', () => {
            handleCloseReview();
            handleReturnHome();
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
    if (elements.submitConfirmModal && elements.submitConfirmModal.style.display === 'flex') {
        if (event.key === 'Escape') closeSubmitConfirmation();
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
            await saveResultToSupabase({
                clientRef,
                userId,
                subject: testState.subject,
                scorePercentage: result.percentage,
                correctCount: result.correct,
                wrongCount: result.wrong,
                totalQuestions: result.total,
                completedAt,
                autoSubmitted,
                reason,
            });
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
    };

    // Guard invalid numbers (avoid inserting NaN).
    if (!Number.isFinite(row.score_percentage) || !Number.isFinite(row.correct_count) || !Number.isFinite(row.wrong_count) || !Number.isFinite(row.total_questions)) {
        return false;
    }

    try {
        const { error } = await window.supabase
            .from('test_results')
            .upsert(row, { onConflict: 'client_ref', ignoreDuplicates: true });

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

// ============================================================================
// QUESTION PALETTE
// ============================================================================

const PALETTE_DESKTOP_BREAKPOINT = 1024;

function isDesktopPaletteMode() {
    return window.innerWidth >= PALETTE_DESKTOP_BREAKPOINT;
}

function isPaletteOpen() {
    return !!(elements.questionPalette && elements.questionPalette.classList.contains('is-open'));
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

    window.addEventListener('resize', syncPaletteViewportMode);
    syncPaletteViewportMode();
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
        paletteItem.className = 'palette-item';
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
    const total = testState.questions.length;

    items.forEach((item, index) => {
        item.classList.remove('current', 'answered', 'flagged');
        item.removeAttribute('aria-current');

        const isAnswered = Object.prototype.hasOwnProperty.call(testState.answers, index);
        const isCurrent = testState.currentQuestionIndex === index;
        const isFlagged = !!testState.flaggedQuestions[index];

        if (isAnswered) {
            answeredCount++;
            item.classList.add('answered');
        }

        if (isCurrent) {
            item.classList.add('current');
            item.setAttribute('aria-current', 'true');
        }

        if (isFlagged) {
            item.classList.add('flagged');
        }
    });

    const remaining = Math.max(0, total - answeredCount);
    if (elements.paletteAnsweredCount) elements.paletteAnsweredCount.textContent = String(answeredCount);
    if (elements.paletteRemainingCount) elements.paletteRemainingCount.textContent = String(remaining);
    if (elements.paletteTotalCount) elements.paletteTotalCount.textContent = String(total);
    if (elements.paletteToggleBtn) elements.paletteToggleBtn.textContent = `Question Palette (${answeredCount}/${total})`;
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
