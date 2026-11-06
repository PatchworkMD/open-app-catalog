#!/bin/sh
# Unpacks Chromium's runtime libraries from Debian bookworm (amd64) into .cache/browser-libs,
# for hosts where `sudo npx playwright install-deps chromium-headless-shell` is not possible.
# tests/browser-fixture.cjs adds the unpacked directories to LD_LIBRARY_PATH when they exist.
set -eu

DEST="$(cd "$(dirname "$0")/.." && pwd)/.cache/browser-libs"
MIRROR="https://deb.debian.org/debian"
PACKAGES="libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 libdbus-1-3 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libxi6 libgbm1 libdrm2 libwayland-server0 libxkbcommon0 libasound2"

mkdir -p "$DEST/debs"
curl -fsSL "$MIRROR/dists/bookworm/main/binary-amd64/Packages.xz" | xz -d > "$DEST/Packages"
for package in $PACKAGES; do
  file=$(awk -v want="$package" '$1 == "Package:" { name = $2 } $1 == "Filename:" && name == want { print $2; exit }' "$DEST/Packages")
  [ -n "$file" ] || { echo "Package $package not found in bookworm" >&2; exit 1; }
  curl -fsSL -o "$DEST/debs/$package.deb" "$MIRROR/$file"
  dpkg-deb -x "$DEST/debs/$package.deb" "$DEST/root"
done
rm -f "$DEST/Packages"
echo "Unpacked $(echo "$PACKAGES" | wc -w) packages into $DEST/root"
