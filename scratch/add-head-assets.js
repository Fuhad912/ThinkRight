const fs = require('fs');

const files = [
  'tutor-dashboard.html',
  'tutor-classes.html',
  'tutor-class.html',
  'tutor-students.html',
  'tutor-analytics.html',
  'tutor-discussions.html',
  'tutor-payouts.html',
  'tutor-onboarding.html',
  'admin.html'
];

const fontAwesomeTag = '  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" integrity="sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA==" crossorigin="anonymous" referrerpolicy="no-referrer">\n';
const chartJsTag = '  <script defer src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>\n';

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('font-awesome')) {
    content = content.replace('<link rel="stylesheet" href="css/teacher-workspace.css', fontAwesomeTag + '  <link rel="stylesheet" href="css/teacher-workspace.css');
  }
  if (!content.includes('chart.umd.min.js') && (file === 'tutor-dashboard.html' || file === 'tutor-analytics.html')) {
    content = content.replace('<script defer src="js/teacher-workspace.js', chartJsTag + '  <script defer src="js/teacher-workspace.js');
  }
  fs.writeFileSync(file, content, 'utf8');
  console.log(`Updated ${file}`);
});

