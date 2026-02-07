function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showEmptyState() {
  document.getElementById('load-time').textContent = 'N/A';
  document.getElementById('dom-time').textContent = 'N/A';
  document.getElementById('ttfb-time').textContent = 'N/A';
  document.getElementById('timeline-body').innerHTML = '<tr><td colspan="4" class="empty-state">No data yet. Reload a page.</td></tr>';
  document.getElementById('resources-body').innerHTML = '<tr><td colspan="2" class="empty-state">No data yet. Reload a page.</td></tr>';
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
        // Update metric cards
        document.getElementById('load-time').textContent = data.navigation.loadComplete + 'ms';
        document.getElementById('dom-time').textContent = data.navigation.domContentLoaded + 'ms';
        document.getElementById('ttfb-time').textContent = data.navigation.ttfb + 'ms';

        // Build timeline table
        if (data.navigation && data.navigation.timeline) {
          const timeline = data.navigation.timeline;
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
          document.getElementById('timeline-body').innerHTML = '<tr><td colspan="4" class="empty-state">No timeline data</td></tr>';
        }

        // Build resources table
        let tableHTML = '';

        if (data.resources) {
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
              const displayName = resource.name.length > 35
                ? resource.name.substring(0, 35) + '...'
                : resource.name;

              const safeName = escapeHTML(resource.name);
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
            tableHTML = '<tr><td colspan="2" class="empty-state">No resources found</td></tr>';
          }
        } else {
          tableHTML = '<tr><td colspan="2" class="empty-state">No resource data available</td></tr>';
        }

        document.getElementById('resources-body').innerHTML = tableHTML;

      } catch (error) {
        console.error('Error displaying performance data:', error);
        document.getElementById('resources-body').innerHTML = '<tr><td colspan="2" class="empty-state" style="color: var(--danger);">Error loading data. Check console.</td></tr>';
      }
    });
  });
});
