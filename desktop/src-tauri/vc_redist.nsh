!macro StopSidecarBeforeInstall SIDECAR_NAME
    ${If} ${FileExists} "$INSTDIR\${SIDECAR_NAME}"
        ; taskkill is part of Windows and works when PowerShell script execution
        ; is disabled. Restrict this to upgrades so a fresh install never stops
        ; an unrelated process that happens to use the same executable name.
        nsExec::ExecToStack '"$SYSDIR\taskkill.exe" /F /T /IM "${SIDECAR_NAME}"'
        Pop $0
        Pop $1
        DetailPrint "taskkill ${SIDECAR_NAME} result: $0 $1"
        Sleep 500

        ; Removing the old file verifies that its lock is gone. Abort instead of
        ; reporting success while silently retaining an incompatible sidecar.
        Delete "$INSTDIR\${SIDECAR_NAME}"
        ${If} ${FileExists} "$INSTDIR\${SIDECAR_NAME}"
            MessageBox MB_OK|MB_ICONSTOP "Vibe could not replace ${SIDECAR_NAME} because it is still in use. Close Vibe and its background processes, then run the installer again."
            Abort "The existing ${SIDECAR_NAME} is still locked"
        ${EndIf}
    ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
    ; Keep one entry per bundled sidecar that can outlive the main application.
    !insertmacro StopSidecarBeforeInstall "vibe-server.exe"
    ; Installs before 3.1.11 shipped the engine as sona.exe; an upgrade must stop it too.
    !insertmacro StopSidecarBeforeInstall "sona.exe"
!macroend

Section
    ; The runtime we need is 14.40 or newer. MSVC 17.10 made std::mutex's constructor
    ; constexpr, so a binary built with it faults inside an older MSVCP140.dll -- an
    ; access violation with no output, which is what #1403 and #1345 report.
    ;
    ; "Installed" is 1 for any VC++ 2015-2022 runtime, so checking only that leaves a
    ; machine with 14.24 believing it is fine. Read the version out of the same key.
    ReadRegStr $0 HKLM "SOFTWARE\Wow6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
    ReadRegDWORD $2 HKLM "SOFTWARE\Wow6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Major"
    ReadRegDWORD $3 HKLM "SOFTWARE\Wow6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Minor"

    ; $4 marks whether a runtime is already present: an upgrade that fails leaves the
    ; machine no worse than it was, so it must not abort an otherwise fine install.
    ; A missing runtime is different -- the app cannot start at all without it.
    StrCpy $4 "0"
    ${If} $0 == ""
        StrCpy $R0 "1"
        DetailPrint "vc_redist not found, installing."
    ${Else}
        StrCpy $4 "1"
        ${If} $2 < 14
        ${OrIf} $2 == 14
            ${AndIf} $3 < 40
            StrCpy $R0 "1"
            DetailPrint "vc_redist $2.$3 is older than 14.40, upgrading."
        ${Else}
            StrCpy $R0 "0"
            DetailPrint "vc_redist $2.$3 is recent enough, skipping."
        ${EndIf}
    ${EndIf}

    ${If} $R0 == "1"
        StrCpy $0 "https://aka.ms/vs/17/release/vc_redist.x64.exe"
        StrCpy $1 "$TEMP\vc_redist.x64.exe"

        NSISdl::download $0 $1
        Pop $0
        ${If} $0 == "success"
            DetailPrint "vc_redist downloaded successfully"
            ExecWait '"$1" /install /passive /norestart' $0
            ${If} $0 == 0
                DetailPrint "vc_redist installation completed successfully"
            ${ElseIf} $4 == "1"
                DetailPrint "vc_redist upgrade failed ($0), keeping the existing runtime"
            ${Else}
                DetailPrint "vc_redist installation failed"
                Call InstallFailed
                Abort "vc_redist installation failed, aborting process"
            ${EndIf}
        ${ElseIf} $4 == "1"
            DetailPrint "vc_redist download failed, keeping the existing runtime"
        ${Else}
            DetailPrint "vc_redist failed to download"
            Call InstallFailed
            Abort "vc_redist download failed, aborting installation"
        ${EndIf}
    ${EndIf}
SectionEnd


Function InstallFailed
    DetailPrint "vc_redist failed to download"
    ; Show a message box to inform the user
    MessageBox MB_OK|MB_ICONEXCLAMATION "Failed to download VC++ Redistributable. Please download and install it manually. Click OK to open the URL to download."
    ; Open the URL in the default browser
    ExecShell "open" "https://aka.ms/vs/17/release/vc_redist.x64.exe"
FunctionEnd
