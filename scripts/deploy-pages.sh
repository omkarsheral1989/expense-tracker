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

# Replace the folder, so files from older builds (hashed names) do not pile up.
rm -rf "$pages/ownledger"
cp -R "$root/dist" "$pages/ownledger"
# Pages only reads 404.html from the root of the site.
cp "$root/deploy/404.html" "$pages/404.html"

echo
echo "Copied to $pages/ownledger. Review, commit and push there:"
git -C "$pages" status --short | head -20
