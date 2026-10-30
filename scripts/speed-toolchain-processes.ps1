$taskProcesses = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'scripts[\\/]speed-windows-toolchain\.mjs' })
$allProcesses = @(Get-CimInstance Win32_Process)
$parentIds = @($taskProcesses.ProcessId)
$result = @($taskProcesses)
for ($depth = 0; $depth -lt 3; $depth++) {
  $children = @($allProcesses | Where-Object { $parentIds -contains $_.ParentProcessId })
  $result += $children
  $parentIds = @($children.ProcessId)
}
$result | Select-Object ProcessId, ParentProcessId, Name, CommandLine | ConvertTo-Json -Depth 3
