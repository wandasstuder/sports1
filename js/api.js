const API = {
  BASE_URL: 'https://streamed.pk/api',
  CACHE_TTL: 5 * 60 * 1000,
  SESSION_CACHE_TTL: 30 * 60 * 1000,
  MAX_CACHE_ENTRIES: 50,
  _cache: {},

  /**
   * Fetch with caching. Pass { fresh: true } to bypass cache read.
   */
  async fetch(endpoint, { fresh = false } = {}) {
    const cacheKey = endpoint;
    const cached = this._cache[cacheKey];

    if (!fresh && cached && Date.now() - cached.time < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      const response = await fetch(`${this.BASE_URL}${endpoint}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      this._cache[cacheKey] = { data, time: Date.now() };

      // Evict oldest entries if cache exceeds limit
      const keys = Object.keys(this._cache);
      if (keys.length > this.MAX_CACHE_ENTRIES) {
        const oldest = keys.sort((a, b) => this._cache[a].time - this._cache[b].time)[0];
        delete this._cache[oldest];
      }

      try {
        sessionStorage.setItem(`ds_cache_${cacheKey}`, JSON.stringify({ data, time: Date.now() }));
      } catch (e) { }

      return data;
    } catch (error) {
      try {
        const stored = sessionStorage.getItem(`ds_cache_${cacheKey}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Date.now() - parsed.time < this.SESSION_CACHE_TTL) {
            return parsed.data;
          }
        }
      } catch (e) { }

      throw error;
    }
  },

  /**
   * Get all sports categories
   */
  async getSports() {
    return this.fetch('/sports');
  },

  /**
   * Get all matches
   */
  async getAllMatches() {
    return this.fetch('/matches/all');
  },

  /**
   * Get today's matches
   */
  async getTodayMatches() {
    return this.fetch('/matches/all-today');
  },

  /**
   * Get live matches. Pass { fresh: true } to bypass cache read.
   */
  async getLiveMatches(opts) {
    return this.fetch('/matches/live', opts);
  },

  /**
   * Get popular matches
   */
  async getPopularMatches() {
    return this.fetch('/matches/all/popular');
  },

  /**
   * Get matches by sport category
   */
  async getMatchesBySport(sport) {
    return this.fetch(`/matches/${sport}`);
  },

  /**
   * Get popular matches by sport category
   */
  async getPopularBySport(sport) {
    return this.fetch(`/matches/${sport}/popular`);
  },

  /**
   * Get streams for a specific source
   */
  async getStreams(source, id) {
    return this.fetch(`/stream/${source}/${id}`);
  },

  /**
   * Clear cache (optional, for manual refresh)
   */
  clearCache() {
    this._cache = {};
    try {
      Object.keys(sessionStorage).forEach(key => {
        if (key.startsWith('ds_cache_')) {
          sessionStorage.removeItem(key);
        }
      });
    } catch (e) { }
  }
};
