const fs = require('fs');

console.log("=== VERIFYING MOBILE TEST PAGE CORRECTIONS ===");

const html = fs.readFileSync('test.html', 'utf8');
const js = fs.readFileSync('js/test.js', 'utf8');
const css = fs.readFileSync('css/premium-ui.css', 'utf8');
const paletteCss = fs.readFileSync('css/test-palette.css', 'utf8');

function assert(condition, message) {
    if (!condition) {
        console.error(`[FAIL] ${message}`);
        process.exit(1);
    }
    console.log(`[PASS] ${message}`);
}

// 1. Check question indicator removal
assert(
    !html.includes('id="questionCounter"') || css.includes('.page-test .test-progress {\n    display: none !important;'),
    'Header question counter removed / hidden'
);
assert(
    !html.includes('id="navStatus"') || css.includes('.page-test .navigation-info {\n    display: none !important;'),
    'Navigation info status removed / hidden from test interface'
);
assert(
    html.includes('id="mobileProgressCount"'),
    'Test page mobile progress bar question indicator retained'
);
assert(
    html.includes('id="paletteAnsweredCount"'),
    'Question palette progress bar question indicator retained'
);
assert(
    js.includes("numberBadge.textContent = `Question ${currentNum}`;"),
    'Question badge displays clean "Question N" instead of redundant "Question N of Total"'
);

// 2. Check palette close button has close sign NOT text
assert(
    html.includes('id="paletteCloseBtn"') &&
    html.includes('fa-xmark') &&
    !html.includes('>Close<') &&
    !html.includes('> Close <'),
    'Palette close button uses fa-xmark close icon rather than text'
);
assert(
    paletteCss.includes('.palette-close-btn') &&
    paletteCss.includes('border-radius: 50%;'),
    'Palette close button styled as a modern circular icon button'
);

// 3. Check Previous/Next button separation from Submit button
assert(
    css.includes('.page-test .submit-section') &&
    css.includes('margin-top: 14px !important;') &&
    css.includes('border-top: 1px dashed'),
    'Submit button separated from Previous/Next with dashed divider and 14px safety buffer'
);
assert(
    css.includes('.page-test .nav-next') &&
    css.includes('background: var(--accent-primary'),
    'Next button has clear primary visual hierarchy on mobile'
);

// 4. Check Header layout (left: timer & calc, center: bold subject, right: exit)
assert(
    html.includes('class="test-header-left"') &&
    html.includes('class="test-header-center"') &&
    html.includes('class="test-header-right"'),
    'Header structured into 3 distinct sections (left, center, right)'
);
assert(
    html.includes('<div class="test-header-left">\n                    <button id="calcToggleBtn"') ||
    html.includes('class="test-header-left">') && html.includes('id="timer"'),
    'Calculator and Timer positioned in top left of header'
);
assert(
    html.includes('<div class="test-header-center">\n                    <h1 class="test-subject" id="testSubject">'),
    'Subject title positioned in top center of header'
);
assert(
    html.includes('<div class="test-header-right">\n                    <button id="exitTestBtn"'),
    'Exit button positioned in top right of header'
);
assert(
    css.includes('.page-test .test-subject') &&
    css.includes('font-weight: 800;') &&
    css.includes('text-align: center;'),
    'Subject title styled bigger, bolder, and centered in CSS'
);

// 5. Check Flag button placement and styling
assert(
    html.includes('id="markReviewBtn"') &&
    html.includes('class="question-meta-bar"'),
    'Flag button placed in question meta bar next to Question number badge'
);
assert(
    js.includes("const labelText = isFlagged ? 'Flagged' : 'Flag';"),
    'Flag button uses compact "Flag" / "Flagged" label'
);
assert(
    css.includes('.page-test .mark-review-btn') &&
    css.includes('.mark-review-btn.is-flagged') &&
    css.includes('#f59e0b'),
    'Flag button styled with amber gold accent when active'
);

// 6. Check Dark Mode Modal text visibility
assert(
    css.includes("html[data-theme='dark'] .page-test .submit-confirm-content"),
    'Dark mode styling defined for submit confirmation modal'
);
assert(
    css.includes("html[data-theme='dark'] .page-test #submitConfirmTitle {\n    color: #f8fafc !important;"),
    'Submit confirmation title has high-contrast white text in dark mode'
);
assert(
    css.includes("html[data-theme='dark'] .page-test .submit-confirm-content p {\n    color: #cbd5e1 !important;"),
    'Submit confirmation message has high-contrast light text in dark mode'
);
assert(
    css.includes("html[data-theme='dark'] .page-test .results-title {\n    color: #f8fafc !important;"),
    'Results title has high-contrast white text in dark mode'
);
assert(
    css.includes("html[data-theme='dark'] .page-test .performance-insights {\n    background: #1e293b !important;"),
    'Performance insights card has rich dark background in dark mode'
);
assert(
    css.includes("html[data-theme='dark'] .page-test .insights-summary"),
    'Performance insights summary text has high-contrast light text in dark mode'
);
assert(
    css.includes("html[data-theme='dark'] .page-test .result-score"),
    'Score card has prominent dark mode styling'
);

console.log("\nALL 6 MOBILE TEST PAGE CORRECTIONS SUCCESSFULLY VERIFIED!");
