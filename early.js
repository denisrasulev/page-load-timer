// Runs synchronously at the top of <body>, before the first paint: applies the
// theme and density the popup used last time, so the layout does not flash and
// resize once the (asynchronous) settings read finishes. popup.js keeps the
// cache up to date; extension pages cannot use inline scripts, hence this file.
(function () {
  try {
    const ui = JSON.parse(localStorage.getItem('plt_ui') || 'null');
    if (!ui || typeof ui !== 'object') return;
    if (['auto', 'light', 'dark'].includes(ui.theme)) {
      document.documentElement.classList.remove('theme-auto', 'theme-light', 'theme-dark');
      document.documentElement.classList.add('theme-' + ui.theme);
    }
    if (['roomy', 'default', 'compact'].includes(ui.density)) {
      document.body.classList.add('density-' + ui.density);
    }
  } catch (e) { /* storage unavailable: popup.js applies the settings shortly after */ }
})();
