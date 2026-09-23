const Home = {
  USA_PRIORITY_LEAGUES: ['nfl', 'nba', 'mlb', 'nhl', 'ufc', 'mls'],
  POPULAR_LEAGUES: ['nfl', 'nba', 'mlb', 'nhl', 'ufc', 'soccer', 'ncaaf', 'f1', 'wnba'],
  REFRESH_INTERVAL: 60 * 1000,
  _refreshTimer: null,
  _refreshing: false,
  _promotedLive: new Map(),
  _preloadPromise: null,

  preload() {
    if (this._preloadPromise) return this._preloadPromise;
    this._preloadPromise = Promise.all([
      API.getTodayMatches(),
      API.getPopularMatches(),
      API.getLiveMatches()
    ]).catch(err => {
      this._preloadPromise = null;
      throw err;
    });
    return this._preloadPromise;
  },

  async render(container) {
    this.stopAutoRefresh();
    container.innerHTML = '';

    const shelf = this.createLeagueShelf([]);
    container.appendChild(shelf);

    const sectionsContainer = Utils.el('div', { className: 'home-sections container' });
    const loadingEl = Utils.createLoading('Loading matches...');
    sectionsContainer.appendChild(loadingEl);
    container.appendChild(sectionsContainer);

    this.sectionsContainer = sectionsContainer;
    this.shelf = shelf;

    await this.loadMatches();
  },

  async loadMatches() {
    const sectionsContainer = this.sectionsContainer;
    const shelf = this.shelf;
    const loadingEl = Utils.createLoading('Loading matches...');
    sectionsContainer.innerHTML = '';
    sectionsContainer.appendChild(loadingEl);

    try {
      const [todayMatches, popularMatches, liveMatches] = await this.preload();

      const allMatches = this.mergeMatches(todayMatches, this.mergeMatches(popularMatches, liveMatches));
      const allPopular = popularMatches.filter(m => m.popular && !Utils.is24x7Channel(m));

      const live = [...liveMatches];

      this._live = live;
      this._allPopular = allPopular;
      this._allMatches = allMatches;
      this._currentFilter = 'all';

      this.updateLeagueShelf(shelf, allMatches);

      this.renderHomepage();

      this.startAutoRefresh();

    } catch (error) {
      sectionsContainer.innerHTML = '';
      const message = Utils.el('div', { className: 'section container' });
      message.appendChild(Utils.el('p', {
        className: 'section-title',
        textContent: 'Could not load matches. Browse by league below:',
        style: 'text-align:center;color:var(--text-muted);margin-bottom:16px'
      }));
      sectionsContainer.appendChild(message);
      sectionsContainer.appendChild(this.renderBrowseLeaguesGrid());
    }
  },

  mergeMatches(a, b) {
    const map = new Map();
    for (const m of a || []) map.set(m.id, m);
    for (const m of b || []) {
      if (!map.has(m.id)) map.set(m.id, m);
    }
    return Array.from(map.values());
  },

  getEffectiveLive() {
    const map = new Map();
    for (const m of this._live || []) map.set(m.id, m);
    for (const m of this._promotedLive.values()) {
      if (!map.has(m.id) && Utils.isWithinLiveWindow(m)) map.set(m.id, m);
    }
    for (const m of this._allMatches || []) {
      if (!map.has(m.id) && Utils.isWithinLiveWindow(m)) map.set(m.id, m);
    }
    return Array.from(map.values());
  },

  startAutoRefresh() {
    if (this._refreshTimer) return;
    this._refreshTimer = setInterval(() => {
      if (typeof App !== 'undefined' && App.currentPage !== 'home') {
        this.stopAutoRefresh();
        return;
      }
      this.refreshMatches();
    }, this.REFRESH_INTERVAL);
  },

  stopAutoRefresh() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  },

  async refreshMatches() {
    if (this._refreshing || !this._live) return;
    this._refreshing = true;
    try {
      const liveMatches = await API.getLiveMatches({ fresh: true });
      this._live = [...liveMatches];
      const liveIds = new Set(this._live.map(m => m.id));
      for (const [id, m] of this._promotedLive.entries()) {
        if (liveIds.has(id) || !Utils.isWithinLiveWindow(m)) this._promotedLive.delete(id);
      }
      this.rerenderCurrentView();
    } catch (e) {
      // keep current view on failure
    } finally {
      this._refreshing = false;
    }
  },

  rerenderCurrentView() {
    if (typeof App !== 'undefined' && App.currentPage !== 'home') return;
    if (!this.sectionsContainer || !document.contains(this.sectionsContainer)) return;
    if (this._currentFilter === 'all') {
      this.renderHomepage();
    } else {
      this.renderFiltered(this._currentFilter);
    }
  },

  _onCountdownExpired(matchId) {
    if (!matchId) return;
    const match = (this._allMatches || []).find(m => m.id === matchId)
      || (this._live || []).find(m => m.id === matchId);
    if (!match || Utils.is24x7Channel(match)) return;
    this.promoteToLive(match);
  },

  promoteToLive(match) {
    if (!match || this._promotedLive.has(match.id)) return;
    if ((this._live || []).some(m => m.id === match.id)) return;
    this._promotedLive.set(match.id, match);
    this.rerenderCurrentView();
  },

  getStartingSoon(matches) {
    const now = Date.now();
    const windowEnd = now + 30 * 60 * 1000;
    const liveIds = new Set(this.getEffectiveLive().map(m => m.id));
    return matches
      .filter(m => {
        if (Utils.is24x7Channel(m) || !m.date) return false;
        if (liveIds.has(m.id)) return false;
        return m.date > now && m.date <= windowEnd;
      })
      .sort((a, b) => a.date - b.date);
  },

  getBigGames(matches) {
    const endOfTomorrow = new Date();
    endOfTomorrow.setHours(24, 0, 0, 0);
    endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);
    const endOfTomorrowTs = endOfTomorrow.getTime();

    const dayStart = (ts) => {
      const d = new Date(ts);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    };
    const todayStart = dayStart(Date.now());

    const cmp = (a, b) => {
      const statusRank = (m) => {
        if (Utils.isWithinLiveWindow(m)) return 0;
        if (m.date && m.date > Date.now() && m.date - Date.now() <= 30 * 60 * 1000) return 1;
        const aDay = m.date ? dayStart(m.date) : todayStart;
        return aDay <= todayStart ? 2 : 3;
      };
      const rankDiff = statusRank(a) - statusRank(b);
      if (rankDiff !== 0) return rankDiff;
      const aDay = a.date ? dayStart(a.date) : todayStart;
      const bDay = b.date ? dayStart(b.date) : todayStart;
      if (aDay !== bDay) return aDay - bDay;
      const aLeague = Leagues.detectLeague(a);
      const bLeague = Leagues.detectLeague(b);
      const aPriority = aLeague ? this.USA_PRIORITY_LEAGUES.indexOf(aLeague.id) : 99;
      const bPriority = bLeague ? this.USA_PRIORITY_LEAGUES.indexOf(bLeague.id) : 99;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return (a.date || 0) - (b.date || 0);
    };

    const eligible = matches.filter(m => {
      if (Utils.is24x7Channel(m)) return false;
      if (!m.popular) return false;
      if (m.date && m.date >= endOfTomorrowTs) return false;
      const league = Leagues.detectLeague(m);
      return league && this.USA_PRIORITY_LEAGUES.includes(league.id);
    });

    const byCategory = new Map();
    for (const m of eligible) {
      const cat = m.category || 'other';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat).push(m);
    }
    for (const pool of byCategory.values()) pool.sort(cmp);

    const cats = [...byCategory.keys()].sort((a, b) => {
      const aFirst = byCategory.get(a)[0];
      const bFirst = byCategory.get(b)[0];
      return cmp(aFirst, bFirst);
    });

    const LIMIT = 6;
    const CAP = 2;
    const result = [];
    const used = new Set();

    const pushMatch = (m) => {
      if (!m || used.has(m.id) || result.length >= LIMIT) return false;
      const cat = m.category || 'other';
      const catCount = result.filter(x => (x.category || 'other') === cat).length;
      if (catCount >= CAP) return false;
      result.push(m);
      used.add(m.id);
      return true;
    };

    const livePool = eligible
      .filter(m => Utils.isWithinLiveWindow(m))
      .sort(cmp);
    for (const m of livePool) {
      if (result.length >= LIMIT) break;
      pushMatch(m);
    }

    const pointers = Object.create(null);
    for (const cat of cats) pointers[cat] = 0;

    const hasStock = (cat, underCapOnly) => {
      if (pointers[cat] >= byCategory.get(cat).length) return false;
      const m = byCategory.get(cat)[pointers[cat]];
      if (used.has(m.id)) {
        pointers[cat] += 1;
        return hasStock(cat, underCapOnly);
      }
      if (underCapOnly) {
        const catCount = result.filter(x => (x.category || 'other') === cat).length;
        if (catCount >= CAP) return false;
      }
      return true;
    };

    while (result.length < LIMIT) {
      let nextCat = cats.find(c => hasStock(c, true));
      if (!nextCat) {
        nextCat = cats.find(c => hasStock(c, false));
      }
      if (!nextCat) break;
      const pool = byCategory.get(nextCat);
      const m = pool[pointers[nextCat]];
      pointers[nextCat] += 1;
      if (used.has(m.id)) continue;
      const mCat = m.category || 'other';
      const catCount = result.filter(x => (x.category || 'other') === mCat).length;
      if (catCount >= CAP) continue;
      result.push(m);
      used.add(m.id);
    }

    return result.sort(cmp).slice(0, LIMIT);
  },

  renderBrowseLeaguesGrid() {
    const section = Utils.el('div', { className: 'section container' });

    const header = Utils.el('div', { className: 'section-header' });
    header.appendChild(Utils.el('h2', { className: 'section-title', textContent: 'BROWSE BY LEAGUE' }));
    section.appendChild(header);

    const grid = Utils.el('div', { className: 'browse-leagues-grid' });
    const allLeagues = Leagues.data?.leagues || [];

    for (const leagueId of ['nfl', 'nba', 'mlb', 'nhl', 'ufc', 'mls', 'epl', 'ncaaf', 'f1']) {
      const league = allLeagues.find(l => l.id === leagueId);
      if (!league) continue;

      const tile = Utils.el('a', {
        className: 'league-tile',
        href: `#/league/${league.id}`
      });

      const imgContainer = Utils.el('div', { className: 'league-tile-img' });
      imgContainer.innerHTML = Utils.getLeagueImageHTML(league.id, league.name);
      tile.appendChild(imgContainer);

      tile.appendChild(Utils.el('div', { className: 'league-tile-name', textContent: league.name }));

      grid.appendChild(tile);
    }

    section.appendChild(grid);
    return section;
  },

  renderBigGamesSection(matches) {
    const section = Utils.el('div', { className: 'big-games-section' });

    const header = Utils.el('div', { className: 'section-header' });
    header.appendChild(Utils.el('h2', { className: 'section-title', textContent: 'BIG GAMES' }));
    section.appendChild(header);

    const grid = Utils.el('div', { className: 'big-games-grid' });
    for (const match of matches) {
      grid.appendChild(this.renderBigGameCard(match));
    }
    section.appendChild(grid);

    return section;
  },

  renderBigGameCard(match) {
    const status = Utils.getMatchStatus(match);
    const isLive = status.class === 'live-badge';
    const names = Leagues.getDisplayName(match);
    const league = Leagues.detectLeague(match);

    const card = Utils.el('div', {
      className: `big-game-card${isLive ? ' live' : ''}`,
      onclick: () => { window.location.hash = `#/match/${match.id}`; }
    });

    const meta = Utils.el('div', { className: 'big-game-meta' });
    if (league) {
      const leagueBadge = Utils.el('div', { className: 'big-game-league' });
      leagueBadge.innerHTML = Utils.getLeagueImageHTML(league.id, league.name);
      meta.appendChild(leagueBadge);
    } else {
      meta.appendChild(Utils.el('div', { className: 'big-game-league' }));
    }

    let badgeText = status.text;
    let badgeClass = status.class;
    let countdownTs = status.countdown;

    if (!isLive && status.class !== 'live-247-badge' && match.date) {
      const remaining = match.date - Date.now();
      if (remaining > 0) {
        badgeText = Utils.formatCountdown(remaining);
        badgeClass = remaining <= 30 * 60 * 1000 ? 'starting-soon-badge' : 'countdown-badge';
        countdownTs = match.date;
      } else if (Utils.isWithinLiveWindow(match)) {
        badgeText = 'LIVE';
        badgeClass = 'live-badge';
      }
    }

    const badge = Utils.el('span', {
      className: `big-game-badge ${badgeClass}`,
      textContent: badgeText
    });
    if (countdownTs && badgeClass !== 'live-badge' && badgeClass !== 'live-247-badge') {
      badge.setAttribute('data-countdown', String(countdownTs));
      badge.setAttribute('data-match-id', match.id);
      Utils.ensureCountdownTicker();
    }
    meta.appendChild(badge);
    card.appendChild(meta);

    const teamsEl = Utils.el('div', { className: 'big-game-teams' });
    if (names.hasBothTeams) {
      teamsEl.appendChild(Utils.el('div', { className: 'big-game-team', textContent: names.home }));
      teamsEl.appendChild(Utils.el('div', { className: 'big-game-vs', textContent: 'vs' }));
      teamsEl.appendChild(Utils.el('div', { className: 'big-game-team', textContent: names.away }));
    } else {
      teamsEl.appendChild(Utils.el('div', { className: 'big-game-team', textContent: names.home }));
    }
    card.appendChild(teamsEl);

    const footer = Utils.el('div', { className: 'big-game-footer' });
    const watchBtn = Utils.el('button', { className: 'big-game-watch-btn' });
    watchBtn.innerHTML = `<span class="play-icon">&#9654;</span> Watch`;
    footer.appendChild(watchBtn);
    card.appendChild(footer);

    return card;
  },

  createLeagueShelf() {
    const shelf = Utils.el('div', { className: 'league-shelf' });
    const inner = Utils.el('div', { className: 'league-shelf-inner' });

    const allChip = Utils.el('button', {
      className: 'chip active',
      textContent: 'All',
      'data-filter': 'all',
      onclick: () => this.filterByChip('all')
    });
    inner.appendChild(allChip);

    shelf.appendChild(inner);
    return shelf;
  },

  updateLeagueShelf(shelf, matches) {
    const inner = shelf.querySelector('.league-shelf-inner');
    inner.innerHTML = '';

    const allChip = Utils.el('button', {
      className: 'chip active',
      textContent: 'All',
      'data-filter': 'all',
      onclick: () => this.filterByChip('all')
    });
    inner.appendChild(allChip);

    const leagueCounts = {};
    let soccerCount = 0;
    let live247Count = 0;
    for (const m of matches) {
      if (Utils.is24x7Channel(m)) {
        live247Count++;
        continue;
      }
      const league = Leagues.detectLeague(m);
      if (league) {
        leagueCounts[league.id] = (leagueCounts[league.id] || 0) + 1;
      }
      if (m.category === 'football') {
        soccerCount++;
      }
    }

    const allLeagues = Leagues.data?.leagues || [];

    const chips = [];
    for (const leagueId of this.POPULAR_LEAGUES) {
      if (leagueId === 'soccer') {
        chips.push({
          id: 'soccer',
          name: 'Soccer',
          count: soccerCount,
          isSoccer: true
        });
        continue;
      }
      const league = allLeagues.find(l => l.id === leagueId);
      if (!league) continue;
      chips.push({
        id: leagueId,
        name: league.name,
        count: leagueCounts[leagueId] || 0,
        isSoccer: false
      });
    }

    const withMatches = chips.filter(c => c.count > 0);
    const noMatches = chips.filter(c => c.count === 0);

    const sorted = [...withMatches];

    if (live247Count > 0) {
      sorted.push({
        id: '247live',
        name: '24/7 Live',
        count: live247Count,
        is247: true
      });
    }

    sorted.push(...noMatches);

    for (const chip of sorted) {
      const el = Utils.el('button', {
        className: `chip${chip.count === 0 ? ' muted' : ''}`,
        'data-filter': chip.id,
        onclick: () => this.filterByChip(chip.id)
      });
      if (chip.is247) {
        const label = `24/7 Live (${chip.count})`;
        el.innerHTML = `<span class="league-emoji-fallback">\uD83D\uDCFA</span> ${label}`;
      } else if (chip.isSoccer) {
        const label = chip.count > 0 ? `Soccer (${chip.count})` : 'Soccer';
        el.innerHTML = `${Utils.getSportImageHTML('football')} ${label}`;
      } else {
        const label = chip.count > 0 ? `${chip.name} (${chip.count})` : chip.name;
        el.innerHTML = `${Utils.getLeagueImageHTML(chip.id, chip.name)} ${label}`;
      }
      inner.appendChild(el);
    }
  },

  filterByChip(leagueId) {
    document.querySelectorAll('.league-shelf .chip').forEach(c => c.classList.remove('active'));
    const activeChip = document.querySelector(`.chip[data-filter="${leagueId}"]`);
    if (activeChip) activeChip.classList.add('active');

    this._currentFilter = leagueId;

    if (leagueId === 'all') {
      this.renderHomepage();
    } else {
      this.renderFiltered(leagueId);
    }
  },

  renderHomepage() {
    const sectionsContainer = this.sectionsContainer;
    const { _allPopular: allPopular, _allMatches: allMatches } = this;
    const live = this.getEffectiveLive();

    sectionsContainer.innerHTML = '';

    if (live.length > 0) {
      sectionsContainer.appendChild(this.renderSection('LIVE NOW', live, { flat: true, forceLive: true }));
    }

    const startingSoon = this.getStartingSoon(allMatches);
    if (startingSoon.length > 0) {
      sectionsContainer.appendChild(this.renderSection('STARTING SOON', startingSoon, { flat: true, count: startingSoon.length, showLeague: true }));
    }
    const soonIds = new Set(startingSoon.map(m => m.id));
    const liveIds = new Set(live.map(m => m.id));

    const bigGames = this.getBigGames(allMatches);
    if (bigGames.length > 0) {
      sectionsContainer.appendChild(this.renderBigGamesSection(bigGames));
    }

    const upcomingPopular = allPopular.filter(m => Utils.isTodayOrTomorrow(m.date) && !soonIds.has(m.id) && !liveIds.has(m.id));
    if (upcomingPopular.length > 0) {
      sectionsContainer.appendChild(this.renderSection('POPULAR', upcomingPopular, { count: upcomingPopular.length }));
    }

    const otherMatches = allMatches.filter(m => !m.popular && !Utils.is24x7Channel(m) && Utils.isTodayOrTomorrow(m.date) && !soonIds.has(m.id) && !liveIds.has(m.id));
    if (otherMatches.length > 0) {
      sectionsContainer.appendChild(this.renderSection('OTHER MATCHES', otherMatches, { count: otherMatches.length }));
    }

    if (live.length === 0 && startingSoon.length === 0 && upcomingPopular.length === 0 && otherMatches.length === 0) {
      sectionsContainer.appendChild(this.renderBrowseLeaguesGrid());
    }
  },

  renderFiltered(leagueId) {
    const sectionsContainer = this.sectionsContainer;
    const { _allPopular: allPopular, _allMatches: allMatches } = this;
    const live = this.getEffectiveLive();

    const isSoccer = leagueId === 'soccer';

    const filterMatch = (m) => {
      if (Utils.is24x7Channel(m)) return leagueId === '247live';
      if (leagueId === '247live') return false;
      const league = Leagues.detectLeague(m);
      if (!league) return false;
      return isSoccer ? league.category === 'football' : league.id === leagueId;
    };

    const filteredLive = live.filter(filterMatch);
    const filteredAll = allMatches.filter(filterMatch);
    const filteredStartingSoon = leagueId === '247live'
      ? []
      : this.getStartingSoon(filteredAll);
    const soonIds = new Set(filteredStartingSoon.map(m => m.id));
    const filteredLiveIds = new Set(filteredLive.map(m => m.id));
    const filteredPopular = allPopular.filter(filterMatch).filter(m => !soonIds.has(m.id) && !filteredLiveIds.has(m.id));
    const filteredOther = leagueId === '247live'
      ? filteredAll
      : filteredAll.filter(m => !m.popular && !Utils.is24x7Channel(m) && !soonIds.has(m.id) && !filteredLiveIds.has(m.id));

    const leagueName = isSoccer ? 'Soccer' : (allPopular.find(m => {
      const l = Leagues.detectLeague(m);
      return l && (isSoccer ? l.category === 'football' : l.id === leagueId);
    }) ? (() => {
      const l = Leagues.data?.leagues?.find(l => l.id === leagueId);
      return l ? l.name : leagueId;
    })() : leagueId);

    sectionsContainer.innerHTML = '';

    if (filteredLive.length > 0) {
      sectionsContainer.appendChild(this.renderSection('LIVE NOW', filteredLive, { flat: true, forceLive: true }));
    }

    if (filteredStartingSoon.length > 0) {
      sectionsContainer.appendChild(this.renderSection('STARTING SOON', filteredStartingSoon, { flat: true, count: filteredStartingSoon.length, showLeague: true }));
    }

    if (filteredPopular.length > 0) {
      sectionsContainer.appendChild(this.renderSection(leagueName, filteredPopular, { flat: true, count: filteredPopular.length }));
    }

    if (filteredOther.length > 0) {
      sectionsContainer.appendChild(this.renderSection('OTHER MATCHES', filteredOther, { flat: true, count: filteredOther.length }));
    }

    if (filteredLive.length === 0 && filteredStartingSoon.length === 0 && filteredPopular.length === 0 && filteredOther.length === 0) {
      const empty = Utils.el('div', { className: 'section container' });
      empty.appendChild(Utils.el('p', {
        className: 'section-title',
        textContent: `No ${leagueName} matches available`,
        style: 'text-align:center;color:var(--text-muted);margin:32px 0'
      }));
      sectionsContainer.appendChild(empty);
    }
  },

  renderSection(title, matches, options = {}) {
    const section = Utils.el('div', { className: 'section' });

    const header = Utils.el('div', { className: 'section-header' });
    if (options.forceLive) {
      header.appendChild(Utils.el('div', { className: 'section-live-dot' }));
    }
    header.appendChild(Utils.el('h2', { className: 'section-title', textContent: title }));
    if (options.count !== undefined) {
      header.appendChild(Utils.el('span', { className: 'section-count', textContent: options.count }));
    } else if (options.flat) {
      const count = matches.filter(m => !Utils.is24x7Channel(m)).length;
      header.appendChild(Utils.el('span', { className: 'section-count', textContent: count }));
    }
    section.appendChild(header);

    const rowOptions = {};
    if (options.forceLive) rowOptions.forceLive = true;
    if (options.forceLive || options.showLeague) rowOptions.showLeague = true;

    if (options.flat) {
      for (const match of matches) {
        section.appendChild(Utils.renderMatchRow(match, rowOptions));
      }
    } else {
      const realMatches = matches.filter(m => !Utils.is24x7Channel(m));
      const channels247 = matches.filter(m => Utils.is24x7Channel(m));

      const grouped = Leagues.groupByLeague(realMatches);
      for (const group of grouped) {
        section.appendChild(this.renderLeagueGroup(group, false));
      }

      if (channels247.length > 0) {
        const grouped247 = Leagues.groupByLeague(channels247);
        for (const group of grouped247) {
          section.appendChild(this.renderLeagueGroup(group, true));
        }
      }
    }

    return section;
  },

  renderLeagueGroup(group, is247) {
    const groupEl = Utils.el('div', {
      className: 'league-group',
      'data-league': group.league.id,
      'data-category': group.league.category || '',
      'data-is247': is247 ? 'true' : 'false'
    });
    if (is247) {
      groupEl.style.display = 'none';
    }

    const header = Utils.el('div', {
      className: 'league-group-header',
      style: `border-left-color: ${Utils.getLeagueColor(group.league.id)}`
    });
    header.appendChild(Utils.el('span', { className: 'league-icon', innerHTML: Utils.getLeagueImageHTML(group.league.id, group.league.name, group.league.category) }));
    header.appendChild(Utils.el('span', { className: 'league-name', textContent: group.league.name }));
    header.appendChild(Utils.el('span', {
      className: 'league-count',
      textContent: `${group.matches.length} match${group.matches.length !== 1 ? 'es' : ''}`
    }));
    groupEl.appendChild(header);

    for (const match of group.matches) {
      groupEl.appendChild(Utils.renderMatchRow(match));
    }

    return groupEl;
  }
};
