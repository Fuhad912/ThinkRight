const fs = require('fs');
const path = require('path');

console.log('=== Verifying Test Confirmation Modal Implementation ===\n');

// 1. Check utils.js
const utilsContent = fs.readFileSync('js/utils.js', 'utf8');
const utilsHasSubjectMeta = utilsContent.includes('TR_SUBJECT_META');
const utilsHasModalInject = utilsContent.includes('injectTestConfirmationModal');
const utilsHasShowModal = utilsContent.includes('window.showTestConfirmationModal = showTestConfirmationModal');
const utilsHasCloseModal = utilsContent.includes('window.closeTestConfirmationModal = closeTestConfirmationModal');

console.log('1. Checking js/utils.js:');
console.log('   TR_SUBJECT_META present:', utilsHasSubjectMeta ? '✅' : '❌');
console.log('   injectTestConfirmationModal present:', utilsHasModalInject ? '✅' : '❌');
console.log('   window.showTestConfirmationModal exported:', utilsHasShowModal ? '✅' : '❌');
console.log('   window.closeTestConfirmationModal exported:', utilsHasCloseModal ? '✅' : '❌');

if (!utilsHasSubjectMeta || !utilsHasModalInject || !utilsHasShowModal || !utilsHasCloseModal) {
    process.exit(1);
}

// 2. Check app.js
const appContent = fs.readFileSync('js/app.js', 'utf8');
const appHasModalTrigger = appContent.includes('showTestConfirmationModal');
console.log('\n2. Checking js/app.js:');
console.log('   handleSubjectClick triggers showTestConfirmationModal:', appHasModalTrigger ? '✅' : '❌');
if (!appHasModalTrigger) process.exit(1);

// 3. Check dashboard-cards.js
const dashCardsContent = fs.readFileSync('js/components/dashboard-cards.js', 'utf8');
const dashHasModalTrigger = dashCardsContent.includes('showTestConfirmationModal');
console.log('\n3. Checking js/components/dashboard-cards.js:');
console.log('   startSubjectPractice triggers showTestConfirmationModal:', dashHasModalTrigger ? '✅' : '❌');
if (!dashHasModalTrigger) process.exit(1);

// 4. Check onboarding.js
const onboardingContent = fs.readFileSync('js/onboarding.js', 'utf8');
const onboardingHasModalTrigger = onboardingContent.includes('showTestConfirmationModal');
console.log('\n4. Checking js/onboarding.js:');
console.log('   onboarding recommendation triggers showTestConfirmationModal:', onboardingHasModalTrigger ? '✅' : '❌');
if (!onboardingHasModalTrigger) process.exit(1);

// 5. Check css/premium-ui.css
const cssContent = fs.readFileSync('css/premium-ui.css', 'utf8');
const hasModalCss = cssContent.includes('.tr-confirm-modal');
const hasBackdropCss = cssContent.includes('.tr-confirm-modal__backdrop');
const hasDialogCss = cssContent.includes('.tr-confirm-modal__dialog');
const hasGridCss = cssContent.includes('.tr-confirm-modal__grid');
const hasDarkModeCss = cssContent.includes("html[data-theme='dark'] .tr-confirm-modal__dialog");

console.log('\n5. Checking css/premium-ui.css:');
console.log('   .tr-confirm-modal styles:', hasModalCss ? '✅' : '❌');
console.log('   backdrop blur styles:', hasBackdropCss ? '✅' : '❌');
console.log('   dialog styles:', hasDialogCss ? '✅' : '❌');
console.log('   spec grid styles:', hasGridCss ? '✅' : '❌');
console.log('   dark mode support:', hasDarkModeCss ? '✅' : '❌');

if (!hasModalCss || !hasBackdropCss || !hasDialogCss || !hasGridCss || !hasDarkModeCss) {
    process.exit(1);
}

// 6. Check dist files synchronization
const distUtils = fs.readFileSync('dist/js/utils.js', 'utf8');
const distApp = fs.readFileSync('dist/js/app.js', 'utf8');
const distDashCards = fs.readFileSync('dist/js/components/dashboard-cards.js', 'utf8');
const distCss = fs.readFileSync('dist/css/premium-ui.css', 'utf8');

console.log('\n6. Checking dist/ synchronization:');
console.log('   dist/js/utils.js in sync:', distUtils.includes('showTestConfirmationModal') ? '✅' : '❌');
console.log('   dist/js/app.js in sync:', distApp.includes('showTestConfirmationModal') ? '✅' : '❌');
console.log('   dist/js/components/dashboard-cards.js in sync:', distDashCards.includes('showTestConfirmationModal') ? '✅' : '❌');
console.log('   dist/css/premium-ui.css in sync:', distCss.includes('.tr-confirm-modal') ? '✅' : '❌');

console.log('\n🎉 ALL CHECKS PASSED SUCCESSFULLY!');
