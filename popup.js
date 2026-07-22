// --- Constants ---
const SLOW_RESOURCE_THRESHOLD_MS = 500;
const RESOURCE_NAME_MAX_LENGTH = 35;
const TOP_RESOURCES_COUNT = 10;

const BADGE_CLASS_ALLOWLIST = new Set(['js', 'css', 'img', 'xhr', 'font', 'other']);
const TYPE_TO_BADGE = {
  scripts:     { cls: 'js',    text: 'JS' },
  stylesheets: { cls: 'css',   text: 'CSS' },
  images:      { cls: 'img',   text: 'IMG' },
  xhr:         { cls: 'xhr',   text: 'XHR' },
  fonts:       { cls: 'font',  text: 'FONT' },
  other:       { cls: 'other', text: 'OTHER' }
};

// --- Helpers ---

// Thousands separator follows the browser UI locale (1,843 / 1 843 / 1.843)
function formatMs(value) {
  if (typeof value !== 'number' || isNaN(value)) return '--';
  return Math.round(value).toLocaleString() + ' ms';
}

// Metric cards are narrow — switch to seconds at >= 10 s so 5-digit
// values like "14,267 ms" don't wrap to a second line
function formatCardMs(value) {
  if (typeof value !== 'number' || isNaN(value)) return '--';
  if (value >= 10000) {
    return (value / 1000).toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }) + ' s';
  }
  return formatMs(value);
}

function formatBytes(bytes) {
  if (typeof bytes !== 'number' || !isFinite(bytes) || bytes <= 0) return 'n/a';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// --- Empty state ---

function showEmptyState() {
  document.getElementById('load-time').textContent = '--';
  document.getElementById('fcp-time').textContent = '--';
  document.getElementById('lcp-time').textContent = '--';
  document.getElementById('ttfb-time').textContent = '--';
  document.getElementById('dcl-time').textContent = '--';
  document.getElementById('timeline-body').textContent = '';
  document.getElementById('resources-body').textContent = '';
}

// --- Settings defaults ---
const THEME_OPTIONS = ['auto', 'light', 'dark'];
const DENSITY_OPTIONS = ['roomy', 'default', 'compact'];
const DEFAULT_SETTINGS = { showBadge: true, theme: 'auto', density: 'default', showTimeline: true, showResources: true };

// Read-modify-write helper — not truly atomic, but sufficient for sequential UI interactions
function updateSetting(key, value) {
  chrome.storage.local.get(['settings'], (result) => {
    const settings = { ...DEFAULT_SETTINGS, ...result.settings, [key]: value };
    chrome.storage.local.set({ settings });
  });
}

// --- Init ---

document.addEventListener('DOMContentLoaded', () => {
  const mainView = document.getElementById('main-view');
  const settingsView = document.getElementById('settings-view');
  const settingsBtn = document.getElementById('settings-btn');
  const settingsBack = document.getElementById('settings-back');
  const badgeToggle = document.getElementById('badge-toggle');
  const themeSelect = document.getElementById('theme-select');
  const densitySelect = document.getElementById('density-select');
  const timelineToggle = document.getElementById('timeline-toggle');
  const resourcesToggle = document.getElementById('resources-toggle');
  const timelineSection = document.getElementById('timeline-section');
  const resourcesSection = document.getElementById('resources-section');

  function applyTheme(theme) {
    const root = document.documentElement;
    root.classList.remove('theme-auto', 'theme-light', 'theme-dark');
    if (THEME_OPTIONS.includes(theme)) {
      root.classList.add('theme-' + theme);
    } else {
      root.classList.add('theme-auto');
    }
  }

  function applyDensity(density) {
    document.body.classList.remove('density-roomy', 'density-default', 'density-compact');
    if (DENSITY_OPTIONS.includes(density)) {
      document.body.classList.add('density-' + density);
    } else {
      document.body.classList.add('density-default');
    }
  }

  // Load settings and set toggle/radio state
  chrome.storage.local.get(['settings'], (result) => {
    const settings = result.settings || DEFAULT_SETTINGS;
    badgeToggle.checked = settings.showBadge !== false;
    const theme = THEME_OPTIONS.includes(settings.theme) ? settings.theme : 'auto';
    themeSelect.value = theme;
    applyTheme(theme);
    const density = DENSITY_OPTIONS.includes(settings.density) ? settings.density : 'default';
    densitySelect.value = density;
    applyDensity(density);
    timelineToggle.checked = settings.showTimeline !== false;
    resourcesToggle.checked = settings.showResources !== false;
    timelineSection.classList.toggle('section-hidden', settings.showTimeline === false);
    resourcesSection.classList.toggle('section-hidden', settings.showResources === false);
  });

  // Settings view switching
  settingsBtn.addEventListener('click', () => {
    mainView.classList.add('view-hidden');
    settingsView.classList.remove('view-hidden');
  });

  settingsBack.addEventListener('click', () => {
    settingsView.classList.add('view-hidden');
    mainView.classList.remove('view-hidden');
  });

  // Badge toggle handler
  badgeToggle.addEventListener('change', () => {
    const showBadge = badgeToggle.checked;
    updateSetting('showBadge', showBadge);

    // Tell background to update/clear badge for current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        chrome.runtime.sendMessage({
          action: 'badgeSettingChanged',
          tabId: tabs[0].id,
          showBadge: showBadge
        });
      }
    });
  });

  // Theme selector handler
  themeSelect.addEventListener('change', () => {
    const theme = themeSelect.value;
    applyTheme(theme);
    updateSetting('theme', theme);
  });

  // Density selector handler
  densitySelect.addEventListener('change', () => {
    const density = densitySelect.value;
    applyDensity(density);
    updateSetting('density', density);
  });

  // Section toggle helper
  function sectionToggleHandler(toggle, section, settingKey) {
    toggle.addEventListener('change', () => {
      const show = toggle.checked;
      section.classList.toggle('section-hidden', !show);
      updateSetting(settingKey, show);
    });
  }

  sectionToggleHandler(timelineToggle, timelineSection, 'showTimeline');
  sectionToggleHandler(resourcesToggle, resourcesSection, 'showResources');

  // Load perf data
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) {
      showEmptyState();
      return;
    }

    const tabId = tabs[0].id;
    chrome.storage.local.get(['perf_' + tabId], (result) => {
      const data = result['perf_' + tabId];

      if (!data) {
        // Try on-demand collection for already-loaded tabs
        chrome.runtime.sendMessage({ action: 'collectNow', tabId: tabId }, (response) => {
          if (chrome.runtime.lastError || !response || !response.success) {
            showEmptyState();
            return;
          }
          renderData(response.perfData);
        });
        return;
      }

      renderData(data);
    });
  });
});

// --- Render ---

function renderData(data) {
  try {
    const navigation = data && data.navigation ? data.navigation : null;
    const vitals = data && data.vitals ? data.vitals : null;
    const loadComplete = navigation && typeof navigation.loadComplete === 'number' ? navigation.loadComplete : null;
    const fcp = vitals && typeof vitals.fcp === 'number' ? vitals.fcp : null;
    const lcp = vitals && typeof vitals.lcp === 'number' ? vitals.lcp : null;
    const ttfb = navigation && typeof navigation.ttfb === 'number' ? navigation.ttfb : null;
    const dcl = navigation && typeof navigation.domContentLoaded === 'number' ? navigation.domContentLoaded : null;

    // Update metric cards
    document.getElementById('load-time').textContent = formatCardMs(loadComplete);
    document.getElementById('fcp-time').textContent = formatCardMs(fcp);
    document.getElementById('lcp-time').textContent = formatCardMs(lcp);
    document.getElementById('ttfb-time').textContent = formatCardMs(ttfb);
    document.getElementById('dcl-time').textContent = formatCardMs(dcl);

    // Build timeline table
    const timelineBody = document.getElementById('timeline-body');
    if (navigation && Array.isArray(navigation.timeline) && navigation.timeline.length > 0) {
      const timeline = navigation.timeline;
      let maxDuration = 0;
      let slowestIndex = -1;

      timeline.forEach((phase, i) => {
        const duration = phase.end - phase.start;
        if (duration > maxDuration) {
          maxDuration = duration;
          slowestIndex = i;
        }
      });

      // Build rows via DOM API to avoid innerHTML with unescaped values
      timelineBody.textContent = '';
      timeline.forEach((phase, i) => {
        const duration = phase.end - phase.start;
        const isSlowest = i === slowestIndex && maxDuration > 0;
        const tr = document.createElement('tr');
        if (isSlowest) tr.className = 'timeline-slowest';

        const tdPhase = document.createElement('td');
        tdPhase.textContent = phase.phase;

        const tdStart = document.createElement('td');
        tdStart.textContent = formatMs(phase.start);

        const tdEnd = document.createElement('td');
        tdEnd.textContent = formatMs(phase.end);

        const tdDuration = document.createElement('td');
        tdDuration.textContent = formatMs(duration);

        tr.append(tdPhase, tdStart, tdEnd, tdDuration);
        timelineBody.appendChild(tr);
      });
    } else {
      timelineBody.textContent = '';
    }

    // Build resources table
    const resourcesBody = document.getElementById('resources-body');
    resourcesBody.textContent = '';

    if (data && data.resources) {
      const allResources = [];

      Object.keys(TYPE_TO_BADGE).forEach(type => {
        if (data.resources[type] && data.resources[type].length > 0) {
          const badge = TYPE_TO_BADGE[type];
          data.resources[type].forEach(resource => {
            allResources.push({
              ...resource,
              badgeClass: badge.cls,
              badgeText: badge.text
            });
          });
        }
      });

      allResources.sort((a, b) => b.duration - a.duration);
      const topResources = allResources.slice(0, TOP_RESOURCES_COUNT);

      topResources.forEach(resource => {
        const isSlow = resource.duration > SLOW_RESOURCE_THRESHOLD_MS;
        const resourceName = typeof resource.name === 'string' ? resource.name : String(resource.name || 'unknown');
        const displayName = resourceName.length > RESOURCE_NAME_MAX_LENGTH
          ? resourceName.substring(0, RESOURCE_NAME_MAX_LENGTH) + '...'
          : resourceName;

        // Validate badge class against allowlist
        const badgeClass = BADGE_CLASS_ALLOWLIST.has(resource.badgeClass) ? resource.badgeClass : 'other';

        const tr = document.createElement('tr');

        const tdResource = document.createElement('td');
        const resourceRow = document.createElement('div');
        resourceRow.className = 'resource-row';

        const badgeSpan = document.createElement('span');
        badgeSpan.className = 'badge ' + badgeClass;
        badgeSpan.textContent = resource.badgeText;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'resource-name';
        nameSpan.title = resourceName;
        nameSpan.textContent = displayName;

        resourceRow.append(badgeSpan, nameSpan);
        tdResource.appendChild(resourceRow);

        const tdSize = document.createElement('td');
        tdSize.className = 'resource-size';
        if (resource.size > 0) {
          tdSize.textContent = formatBytes(resource.size);
          if (resource.cached) {
            tdSize.classList.add('cached-size');
            tdSize.title = 'Served from browser cache';
          }
        } else {
          tdSize.textContent = 'n/a';
          tdSize.title = 'Size not exposed by the server (cross-origin without Timing-Allow-Origin)';
        }

        const tdTime = document.createElement('td');
        tdTime.className = 'resource-time' + (isSlow ? ' slow-time' : '');
        tdTime.textContent = formatMs(resource.duration);

        tr.append(tdResource, tdSize, tdTime);
        resourcesBody.appendChild(tr);
      });
    }
  } catch (error) {
    console.error('Error displaying performance data:', error);
    showEmptyState();
  }
}
