# Sona is a Runner, Not a Service

Follow-up to `managed-service_001.md`. Clarifies the mental model that simplifies all architectural decisions.

## The distinction

A **service** implies shared access, queuing, multi-tenancy, uptime guarantees. Sona is a **runner** — one owner, one job, deterministic behavior. The parent process spawns it, owns it, and talks to it 1:1.

The HTTP API isn't there because Sona is a "service" — it's there because HTTP is the most universal IPC. Every language has an HTTP client. No FFI, no custom socket protocol, no protobuf. It's just the transport.

The mental model is closer to how **LSP** works — VS Code spawns a language server as a child process, talks to it over JSON-RPC, and owns its lifecycle completely. Sona is that, but for transcription, over HTTP instead of JSON-RPC.

## What this simplifies

Because Sona has a single owner, not multiple clients:

| Concern | Service would need | Runner doesn't |
|---------|-------------------|----------------|
| Auth | API keys, tokens | Nothing — parent spawned you, parent owns you |
| Multi-model | Load balancing across models | One owner, one model |
| Queuing | Job queue, priority, max depth | One owner, one job. Reject concurrent with 429 |
| Discovery | Service registry, DNS | Parent spawned you, parent knows your port |
| Uptime | Health monitors, auto-restart, watchdogs | Parent restarts you if you crash |
| Multi-tenancy | Isolation, rate limiting, quotas | Single tenant by definition |

## Concurrency model

```
mutex.TryLock() → got it → transcribe → unlock
                → didn't get it → 429
```

One model loaded. One transcription at a time. Second request gets rejected, not queued. This is correct because the parent controls the flow — Vibe sends one file at a time, a Python script loops sequentially. A 429 on a concurrent request means a bug in the client, not a limitation of Sona.

No queue, no job IDs, no pending state. One `if` statement.

## What stays from 001/002

The runner framing doesn't change the API surface — it simplifies what's behind it:

- Health/ready endpoints — still needed (parent checks before sending work)
- Model load/unload API — still needed (parent decides which model, when)
- Port 0 + stdout ready signal — still needed (parent discovers the port). Port 0 (OS-assigned ephemeral port) is standard TCP and works cross-platform (Linux, macOS, Windows). In Go: `net.Listen("tcp", ":0")` then `listener.Addr().(*net.TCPAddr).Port`. Bind first, get the port, then print the ready signal — if you print before binding and the bind fails, the parent has a dead address.
- Graceful SIGTERM — still needed (parent shuts you down cleanly)
- Streaming segments — still needed (parent wants real-time progress)
- `response_format` with timestamps — still needed (parent needs structured output)

What's removed:

- No auth
- No job queue
- No multi-model
- No service discovery
- No daemon management (systemd, launchd) — parent IS the daemon manager
