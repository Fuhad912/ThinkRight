/*
  ThinkRight PWA registration
  Registers the service worker on page load.
*/
(function registerThinkRightPwa() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", function onWindowLoad() {
    navigator.serviceWorker.register("/sw.js")
      .then(function onRegistered(registration) {
        console.log("[PWA] Service worker registered:", registration.scope);
      })
      .catch(function onRegistrationError(error) {
        console.error("[PWA] Service worker registration failed:", error);
      });
  });
})();
