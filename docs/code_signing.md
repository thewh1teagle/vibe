# SSL.com eSigner Cloud Code Signing (CI friendly)

This guide explains how to buy and use an SSL.com Code Signing certificate
with eSigner cloud signing (no USB token, no YubiKey) and how to sign binaries
automatically in CI.

---

## 1. What to buy (important)

On SSL.com, buy a **Code Signing Certificate**.

During checkout, you MUST enable eSigner cloud signing.

Look for this checkbox and make sure it is checked:

```
Enable certificate issuance for remote signing, team sharing,
and presign malware scanning
```

If this box is NOT checked:

- eSigner credentials will NOT be created
- you will NOT get a Credential ID
- the certificate cannot be fixed after issuance

---

## 2. Validation (what to expect)

After purchase, SSL.com will perform standard validation
(identity, email, phone – depends on certificate type).

Once validation is complete and the certificate is issued,
you can continue.

---

## 3. Where to find the eSigner credentials

After issuance:

1. Go to SSL.com Dashboard
2. Open Orders
3. Find your Code Signing order
4. Click Download
5. Scroll to SIGNING CREDENTIALS

You should see:

- Credential ID (UUID)
- signing credential status = enabled

Example:

```
SSL_COM_CREDENTIAL_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

---

## 4. Enable TOTP (one-time setup)

In the same Order page, find the eSigner PIN / QR code section.

Steps:

1. Set a 4-digit PIN
2. Choose OTP App
3. Generate QR code
4. Save BOTH:
    - the QR code
    - the Base32 secret shown as text

The Base32 secret looks like:

```
UFZ3SGLG1KVDIDE3KWJEKVAGG24S5PWDQMQTPBAAJDSC566KKFGB
```

This value is your TOTP secret.

---

## 5. Verify TOTP works (recommended)

Generate a code and compare it against Google Authenticator at the same moment.

On macOS:

```
brew install oath-toolkit
oathtool --totp -b <BASE32_SECRET>
```

On Windows (with uv):

```powershell
uv run --with pyotp python -c "import pyotp; print(pyotp.TOTP('<BASE32_SECRET>').now())"
```

If the 6-digit code matches Google Authenticator, your TOTP setup is correct.

---

## 6. How signing works with Tauri

Tauri calls a custom sign command for every binary it wants to sign
(main exe, sidecars, NSIS plugins, installer, etc.).

We use `scripts/sign_windows.py` as that command. It **whitelists**
only the files worth signing and skips everything else, keeping us
under the eSigner monthly signing limit.

What gets signed:

- `vibe.exe` (main app)
- `vibe-*setup*.exe` (NSIS installer)

What gets skipped:

- Sidecars (ffmpeg, sona, sona-diarize)
- NSIS plugins and resource DLLs

### Tauri config

In `desktop/src-tauri/tauri.windows.conf.json`:

```json
"signCommand": {
  "cmd": "python",
  "args": ["scripts/sign_windows.py", "%1"]
}
```

Tauri passes `%1` as the file path. The script checks the filename
against the whitelist and either signs or skips.

### Prerequisites

```
choco install jsign
choco install temurin
```

### Required env vars

```
SSL_COM_CREDENTIAL_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SSL_COM_USERNAME=your@email.com
SSL_COM_PASSWORD=your_ssl_com_password
SSL_COM_TOTP_SECRET=BASE32_SECRET
```

### Manual signing

```
uv run scripts/sign_windows.py path\to\file.exe
```

### Verification

```powershell
signtool verify /pa /v path\to\file.exe
```

---

## Summary

- Buy a Code Signing certificate
- Enable eSigner during checkout
- Complete validation
- Retrieve Credential ID and TOTP secret from Orders
- Verify TOTP once
- `scripts/sign_windows.py` handles signing via Jsign + whitelist
- Tauri calls it automatically via `signCommand` in config

That's it.
