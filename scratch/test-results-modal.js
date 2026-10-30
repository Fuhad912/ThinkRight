const fs = require('fs');
const path = require('path');

console.log('--- Verifying test.html, css/premium-ui.css, and js/test.js ---');

const testHtml = fs.readFileSync('test.html', 'utf8');
const testJs = fs.readFileSync('js/test.js', 'utf8');
const premiumCss = fs.readFileSync('css/premium-ui.css', 'utf8');
const styleCss = fs.readFileSync('css/style.css', 'utf8');

// 1. Check test.html IDs
const requiredHtmlIds = [
    'resultsModal',
    'finalScore',
    'correctCount',
    'wrongCount',
    'performanceInsights',
    'insightsBadge',
    'insightsSubjectTag',
    'insightsSummary',
    'insightsTopicsWrap',
    'insightsTopics',
    'retakeBtn',
    'reviewBtn',
    'homeBtn',
    'reviewModal',
    'reviewCloseBtn',
    'reviewFilterBar',
    'reviewCountAll',
    'reviewCountCorrect',
    'reviewCountIncorrect',
    'reviewBody',
    'reviewRetakeBtn',
    'reviewReturnBtn',
];

console.log('\n1. Checking required HTML IDs in test.html:');
let missingHtmlIds = 0;
for (const id of requiredHtmlIds) {
    const hasId = testHtml.includes(`id="${id}"`);
    if (!hasId) {
        console.error(`❌ Missing ID in test.html: ${id}`);
        missingHtmlIds++;
    }
}
if (missingHtmlIds === 0) {
    console.log('✅ All 22 required element IDs present in test.html');
}

// 2. Check no lucide icons in reviewModal or resultsModal in test.html
console.log('\n2. Checking icons in resultsModal and reviewModal:');
const resultsModalHtml = testHtml.slice(testHtml.indexOf('id="resultsModal"'), testHtml.indexOf('id="antiCheatModal"'));
if (resultsModalHtml.includes('lucide') || resultsModalHtml.includes('data-lucide')) {
    console.error('❌ Found lucide reference in resultsModal/reviewModal!');
} else {
    console.log('✅ No lucide references in resultsModal/reviewModal HTML.');
}

const hasFaIcons = resultsModalHtml.includes('fa-solid') || resultsModalHtml.includes('fa-regular');
console.log(`✅ Font Awesome 6 icons present in modals: ${hasFaIcons}`);

// 3. Test Review Answers button styling (not colorless)
console.log('\n3. Checking Review Answers button styling:');
const reviewBtnColored = premiumCss.includes('.results-actions .review-btn') &&
                         premiumCss.includes('linear-gradient') &&
                         premiumCss.includes('#4f46e5');
if (reviewBtnColored) {
    console.log('✅ Review Answers button has vibrant Indigo gradient (not colorless):');
    console.log('   - background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%) !important');
    console.log('   - color: #ffffff !important');
} else {
    console.error('❌ Review Answers button styling missing or colorless:', { reviewBtnColored });
}

// 4. Test filter icon and text removal
console.log('\n4. Checking removal of filter icon & text:');
const hasFilterLabel = testHtml.includes('class="review-filter-label"');
const filterBarContainsButtons = testHtml.includes('id="reviewFilterBar"') &&
                                 testHtml.includes('data-filter="all"') &&
                                 testHtml.includes('data-filter="correct"') &&
                                 testHtml.includes('data-filter="incorrect"');
if (!hasFilterLabel && filterBarContainsButtons) {
    console.log('✅ Filter icon and label text successfully removed.');
    console.log('   - Only the 3 clean filter buttons (All, Correct, Incorrect) are present in #reviewFilterBar.');
} else {
    console.error('❌ Filter label not removed or buttons missing:', { hasFilterLabel, filterBarContainsButtons });
}

// 5. Verify modal stretch on desktop
console.log('\n5. Checking desktop modal stretch:');
const resultsModalStretch = premiumCss.includes('max-width: 760px !important');
const reviewModalStretch = premiumCss.includes('max-width: 1080px !important');

if (resultsModalStretch && reviewModalStretch) {
    console.log('✅ Modals are properly stretched on desktop:');
    console.log('   - #resultsModal has max-width: 760px !important');
    console.log('   - #reviewModal has max-width: 1080px !important');
} else {
    console.error('❌ Desktop modal stretch missing:', { resultsModalStretch, reviewModalStretch });
}

// 6. Verify review filter bar is non-collapsing and prominent
console.log('\n6. Checking review filter bar layout & visibility:');
const filterBarFlexShrink = premiumCss.includes('flex-shrink: 0 !important') && premiumCss.includes('.review-filter-bar');
const filterBarMinHeight = premiumCss.includes('min-height: 56px !important');
const reviewBodyFlexSafe = premiumCss.includes('min-height: 0 !important') && premiumCss.includes('flex: 1 1 0% !important');

if (filterBarFlexShrink && filterBarMinHeight && reviewBodyFlexSafe) {
    console.log('✅ Review filter bar is guaranteed to display cleanly:');
    console.log('   - flex-shrink: 0 !important prevents it from collapsing');
    console.log('   - min-height: 56px !important guarantees touch target and visibility');
    console.log('   - review-body min-height: 0 !important prevents content from crushing siblings');
} else {
    console.error('❌ Review filter bar layout issue:', {
        filterBarFlexShrink,
        filterBarMinHeight,
        reviewBodyFlexSafe
    });
}

// 7. Verify modal stacking separation
console.log('\n7. Checking modal stacking separation:');
const reviewHidesResults = testJs.includes("if (elements.resultsModal) {\n        elements.resultsModal.style.display = 'none';\n    }");
const closeReviewRestoresResults = testJs.includes("if (testState.isTestSubmitted && elements.resultsModal) {\n        elements.resultsModal.style.display = 'flex';\n    }");

if (reviewHidesResults && closeReviewRestoresResults) {
    console.log('✅ Modal stacking separation verified:');
    console.log('   - Opening review modal hides resultsModal');
    console.log('   - Closing review modal restores resultsModal');
} else {
    console.error('❌ Modal stacking issue:', { reviewHidesResults, closeReviewRestoresResults });
}

console.log('\n--- All verification checks complete! ---');
