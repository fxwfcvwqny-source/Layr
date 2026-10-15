; Layr: die im Installer gewählte Sprache (1031 = Deutsch, 1033 = English) für den ersten Start merken
!macro customInstall
  FileOpen $0 "$INSTDIR\resources\install-language.txt" w
  FileWrite $0 "$LANGUAGE"
  FileClose $0
!macroend
