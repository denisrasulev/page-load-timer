function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showEmptyState() {
  document.getElementById('load-time').textContent = '--';
  document.getElementById('dom-time').textContent = '--';
  document.getElementById('ttfb-time').textContent = '--';
  document.getElementById('timeline-body').innerHTML = '';
  document.getElementById('resources-body').innerHTML = '';
}

document.addEventListener('DOMContentLoaded', () => {
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

function renderData(data) {
  try {
    const navigation = data && data.navigation ? data.navigation : null;
    const loadComplete = navigation && typeof navigation.loadComplete === 'number' ? navigation.loadComplete : null;
    const domContentLoaded = navigation && typeof navigation.domContentLoaded === 'number' ? navigation.domContentLoaded : null;
    const ttfb = navigation && typeof navigation.ttfb === 'number' ? navigation.ttfb : null;

    // Update metric cards
    document.getElementById('load-time').textContent = loadComplete != null ? loadComplete + 'ms' : '--';
    document.getElementById('dom-time').textContent = domContentLoaded != null ? domContentLoaded + 'ms' : '--';
    document.getElementById('ttfb-time').textContent = ttfb != null ? ttfb + 'ms' : '--';

    // Build timeline table
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

      let timelineHTML = '';
      timeline.forEach((phase, i) => {
        const duration = phase.end - phase.start;
        const isSlowest = i === slowestIndex && maxDuration > 0;
        timelineHTML += `
          <tr${isSlowest ? ' class="timeline-slowest"' : ''}>
            <td>${escapeHTML(phase.phase)}</td>
            <td>${phase.start}ms</td>
            <td>${phase.end}ms</td>
            <td>${duration}ms</td>
          </tr>
        `;
      });
      document.getElementById('timeline-body').innerHTML = timelineHTML;
    } else {
      document.getElementById('timeline-body').innerHTML = '';
    }

    // Build resources table
    let tableHTML = '';

    if (data && data.resources) {
      const allResources = [];

      ['scripts', 'stylesheets', 'images', 'xhr', 'fonts', 'other'].forEach(type => {
        if (data.resources[type] && data.resources[type].length > 0) {
          data.resources[type].forEach(resource => {
            const badgeClass = type === 'scripts' ? 'js' :
                              type === 'stylesheets' ? 'css' :
                              type === 'images' ? 'img' :
                              type === 'xhr' ? 'xhr' :
                              type === 'fonts' ? 'font' : 'other';
            const badgeText = type === 'scripts' ? 'JS' :
                            type === 'stylesheets' ? 'CSS' :
                            type === 'images' ? 'IMG' :
                            type === 'xhr' ? 'XHR' :
                            type === 'fonts' ? 'FONT' : 'OTHER';

            allResources.push({
              ...resource,
              badgeClass: badgeClass,
              badgeText: badgeText
            });
          });
        }
      });

      allResources.sort((a, b) => b.duration - a.duration);
      const topResources = allResources.slice(0, 10);

      if (topResources.length > 0) {
        topResources.forEach(resource => {
          const slowClass = resource.duration > 500 ? 'slow-time' : '';
          const resourceName = typeof resource.name === 'string' ? resource.name : String(resource.name || 'unknown');
          const displayName = resourceName.length > 35
            ? resourceName.substring(0, 35) + '...'
            : resourceName;

          const safeName = escapeHTML(resourceName);
          const safeDisplayName = escapeHTML(displayName);
          const safeBadgeText = escapeHTML(resource.badgeText);
          const safeBadgeClass = escapeHTML(resource.badgeClass);

          tableHTML += `
            <tr>
              <td>
                <div class="resource-row">
                  <span class="badge ${safeBadgeClass}">${safeBadgeText}</span>
                  <span class="resource-name" title="${safeName}">${safeDisplayName}</span>
                </div>
              </td>
              <td class="resource-time ${slowClass}">${resource.duration}ms</td>
            </tr>
          `;
        });
      } else {
        tableHTML = '';
      }
    } else {
      tableHTML = '';
    }

    document.getElementById('resources-body').innerHTML = tableHTML;
  } catch (error) {
    console.error('Error displaying performance data:', error);
    document.getElementById('resources-body').innerHTML = '';
  }
}
