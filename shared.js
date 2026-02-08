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

    // Font check first (most specific — based on file extension)
    if (url.match(/\.(woff2?|ttf|otf|eot)(\?.*)?$/i)) grouped.fonts.push(item);
    else if (resource.initiatorType === 'script') grouped.scripts.push(item);
    else if (resource.initiatorType === 'link' || resource.initiatorType === 'css') grouped.stylesheets.push(item);
    else if (resource.initiatorType === 'img') grouped.images.push(item);
    else if (resource.initiatorType === 'xmlhttprequest' || resource.initiatorType === 'fetch') grouped.xhr.push(item);
    else grouped.other.push(item);
  });

  Object.keys(grouped).forEach(key => {
    grouped[key].sort((a, b) => b.duration - a.duration);
  });

  return grouped;
}
