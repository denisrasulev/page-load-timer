(function() {
  // --- Constants ---
  const MAX_RETRIES = 20;
  const RETRY_INTERVAL_MS = 50;

  // Module-scoped vitals accumulator — observers populate this asynchronously
  const vitals = {};

  // Raise the resource timing buffer above the ~250-entry browser default so
  // heavy pages don't silently drop entries before we collect them
  try {
    performance.setResourceTimingBufferSize(2000);
  } catch (e) { /* older browsers may not support this */ }

  // Observers start immediately (document_start can't wait for the async settings
  // read), so they are kept here to be shut down if this domain is ignored
  let fcpObserver = null;
  let lcpObserver = null;

  // Resolves true when the user's ignore list covers this page's host. Anything
  // that goes wrong reading settings counts as "not ignored".
  const ignoredCheck = new Promise((resolve) => {
    try {
      chrome.storage.local.get(['settings'], (result) => {
        const list = result && result.settings && result.settings.ignoredDomains;
        const ignored = typeof isIgnoredDomain === 'function' &&
          isIgnoredDomain(window.location.hostname, list);
        if (ignored) {
          if (fcpObserver) fcpObserver.disconnect();
          if (lcpObserver) lcpObserver.disconnect();
          delete window.__plt_vitals_c9e2;
        }
        resolve(!!ignored);
      });
    } catch (e) {
      resolve(false);
    }
  });

  // Set up FCP observer immediately (document_start) to catch paint events
  try {
    fcpObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          vitals.fcp = Math.round(entry.startTime);
          window.__plt_vitals_c9e2 = { ...vitals };
        }
      }
    });
    fcpObserver.observe({ type: 'paint', buffered: true });
  } catch (e) { /* browser may not support paint observer */ }

  // Set up LCP observer immediately
  try {
    lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      if (entries.length === 0) return;
      const lastEntry = entries[entries.length - 1];
      vitals.lcp = Math.round(lastEntry.startTime);
      window.__plt_vitals_c9e2 = { ...vitals };
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) { /* browser may not support LCP observer */ }

  window.addEventListener('load', () => {
    let retries = 0;

    function collectWhenReady() {
      const [nav] = performance.getEntriesByType('navigation');
      if (nav && nav.loadEventEnd > 0) {
        collectPerfData(nav);
      } else if (retries < MAX_RETRIES) {
        retries++;
        setTimeout(collectWhenReady, RETRY_INTERVAL_MS);
      } else {
        console.warn('Page Load Timer: gave up waiting for navigation timing after', MAX_RETRIES, 'retries');
      }
    }

    // Never measure or send anything for an ignored domain
    ignoredCheck.then((ignored) => {
      if (ignored) return;
      setTimeout(collectWhenReady, 0);
    });
  });

  function collectPerfData(nav) {
    const perfData = {
      url: window.location.href,
      timestamp: new Date().toISOString(),
      navigation: getNavigationTiming(nav),
      vitals: { ...vitals },
      resources: getResourceTiming()
    };

    // Send data to background script which stores it per tab ID and updates badge
    try {
      chrome.runtime.sendMessage(
        {
          action: 'perfData',
          perfData: perfData
        },
        () => {
          if (chrome.runtime.lastError) {
            console.warn('Failed to send perf data:', chrome.runtime.lastError.message);
          }
        }
      );
    } catch (e) {
      console.warn('Could not send message to background:', e.message);
    }
  }

  // getNavigationTiming is provided by shared.js

  function getResourceTiming() {
    return groupResources(performance.getEntriesByType('resource'));
  }
})();
