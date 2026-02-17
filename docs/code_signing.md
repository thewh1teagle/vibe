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

On macOS:

```
brew install oath-toolkit
oathtool --totp -b <BASE32_SECRET>
```

The generated 6-digit code should match Google Authenticator
at the same moment.

If it matches, your TOTP setup is correct.

---

## 6. Minimal signing command (PowerShell)

Set the required environment variables:

```
$env:SSL_COM_CREDENTIAL_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
$env:SSL_COM_USERNAME="your@email.com"
$env:SSL_COM_PASSWORD="your_ssl_com_password"
$env:SSL_COM_TOTP_SECRET="BASE32_SECRET"
```

Sign a file:

```
codesigntool sign `  --credential-id $env:SSL_COM_CREDENTIAL_ID`
--input path\to\file.exe
```

Optional verification:

```
codesigntool verify path\to\file.exe
```

---

## Summary

- Buy a Code Signing certificate
- Enable eSigner during checkout
- Complete validation
- Retrieve Credential ID and TOTP secret from Orders
- Verify TOTP once
- Use CodeSignTool with environment variables in CI

That’s it.
