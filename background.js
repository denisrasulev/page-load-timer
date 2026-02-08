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
    // Inject shared utilities and collector as files to avoid func: serialization issues
    chrome.scripting.executeScript({
      target: { tabId: request.tabId },
      files: ['shared.js', 'collect.js']
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
