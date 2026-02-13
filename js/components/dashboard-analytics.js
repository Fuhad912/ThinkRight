/**
 * THINKRIGHT - DASHBOARD ANALYTICS MODULE
 * 
 * Aggregates and processes test result data for dashboard display.
 * All functions are pure and scoped by userId for data privacy.
 * 
 * Functions:
 * - calculateOverview(userId) - aggregate stats across all tests
 * - calculateSubjectStats(userId, subject) - per-subject performance
 * - formatTestHistory(userId) - prepare test results for table display
 * - getAccuracyColor(percentage) - color coding based on performance
 * - deriveTimeSpent(testCount) - calculate total time from test count
 */

/**
 * Calculate overall performance metrics
 * 
 * @param {string} userId - Current user's ID
 * @returns {Object} Overview data with totals and percentages
 */
function calculateOverview(userId) {
    const results = getScopedResultsForUser(userId);
    
    console.log('📊 Overview - Filtered results:', results);
    
    if (results.length === 0) {
        return {
            totalTests: 0,
            totalQuestions: 0,
            totalCorrect: 0,
            overallAccuracy: 0,
            averageScore: 0,
            highestScore: 0,
            currentStreak: 0,
            hasData: false
        };
    }

    let totalQuestions = 0;
    let totalCorrect = 0;
    const scores = [];

    results.forEach(result => {
        totalQuestions += Number(result.totalQuestions) || 30;
        totalCorrect += Number(result.correctCount) || 0;
        scores.push(getResultScore(result));
    });

    const overallAccuracy = totalQuestions > 0 
        ? Math.round((totalCorrect / totalQuestions) * 100) 
        : 0;
    const averageScore = scores.length
        ? Math.round(scores.reduce((acc, value) => acc + value, 0) / scores.length)
        : 0;
    const highestScore = scores.length ? Math.max(...scores) : 0;
    const currentStreak = calculateCurrentStreak(results);

    return {
        totalTests: results.length,
        totalQuestions: totalQuestions,
        totalCorrect: totalCorrect,
        overallAccuracy: overallAccuracy,
        averageScore: averageScore,
        highestScore: highestScore,
        currentStreak: currentStreak,
        hasData: true
    };
}

/**
 * Calculate performance metrics for a specific subject
 * 
 * @param {string} userId - Current user's ID
 * @param {string} subject - Subject name (e.g. 'mathematics', 'english')
 * @returns {Object} Subject-specific stats
 */
function calculateSubjectStats(userId, subject) {
    const targetSubject = normalizeSubjectKey(subject);
    const results = getScopedResultsForUser(userId)
        .filter((result) => normalizeSubjectKey(result.subject) === targetSubject);
    
    console.log(`📈 Subject Stats (${subject}):`, results);
    
    // Get proper display name for subject
    const displayName = getSubjectDisplayName(subject);
    
    if (results.length === 0) {
        return {
            subject: displayName,
            attempts: 0,
            correctCount: 0,
            wrongCount: 0,
            accuracy: 0,
            timeSpent: '0m',
            color: 'red',
            hasData: false
        };
    }

    let totalCorrect = 0;
    let totalWrong = 0;

    results.forEach(result => {
        totalCorrect += result.correctCount || 0;
        totalWrong += result.wrongCount || 0;
    });

    const totalQuestions = totalCorrect + totalWrong;
    const accuracy = totalQuestions > 0 
        ? Math.round((totalCorrect / totalQuestions) * 100) 
        : 0;

    const timeSpent = deriveTimeSpent(results.length);
    const color = getAccuracyColor(accuracy);

    return {
        subject: displayName,
        attempts: results.length,
        correctCount: totalCorrect,
        wrongCount: totalWrong,
        accuracy: accuracy,
        timeSpent: timeSpent,
        color: color,
        hasData: true
    };
}

/**
 * Format test results for display in history table
 * Sorts by most recent first
 * 
 * @param {string} userId - Current user's ID
 * @returns {Array} Formatted test history
 */
function formatTestHistory(userId) {
    const results = getScopedResultsForUser(userId)
        .sort((a, b) => new Date(getResultCompletedAt(b)) - new Date(getResultCompletedAt(a)));
    
    console.log('📋 Test History:', results);

    return results.map(result => ({
        date: formatDate(getResultCompletedAt(result)),
        subject: capitalizeSubject(result.subject),
        score: `${result.correctCount}/${result.totalQuestions || 30}`,
        accuracy: `${getResultScore(result)}%`,
        timeSpent: '30m', // Fixed 30-minute test duration
        timestamp: getResultCompletedAt(result),
        rawAccuracy: getResultScore(result) // For sorting/color coding
    }));
}

/**
 * Get completion timestamp from result record.
 * Supports legacy and new field names without changing storage schema.
 *
 * @param {Object} result
 * @returns {string}
 */
function getResultCompletedAt(result) {
    return result?.completed_at || result?.completedAt || result?.timestamp || new Date().toISOString();
}

/**
 * Scope results to the current user reliably.
 * Rules:
 * 1) If records with userId exist, use only exact user match.
 * 2) Otherwise, use legacy records with no userId.
 *
 * @param {string} userId
 * @returns {Array}
 */
function getScopedResultsForUser(userId) {
    const allResults = StorageManager.getResults();
    const hasAnyUserId = allResults.some((result) => !!result.userId);

    if (!hasAnyUserId) {
        return allResults;
    }

    const strictUserResults = allResults.filter((result) => result.userId === userId);
    if (strictUserResults.length > 0) {
        return strictUserResults;
    }

    return allResults.filter((result) => !result.userId);
}

function normalizeSubjectKey(subject) {
    return (subject || '').toString().trim().toLowerCase();
}

/**
 * Get score percentage from result record.
 * Falls back to deriving from correct/total fields if score is missing.
 *
 * @param {Object} result
 * @returns {number}
 */
function getResultScore(result) {
    const score = Number(result?.score);
    if (Number.isFinite(score)) {
        return Math.max(0, Math.min(100, Math.round(score)));
    }

    const correct = Number(result?.correctCount) || 0;
    const total = Number(result?.totalQuestions) || 30;
    if (total <= 0) return 0;

    return Math.max(0, Math.min(100, Math.round((correct / total) * 100)));
}

/**
 * Calculate current streak in days based on completion dates.
 * Streak counts from today or yesterday backward in consecutive days.
 *
 * @param {Array} results
 * @returns {number}
 */
function calculateCurrentStreak(results) {
    if (!Array.isArray(results) || results.length === 0) return 0;

    const daySet = new Set(
        results
            .map((result) => {
                const date = new Date(getResultCompletedAt(result));
                if (Number.isNaN(date.getTime())) return null;
                return toLocalDayKey(date);
            })
            .filter(Boolean)
    );

    if (daySet.size === 0) return 0;

    const today = new Date();
    const todayKey = toLocalDayKey(today);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = toLocalDayKey(yesterday);

    let cursor = new Date(today);
    if (!daySet.has(todayKey)) {
        if (!daySet.has(yesterdayKey)) return 0;
        cursor = yesterday;
    }

    let streak = 0;
    while (daySet.has(toLocalDayKey(cursor))) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
}

function toLocalDayKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Determine color coding based on accuracy percentage
 * 
 * Red: < 40%
 * Yellow: 40% - 70%
 * Green: > 70%
 * 
 * @param {number} percentage - Accuracy percentage (0-100)
 * @returns {string} Color class name
 */
function getAccuracyColor(percentage) {
    if (percentage < 40) {
        return 'accuracy-red';
    } else if (percentage < 70) {
        return 'accuracy-yellow';
    } else {
        return 'accuracy-green';
    }
}

/**
 * Calculate total time spent based on test count
 * Each test is 30 minutes
 * 
 * @param {number} testCount - Number of tests completed
 * @returns {string} Formatted time string (e.g. "1h 30m", "45m")
 */
function deriveTimeSpent(testCount) {
    const totalMinutes = testCount * 30;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0) {
        return `${minutes}m`;
    } else if (minutes === 0) {
        return `${hours}h`;
    } else {
        return `${hours}h ${minutes}m`;
    }
}

/**
 * Format ISO timestamp for display
 * Example: "Jan 15, 2025 at 2:30 PM"
 * 
 * @param {string} isoString - ISO timestamp string
 * @returns {string} Formatted date and time
 */
function formatDate(isoString) {
    const date = new Date(isoString);
    
    const options = {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    };

    return date.toLocaleDateString('en-US', options);
}

/**
 * Capitalize subject name for display
 * 
 * @param {string} subject - Subject name
 * @returns {string} Capitalized subject
 */
function capitalizeSubject(subject) {
    return subject.charAt(0).toUpperCase() + subject.slice(1);
}

/**
 * Get display name for subject
 * Maps subject keys to proper display names
 * 
 * @param {string} subject - Subject key (e.g. 'mathematics', 'english')
 * @returns {string} Display name (e.g. 'Mathematics', 'Use of English')
 */
function getSubjectDisplayName(subject) {
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
    return subjectMap[subject] || capitalizeSubject(subject);
}

/**
 * Get array of all subjects with their stats
 * 
 * @param {string} userId - Current user's ID
 * @returns {Array} Array of subject stats objects
 */
function getAllSubjectStats(userId) {
    const subjects = [
        'mathematics',
        'english',
        'physics',
        'chemistry',
        'biology',
        'commerce',
        'economics',
        'government',
        'literature',
        'geography',
        'history'
    ];
    return subjects.map(subject => calculateSubjectStats(userId, subject));
}
