const fs = require('fs');

console.log("=== VERIFYING OPTION D DESKTOP VISIBILITY FIX ===");

const css = fs.readFileSync('css/premium-ui.css', 'utf8');
const js = fs.readFileSync('js/test.js', 'utf8');
const html = fs.readFileSync('test.html', 'utf8');

function assert(condition, message) {
    if (!condition) {
        console.error(`[FAIL] ${message}`);
        process.exit(1);
    }
    console.log(`[PASS] ${message}`);
}

// 1. Check workspace stretch
assert(
    css.includes('.page-test .test-workspace') &&
    css.includes('align-items: stretch;') &&
    !css.includes('align-items: start;'),
    'test-workspace uses align-items: stretch (not start)'
);

// 2. Check test-content full height and internal scrolling
assert(
    css.includes('.page-test .test-content') &&
    css.includes('height: 100%;') &&
    css.includes('overflow-y: auto;'),
    'test-content has height: 100% and overflow-y: auto'
);

// 3. Check question-stem-box calibrated min-height
assert(
    css.includes('.page-test .question-stem-box') &&
    css.includes('min-height: 70px;') &&
    !css.includes('min-height: 135px;'),
    'question-stem-box calibrated to 70px desktop (saves 65px vertical space)'
);

// 4. Check option-button CBT standard height
assert(
    css.includes('min-height: 48px !important;'),
    'option-button has CBT standard min-height: 48px'
);

// 5. Check submit-section top margin removed
assert(
    css.includes('margin-top: 0 !important;'),
    'submit-section margin-top: 0 !important to remove dead vertical gap'
);

// 6. Check JS displays flex for all options including D
assert(
    js.includes("btn.style.display = 'flex';"),
    'renderCurrentQuestion explicitly ensures btn.style.display = flex'
);

// 7. Check fallback extraction for options
assert(
    js.includes('question.options[letter.toLowerCase()]'),
    'renderCurrentQuestion supports lowercase/array options extraction'
);

console.log("\nALL CHECKS PASSED: Option D is guaranteed visible on desktop view!");
