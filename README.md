# سبيد فور تريدنج — الحضور والانصراف

سورس بناء نسخة الويندوز.

على جهاز الويندوز، من PowerShell:

```
curl.exe -fL -o C:\Users\Public\speed4trading.zip https://github.com/Medo200333/speed4trading-attendance/archive/refs/heads/main.zip
tar -xf C:\Users\Public\speed4trading.zip -C C:\Users\Public
Set-Location C:\Users\Public\speed4trading-attendance-main
powershell -NoProfile -ExecutionPolicy Bypass -File .\BUILD.ps1
```

المثبّت يظهر في `desktop\release\Speed4Trading-Setup.exe`.
