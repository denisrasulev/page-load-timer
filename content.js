(function() {
  // --- Constants ---
  const MAX_RETRIES = 20;
  const RETRY_INTERVAL_MS = 50;

  // Module-scoped vitals accumulator — observers populate this asynchronously
  const vitals = {};

  // Set up FCP observer immediately (document_start) to catch paint events
  try {
    const fcpObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          vitals.fcp = Math.round(entry.startTime);
        }
      }
    });
    fcpObserver.observe({ type: 'paint', buffered: true });
  } catch (e) { /* browser may not support paint observer */ }

  // Set up LCP observer immediately
  try {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      vitals.lcp = Math.round(lastEntry.startTime);
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

    setTimeout(collectWhenReady, 0);
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

  function getNavigationTiming(nav) {
    if (!nav) return null;
    return {
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
      loadComplete: Math.round(nav.loadEventEnd),
      domInteractive: Math.round(nav.domInteractive),
      dns: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
      tcp: Math.round(nav.connectEnd - nav.connectStart),
      ttfb: Math.round(nav.responseStart),
      // Timeline phases for the Load Timeline table
      timeline: [
        { phase: 'Redirect',  start: Math.round(nav.redirectStart),      end: Math.round(nav.redirectEnd) },
        { phase: 'DNS',       start: Math.round(nav.domainLookupStart),  end: Math.round(nav.domainLookupEnd) },
        { phase: 'Connect',   start: Math.round(nav.connectStart),       end: Math.round(nav.connectEnd) },
        { phase: 'Request',   start: Math.round(nav.requestStart),       end: Math.round(nav.responseStart) },
        { phase: 'Response',  start: Math.round(nav.responseStart),      end: Math.round(nav.responseEnd) },
        { phase: 'DOM',       start: Math.round(nav.responseEnd),        end: Math.round(nav.loadEventEnd) }
      ]
    };
  }

  function getResourceTiming() {
    return groupResources(performance.getEntriesByType('resource'));
  }
})();
