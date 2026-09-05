# Handoff

Sending audio from a phone to a running Vibe, over a direct
[iroh](https://iroh.computer) connection. No account, no server in the middle —
Vibe shows a QR code, the phone opens it, and the two talk peer to peer.

| Directory | What it is                                                                 |
| --------- | -------------------------------------------------------------------------- |
| `pwa/`    | The phone app. React + Vite, deployed with the website under `/phone/`.      |
| `wasm/`   | The iroh client the PWA runs, compiled to wasm. `chore phone-wasm` emits the bindings into `pwa/public/wasm/`. |
| `probe/`  | A CLI that impersonates the phone, for testing the desktop side without one. |

The desktop half lives in `desktop/src-tauri`.

## Working on it

```sh
just phone         # build the wasm, then run the PWA on http://localhost:8088
just phone-tunnel  # same, but over an HTTPS tunnel a real phone can load
just phone-probe '<pairing-url>' server/fixtures/single.wav
just phone-caps '<pairing-url>'
```

The pairing URL comes from Vibe → Settings → Phone.

## Paired devices

Scanning a QR exchanges its one-use invitation for a separate credential on the
phone. Vibe saves the device name, pairing date, ID, and a hash of that credential
in `handoff.pairing` in `app_config.json`. The browser keeps the credential in its
local storage. Device names describe the browser/platform, not the hardware's
private device name; separate browser profiles are separate devices.

The Phone settings page lists saved devices even when phone recordings are off.
Revoking a device blocks its future requests and interrupts its active handoff.
Refreshing the QR only replaces the invitation; other paired devices keep access.
A successful pairing consumes the invitation and returns settings to the device
list. Pairing survives app and phone browser restarts.

The updated PWA also supports older desktops: it uses the shared token only when
the desktop explicitly rejects the new pair operation and then authenticates a
capabilities request. It upgrades to a device credential when the desktop updates.
The PWA and wasm bundle must ship with the desktop protocol change. Older clients
that only send the QR token must update before pairing. The previous shared token
is migrated as an invitation; after one phone uses it, other old phones need to
scan a fresh QR.

Wire addition: `op: "pair"` sends `{token, deviceToken, deviceName}` and receives
`{type: "paired", deviceId}`. Both tokens are 32 hex characters. The phone saves
its random `deviceToken` **before** sending, then uses it as `token` for capabilities
and transcription. Repeating the pair request with the same authorized credential
returns the same device, making a lost response recoverable. A consumed invitation
cannot enroll another credential. A revoked credential cannot retry enrollment
without a new invitation.

For the native probe, add `--pair` when supplying an invitation. It enrolls a
visible “Handoff probe” device, which can be revoked from Phone settings. Optionally
pass `--device-token` with a random 32-hex credential to reuse it later through
`--peer <endpoint-id>:<device-token>` without `--pair`.
