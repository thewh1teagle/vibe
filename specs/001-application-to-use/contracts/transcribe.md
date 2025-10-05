# Transcribe Contract

## Endpoint: transcribe

**Method**: Internal function call

**Input**:

-   audio_path: String - Path to audio file

**Output**:

-   Result<TranscriptionResult> - Success with transcription data or error

**Behavior**:

-   Processes audio file using faster-whisper
-   Returns structured transcription result
-   Fails with error message if model loading fails

**Constraints**:

-   Offline operation only
-   Supports specified audio formats
-   Achieves 2x speed improvement
