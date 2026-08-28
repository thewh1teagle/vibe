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
just phone-probe '<pairing-url>' samples/single.wav
just phone-caps '<pairing-url>'
```

The pairing URL comes from Vibe → Settings → Phone.
