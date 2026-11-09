(function () {
  "use strict";
  var SITE = window.GK_SITE || {};

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

  var pairs = [
    { input: document.getElementById("search-input"), results: document.getElementById("search-results") },
    { input: document.getElementById("mobile-search-input"), results: document.getElementById("mobile-search-results") }
  ].filter(function (p) { return p.input && p.results; });

  var matchCache = null;
  var matchCacheAt = 0;

  function fetchJson(pathname) {
    var bases = SITE.apiBases || [];
    var index = 0;
    function next() {
      if (index >= bases.length) return Promise.reject(new Error("No API available"));
      var base = bases[index++];
      return fetch(base + pathname, { headers: { Accept: "application/json" }, cache: "no-store" })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .catch(next);
    }
    return next();
  }

  function getMatches() {
    if (matchCache && Date.now() - matchCacheAt < 5 * 60 * 1000) return Promise.resolve(matchCache);
    try {
      var raw = sessionStorage.getItem("gk_search_matches_v1");
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.data && Date.now() - parsed.at < 5 * 60 * 1000) {
          matchCache = parsed.data;
          matchCacheAt = parsed.at;
          return Promise.resolve(parsed.data);
        }
      }
    } catch (e) { }
    return fetchJson("/matches/all")
      .then(function (data) {
        matchCache = Array.isArray(data) ? data : [];
        matchCacheAt = Date.now();
        try { sessionStorage.setItem("gk_search_matches_v1", JSON.stringify({ at: matchCacheAt, data: matchCache })); } catch (e) { }
        return matchCache;
      })
      .catch(function () { return []; });
  }

  function norm(value) { return String(value == null ? "" : value).toLowerCase(); }

  function showResults(pair, items) {
    pair.results.innerHTML = "";
    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "search-empty";
      empty.textContent = "No results found.";
      pair.results.appendChild(empty);
    } else {
      items.forEach(function (item) {
        var a = document.createElement("a");
        a.className = "search-result";
        a.href = item.href;
        if (item.external) {
          a.target = "_blank";
          a.rel = "noopener noreferrer";
        }
        var label = document.createElement("span");
        label.textContent = item.label;
        a.appendChild(label);
        var kind = document.createElement("span");
        kind.className = "search-kind";
        kind.textContent = item.kind;
        a.appendChild(kind);
        pair.results.appendChild(a);
      });
    }
    pair.results.hidden = false;
    pair.input.setAttribute("aria-expanded", "true");
  }

  function runSearch(pair, query) {
    var q = norm(query).trim();
    if (q.length < 2) {
      pair.results.hidden = true;
      pair.input.setAttribute("aria-expanded", "false");
      return;
    }
    var leagueItems = [];
    (SITE.leagues || []).forEach(function (league) {
      if (norm(league.name).indexOf(q) !== -1) {
        leagueItems.push({ label: league.name, kind: "Page", href: league.path });
      }
    });
    showResults(pair, leagueItems.slice(0, 8));
    getMatches().then(function (matches) {
      var matchItems = [];
      matches.forEach(function (match) {
        if (matchItems.length >= 8) return;
        var title = String(match.title || "");
        if (norm(title).indexOf(q) === -1) return;
        matchItems.push({
          label: title,
          kind: "Watch",
          href: (SITE.watchBase || "") + "?id=" + encodeURIComponent(match.id),
          external: true
        });
      });
      showResults(pair, leagueItems.concat(matchItems).slice(0, 12));
    });
  }

  pairs.forEach(function (pair) {
    var timer = null;
    pair.input.addEventListener("input", function () {
      clearTimeout(timer);
      var value = pair.input.value;
      timer = setTimeout(function () { runSearch(pair, value); }, 180);
    });
    pair.input.addEventListener("focus", function () {
      if (pair.input.value.trim().length >= 2) runSearch(pair, pair.input.value);
    });
    pair.input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        pair.results.hidden = true;
        pair.input.setAttribute("aria-expanded", "false");
        pair.input.blur();
      }
      if (e.key === "Enter") {
        var first = pair.results.querySelector(".search-result");
        if (first) {
          e.preventDefault();
          first.click();
        }
      }
    });
  });

  document.addEventListener("click", function (e) {
    if (!e.target || !e.target.closest) return;
    if (!e.target.closest(".header-search")) {
      pairs.forEach(function (pair) {
        pair.results.hidden = true;
        pair.input.setAttribute("aria-expanded", "false");
      });
    }
  });
})();
