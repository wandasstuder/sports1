const API = {
  BASE_URL: 'https://api.reedstreams.link/api',
  BASE_URLS: [
    'https://api.reedstreams.link/api',
    'https://reedstreams.to/api',
    'https://reedstreams.st/api'
  ],
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

    let lastError;

    for (const base of this.BASE_URLS) {
      try {
        const response = await fetch(`${base}${endpoint}`);
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
        lastError = error;
      }
    }

    try {
      const stored = sessionStorage.getItem(`ds_cache_${cacheKey}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Date.now() - parsed.time < this.SESSION_CACHE_TTL) {
          return parsed.data;
        }
      }
    } catch (e) { }

    throw lastError || new Error('API request failed');
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
  async getAllMatches(opts) {
    return this.fetch('/matches/all', opts);
  },

  /**
   * Get today's matches (derived from the full Reedstreams feed)
   */
  async getTodayMatches(opts) {
    const all = await this.getAllMatches(opts);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return all.filter(m => m.date >= start.getTime() && m.date < end.getTime());
  },

  /**
   * Check whether a match is currently live.
   */
  isLiveMatch(match) {
    if (!match || !match.date) return false;
    const now = Date.now();
    const end = Number(match.ends_at) || match.date + 4 * 60 * 60 * 1000;
    return now >= match.date && now < end;
  },

  /**
   * Get live matches. Pass { fresh: true } to bypass cache read.
   */
  async getLiveMatches(opts) {
    const all = await this.getAllMatches(opts);
    return all.filter(m => this.isLiveMatch(m));
  },

  /**
   * Get popular matches
   */
  async getPopularMatches(opts) {
    const all = await this.getAllMatches(opts);
    return all.filter(m => m.popular);
  },

  /**
   * Get matches by sport category
   */
  async getMatchesBySport(sport, opts) {
    return this.fetch(`/matches/${sport}`, opts);
  },

  /**
   * Get popular matches by sport category
   */
  async getPopularBySport(sport) {
    const matches = await this.getMatchesBySport(sport);
    return matches.filter(m => m.popular);
  },

  /**
   * Get streams for a specific source.
   * Reedstreams returns an object (streams/mainStreams/extraStreams),
   * while Streamed returned an array. Normalise both and remove duplicates.
   */
  async getStreams(source, id) {
    const data = await this.fetch(
      `/stream/${encodeURIComponent(source)}/${encodeURIComponent(id)}`
    );

    const list = Array.isArray(data)
      ? data
      : (Array.isArray(data.streams) && data.streams.length
          ? data.streams
          : [...(data.mainStreams || []), ...(data.extraStreams || [])]);

    const seen = new Set();

    return list.filter(stream => {
      if (!stream || !stream.embedUrl) return false;
      const key = stream.identityKey || stream.embedUrl;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
