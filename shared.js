// --- Shared utilities used by content.js, collect.js and popup.js ---
// Wrapped in a run-once guard: background.js injects this file on demand into
// pages where the manifest content script may have already loaded it (same
// isolated world), and re-declaring top-level bindings would throw.
(function () {
  if (window.__pltSharedLoaded) return;
  window.__pltSharedLoaded = true;

  function cleanResourceName(url) {
    if (!url || typeof url !== 'string') return 'unknown';
    try {
      const parsed = new URL(url);
      const filename = parsed.pathname.split('/').pop();
      if (filename) return filename;
      // No filename (e.g. https://example.com/ or /api/data/) — show host + path
      const path = parsed.pathname.replace(/\/+$/, '');
      return parsed.hostname + (path || '/');
    } catch {
      // Fallback for non-standard URLs (data:, etc.)
      const name = url.split('/').pop() || url;
      return name.split('?')[0].split('#')[0] || name;
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

  const RE_FONT   = /\.(woff2?|ttf|otf|eot)(\?.*)?$/i;
  const RE_SCRIPT  = /\.(js|mjs)(\?.*)?$/i;
  const RE_STYLE   = /\.css(\?.*)?$/i;
  const RE_IMAGE   = /\.(png|jpe?g|gif|svg|webp|avif|ico|bmp)(\?.*)?$/i;

  // Must be >= TOP_RESOURCES_COUNT in popup.js
  const MAX_RESOURCES_PER_TYPE = 10;

  function groupResources(resources) {
    const grouped = {
      scripts: [],
      stylesheets: [],
      images: [],
      fonts: [],
      xhr: [],
      other: []
    };

    resources.forEach(resource => {
      // resource.name is the full URL from the Performance API
      const url = resource.name;
      const item = {
        name: cleanResourceName(url),
        url: url,
        duration: Math.round(resource.duration),
        // transferSize is 0 for cached responses and for cross-origin resources
        // without Timing-Allow-Origin; encodedBodySize recovers the cached case
        size: resource.transferSize || resource.encodedBodySize || 0,
        // transferSize 0 with a known body size = served from browser cache.
        // When both are 0 the size is hidden by CORS — cache state is unknown.
        cached: !resource.transferSize && (resource.encodedBodySize || 0) > 0,
        startTime: Math.round(resource.startTime)
      };

      // Extension-based checks first (most reliable — initiatorType can miss dynamically loaded resources)
      if (RE_FONT.test(url)) grouped.fonts.push(item);
      else if (RE_SCRIPT.test(url) || resource.initiatorType === 'script') grouped.scripts.push(item);
      else if (RE_STYLE.test(url) || resource.initiatorType === 'link' || resource.initiatorType === 'css') grouped.stylesheets.push(item);
      else if (RE_IMAGE.test(url) || resource.initiatorType === 'img') grouped.images.push(item);
      else if (resource.initiatorType === 'xmlhttprequest' || resource.initiatorType === 'fetch') grouped.xhr.push(item);
      else grouped.other.push(item);
    });

    // Keep only the slowest few per type: the popup shows the overall top 10,
    // which this always contains, and per-tab storage stays small on heavy pages
    Object.keys(grouped).forEach(key => {
      grouped[key] = grouped[key]
        .sort((a, b) => b.duration - a.duration)
        .slice(0, MAX_RESOURCES_PER_TYPE);
    });

    return grouped;
  }

  // --- Ignore list helpers ---

  // Turn whatever the user typed ("https://www.Example.com:8080/path", "*.example.com")
  // into a bare lowercase hostname without "www.". Returns '' for garbage input.
  function normalizeDomain(input) {
    if (typeof input !== 'string') return '';
    let value = input.trim().toLowerCase();
    if (!value) return '';
    value = value.replace(/^\*\./, '');
    let hostname = '';
    try {
      hostname = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(value) ? value : 'http://' + value).hostname;
    } catch {
      return '';
    }
    hostname = hostname.replace(/^www\./, '').replace(/\.$/, '');
    // Letters, digits, dots and hyphens only, with no empty labels
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(hostname)) return '';
    return hostname;
  }

  // "example.com" matches example.com, www.example.com and sub.example.com
  function isIgnoredDomain(hostname, list) {
    if (typeof hostname !== 'string' || !Array.isArray(list) || list.length === 0) return false;
    const host = hostname.toLowerCase().replace(/^www\./, '');
    if (!host) return false;
    return list.some((entry) => typeof entry === 'string' && entry !== '' &&
      (host === entry || host.endsWith('.' + entry)));
  }

  window.normalizeDomain = normalizeDomain;
  window.isIgnoredDomain = isIgnoredDomain;
  window.cleanResourceName = cleanResourceName;
  window.getNavigationTiming = getNavigationTiming;
  window.groupResources = groupResources;
})();
