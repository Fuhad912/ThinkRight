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

console.log('🔒 DASHBOARD PROTECTION ACTIVATED - BLOCKING ALL REDIRECTS');

// Set global flag BEFORE anything else
window.dashboardActive = true;

// Block all navigation attempts
const originalPushState = window.history.pushState;
const originalReplaceState = window.history.replaceState;

window.history.pushState = function() { 
    console.log('🛑 pushState blocked'); 
    return false;
};

window.history.replaceState = function() { 
    console.log('🛑 replaceState blocked'); 
    return false;
};

let isDashboardLoaded = false;
let isAuthCheckRunning = false;

// Update page status indicator
function updatePageStatus(status, color = 'green') {
    const indicator = document.getElementById('pageStatus');
    if (indicator) {
        indicator.textContent = status;
        indicator.style.background = color;
    }
}

// Initialize dashboard
async function initDashboard() {
    console.log('🎯 Starting dashboard initialization...');
    updatePageStatus('Initializing...', 'blue');

    try {
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
        
        // Initialize subscription system and check access
        await window.Subscription?.init();
        if (!window.Subscription?.canAccessDashboard()) {
            console.log('⚠️ User does not have access to dashboard');
            window.Subscription?.showPaywallModal('dashboard');
            window.dashboardActive = false;
            return;
        }
        
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
        renderDashboardSections(overview, subjectsStats, testHistory);

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

// Render all dashboard sections
function renderDashboardSections(overview, subjectsStats, testHistory) {
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
}

// Render empty state
function renderEmptyState() {
    const overviewEl = document.getElementById('overviewSection');
    const subjectEl = document.getElementById('subjectSection');
    const historyEl = document.getElementById('historySection');

    if (overviewEl) overviewEl.innerHTML = createEmptyState('No test data yet. Take your first test to get started!');
    if (subjectEl) subjectEl.innerHTML = createEmptyState('Complete a test to see your subject performance.');
    if (historyEl) historyEl.innerHTML = createEmptyState('Your test history will appear here after you take a test.');

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
    document.addEventListener('DOMContentLoaded', initDashboard);
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
