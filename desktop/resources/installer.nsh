; speed4trading 1.2.10: commercial clean install / uninstall.
!macro s4tWipe
  ReadRegStr $0 HKCU "Software\SpeedForTraining\Install" "DataDirectory"
  StrCmp $0 "" +3
  IfFileExists "$0\companies.json" 0 +2
  RMDir /r "$0"
  RMDir /r "$APPDATA\Speed for Training"
  RMDir /r "$APPDATA\speed4trading"
  RMDir /r "$APPDATA\Speed4Trading"
  RMDir /r "$APPDATA\zubayd-desktop"
  DeleteRegKey HKCU "Software\SpeedForTraining"
!macroend

!macro customInit
  ; Leftover install state from an older version (installation.json or a recorded data folder):
  ; ask; default (and silent mode) = fresh start. The app also never reuses an old data folder.
  ReadRegStr $1 HKCU "Software\SpeedForTraining\Install" "DataDirectory"
  StrCmp $1 "" 0 s4t_ask
  IfFileExists "$APPDATA\Speed for Training\installation.json" s4t_ask
  IfFileExists "$APPDATA\speed4trading\installation.json" s4t_ask s4t_done
  s4t_ask:
  MessageBox MB_YESNO|MB_ICONQUESTION "فيه بيانات من تثبيت سابق للبرنامج.$\r$\nنمسحها ونبدأ تثبيت جديد نضيف؟$\r$\n(لا = نكمل على البيانات القديمة)" /SD IDYES IDNO s4t_done
  !insertmacro s4tWipe
  s4t_done:
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="speed4trading SADP"'
  ; Remove everything the app created; owner wants reinstall = fresh 30-day demo (trial key removed too).
  ${ifNot} ${isUpdated}
    !insertmacro s4tWipe
    RMDir /r "$LOCALAPPDATA\speed4trading-updater"
  ${endIf}
!macroend

; SADP discovery/activation: allow Hikvision SADP replies (UDP from remote port 37020, multicast 239.255.255.250).
; Needs admin; on a per-user install without elevation this silently fails and Windows shows its own firewall prompt instead.
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="speed4trading SADP"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="speed4trading SADP" dir=in action=allow protocol=UDP remoteport=37020 profile=any'
!macroend
