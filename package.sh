#!/usr/bin/env bash
# Builds the Chrome Web Store upload: a zip with only the files the extension
# needs at runtime (no assets/, README, docs, or git data).
set -euo pipefail
cd "$(dirname "$0")"

FILES=(
  manifest.json
  background.js
  content.js
  collect.js
  shared.js
  early.js
  popup.html
  popup.js
  icons/icon16.png
  icons/icon32.png
  icons/icon48.png
  icons/icon128.png
)

fail() { echo "package.sh: $*" >&2; exit 1; }

in_files() {
  local f
  for f in "${FILES[@]}"; do [ "$f" = "$1" ] && return 0; done
  return 1
}

# Every listed file must exist
for f in "${FILES[@]}"; do
  [ -f "$f" ] || fail "missing file: $f"
done

# Everything the manifest and the popup refer to must be packaged
refs=$( { grep -o '"[A-Za-z0-9_/.-]*\.\(js\|html\|png\)"' manifest.json | tr -d '"'
          grep -o 'src="[^"]*\.js"' popup.html | cut -d'"' -f2; } | sort -u )
for ref in $refs; do
  in_files "$ref" || fail "'$ref' is referenced by manifest.json or popup.html but is not in FILES"
done

VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' manifest.json | head -n 1)
[ -n "$VERSION" ] || fail "could not read the version from manifest.json"

mkdir -p dist
OUT="dist/page-load-timer-$VERSION.zip"
rm -f "$OUT"
zip -q -X "$OUT" "${FILES[@]}"

echo "Built $OUT ($(du -h "$OUT" | cut -f1))"
unzip -l "$OUT" | sed -n '4,$p'
