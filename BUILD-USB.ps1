$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Install Node.js first: https://nodejs.org' }
npm install
if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
npm install --prefix desktop
if ($LASTEXITCODE -ne 0) { throw 'desktop install failed' }
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
npm run build:windows
if ($LASTEXITCODE -ne 0) { throw 'Windows exe build failed' }
explorer.exe (Join-Path $PSScriptRoot 'releases\windows')
Write-Host 'EXE DONE. Installer is in releases\windows'
Write-Host 'APK needs Android Studio SDK API 36.1 and JDK. Then run: npm run build:android'
