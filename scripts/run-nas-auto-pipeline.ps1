Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Run from repo root regardless of where invoked
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

python scripts\nas-auto-pipeline.py

