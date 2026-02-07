# Sign Windows binaries with certificate from environment variables.
# Required env vars: WINDOWS_CERTIFICATE (base64), WINDOWS_CERTIFICATE_PASSWORD
#
# Usage: pwsh scripts/windows_sign.ps1

$ErrorActionPreference = "Stop"

# Import certificate
[IO.File]::WriteAllBytes('cert.pfx', [Convert]::FromBase64String($env:WINDOWS_CERTIFICATE))
Import-PfxCertificate -Exportable -FilePath "cert.pfx" -CertStoreLocation 'cert:\CurrentUser\My' -Password (ConvertTo-SecureString -String $env:WINDOWS_CERTIFICATE_PASSWORD -Force -AsPlainText)

# Find signtool
$signtoolPath = (Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin\" -Filter "signtool.exe" -Recurse | Where-Object FullName -like "*\x64\signtool.exe" | Select-Object -First 1).FullName

# Sign ffmpeg DLLs
&$signtoolPath sign /f cert.pfx /p $env:WINDOWS_CERTIFICATE_PASSWORD /tr http://timestamp.digicert.com /td sha256 /fd sha256 desktop\src-tauri\ffmpeg\bin\x64\*

# Sign tauri plugin DLLs
# TODO: remove once https://github.com/tauri-apps/tauri/pull/11676 merged
C:\msys64\usr\bin\wget.exe https://github.com/tauri-apps/binary-releases/releases/download/nsis-3/nsis-3.zip
Expand-Archive nsis-3.zip
Move-Item nsis-3\nsis-3.08 "$env:localappdata\tauri\NSIS"
Get-ChildItem -Path "$env:LOCALAPPDATA\tauri\NSIS\Plugins" -Filter '*.dll' -Recurse | ForEach-Object {
    &$signtoolPath sign /f cert.pfx /p $env:WINDOWS_CERTIFICATE_PASSWORD /tr http://timestamp.digicert.com /td sha256 /fd sha256 $_.FullName
}
