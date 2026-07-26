# Windows Code Signing (SSL.com eSigner)

Cloud-based code signing via SSL.com eSigner and Jsign.
No USB token or YubiKey required.

---

## 1. Purchase a certificate

On [SSL.com](https://www.ssl.com), buy a **Code Signing Certificate**.

During checkout, you **must** enable eSigner cloud signing.
Look for this checkbox and make sure it is checked:

```
Enable certificate issuance for remote signing, team sharing,
and presign malware scanning
```

If this box is **not** checked:

- eSigner credentials will not be created
- You will not get a Credential ID
- The certificate cannot be fixed after issuance — you must buy a new one

## 2. Validation

After purchase, SSL.com performs standard validation
(identity, email, phone — depends on certificate type).

Once validation is complete and the certificate is issued, continue to the next step.

## 3. Find your eSigner credentials

After issuance:

1. Go to the SSL.com Dashboard
2. Open **Orders**
3. Find your Code Signing order
4. Click **Download**
5. Scroll to **SIGNING CREDENTIALS**

You should see:

- **Credential ID** (UUID format)
- Signing credential status: **enabled**

Example:

```
SSL_COM_CREDENTIAL_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

## 4. Enable TOTP (one-time setup)

In the same Order page, find the eSigner PIN / QR code section.

1. Set a 4-digit PIN
2. Choose **OTP App**
3. Generate QR code
4. Save **both**:
    - The QR code (for your authenticator app)
    - The **Base32 secret** shown as text

The Base32 secret looks like:

```
UFZ3SGLG1KVDIDE3KWJEKVAGG24S5PWDQMQTPBAAJDSC566KKFGB
```

This value is your TOTP secret for CI.

### Verify TOTP works (recommended)

Generate a code and compare it against your authenticator app at the same moment.

On macOS:

```bash
brew install oath-toolkit
oathtool --totp -b <BASE32_SECRET>
```

On Windows (with uv):

```powershell
uv run --with pyotp python -c "import pyotp; print(pyotp.TOTP('<BASE32_SECRET>').now())"
```

If the 6-digit code matches your authenticator app, your TOTP setup is correct.

## 5. Prerequisites

Install on the signing machine (or CI runner):

```
choco install jsign
choco install temurin
```

Jsign requires a Java runtime. Temurin (Eclipse Adoptium) is recommended.

## 6. How signing works with Tauri

Tauri calls a custom sign command for every binary it produces
(main exe, sidecars, NSIS plugins, installer, etc.).

The project uses `scripts/sign_windows.py` as that command. It **whitelists**
only specific files and skips everything else, keeping usage under the eSigner
monthly signing limit.

### What gets signed

- `vibe.exe` (main app)
- `vibe-*setup*.exe` (NSIS installer)

### What gets skipped

- Sidecars (ffmpeg, etc.)
- NSIS plugins and resource DLLs

By default the script runs in **dry run** mode.
Set `SIGN_ENABLED=true` to actually sign.

### Tauri configuration

In `desktop/src-tauri/tauri.windows.conf.json`:

```json
{
	"windows": {
		"signCommand": {
			"cmd": "python",
			"args": ["scripts/sign_windows.py", "%1"]
		}
	}
}
```

Tauri passes `%1` as the file path. The script checks the filename
against the whitelist and either signs or skips.

## 7. Required environment variables

```
SIGN_ENABLED=true
SSL_COM_CREDENTIAL_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SSL_COM_USERNAME=your@email.com
SSL_COM_PASSWORD=your_ssl_com_password
SSL_COM_TOTP_SECRET=BASE32_SECRET
```

## 8. Manual signing

```
uv run scripts/sign_windows.py path\to\file.exe
```

## 9. Verification

```powershell
signtool verify /pa /v path\to\file.exe
```

Or with the full path to signtool:

```powershell
& "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" verify /pa /v path\to\file.exe
```

---

## CI/CD setup (GitHub Actions)

### Set GitHub Actions secrets

| Secret                  | Value                             |
| ----------------------- | --------------------------------- |
| `SSL_COM_CREDENTIAL_ID` | Your eSigner credential ID (UUID) |
| `SSL_COM_USERNAME`      | Your SSL.com account email        |
| `SSL_COM_PASSWORD`      | Your SSL.com account password     |
| `SSL_COM_TOTP_SECRET`   | eSigner TOTP Base32 secret        |

The workflow sets `SIGN_ENABLED=true` and passes these secrets
to the signing script.

### Set secrets via CLI

```bash
gh secret set SSL_COM_CREDENTIAL_ID -b "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
gh secret set SSL_COM_USERNAME -b "your@email.com"
gh secret set SSL_COM_PASSWORD -b "your-password"
gh secret set SSL_COM_TOTP_SECRET -b "BASE32_SECRET"
```

---

## Troubleshooting

### "eSigner credentials not found"

You did not enable the eSigner checkbox during certificate purchase.
This cannot be fixed after issuance — you must purchase a new certificate
with eSigner enabled.

### TOTP codes not working

- Verify the Base32 secret is correct by comparing generated codes with
  your authenticator app
- Jsign expects the TOTP secret in Base64 — the `sign_windows.py` script
  handles this conversion automatically
- Ensure your system clock is synchronized (TOTP is time-based)

### "jsign.jar not found"

Install Jsign via Chocolatey:

```
choco install jsign
```

The script checks `C:\ProgramData\chocolatey\lib\jsign\tools\jsign.jar`
and the system PATH.

### Signing limit exceeded

eSigner has a monthly signing limit depending on your tier.
The whitelist in `sign_windows.py` keeps usage low by only signing
the main executable and installer. If you hit the limit, consider
upgrading your eSigner plan.
