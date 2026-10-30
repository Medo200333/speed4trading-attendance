# Speed for Training signed release build. Reads signing secrets from C:\ProgramData\SpeedLicense\signing (never printed).
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)
$d = 'C:\ProgramData\SpeedLicense\signing'
$env:CSC_LINK = "$d\MK-codesign.pfx"; $env:CSC_KEY_PASSWORD = (Get-Content "$d\pfx-password.txt" -Raw).Trim()
$env:SPEED_RELEASE_KEYSTORE = "$d\speed-release.jks"
$env:SPEED_RELEASE_STORE_PASSWORD = (Get-Content "$d\jks-store-password.txt" -Raw).Trim()
$env:SPEED_RELEASE_KEY_PASSWORD = (Get-Content "$d\jks-key-password.txt" -Raw).Trim()
try {
  cmd /c "npm run build:windows > C:\Users\Public\speed-win.log 2>&1"; "WIN=$LASTEXITCODE"
  cmd /c "node scripts/zubayd-build-android.mjs > C:\Users\Public\speed-and.log 2>&1"; "AND=$LASTEXITCODE"
} finally {
  Remove-Item Env:CSC_LINK, Env:CSC_KEY_PASSWORD, Env:SPEED_RELEASE_KEYSTORE, Env:SPEED_RELEASE_STORE_PASSWORD, Env:SPEED_RELEASE_KEY_PASSWORD -ErrorAction SilentlyContinue
}
