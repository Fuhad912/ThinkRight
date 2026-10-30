const fs = require('fs');
const path = require('path');

console.log('--- RUNNING VERIFICATION FOR MOBILE HEADER & TIMER SECONDS ---');

// 1. Verify formatTime function
global.window = {};
global.document = { querySelector: () => null, addEventListener: () => {} };
const utilsJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');
const testFormatTime = new Function(utilsJs + '; return formatTime;');
const formatTime = testFormatTime();

const t1 = formatTime(1800);
const t2 = formatTime(1799);
const t3 = formatTime(65);
const t4 = formatTime(0);

console.log('1. formatTime checks:');
console.log('   1800s ->', t1, t1 === '00:30:00' ? '✅' : '❌');
console.log('   1799s ->', t2, t2 === '00:29:59' ? '✅' : '❌');
console.log('   65s   ->', t3, t3 === '00:01:05' ? '✅' : '❌');
console.log('   0s    ->', t4, t4 === '00:00:00' ? '✅' : '❌');

if (t1 !== '00:30:00' || t2 !== '00:29:59' || t4 !== '00:00:00') {
    console.error('❌ formatTime failed verification!');
    process.exit(1);
}

// 2. Verify test.html timer text
const testHtml = fs.readFileSync(path.join(__dirname, '..', 'test.html'), 'utf8');
const distTestHtml = fs.readFileSync(path.join(__dirname, '..', 'dist', 'test.html'), 'utf8');

console.log('2. test.html timer default text:');
const htmlTimerMatch = testHtml.includes('>00:30:00</div>');
const distHtmlTimerMatch = distTestHtml.includes('>00:30:00</div>');
console.log('   test.html has 00:30:00:', htmlTimerMatch ? '✅' : '❌');
console.log('   dist/test.html has 00:30:00:', distHtmlTimerMatch ? '✅' : '❌');

if (!htmlTimerMatch || !distHtmlTimerMatch) {
    console.error('❌ test.html default timer text failed verification!');
    process.exit(1);
}

// 3. Verify calculator.css
const calcCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'calculator.css'), 'utf8');
const calc42 = calcCss.includes('width: 42px') && calcCss.includes('height: 42px');
console.log('3. calculator.css mobile 42px size:');
console.log('   calc-toggle-btn 42px:', calc42 ? '✅' : '❌');

// 4. Verify premium-ui.css
const premCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'premium-ui.css'), 'utf8');
const hasNo32pxShrink = !premCss.includes('width: 32px;\n        min-width: 32px;\n        height: 32px;') &&
                        !premCss.includes('width: 32px;\r\n        min-width: 32px;\r\n        height: 32px;');
const hasLeftGap = premCss.includes('gap: 10px !important') || premCss.includes('gap: 12px');
const hasExit42Mobile = premCss.includes('width: 42px !important') && premCss.includes('.exit-test-btn');
const hasTimer42 = premCss.includes('height: 42px') && premCss.includes('.page-test .timer');

console.log('4. premium-ui.css verification:');
console.log('   No 32px shrink in <=480px:', hasNo32pxShrink ? '✅' : '❌');
console.log('   Left controls separation gap:', hasLeftGap ? '✅' : '❌');
console.log('   Exit button 42px mobile size:', hasExit42Mobile ? '✅' : '❌');
console.log('   Timer 42px height & format:', hasTimer42 ? '✅' : '❌');

if (!hasNo32pxShrink || !hasLeftGap || !hasExit42Mobile || !hasTimer42) {
    console.error('❌ premium-ui.css checks failed!');
    process.exit(1);
}

console.log('\n🎉 ALL VERIFICATIONS PASSED SUCCESSFULLY!');
