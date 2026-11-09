(function () {
  "use strict";
  var SITE = window.GK_SITE || {};

  var legacyHash = window.location.hash || "";
  if (legacyHash.indexOf("#/") === 0) {
    var legacyRoute = legacyHash.slice(2);
    if (legacyRoute.indexOf("match/") === 0 && SITE.watchBase) {
      window.location.replace(SITE.watchBase + "?id=" + encodeURIComponent(decodeURIComponent(legacyRoute.slice(6))));
      return;
    }
    var legacyTarget = (SITE.legacyRoutes || {})[legacyRoute];
    if (legacyTarget) {
      window.location.replace(legacyTarget);
      return;
    }
  }

  var hamburger = document.getElementById("hamburger");
  var mobileMenu = document.getElementById("mobileMenu");

  function setMenuOpen(open) {
    if (!hamburger || !mobileMenu) return;
    hamburger.classList.toggle("open", open);
    hamburger.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) mobileMenu.removeAttribute("hidden");
    else mobileMenu.setAttribute("hidden", "");
  }

  if (hamburger && mobileMenu) {
    hamburger.addEventListener("click", function () {
      setMenuOpen(mobileMenu.hasAttribute("hidden"));
    });
    mobileMenu.addEventListener("click", function (e) {
      if (e.target && e.target.closest && e.target.closest("a")) setMenuOpen(false);
    });
    document.addEventListener("click", function (e) {
      if (!e.target || !e.target.closest) return;
      if (!e.target.closest(".main-header")) setMenuOpen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setMenuOpen(false);
    });
    window.addEventListener("resize", function () {
      if (window.innerWidth > 900) setMenuOpen(false);
    });
  }

  var path = decodeURIComponent(window.location.pathname).replace(/\/+$/, "") || "/";
  var links = document.querySelectorAll(".nav-menu a[href], .nav-mobile a[href], .league-grid a[href]");
  for (var i = 0; i < links.length; i++) {
    var href = links[i].getAttribute("href");
    if (!href || href.charAt(0) !== "/") continue;
    var normPath = decodeURIComponent(href).replace(/\/+$/, "") || "/";
    if (normPath === path) {
      links[i].classList.add("active");
      links[i].setAttribute("aria-current", "page");
    }
  }

  var discordLinks = document.querySelectorAll(".discord-link");
  for (var d = 0; d < discordLinks.length; d++) {
    if (!SITE.discord) continue;
    discordLinks[d].href = SITE.discord;
    discordLinks[d].target = "_blank";
    discordLinks[d].rel = "noopener noreferrer";
  }

})();
