#!/usr/bin/env bash
# Installs system libraries required to build Tauri on Debian/Ubuntu.
# Run: bash scripts/install-tauri-linux-deps.sh

set -euo pipefail

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This script is for Debian/Ubuntu (apt). See https://tauri.app/start/prerequisites/"
  exit 1
fi

echo "Installing Tauri Linux build dependencies (sudo required)…"
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  curl \
  wget \
  file \
  pkg-config \
  libssl-dev \
  libglib2.0-dev \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf

echo ""
echo "Verifying pkg-config can find GLib…"
pkg-config --modversion glib-2.0
pkg-config --modversion gobject-2.0

echo ""
echo "Done. From the project root run: npm run tauri dev"
