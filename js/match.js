// Compatibility shim for visitors with a previously cached copy of the main site.
// The watch page itself now lives in the standalone stream repository and this
// file is no longer loaded by index.html.
const Match = {
  render(container, matchId) {
    window.location.replace(
      'https://wandasstuder.github.io/ssportsstreasma/#/match/' + encodeURIComponent(matchId)
    );
  }
};
