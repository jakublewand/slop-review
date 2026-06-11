#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$DIR/scripts/ensure-stockfish.sh"
export STOCKFISH_PATH="$(cat "$DIR/engines/stockfish/engine-path.txt")"
exec node "$DIR/server.mjs"
