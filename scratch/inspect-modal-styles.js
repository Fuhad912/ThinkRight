const fs = require('fs');

const styleCss = fs.readFileSync('css/style.css', 'utf8');
const premiumCss = fs.readFileSync('css/premium-ui.css', 'utf8');

function findRules(css, name, keywords) {
    console.log(`\n=== RULES IN ${name} FOR: ${keywords.join(', ')} ===`);
    const regex = new RegExp(`[^{}]*(?:${keywords.join('|')})[^{}]*\\{[^}]*\\}`, 'gi');
    let m;
    while ((m = regex.exec(css)) !== null) {
        // print matched selector and declarations
        console.log(m[0].trim());
        console.log('---');
    }
}

findRules(styleCss, 'style.css', ['\\.modal-content', 'submit-confirm', 'results-title', 'results-subtitle', 'result-item', 'result-label', 'result-value', 'performance-insights', 'insights-summary']);
findRules(premiumCss, 'premium-ui.css', ['\\.submit-confirm', 'results-title', 'results-subtitle', 'result-item', 'result-label', 'result-value', 'performance-insights', 'insights-summary', '#resultsModal', '#submitConfirmModal']);
