/* Capture install eligibility before the login UI finishes loading. */
(() => {
  let pending = null;
  let installed = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  window.ThinkRightInstall = {
    get ready() { return !!pending && !installed; },
    get installed() { return installed; },
    async prompt() {
      if (!pending || installed) return null;
      const event = pending;
      pending = null;
      try {
        await event.prompt();
        const choice = await event.userChoice;
        return choice.outcome;
      } finally {
        window.dispatchEvent(new Event('thinkright-install-change'));
      }
    }
  };
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    pending = event;
    window.dispatchEvent(new Event('thinkright-install-change'));
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    pending = null;
    window.dispatchEvent(new Event('thinkright-install-change'));
  });
})();
