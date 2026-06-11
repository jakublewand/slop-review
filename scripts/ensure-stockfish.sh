#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE_DIR="$ROOT/engines/stockfish"
BIN_DIR="$ENGINE_DIR/bin"
DOWNLOAD_DIR="$ENGINE_DIR/downloads"
EXTRACT_DIR="$DOWNLOAD_DIR/extract"
ENGINE_PATH="$BIN_DIR/stockfish"
PATH_FILE="$ENGINE_DIR/engine-path.txt"

if [[ -x "$ENGINE_PATH" ]]; then
  printf '%s\n' "$ENGINE_PATH" > "$PATH_FILE"
  echo "Using Stockfish at $ENGINE_PATH"
  exit 0
fi

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS:$ARCH" in
  Darwin:arm64)
    ASSET="stockfish-macos-m1-apple-silicon.tar"
    ;;
  Darwin:x86_64)
    ASSET="stockfish-macos-x86-64.tar"
    ;;
  Linux:x86_64|Linux:amd64)
    ASSET="stockfish-ubuntu-x86-64.tar"
    ;;
  *)
    echo "Unsupported platform for automatic Stockfish download: $OS $ARCH" >&2
    exit 1
    ;;
esac

mkdir -p "$BIN_DIR" "$DOWNLOAD_DIR"
rm -rf "$EXTRACT_DIR"
mkdir -p "$EXTRACT_DIR"

ARCHIVE="$DOWNLOAD_DIR/$ASSET"
URL="https://github.com/official-stockfish/Stockfish/releases/latest/download/$ASSET"

echo "Downloading Stockfish from $URL"
if command -v curl >/dev/null 2>&1; then
  curl -L --fail -o "$ARCHIVE" "$URL"
elif command -v wget >/dev/null 2>&1; then
  wget -O "$ARCHIVE" "$URL"
else
  echo "curl or wget is required to download Stockfish." >&2
  exit 1
fi

tar -xf "$ARCHIVE" -C "$EXTRACT_DIR"

FOUND="$(find "$EXTRACT_DIR" -type f -name 'stockfish*' -perm -111 | head -n 1)"
if [[ -z "$FOUND" ]]; then
  FOUND="$(find "$EXTRACT_DIR" -type f -name 'stockfish*' | head -n 1)"
fi
if [[ -z "$FOUND" ]]; then
  echo "Downloaded Stockfish archive did not contain an executable." >&2
  exit 1
fi

cp "$FOUND" "$ENGINE_PATH"
chmod +x "$ENGINE_PATH"
printf '%s\n' "$ENGINE_PATH" > "$PATH_FILE"
echo "Installed Stockfish at $ENGINE_PATH"
