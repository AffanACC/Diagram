# Registers a per-user scheduled task that starts the diagram server at every sign-in,
# hidden, and restarts it if it stops. No admin rights needed (runs as you, only while you
# are signed in). Re-run to update. Remove with: scripts\uninstall-autostart.ps1
$ErrorActionPreference = 'Stop'

$taskName = 'DiagramServer'
$repo = Split-Path -Parent $PSScriptRoot
$node = 'C:\Program Files\nodejs\node.exe'
$script = Join-Path $repo 'scripts\serve.mjs'
if (-not (Test-Path $node)) { throw "Node not found at $node" }
if (-not (Test-Path $script)) { throw "Missing $script" }

# Hidden PowerShell wrapper keeps the node console window off screen.
$cmd = "& '$node' '$script'"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"$cmd`"" `
  -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal -Force `
  -Description 'Local read-only server for the diagram viewer (http://localhost:47831)' | Out-Null
Write-Host "Registered task '$taskName'. Start now with: Start-ScheduledTask -TaskName $taskName"
