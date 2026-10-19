// Runs before the app on every page: loads web fonts without blocking the page
// (skipped on 2G / data saver), and if the app still hasn't started after a
// while, replaces "Loading…" with a retry button instead of hanging silently.
(function () {
  var c = navigator.connection || {};
  if (c.saveData || /(^|-)2g$/.test(c.effectiveType || "")) {
    document.documentElement.className += " lite";
  } else {
    var l = document.createElement("link"); l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=JetBrains+Mono:wght@500;700;800&display=swap";
    document.head.appendChild(l);
  }
  function stuck(msg) {
    var b = document.querySelector(".boot");
    if (!b) return;   // the app has started
    b.innerHTML = msg + ' <button type="button" class="btn sm" onclick="location.reload()">Try again</button>';
  }
  setTimeout(function () { stuck("This is taking longer than usual. Your connection may be slow."); }, 15000);
  addEventListener("error", function (e) { if (/could not load/i.test((e && e.message) || "")) stuck("Afterclass could not load."); });
})();
