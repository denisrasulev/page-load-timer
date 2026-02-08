// On-demand performance collection — injected into the page by background.js
// Depends on shared.js (groupResources, cleanResourceName) being loaded first
(function() {
  const nav = performance.getEntriesByType('navigation')[0];
  if (!nav || nav.loadEventEnd === 0) return null;

  // Collect FCP and LCP vitals
  const vitals = {};
  try {
    const paintEntries = performance.getEntriesByType('paint');
    for (const entry of paintEntries) {
      if (entry.name === 'first-contentful-paint') {
        vitals.fcp = Math.round(entry.startTime);
      }
    }
  } catch (e) { /* paint entries may not be available */ }

  try {
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
    if (lcpEntries && lcpEntries.length > 0) {
      vitals.lcp = Math.round(lcpEntries[lcpEntries.length - 1].startTime);
    }
  } catch (e) { /* LCP entries may not be available */ }

  // Collect resources
  const grouped = groupResources(performance.getEntriesByType('resource'));

  return {
    url: window.location.href,
    timestamp: new Date().toISOString(),
    navigation: {
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
      loadComplete: Math.round(nav.loadEventEnd),
      domInteractive: Math.round(nav.domInteractive),
      dns: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
      tcp: Math.round(nav.connectEnd - nav.connectStart),
      ttfb: Math.round(nav.responseStart),
      timeline: [
        { phase: 'Redirect',  start: Math.round(nav.redirectStart),     end: Math.round(nav.redirectEnd) },
        { phase: 'DNS',       start: Math.round(nav.domainLookupStart), end: Math.round(nav.domainLookupEnd) },
        { phase: 'Connect',   start: Math.round(nav.connectStart),      end: Math.round(nav.connectEnd) },
        { phase: 'Request',   start: Math.round(nav.requestStart),      end: Math.round(nav.responseStart) },
        { phase: 'Response',  start: Math.round(nav.responseStart),     end: Math.round(nav.responseEnd) },
        { phase: 'DOM',       start: Math.round(nav.responseEnd),       end: Math.round(nav.loadEventEnd) }
      ]
    },
    vitals: vitals,
    resources: grouped
  };
})();
