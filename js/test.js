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
    timerInterval: null,
    timeRemaining: CONFIG.TEST_DURATION_SECONDS,
    isTestStarted: false,
    isTestSubmitted: false,
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
    
    // Results action buttons
    retakeBtn: document.getElementById('retakeBtn'),
    reviewBtn: document.getElementById('reviewBtn'),
    homeBtn: document.getElementById('homeBtn'),
};

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
        const user = await getCurrentUser();
        if (!user) {
            console.log('User not authenticated, redirecting to login...');
            window.location.href = 'login.html?next=' + encodeURIComponent(window.location.pathname);
            return;
        }
        
        console.log('✓ User authenticated:', user.email);
        
        // Get subject from localStorage (set by app.js)
        const subject = StorageManager.getSelectedSubject();
        
        if (!subject) {
            console.error('No subject selected. Redirecting to home...');
            window.location.href = 'index.html';
            return;
        }

        testState.subject = subject;

        // Check if user was already taking a test (timer persistence)
        const savedState = StorageManager.getTestState();
        
        if (savedState && savedState.subject === subject) {
            console.log('Resuming previous test...');
            // Resume the test
            testState.questions = savedState.questions;
            testState.currentQuestionIndex = savedState.currentQuestionIndex;
            testState.answers = savedState.answers;
            testState.timeRemaining = savedState.timeRemaining;
        } else {
            console.log('Starting new test...');
            // Load fresh questions
            testState.questions = await getQuestionsForTest(subject, CONFIG.QUESTIONS_PER_TEST);
        }

        testState.isTestStarted = true;

        // Update UI with subject name
        updateSubjectDisplay();
        
        // Render the first question
        renderCurrentQuestion();
        
        // Set up event listeners
        setupEventListeners();
        
        // Start the timer
        startTimer();

        // Auto-save test state periodically
        setInterval(saveTestState, CONFIG.AUTO_SAVE_INTERVAL);

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
 * Update subject display in header
 */
function updateSubjectDisplay() {
    const subjectDisplay = testState.subject === 'mathematics' ? 'Mathematics' : 'Use of English';
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

    // Update question text
    elements.questionText.textContent = question.question;

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
        <span class="option-text">${text}</span>
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

    console.log(`Question ${testState.currentQuestionIndex + 1}: Selected ${letter}`);
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
        answers: testState.answers,
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
function submitTest(autoSubmit = false) {
    if (testState.isTestSubmitted) return; // Prevent double submission

    // Stop the timer
    clearInterval(testState.timerInterval);
    testState.isTestSubmitted = true;

    // Calculate results
    const result = calculateScore();

    console.log('Test submitted. Results:', result);

    // Save result for future reference
    StorageManager.saveResult({
        subject: testState.subject,
        score: result.percentage,
        correctCount: result.correct,
        wrongCount: result.wrong,
        totalQuestions: result.total,
        timestamp: new Date().toISOString(),
        answers: testState.answers,
        autoSubmitted: autoSubmit,
    });

    // Display results
    displayResults(result);

    // Clear the active test state
    StorageManager.clearTestState();
}

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
 * Display the results modal to the user
 * 
 * @param {Object} result - Result object from calculateScore()
 */
function displayResults(result) {
    // Hide test content
    document.querySelector('.test-content').style.display = 'none';

    // Update result values
    elements.finalScore.textContent = `${result.percentage}%`;
    elements.correctCount.textContent = result.correct;
    elements.wrongCount.textContent = result.wrong;

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
 * NOTE: This feature is a placeholder for Phase 2.
 * In Phase 2, we'll implement a review mode that shows:
 * - All questions with user's answers
 * - Correct answers highlighted
 * - Explanations for each question
 */
function handleReviewAnswers() {
    alert('Review feature coming in Phase 2!\n\nYou can see your results saved in localStorage.');
    console.log('Test results saved:', StorageManager.getLastResult());
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
    elements.submitBtn.addEventListener('click', () => submitTest(false));

    // Results action buttons
    elements.retakeBtn.addEventListener('click', handleRetakeTest);
    elements.reviewBtn.addEventListener('click', handleReviewAnswers);
    elements.homeBtn.addEventListener('click', handleReturnHome);

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

    if (event.key === 'ArrowLeft' && !elements.prevBtn.disabled) {
        goToPreviousQuestion();
    } else if (event.key === 'ArrowRight' && !elements.nextBtn.disabled) {
        goToNextQuestion();
    }
}

// ============================================================================
// PAGE LOAD INITIALIZATION
// 
// Run when the page is fully loaded.
// ============================================================================

document.addEventListener('DOMContentLoaded', initTest);
