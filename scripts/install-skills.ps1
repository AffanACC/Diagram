# Copies the diagram skills from this repo (.claude\skills) into your user-level skills folder,
# so every Claude session finds them, whichever folder it starts in. Re-run after editing a
# skill. The repo copy is the source of truth; edit there, not in the user folder.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$from = Join-Path $repo '.claude\skills'
$to = Join-Path $env:USERPROFILE '.claude\skills'
if (-not (Test-Path $from)) { throw "No skills folder at $from" }
New-Item -ItemType Directory -Force $to | Out-Null

Get-ChildItem $from -Directory | ForEach-Object {
  $dest = Join-Path $to $_.Name
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  Copy-Item $_.FullName $dest -Recurse
  Write-Host "Installed $($_.Name) -> $dest"
}
