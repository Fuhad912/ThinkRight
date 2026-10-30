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
 * THINKRIGHT - SUBJECT PERFORMANCE CARDS
 */
const TR_SUBJECT_CONFIG = {
    'mathematics': { name: 'Mathematics', icon: 'fa-solid fa-calculator', color: '#2563eb', bg: 'rgba(37, 99, 235, 0.1)' },
    'english': { name: 'Use of English', icon: 'fa-solid fa-book-open', color: '#059669', bg: 'rgba(5, 150, 105, 0.1)' },
    'physics': { name: 'Physics', icon: 'fa-solid fa-atom', color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.1)' },
    'chemistry': { name: 'Chemistry', icon: 'fa-solid fa-flask', color: '#0891b2', bg: 'rgba(8, 145, 178, 0.1)' },
    'biology': { name: 'Biology', icon: 'fa-solid fa-dna', color: '#16a34a', bg: 'rgba(22, 163, 74, 0.1)' },
    'agriculture': { name: 'Agricultural Science', icon: 'fa-solid fa-seedling', color: '#65a30d', bg: 'rgba(101, 163, 13, 0.1)' },
    'computer': { name: 'Computer Studies', icon: 'fa-solid fa-laptop-code', color: '#0284c7', bg: 'rgba(2, 132, 199, 0.1)' },
    'crs': { name: 'Christian Rel. Studies', icon: 'fa-solid fa-cross', color: '#9333ea', bg: 'rgba(147, 51, 234, 0.1)' },
    'irs': { name: 'Islamic Rel. Studies', icon: 'fa-solid fa-moon', color: '#0d9488', bg: 'rgba(13, 148, 136, 0.1)' },
    'commerce': { name: 'Commerce', icon: 'fa-solid fa-scale-balanced', color: '#d97706', bg: 'rgba(217, 119, 6, 0.1)' },
    'economics': { name: 'Economics', icon: 'fa-solid fa-chart-line', color: '#ea580c', bg: 'rgba(234, 88, 12, 0.1)' },
    'government': { name: 'Government', icon: 'fa-solid fa-landmark', color: '#4f46e5', bg: 'rgba(79, 70, 229, 0.1)' },
    'literature': { name: 'Literature in English', icon: 'fa-solid fa-feather-pointed', color: '#db2777', bg: 'rgba(219, 39, 119, 0.1)' },
    'geography': { name: 'Geography', icon: 'fa-solid fa-earth-africa', color: '#0369a1', bg: 'rgba(3, 105, 161, 0.1)' },
    'history': { name: 'History', icon: 'fa-solid fa-landmark-dome', color: '#b45309', bg: 'rgba(180, 83, 9, 0.1)' }
};

window.startSubjectPractice = function (subjectKey) {
    if (!subjectKey) {
        window.location.href = "practice.html";
        return;
    }
    const normalized = typeof normalizeSubject === "function" ? normalizeSubject(subjectKey) : subjectKey;
    if (typeof window.showTestConfirmationModal === "function") {
        window.showTestConfirmationModal(normalized);
        return;
    }
    if (window.StorageManager && typeof window.StorageManager.setSelectedSubject === "function") {
        StorageManager.setSelectedSubject(normalized);
    } else {
        localStorage.setItem("selected_subject", normalized);
    }
    window.location.href = "test.html";
};

window.setSubjectPerfFilter = function (filter) {
    const container = document.getElementById("subjectSection");
    if (!container) return;
    const cards = container.querySelectorAll(".tr-perf-card");
    const tabs = container.querySelectorAll(".tr-perf-tab");

    tabs.forEach((tab) => {
        if (tab.getAttribute("data-filter") === filter) {
            tab.classList.add("is-active");
            tab.setAttribute("aria-selected", "true");
        } else {
            tab.classList.remove("is-active");
            tab.setAttribute("aria-selected", "false");
        }
    });

    cards.forEach((card) => {
        const status = card.getAttribute("data-filter-status");
        if (filter === "all") {
            card.style.display = "";
        } else if (filter === "practiced") {
            card.style.display = (status === "practiced" || status === "needs-work") ? "" : "none";
        } else if (filter === "needs-work") {
            card.style.display = status === "needs-work" ? "" : "none";
        }
    });
};

/**
 * Render subject performance cards with compact layout, performance tiers, and filtering
 *
 * @param {Array} subjectsData - Array of subject stats from getAllSubjectStats()
 * @returns {string} HTML string for subject cards section
 */
function renderSubjectCards(subjectsData) {
    if (!Array.isArray(subjectsData) || subjectsData.length === 0) {
        return `
            <div class="tr-perf-empty">
                <p>No subject performance data available yet.</p>
            </div>
        `;
    }

    const activeSubjects = subjectsData.filter((s) => s.hasData && s.attempts > 0);
    const unpracticedSubjects = subjectsData.filter((s) => !s.hasData || s.attempts === 0);
    const needsWorkSubjects = activeSubjects.filter((s) => s.accuracy < 60);

    // If user has zero test history across all subjects, render clean empty-state + compact selector
    if (activeSubjects.length === 0) {
        let html = `
            <div class="tr-perf-empty">
                <div class="tr-perf-empty__icon"><i class="fa-solid fa-chart-pie"></i></div>
                <div class="tr-perf-empty__body">
                    <h4 class="tr-perf-empty__title">No subject tests completed yet</h4>
                    <p class="tr-perf-empty__text">Select any of your target JAMB subjects below to take a practice test and track your accuracy.</p>
                </div>
            </div>
            <div class="tr-perf-grid">
        `;

        subjectsData.forEach((subject) => {
            const rawKey = subject.key || (typeof normalizeSubjectKey === "function" ? normalizeSubjectKey(subject.subject) : subject.subject.toLowerCase());
            const meta = TR_SUBJECT_CONFIG[rawKey] || { name: subject.subject, icon: "fa-solid fa-book", color: "#2563eb", bg: "rgba(37, 99, 235, 0.1)" };

            html += `
                <div class="tr-perf-card is-unpracticed">
                    <div class="tr-perf-card__top">
                        <div class="tr-perf-card__identity">
                            <span class="tr-perf-card__icon" style="color: ${meta.color}; background: ${meta.bg};">
                                <i class="${meta.icon}"></i>
                            </span>
                            <div>
                                <h3 class="tr-perf-card__name">${subject.subject}</h3>
                                <span class="tr-perf-card__sub text-muted">0 tests taken</span>
                            </div>
                        </div>
                        <button type="button" class="tr-perf-cta-btn-sm" onclick="startSubjectPractice('${rawKey}')" aria-label="Start ${subject.subject}">
                            <i class="fa-solid fa-play"></i> Start
                        </button>
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        return html;
    }

    // Sort active subjects by attempts or accuracy first
    const sortedActive = [...activeSubjects].sort((a, b) => b.attempts - a.attempts || b.accuracy - a.accuracy);
    const sortedAll = [...sortedActive, ...unpracticedSubjects];

    let html = `
        <div class="tr-perf-section-header">
            <div class="tr-perf-tabs" role="tablist" aria-label="Filter subjects">
                <button type="button" class="tr-perf-tab is-active" data-filter="practiced" onclick="setSubjectPerfFilter('practiced')">
                    Practiced <span class="tr-perf-tab-count">${sortedActive.length}</span>
                </button>
                <button type="button" class="tr-perf-tab" data-filter="all" onclick="setSubjectPerfFilter('all')">
                    All Subjects <span class="tr-perf-tab-count">${subjectsData.length}</span>
                </button>
                ${needsWorkSubjects.length > 0 ? `
                <button type="button" class="tr-perf-tab" data-filter="needs-work" onclick="setSubjectPerfFilter('needs-work')">
                    Needs Focus <span class="tr-perf-tab-count">${needsWorkSubjects.length}</span>
                </button>
                ` : ""}
            </div>
            <span class="tr-perf-hint">
                <i class="fa-solid fa-chart-line"></i> ${sortedActive.length} active subject${sortedActive.length !== 1 ? "s" : ""}
            </span>
        </div>
        <div class="tr-perf-grid">
    `;

    sortedAll.forEach((subject) => {
        const rawKey = subject.key || (typeof normalizeSubjectKey === "function" ? normalizeSubjectKey(subject.subject) : subject.subject.toLowerCase());
        const meta = TR_SUBJECT_CONFIG[rawKey] || { name: subject.subject, icon: "fa-solid fa-book", color: "#2563eb", bg: "rgba(37, 99, 235, 0.1)" };
        const isPracticed = subject.hasData && subject.attempts > 0;
        const totalQuestions = (subject.correctCount || 0) + (subject.wrongCount || 0);

        let filterStatus = "unpracticed";
        let badgeText = "Unpracticed";
        let badgeClass = "is-neutral";
        let badgeIcon = "fa-regular fa-clock";

        if (isPracticed) {
            if (subject.accuracy >= 75) {
                badgeText = "Mastered";
                badgeClass = "is-mastered";
                badgeIcon = "fa-solid fa-circle-check";
                filterStatus = "practiced";
            } else if (subject.accuracy >= 50) {
                badgeText = "Progressing";
                badgeClass = "is-progressing";
                badgeIcon = "fa-solid fa-arrow-trend-up";
                filterStatus = "practiced";
            } else {
                badgeText = "Needs Focus";
                badgeClass = "is-weak";
                badgeIcon = "fa-solid fa-triangle-exclamation";
                filterStatus = "needs-work";
            }
        }

        const initialDisplay = isPracticed ? "" : 'style="display: none;"';

        if (isPracticed) {
            html += `
                <div class="tr-perf-card is-active" data-filter-status="${filterStatus}" ${initialDisplay}>
                    <div class="tr-perf-card__top">
                        <div class="tr-perf-card__identity">
                            <span class="tr-perf-card__icon" style="color: ${meta.color}; background: ${meta.bg};">
                                <i class="${meta.icon}"></i>
                            </span>
                            <div>
                                <h3 class="tr-perf-card__name" title="${subject.subject}">${subject.subject}</h3>
                                <span class="tr-perf-card__sub">${subject.attempts} test${subject.attempts !== 1 ? "s" : ""} &bull; ${subject.timeSpent}</span>
                            </div>
                        </div>
                        <span class="tr-perf-badge ${badgeClass}">
                            <i class="${badgeIcon}"></i> ${badgeText}
                        </span>
                    </div>

                    <div class="tr-perf-card__middle">
                        <div class="tr-perf-card__score-box">
                            <span class="tr-perf-card__score ${subject.color}">${subject.accuracy}%</span>
                            <span class="tr-perf-card__score-lbl">Accuracy</span>
                        </div>
                        <div class="tr-perf-card__breakdown">
                            <div class="tr-perf-mini-stat">
                                <span class="tr-perf-mini-stat__num is-correct">${subject.correctCount}</span>
                                <span class="tr-perf-mini-stat__label">Correct</span>
                            </div>
                            <div class="tr-perf-mini-stat">
                                <span class="tr-perf-mini-stat__num is-wrong">${subject.wrongCount}</span>
                                <span class="tr-perf-mini-stat__label">Wrong</span>
                            </div>
                            <div class="tr-perf-mini-stat">
                                <span class="tr-perf-mini-stat__num">${totalQuestions}</span>
                                <span class="tr-perf-mini-stat__label">Total Qs</span>
                            </div>
                        </div>
                    </div>

                    <div class="tr-perf-progress">
                        <div class="tr-perf-progress__bar ${subject.color}" style="width: ${subject.accuracy}%"></div>
                    </div>

                    <div class="tr-perf-card__bottom">
                        <button type="button" class="tr-perf-cta-btn" onclick="startSubjectPractice('${rawKey}')" aria-label="Practice ${subject.subject}">
                            <span>Practice</span> <i class="fa-solid fa-arrow-right"></i>
                        </button>
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="tr-perf-card is-unpracticed" data-filter-status="unpracticed" ${initialDisplay}>
                    <div class="tr-perf-card__top">
                        <div class="tr-perf-card__identity">
                            <span class="tr-perf-card__icon is-muted" style="color: ${meta.color}; background: ${meta.bg};">
                                <i class="${meta.icon}"></i>
                            </span>
                            <div>
                                <h3 class="tr-perf-card__name" title="${subject.subject}">${subject.subject}</h3>
                                <span class="tr-perf-card__sub text-muted">0 tests completed</span>
                            </div>
                        </div>
                        <button type="button" class="tr-perf-cta-btn-sm" onclick="startSubjectPractice('${rawKey}')" aria-label="Start ${subject.subject} practice">
                            <i class="fa-solid fa-play"></i> Start
                        </button>
                    </div>
                </div>
            `;
        }
    });

    html += `</div>`;
    return html;
}

window.expandTestHistory = function (step) {
    const limit = typeof step === "number" ? step : 10;
    const container = document.getElementById("historySection") || document;
    const hiddenRows = container.querySelectorAll(".history-row.is-hidden-history, tr.is-hidden-history");

    let count = 0;
    hiddenRows.forEach((row) => {
        if (count < limit) {
            row.style.setProperty("display", "table-row", "important");
            row.classList.remove("is-hidden-history");
            count++;
        }
    });

    const remainingRows = container.querySelectorAll(".history-row.is-hidden-history, tr.is-hidden-history");
    const actionsWrap = document.getElementById("historyActions");
    const remainingBadge = document.getElementById("historyRemainingCount");

    if (remainingRows.length === 0) {
        if (actionsWrap) {
            actionsWrap.innerHTML = `
                <p class="history-all-loaded"><i class="fa-solid fa-check"></i> Showing all completed tests</p>
            `;
        }
    } else if (remainingBadge) {
        remainingBadge.textContent = `${remainingRows.length} more`;
    }
};

// Global click delegation for show more button
if (!window.__historyShowMoreAttached) {
    window.__historyShowMoreAttached = true;
    document.addEventListener("click", function (e) {
        const btn = e.target && e.target.closest ? e.target.closest("#historyShowMoreBtn, .tr-btn-show-more") : null;
        if (btn) {
            e.preventDefault();
            if (typeof window.expandTestHistory === "function") {
                window.expandTestHistory(10);
            }
        }
    });
}

/**
 * Render test history table
 * Shows latest 5 tests initially, hides the rest with a "Show More" button to expand 10 at a time
 *
 * @param {Array} historyData - Formatted test history from formatTestHistory()
 * @returns {string} HTML string for history table
 */
function renderTestHistoryTable(historyData) {
    if (!Array.isArray(historyData) || historyData.length === 0) {
        return `
            <div class="history-empty">
                <p>No tests completed yet</p>
                <p class="empty-hint">Start your first test to see your performance history here</p>
            </div>
        `;
    }

    const INITIAL_LIMIT = 5;
    const hasMore = historyData.length > INITIAL_LIMIT;

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
        const accuracyClass = typeof getAccuracyColor === "function" ? getAccuracyColor(test.rawAccuracy) : "";
        const isHidden = index >= INITIAL_LIMIT;
        const hiddenClass = isHidden ? " is-hidden-history" : "";
        const hiddenStyle = isHidden ? ' style="display: none;"' : "";

        html += `
                    <tr class="history-row ${rowClass}${hiddenClass}"${hiddenStyle}>
                        <td class="date-cell" data-label="Date Taken">${test.date}</td>
                        <td class="subject-cell" data-label="Subject">${test.subject}</td>
                        <td class="score-cell" data-label="Score">${test.score}</td>
                        <td class="accuracy-cell ${accuracyClass}" data-label="Accuracy">${test.accuracy}</td>
                        <td class="time-cell" data-label="Time Spent">${test.timeSpent}</td>
                    </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    if (hasMore) {
        const remaining = historyData.length - INITIAL_LIMIT;
        html += `
            <div class="history-actions" id="historyActions">
                <button type="button" class="tr-btn-show-more" id="historyShowMoreBtn" onclick="expandTestHistory(10)">
                    <span>Show More</span>
                    <i class="fa-solid fa-chevron-down"></i>
                    <span class="history-remaining-badge" id="historyRemainingCount">${remaining} more</span>
                </button>
            </div>
        `;
    }

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
