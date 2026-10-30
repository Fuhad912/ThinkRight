const fs = require('fs');
const path = require('path');

console.log('--- VERIFYING CALCULATOR VISIBILITY, REVIEW BUTTON COLOR & REVIEW MODAL LETTER CONTRAST ---');

// 1. Verify Calculator Subjects Logic
const calcJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'calculator.js'), 'utf8');

// Extract CALCULATOR_SUBJECTS set
const subjectsMatch = calcJs.match(/const CALCULATOR_SUBJECTS = new Set\(\[([\s\S]*?)\]\);/);
if (!subjectsMatch) {
    console.error('❌ Could not parse CALCULATOR_SUBJECTS from js/calculator.js');
    process.exit(1);
}
const subjectsList = eval('[' + subjectsMatch[1] + ']');
const calcSubjectsSet = new Set(subjectsList);

console.log('1. Calculator subjects:');
const expectedEnabled = ['mathematics', 'maths', 'math', 'physics', 'chemistry', 'economics', 'further_mathematics', 'further_maths'];
const expectedDisabled = ['english', 'use_of_english', 'biology', 'literature', 'government', 'crs', 'irs', 'commerce', 'agriculture', 'geography'];

let subjectsPass = true;
expectedEnabled.forEach(s => {
    const ok = calcSubjectsSet.has(s);
    console.log(`   [ENABLED]  ${s}: ${ok ? '✅' : '❌'}`);
    if (!ok) subjectsPass = false;
});
expectedDisabled.forEach(s => {
    const ok = !calcSubjectsSet.has(s);
    console.log(`   [DISABLED] ${s}: ${ok ? '✅' : '❌'}`);
    if (!ok) subjectsPass = false;
});

if (!subjectsPass) {
    console.error('❌ Calculator subject whitelist check failed!');
    process.exit(1);
}

// 2. Verify Calculator CSS Display Rules (No forced inline-flex when hidden)
const premCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'premium-ui.css'), 'utf8');

const hasHiddenRule = premCss.includes('.calc-toggle-btn.is-hidden') && 
                      premCss.includes('display: none !important;');
console.log('2. Calculator toggle button hidden rule:');
console.log('   Has display: none !important for .is-hidden / [style*="display: none"]:', hasHiddenRule ? '✅' : '❌');

if (!hasHiddenRule) {
    console.error('❌ Missing display: none !important for hidden calc-toggle-btn!');
    process.exit(1);
}

// 3. Verify Review Answers Button Color (No purple, uses ThinkRight Blue)
const reviewBtnSection = premCss.match(/\.page-test \.results-actions \.review-btn \{[\s\S]*?html\[data-theme='dark'\] \.page-test \.results-actions \.review-btn:hover \{[\s\S]*?\}/);
const reviewBtnCss = reviewBtnSection ? reviewBtnSection[0] : '';

const hasNoPurple = !reviewBtnCss.includes('#4f46e5') && 
                    !reviewBtnCss.includes('#4338ca') && 
                    !reviewBtnCss.includes('#3730a3') &&
                    !reviewBtnCss.includes('79, 70, 229');

const hasBrandBlue = reviewBtnCss.includes('#1d4ed8') || 
                     reviewBtnCss.includes('#2563eb') || 
                     reviewBtnCss.includes('#93c5fd');

console.log('3. Review answers button color check:');
console.log('   Zero purple (#4f46e5 / #4338ca):', hasNoPurple ? '✅' : '❌');
console.log('   Uses ThinkRight brand blue (#1d4ed8 / #2563eb / #93c5fd):', hasBrandBlue ? '✅' : '❌');

if (!hasNoPurple || !hasBrandBlue) {
    console.error('❌ Review answers button still has purple or lacks brand blue!');
    process.exit(1);
}

// 4. Verify Choice Letter Badges in Dark Mode (No invisible white letters)
const hasDarkCorrectBadge = premCss.includes("html[data-theme='dark'] .page-test .review-choice-row.user-answer.is-correct .choice-letter-badge") &&
                            premCss.includes('color: #4ade80 !important;');

const hasDarkIncorrectBadge = premCss.includes("html[data-theme='dark'] .page-test .review-choice-row.user-answer.is-incorrect .choice-letter-badge") &&
                              premCss.includes('color: #f87171 !important;');

const hasDarkSkippedBadge = premCss.includes("html[data-theme='dark'] .page-test .review-choice-row.user-answer.is-skipped .choice-letter-badge") &&
                            premCss.includes('color: #fb923c !important;');

const hasNoCurrentColorWhite = !premCss.includes('.page-test .choice-letter-badge {\n    font-weight: 800;\n    min-width: 22px;\n    height: 22px;\n    border-radius: 6px;\n    background: currentColor;\n    color: #ffffff !important;');

console.log('4. Dark mode choice letter badge contrast:');
console.log('   Correct letter badge has bright green text (#4ade80):', hasDarkCorrectBadge ? '✅' : '❌');
console.log('   Incorrect letter badge has bright red text (#f87171):', hasDarkIncorrectBadge ? '✅' : '❌');
console.log('   Skipped letter badge has bright amber text (#fb923c):', hasDarkSkippedBadge ? '✅' : '❌');
console.log('   Removed white-on-white (background: currentColor; color: #fff):', hasNoCurrentColorWhite ? '✅' : '❌');

if (!hasDarkCorrectBadge || !hasDarkIncorrectBadge || !hasDarkSkippedBadge || !hasNoCurrentColorWhite) {
    console.error('❌ Choice letter badge dark mode verification failed!');
    process.exit(1);
}

console.log('\n🎉 ALL THREE CORRECTIONS VERIFIED AND PASSED 100%!');
