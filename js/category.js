const Category = {
  currentSport: null,
  currentLeagueId: null,
  currentFilter: 'all',
  currentMatches: null,
  contentEl: null,

  /**
   * Render the category or league page
   * @param {HTMLElement} container
   * @param {string|null} sport - Sport category slug (e.g. 'american-football')
   * @param {string|null} leagueId - Specific league id (e.g. 'nfl')
   */
  async render(container, sport, leagueId) {
    // Determine sport from league if not provided
    if (leagueId && !sport) {
      const league = Leagues.data?.leagues?.find(l => l.id === leagueId);
      if (league) sport = league.category;
    }

    this.currentSport = sport;
    this.currentLeagueId = leagueId;
    this.currentFilter = leagueId || 'all';
    container.innerHTML = '';

    // Determine display info
    const league = leagueId ? Leagues.data?.leagues?.find(l => l.id === leagueId) : null;
    const sportCat = App.SPORT_CATEGORIES?.find(c => c.id === sport);
    const pageTitle = league ? league.name : (sportCat ? sportCat.name : Leagues.formatCategoryName(sport));
    const pageIcon = league
      ? Utils.getLeagueImageHTML(league.id, league.name)
      : (sportCat ? Utils.getSportImageHTML(sport) : '');

    // Header
    const headerDiv = Utils.el('div', { className: 'category-header container' });

    const titleRow = Utils.el('div', { className: 'category-title-row' });
    const backBtn = Utils.el('a', {
      className: 'back-btn',
      href: 'javascript:void(0)',
      innerHTML: '&#8592; Back',
      onclick: () => (typeof App !== 'undefined' && App.goBack ? App.goBack() : history.back())
    });
    titleRow.appendChild(backBtn);

    const titleEl = Utils.el('h1', { className: 'category-title' });
    if (pageIcon) {
      titleEl.innerHTML = `${pageIcon} ${pageTitle}`;
    } else {
      titleEl.textContent = pageTitle;
    }
    titleRow.appendChild(titleEl);
    headerDiv.appendChild(titleRow);

    // Filter bar
    const filterBar = Utils.el('div', { className: 'filter-bar' });
    const filterInner = Utils.el('div', { className: 'filter-bar-inner' });
    filterInner.appendChild(this.createFilterChip('all', 'All'));
    filterInner.appendChild(this.createFilterChip('live', '\uD83D\uDD34 Live'));
    filterInner.appendChild(this.createFilterChip('today', '\uD83D\uDCC5 Today'));
    filterInner.appendChild(this.createFilterChip('popular', '\u2B50 Popular'));
    filterBar.appendChild(filterInner);
    headerDiv.appendChild(filterBar);
    container.appendChild(headerDiv);

    // Content area
    const contentDiv = Utils.el('div', { className: 'container' });
    this.contentEl = contentDiv;
    const loadingEl = Utils.createLoading('Loading matches...');
    contentDiv.appendChild(loadingEl);
    container.appendChild(contentDiv);

    try {
      const [allMatches, popularMatches] = await Promise.all([
        API.getMatchesBySport(sport),
        API.getPopularBySport(sport)
      ]);

      const merged = this.mergeMatches(allMatches, popularMatches);

      // Add league filter chips for this sport category
      const leaguesInCategory = Leagues.getLeaguesForCategory(sport);
      const leagueCounts = {};
      let live247Count = 0;
      for (const m of merged) {
        if (Utils.is24x7Channel(m)) {
          live247Count++;
          continue;
        }
        const lg = Leagues.detectLeague(m);
        const lid = lg ? lg.id : null;
        if (lid) {
          leagueCounts[lid] = (leagueCounts[lid] || 0) + 1;
        }
      }

      const withMatches = [];
      const noMatches = [];
      for (const lg of leaguesInCategory) {
        const count = leagueCounts[lg.id] || 0;
        if (count > 0) {
          withMatches.push({ league: lg, count });
        } else {
          noMatches.push({ league: lg, count });
        }
      }

      for (const { league: lg, count } of withMatches) {
        const chip = this.createFilterChip(lg.id, null);
        const iconHTML = Utils.getLeagueImageHTML(lg.id, lg.name);
        const label = `${lg.name} (${count})`;
        chip.innerHTML = `${iconHTML} ${label}`;
        filterInner.appendChild(chip);
      }

      if (live247Count > 0) {
        const chip = this.createFilterChip('247tv', null);
        chip.innerHTML = `<span class="league-emoji-fallback">\uD83D\uDCFA</span> 24/7 TV (${live247Count})`;
        filterInner.appendChild(chip);
      }

      const otherCount = merged.filter(m => !Utils.is24x7Channel(m) && !Leagues.detectLeague(m)).length;
      if (otherCount > 0) {
        const otherChip = this.createFilterChip('other', `\uD83C\uDFC6 Other (${otherCount})`);
        filterInner.appendChild(otherChip);
      }

      for (const { league: lg } of noMatches) {
        const chip = this.createFilterChip(lg.id, null);
        const iconHTML = Utils.getLeagueImageHTML(lg.id, lg.name);
        chip.innerHTML = `${iconHTML} ${lg.name}`;
        chip.classList.add('muted');
        filterInner.appendChild(chip);
      }

      contentDiv.innerHTML = '';

      if (merged.length === 0) {
        contentDiv.appendChild(
          Utils.createEmpty('\uD83C\uDFC6', `No matches found for ${pageTitle}`)
        );
        return;
      }

      this.currentMatches = merged;
      try {
        this.renderFiltered(contentDiv, merged);
      } catch (e) {
        console.error('Error rendering filtered matches:', e);
        contentDiv.innerHTML = '';
        contentDiv.appendChild(
          Utils.createError('Error displaying matches.', () => this.render(container, sport, leagueId))
        );
      }
    } catch (error) {
      contentDiv.innerHTML = '';
      contentDiv.appendChild(
        Utils.createError('Failed to load matches.', () => this.render(container, sport, leagueId))
      );
    }
  },

  mergeMatches(all, popular) {
    const map = new Map();
    for (const m of all || []) map.set(m.id, m);
    for (const m of popular || []) {
      if (!map.has(m.id)) map.set(m.id, m);
      else map.get(m.id).popular = true;
    }
    return Array.from(map.values());
  },

  createFilterChip(id, label) {
    const chip = Utils.el('button', {
      className: `chip${this.currentFilter === id ? ' active' : ''}`,
      'data-filter': id,
      onclick: () => this.applyFilter(id)
    });
    if (label !== null) {
      chip.textContent = label;
    }
    return chip;
  },

  applyFilter(filterId) {
    this.currentFilter = filterId;

    document.querySelectorAll('.filter-bar .chip').forEach(c => c.classList.remove('active'));
    const active = document.querySelector(`.chip[data-filter="${filterId}"]`);
    if (active) active.classList.add('active');

    if (this.currentMatches && this.contentEl) {
      this.renderFiltered(this.contentEl, this.currentMatches);
    }
  },

  renderFiltered(container, matches) {
    let filtered = matches;

    if (this.currentFilter === 'live') {
      filtered = matches.filter(m => Utils.isLive(m));
    } else if (this.currentFilter === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      filtered = matches.filter(m => {
        if (!m.date || Utils.is24x7Channel(m)) return false;
        return m.date >= today.getTime() && m.date < tomorrow.getTime();
      });
    } else if (this.currentFilter === 'popular') {
      filtered = matches.filter(m => m.popular && !Utils.is24x7Channel(m));
    } else if (this.currentFilter === '247tv') {
      filtered = matches.filter(m => Utils.is24x7Channel(m));
    } else if (this.currentFilter === 'other') {
      filtered = matches.filter(m => !Utils.is24x7Channel(m) && !Leagues.detectLeague(m));
    } else if (this.currentFilter !== 'all') {
      // League-specific filter
      filtered = matches.filter(m => {
        if (Utils.is24x7Channel(m)) return false;
        const league = Leagues.detectLeague(m);
        return league && league.id === this.currentFilter;
      });
    } else {
      // 'all' filter — exclude 24/7 channels
      filtered = matches.filter(m => !Utils.is24x7Channel(m));
    }

    const existingGroups = container.querySelectorAll('.league-group, .empty-state');
    existingGroups.forEach(el => el.remove());

    if (filtered.length === 0) {
      container.appendChild(
        Utils.createEmpty('\uD83D\uDD0D', 'No matches found for this filter')
      );
      return;
    }

    const grouped = Leagues.groupByLeague(filtered);
    for (const group of grouped) {
      container.appendChild(this.renderLeagueGroup(group));
    }
  },

  renderLeagueGroup(group) {
    const groupEl = Utils.el('div', {
      className: 'league-group',
      'data-league': group.league.id
    });

    const header = Utils.el('div', {
      className: 'league-group-header',
      style: `border-left-color: ${Utils.getLeagueColor(group.league.id)}`
    });
    const iconHTML = Utils.getLeagueImageHTML(group.league.id, group.league.name, group.league.category);
    header.appendChild(Utils.el('span', { className: 'league-icon', innerHTML: iconHTML }));
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
