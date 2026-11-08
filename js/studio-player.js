/* Video.js 10 enhances the existing signed-URL video element. */
import 'https://cdn.jsdelivr.net/npm/@videojs/cdn@10.3.0/video.js';

await Promise.all(['video-player', 'video-skin'].map(name => customElements.whenDefined(name)));
function enhance() {
  document.querySelectorAll('.tw-inline-video video[controls]').forEach(video => {
    video.controls = false;
  });
}
enhance();
// The studio replaces lesson markup when changing steps or saving an upload.
const root = document.getElementById('workspace-root');
if (root) new MutationObserver(enhance).observe(root, { childList: true, subtree: true });
