$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$engineDir = Join-Path $root 'engines\stockfish'
$binDir = Join-Path $engineDir 'bin'
$downloadDir = Join-Path $engineDir 'downloads'
$extractDir = Join-Path $downloadDir 'extract'
$enginePath = Join-Path $binDir 'stockfish.exe'
$pathFile = Join-Path $engineDir 'engine-path.txt'

if (Test-Path -LiteralPath $enginePath) {
  Set-Content -LiteralPath $pathFile -Value $enginePath
  Write-Host "Using Stockfish at $enginePath"
  exit 0
}

New-Item -ItemType Directory -Force -Path $binDir, $downloadDir, $extractDir | Out-Null

$asset = 'stockfish-windows-x86-64.zip'
$archive = Join-Path $downloadDir $asset
$url = "https://github.com/official-stockfish/Stockfish/releases/latest/download/$asset"

Write-Host "Downloading Stockfish from $url"
Invoke-WebRequest -Uri $url -OutFile $archive

if (Test-Path -LiteralPath $extractDir) {
  Remove-Item -LiteralPath $extractDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
Expand-Archive -LiteralPath $archive -DestinationPath $extractDir -Force

$exe = Get-ChildItem -LiteralPath $extractDir -Recurse -Filter 'stockfish*.exe' |
  Sort-Object Length -Descending |
  Select-Object -First 1

if (-not $exe) {
  throw 'Downloaded Stockfish archive did not contain a Windows executable.'
}

Copy-Item -LiteralPath $exe.FullName -Destination $enginePath -Force
Set-Content -LiteralPath $pathFile -Value $enginePath
Write-Host "Installed Stockfish at $enginePath"
