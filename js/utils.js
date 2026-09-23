const Utils = {
  /**
   * Check if a match is a 24/7 TV channel
   * 24/7 channels have date values of 0, -60000, or -3600000
   * The oldest real match date is 1480651200000 (Dec 2016)
   * Using 86400000 (1 day in ms) as a safe threshold
   */
  is24x7Channel(match) {
    return match.date !== undefined && match.date !== null && match.date < 86400000;
  },

  /**
   * Calendar-day difference in the browser's local timezone
   * 0 = today, 1 = tomorrow, -1 = yesterday
   */
  calendarDayDiff(timestamp) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTarget = new Date(timestamp);
    startOfTarget.setHours(0, 0, 0, 0);
    return Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86400000);
  },

  /**
   * Format Unix timestamp (ms) to readable date string
   */
  formatDate(timestamp) {
    if (timestamp < 86400000) return 'Always Available';
    if (!timestamp) return '';
    const d = new Date(timestamp);
    const diffDays = this.calendarDayDiff(timestamp);

    const timeStr = d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    if (diffDays === 0) return `Today, ${timeStr}`;
    if (diffDays === 1) return `Tomorrow, ${timeStr}`;
    if (diffDays === -1) return `Yesterday, ${timeStr}`;

    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  },

  /**
   * Format timestamp to short time only
   */
  formatTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  },

  /**
   * Check if a match date is today or tomorrow (or 24/7/no date)
   * Includes matches that started earlier today (calendar day -0) and live-window leftovers
   */
  isTodayOrTomorrow(timestamp) {
    if (!timestamp || timestamp < 86400000) return true;
    const diffDays = this.calendarDayDiff(timestamp);
    if (diffDays >= 0 && diffDays <= 1) return true;
    if (diffDays === -1 && this.isWithinLiveWindow({ date: timestamp })) return true;
    return false;
  },

  /**
   * Get short date string for tomorrow+ matches (null for today/live/24/7)
   */
  getRelativeDate(timestamp) {
    if (!timestamp || timestamp < 86400000) return null;
    const diffDays = this.calendarDayDiff(timestamp);
    if (diffDays <= 0) return null;
    if (diffDays === 1) return 'Tomorrow';
    return new Date(timestamp).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  },

  /**
   * Format remaining milliseconds as countdown
   * Under 1 hour: m:ss · Under 1 day: h:mm:ss · Else: Nd Nh
   */
  formatCountdown(ms) {
    if (ms <= 0) return '0:00';
    const totalSec = Math.ceil(ms / 1000);
    if (totalSec >= 86400) {
      const d = Math.floor(totalSec / 86400);
      const h = Math.floor((totalSec % 86400) / 3600);
      return h > 0 ? `${d}d ${h}h` : `${d}d`;
    }
    if (totalSec >= 3600) {
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  },

  LIVE_WINDOW_MS: {
    baseball: 5 * 60 * 60 * 1000,
    football: 4 * 60 * 60 * 1000,
    basketball: 3 * 60 * 60 * 1000,
    hockey: 3 * 60 * 60 * 1000,
    soccer: 3 * 60 * 60 * 1000,
    default: 3.5 * 60 * 60 * 1000
  },

  /**
   * True if match has started and is still within expected duration
   */
  isWithinLiveWindow(match) {
    if (!match || Utils.is24x7Channel(match) || !match.date) return false;
    const now = Date.now();
    if (now < match.date) return false;
    const windowMs = Utils.LIVE_WINDOW_MS[match.category] || Utils.LIVE_WINDOW_MS.default;
    return now - match.date <= windowMs;
  },

  /**
   * Get match status info
   */
  getMatchStatus(match) {
    if (Utils.is24x7Channel(match)) return { text: '24/7 LIVE', class: 'live-247-badge' };
    if (!match.date) return { text: 'TBD', class: 'time-badge' };

    const now = Date.now();
    const matchTime = match.date;
    const thirtyMin = 30 * 60 * 1000;

    if (Utils.isWithinLiveWindow(match)) {
      return { text: 'LIVE', class: 'live-badge' };
    }

    if (now > matchTime - thirtyMin && now < matchTime) {
      return {
        text: Utils.formatCountdown(matchTime - now),
        class: 'starting-soon-badge',
        countdown: matchTime
      };
    }

    return { text: Utils.formatTime(matchTime), class: 'time-badge' };
  },

  _countdownTimer: null,

  ensureCountdownTicker() {
    if (this._countdownTimer) return;
    this._countdownTimer = setInterval(() => {
      const els = document.querySelectorAll('[data-countdown]');
      if (els.length === 0) {
        clearInterval(this._countdownTimer);
        this._countdownTimer = null;
        return;
      }
      const now = Date.now();
      els.forEach(el => {
        const target = Number(el.getAttribute('data-countdown'));
        const remaining = target - now;
        const span = el.querySelector('span') || el;
        if (remaining <= 0) {
          el.classList.remove('starting-soon-badge', 'countdown-badge');
          el.classList.add('live-badge');
          const expiredMatchId = el.getAttribute('data-match-id');
          el.removeAttribute('data-countdown');
          el.removeAttribute('data-match-id');
          span.textContent = 'LIVE';
          const statusEl = el.closest('.big-game-badge') || el.closest('.big-game-status') || el.closest('.match-status');
          if (statusEl && statusEl !== el) {
            statusEl.classList.remove('starting-soon-badge', 'countdown-badge', 'time-badge');
            statusEl.classList.add('live-badge');
          }
          const card = el.closest('.big-game-card');
          if (card) card.classList.add('live');
          const row = el.closest('.match-row');
          if (row) row.classList.add('live');
          if (expiredMatchId && typeof Home !== 'undefined' && Home._onCountdownExpired) {
            Home._onCountdownExpired(expiredMatchId);
          }
        } else {
          span.textContent = Utils.formatCountdown(remaining);
        }
      });
    }, 1000);
  },

  /**
   * Check if match is live
   */
  isLive(match) {
    return Utils.is24x7Channel(match) || Utils.isWithinLiveWindow(match);
  },

  /**
   * Create DOM element with attributes and children
   */
  el(tag, attrs = {}, children = []) {
    const element = document.createElement(tag);

    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'className') {
        element.className = value;
      } else if (key === 'textContent') {
        element.textContent = value;
      } else if (key === 'innerHTML') {
        element.innerHTML = value;
      } else if (key === 'onclick') {
        element.addEventListener('click', value);
      } else if (key === 'href') {
        element.href = value;
      } else if (key.startsWith('data-')) {
        element.setAttribute(key, value);
      } else {
        element.setAttribute(key, value);
      }
    }

    for (const child of children) {
      if (typeof child === 'string') {
        element.appendChild(document.createTextNode(child));
      } else if (child) {
        element.appendChild(child);
      }
    }

    return element;
  },

  /**
   * Create loading spinner
   */
  createLoading(text = 'Loading...') {
    const container = Utils.el('div', { className: 'loading' });
    const spinner = Utils.el('div', { className: 'loading-spinner' });
    const span = Utils.el('span', { textContent: text });
    container.appendChild(spinner);
    container.appendChild(span);
    return container;
  },

  /**
   * Create skeleton loader rows
   */
  createSkeletonRows(count = 5) {
    const container = Utils.el('div');
    for (let i = 0; i < count; i++) {
      const row = Utils.el('div', { className: 'skeleton skeleton-row' });
      container.appendChild(row);
    }
    return container;
  },

  /**
   * Create error state
   */
  createError(message, onRetry) {
    const container = Utils.el('div', { className: 'error' });
    const text = Utils.el('p', { className: 'error-text', textContent: message });
    container.appendChild(text);

    if (onRetry) {
      const btn = Utils.el('button', {
        className: 'retry-btn',
        textContent: 'Retry',
        onclick: onRetry
      });
      container.appendChild(btn);
    }

    return container;
  },

  /**
   * Create empty state
   */
  createEmpty(icon, message) {
    const container = Utils.el('div', { className: 'empty-state' });
    const iconEl = Utils.el('div', { className: 'empty-state-icon', textContent: icon });
    const textEl = Utils.el('div', { className: 'empty-state-text', textContent: message });
    container.appendChild(iconEl);
    container.appendChild(textEl);
    return container;
  },

  /**
   * Render a match row (shared across all pages)
   */
  renderMatchRow(match, options = {}) {
    let status = Utils.getMatchStatus(match);
    let isLive = status.class === 'live-badge';
    const is247 = status.class === 'live-247-badge';
    const names = Leagues.getDisplayName(match);

    if (options.forceLive && !is247) {
      status = { text: 'LIVE', class: 'live-badge' };
      isLive = true;
    }

    const row = Utils.el('div', {
      className: `match-row${isLive ? ' live' : ''}${is247 ? ' live-247' : ''}`,
      onclick: () => { window.location.hash = `#/match/${match.id}`; }
    });

    const statusEl = Utils.el('div', {
      className: `match-status ${status.class}`
    });
    statusEl.appendChild(Utils.el('span', { textContent: status.text }));
    if (status.countdown) {
      statusEl.setAttribute('data-countdown', String(status.countdown));
      statusEl.setAttribute('data-match-id', match.id);
      this.ensureCountdownTicker();
    }
    if (!status.countdown) {
      const dateText = this.getRelativeDate(match.date);
      if (dateText) {
        statusEl.appendChild(Utils.el('span', { className: 'match-date', textContent: dateText }));
      }
    }
    if (options.showLeague) {
      const league = Leagues.detectLeague(match);
      const label = league ? league.name
        : (match.category ? Leagues.formatCategoryName(match.category) : null);
      if (label) {
        statusEl.appendChild(Utils.el('span', { className: 'match-league', textContent: label }));
      }
    }
    row.appendChild(statusEl);

    if (names.hasBothTeams) {
      row.appendChild(Utils.el('div', {
        className: 'match-team home',
        textContent: names.home
      }));
      row.appendChild(Utils.el('div', {
        className: 'match-vs',
        textContent: 'vs'
      }));
      row.appendChild(Utils.el('div', {
        className: 'match-team away',
        textContent: names.away
      }));
    } else {
      row.appendChild(Utils.el('div', {
        className: 'match-team no-teams',
        textContent: names.home
      }));
    }

    const actionEl = Utils.el('div', { className: 'match-action' });
    const watchBtn = Utils.el('button', { className: 'watch-btn' });
    watchBtn.innerHTML = `<span class="play-icon">&#9654;</span> Watch`;
    actionEl.appendChild(watchBtn);
    row.appendChild(actionEl);

    return row;
  },

  /**
   * Get league icon emoji
   */
  getLeagueIcon(leagueId) {
    const icons = {
      nfl: '\uD83C\uDFC8',
      ncaaf: '\uD83C\uDFC8',
      nba: '\uD83C\uDFC0',
      wnba: '\uD83C\uDFC0',
      ncaab: '\uD83C\uDFC0',
      mlb: '\u26BE',
      nhl: '\uD83C\uDFD2',
      ufc: '\uD83E\uDD4A',
      boxing: '\uD83E\uDD4A',
      epl: '\u26BD',
      ucl: '\u26BD',
      mls: '\u26BD',
      nwsl: '\u26BD',
      laliga: '\u26BD',
      bundesliga: '\u26BD',
      seriea: '\u26BD',
      ligue1: '\u26BD',
      f1: '\uD83C\uDFCE',
      nascar: '\uD83C\uDFCE',
      motogp: '\uD83C\uDFCE',
      cricket: '\uD83C\uDFCF',
      tennis: '\uD83C\uDFBE',
      golf: '\u26F3',
      rugby: '\uD83C\uDFC9',
      afl: '\uD83C\uDFC8',
      darts: '\uD83C\uDFAF',
      billiards: '\uD83C\uDFB1'
    };
    return icons[leagueId] || '\uD83C\uDFC6';
  },

  /**
   * Get league accent color
   */
  getLeagueColor(leagueId) {
    const colors = {
      nfl: '#013369',
      ncaaf: '#003366',
      nba: '#1d428a',
      wnba: '#f57c00',
      ncaab: '#004d40',
      mlb: '#002d72',
      nhl: '#000000',
      ufc: '#d20a0a',
      boxing: '#8b0000',
      epl: '#3d195b',
      ucl: '#091c3e',
      mls: '#1a1a1a',
      nwsl: '#4a148c',
      laliga: '#ff6600',
      bundesliga: '#d20515',
      seriea: '#024494',
      ligue1: '#091c3e',
      f1: '#e10600',
      nascar: '#1a1a1a',
      motogp: '#be0000',
      cricket: '#006633',
      tennis: '#4caf50',
      golf: '#1b5e20',
      rugby: '#8b0000',
      afl: '#003366',
      darts: '#b71c1c',
      billiards: '#1a1a1a'
    };
    return colors[leagueId] || '#555555';
  },

  /**
   * Get league image HTML (img tag if available, emoji fallback)
   */
  getLeagueImageHTML(leagueId, leagueName, category) {
    const league = Leagues.data?.leagues?.find(l => l.id === leagueId);
    if (league && league.image) {
      return `<img src="${league.image}" alt="${leagueName || leagueId}" class="league-img" width="24" height="24" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='inline'"><span class="league-emoji-fallback" style="display:none">${this.getLeagueIcon(leagueId)}</span>`;
    }
    const sportCat = category || (league && league.category);
    if (sportCat && ((typeof App !== 'undefined' && App.SPORT_CATEGORIES) || []).some(c => c.id === sportCat)) {
      return this.getSportImageHTML(sportCat);
    }
    return `<span class="league-emoji-fallback">${this.getLeagueIcon(leagueId)}</span>`;
  },

  /**
   * Get sport category image HTML (img if available, emoji fallback)
   */
  getSportImageHTML(categoryId) {
    const cat = ((typeof App !== 'undefined' && App.SPORT_CATEGORIES) || [])
      .find(c => c.id === categoryId);
    if (cat && cat.image) {
      return `<img src="${cat.image}" alt="${cat.name}" class="sport-img" width="24" height="24" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='inline'"><span class="league-emoji-fallback" style="display:none">${cat.icon}</span>`;
    }
    if (cat) {
      return `<span class="league-emoji-fallback">${cat.icon}</span>`;
    }
    return `<span class="league-emoji-fallback">\uD83C\uDFC6</span>`;
  },

  /**
   * Debounce function
   */
  debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }
};
