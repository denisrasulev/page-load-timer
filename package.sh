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

# The Web Store item uses verified CRX uploads: it accepts only a .crx signed
# with the item's private key. Pass the key path to build one:
#   ./package.sh /path/to/key.pem
KEY="${1:-}"
[ -n "$KEY" ] || exit 0
[ -f "$KEY" ] || fail "key not found: $KEY"
# Chrome only reads PKCS#8; convert an old-style "RSA PRIVATE KEY" on the fly
if grep -q 'BEGIN RSA PRIVATE KEY' "$KEY"; then
  KEY8=$(mktemp)
  trap 'rm -f "$KEY8"' EXIT
  openssl pkcs8 -topk8 -nocrypt -in "$KEY" -out "$KEY8" || fail "could not convert the key to PKCS#8"
  KEY="$KEY8"
fi
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || fail "Chrome not found at $CHROME (set CHROME=...)"

STAGE="dist/page-load-timer-$VERSION"
rm -rf "$STAGE" "$STAGE.crx"
mkdir -p "$STAGE"
for f in "${FILES[@]}"; do
  mkdir -p "$STAGE/$(dirname "$f")"
  cp "$f" "$STAGE/$f"
done
# A separate profile keeps a running Chrome from swallowing the command
"$CHROME" --user-data-dir="$(mktemp -d)" --no-message-box \
  --pack-extension="$PWD/$STAGE" --pack-extension-key="$KEY" >/dev/null 2>&1 || true
rm -rf "$STAGE"
[ -f "$STAGE.crx" ] || fail "Chrome did not produce $STAGE.crx"
echo "Built $STAGE.crx ($(du -h "$STAGE.crx" | cut -f1))"
