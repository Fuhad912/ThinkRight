const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

console.log("=== VERIFYING REFINED PRACTICE SPECIFICATIONS ===");

const htmlPath = path.join(ROOT, 'practice.html');
const cssPath = path.join(ROOT, 'css', 'practice.css');
const jsPracticePath = path.join(ROOT, 'js', 'practice.js');
const jsStreakPath = path.join(ROOT, 'js', 'practice-streak.js');
const jsNavSearchPath = path.join(ROOT, 'js', 'navbar-search.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const jsPractice = fs.readFileSync(jsPracticePath, 'utf8');
const jsStreak = fs.readFileSync(jsStreakPath, 'utf8');
const jsNavSearch = fs.readFileSync(jsNavSearchPath, 'utf8');

let pass = true;

function check(label, condition, detail) {
  if (condition) {
    console.log(`[PASS] ${label}`);
  } else {
    console.error(`[FAIL] ${label}: ${detail}`);
    pass = false;
  }
}

// 1. Navbar Search Removal
check("Body does not have page-home class in practice.html", !html.includes('class="page-home'), "Found page-home on body in practice.html");
check("navbar-search.js script removed from practice.html", !html.includes('navbar-search.js'), "Found navbar-search.js script tag in practice.html");
check("navbar-search.js has page-practice guard", jsNavSearch.includes('if (document.body.classList.contains("page-practice")) return;'), "Missing page-practice guard in navbar-search.js");
check("CSS explicitly hides navbar search toggle and row on practice page", css.includes('.page-practice .tr-navbar__search-toggle'), "Missing CSS hide rule for navbar search");

// 2. Compact Target Hub without Bloated Text or Cards
check("Target faculty hub is compact and clean", html.includes('id="practicePersonalizedHub"') && html.includes('class="practice-spotlight-row"'), "Missing compact #practicePersonalizedHub");
check("No bloated long paragraph in hub", !html.includes("Align your practice with your intended university course"), "Found bloated text paragraph in hub");
check("No multi-line subject breakdown cards in hub", !html.includes("faculty-preset-chip__detail"), "Found multi-line bulky cards in hub");
check("Clean faculty pills in hub", html.includes('data-combo="medicine"') && html.includes('data-combo="engineering"'), "Missing faculty preset buttons");

// 3. Default Colors, NO Rainbow Gradient
check("No rainbow multi-color top strip in CSS", !css.includes("linear-gradient(90deg, #2563eb 0%, #7c3aed 50%, #f59e0b 100%)"), "Found rainbow gradient strip in CSS");
check("Hub uses standard surface-bg and line-subtle", css.includes("background: var(--surface-bg)") && css.includes("border: 1px solid var(--line-subtle)"), "Hub does not use default brand colors");

// 4. Confetti Shower Only on Streak Completion
check("No confetti trigger on speed drill in practice.js", !jsPractice.includes("window.confetti"), "Speed drill still calls confetti");
check("No confetti on flame box click in practice-streak.js", !jsStreak.includes("interactiveBox.addEventListener(\"click\", function (e) {\n      if (typeof window.confetti"), "Flame click still calls confetti");
check("Confetti is tied to streak completion in practice-streak.js", jsStreak.includes("checkStreakCompletionCelebration") && jsStreak.includes("triggerStreakConfetti"), "Missing streak completion confetti check");

// 5. Zero Lucide Icons
check("Zero Lucide icons in practice.html", !/lucide/i.test(html), "Found Lucide icons in practice.html");

console.log("\nVERIFICATION SUMMARY:", pass ? "ALL SPECIFICATIONS VERIFIED SUCCESSFULLY!" : "TESTS FAILED!");
process.exit(pass ? 0 : 1);
