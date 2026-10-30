$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root
npm install
if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
npx vite build --config vite.desktop.config.ts
if ($LASTEXITCODE -ne 0) { throw 'ui build failed' }
Set-Location -LiteralPath (Join-Path $root 'desktop')
npm install
if ($LASTEXITCODE -ne 0) { throw 'electron install failed' }
if (Test-Path -LiteralPath 'node_modules\electron\install.js') { node 'node_modules\electron\install.js' }
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
npx electron-builder --win nsis --x64
if ($LASTEXITCODE -ne 0) { throw 'build failed' }
explorer.exe (Join-Path $root 'desktop\release')
