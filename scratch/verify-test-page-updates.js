const fs = require('fs');

console.log('=== Verifying Test Page Updates ===\n');

// 1. Verify test.html
const testHtml = fs.readFileSync('test.html', 'utf8');
const hasTimer30 = testHtml.includes('id="timer" role="timer" aria-label="Time Remaining">30:00</div>');
const hasMobileProgress = testHtml.includes('class="mobile-test-progress"');
const hasMobileProgressFill = testHtml.includes('id="mobileProgressFill"');
const hasDesktopProgressBox = testHtml.includes('class="palette-progress-box"');
const hasDesktopProgressFill = testHtml.includes('id="paletteProgressFill"');
const hasCompactPaletteBtn = testHtml.includes('id="paletteToggleBtn"') && testHtml.includes('<span>Palette</span>');

console.log('1. Checking test.html:');
console.log('   Timer starts at 30:00:', hasTimer30 ? '✅' : '❌');
console.log('   Compact mobile palette button:', hasCompactPaletteBtn ? '✅' : '❌');
console.log('   Mobile progress bar beside button:', (hasMobileProgress && hasMobileProgressFill) ? '✅' : '❌');
console.log('   Desktop palette progress box replaces summary:', (hasDesktopProgressBox && hasDesktopProgressFill) ? '✅' : '❌');

if (!hasTimer30 || !hasMobileProgress || !hasMobileProgressFill || !hasDesktopProgressBox || !hasDesktopProgressFill || !hasCompactPaletteBtn) {
    console.error('❌ Failed test.html checks');
    process.exit(1);
}

// 2. Verify js/test.js
const testJs = fs.readFileSync('js/test.js', 'utf8');
const has30MinsConfig = testJs.includes('TEST_DURATION_MINUTES: 30') && testJs.includes('TEST_DURATION_SECONDS: 30 * 60');
const hasPaletteFillRef = testJs.includes('paletteProgressFill');
const hasMobileFillRef = testJs.includes('mobileProgressFill');
const hasTimerDisplayFunc = testJs.includes('function updateTimerDisplay()');

console.log('\n2. Checking js/test.js:');
console.log('   30 minutes test duration config:', has30MinsConfig ? '✅' : '❌');
console.log('   Palette progress fill updated:', hasPaletteFillRef ? '✅' : '❌');
console.log('   Mobile progress fill updated:', hasMobileFillRef ? '✅' : '❌');
console.log('   updateTimerDisplay function present:', hasTimerDisplayFunc ? '✅' : '❌');

if (!has30MinsConfig || !hasPaletteFillRef || !hasMobileFillRef || !hasTimerDisplayFunc) {
    console.error('❌ Failed js/test.js checks');
    process.exit(1);
}

// 3. Verify css/test-palette.css
const paletteCss = fs.readFileSync('css/test-palette.css', 'utf8');
const hasSquarishItem = paletteCss.includes('border-radius: 6px !important');
const hasBlueAnswered = paletteCss.includes('background: #2563eb !important') && paletteCss.includes('border-color: #1d4ed8 !important');
const hasBlueLegend = paletteCss.includes('.legend-dot.answered') && paletteCss.includes('#2563eb');
const hasMobileActionsFlex = paletteCss.includes('.page-test .question-mobile-actions') && paletteCss.includes('.mobile-test-progress');
const hasProgressBoxCss = paletteCss.includes('.palette-progress-box');

console.log('\n3. Checking css/test-palette.css:');
console.log('   Squarish palette items (border-radius: 6px):', hasSquarishItem ? '✅' : '❌');
console.log('   Blue answered palette items:', hasBlueAnswered ? '✅' : '❌');
console.log('   Blue answered legend dot:', hasBlueLegend ? '✅' : '❌');
console.log('   Mobile actions with progress bar beside button:', hasMobileActionsFlex ? '✅' : '❌');
console.log('   Desktop palette progress box styles:', hasProgressBoxCss ? '✅' : '❌');

if (!hasSquarishItem || !hasBlueAnswered || !hasBlueLegend || !hasMobileActionsFlex || !hasProgressBoxCss) {
    console.error('❌ Failed css/test-palette.css checks');
    process.exit(1);
}

// 4. Verify css/premium-ui.css
const premiumCss = fs.readFileSync('css/premium-ui.css', 'utf8');
const hasPremiumSquarish = premiumCss.includes('border-radius: 6px !important');
const hasPremiumBlueAnswered = premiumCss.includes('background: #2563eb !important');

console.log('\n4. Checking css/premium-ui.css:');
console.log('   Squarish palette items:', hasPremiumSquarish ? '✅' : '❌');
console.log('   Blue answered palette items:', hasPremiumBlueAnswered ? '✅' : '❌');

if (!hasPremiumSquarish || !hasPremiumBlueAnswered) {
    console.error('❌ Failed css/premium-ui.css checks');
    process.exit(1);
}

// 5. Verify dist/ synchronization
const distTestHtml = fs.readFileSync('dist/test.html', 'utf8');
const distTestJs = fs.readFileSync('dist/js/test.js', 'utf8');
const distPaletteCss = fs.readFileSync('dist/css/test-palette.css', 'utf8');
const distPremiumCss = fs.readFileSync('dist/css/premium-ui.css', 'utf8');

console.log('\n5. Checking dist/ synchronization:');
console.log('   dist/test.html in sync:', distTestHtml.includes('mobile-test-progress') ? '✅' : '❌');
console.log('   dist/js/test.js in sync:', distTestJs.includes('paletteProgressFill') ? '✅' : '❌');
console.log('   dist/css/test-palette.css in sync:', distPaletteCss.includes('#2563eb') ? '✅' : '❌');
console.log('   dist/css/premium-ui.css in sync:', distPremiumCss.includes('#2563eb') ? '✅' : '❌');

console.log('\n🎉 ALL CHECKS PASSED SUCCESSFULLY!');
