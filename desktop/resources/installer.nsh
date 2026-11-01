; speed4trading 1.2.10: commercial clean install / uninstall.
!macro customInit
  ; Leftover data from an older install: ask; default is a fresh start (old data is not read either way,
  ; the app never reuses an old data folder).
  ReadRegStr $0 HKCU "Software\SpeedForTraining\Install" "DataDirectory"
  StrCmp $0 "" done_init
  IfFileExists "$0\companies.json" 0 done_init
  MessageBox MB_YESNO|MB_ICONQUESTION "فيه بيانات قديمة من نسخة سابقة:$\r$\n$0$\r$\n$\r$\nامسحها وابدأ من جديد؟ (لا = سيبها في مكانها بدون ما البرنامج يقراها)" IDNO done_init
    RMDir /r "$0"
    RMDir /r "$APPDATA\speed4trading"
    RMDir /r "$APPDATA\Speed for Training"
    RMDir /r "$APPDATA\zubayd-desktop"
    DeleteRegKey HKCU "Software\SpeedForTraining"
  done_init:
!macroend

!macro customUnInstall
  ReadRegStr $0 HKCU "Software\SpeedForTraining\Install" "DataDirectory"
  StrCmp $0 "" skip_data
  ; Safety: only delete a folder that really is our data folder.
  IfFileExists "$0\companies.json" 0 skip_data
    RMDir /r "$0"
  skip_data:
  RMDir /r "$APPDATA\speed4trading"
  RMDir /r "$APPDATA\Speed for Training"
  RMDir /r "$APPDATA\zubayd-desktop"
  RMDir /r "$LOCALAPPDATA\speed4trading-updater"
  ; Trial anchor too: the owner wants reinstall = fresh 30-day demo.
  DeleteRegKey HKCU "Software\SpeedForTraining"
!macroend
