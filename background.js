// --- Constants ---
const BADGE_FAST_MS = 1000;
const BADGE_MODERATE_MS = 3000;
const BADGE_COLOR_FAST = '#4CAF50';
const BADGE_COLOR_MODERATE = '#FF9800';
const BADGE_COLOR_SLOW = '#F44336';

function getBadgeColor(loadTimeMs) {
  if (loadTimeMs <= BADGE_FAST_MS) return BADGE_COLOR_FAST;
  if (loadTimeMs <= BADGE_MODERATE_MS) return BADGE_COLOR_MODERATE;
  return BADGE_COLOR_SLOW;
}

function collectPerfFromPage() {
  const [nav] = performance.getEntriesByType('navigation');
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
}

function updateBadge(perfData, tabId) {
  if (!perfData.navigation || perfData.navigation.loadComplete == null) return;

  chrome.storage.local.get(['settings'], (result) => {
    const settings = result.settings || { showBadge: true };
    if (!settings.showBadge) {
      chrome.action.setBadgeText({ text: '', tabId: tabId });
      return;
    }

    const secs = perfData.navigation.loadComplete / 1000;
    const badgeText = secs < 10 ? secs.toFixed(2) : Math.round(secs).toString();
    chrome.action.setBadgeText({ text: badgeText, tabId: tabId });
    chrome.action.setBadgeBackgroundColor({
      color: getBadgeColor(perfData.navigation.loadComplete),
      tabId: tabId
    });
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // On-demand collection triggered by popup
  if (request.action === 'collectNow' && request.tabId) {
    // Inject shared utilities first, then run the collection function
    chrome.scripting.executeScript({
      target: { tabId: request.tabId },
      files: ['shared.js']
    }).then(() => {
      return chrome.scripting.executeScript({
        target: { tabId: request.tabId },
        func: collectPerfFromPage
      });
    }).then((results) => {
      const perfData = results && results[0] && results[0].result;
      if (perfData) {
        chrome.storage.local.set({ ['perf_' + request.tabId]: perfData });
        updateBadge(perfData, request.tabId);
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
    chrome.storage.local.set({ ['perf_' + tabId]: perfData });
    updateBadge(perfData, tabId);
    sendResponse({ success: true });
    return true;
  }

  // Badge setting changed from popup
  if (request.action === 'badgeSettingChanged' && request.tabId != null) {
    if (!request.showBadge) {
      chrome.action.setBadgeText({ text: '', tabId: request.tabId });
    } else {
      // Re-apply badge from stored data
      chrome.storage.local.get(['perf_' + request.tabId], (result) => {
        const perfData = result['perf_' + request.tabId];
        if (perfData) {
          updateBadge(perfData, request.tabId);
        }
      });
    }
    return false;
  }

  // Unknown message — don't call sendResponse
  return false;
});

// Clean up stored data when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove('perf_' + tabId);
});
