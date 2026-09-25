const Match = {
  currentStreamIndex: 0,
  streams: [],
  matchData: null,

  /**
   * Render the watch page
   */
  async render(container, matchId) {
    this.currentStreamIndex = 0;
    this.streams = [];
    this.matchData = null;
    container.innerHTML = '';

    const headerDiv = Utils.el('div', { className: 'watch-header' });
    const headerInner = Utils.el('div', { className: 'watch-header-inner container' });
    const backBtn = Utils.el('a', {
      className: 'back-btn',
      href: 'javascript:void(0)',
      innerHTML: '&#8592; Back',
      onclick: () => (typeof App !== 'undefined' && App.goBack ? App.goBack() : history.back())
    });
    headerInner.appendChild(backBtn);
    this.titleEl = Utils.el('h1', {
      className: 'watch-title',
      textContent: 'Loading...'
    });
    headerInner.appendChild(this.titleEl);
    headerDiv.appendChild(headerInner);
    container.appendChild(headerDiv);

    const playerWrapper = Utils.el('div', { className: 'player-wrapper' });
    const playerContainer = Utils.el('div', { className: 'player-container' });
    const loadingPlayer = Utils.el('div', {
      className: 'loading',
      style: 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);'
    });
    loadingPlayer.appendChild(Utils.el('div', { className: 'loading-spinner' }));
    playerContainer.appendChild(loadingPlayer);
    playerWrapper.appendChild(playerContainer);

    const adBanner = Utils.el('div', { className: 'ad-banner' });
    adBanner.innerHTML =
      '<a href="https://amzn.to/4hm3Obt" target="_blank" rel="sponsored noopener nofollow">' +
      '<img src="img/ads/tv-banner.webp" alt="Best TV deals on Amazon" width="700" height="180" loading="lazy">' +
      '</a>';
    container.appendChild(adBanner);

    container.appendChild(playerWrapper);

    this.playerContainer = playerContainer;

    const streamSelectorDiv = Utils.el('div', { className: 'stream-selector' });
    this.streamTabsEl = Utils.el('div', { className: 'stream-tabs' });
    streamSelectorDiv.appendChild(Utils.el('div', {
      className: 'stream-selector-title',
      textContent: 'STREAMS'
    }));
    streamSelectorDiv.appendChild(this.streamTabsEl);
    container.appendChild(streamSelectorDiv);

    const infoDiv = Utils.el('div', { className: 'match-info' });
    this.infoGridEl = Utils.el('div', { className: 'match-info-grid' });
    infoDiv.appendChild(this.infoGridEl);
    container.appendChild(infoDiv);

    const moreDiv = Utils.el('div', { className: 'more-matches' });
    this.moreMatchesEl = moreDiv;
    container.appendChild(moreDiv);

    try {
      await this.loadMatch(matchId);
    } catch (error) {
      container.innerHTML = '';
      container.appendChild(
        Utils.createError('Failed to load match data.', () => this.render(container, matchId))
      );
    }
  },

  /**
   * Load match data and streams
   */
  async loadMatch(matchId) {
    let match = null;

    const results = await Promise.allSettled([
      API.getTodayMatches(),
      API.getAllMatches()
    ]);

    if (results[0].status === 'fulfilled') {
      match = results[0].value.find(m => m.id === matchId);
    }
    if (!match && results[1].status === 'fulfilled') {
      match = results[1].value.find(m => m.id === matchId);
    }

    if (!match) {
      if (results[0].status === 'rejected' && results[1].status === 'rejected') {
        throw new Error('Could not load match data');
      }
      throw new Error('Match not found');
    }

    this.matchData = match;
    const names = Leagues.getDisplayName(match);
    this.titleEl.textContent = names.hasBothTeams
      ? `${names.home} vs ${names.away}`
      : names.home;

    this.renderInfo(match);

    if (match.sources && match.sources.length > 0) {
      await this.loadStreams(match);
    } else {
      this.streamTabsEl.appendChild(
        Utils.createEmpty('\u26A0\uFE0F', 'No streams available for this match')
      );
    }

    this.renderMoreMatches(match);
  },

  /**
   * Load streams from all sources
   */
  async loadStreams(match) {
    const streamPromises = match.sources.map(async (source) => {
      try {
        const streams = await API.getStreams(source.source, source.id);
        return streams || [];
      } catch (e) {
        return [];
      }
    });

    const results = await Promise.all(streamPromises);
    this.streams = results.flat();

    if (this.streams.length === 0) {
      this.streamTabsEl.appendChild(
        Utils.createEmpty('\u26A0\uFE0F', 'No streams available')
      );
      return;
    }

    this.renderStreamTabs();

    if (this.streams.length > 0) {
      this.loadStreamInPlayer(0);
    }
  },

  /**
   * Render stream selector tabs
   */
  renderStreamTabs() {
    this.streamTabsEl.innerHTML = '';

    this.streams.forEach((stream, index) => {
      const tab = Utils.el('button', {
        className: `stream-tab${index === this.currentStreamIndex ? ' active' : ''}`,
        onclick: () => this.selectStream(index)
      });

      const langSpan = Utils.el('span', {
        className: 'stream-tab-lang',
        textContent: stream.language || 'Unknown'
      });
      tab.appendChild(langSpan);

      const qualitySpan = Utils.el('span', {
        className: `stream-tab-quality ${stream.hd ? 'hd' : 'sd'}`,
        textContent: stream.hd ? 'HD' : 'SD'
      });
      tab.appendChild(qualitySpan);

      if (stream.viewers !== undefined) {
        const viewersSpan = Utils.el('span', {
          className: 'stream-tab-viewers',
          innerHTML: `&#128065; ${stream.viewers}`
        });
        tab.appendChild(viewersSpan);
      }

      this.streamTabsEl.appendChild(tab);
    });
  },

  /**
   * Select a stream tab
   */
  selectStream(index) {
    this.currentStreamIndex = index;

    document.querySelectorAll('.stream-tab').forEach((tab, i) => {
      tab.classList.toggle('active', i === index);
    });

    this.loadStreamInPlayer(index);
  },

  ensureEmbedPreconnect(embedUrl) {
    try {
      const origin = new URL(embedUrl, location.href).origin;
      if (!origin || origin === location.origin) return;
      if (document.querySelector(`link[data-hint-embed][href="${origin}"]`)) return;
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = origin;
      link.setAttribute('data-hint-embed', '');
      document.head.appendChild(link);
    } catch (e) { }
  },

  /**
   * Load stream into iframe player
   */
  loadStreamInPlayer(index) {
    const stream = this.streams[index];
    if (!stream || !stream.embedUrl) return;

    this.ensureEmbedPreconnect(stream.embedUrl);
    this.playerContainer.innerHTML = '';

    const iframe = document.createElement('iframe');
    iframe.src = stream.embedUrl;
    iframe.setAttribute('allowfullscreen', 'true');
    iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('loading', 'lazy');
    this.playerContainer.appendChild(iframe);
  },

  /**
   * Render match info grid
   */
  renderInfo(match) {
    this.infoGridEl.innerHTML = '';

    const league = Leagues.detectLeague(match);
    const status = Utils.getMatchStatus(match);
    const names = Leagues.getDisplayName(match);

    const fields = [
      { label: 'Category', value: Leagues.formatCategoryName(match.category) },
    ];

    if (league) {
      fields.push({ label: 'League', value: league.name });
    }

    if (match.date) {
      fields.push({ label: 'Date', value: Utils.formatDate(match.date) });
    }

    if (status.countdown) {
      const statusEl = Utils.el('div', { className: `info-value ${status.class}`, textContent: status.text });
      statusEl.setAttribute('data-countdown', String(status.countdown));
      statusEl.setAttribute('data-match-id', match.id);
      Utils.ensureCountdownTicker();
      fields.push({ label: 'Status', node: statusEl });
    } else {
      fields.push({ label: 'Status', value: status.text });
    }

    if (match.sources) {
      fields.push({ label: 'Sources', value: `${match.sources.length} available` });
    }

    if (this.streams.length > 0) {
      const totalViewers = this.streams.reduce((sum, s) => sum + (s.viewers || 0), 0);
      if (totalViewers > 0) {
        fields.push({ label: 'Viewers', value: totalViewers.toString() });
      }
    }

    for (const field of fields) {
      const item = Utils.el('div', { className: 'info-item' });
      item.appendChild(Utils.el('div', { className: 'info-label', textContent: field.label }));
      if (field.node) {
        item.appendChild(field.node);
      } else {
        item.appendChild(Utils.el('div', { className: 'info-value', textContent: field.value }));
      }
      this.infoGridEl.appendChild(item);
    }
  },

  /**
   * Render more matches from the same category/league
   */
  async renderMoreMatches(currentMatch) {
    try {
      const categoryMatches = await API.getMatchesBySport(currentMatch.category);
      const others = categoryMatches
        .filter(m => m.id !== currentMatch.id)
        .slice(0, 8);

      if (others.length === 0) return;

      this.moreMatchesEl.innerHTML = '';
      this.moreMatchesEl.appendChild(Utils.el('div', {
        className: 'more-matches-title',
        textContent: `More from ${Leagues.formatCategoryName(currentMatch.category)}`
      }));

      const grouped = Leagues.groupByLeague(others);
      for (const group of grouped) {
        const groupEl = Utils.el('div', { className: 'league-group' });
        const header = Utils.el('div', {
          className: 'league-group-header',
          style: `border-left-color: ${Utils.getLeagueColor(group.league.id)}`
        });
        const iconHTML = Utils.getLeagueImageHTML(group.league.id, group.league.name, group.league.category);
        header.appendChild(Utils.el('span', { className: 'league-icon', innerHTML: iconHTML }));
        header.appendChild(Utils.el('span', { className: 'league-name', textContent: group.league.name }));
        groupEl.appendChild(header);

        for (const match of group.matches) {
          groupEl.appendChild(Utils.renderMatchRow(match));
        }

        this.moreMatchesEl.appendChild(groupEl);
      }
    } catch (e) {
      // Silently fail for more matches section
    }
  }
};
