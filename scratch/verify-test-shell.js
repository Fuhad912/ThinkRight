const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

console.log("=== VERIFYING CBT QUESTION & OPTION SHELL SPECIFICATIONS ===");

const htmlPath = path.join(ROOT, 'test.html');
const cssPath = path.join(ROOT, 'css', 'premium-ui.css');
const jsTestPath = path.join(ROOT, 'js', 'test.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const jsTest = fs.readFileSync(jsTestPath, 'utf8');

let pass = true;

function check(label, condition, detail) {
  if (condition) {
    console.log(`[PASS] ${label}`);
  } else {
    console.error(`[FAIL] ${label}: ${detail}`);
    pass = false;
  }
}

// 1. Structure Verification (test.html)
check("Question Shell container exists in test.html", html.includes('id="questionShell"') && html.includes('question-shell'), "Missing #questionShell");
check("Question Meta Bar exists in test.html", html.includes('question-meta-bar') && html.includes('id="questionNumberBadge"'), "Missing question-meta-bar or #questionNumberBadge");
check("Question Stem Box exists in test.html", html.includes('id="questionStemBox"'), "Missing #questionStemBox");
check("Options Shell exists in test.html", html.includes('id="optionsShell"') && html.includes('options-shell'), "Missing #optionsShell");

// 2. Styling Verification (css/premium-ui.css)
check("Question stem box has min-height in CSS", css.includes('.page-test .question-stem-box') && css.includes('min-height: 120px') && css.includes('min-height: 135px'), "Missing calibrated min-height on question-stem-box");
check("Option button has standard CBT min-height: 56px in CSS", css.includes('.page-test .option-button') && css.includes('min-height: 56px'), "Missing min-height: 56px on option-button");
check("Option button has transform: none !important in CSS", css.includes('.page-test .option-button') && css.includes('transform: none !important'), "Missing transform: none on option-button");
check("Option badge has fixed 34px dimensions in CSS", css.includes('.page-test .option-badge') && css.includes('width: 34px') && css.includes('height: 34px'), "Missing 34px badge dimensions");
check("Option indicator radio exists in CSS", css.includes('.page-test .option-indicator'), "Missing option-indicator radio in CSS");

// 3. Logic Verification (js/test.js)
check("In-place persistent 4-slot updating in renderCurrentQuestion", jsTest.includes("PERSISTENT 4-SLOT OPTION SHELL") && jsTest.includes("optionBtns.length !== 4"), "Persistent in-place option updating missing");
check("Question number badge updated in updateQuestionCounter", jsTest.includes("questionNumberBadge"), "updateQuestionCounter does not update questionNumberBadge");
check("No vertical displacement in gsap animation", jsTest.includes("gsap.fromTo(elements.questionText") && !jsTest.includes("{ opacity: 0, y: 10 }"), "Vertical y displacement still present in gsap animation");
check("Keyboard shortcuts A, B, C, D supported in handleKeyboardNavigation", jsTest.includes("['A', 'B', 'C', 'D'].includes(keyUpper)"), "Option keyboard shortcuts missing");

console.log("\nVERIFICATION SUMMARY:", pass ? "ALL 13 SHELL SPECIFICATIONS PASSED SUCCESSFULLY!" : "SOME TESTS FAILED!");
process.exit(pass ? 0 : 1);
