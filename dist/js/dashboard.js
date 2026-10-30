/**
 * THINKRIGHT - DASHBOARD PAGE
 * 
 * Displays user-specific performance analytics including:
 * - Overview statistics (total tests, questions, accuracy)
 * - Per-subject performance with progress bars
 * - Complete test history table
 * - Loading and empty states
 * 
 * Authentication: Protected - redirects to login if not authenticated
 * Data Scope: All data filtered by current user ID
 */

// Flag used by a few legacy handlers; do not override browser history APIs.
window.dashboardActive = true;

// Hold preloader until dashboard data & charts are fully rendered
if (window.ThinkRightLoader && typeof window.ThinkRightLoader.hold === 'function') {
    window.ThinkRightLoader.hold('page-controller', 'Preparing your dashboard...');
}

let isDashboardLoaded = false;
let isAuthCheckRunning = false;
const dashboardCharts = {
    scoreTrend: null,
    subjectAverage: null
};

let dashboardLoaderShownAt = 0;
let dashboardLoaderProgressValue = 0;
let dashboardLoaderProgressRaf = null;

function renderDashboardLoaderProgress(value) {
    const percentEl = document.getElementById('dashboardLoadingPercent');
    const barEl = document.getElementById('dashboardLoadingProgressBar');
    const clamped = Math.max(0, Math.min(100, Number(value) || 0));

    dashboardLoaderProgressValue = clamped;
    if (percentEl) percentEl.textContent = String(Math.round(clamped));
    if (barEl) barEl.style.width = `${clamped}%`;
}

function setDashboardLoaderProgress(progress, label) {
    const clamped = Math.max(0, Math.min(100, Number(progress) || 0));
    if (window.ThinkRightLoader && typeof window.ThinkRightLoader.setProgress === 'function') {
        window.ThinkRightLoader.setProgress(clamped, label);
    }
    const labelEl = document.getElementById('dashboardLoadingLabel');
    if (labelEl && label) labelEl.textContent = label;
    renderDashboardLoaderProgress(clamped);
}

function showDashboardLoadingOverlay(show, progress = 0, label = 'Loading your dashboard...') {
    if (window.ThinkRightLoader) {
        if (show) {
            if (typeof window.ThinkRightLoader.hold === 'function') {
                window.ThinkRightLoader.hold('page-controller', label);
            }
            if (typeof window.ThinkRightLoader.setProgress === 'function') {
                window.ThinkRightLoader.setProgress(progress, label);
            }
        } else {
            if (typeof window.ThinkRightLoader.done === 'function') {
                window.ThinkRightLoader.done('Dashboard ready');
            }
        }
    }

    const overlay = document.getElementById('dashboardLoadingOverlay');
    if (overlay) {
        overlay.classList.add('is-hidden');
        overlay.setAttribute('aria-hidden', 'true');
        overlay.setAttribute('aria-busy', 'false');
    }
}

// Preserve existing status calls but map them to overlay loader semantics.
function updatePageStatus(status, color = 'green') {
    const text = (status || '').toLowerCase();
    if (text.includes('initializing')) {
        showDashboardLoadingOverlay(true, 8, status);
        return;
    }
    if (text.includes('refreshing')) {
        showDashboardLoadingOverlay(true, 58, status);
        return;
    }
    if (text.includes('redirecting')) {
        showDashboardLoadingOverlay(true, 92, status);
        return;
    }
    if (text.includes('loaded') || text.includes('active')) {
        showDashboardLoadingOverlay(false);
        return;
    }
    if (text.includes('premium required')) {
        showDashboardLoadingOverlay(false);
        return;
    }
    // Fallback: keep loader visible with generic progress if called mid-flow.
    if (color === 'orange') {
        showDashboardLoadingOverlay(true, 65, status);
    } else if (color === 'blue') {
        showDashboardLoadingOverlay(true, 18, status);
    } else {
        showDashboardLoadingOverlay(true, 45, status);
    }
}

/**
 * Show locked dashboard UI for non-premium users
 */
function showDashboardLockedMessage() {
    clearDashboardLockUI();
}

// Initialize dashboard
async function initDashboard() {
    console.log('🎯 Starting dashboard initialization...');
    if (window.ThinkRightLoader && typeof window.ThinkRightLoader.hold === 'function') {
        window.ThinkRightLoader.hold('page-controller', 'Preparing your dashboard...');
    }
    updatePageStatus('Initializing...', 'blue');
    setDashboardLoaderProgress(15, 'Preparing dashboard modules...');

    try {
        setDashboardLoaderProgress(28, 'Loading dashboard...');
        clearDashboardLockUI();

        // Eagerly trigger Supabase initialization if available
        if (!window.authInitialized && typeof window.initSupabase === 'function') {
            try { window.initSupabase(); } catch (_) {}
        }

        // Wait for Supabase initialization
        let retries = 0;
        while (!window.authInitialized && retries < 25) {
            if (!window.authInitialized && typeof window.initSupabase === 'function') {
                try { window.initSupabase(); } catch (_) {}
            }
            if (window.authInitialized) break;
            await new Promise(resolve => setTimeout(resolve, 80));
            retries++;
        }
        setDashboardLoaderProgress(45, 'Verifying your account...');

        console.log('✅ Supabase initialization complete, window.authInitialized:', window.authInitialized);
        
        // Check if supabase client exists
        if (window.supabase) {
            console.log('✅ window.supabase client is available');
        } else {
            console.warn('⚠️ window.supabase not found, but will try getCurrentUser anyway');
        }

        // Check authentication and load dashboard
        await checkAuthAndLoadDashboard();

    } catch (error) {
        console.error('❌ Dashboard initialization error:', error);
        showDashboardLoadingOverlay(false);
        displayErrorMessage('Failed to initialize dashboard: ' + error.message);
    }
}

// Check auth and load dashboard
async function checkAuthAndLoadDashboard() {
    // Prevent multiple calls
    if (isAuthCheckRunning) {
        console.warn('⚠️ Auth check already running, skipping...');
        return;
    }

    isAuthCheckRunning = true;
    console.log('🔐 Checking authentication...');

    try {
        // Try to get user from Supabase
        let user = await getCurrentUser();
        console.log('📌 getCurrentUser returned:', user);
        
        // If that fails, try to get session directly from Supabase
        if (!user && window.supabase) {
            console.log('⚠️ getCurrentUser returned null, trying getSession from Supabase...');
            try {
                const { data, error } = await window.supabase.auth.getSession();
                console.log('🔍 getSession result:', { data, error });
                
                if (data && data.session && data.session.user) {
                    user = data.session.user;
                    console.log('✅ Found user from Supabase session');
                }
            } catch (sessionError) {
                console.error('❌ Error getting session from Supabase:', sessionError);
            }
        }
        
        if (!user) {
            console.log('❌ No authenticated session found - redirecting to login');
            window.dashboardActive = false;
            setDashboardLoaderProgress(95, 'Redirecting to login...');
            // Keep the preloader visible during navigation so the user doesn't see an empty dashboard shell
            window.location.href = 'login.html';
            return;
        }

        console.log('✓ User ID:', user.id);
        setDashboardLoaderProgress(52, 'Loading your analytics...');
        
        // Access check already done at the top of initDashboard
        console.log('🔍 Dashboard access verified - loading analytics...');
        
        console.log('✅ Dashboard access granted');
        
        // Display user info
        displayUserInfo(user);

        // Load dashboard data
        await loadDashboardData(user.id);

        // Setup event listeners
        setupEventListeners();
        
        console.log('✅ Dashboard initialization complete!');

    } catch (error) {
        console.error('❌ Error in checkAuthAndLoadDashboard:', error);
        console.error('Stack trace:', error.stack);
        showDashboardLoadingOverlay(false);
        displayErrorMessage(`Authentication error: ${error.message}`);
    } finally {
        isAuthCheckRunning = false;
    }
}

// Display user information in dashboard header
function displayUserInfo(user) {
    console.log('👤 Displaying user info. User object:', user);
    const userEmailEl = document.getElementById('userEmail');
    if (userEmailEl) {
        const username = localStorage.getItem('thinkright_username') || user.email;
        userEmailEl.textContent = username;
        console.log('✅ Username set to:', username);
    }
    
    const userInfo = document.getElementById('userInfo');
    if (userInfo) {
        userInfo.style.display = 'block';
    }
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.style.display = 'block';
    }
}

// Handle logout action
async function handleLogout() {
    try {
        console.log('🚪 Logout clicked');
        window.dashboardActive = false;
        const result = await logout();
        if (result.success) {
            console.log('✓ Logged out successfully');
            window.location.href = 'login.html';
        }
    } catch (error) {
        console.error('Error during logout:', error);
    }
}

// Load and display all dashboard data
async function loadDashboardData(userId) {
    try {
        console.log('🔄 Loading dashboard for userId:', userId);
        setDashboardLoaderProgress(64, 'Syncing recent test results...');

        // Cross-browser/device history: best-effort sync between localStorage and Supabase.
        // Keeps existing UI/analytics intact (dashboard continues reading StorageManager.getResults()).
        try {
            await backfillLocalResultsToSupabase(userId);
            await hydrateResultsFromSupabase(userId);
        } catch (e) {
            console.warn('[dashboard] Results sync warning:', e);
        }
        setDashboardLoaderProgress(72, 'Computing dashboard metrics...');
        const allResults = StorageManager.getResults();
        console.log('📦 All stored results:', allResults);
        console.log('📊 Number of results:', allResults.length);
        
        // Log each result's userId for debugging
        allResults.forEach((result, index) => {
            console.log(`  Result ${index}: userId="${result.userId}", subject="${result.subject}", score=${result.score}%`);
        });
        
        // Show loading spinner
        showLoadingState();

        // Calculate all analytics data
        console.log('\n📊 Starting dashboard calculations...\n');
        const overview = calculateOverview(userId);
        console.log('✅ Overview calculated:', overview);
        
        const subjectsStats = getAllSubjectStats(userId);
        console.log('✅ Subject stats calculated:', subjectsStats);
        
        const testHistory = formatTestHistory(userId);
        console.log('✅ Test history calculated:', testHistory);

        await renderDashboardProjection(userId);
        await renderDashboardWeeklyComparison(userId);
        setDashboardLoaderProgress(86, 'Rendering dashboard visuals...');

        console.log('\n🎨 Rendering dashboard sections...\n');
        
        // Render all sections
        await renderDashboardSections(userId, overview, subjectsStats, testHistory);

        // Hide loading spinner
        hideLoadingState();
        
        // Mark dashboard as successfully loaded (prevents redirects)
        isDashboardLoaded = true;
        console.log('🔒 Dashboard loaded flag set to true');
        
        setDashboardLoaderProgress(100, 'Dashboard ready');

        // Allow two animation frames so browser finishes layout and paints all DOM cards & canvas charts
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        updatePageStatus('Dashboard Loaded ✓', 'green');
        
        console.log('\n✨ Dashboard fully loaded!\n');

    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showDashboardLoadingOverlay(false);
        displayErrorMessage('Failed to load dashboard. Please refresh the page.');
    }
}

async function renderDashboardProjection(userId) {
    const lineEl = document.getElementById('dashboardProjectionLine');
    const scoreEl = document.getElementById('dashboardProjectionScore');
    const trendEl = document.getElementById('dashboardProjectionTrend');
    const badgeEl = document.getElementById('dashboardProjectionBadge');
    if (!lineEl || !scoreEl) return;

    const helper =
        window.ThinkRightProjection &&
        typeof window.ThinkRightProjection.computeProjectedJambScore === 'function'
            ? window.ThinkRightProjection
            : null;

    if (!helper) {
        lineEl.hidden = true;
        applyDashboardProjectionTrend(trendEl, null);
        return;
    }

    const scoped = getDashboardResults(userId)
        .map((result) => ({
            score_percentage: getDashboardScore(result),
            completed_at: getDashboardCompletedAt(result),
        }))
        .filter((row) => Number.isFinite(Number(row.score_percentage)) && row.completed_at)
        .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
        .slice(0, 5);

    const projection = helper.computeProjectedJambScore(scoped);
    lineEl.hidden = false;

    if (!projection) {
        scoreEl.textContent = 'Projected JAMB: -- / 400';
        applyDashboardProjectionTrend(trendEl, null);
        if (badgeEl) {
            badgeEl.hidden = true;
            badgeEl.className = 'tr-readiness-badge';
        }
        return;
    }

    scoreEl.textContent = `Projected JAMB: ${projection.projected} / 400`;
    const trend = await fetchDashboardProjectionTrend(userId);
    applyDashboardProjectionTrend(trendEl, trend);
    const readiness =
        typeof helper.getReadinessLevel === 'function'
            ? helper.getReadinessLevel(projection.projected)
            : null;

    if (badgeEl) {
        badgeEl.className = 'tr-readiness-badge';
        if (readiness && readiness.label) {
            badgeEl.hidden = false;
            badgeEl.textContent = readiness.label;
            if (readiness.colorClass) {
                badgeEl.classList.add(readiness.colorClass);
            }
        } else {
            badgeEl.hidden = true;
        }
    }
}

async function fetchDashboardProjectionTrend(userId) {
    const helper = window.ThinkRightProjectionTrend;
    if (!helper || typeof helper.fetchProjectionTrend !== 'function') return null;
    try {
        return await helper.fetchProjectionTrend({ userId });
    } catch (error) {
        console.warn('[dashboard] Projection trend unavailable:', error);
        return null;
    }
}

function applyDashboardProjectionTrend(trendEl, trend) {
    if (!trendEl) return;
    const helper = window.ThinkRightProjectionTrend;
    if (helper && typeof helper.applyTrendChip === 'function') {
        helper.applyTrendChip(trendEl, trend);
        return;
    }
    trendEl.hidden = true;
    trendEl.textContent = '';
    trendEl.className = 'tr-projection-trend';
}

async function renderDashboardWeeklyComparison(userId) {
    const cardEl = document.getElementById('dashboardComparisonCard');
    if (!cardEl) return;

    const messageEl = cardEl.querySelector('[data-tr-comparison-message]');
    cardEl.hidden = false;
    cardEl.dataset.state = 'ready';
    if (messageEl) {
        messageEl.hidden = false;
        messageEl.textContent = 'Loading weekly comparison...';
    }

    const helper = window.ThinkRightWeeklyComparison;
    if (!helper || typeof helper.fetchMyWeeklyComparison !== 'function' || typeof helper.renderComparisonCard !== 'function') {
        if (messageEl) {
            messageEl.textContent = 'Comparison unavailable right now.';
        }
        return;
    }

    try {
        const comparison = await helper.fetchMyWeeklyComparison({ userId });
        helper.renderComparisonCard(cardEl, comparison);
    } catch (error) {
        console.warn('[dashboard] Weekly comparison unavailable:', error);
        helper.renderComparisonCard(cardEl, {
            qualifies: false,
            message: 'Comparison unavailable right now.'
        });
    }
}

// ============================================================================
// RESULTS SYNC (Supabase <-> localStorage)
// ============================================================================

function dashboardFNV1a32Hex(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
}

function buildDashboardClientRef(result) {
    const userId = (result?.userId || '').toString();
    const subject = (result?.subject || '').toString();
    const ts = (result?.timestamp || result?.completedAt || result?.completed_at || '').toString();
    const score = Number(result?.score ?? result?.scorePercentage ?? result?.score_percentage ?? '');
    const correct = Number(result?.correctCount ?? result?.correct_count ?? '');
    const wrong = Number(result?.wrongCount ?? result?.wrong_count ?? '');
    const total = Number(result?.totalQuestions ?? result?.total_questions ?? '');
    const base = [userId, subject, ts, score, correct, wrong, total].join('|');
    return 'tr_' + dashboardFNV1a32Hex(base);
}

async function backfillLocalResultsToSupabase(userId) {
    if (!userId) return 0;
    if (!window.supabase || typeof window.supabase.from !== 'function') return 0;

    const all = StorageManager.getResults();
    if (!Array.isArray(all) || all.length === 0) return 0;

    const mine = all.filter((r) => r && r.userId === userId);
    if (mine.length === 0) return 0;

    // Bounded set to avoid huge payloads.
    const slice = mine.slice(-200);
    const rows = [];

    for (const r of slice) {
        const clientRef = (r.clientRef || r.client_ref || buildDashboardClientRef(r)).toString();
        const scorePct = Number(r.score ?? r.score_percentage);
        const correct = Number(r.correctCount ?? r.correct_count);
        const wrong = Number(r.wrongCount ?? r.wrong_count);
        const total = Number(r.totalQuestions ?? r.total_questions);
        const completedAt = r.timestamp || r.completed_at || r.completedAt || new Date().toISOString();

        if (!Number.isFinite(scorePct) || !Number.isFinite(correct) || !Number.isFinite(wrong) || !Number.isFinite(total)) continue;

        rows.push({
            client_ref: clientRef,
            user_id: userId,
            subject: (r.subject || '').toString(),
            score_percentage: scorePct,
            correct_count: correct,
            wrong_count: wrong,
            total_questions: total,
            auto_submitted: !!r.autoSubmitted,
            reason: (r.reason || '').toString(),
            completed_at: completedAt,
        });
    }

    if (rows.length === 0) return 0;

    try {
        const { error } = await window.supabase
            .from('test_results')
            .upsert(rows, { onConflict: 'client_ref', ignoreDuplicates: true });
        if (error) {
            console.warn('[dashboard] Backfill upsert error:', error);
            return 0;
        }
        return rows.length;
    } catch (e) {
        console.warn('[dashboard] Backfill upsert failed:', e);
        return 0;
    }
}

async function hydrateResultsFromSupabase(userId) {
    if (!userId) return 0;
    if (!window.supabase || typeof window.supabase.from !== 'function') return 0;

    try {
        const { data, error } = await window.supabase
            .from('test_results')
            .select('id,client_ref,subject,score_percentage,correct_count,wrong_count,total_questions,time_taken_seconds,auto_submitted,reason,completed_at,created_at')
            .eq('user_id', userId)
            .order('completed_at', { ascending: true })
            .limit(500);

        if (error) {
            console.warn('[dashboard] Hydrate select error:', error);
            return 0;
        }

        const remote = Array.isArray(data) ? data : [];
        if (remote.length === 0) return 0;

        const local = StorageManager.getResults();
        const safeLocal = Array.isArray(local) ? local : [];
        const seen = new Set();
        for (const r of safeLocal) {
            if (r?.clientRef) seen.add(r.clientRef);
            if (r?.client_ref) seen.add(r.client_ref);
        }

        let added = 0;
        for (const row of remote) {
            const clientRef = (row.client_ref || '').toString();
            if (clientRef && seen.has(clientRef)) continue;

            safeLocal.push({
                remoteId: row.id,
                clientRef: clientRef || undefined,
                userId: userId,
                subject: row.subject,
                score: Number(row.score_percentage),
                correctCount: Number(row.correct_count),
                wrongCount: Number(row.wrong_count),
                totalQuestions: Number(row.total_questions),
                timeTakenSeconds: row.time_taken_seconds != null ? Number(row.time_taken_seconds) : null,
                time_taken_seconds: row.time_taken_seconds != null ? Number(row.time_taken_seconds) : null,
                timestamp: row.completed_at || row.created_at || new Date().toISOString(),
                autoSubmitted: !!row.auto_submitted,
                reason: row.reason || '',
            });
            if (clientRef) seen.add(clientRef);
            added++;
        }

        if (added > 0) {
            localStorage.setItem('test_results', JSON.stringify(safeLocal));
        }

        return added;
    } catch (e) {
        console.warn('[dashboard] Hydrate failed:', e);
        return 0;
    }
}

// Render all dashboard sections
async function renderDashboardSections(userId, overview, subjectsStats, testHistory) {
    // Check if user has any test data
    if (!overview.hasData) {
        console.log('ℹ️ No test data available');
        renderEmptyState();
        return;
    }

    console.log('✅ Data found! Rendering sections...');

    // Render Overview Cards
    const overviewEl = document.getElementById('overviewSection');
    if (overviewEl) {
        overviewEl.innerHTML = renderOverviewCards(overview);
        console.log('📊 Overview section rendered');
    }

    // Render Subject Performance Cards
    const subjectEl = document.getElementById('subjectSection');
    if (subjectEl) {
        subjectEl.innerHTML = renderSubjectCards(subjectsStats);
        console.log('📈 Subject section rendered');
    }

    // Render Test History Table
    const historyEl = document.getElementById('historySection');
    if (historyEl) {
        historyEl.innerHTML = renderTestHistoryTable(testHistory);
        console.log('📋 History section rendered');
    }

    await renderDashboardCharts(userId, subjectsStats);
}

function clearDashboardLockUI() {
    const pageContent = document.getElementById('dashboardContent') || document.querySelector('.dashboard-main') || document.querySelector('main');
    if (pageContent) {
        pageContent.classList.remove('is-locked');
        const overlay = pageContent.querySelector('.dashboard-lock-overlay');
        if (overlay) overlay.remove();
    }
    document.querySelectorAll('.is-locked').forEach(el => el.classList.remove('is-locked'));
    document.querySelectorAll('.dashboard-lock-overlay, .locked-overlay').forEach(el => el.remove());
}

/**
 * Strict premium check for dashboard access based on the subscriptions table.
 * Falls back to Subscription module if the direct DB check can't run.
 *
 * @returns {Promise<boolean>}
 */
async function hasPremiumDashboardAccess() {
    return true;
}

/**
 * Build and render dashboard charts.
 * Uses existing stored test results only (no backend/data contract changes).
 *
 * @param {string} userId
 * @param {Array} subjectsStats
 */
async function renderDashboardCharts(userId, subjectsStats) {
    if (typeof Chart === 'undefined') {
        let retries = 0;
        while (typeof Chart === 'undefined' && retries < 20) {
            await new Promise(resolve => setTimeout(resolve, 50));
            retries++;
        }
    }

    if (typeof Chart === 'undefined') {
        console.warn('Chart.js not available. Skipping chart render.');
        return;
    }

    const trendCanvas = document.getElementById('scoreTrendChart');
    const subjectCanvas = document.getElementById('subjectAverageChart');
    if (!trendCanvas || !subjectCanvas) return;

    const theme = getDashboardChartTheme();
    const results = getDashboardResults(userId);

    // Score trend (ordered by completed_at/timestamp ascending)
    const trendData = results
        .map((result) => ({
            completedAt: getDashboardCompletedAt(result),
            score: getDashboardScore(result)
        }))
        .filter((item) => item.completedAt && !Number.isNaN(item.score))
        .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));

    const trendLabels = trendData.map((item, index) => {
        const date = new Date(item.completedAt);
        const month = date.toLocaleDateString('en-US', { month: 'short' });
        const day = date.getDate();
        return `${month} ${day} • ${index + 1}`;
    });
    const trendScores = trendData.map((item) => item.score);

    toggleChartEmptyState('scoreTrendEmpty', trendScores.length === 0);
    if (dashboardCharts.scoreTrend) {
        dashboardCharts.scoreTrend.destroy();
    }
    dashboardCharts.scoreTrend = new Chart(trendCanvas, {
        type: 'line',
        data: {
            labels: trendLabels,
            datasets: [{
                label: 'Score %',
                data: trendScores,
                borderColor: theme.accentColor,
                backgroundColor: theme.accentFill,
                borderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 4,
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: theme.textMuted,
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 6
                    },
                    grid: {
                        color: theme.gridColor
                    }
                },
                y: {
                    min: 0,
                    max: 100,
                    ticks: {
                        color: theme.textMuted,
                        callback: (value) => `${value}%`
                    },
                    grid: {
                        color: theme.gridColor
                    }
                }
            }
        }
    });

    // Subject average scores
    const subjectData = (subjectsStats || [])
        .filter((subject) => subject.hasData)
        .map((subject) => ({
            label: subject.subject,
            value: subject.accuracy
        }))
        .sort((a, b) => b.value - a.value);

    toggleChartEmptyState('subjectAverageEmpty', subjectData.length === 0);
    if (dashboardCharts.subjectAverage) {
        dashboardCharts.subjectAverage.destroy();
    }
    dashboardCharts.subjectAverage = new Chart(subjectCanvas, {
        type: 'bar',
        data: {
            labels: subjectData.map((item) => item.label),
            datasets: [{
                label: 'Average Score %',
                data: subjectData.map((item) => item.value),
                backgroundColor: theme.barFill,
                borderColor: theme.accentColor,
                borderWidth: 1,
                borderRadius: 6,
                maxBarThickness: 36
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: theme.textMuted
                    },
                    grid: {
                        display: false
                    }
                },
                y: {
                    min: 0,
                    max: 100,
                    ticks: {
                        color: theme.textMuted,
                        callback: (value) => `${value}%`
                    },
                    grid: {
                        color: theme.gridColor
                    }
                }
            }
        }
    });
}

function getDashboardResults(userId) {
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

function getDashboardCompletedAt(result) {
    return result?.completed_at || result?.completedAt || result?.timestamp || null;
}

function getDashboardScore(result) {
    const directScore = Number(result?.score);
    if (Number.isFinite(directScore)) {
        return Math.max(0, Math.min(100, Math.round(directScore)));
    }

    const correct = Number(result?.correctCount) || 0;
    const total = Number(result?.totalQuestions) || 30;
    if (total <= 0) return 0;

    return Math.max(0, Math.min(100, Math.round((correct / total) * 100)));
}

function getDashboardChartTheme() {
    const rootStyle = getComputedStyle(document.documentElement);
    const textPrimary = rootStyle.getPropertyValue('--text-primary').trim() || '#101828';
    const textMuted = rootStyle.getPropertyValue('--text-muted').trim() || '#667085';
    const accent = rootStyle.getPropertyValue('--accent-primary').trim() || '#1d4ed8';
    const grid = rootStyle.getPropertyValue('--line-subtle').trim() || '#d0d5dd';
    return {
        textPrimary,
        textMuted,
        accentColor: accent,
        accentFill: 'rgba(29, 78, 216, 0.12)',
        barFill: 'rgba(16, 24, 40, 0.2)',
        gridColor: grid
    };
}

function toggleChartEmptyState(elementId, isEmpty) {
    const emptyEl = document.getElementById(elementId);
    if (emptyEl) {
        emptyEl.hidden = !isEmpty;
    }
}

function destroyDashboardCharts() {
    if (dashboardCharts.scoreTrend) {
        dashboardCharts.scoreTrend.destroy();
        dashboardCharts.scoreTrend = null;
    }
    if (dashboardCharts.subjectAverage) {
        dashboardCharts.subjectAverage.destroy();
        dashboardCharts.subjectAverage = null;
    }
}

// Render empty state
function renderEmptyState() {
    const overviewEl = document.getElementById('overviewSection');
    const subjectEl = document.getElementById('subjectSection');
    const historyEl = document.getElementById('historySection');

    if (overviewEl) overviewEl.innerHTML = createEmptyState('No test data yet. Take your first test to get started!');
    if (subjectEl) subjectEl.innerHTML = createEmptyState('Complete a test to see your subject performance.');
    if (historyEl) historyEl.innerHTML = createEmptyState('Your test history will appear here after you take a test.');
    destroyDashboardCharts();
    toggleChartEmptyState('scoreTrendEmpty', true);
    toggleChartEmptyState('subjectAverageEmpty', true);

    isDashboardLoaded = true;
    // NOTE: updatePageStatus is handled by the caller (loadDashboardData) once all layout and paint are complete.
}

// Show loading state
function showLoadingState() {
    const content = document.getElementById('dashboardContent');
    if (content) {
        const loading = document.getElementById('loadingState');
        if (loading) loading.style.display = 'flex';
        content.style.opacity = '0.5';
    }
}

// Hide loading state
function hideLoadingState() {
    const loading = document.getElementById('loadingState');
    if (loading) loading.style.display = 'none';
    const content = document.getElementById('dashboardContent');
    if (content) content.style.opacity = '1';
}

// Display error message
function displayErrorMessage(message) {
    console.error('⚠️ Error:', message);
    const errorEl = document.getElementById('errorMessage');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    }
}

// Setup event listeners
function setupEventListeners() {
    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.removeEventListener('click', handleLogout);
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            console.log('🔄 Refresh clicked');
            refreshDashboard();
        });
    }

    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
}



// Refresh dashboard data
async function refreshDashboard() {
    try {
        console.log('🔄 Refreshing dashboard...');
        updatePageStatus('Refreshing...', 'orange');
        
        const user = await getCurrentUser();
        if (user) {
            await loadDashboardData(user.id);
        }
    } catch (error) {
        console.error('Error refreshing dashboard:', error);
        displayErrorMessage('Failed to refresh dashboard.');
    }
}

// Toggle theme
function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    const icon = document.querySelector('.theme-icon');
    if (icon) {
        icon.textContent = isDark ? '🌙' : '☀️';
    }
}

// Start dashboard when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initDashboard();
    });
} else {
    initDashboard();
}


console.log('✅ Dashboard script loaded successfully');

// Expose refresh function globally
window.refreshDashboard = refreshDashboard;
