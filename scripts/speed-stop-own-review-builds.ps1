$processes = @(Get-CimInstance Win32_Process)
$roots = @($processes | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'scripts[\\/]speed-build-review-windows\.mjs' })
$selected = @($roots)
$parents = @($roots.ProcessId)
for ($depth = 0; $depth -lt 5; $depth++) {
 $children = @($processes | Where-Object { $parents -contains $_.ParentProcessId })
 $selected += $children
 $parents = @($children.ProcessId)
}
$selected | Sort-Object CreationDate -Descending | ForEach-Object { if ($_.Name -in @('node.exe','app-builder.exe','7za.exe','7z.exe','makensis.exe','rcedit-x64.exe','rcedit-ia32.exe','signtool.exe')) { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } }
Write-Output 'Stopped only descendants of this task review build scripts; ready for one serialized build.'
