# Windows Code Signing (SSL.com + YubiKey FIPS)

Local hardware-based code signing using **SSL.com Code Signing Certificate**
installed on a **YubiKey FIPS (firmware 5.4.x)**  
Example device: yubikey-5c-nano-fips

No cloud signing  
No monthly fees  
Unlimited signings

---

## Overview

In this flow:

- The private key is generated **inside the YubiKey**
- SSL.com **re-issues** the certificate bound to that hardware key
- Signing works locally using the YubiKey (PIV / smart card)
- No eSigner, no remote service, no `.pfx` file

---

## Requirements

- Windows machine with **physical USB access** (no RDP)
- YubiKey **FIPS 5.4.x** (5.4.3 confirmed)
- SSL.com **Code Signing Certificate** (Personal / Individual)
- Administrator access on Windows

---

## 1. Install YubiKey tools

Download and install **YubiKey Manager** from Yubico.

This installs:

- YubiKey Manager GUI
- `ykman` CLI (used for PIV, keys, attestation)

Default install path:

```
C:\Program Files\Yubico\YubiKey Manager
```

---

## 2. Open PowerShell and add required tools to PATH (session only)

For signing and verification, these tools must be accessible:

- `ykman` (YubiKey Manager)
- `jsign` (signing with YubiKey via PKCS#11)
- `signtool` (verification and signature management)

Open **PowerShell as Administrator**, then run:

```powershell
cd $env:USERPROFILE\Desktop

# YubiKey Manager (ykman)
$env:PATH += ";C:\Program Files\Yubico\YubiKey Manager"

# Yubico PIV Tool (PKCS#11 library required by jsign)
$env:PATH += ";C:\Program Files\Yubico\Yubico PIV Tool\bin"

# Windows SDK signtool (resolve wildcard dynamically)
$signToolDir = (Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe" | Sort-Object FullName -Descending | Select-Object -First 1).DirectoryName
$env:PATH += ";$signToolDir"
```

Verify each tool:

```powershell
ykman list
ls "C:\Program Files\Yubico\Yubico PIV Tool\bin\libykcs11.dll"
signtool /?
```

---

## 3. Verify YubiKey connection

Make sure:

- YubiKey Manager GUI is **closed**
- The YubiKey is **physically connected** (not via RDP)

Run:

```
ykman list
```

Expected output example:

```
YubiKey 5C Nano FIPS (5.4.3) [OTP+FIDO+CCID]
```

---

## 4. Reset PIV application (recommended, destructive)

This deletes **all PIV keys and certificates** on the token.
Only do this at the **start** of the process.

```
ykman piv reset
```

Confirm with `y`.

Defaults after reset:

- PIN: `123456`
- PUK: `12345678`
- Management Key: default

---

## 5. (Optional) Change PIV PIN

PIN must be 6–8 digits.

```
ykman piv access change-pin
```

---

## 6. Generate private key on the YubiKey (ECC, no touch)

Using slot **9c (Digital Signature)**  
Algorithm: **ECC P-256 (required for SSL.com EV / YubiKey)**  
Touch policy: never

```
ykman piv keys generate \
 --algorithm ECCP256 \
 --pin-policy once \
 --touch-policy never \
 9c pubkey.pem
```

When prompted for Management Key:

- Press **Enter** (use default)

---

## 7. Generate CSR from the YubiKey

```
ykman piv certificates request 9c pubkey.pem codesign.csr -s "CN=Your Name"
```

Example:

```
ykman piv certificates request 9c pubkey.pem codesign.csr -s "CN=Yakov Kolani"
```

Enter PIN when prompted.

---

## 8. Generate attestation certificates

### 8.1 Generate attestation (for slot 9c)

```
ykman piv keys attest 9c attestation.crt
```

### 8.2 Export attestation intermediate (slot f9)

```
ykman piv certificates export f9 attestation-intermediate.crt
```

---

## 9. Submit attestation to SSL.com

1. Login to SSL.com
2. Go to **Orders**
3. Open the Code Signing order
4. **Manage → Attestation**
5. Paste:
    - `attestation.crt`
    - `attestation-intermediate.crt`
6. Submit

You should see **Successful attestation**.

---

## 10. Certificate re-issuance (SSL.com)

After approval:

- SSL.com **re-issues** the certificate bound to your YubiKey
- No additional payment required
- Cloud signing (eSigner) can be canceled if enabled

Download format:

- **YubiKey (DER)**

Important:

- Ensure the issued certificate is **ECC**, not RSA, before importing.

---

## 11. Install certificate into YubiKey

```
ykman piv certificates import 9c codesign.der
```

---

## 12. Verify certificate on the token

```
ykman piv certificates list
```

The certificate should appear in slot **9c**, and key + cert must match.

---

## 13. Clean existing signatures (recommended)

If the binary was previously signed (for example with a self-signed cert), remove old signatures first.

```powershell
signtool remove /s main.exe
```

Expected output:

```
Successfully committed changes to the file
```

---

## 14. Sign binary using YubiKey (jsign)

Signing is done locally using the YubiKey via PKCS#11.
The private key **never leaves the hardware**.

```powershell
jsign `
  --storetype YUBIKEY `
  --storepass <PIV_PIN> `
  --alias "X.509 Certificate for Digital Signature" `
  --tsaurl http://timestamp.digicert.com `
  main.exe
```

Notes:

- `--storepass` is the PIV PIN (default: `123456`)
- YubiKey presence is required
- Touch is not required if `touch-policy never` was used
- DigiCert timestamp is recommended for reliability

Successful output ends with:

```
Adding Authenticode signature to main.exe
```

---

## 15. Verify signature (final check)

Always verify using signtool:

```powershell
signtool verify /pa /v main.exe
```

Expected result:

- `Successfully verified`
- Signer: your name (SSL.com)
- Trusted certificate chain
- Timestamp present
- 0 warnings, 0 errors

---

## Notes on tooling choice

| Tool       | Role                                                      |
| ---------- | --------------------------------------------------------- |
| `jsign`    | Signing. Most reliable with YubiKey + PKCS#11 on Windows. |
| `signtool` | Verification, signature removal, and inspection.          |

This combination avoids Windows smart card / KSP edge cases and works consistently in local and CI environments.

---

## Notes

- RDP does **not** work with YubiKey PIV
- Physical access required for setup and signing
- `touch-policy never` allows automation (token presence still required)
- Unlimited signings
- Token reusable on renewal

---

## Summary

- Hardware-backed private key (YubiKey FIPS)
- SSL.com certificate bound via attestation
- No cloud signing
- No monthly limits
- Works on Windows, macOS, and Linux
