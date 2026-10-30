$taskRoots = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'scripts[\\/]speed-windows-toolchain\.mjs' })
$processes = @(Get-CimInstance Win32_Process)
foreach ($taskRoot in $taskRoots) {
  $children = @($processes | Where-Object { $_.ParentProcessId -eq $taskRoot.ProcessId -and ($_.Name -eq 'curl.exe' -or ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'npm-cli\.js.+install.+--prefix desktop')) })
  foreach ($child in $children) { Stop-Process -Id $child.ProcessId -Force -ErrorAction SilentlyContinue }
  Stop-Process -Id $taskRoot.ProcessId -Force -ErrorAction SilentlyContinue
}
Write-Output 'Stopped only this task downloader and its verified download children.'
