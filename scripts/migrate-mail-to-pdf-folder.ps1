# migrate: mail folder -> search result PDF folder
# See FOLDER-CONSOLIDATION.md
# Usage: $env:MAIL_SRC="X:\...\메일저장"; $env:PDF_DST="X:\...\검사결과_PDF"; .\migrate-mail-to-pdf-folder.ps1

$base = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$src = Join-Path (Split-Path -Parent $base) "질병검사결과\메일저장"
$dst = Join-Path $base "검사결과_PDF"

if ($env:MAIL_SRC) { $src = $env:MAIL_SRC }
if ($env:PDF_DST) { $dst = $env:PDF_DST }

if (-not (Test-Path $src)) {
    Write-Host "Source not found: $src"
    exit 1
}

Write-Host "Copy: $src -> $dst"
robocopy $src $dst /E /XC /XN /NFL /NDL /NJH /NJS
Write-Host "Done."
