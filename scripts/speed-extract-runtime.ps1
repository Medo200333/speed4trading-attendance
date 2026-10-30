param([Parameter(Mandatory=$true)][string]$Archive,[Parameter(Mandatory=$true)][string]$Destination)
$workspaceRoot = [IO.Path]::GetFullPath('C:\awwal-akher')
$archivePath = [IO.Path]::GetFullPath($Archive)
$destinationPath = [IO.Path]::GetFullPath($Destination)
if (-not $archivePath.StartsWith($workspaceRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or -not $destinationPath.StartsWith($workspaceRoot + '\desktop\node_modules\electron\dist', [StringComparison]::OrdinalIgnoreCase)) { throw 'WORKSPACE_PATH' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Directory]::CreateDirectory($destinationPath) | Out-Null
$zip = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
 foreach ($entry in $zip.Entries) {
  $target = [IO.Path]::GetFullPath([IO.Path]::Combine($destinationPath,$entry.FullName))
  if (-not $target.StartsWith($destinationPath + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'ARCHIVE_PATH' }
  if ($entry.Name -eq '') { [IO.Directory]::CreateDirectory($target) | Out-Null }
  else { [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null; [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$true) }
 }
} finally { $zip.Dispose() }
Write-Output 'Verified runtime extracted inside the intended workspace directory.'
