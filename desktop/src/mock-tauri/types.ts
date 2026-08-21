// Browser-mode mock of the Tauri runtime (dev only, tree-shaken from real builds).
// A handler receives the invoke args (camelCase keys, exactly as the frontend sends them)
// and returns the value the real Rust command would resolve with.
// Reject by throwing; `transcribe` errors must throw `{ code, message }` objects.
export type CommandHandler = (args: Record<string, unknown>) => unknown | Promise<unknown>

export type CommandHandlerMap = Record<string, CommandHandler>
