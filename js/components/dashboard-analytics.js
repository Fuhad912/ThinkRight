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
    let results = StorageManager.getResults().filter(r => r.userId === userId);
    
    // Fallback: if no results found with userId, use all results (for backward compatibility)
    if (results.length === 0) {
        console.log('⚠️ No results found with userId. Falling back to all results.');
        results = StorageManager.getResults();
    }
    
    console.log('📊 Overview - Filtered results:', results);
    
    if (results.length === 0) {
        return {
            totalTests: 0,
            totalQuestions: 0,
            totalCorrect: 0,
            overallAccuracy: 0,
            hasData: false
        };
    }

    let totalQuestions = 0;
    let totalCorrect = 0;

    results.forEach(result => {
        totalQuestions += result.totalQuestions || 30;
        totalCorrect += result.correctCount || 0;
    });

    const overallAccuracy = totalQuestions > 0 
        ? Math.round((totalCorrect / totalQuestions) * 100) 
        : 0;

    return {
        totalTests: results.length,
        totalQuestions: totalQuestions,
        totalCorrect: totalCorrect,
        overallAccuracy: overallAccuracy,
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
    let results = StorageManager.getResults()
        .filter(r => r.userId === userId && r.subject === subject);
    
    // Fallback: if no results found with userId, use all results
    if (results.length === 0) {
        console.log(`⚠️ No results found for ${subject} with userId. Falling back to all results.`);
        results = StorageManager.getResults()
            .filter(r => r.subject === subject);
    }
    
    console.log(`📈 Subject Stats (${subject}):`, results);
    
    if (results.length === 0) {
        return {
            subject: subject,
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
        subject: subject,
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
    let results = StorageManager.getResults()
        .filter(r => r.userId === userId)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Fallback: if no results found with userId, use all results
    if (results.length === 0) {
        console.log('⚠️ No history found with userId. Falling back to all results.');
        results = StorageManager.getResults()
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }
    
    console.log('📋 Test History:', results);

    return results.map(result => ({
        date: formatDate(result.timestamp),
        subject: capitalizeSubject(result.subject),
        score: `${result.correctCount}/${result.totalQuestions || 30}`,
        accuracy: `${result.score}%`,
        timeSpent: '30m', // Fixed 30-minute test duration
        timestamp: result.timestamp,
        rawAccuracy: result.score // For sorting/color coding
    }));
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
 * Get array of all subjects with their stats
 * 
 * @param {string} userId - Current user's ID
 * @returns {Array} Array of subject stats objects
 */
function getAllSubjectStats(userId) {
    const subjects = ['mathematics', 'english'];
    return subjects.map(subject => calculateSubjectStats(userId, subject));
}
