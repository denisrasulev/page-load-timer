# Page Load Timer (Chrome Extension)

A lightweight Chrome extension that measures page load performance for the active tab.

## What it shows
- Page Load, DOM Ready, and TTFB times
- Load timeline phases (Redirect, DNS, Connect, Request, Response, DOM)
- Top slow resources (JS, CSS, images, fonts, XHR, other)
- Badge color by load speed (green, orange, red)

## Install (local)
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this project folder

## Usage
1. Open a website
2. Reload the page
3. Click the extension icon to view metrics

If data is not visible yet, reload once and open the popup again.

## Project files
- `manifest.json`: extension config (MV3)
- `content.js`: collects performance data in-page
- `background.js`: stores tab data and updates badge
- `popup.html` + `popup.js`: UI for metrics and resource table
