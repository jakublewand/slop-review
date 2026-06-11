$ErrorActionPreference = 'Stop'

& "$PSScriptRoot\scripts\ensure-stockfish.ps1"

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$node = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" }
if (-not (Test-Path $node)) {
  Write-Error "Node.js was not found. Install Node.js or add it to PATH."
  exit 1
}

$env:STOCKFISH_PATH = Get-Content -LiteralPath "$PSScriptRoot\engines\stockfish\engine-path.txt" -Raw
$env:STOCKFISH_PATH = $env:STOCKFISH_PATH.Trim()
& $node "$PSScriptRoot\server.mjs"
