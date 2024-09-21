Section
    ; Check if the VC++ Redistributable is already installed
    ReadRegStr $0 HKLM "SOFTWARE\Wow6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
    
    ${If} $0 != ""
        DetailPrint "vc_redist found! Skipping installation."
    ${Else}
        ; Define download URL and target path for vc_redist.x64.exe
        StrCpy $0 "https://aka.ms/vs/17/release/vc_redist.x64.exe"
        StrCpy $1 "$TEMP\vc_redist.x64.exe"

        ; Download the vc_redist.x64.exe installer
        NSISdl::download $0 $1
        Pop $0
        ${If} $0 == "success"
            DetailPrint "vc_redist downloaded successfully"
        ${Else}
            DetailPrint "vc_redist failed to download"
            Call InstallFailed
            Abort "vc_redist download failed, aborting installation"
        ${EndIf}

        ; Execute the downloaded installer
        ExecWait '"$1" /install /passive /norestart' $0
        ${If} $0 == 0
            DetailPrint "vc_redist installation completed successfully"
        ${Else}
            DetailPrint "vc_redist installation failed"
            Call InstallFailed
            Abort "vc_redist installation failed, aborting process"
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