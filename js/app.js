const App = {
  currentPage: null,
  currentRoute: null,
  navStack: [],

  TOP_NAV_ITEMS: [
    { id: 'nfl', label: 'NFL', href: '#/league/nfl' },
    { id: 'nba', label: 'NBA', href: '#/league/nba' },
    { id: 'mlb', label: 'MLB', href: '#/league/mlb' },
    { id: 'nhl', label: 'NHL', href: '#/league/nhl' },
    { id: 'ufc', label: 'UFC', href: '#/league/ufc' },
    { id: 'soccer', label: 'Soccer', href: '#/category/football' },
    { id: 'f1', label: 'F1', href: '#/league/f1' },
  ],

  SPORT_CATEGORIES: [
    { id: 'american-football', icon: '\uD83C\uDFC8', name: 'Football', image: 'img/sports/american-football.webp' },
    { id: 'basketball', icon: '\uD83C\uDFC0', name: 'Basketball', image: 'img/sports/basketball.webp' },
    { id: 'baseball', icon: '\u26BE', name: 'Baseball', image: 'img/sports/baseball.webp' },
    { id: 'hockey', icon: '\uD83C\uDFD2', name: 'Hockey', image: 'img/sports/hockey.webp' },
    { id: 'football', icon: '\u26BD', name: 'Soccer', image: 'img/sports/football.webp' },
    { id: 'fight', icon: '\uD83E\uDD4A', name: 'Fight', image: 'img/sports/fight.webp' },
    { id: 'motor-sports', icon: '\uD83C\uDFCE', name: 'Motor Sports', image: 'img/sports/motor-sports.webp' },
    { id: 'tennis', icon: '\uD83C\uDFBE', name: 'Tennis', image: 'img/sports/tennis.webp' },
    { id: 'golf', icon: '\u26F3', name: 'Golf', image: 'img/sports/golf.webp' },
  ],

  async init() {
    this.initImportantNotice();
    this.initDiscordInvite();
    const hash = window.location.hash || '#/';
    const leaguesPromise = Leagues.load();
    if ((hash === '#/' || hash === '#') && typeof Home !== 'undefined') {
      Home.preload();
    }
    await leaguesPromise;
    this.setupNavigation();
    this.setupKeyboardNav();
    if (typeof Search !== 'undefined') Search.init();
    this.handleRoute();

    window.addEventListener('hashchange', () => this.handleRoute());
    window.addEventListener('popstate', () => this.handleRoute());
  },

  DISCORD_GUILD_ID: '1422384816472457288',

  async initDiscordInvite() {
    const el = document.getElementById('discord-join-link');
    if (!el) return;

    const apply = (url) => {
      if (!url) return false;
      el.href = url;
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
      el.title = 'Join our Discord';
      el.classList.add('discord-ready');
      return true;
    };

    const CACHE_KEY = 'gk_discord_invite';
    const TTL = 15 * 60 * 1000;

    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached && cached.url && Date.now() - cached.time < TTL) {
          if (apply(cached.url)) return;
        }
      }
    } catch (e) { /* ignore cache errors */ }

    try {
      const response = await fetch(
        `https://discord.com/api/guilds/${this.DISCORD_GUILD_ID}/widget.json`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const url = data.instant_invite || null;
      if (apply(url)) {
        try {
          sessionStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ url, time: Date.now() })
          );
        } catch (e) { /* ignore quota */ }
      }
    } catch (e) {
      // Keep button inert if widget API fails
    }
  },

  initImportantNotice() {
    const el = document.getElementById('important-notice');
    const btn = document.getElementById('important-notice-close');
    if (!el) return;
    el.hidden = false;
    btn?.addEventListener('click', () => {
      el.hidden = true;
    });
    const reshow = () => {
      el.hidden = false;
    };
    window.addEventListener('hashchange', reshow);
    window.addEventListener('popstate', reshow);
  },

  goBack() {
    const current = window.location.hash || '#/';
    if (this.navStack.length > 0) {
      const prev = this.navStack[this.navStack.length - 1];
      if (prev && prev !== current) {
        window.location.hash = prev;
        return;
      }
    }
    if (window.history.length > 1) {
      window.history.back();
      setTimeout(() => {
        if ((window.location.hash || '#/') === current) {
          window.location.hash = '#/';
        }
      }, 200);
      return;
    }
    window.location.hash = '#/';
  },

  setupKeyboardNav() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (typeof Search !== 'undefined' && Search.isOpen && Search.isOpen()) {
          Search.close();
          return;
        }
        const hash = window.location.hash;
        if (hash && hash !== '#/' && hash !== '#') {
          this.goBack();
        }
      }
    });
  },

  async setupNavigation() {
    const sportsToggle = document.getElementById('sports-toggle');
    const sportsDropdown = document.getElementById('sports-dropdown');
    const sportsMenu = document.getElementById('sports-menu');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileNav = document.getElementById('mobile-nav');
    const mobileSportsList = document.getElementById('mobile-sports-list');

    sportsToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      sportsDropdown.classList.toggle('open');
    });

    document.addEventListener('click', () => {
      sportsDropdown.classList.remove('open');
    });

    sportsMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    mobileMenuBtn.addEventListener('click', () => {
      mobileMenuBtn.classList.toggle('open');
      mobileNav.classList.toggle('open');
    });

    this.populateLeagueNavLinks();
    this.populateLeaguesMenu(sportsMenu);
    this.populateMobileLeaguesList(mobileSportsList);
  },

  populateLeagueNavLinks() {
    const container = document.getElementById('league-nav-links');
    if (!container) return;
    container.innerHTML = '';

    for (const item of this.TOP_NAV_ITEMS) {
      const link = Utils.el('a', {
        className: 'league-nav-link',
        href: item.href
      });
      link.textContent = item.label;
      container.appendChild(link);
    }
  },

  populateLeaguesMenu(container) {
    container.innerHTML = '';

    for (const cat of this.SPORT_CATEGORIES) {
      const link = Utils.el('a', {
        className: 'dropdown-item',
        href: `#/category/${cat.id}`
      });
      link.innerHTML = `${Utils.getSportImageHTML(cat.id)} ${cat.name}`;
      link.addEventListener('click', () => {
        document.getElementById('sports-dropdown').classList.remove('open');
      });
      container.appendChild(link);
    }
  },

  populateMobileLeaguesList(container) {
    container.innerHTML = '';

    for (const item of this.TOP_NAV_ITEMS) {
      const link = Utils.el('a', {
        className: 'mobile-nav-link-league',
        href: item.href
      });
      link.textContent = item.label;
      link.addEventListener('click', () => {
        document.getElementById('mobile-menu-btn').classList.remove('open');
        document.getElementById('mobile-nav').classList.remove('open');
      });
      container.appendChild(link);
    }

    const divider = Utils.el('div', { className: 'mobile-nav-divider' });
    container.appendChild(divider);

    for (const cat of this.SPORT_CATEGORIES) {
      const link = Utils.el('a', {
        className: 'mobile-nav-link-league',
        href: `#/category/${cat.id}`
      });
      link.innerHTML = `${Utils.getSportImageHTML(cat.id)} ${cat.name}`;
      link.addEventListener('click', () => {
        document.getElementById('mobile-menu-btn').classList.remove('open');
        document.getElementById('mobile-nav').classList.remove('open');
      });
      container.appendChild(link);
    }
  },

  handleRoute() {
    const hash = window.location.hash || '#/';
    const app = document.getElementById('app');

    if (this.currentRoute && this.currentRoute !== hash) {
      const idx = this.navStack.lastIndexOf(hash);
      if (idx !== -1) {
        this.navStack.length = idx;
      } else {
        this.navStack.push(this.currentRoute);
      }
    }
    this.currentRoute = hash;

    window.scrollTo(0, 0);

    this.updateActiveNav(hash);

    if (hash === '#/' || hash === '#') {
      this.currentPage = 'home';
      Home.render(app);
    } else if (hash.startsWith('#/league/')) {
      const leagueId = hash.replace('#/league/', '');
      this.currentPage = `league-${leagueId}`;
      Category.render(app, null, leagueId);
    } else if (hash.startsWith('#/category/')) {
      const sport = hash.replace('#/category/', '');
      this.currentPage = `category-${sport}`;
      Category.render(app, sport, null);
    } else if (hash.startsWith('#/match/')) {
      const matchId = decodeURIComponent(hash.replace('#/match/', ''));
      this.currentPage = `match-${matchId}`;
      Match.render(app, matchId);
    } else {
      this.currentPage = 'home';
      Home.render(app);
    }
  },

  updateActiveNav(hash) {
    document.querySelectorAll('.league-nav-link').forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === hash);
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
