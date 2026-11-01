/*
  ThinkRight PWA registration
  Registers the service worker on page load.
*/
(function registerThinkRightPwa() {
  const style=document.createElement('link');style.rel='stylesheet';style.href='/css/app-notifications.css?v=20261101';document.head.append(style);
  const script=document.createElement('script');script.src='/js/app-notifications.js?v=20261101';script.defer=true;
  if(document.readyState==='complete')document.body.append(script);else window.addEventListener('load',()=>document.body.append(script),{once:true});
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", function onWindowLoad() {
    navigator.serviceWorker.register("/sw.js")
      .then(function onRegistered(registration) {
        console.log("[PWA] Service worker registered:", registration.scope);
        registration.update();
      })
      .catch(function onRegistrationError(error) {
        console.error("[PWA] Service worker registration failed:", error);
      });
  });
})();
