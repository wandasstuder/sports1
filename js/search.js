const Search = {
  input: null,
  panel: null,
  wrap: null,
  entries: [],
  indexReady: false,
  indexBuilding: false,
  indexTime: 0,
  _indexPromise: null,
  INDEX_TTL: 2 * 60 * 1000,
  debounceDelay: 150,
  activeIndex: -1,
  items: [],
  _onInput: null,
  _debouncedSearch: null,

  init() {
    this.wrap = document.getElementById('header-search');
    this.input = document.getElementById('search-input');
    this.panel = document.getElementById('search-results');
    this.clearBtn = document.getElementById('search-clear');
    if (!this.wrap || !this.input || !this.panel) return;

    this._debouncedSearch = Utils.debounce(() => this.run(), this.debounceDelay);

    this._onInput = () => {
      this.updateClearBtn();
      const q = this.input.value.trim();
      if (!q) {
        this.close();
        return;
      }
      this.ensureIndex().then(() => this._debouncedSearch());
    };

    this.input.addEventListener('input', this._onInput);
    this.input.addEventListener('focus', () => {
      this.ensureIndex();
      if (this.input.value.trim()) this.run();
    });
    this.input.addEventListener('keydown', (e) => this.onKeydown(e));
    this.input.addEventListener('search', () => {
      this.updateClearBtn();
      if (!this.input.value) this.close();
    });

    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', () => {
        this.input.value = '';
        this.updateClearBtn();
        this.close();
        this.input.focus();
      });
    }

    this.updateClearBtn();
    this.panel.addEventListener('click', (e) => e.stopPropagation());
    this.panel.addEventListener('mousedown', (e) => e.preventDefault());

    document.addEventListener('click', (e) => {
      if (!this.wrap.contains(e.target)) this.close();
    });

    window.addEventListener('hashchange', () => this.close());
  },

  updateClearBtn() {
    if (!this.clearBtn || !this.input) return;
    this.clearBtn.hidden = !this.input.value;
  },

  isOpen() {
    return !!this.panel && !this.panel.hidden;
  },

  close() {
    if (!this.panel) return;
    this.panel.hidden = true;
    this.panel.innerHTML = '';
    this.activeIndex = -1;
    this.items = [];
    if (this.input) this.input.setAttribute('aria-expanded', 'false');
  },

  open() {
    if (!this.panel) return;
    this.panel.hidden = false;
    if (this.input) this.input.setAttribute('aria-expanded', 'true');
  },

  clearInput() {
    if (this.input) this.input.value = '';
    this.updateClearBtn();
    this.close();
  },

  normalize(str) {
    if (!str) return '';
    return String(str).toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  },

  editDistance(a, b, max) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const m = a.length;
    const n = b.length;
    let prev = new Array(n + 1);
    let cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      let rowMin = cur[0];
      for (let j = 1; j <= n; j++) {
        const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return max + 1;
      const tmp = prev;
      prev = cur;
      cur = tmp;
    }
    return prev[n];
  },

  ensureIndex() {
    if (this.indexReady && Date.now() - this.indexTime < this.INDEX_TTL) {
      return Promise.resolve();
    }
    if (this._indexPromise) return this._indexPromise;

    this._indexPromise = (async () => {
      this.indexBuilding = true;
      try {
        await this.buildIndex();
        this.indexReady = true;
        this.indexTime = Date.now();
      } catch (e) {
        console.error('Search index build failed:', e);
      } finally {
        this.indexBuilding = false;
        this._indexPromise = null;
      }
    })();
    return this._indexPromise;
  },

  async buildIndex() {
    const entries = [];

    for (const cat of (typeof App !== 'undefined' && App.SPORT_CATEGORIES) || []) {
      const name = this.normalize(cat.name);
      entries.push({
        type: 'category',
        id: cat.id,
        label: cat.name,
        kind: 'Sport',
        href: `#/category/${cat.id}`,
        text: name,
        words: [name],
        boost: 0
      });
    }

    const leagues = (typeof Leagues !== 'undefined' && Leagues.data && Leagues.data.leagues) || [];
    for (const lg of leagues) {
      const name = this.normalize(lg.name);
      const keywords = (lg.keywords || []).map(k => this.normalize(k));
      const words = [name, ...keywords].filter(Boolean);
      entries.push({
        type: 'league',
        id: lg.id,
        label: lg.name,
        kind: 'League',
        href: `#/league/${lg.id}`,
        image: lg.image || null,
        iconId: lg.id,
        text: this.normalize([lg.name, lg.category || '', (lg.keywords || []).join(' ')].join(' ')),
        words,
        boost: lg.isPopular ? 1 : 0
      });
    }

    try {
      const matches = await API.getAllMatches();
      const now = Date.now();
      for (const m of (matches || [])) {
        const names = Leagues.getDisplayName(m);
        const league = Leagues.detectLeague(m);
        const label = names.hasBothTeams
          ? `${names.home} vs ${names.away}`
          : names.home;
        const is247 = Utils.is24x7Channel(m);
        const isLive = !is247 && Utils.isWithinLiveWindow(m);
        let boost = 0;
        if (m.popular) boost += 2;
        if (isLive) boost += 3;
        if (is247) boost += 1;
        if (m.date && m.date >= now && m.date - now < 3 * 60 * 60 * 1000) boost += 1;

        const fields = [names.home, names.away, m.title, league ? league.name : '', m.category]
          .filter(Boolean);
        const words = [];
        for (const f of fields) {
          const n = this.normalize(f);
          if (n) words.push(n);
          for (const part of n.split(' ')) {
            if (part.length >= 3) words.push(part);
          }
        }

        entries.push({
          type: 'match',
          id: m.id,
          label,
          kind: league ? league.name : (m.category ? Leagues.formatCategoryName(m.category) : 'Match'),
          href: `#/match/${encodeURIComponent(m.id)}`,
          iconId: league ? league.id : null,
          date: m.date,
          is247,
          text: this.normalize(fields.join(' ')),
          words,
          boost,
          match: m
        });
      }
    } catch (e) {
      // Matches unavailable (offline/API error) — still search leagues/categories
    }

    this.entries = entries;
  },

  fuzzyAllowed(token) {
    if (token.length >= 7) return 2;
    if (token.length >= 4) return 1;
    return 0;
  },

  scoreToken(token, entry) {
    let best = -1;
    const maxDist = this.fuzzyAllowed(token);
    for (let i = 0; i < entry.words.length; i++) {
      const w = entry.words[i];
      if (w === token) return 100;
      if (w.startsWith(token)) {
        if (best < 80) best = 80;
      } else if (w.includes(token)) {
        if (best < 60) best = 60;
      } else if (maxDist > 0 && Math.abs(w.length - token.length) <= maxDist) {
        const d = this.editDistance(token, w, maxDist);
        if (d <= maxDist) {
          const s = 40 - d * 10;
          if (s > best) best = s;
        }
      }
    }
    if (best < 0 && entry.text.includes(token)) best = 30;
    return best;
  },

  search(query) {
    const q = this.normalize(query);
    if (!q) return [];
    const tokens = q.split(' ').filter(Boolean);
    if (tokens.length === 0) return [];

    const results = [];
    for (const entry of this.entries) {
      let total = 0;
      let ok = true;
      for (const token of tokens) {
        const s = this.scoreToken(token, entry);
        if (s < 0) {
          ok = false;
          break;
        }
        total += s;
      }
      if (!ok) continue;
      results.push({ entry, score: total + entry.boost });
    }

    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const typeRank = { match: 0, league: 1, category: 2 };
      if (typeRank[a.entry.type] !== typeRank[b.entry.type]) {
        return typeRank[a.entry.type] - typeRank[b.entry.type];
      }
      if (a.entry.type === 'match' && b.entry.type === 'match') {
        return (a.entry.date || 0) - (b.entry.date || 0);
      }
      return 0;
    });

    return results;
  },

  run() {
    const query = this.input.value.trim();
    if (!query) {
      this.close();
      return;
    }
    if (!this.indexReady) {
      this.renderLoading();
      this.ensureIndex().then(() => {
        if (this.input.value.trim() === query) this.run();
      });
      return;
    }

    const results = this.search(query);
    this.render(results, query);
  },

  renderLoading() {
    this.panel.innerHTML = '';
    const el = Utils.el('div', { className: 'search-msg', textContent: 'Loading…' });
    this.panel.appendChild(el);
    this.open();
  },

  render(results, query) {
    this.panel.innerHTML = '';
    this.activeIndex = -1;
    this.items = [];

    if (results.length === 0) {
      const el = Utils.el('div', { className: 'search-msg' });
      el.appendChild(document.createTextNode('No results for '));
      const strong = Utils.el('strong', { textContent: `“${query}”` });
      el.appendChild(strong);
      this.panel.appendChild(el);
      this.open();
      return;
    }

    const limits = { match: 10, league: 4, category: 3 };
    const counts = { match: 0, league: 0, category: 0 };
    const groups = [
      { type: 'match', title: 'Matches' },
      { type: 'league', title: 'Leagues' },
      { type: 'category', title: 'Sports' }
    ];

    const tokens = this.normalize(query).split(' ').filter(Boolean);

    for (const group of groups) {
      const groupResults = results.filter(r => r.entry.type === group.type);
      if (groupResults.length === 0 || counts[group.type] >= limits[group.type]) continue;

      const header = Utils.el('div', { className: 'search-group-title', textContent: group.title });
      this.panel.appendChild(header);

      for (const r of groupResults) {
        if (counts[group.type] >= limits[group.type]) break;
        counts[group.type]++;
        this.panel.appendChild(this.renderItem(r.entry, tokens));
      }
    }

    this.open();
  },

  renderItem(entry, tokens) {
    const item = Utils.el('div', {
      className: 'search-item',
      role: 'option',
      tabindex: '-1'
    });

    const iconWrap = Utils.el('div', { className: 'search-item-icon' });
    if (entry.type === 'match' || entry.type === 'league') {
      iconWrap.innerHTML = Utils.getLeagueImageHTML(entry.iconId || entry.id, entry.kind);
    } else {
      iconWrap.innerHTML = Utils.getSportImageHTML(entry.id);
    }
    item.appendChild(iconWrap);

    const body = Utils.el('div', { className: 'search-item-body' });
    const title = Utils.el('div', { className: 'search-item-title' });
    this.highlight(title, entry.label, tokens);
    body.appendChild(title);

    const meta = Utils.el('div', { className: 'search-item-meta' });
    if (entry.type === 'match') {
      const status = Utils.getMatchStatus(entry.match);
      const badge = Utils.el('span', { className: `search-item-badge ${status.class}`, textContent: status.text });
      if (status.countdown) {
        badge.setAttribute('data-countdown', String(status.countdown));
        badge.setAttribute('data-match-id', entry.match.id);
        Utils.ensureCountdownTicker();
      }
      meta.appendChild(badge);
      if (!status.countdown) {
        const dateText = Utils.getRelativeDate(entry.match.date);
        if (dateText) {
          meta.appendChild(Utils.el('span', { className: 'search-item-date', textContent: dateText }));
        }
      }
      meta.appendChild(Utils.el('span', { textContent: entry.kind }));
    } else {
      meta.appendChild(Utils.el('span', { textContent: entry.kind }));
    }
    body.appendChild(meta);
    item.appendChild(body);

    item.addEventListener('click', () => this.select(entry));
    this.items.push({ el: item, entry });
    return item;
  },

  highlight(container, label, tokens) {
    if (!tokens || tokens.length === 0) {
      container.textContent = label;
      return;
    }
    const lower = label.toLowerCase();
    const ranges = [];
    for (const token of tokens) {
      if (!token) continue;
      let idx = lower.indexOf(token);
      while (idx !== -1) {
        ranges.push([idx, idx + token.length]);
        idx = lower.indexOf(token, idx + token.length);
      }
    }
    if (ranges.length === 0) {
      container.textContent = label;
      return;
    }
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [ranges[0]];
    for (let i = 1; i < ranges.length; i++) {
      const last = merged[merged.length - 1];
      if (ranges[i][0] <= last[1]) {
        last[1] = Math.max(last[1], ranges[i][1]);
      } else {
        merged.push(ranges[i]);
      }
    }
    let pos = 0;
    for (const [start, end] of merged) {
      if (start > pos) container.appendChild(document.createTextNode(label.slice(pos, start)));
      const strong = Utils.el('strong', { textContent: label.slice(start, end) });
      container.appendChild(strong);
      pos = end;
    }
    if (pos < label.length) container.appendChild(document.createTextNode(label.slice(pos)));
  },

  select(entry) {
    this.clearInput();
    if (entry.href) window.location.hash = entry.href;
  },

  setActive(index) {
    if (this.items.length === 0) return;
    if (index < 0) index = this.items.length - 1;
    if (index >= this.items.length) index = 0;
    this.activeIndex = index;
    this.items.forEach((it, i) => {
      it.el.classList.toggle('active', i === index);
    });
    const el = this.items[index].el;
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  },

  onKeydown(e) {
    if (e.key === 'Escape') {
      if (this.isOpen()) {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
      return;
    }
    if (!this.isOpen()) {
      if (e.key === 'ArrowDown' && this.input.value.trim()) {
        e.preventDefault();
        this.run();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.setActive(this.activeIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.setActive(this.activeIndex - 1);
    } else if (e.key === 'Enter') {
      if (this.activeIndex >= 0 && this.items[this.activeIndex]) {
        e.preventDefault();
        this.select(this.items[this.activeIndex].entry);
      } else if (this.items.length > 0) {
        e.preventDefault();
        this.select(this.items[0].entry);
      }
    }
  }
};
