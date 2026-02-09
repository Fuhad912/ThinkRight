/**
 * THINKRIGHT - DASHBOARD CARDS COMPONENT
 *
 * Reusable components for rendering dashboard cards and statistics.
 *
 * Components:
 * - renderOverviewCards(data) - display overview stats in 4 cards
 * - renderSubjectCards(subjectsData) - display performance per subject
 */

/**
 * Render overview statistics cards
 * Displays: Total Tests, Total Questions, Total Correct, Overall Accuracy
 *
 * @param {Object} data - Overview data from calculateOverview()
 * @returns {string} HTML string for overview cards section
 */
function renderOverviewCards(data) {
    const cards = [
        {
            label: "Total Tests Taken",
            value: data.totalTests,
            helper: "Completed assessments"
        },
        {
            label: "Average Score",
            value: `${data.averageScore}%`,
            helper: "Across all attempts"
        },
        {
            label: "Highest Score",
            value: `${data.highestScore}%`,
            helper: "Best single test result"
        },
        {
            label: "Current Streak",
            value: `${data.currentStreak} day${data.currentStreak === 1 ? "" : "s"}`,
            helper: "Consecutive active days"
        }
    ];

    let html = '<div class="overview-cards overview-cards-modern">';

    cards.forEach((card) => {
        html += `
            <article class="overview-card">
                <div class="card-label">${card.label}</div>
                <div class="card-value">${card.value}</div>
                <p class="card-helper">${card.helper}</p>
            </article>
        `;
    });

    html += "</div>";
    return html;
}

/**
 * Render subject performance cards with progress bars
 * Each card shows: subject, attempts, correct/wrong, accuracy, time
 *
 * @param {Array} subjectsData - Array of subject stats from getAllSubjectStats()
 * @returns {string} HTML string for subject cards section
 */
function renderSubjectCards(subjectsData) {
    let html = '<div class="subject-cards">';

    subjectsData.forEach((subject) => {
        if (subject.hasData) {
            const progressPercentage = subject.accuracy;
            const barClass = `progress-bar ${subject.color}`;

            html += `
                <div class="subject-card">
                    <div class="subject-header">
                        <h3 class="subject-title">${subject.subject}</h3>
                        <span class="subject-attempts">${subject.attempts} attempt${subject.attempts !== 1 ? "s" : ""}</span>
                    </div>

                    <div class="subject-stats">
                        <div class="stat-row">
                            <span class="stat-label">Correct:</span>
                            <span class="stat-value correct">${subject.correctCount}</span>
                        </div>
                        <div class="stat-row">
                            <span class="stat-label">Wrong:</span>
                            <span class="stat-value wrong">${subject.wrongCount}</span>
                        </div>
                    </div>

                    <div class="progress-section">
                        <div class="progress-info">
                            <span class="accuracy-label">Accuracy</span>
                            <span class="accuracy-value ${subject.color}">${subject.accuracy}%</span>
                        </div>
                        <div class="progress-container">
                            <div class="${barClass}" style="width: ${progressPercentage}%"></div>
                        </div>
                    </div>

                    <div class="subject-time">
                        <span class="time-label">Time Spent:</span>
                        <span class="time-value">${subject.timeSpent}</span>
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="subject-card empty">
                    <div class="subject-header">
                        <h3 class="subject-title">${subject.subject}</h3>
                    </div>
                    <div class="empty-message">
                        <p>No tests taken yet</p>
                    </div>
                </div>
            `;
        }
    });

    html += "</div>";
    return html;
}

/**
 * Render test history table
 *
 * @param {Array} historyData - Formatted test history from formatTestHistory()
 * @returns {string} HTML string for history table
 */
function renderTestHistoryTable(historyData) {
    if (historyData.length === 0) {
        return `
            <div class="history-empty">
                <p>No tests completed yet</p>
                <p class="empty-hint">Start your first test to see your performance history here</p>
            </div>
        `;
    }

    let html = `
        <div class="history-table-wrapper">
            <table class="history-table">
                <thead>
                    <tr>
                        <th>Date Taken</th>
                        <th>Subject</th>
                        <th>Score</th>
                        <th>Accuracy</th>
                        <th>Time Spent</th>
                    </tr>
                </thead>
                <tbody>
    `;

    historyData.forEach((test, index) => {
        const rowClass = index % 2 === 0 ? "even" : "odd";
        const accuracyClass = getAccuracyColor(test.rawAccuracy);

        html += `
                    <tr class="history-row ${rowClass}">
                        <td class="date-cell">${test.date}</td>
                        <td class="subject-cell">${test.subject}</td>
                        <td class="score-cell">${test.score}</td>
                        <td class="accuracy-cell ${accuracyClass}">${test.accuracy}</td>
                        <td class="time-cell">${test.timeSpent}</td>
                    </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    return html;
}

/**
 * Create a loading spinner
 *
 * @returns {string} HTML string for spinner
 */
function createLoadingSpinner() {
    return `
        <div class="dashboard-loading">
            <div class="spinner"></div>
            <p>Loading your dashboard...</p>
        </div>
    `;
}

/**
 * Create empty state message
 *
 * @returns {string} HTML string for empty state
 */
function createEmptyState(message = 'You have not taken any tests yet.') {
    return `
        <div class="dashboard-empty">
            <h2>Welcome to Your Dashboard</h2>
            <p>${message}</p>
            <a href="index.html" class="empty-state-link">Start Your First Test</a>
        </div>
    `;
}
