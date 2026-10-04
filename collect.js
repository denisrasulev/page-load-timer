// On-demand performance collection — injected into the page by background.js
// Depends on shared.js (getNavigationTiming, groupResources) being loaded first
(function() {
  if (typeof getNavigationTiming !== 'function' || typeof groupResources !== 'function') {
    console.warn('Page Load Timer: shared.js not loaded — cannot collect performance data');
    return null;
  }

  const nav = performance.getEntriesByType('navigation')[0];
  if (!nav || nav.loadEventEnd === 0) return null;

  // Prefer vitals cached by the content script's PerformanceObservers (LCP is
  // only available via observer; paint entries may also be unavailable after the fact).
  // Fall back to getEntriesByType for FCP in case the content script didn't run.
  // Validate types defensively: the cache may come from an older extension version.
  const raw = window.__plt_vitals_c9e2;
  const cached = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const vitals = {};

  if (typeof cached.fcp === 'number' && isFinite(cached.fcp) && cached.fcp >= 0) {
    vitals.fcp = cached.fcp;
  } else {
    try {
      const paintEntries = performance.getEntriesByType('paint');
      for (const entry of paintEntries) {
        if (entry.name === 'first-contentful-paint') {
          vitals.fcp = Math.round(entry.startTime);
        }
      }
    } catch (e) { /* paint entries may not be available */ }
  }

  // getNavigationTiming and groupResources provided by shared.js
  function build() {
    return {
      url: window.location.href,
      timestamp: new Date().toISOString(),
      navigation: getNavigationTiming(nav),
      vitals: vitals,
      resources: groupResources(performance.getEntriesByType('resource'))
    };
  }

  if (typeof cached.lcp === 'number' && isFinite(cached.lcp) && cached.lcp >= 0) {
    vitals.lcp = cached.lcp;
    return build();
  }

  // No cached LCP (tab was open before the extension loaded, so no observer ran
  // during the load). The browser still buffers LCP entries: ask for them and
  // wait briefly, since buffered entries are delivered asynchronously.
  // executeScript waits for a returned promise to settle.
  const LCP_WAIT_MS = 200;
  return new Promise((resolve) => {
    let observer = null;
    let timer = null;
    let done = false;

    function finish(lcp) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (observer) observer.disconnect();
      if (typeof lcp === 'number') vitals.lcp = lcp;
      resolve(build());
    }

    try {
      observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length > 0) finish(Math.round(entries[entries.length - 1].startTime));
      });
      observer.observe({ type: 'largest-contentful-paint', buffered: true });
      timer = setTimeout(() => finish(), LCP_WAIT_MS);
    } catch (e) {
      finish(); // LCP observer not supported
    }
  });
})();
