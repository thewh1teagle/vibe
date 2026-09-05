# macOS Developer ID Signing & Notarization

Complete guide for signing and notarizing a macOS app (Tauri) for distribution
outside the App Store using a Developer ID Application certificate.

Prerequisite: an approved Apple Developer Program enrollment ($99/year).

---

## 1. Create a Certificate Signing Request (CSR)

1. Open **Keychain Access** on your Mac
2. Menu: **Keychain Access** > **Certificate Assistant** > **Request a Certificate from a Certificate Authority**
3. Enter your email address and common name
4. Select **Saved to disk**
5. Save the `.certSigningRequest` file

This creates a key pair (private key) in your **login** keychain automatically.

## 2. Create the Developer ID Application certificate

1. Go to [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/certificates/list)
2. Click **Create a Certificate** (+ button)
3. Select **Developer ID Application**
4. Select **G2 Sub-CA** (recommended)
5. Upload the CSR from step 1
6. Download the resulting `.cer` file

> **Note:** Only the Apple Developer Account Holder can create
> Developer ID Application certificates.

## 3. Install the certificate

1. Double-click the downloaded `.cer` file
2. Install it into the **login** keychain (not iCloud)
3. Verify in Keychain Access that the certificate appears under **My Certificates**
   with a private key attached (expandable arrow)

## 4. Install the intermediate certificate (critical)

The G2 Sub-CA requires the Apple intermediate certificate to complete the trust chain.
**macOS does not always have this preinstalled.**

Without it, `security find-identity -p codesigning` will show:

```
1 matching identity
0 valid identities
```

This looks like an ACL/permissions issue but is actually a broken certificate chain.

### Fix

1. Go to [Apple Certificate Authority](https://www.apple.com/certificateauthority/)
2. Download:
    - **Developer ID - G2** (Expiring 09/17/2031)
    - **Apple Root CA - G2** (if not already in System Roots)
3. Double-click each file to install into the **login** keychain
4. In Keychain Access, verify trust is set to **Use System Defaults** for each certificate

### Verify the chain

Open the Developer ID Application certificate in Keychain Access. The trust chain should show:

```
Apple Root CA - G2
  └── Developer ID Certification Authority (G2)
      └── Developer ID Application: Your Name (TEAMID)
```

If any link shows a red X, the chain is broken.

### Verify the identity

```bash
security find-identity -v -p codesigning
```

Expected output:

```
1 valid identity found
```

## 5. Local signing with Tauri

Set the signing identity in `tauri.conf.json`:

```json
{
	"bundle": {
		"macOS": {
			"signingIdentity": "Developer ID Application: Your Name (TEAMID)"
		}
	}
}
```

Or set the environment variable:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
```

Run `tauri build`. Tauri will automatically:

- Sign all binaries with `codesign`
- Apply hardened runtime

### Verify signing

```bash
codesign --verify --deep --strict /path/to/YourApp.app
spctl --assess --type exec /path/to/YourApp.app
```

## 6. Notarization

Notarization is **required** for Developer ID Application certificates.
Tauri handles submission, polling, and stapling automatically.

### Generate an App-Specific Password

Apple does not accept your regular Apple ID password for notarization.

1. Go to [appleid.apple.com](https://appleid.apple.com)
2. Navigate to **Sign-In and Security** > **App-Specific Passwords**
3. Generate a new password and save it

### Set environment variables

```bash
export APPLE_ID="your@email.com"
export APPLE_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="TEAMID"
```

Find your team ID:

```bash
security find-identity -v -p codesigning
# Look for the 10-character code in parentheses: (TEAMID)
```

Run `tauri build` again. Tauri will:

1. Submit the app to Apple for notarization
2. Wait for Apple's response
3. Staple the notarization ticket to the app

### Notarization can be slow

First-time notarization for a new app/certificate can take **hours** on Apple's servers,
especially for large payloads. This is normal.

You can safely **Ctrl+C** the Tauri build after the submission is uploaded — the process
runs entirely on Apple's side. Then check the status manually:

```bash
xcrun notarytool history \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID"
```

Once the status changes from "In Progress", view the submission log:

```bash
xcrun notarytool log <submission-id> \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID"
```

The log shows detailed results and rejection reasons if any. It is only available
after Apple finishes processing (not while "In Progress").

If notarization stays stuck for 12+ hours, contact
[Apple Developer Support](https://developer.apple.com/contact/) — they may need
to manually configure your team for notarization.

Once the status shows **Accepted**, staple the ticket manually:

```bash
xcrun stapler staple /path/to/vibe.app
```

Stapling is per `.app` bundle — it covers all binaries inside it. No need to staple
individual binaries.

Subsequent notarizations should be much faster.

## 7. CI/CD setup (GitHub Actions)

### Export the certificate

1. Open **Keychain Access** > **login** keychain > **My Certificates**
2. Find your Developer ID Application certificate
3. Right-click the certificate > **Export**
4. Save as `.p12` format with a strong password

### Base64-encode the certificate

```bash
openssl base64 -A -in /path/to/certificate.p12 -out certificate-base64.txt
```

### Set GitHub Actions secrets

| Secret                       | Value                                              |
| ---------------------------- | -------------------------------------------------- |
| `APPLE_CERTIFICATE`          | Contents of `certificate-base64.txt`               |
| `APPLE_CERTIFICATE_PASSWORD` | The `.p12` export password                         |
| `APPLE_SIGNING_IDENTITY`     | `Developer ID Application: Your Name (TEAMID)`     |
| `APPLE_ID`                   | Your Apple ID email                                |
| `APPLE_PASSWORD`             | App-specific password (not your Apple ID password) |
| `APPLE_TEAM_ID`              | Your 10-character team ID                          |

Set them via CLI. `gh secret set` targets the repo in your current directory.
To verify which repo that is:

```bash
gh repo view --json nameWithOwner -q .nameWithOwner
```

Then set the secrets:

```bash
gh secret set APPLE_CERTIFICATE -b "<contents of certificate-base64.txt>"
gh secret set APPLE_CERTIFICATE_PASSWORD -b "your-p12-password"
gh secret set APPLE_SIGNING_IDENTITY -b "Developer ID Application: Your Name (TEAMID)"
gh secret set APPLE_ID -b "your@email.com"
gh secret set APPLE_PASSWORD -b "your-app-specific-password"
gh secret set APPLE_TEAM_ID -b "TEAMID"
```

After setting secrets, delete the local files:

```bash
rm certificate.p12 certificate-base64.txt
```

---

## Troubleshooting

### "1 matching identity, 0 valid identities"

**Cause:** Missing intermediate certificate (Apple Developer ID G2).

**Fix:** Download and install the intermediate from
[Apple Certificate Authority](https://www.apple.com/certificateauthority/).
See [step 4](#4-install-the-intermediate-certificate-critical).

This is the most common issue. It looks like an ACL/permissions problem
but is almost always a broken certificate chain.

### Other things to check

- Verify trust settings are "Use System Defaults" (not manually overridden)
- Verify the private key is in the **login** keychain (not iCloud)
- Run `security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "PASSWORD" ~/Library/Keychains/login.keychain-db`
  to reset key ACLs
- Restart `securityd`: `sudo killall securityd`

### "internal error in Code Signing subsystem"

Usually the same root cause as "0 valid identities". Fix the trust chain first.

### Notarization 401 error

**Cause:** Using your regular Apple ID password instead of an App-Specific Password.

**Fix:** Generate an App-Specific Password at
[appleid.apple.com](https://appleid.apple.com). See [step 6](#6-notarization).

### Certificate not appearing in "My Certificates"

The certificate is not properly associated with a private key in your keychain.
Re-create the CSR and certificate from the same Mac where the private key was generated.
