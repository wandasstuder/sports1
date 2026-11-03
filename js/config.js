/**
 * Cross-site configuration.
 * The main site links every match to the standalone stream site.
 * The stream site links its navigation back to the main site.
 */
const SiteConfig = {
  mainSite: 'https://gkstreams.shop',
  streamSite: 'https://wandasstuder.github.io/ssportsstreasma/',
  isStreamSite: false,

  /**
   * Build a link to a page on the main site.
   * On the main site this is a local hash link; on the stream site it is absolute.
   */
  mainHash(path) {
    const hash = '#' + path;
    return this.isStreamSite ? this.mainSite + '/' + hash : hash;
  },

  /**
   * Build a link to the watch page.
   * On the main site this points at the stream repo; on the stream site it stays local.
   */
  matchUrl(matchId) {
    const hash = '#/match/' + encodeURIComponent(matchId);
    return this.isStreamSite ? hash : this.streamSite + hash;
  }
};
