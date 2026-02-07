function getBadgeColor(loadTimeMs) {
  if (loadTimeMs <= 1000) return '#4CAF50';  // Green: fast
  if (loadTimeMs <= 3000) return '#FF9800';  // Orange: moderate
  return '#F44336';                           // Red: slow
}

function collectPerfFromPage() {
  const [nav] = performance.getEntriesByType('navigation');
  if (!nav || nav.loadEventEnd === 0) return null;

  const resources = performance.getEntriesByType('resource');
  const grouped = { scripts: [], stylesheets: [], images: [], fonts: [], xhr: [], other: [] };

  resources.forEach(r => {
    const item = {
      name: r.name.split('/').pop() || r.name,
      url: r.name,
      duration: Math.round(r.duration),
      size: r.transferSize || 0,
      startTime: Math.round(r.startTime)
    };
    if (r.name.match(/\.(woff2?|ttf|otf|eot)(\?.*)?$/i)) grouped.fonts.push(item);
    else if (r.initiatorType === 'script') grouped.scripts.push(item);
    else if (r.initiatorType === 'link' || r.initiatorType === 'css') grouped.stylesheets.push(item);
    else if (r.initiatorType === 'img') grouped.images.push(item);
    else if (r.initiatorType === 'xmlhttprequest' || r.initiatorType === 'fetch') grouped.xhr.push(item);
    else grouped.other.push(item);
  });
  Object.keys(grouped).forEach(k => grouped[k].sort((a, b) => b.duration - a.duration));

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
    vitals: {},
    resources: grouped
  };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // On-demand collection triggered by popup
  if (request.action === 'collectNow' && request.tabId) {
    chrome.scripting.executeScript({
      target: { tabId: request.tabId },
      func: collectPerfFromPage
    }).then((results) => {
      const perfData = results && results[0] && results[0].result;
      if (perfData) {
        chrome.storage.local.set({ ['perf_' + request.tabId]: perfData });

        if (perfData.navigation && perfData.navigation.loadComplete != null) {
          const secs = perfData.navigation.loadComplete / 1000;
          let badgeText;
          if (secs < 10) {
            badgeText = secs.toFixed(2);
          } else {
            badgeText = Math.round(secs).toString();
          }
          chrome.action.setBadgeText({ text: badgeText, tabId: request.tabId });
          chrome.action.setBadgeBackgroundColor({
            color: getBadgeColor(perfData.navigation.loadComplete),
            tabId: request.tabId
          });
        }

        sendResponse({ success: true, perfData: perfData });
      } else {
        sendResponse({ success: false });
      }
    }).catch(() => {
      sendResponse({ success: false });
    });
    return true;
  }

  // Data sent from content script
  if (request.action === 'perfData' && request.perfData && sender.tab && sender.tab.id) {
    const tabId = sender.tab.id;
    const perfData = request.perfData;

    // Store per tab
    chrome.storage.local.set({ ['perf_' + tabId]: perfData });

    // Update badge
    if (perfData.navigation && perfData.navigation.loadComplete != null) {
      const secs = perfData.navigation.loadComplete / 1000;
      let badgeText;
      if (secs < 10) {
        badgeText = secs.toFixed(2);              // "0.66", "1.16", "9.99"
      } else {
        badgeText = Math.round(secs).toString();  // "10", "120"
      }

      chrome.action.setBadgeText({ text: badgeText, tabId: tabId });
      chrome.action.setBadgeBackgroundColor({
        color: getBadgeColor(perfData.navigation.loadComplete),
        tabId: tabId
      });
    }

    sendResponse({ success: true });
  } else {
    sendResponse({ success: false });
  }
  return true;
});

// Clean up stored data when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove('perf_' + tabId);
});
