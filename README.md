# ThinkRight - CBT Testing Platform

> A production-ready, mobile-responsive CBT (Computer-Based Testing) practice platform for Nigerian students.

---

## 📋 Table of Contents

- [Features](#features)
- [Project Structure](#project-structure)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
- [How to Use](#how-to-use)
- [Architecture & Code Organization](#architecture--code-organization)
- [Configuration](#configuration)
- [Browser Support](#browser-support)
- [Future Enhancements (Phase 2+)](#future-enhancements-phase-2)
- [Contributing Guidelines](#contributing-guidelines)

---

## ✨ Features

### Phase 1 (Current)

- ✅ **User Authentication** - Email/password signup and login via Supabase
- ✅ **Session Management** - Persistent login sessions that survive browser refresh
- ✅ **Protected Pages** - Only authenticated users can access tests and landing page
- ✅ **Subject Selection** - Choose between Mathematics and Use of English
- ✅ **Randomized Questions** - Each test contains 30 randomly shuffled questions
- ✅ **Question Navigation** - Move between questions with Previous/Next buttons
- ✅ **Multiple Choice Interface** - Clean, accessible option selection with visual feedback
- ✅ **Persistent Timer** - 60-minute countdown timer that survives page refresh
- ✅ **Auto-Submit** - Automatically submits test when timer reaches zero
- ✅ **Soft Warnings** - Reminds users to select an answer before proceeding
- ✅ **Score Calculation** - Immediate feedback with detailed results breakdown
- ✅ **Result Tracking** - Saves all test results to browser localStorage
- ✅ **Dark Mode Toggle** - Respects system preference, with localStorage override
- ✅ **Mobile Responsive** - Works perfectly on phones, tablets, and desktops
- ✅ **Smooth Animations** - GSAP-powered transitions and effects
- ✅ **Keyboard Navigation** - Arrow keys to move between questions
- ✅ **Accessibility** - Semantic HTML, ARIA labels, accessible color contrast

---

## 📁 Project Structure

```
ThinkRight/
│
├── index.html          # Landing page (subject selection) - Protected
├── test.html           # Test interface page - Protected
├── login.html          # Login page
├── signup.html         # Sign up page
│
├── css/
│   └── style.css       # Main stylesheet with CSS variables for theming
│
├── js/
│   ├── utils.js        # Utility functions (shared across pages)
│   ├── auth.js         # Supabase authentication module
│   ├── login.js        # Login page logic
│   ├── signup.js       # Signup page logic
│   ├── app.js          # Landing page logic
│   └── test.js         # Test interface & timer logic
│
├── data/
│   ├── english.json    # 30 English language questions
│   └── mathematics.json# 30 Mathematics questions
│
├── assets/             # Folder for future images, icons, etc.
│
└── README.md           # This file
```

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | HTML5 | Semantic markup |
| **Styling** | CSS3 | Responsive design with CSS custom properties |
| **JavaScript** | Vanilla ES6+ | No frameworks - pure JavaScript |
| **Authentication** | Supabase | Email/password auth, session management |
| **Animations** | GSAP 3.12+ | Smooth, performant animations |
| **Storage** | LocalStorage API | Client-side data persistence |
| **Data Format** | JSON | Question storage |

### Why These Choices?

- **No Frameworks**: Simpler deployment, faster load times, easier for junior developers to understand
- **Supabase**: Free tier, easy setup, built for frontend, perfect for Phase 1
- **CSS Variables**: Easy theme switching without rewriting CSS
- **GSAP**: Lightweight, battle-tested animation library
- **LocalStorage**: No backend required for test results (Phase 2 will add database sync)
- **Vanilla JS**: Better performance, no dependencies to manage

---

## 🚀 Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Safari, Edge)
- A local web server (Live Server, Python HTTP server, or similar)
- **Important**: Do NOT open HTML files directly with `file://` protocol due to CORS restrictions with JSON loading
- A free Supabase account (for authentication)

### Step 1: Set Up Supabase (Required for Authentication)

Supabase is used ONLY for user authentication (email/password login/signup). All questions, timers, and testing logic use local JSON files and localStorage.

**1. Create a Supabase Account**
   - Go to https://supabase.com
   - Sign up with your email
   - Create a new project (choose any region)

**2. Enable Email/Password Authentication**
   - In your Supabase project, go to **Authentication** → **Providers**
   - Enable **Email** provider
   - Confirm settings allow email/password auth

**3. Get Your API Keys**
   - Go to **Project Settings** → **API**
   - Copy your:
     - **Project URL** (looks like `https://xxxxx.supabase.co`)
     - **Anon Public Key** (under "anon" or "public")

**4. Add Credentials to ThinkRight**
   - Open `js/auth.js` in your editor
   - Find the `SUPABASE_CONFIG` object at the top
   - Replace `YOUR_SUPABASE_URL` and `YOUR_SUPABASE_ANON_KEY` with your actual values:
   
   ```javascript
   const SUPABASE_CONFIG = {
       URL: 'https://yourproject.supabase.co',
       ANON_KEY: 'your-anon-key-here',
   };
   ```

   ⚠️ **Important**: The ANON_KEY is public. This is fine—Supabase is designed for this. Never expose your ADMIN KEY.

**5. (Optional) Verify Configuration**
   - Open your browser's Developer Console (F12)
   - Look for messages like: `✓ Supabase initialized successfully`
   - If you see warnings, check your credentials

### Step 2: Run the Application

**Option 1: Using VS Code Live Server** (Recommended)

1. Install the "Live Server" extension in VS Code
2. Right-click on `login.html` → "Open with Live Server"
3. Browser opens automatically at `http://localhost:5500/login.html`
4. You'll see the login page—this is where you start!

**Option 2: Using Python (3.x)**

```bash
# Navigate to ThinkRight folder
cd C:\Users\basir\OneDrive\Desktop\ThinkRight

# Start server (Python 3)
python -m http.server 8000

# Open browser to http://localhost:8000/login.html
```

**Option 3: Using Node.js (http-server)**

```bash
# Install http-server globally (one time)
npm install -g http-server

# Navigate to ThinkRight folder and run
http-server

# Opens at http://localhost:8080/login.html
```

---

## 📖 How to Use

### For Users

**User Journey:**

1. **Sign Up** → Go to `signup.html`, create account with email and password
2. **Login** → Go to `login.html`, login with your credentials
3. **Select Subject** → See Mathematics and Use of English options on landing page
4. **Start Test** → Click a subject to begin test with 30 questions and 60-minute timer
5. **Answer Questions** → Read question, select one of four options (A, B, C, D)
6. **Navigate** → Use Previous/Next buttons or arrow keys to move between questions
7. **Submit** → Click "Submit Test" when ready (auto-submits when timer reaches zero)
8. **View Results** → See your score, correct/wrong counts, and options to retake or return home
9. **Logout** → Click "Logout" button in header to sign out

**Important Notes:**
- You must create an account and log in to access tests
- Sessions persist—you'll stay logged in even after closing the browser
- Test timer survives page refresh—you can safely refresh without losing progress
- All results are saved locally (no need for backend yet)

### For Developers

#### Authentication Functions

The authentication module is in `js/auth.js`. Available functions:

```javascript
// Sign up a new user
const result = await signUp('user@example.com', 'SecurePass123');
if (result.success) {
    console.log('User created:', result.user.email);
} else {
    console.log('Error:', result.error);
}

// Login
const result = await login('user@example.com', 'SecurePass123');
if (result.success) {
    console.log('Logged in:', result.user.email);
}

// Get current user (works after refresh!)
const user = await getCurrentUser();
console.log('Current user:', user.email);

// Check if logged in
const isLoggedIn = await isAuthenticated();

// Logout
const result = await logout();
```

#### Protecting Pages

To require authentication on a page (prevents non-logged-in users):

```javascript
// In your page's JavaScript file:
async function initPage() {
    const user = await getCurrentUser();
    if (!user) {
        window.location.href = 'login.html?next=' + encodeURIComponent(window.location.pathname);
        return;
    }
    // User is authenticated, continue...
}
```

This is already implemented in `index.html` and `test.html`.

#### Using Supabase in Console (Debugging)

Open browser Developer Console (F12) and use:

```javascript
// Check auth status
window.ThinkRightAuth.getCurrentUser().then(user => console.log(user));

// Toggle theme
toggleTheme();

// Get test results
StorageManager.getResults();
```

---

## Capacitor Android Wrapper (Remote URL Mode)

ThinkRight now supports Capacitor wrapping for Android/iOS without rewriting the web app.

### Current mode

- **Remote URL mode** (v1): native app loads live deployed site URL.
- This means Vercel web updates are reflected in the mobile app without rebuilding APK for every UI/content change.

### Core commands

```bash
npm install
npm run cap:sync:android
npm run cap:open:android
```

### Config location

- `capacitor.config.ts`
  - `appId`: `com.thinkright.app`
  - `appName`: `ThinkRight`
  - `server.url`: live ThinkRight domain
  - `server.cleartext`: `false`
  - `android.allowMixedContent`: `false`

### Mobile polish included

- Status bar style sync (light/dark)
- Android back behavior:
  - history back when possible
  - on home route: double-back to exit
- Offline overlay with retry button
- External links routed to system browser

### Asset placeholders

- Placeholder native assets are in `resources/`:
  - `resources/icon.png`
  - `resources/splash.png`
  - `resources/README.md` explains replacement before release

#### Checking Test Results Programmatically

```javascript
// Get all results
const allResults = StorageManager.getResults();

// Get results for specific subject
const mathResults = StorageManager.getResultsBySubject('mathematics');

// Get last test result
const lastResult = StorageManager.getLastResult();
console.log(lastResult.score, lastResult.correctCount);
```

#### Accessing Timer State During Test

```javascript
// In test.js, the timer state is available in testState object
console.log(testState.timeRemaining); // Seconds left
console.log(testState.currentQuestionIndex); // Current question
console.log(testState.answers); // User's answers so far
```

---

## 🏗️ Architecture & Code Organization

### Important: How Authentication Works

**Supabase handles ONLY:**
- Email/password signup
- Email/password login
- Session persistence (keeps users logged in across page refreshes)
- User identity (who is currently logged in)

**Supabase does NOT touch:**
- Question loading (loads from local JSON files)
- Question shuffling (done in JavaScript)
- Timer logic (100% local)
- Score calculation (100% local)
- Test UI (100% local)
- Results display (100% local)

This design keeps auth separate from testing logic and makes the app work great even if Supabase has issues.

### Data Flow with Authentication

```
1. User opens app → Redirected to login.html
2. User signs up/logs in → Supabase authenticates
3. User redirected to index.html (landing page)
4. Before showing landing, app checks: "Is user logged in?" (asks Supabase)
5. If yes → Show landing with subject selection
6. If no → Redirect back to login
7. User clicks subject → Loads test.html
8. Before showing test, app checks: "Is user logged in?" (asks Supabase)
9. If yes → Load questions from local JSON files
10. User takes test → Everything local (no Supabase calls)
11. User submits → Save results to localStorage
12. User clicks logout → Supabase logs them out
```

### Module Breakdown

#### **auth.js** (Authentication Module) - NEW
- **Initialization**: `initSupabase()` - Loads Supabase client from CDN
- **Signup/Login**: `signUp()`, `login()`, `logout()`
- **Session Management**: `getCurrentUser()`, `isAuthenticated()`, `getSession()`
- **State Watching**: `onAuthStateChange()` - Watch for login/logout events
- **Validation**: `isValidEmail()`, `validatePassword()`
- **Helpers**: `requireAuth()` - Force login on protected pages
- **Error Handling**: `formatErrorMessage()` - User-friendly error text

**Why separate?** Auth is independent from testing. Changing auth provider (to Firebase, OAuth, etc.) only requires updating this one file.

#### **login.js** (Login Page Logic) - NEW
- Form submission handling
- Input validation
- Error display
- Redirect after successful login
- Theme toggle on auth pages

#### **signup.js** (Signup Page Logic) - NEW
- Form submission handling
- Password strength validation
- Password match validation
- Success/error messages
- Real-time password hints

#### **utils.js** (Shared Utilities)
- **Theme Management**: `initTheme()`, `toggleTheme()`, `setTheme()`
- **Data Loading**: `fetchQuestions()`, `getQuestionsForTest()`
- **Array Utilities**: `shuffleArray()`, `getRandomItems()`
- **Storage Manager Class**: Centralized localStorage operations
  - `saveResult()`, `getResults()`, `saveTestState()`, `getTestState()`
- **Time Formatting**: `formatTime()`, `calculatePercentage()`
- **Validation**: `isValidQuestion()`, `isValidAnswer()`
- **Auth Initialization**: Now calls `initSupabase()` on page load

**Why separate?** These utilities are reusable across multiple pages and make localStorage swappable for API calls in Phase 2.

#### **app.js** (Landing Page)
- Subject selection and navigation
- GSAP animations on page load
- Keyboard/mouse interaction handlers
- Saves selected subject to localStorage for test.js to retrieve

**File Size**: ~120 lines of well-commented code

#### **test.js** (Test Interface)
- Question rendering and option display
- Navigation between questions (Previous/Next)
- Timer countdown with localStorage persistence
- Answer tracking and soft warnings
- Score calculation and results display
- Auto-submit on timer expiry
- Result modal with action buttons

**Code Organization**:
- CONFIG object for all settings (easy to change)
- testState object for all current test data
- Elements object for DOM caching
- Functions grouped by feature (initialization, rendering, navigation, timer, submission)

**File Size**: ~700 lines of extensively commented code

#### **style.css** (Styling)
- CSS Variables for colors, spacing, typography (easy theme switching)
- Mobile-first responsive design
- Animation keyframes
- Component-based styling

**Theming System**:
```css
/* Light mode (default) */
:root {
    --color-bg-primary: #ffffff;
    --color-text-primary: #1a1a1a;
    /* ... more variables */
}

/* Dark mode */
[data-theme="dark"] {
    --color-bg-primary: #1a1a1a;
    --color-text-primary: #ffffff;
    /* ... more variables */
}
```

### Data Flow Diagram

```
index.html
    ↓
app.js (handle subject selection)
    ↓ (save to localStorage)
    ↓
test.html
    ↓
test.js (retrieve subject from localStorage)
    ↓
utils.js: fetchQuestions() → data/[subject].json
    ↓
test.js: shuffle & select 30 questions
    ↓
render questions → collect answers
    ↓
test.js: calculateScore()
    ↓
StorageManager: saveResult() → localStorage
    ↓
Display results modal
```

### localStorage Schema

```javascript
// Selected subject (set by landing page)
localStorage.selected_subject = 'mathematics' | 'english'

// Current test state (for timer persistence)
localStorage.current_test_state = {
    subject: string,
    currentQuestion: number,
    answers: { questionIndex: 'A'|'B'|'C'|'D' },
    timeRemaining: number,
    questions: [...]
}

// All test results history
localStorage.test_results = [
    {
        subject: string,
        score: percentage,
        correctCount: number,
        wrongCount: number,
        totalQuestions: number,
        timestamp: ISO string,
        answers: {...},
        autoSubmitted: boolean
    },
    ...
]

// Theme preference
localStorage.theme = 'light' | 'dark'
```

---

## ⚙️ Configuration

All settings are centralized in `js/test.js` within the `CONFIG` object:

```javascript
const CONFIG = {
    QUESTIONS_PER_TEST: 30,           // Change to 40 when more questions available
    TEST_DURATION_SECONDS: 60 * 60,   // 60 minutes
    TIMER_WARNING_THRESHOLD: 5 * 60,  // Yellow at 5 min
    TIMER_DANGER_THRESHOLD: 1 * 60,   // Red at 1 min
    AUTO_SAVE_INTERVAL: 5000,         // Save state every 5 sec
};
```

### Easy Customizations

**Change test duration to 90 minutes:**
```javascript
TEST_DURATION_SECONDS: 90 * 60,
```

**Change questions per test to 40 (once more data available):**
```javascript
QUESTIONS_PER_TEST: 40,
```

**Change timer warning colors:**
Edit in `css/style.css`:
```css
.timer.warning { color: var(--color-warning); }
.timer.danger { color: var(--color-danger); }
```

---

## 🌍 Browser Support

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | Latest | ✅ Fully Supported |
| Firefox | Latest | ✅ Fully Supported |
| Safari | 12+ | ✅ Fully Supported |
| Edge | Latest | ✅ Fully Supported |
| IE 11 | - | ❌ Not Supported (no ES6) |

**Note**: The app uses ES6+ features (arrow functions, const/let, template literals). For IE11 support, would require transpilation with Babel (not recommended for this project).

---

## 🔮 Future Enhancements (Phase 2+)

This codebase is structured for easy expansion. Here's how:

### Phase 2: Backend Integration

**Current (localStorage):**
```javascript
StorageManager.saveResult(result);
```

**Future (API call):**
```javascript
async saveResult(result) {
    await fetch('/api/results', {
        method: 'POST',
        body: JSON.stringify(result)
    });
}
```

### Phase 2: Backend Integration

**Current (localStorage):**
```javascript
StorageManager.saveResult(result);
```

**Future (API call):**
```javascript
async saveResult(result) {
    await fetch('/api/results', {
        method: 'POST',
        body: JSON.stringify(result)
    });
}
```

Just modify the StorageManager methods—no other code needs to change.

### Phase 2: Enhanced Authentication

Auth is already in place! Phase 2 additions:
- Email verification (send confirmation email)
- Password reset (forgot password flow)
- OAuth providers (Google, GitHub login)
- User profiles (store user preferences, progress)

To add these, modify `js/auth.js` and create new pages like `forgot-password.html`. The existing login/signup structure is already ready.
    window.location.href = '/login.html';
}
```

### Phase 2: More Subjects

1. Add JSON files: `data/biology.json`, `data/chemistry.json`, etc.
2. Update `index.html` to show more subject cards
3. **No changes needed** in JavaScript logic—already supports any subject!

### Phase 2: Answer Review

Create `review.html` and `js/review.js`:
```javascript
const lastResult = StorageManager.getLastResult();
const questions = testState.questions;

// Display each question with:
// - User's answer
// - Correct answer
// - Explanation
// - Pass/Fail indicator
```

### Phase 2: Analytics Dashboard

Create `dashboard.html`:
```javascript
const allResults = StorageManager.getResults();
// Charts for:
// - Score trends over time
// - Subject performance
// - Average score
// - Progress tracking
```

### Phase 3: Paid Access

Modify `app.js`:
```javascript
if (!UserSubscription.isActive()) {
    showPaymentModal();
}
```

### Phase 3: Admin Panel

Create admin routes:
```
/admin/dashboard
/admin/questions
/admin/analytics
```

Add question management UI to create/edit questions without touching JSON files.

---

## 📝 Code Quality & Maintainability

### Why This Code is Maintainer-Friendly

1. **Clear Comments**: Every function has a purpose statement and explanation
2. **Logical Organization**: Functions grouped by feature, not by type
3. **No Magic Numbers**: All settings in CONFIG object
4. **Minimal Dependencies**: Only GSAP (industry standard)
5. **Modular Structure**: Easy to add features without touching core logic
6. **Consistent Naming**: 
   - `test*` = related to test state
   - `*Test()` = test-related functions
   - `*State()` = state management
7. **Error Handling**: Try-catch blocks with console logging
8. **localStorage Schema**: Clearly documented
9. **Future-Proof Architecture**: Functions designed to swap localStorage for API

### For Junior Developers

**To add a new feature:**

1. Read the related module (e.g., `test.js` for test features)
2. Find the "section" with related code
3. Add your function in that section
4. Follow the commenting pattern
5. Test in browser with console open

**To understand the flow:**

1. Open `index.html` → read `app.js`
2. Click a subject → browser redirects to `test.html`
3. Open `test.html` → read top of `test.js`
4. Follow the `initTest()` function comments

---

## 🐛 Troubleshooting

### Authentication Issues

**Supabase credentials not configured**

Error: `⚠️ Supabase credentials not configured. Auth will not work.`

**Solution**:
1. Open `js/auth.js`
2. Check that `SUPABASE_CONFIG` has your real credentials (not `YOUR_SUPABASE_URL` placeholders)
3. Go back to Supabase → Project Settings → API to copy correct values
4. Refresh page after updating

**Test**: Open DevTools Console (F12) and run:
```javascript
window.ThinkRightAuth.getCurrentUser().then(u => console.log(u));
// Should return user object, not null
```

---

**"Email already registered" error**

**Cause**: User trying to sign up with existing email

**Solution**: User should click "Login here" instead and use their existing account

---

**Login successful but redirects back to login page**

**Cause**: Session not being properly established

**Solution**:
1. Check browser console (F12) for errors
2. Ensure Supabase credentials are correct
3. Check that localStorage is enabled in browser
4. Try hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

**Test**:
```javascript
// In console
const session = await window.ThinkRightAuth.getSession();
console.log(session); // Should not be null
```

---

### Timer Not Persisting on Refresh

**Cause**: Timer state not being saved
**Solution**: Ensure `saveTestState()` is called periodically (it is—runs every 5 seconds)

### Questions Not Loading

**Cause**: CORS error when opening HTML directly (`file://` protocol)
**Solution**: Use a local web server (Live Server, Python, etc.)

**Debug:**
```javascript
// In browser console
await fetchQuestions('mathematics')
// Should return array of questions
```

### Dark Mode Not Applied

**Cause**: Theme initialization didn't run
**Solution**: Check browser console for errors; ensure `utils.js` loaded first

**Debug:**
```javascript
// In console
getTheme() // Should return 'light' or 'dark'
toggleTheme()
```

### Answers Not Saving

**Cause**: localStorage quota exceeded or save function failed
**Solution**: Clear localStorage and retry

**Debug:**
```javascript
// In console
testState.answers // Should show current answers
StorageManager.getResults() // Should show past results
```

---

## 📚 Learning Resources

### For Understanding the Code

- **CSS Variables**: [MDN CSS Custom Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/--*)
- **localStorage API**: [MDN Web Storage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
- **GSAP Animations**: [GSAP Documentation](https://greensock.com/gsap/)
- **ES6 Features**: [MDN JavaScript Guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide)
- **Fetch API**: [MDN Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)

### For Contributing

1. Follow the existing code style
2. Add comments for non-obvious logic
3. Test in multiple browsers
4. Keep performance in mind
5. Update this README for significant changes

---

## 📄 License

This project is proprietary. All rights reserved.

---

## 🤝 Support

For issues, questions, or suggestions:

1. Check the **Troubleshooting** section above
2. Review the **Architecture** section to understand the flow
3. Read the inline code comments
4. Check browser console for error messages

---

## 🎯 Next Steps (Phase 2 Checklist)

- [ ] Backend API setup (Node.js/Express or similar)
- [ ] User authentication system (Supabase recommended)
- [ ] Database schema for results storage
- [ ] Payment integration for premium access
- [ ] Answer review/explanation page
- [ ] Admin dashboard for question management
- [ ] Analytics and performance tracking
- [ ] Mobile app (React Native or similar)
- [ ] More subjects (Physics, Chemistry, Biology, etc.)
- [ ] Question difficulty tagging and filtering
- [ ] Timed section breaks
- [ ] Discussion forum for questions

---

**Built with ❤️ for Nigerian students. Ace your exams with ThinkRight.**
