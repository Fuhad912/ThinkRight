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

let isDashboardLoaded = false;
let isAuthCheckRunning = false;
const dashboardCharts = {
    scoreTrend: null,
    subjectAverage: null
};

// Update page status indicator
function updatePageStatus(status, color = 'green') {
    const indicator = document.getElementById('pageStatus');
    if (indicator) {
        indicator.textContent = status;
        indicator.style.background = color;
    }
}

/**
 * Show locked dashboard UI for non-premium users
 */
function showDashboardLockedMessage() {
    const pageContent = document.getElementById('dashboardContent') || document.querySelector('.dashboard-main') || document.querySelector('main');
    if (!pageContent) return;
    
    const existingOverlay = pageContent.querySelector('.dashboard-lock-overlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }

    pageContent.classList.add('is-locked');

    const overlay = document.createElement('div');
    overlay.className = 'dashboard-lock-overlay';
    overlay.innerHTML = `
        <div class="dashboard-lock-dialog" role="dialog" aria-modal="true" aria-labelledby="dashboardLockTitle">
            <div class="dashboard-lock-icon" aria-hidden="true">&#128274;</div>
            <h2 id="dashboardLockTitle">Dashboard is a Premium Feature</h2>
            <p>Upgrade to a premium plan to unlock your full performance dashboard, analytics and history.</p>
            <div class="dashboard-lock-actions">
                <button class="dashboard-lock-upgrade" type="button">Upgrade Now</button>
                <button class="dashboard-lock-back" type="button">Back to Tests</button>
            </div>
        </div>
    `;

    const upgradeBtn = overlay.querySelector('.dashboard-lock-upgrade');
    const backBtn = overlay.querySelector('.dashboard-lock-back');

    if (upgradeBtn) {
        upgradeBtn.addEventListener('click', () => {
            if (window.Subscription && typeof window.Subscription.showPaywallModal === 'function') {
                window.Subscription.showPaywallModal('dashboard');
            }
        });
    }

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }

    pageContent.appendChild(overlay);
    updatePageStatus('Premium Required', 'orange');
    return;

    pageContent.innerHTML = `
        <div class="syllabus-locked" style="margin: 3rem auto; text-align: center;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">🔒</div>
            <h2 style="margin-top: 0; color: var(--color-accent);">Dashboard is a Premium Feature</h2>
            <p style="font-size: 1.1rem; color: var(--color-text-secondary); margin-bottom: 2rem;">
                Upgrade to a premium plan to unlock your full performance dashboard, analytics and history.
            </p>
            <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
                <button onclick="window.Subscription.showPaywallModal('dashboard')" 
                        style="background: var(--color-accent); color: white; border: none; padding: 0.875rem 2rem; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 1rem;">
                    Upgrade Now
                </button>
                <button onclick="window.location.href='index.html'"
                        style="background: transparent; color: var(--color-accent); border: 2px solid var(--color-accent); padding: 0.75rem 2rem; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 1rem;">
                    Back to Tests
                </button>
            </div>
        </div>
    `;

    updatePageStatus('Premium Required', 'orange');
}

// Initialize dashboard
async function initDashboard() {
    console.log('🎯 Starting dashboard initialization...');
    updatePageStatus('Initializing...', 'blue');

    try {
        // Wait for subscription module to be available (loaded via script tag)
        let subRetries = 0;
        while ((!window.Subscription || typeof window.Subscription.init !== 'function') && subRetries < 30) {
            await new Promise(resolve => setTimeout(resolve, 100));
            subRetries++;
        }

        // ===== PREMIUM ACCESS CHECK =====
        // Initialize subscription system
        if (window.Subscription && typeof window.Subscription.init === 'function') {
            const subInitialized = await window.Subscription.init();
            if (!subInitialized) {
                console.warn('⚠️ Subscription system failed to initialize');
            }
        } else {
            console.warn('⚠️ Subscription module unavailable; continuing with guarded access checks');
        }

        // Strict check (DB-backed) to prevent free users bypassing via stale state.
        const strictHasAccess = await hasPremiumDashboardAccess();
        if (!strictHasAccess) {
            console.log('ðŸš« User does not have premium access (strict check) - showing locked page');
            showDashboardLockedMessage();
            return;
        }

        // Check if user has premium access
        try {
            if (window.Subscription && typeof window.Subscription.canAccessDashboard === 'function' && !window.Subscription.canAccessDashboard()) {
                console.log('🚫 User does not have premium access - showing locked page');
                showDashboardLockedMessage();
                return;
            }
            console.log('✅ Premium access verified - loading dashboard');
            clearDashboardLockUI();
        } catch (err) {
            console.error('Error checking subscription access:', err);
            // If subscription check fails, show locked UI as a safe default
            showDashboardLockedMessage();
            return;
        }
        // ===== END PREMIUM CHECK =====
        // Wait for Supabase initialization
        let retries = 0;
        while (!window.authInitialized && retries < 20) {
            console.log(`⏳ Waiting for Supabase init... (retry ${retries}/20)`);
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }

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
        
        // If still no user, check if there's test data - if yes, user must be logged in
        if (!user) {
            console.log('⚠️ No user object found, checking for test data...');
            const allResults = StorageManager.getResults();
            console.log('📊 Test results found:', allResults.length);
            
            if (allResults && allResults.length > 0) {
                console.log('✅ Found test data! User must be logged in. Creating dummy user object...');
                // Create a minimal user object from the test data
                // The userId should be in the first test result
                const firstResult = allResults[0];
                if (firstResult && firstResult.userId) {
                    user = {
                        id: firstResult.userId,
                        email: localStorage.getItem('thinkright_username') || 'User'
                    };
                    console.log('✅ Created user object from test data:', user);
                }
            } else {
                console.log('❌ No test data found, user is not authenticated');
                console.log('ℹ️ Redirecting to login page...');
                updatePageStatus('Redirecting to login...', 'orange');
                setTimeout(() => {
                    window.dashboardActive = false;
                    window.location.href = 'login.html';
                }, 500);
                return;
            }
        }
        
        if (!user) {
            console.log('❌ Still no user found');
            displayErrorMessage('Please log in to view your dashboard');
            return;
        }

        console.log('✓ User ID:', user.id);
        
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

        // Cross-browser/device history: best-effort sync between localStorage and Supabase.
        // Keeps existing UI/analytics intact (dashboard continues reading StorageManager.getResults()).
        try {
            await backfillLocalResultsToSupabase(userId);
            await hydrateResultsFromSupabase(userId);
        } catch (e) {
            console.warn('[dashboard] Results sync warning:', e);
        }
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

        console.log('\n🎨 Rendering dashboard sections...\n');
        
        // Render all sections
        renderDashboardSections(userId, overview, subjectsStats, testHistory);

        // Hide loading spinner
        hideLoadingState();
        
        // Mark dashboard as successfully loaded (prevents redirects)
        isDashboardLoaded = true;
        console.log('🔒 Dashboard loaded flag set to true');
        
        updatePageStatus('Dashboard Loaded ✓', 'green');
        
        console.log('\n✨ Dashboard fully loaded!\n');

    } catch (error) {
        console.error('Error loading dashboard data:', error);
        displayErrorMessage('Failed to load dashboard. Please refresh the page.');
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
function renderDashboardSections(userId, overview, subjectsStats, testHistory) {
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

    renderDashboardCharts(userId, subjectsStats);
}

function clearDashboardLockUI() {
    const pageContent = document.getElementById('dashboardContent') || document.querySelector('.dashboard-main') || document.querySelector('main');
    if (!pageContent) return;
    pageContent.classList.remove('is-locked');
    const overlay = pageContent.querySelector('.dashboard-lock-overlay');
    if (overlay) overlay.remove();
}

/**
 * Strict premium check for dashboard access based on the subscriptions table.
 * Falls back to Subscription module if the direct DB check can't run.
 *
 * @returns {Promise<boolean>}
 */
async function hasPremiumDashboardAccess() {
    const normalizePlan = (plan) => (plan || '').toString().trim().toLowerCase();
    const isPaidPlan = (plan) => {
        const key = normalizePlan(plan);
        return key === 'monthly' || key === 'quarterly' || key === '3-month' || key === 'admin';
    };

    try {
        const user = typeof getCurrentUser === 'function' ? await getCurrentUser() : null;
        const userId = user?.id;
        if (!userId) return false;

        if (window.supabase && typeof window.supabase.from === 'function') {
            const { data, error } = await window.supabase
                .from('subscriptions')
                .select('plan,status,expires_at,updated_at')
                .eq('user_id', userId)
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error && error.code !== 'PGRST116') {
                console.warn('Subscription access check failed:', error);
            } else if (data) {
                const status = (data.status || '').toString().toLowerCase();
                const plan = normalizePlan(data.plan);
                const hasNotExpired = !data.expires_at || new Date(data.expires_at) > new Date();
                return status === 'active' && hasNotExpired && isPaidPlan(plan);
            } else {
                return false;
            }
        }
    } catch (error) {
        console.warn('Strict dashboard access check warning:', error);
    }

    if (window.Subscription && typeof window.Subscription.canAccessDashboard === 'function') {
        try {
            return !!window.Subscription.canAccessDashboard();
        } catch (fallbackError) {
            console.warn('Fallback dashboard access check warning:', fallbackError);
        }
    }

    return false;
}

/**
 * Build and render dashboard charts.
 * Uses existing stored test results only (no backend/data contract changes).
 *
 * @param {string} userId
 * @param {Array} subjectsStats
 */
function renderDashboardCharts(userId, subjectsStats) {
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
    updatePageStatus('Dashboard Loaded ✓', 'green');
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

// Heartbeat to confirm dashboard stays active
setInterval(() => {
    if (isDashboardLoaded) {
        console.log('💚 Dashboard still active and responsive');
        updatePageStatus('Dashboard Active ✓', 'green');
    }
}, 2000);

console.log('✅ Dashboard script loaded successfully');

// Expose refresh function globally
window.refreshDashboard = refreshDashboard;
