// --- Shared utilities used by content.js, background.js and popup.js ---

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
      size: resource.transferSize || 0,
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

  Object.keys(grouped).forEach(key => {
    grouped[key].sort((a, b) => b.duration - a.duration);
  });

  return grouped;
}
