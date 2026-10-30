const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'insider.html');
let content = fs.readFileSync(filePath, 'utf8');

const target = '<script defer src="js/insider.js?v=20260321-sg"></script>';
const replacement = `<script defer src="js/config.js?v=20260321-sg"></script>\r\n    <script defer src="js/insider.js?v=20260321-sg"></script>\r\n    <script defer src="js/insider-ai.js?v=20260321-sg"></script>`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('SUCCESS: insider.html script tags updated.');
} else {
  console.error('ERROR: target string not found in insider.html');
}
