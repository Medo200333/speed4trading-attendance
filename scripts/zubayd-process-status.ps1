$all = Get-CimInstance Win32_Process
$owned = $all | Where-Object { $_.CommandLine -and ($_.CommandLine.Contains('zubayd-install-desktop.mjs') -or ($_.CommandLine.Contains('npm-cli.js') -and $_.CommandLine.Contains('desktop'))) }
$owned | Select-Object ProcessId, Name | ConvertTo-Json -Compress
