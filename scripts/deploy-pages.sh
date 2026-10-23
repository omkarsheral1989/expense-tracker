#!/usr/bin/env bash
# Builds the app and copies it into the omkarsheral1989.github.io repository
# (ADR-032). It changes files there but never commits or pushes.
#
# PAGES_REPO overrides where that repository is (default: next to this one).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
pages="${PAGES_REPO:-$root/../omkarsheral1989.github.io}"

if [ ! -d "$pages/.git" ]; then
  echo "Not a git repository: $pages (set PAGES_REPO)" >&2
  exit 1
fi
if [ -n "$(git -C "$pages" status --porcelain)" ]; then
  echo "The Pages repository has uncommitted changes. Commit or stash them first:" >&2
  git -C "$pages" status --short >&2
  exit 1
fi

cd "$root"
bun run build

# A file listed twice in the service worker's precache (with two revisions)
# makes its install fail, so nothing is cached and the app cannot open offline.
# The entries are written as "url":"…" (our own worker, ADR-047) or url:"…".
entries="$(grep -oE '"?url"?:"[^"]*"' dist/sw.js || true)"
if [ -z "$entries" ]; then
  echo "dist/sw.js lists no precached files, so the app would not work offline." >&2
  exit 1
fi
duplicates="$(echo "$entries" | sort | uniq -d)"
if [ -n "$duplicates" ]; then
  echo "dist/sw.js precaches these files more than once, so the app would not work offline:" >&2
  echo "$duplicates" >&2
  exit 1
fi

# Replace the folder, so files from older builds (hashed names) do not pile up.
rm -rf "$pages/ownledger"
cp -R "$root/dist" "$pages/ownledger"
# Pages only reads 404.html from the root of the site.
cp "$root/deploy/404.html" "$pages/404.html"

echo
echo "Copied to $pages/ownledger. Review, commit and push there:"
git -C "$pages" status --short | head -20
