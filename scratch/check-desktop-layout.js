const fs = require('fs');

// Read files
const css = fs.readFileSync('css/premium-ui.css', 'utf8');
const styleCss = fs.readFileSync('css/style.css', 'utf8');
const testHtml = fs.readFileSync('test.html', 'utf8');

console.log("Analyzing Desktop Layout Dimensions for test.html...");

// Check heights of components
console.log("1. Checking test-workspace styling:");
const workspaceMatches = css.match(/\.page-test \.test-workspace \{[^}]+\}/g);
console.log(workspaceMatches);

console.log("\n2. Checking test-content styling:");
const contentMatches = css.match(/\.page-test \.test-content \{[^}]+\}/g);
console.log(contentMatches);

console.log("\n3. Checking question-stem-box styling:");
const stemMatches = css.match(/\.page-test \.question-stem-box \{[^}]+\}/g);
console.log(stemMatches);

console.log("\n4. Checking submit-section margin-top:");
const submitMatches = css.match(/\.page-test \.submit-section \{[^}]+\}/g);
console.log(submitMatches);
