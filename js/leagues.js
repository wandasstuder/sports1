const Leagues = {
  data: null,

  /**
   * Load leagues data from JSON file
   */
  async load() {
    if (this.data) return this.data;
    try {
      const response = await fetch('data/leagues.json');
      this.data = await response.json();
      return this.data;
    } catch (error) {
      console.error('Failed to load leagues data:', error);
      this.data = { leagues: [] };
      return this.data;
    }
  },

  /**
   * Normalize team name for matching
   */
  normalizeTeamName(name) {
    if (!name) return '';
    return name.toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/['']/g, "'")
      .trim();
  },

  /**
   * Check if a team name matches any team in a league
   * Returns true if the league contains a matching team
   */
  teamMatchesLeague(teamName, league) {
    if (!teamName || !league.teams || league.teams.length === 0) return false;
    const normalized = this.normalizeTeamName(teamName);

    for (const leagueTeam of league.teams) {
      const normalizedLeague = this.normalizeTeamName(leagueTeam);
      if (normalized === normalizedLeague) return true;
      if (normalized.includes(normalizedLeague) || normalizedLeague.includes(normalized)) return true;
    }
    return false;
  },

  /**
   * Detect which league a match belongs to
   * Rules:
   * 1. Team-based detection (highest confidence) - both teams must match same league, same category
   * 2. Keyword-based detection (lower confidence) - only within same category
   * 3. Single-team + keyword fallback
   * Returns the league object or null
   */
  detectLeague(match) {
    if (!this.data || !this.data.leagues) return null;

    const leagues = this.data.leagues;
    const title = (match.title || '').toLowerCase();
    const homeName = match.teams?.home?.name || '';
    const awayName = match.teams?.away?.name || '';
    const hasBothTeams = homeName && awayName;

    // Pass 1: Team-based detection (highest confidence)
    // If both team names exist, find leagues in the same category where both teams belong
    if (hasBothTeams) {
      for (const league of leagues) {
        if (match.category !== league.category) continue;
        const homeMatch = this.teamMatchesLeague(homeName, league);
        const awayMatch = this.teamMatchesLeague(awayName, league);
        if (homeMatch && awayMatch) {
          return league;
        }
      }
    }

    // Pass 2: Keyword-based detection (only within same category)
    for (const league of leagues) {
      if (match.category !== league.category) continue;
      if (!league.keywords || league.keywords.length === 0) continue;
      for (const keyword of league.keywords) {
        if (title.includes(keyword.toLowerCase())) {
          return league;
        }
      }
    }

    // Pass 3: Single-team + keyword fallback across all leagues in same category
    if (homeName || awayName) {
      const teamName = homeName || awayName;
      for (const league of leagues) {
        if (match.category !== league.category) continue;
        if (this.teamMatchesLeague(teamName, league)) {
          return league;
        }
      }
    }

    return null;
  },

  /**
   * Check if match is a women's match
   */
  isWomensMatch(match, league) {
    if (league && league.isWomensLeague) return true;

    const id = (match.id || '').toLowerCase();
    if (id.includes('women') || id.includes('ncaa-women') || id.includes('wnba')) return true;

    const homeName = match.teams?.home?.name || '';
    const awayName = match.teams?.away?.name || '';

    if (homeName && awayName) {
      const homeIsW = /\sW$/i.test(homeName.trim());
      const awayIsW = /\sW$/i.test(awayName.trim());
      if (homeIsW && awayIsW) return true;
    }

    return false;
  },

  /**
   * Get display name for a match
   * If teams exist, show "Home vs Away"
   * If no teams, show match title
   */
  getDisplayName(match) {
    const homeName = match.teams?.home?.name || '';
    const awayName = match.teams?.away?.name || '';

    if (homeName && awayName) {
      return { home: homeName, away: awayName, hasBothTeams: true };
    }

    if (homeName) {
      return { home: homeName, away: '', hasBothTeams: false };
    }

    return { home: match.title || 'TBD', away: '', hasBothTeams: false };
  },

  /**
   * Group matches by league
   * Returns array of { league, matches } objects
   */
  groupByLeague(matches) {
    const groups = {};
    const order = [];

    for (const match of matches) {
      const league = this.detectLeague(match);
      const leagueId = league ? league.id : `other_${match.category}`;
      const leagueName = league ? league.name : this.formatCategoryName(match.category);

      if (!groups[leagueId]) {
        groups[leagueId] = {
          league: league || { id: leagueId, name: leagueName, category: match.category },
          matches: []
        };
        order.push(leagueId);
      }

      groups[leagueId].matches.push(match);
    }

    const result = order.map(id => groups[id]);

    result.sort((a, b) => {
      const priorityA = a.league.priority || 100;
      const priorityB = b.league.priority || 100;
      return priorityA - priorityB;
    });

    return result;
  },

  /**
   * Format category name for display
   */
  formatCategoryName(category) {
    if (!category) return 'Other';
    return category
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  },

  /**
   * Get leagues for a specific category
   */
  getLeaguesForCategory(category) {
    if (!this.data || !this.data.leagues) return [];
    return this.data.leagues.filter(l => l.category === category);
  },

  /**
   * Get all unique league filter chips for a set of matches
   * Returns array of { id, name, icon, count }
   */
  getLeagueFilters(matches) {
    const counts = {};

    for (const match of matches) {
      const league = this.detectLeague(match);
      const id = league ? league.id : `other_${match.category}`;
      const name = league ? league.name : this.formatCategoryName(match.category);
      const icon = league ? Utils.getLeagueIcon(league.id) : '\uD83C\uDFC6';

      if (!counts[id]) {
        counts[id] = { id, name, icon, count: 0 };
      }
      counts[id].count++;
    }

    const filters = Object.values(counts);
    filters.sort((a, b) => b.count - a.count);
    return filters;
  }
};
