const fs = require('fs');
let c = fs.readFileSync('js/utils.js', 'utf8');
const oldFn = /function formatTime\(seconds\) \{[\s\S]*?\r?\n\}/;
const newFn = `function formatTime(seconds) {
    const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
}`;
c = c.replace(oldFn, newFn);
fs.writeFileSync('js/utils.js', c, 'utf8');
console.log('SUCCESS');
