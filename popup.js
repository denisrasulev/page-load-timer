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

function formatMs(value) {
  if (typeof value !== 'number' || isNaN(value)) return '--';
  return Math.round(value) + 'ms';
}

// --- Empty state ---

function showEmptyState() {
  document.getElementById('load-time').textContent = '--';
  document.getElementById('fcp-time').textContent = '--';
  document.getElementById('lcp-time').textContent = '--';
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

    // Update metric cards
    document.getElementById('load-time').textContent = formatMs(loadComplete);
    document.getElementById('fcp-time').textContent = formatMs(fcp);
    document.getElementById('lcp-time').textContent = formatMs(lcp);

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
        tdStart.textContent = Math.round(phase.start) + 'ms';

        const tdEnd = document.createElement('td');
        tdEnd.textContent = Math.round(phase.end) + 'ms';

        const tdDuration = document.createElement('td');
        tdDuration.textContent = Math.round(duration) + 'ms';

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

        const tdTime = document.createElement('td');
        tdTime.className = 'resource-time' + (isSlow ? ' slow-time' : '');
        tdTime.textContent = Math.round(resource.duration) + 'ms';

        tr.append(tdResource, tdTime);
        resourcesBody.appendChild(tr);
      });
    }
  } catch (error) {
    console.error('Error displaying performance data:', error);
    showEmptyState();
  }
}
