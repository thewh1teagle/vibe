# Debug Upload Error — Session 001

## Context

Testing Sona transcription server with a large file to validate upload and streaming behavior.

## Environment

- **Sona binary**: `/Users/yqbqwlny/Documents/audio/sona-repo/sona`
- **Server started**: `./sona serve` (no model preloaded)
- **Port**: `54810` (auto-assigned)
- **Ready signal**: `{"port":54810,"status":"ready"}`

## Model

- **File**: `/Users/yqbqwlny/Documents/audio/sona-repo/sonapy/ggml-tiny.bin` (77 MB, whisper tiny)
- **Loaded via**:
  ```bash
  curl -s -X POST http://127.0.0.1:54810/v1/models/load \
    -H 'Content-Type: application/json' \
    -d '{"path":"/Users/yqbqwlny/Documents/audio/sona-repo/sonapy/ggml-tiny.bin"}'
  ```
- **Response**: `{"model":"ggml-tiny.bin","status":"loaded"}`

## Test File

- **File**: `/Users/yqbqwlny/Documents/audio/sona-repo/big.mp4`
- **Size**: 2.4 GB
- **Content**: Dexter TV episode (audio + video)

## Transcription Request

```bash
curl -X POST http://127.0.0.1:54810/v1/audio/transcriptions \
  -F "file=@/Users/yqbqwlny/Documents/audio/sona-repo/big.mp4" \
  -F "response_format=verbose_json" \
  -F "stream=true" \
  --no-buffer
```

## Results

- **Upload**: 2.4 GB uploaded successfully in ~3 seconds
- **Server accepted the file** — no 413 or size limit error
- **Max upload limit**: 15 GB (not 1 GB as docs/ARCHITECTURE.md states)
- **Streaming worked**: ndjson segments emitted in real-time
- **Progress events**: `{"progress":0,"type":"progress"}` through `{"progress":4,"type":"progress"}` observed
- **Segments**: Timestamped text segments with `start`, `end`, `text` fields
- **Audio decoding**: Server decoded MP4 (video container) successfully via ffmpeg fallback path

## Sample Output (first ~100 lines)

```jsonl
{"progress":0,"type":"progress"}
{"end":2,"start":0,"text":" [music playing]","type":"segment"}
{"end":4,"start":2,"text":" [music playing]","type":"segment"}
{"end":12,"start":10,"text":" Previously on Dexter,","type":"segment"}
{"end":15,"start":12,"text":" if I do happen to find her, you'll get your reward money.","type":"segment"}
{"end":18,"start":17,"text":" Federal Marshall.","type":"segment"}
{"end":19,"start":18,"text":" Dexter, Morgan.","type":"segment"}
...
{"progress":4,"type":"progress"}
{"end":295,"start":293,"text":" I didn't know how to help you.","type":"segment"}
```

## Key Observations

1. **2.4 GB MP4 uploads work** — server handles large files without issue
2. **Streaming ndjson format works** — segments arrive incrementally during inference
3. **ffmpeg fallback path works** — MP4 container decoded correctly
4. **Progress is coarse with tiny model** — jumps in 1% increments over long audio
5. **ARCHITECTURE.md is out of date** — says 1 GB max, actual limit is 15 GB

## API Endpoints Verified

| Endpoint | Method | Status |
|---|---|---|
| `/ready` | GET | `{"message":"no model loaded","status":"not_ready"}` (before load) |
| `/v1/models/load` | POST | `{"model":"ggml-tiny.bin","status":"loaded"}` |
| `/v1/audio/transcriptions` | POST | Streaming segments returned successfully |
