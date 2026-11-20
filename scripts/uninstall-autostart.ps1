# Stops and removes the DiagramServer scheduled task.
Stop-ScheduledTask -TaskName 'DiagramServer' -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName 'DiagramServer' -Confirm:$false
Write-Host "Removed task 'DiagramServer'."
