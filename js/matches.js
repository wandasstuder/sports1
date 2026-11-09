(function () {
  "use strict";
  var table = document.getElementById("matches-table");
  if (!table) return;

  var body = document.getElementById("matches-body");
  var loading = document.getElementById("loading");
  var SITE = window.GK_SITE || {};
  var keyword = (document.body.getAttribute("data-keyword") || "").trim();
  var category = (document.body.getAttribute("data-category") || "").trim();
  var bases = SITE.apiBases || [];
  var watchBase = SITE.watchBase || "";
  var CACHE_KEY = "gk_matches_cache_v1";
  var CACHE_TTL = 60 * 1000;
  var allMatches = [];

  if (loading) loading.style.display = "block";
  table.style.display = "none";

  function fetchJson(pathname) {
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

  function readCache() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.data)) return null;
      if (Date.now() - parsed.at > CACHE_TTL) return null;
      return parsed.data;
    } catch (e) { return null; }
  }

  function writeCache(data) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: data })); } catch (e) { }
  }

  function getMatches() {
    var cached = readCache();
    if (cached) return Promise.resolve(cached);
    return fetchJson("/matches/all").then(function (data) {
      if (!Array.isArray(data)) throw new Error("Invalid matches response");
      writeCache(data);
      return data;
    });
  }

  function formatTime(unix) {
    return new Date(unix).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
  }

  function categoryName(value) {
    var names = {
      "american-football": "American Football",
      "basketball": "Basketball",
      "football": "Football",
      "baseball": "Baseball",
      "hockey": "Hockey",
      "motor-sports": "Motor Sports",
      "fight": "Fight",
      "tennis": "Tennis",
      "rugby": "Rugby",
      "golf": "Golf",
      "afl": "AFL",
      "cricket": "Cricket",
      "billiards": "Billiards",
      "darts": "Darts",
      "other": "Other"
    };
    return names[value] || value || "-";
  }

  function cell(text) {
    var td = document.createElement("td");
    td.textContent = text;
    return td;
  }

  function render(filter) {
    body.innerHTML = "";
    var filtered = allMatches.filter(function (m) {
      return filter === "all" || m.status === filter;
    });

    if (!filtered.length) {
      var emptyRow = document.createElement("tr");
      var emptyCell = document.createElement("td");
      emptyCell.colSpan = 5;
      emptyCell.textContent = "No matches available.";
      emptyRow.appendChild(emptyCell);
      body.appendChild(emptyRow);
    } else {
      filtered.forEach(function (m) {
        var tr = document.createElement("tr");
        tr.appendChild(cell(m.time));
        tr.appendChild(cell(m.sport));
        tr.appendChild(cell(m.tournament));

        var matchCell = document.createElement("td");
        matchCell.appendChild(document.createTextNode(m.title));
        if (m.status === "live" || m.status === "finished") {
          var badge = document.createElement("span");
          badge.className = "badge " + m.status;
          matchCell.appendChild(document.createTextNode(" "));
          matchCell.appendChild(badge);
        }
        tr.appendChild(matchCell);

        var watchCell = document.createElement("td");
        var link = document.createElement("a");
        link.className = "watch-btn";
        link.href = m.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Watch";
        watchCell.appendChild(link);
        tr.appendChild(watchCell);

        body.appendChild(tr);
      });
    }
    table.style.display = "table";
  }

  function setActive(id) {
    document.querySelectorAll(".filter-btn").forEach(function (btn) {
      btn.classList.remove("active");
    });
    var el = document.getElementById(id);
    if (el) el.classList.add("active");
  }

  var allBtn = document.getElementById("all-btn");
  var liveBtn = document.getElementById("live-btn");
  var upcomingBtn = document.getElementById("upcoming-btn");
  if (allBtn) allBtn.addEventListener("click", function () { setActive("all-btn"); render("all"); });
  if (liveBtn) liveBtn.addEventListener("click", function () { setActive("live-btn"); render("live"); });
  if (upcomingBtn) upcomingBtn.addEventListener("click", function () { setActive("upcoming-btn"); render("upcoming"); });

  getMatches().then(function (matches) {
    var now = Date.now();
    var hasFilter = !!(keyword || category);
    var liveCount = 0;

    matches.forEach(function (match) {
      var start = Number(match.date);
      if (!start) return;
      var end = Number(match.ends_at) || start + 150 * 60 * 1000;

      if (hasFilter) {
        var titleMatch = keyword && String(match.title || "").toLowerCase().indexOf(keyword.toLowerCase()) !== -1;
        var slugMatch = category && match.category === category;
        if (!titleMatch && !slugMatch) return;
      }

      if (now - end >= 180 * 60 * 1000) return;

      var status = now >= end ? "finished" : (now >= start ? "live" : "upcoming");
      if (status === "live") liveCount += 1;

      allMatches.push({
        start: start,
        time: formatTime(start),
        sport: categoryName(match.category),
        tournament: match.league_name || "",
        title: match.title || "-",
        status: status,
        url: watchBase + "?id=" + encodeURIComponent(match.id)
      });
    });

    var rank = { live: 0, upcoming: 1, finished: 2 };
    allMatches.sort(function (a, b) {
      return (rank[a.status] - rank[b.status]) || (a.start - b.start);
    });

    var liveCountEl = document.getElementById("live-count");
    if (liveCountEl) liveCountEl.textContent = String(liveCount);
    if (loading) loading.style.display = "none";
    render("all");
  }).catch(function (err) {
    if (loading) loading.innerHTML = '<p style="color:#ff4d5a;">Unable to load matches right now.</p>';
    console.error(err);
  });
})();
