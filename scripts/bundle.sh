#!/usr/bin/env bash
set -euo pipefail
version="${1:-local}"
[[ "$version" =~ ^[a-zA-Z0-9._-]{1,100}$ ]] || { echo 'Invalid release version' >&2; exit 1; }
mkdir -p dist
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
# Explicit allowlist: no credentials, dev dependencies, IaC or .git in production.
cp package.json package-lock.json Procfile "$stage/"
cp -R src "$stage/src"
printf '{"version":"%s"}\n' "$version" > "$stage/src/version.json"
output="$PWD/dist/application.zip"
rm -f "$output"
(cd "$stage" && zip -qr "$output" package.json package-lock.json Procfile src)
unzip -tq "$output"
