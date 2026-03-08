(function () {
  "use strict";

  var MIN_VISIBLE_MS = 900;
  var SAFETY_TIMEOUT_MS = 5000;
  var startedAt = performance.now();

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
      return;
    }
    fn();
  }

  ready(function () {
    var loader = document.getElementById("tr-preloader");
    if (!loader) return;

    var body = document.body;
    if (body) body.classList.add("tr-loading");

    var closed = false;

    function finalize() {
      if (closed) return;
      closed = true;

      var elapsed = performance.now() - startedAt;
      var wait = Math.max(0, MIN_VISIBLE_MS - elapsed);

      window.setTimeout(function () {
        loader.classList.add("is-hiding");

        var cleaned = false;
        function cleanup() {
          if (cleaned) return;
          cleaned = true;
          loader.classList.add("is-hidden");
          loader.setAttribute("aria-hidden", "true");
          if (body) body.classList.remove("tr-loading");
        }

        loader.addEventListener(
          "transitionend",
          function (event) {
            if (event.target === loader) cleanup();
          },
          { once: true }
        );

        window.setTimeout(cleanup, 420);
      }, wait);
    }

    window.addEventListener("load", finalize, { once: true });
    window.setTimeout(finalize, SAFETY_TIMEOUT_MS);
  });
})();
