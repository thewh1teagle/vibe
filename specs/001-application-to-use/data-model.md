# Data Model

## Entities

### AudioFile

-   **path**: String - Absolute file path to the audio file
-   **format**: String - Audio format (e.g., "wav", "mp3")
-   **duration**: f64 - Duration in seconds
-   **size**: u64 - File size in bytes

### TranscriptionResult

-   **text**: String - Full transcribed text
-   **segments**: Vec<Segment> - Timed segments of transcription
-   **duration**: f64 - Total duration processed

### Segment

-   **start**: f64 - Start time in seconds
-   **end**: f64 - End time in seconds
-   **text**: String - Text for this segment

## Relationships

-   TranscriptionResult is generated from AudioFile
-   Segments belong to TranscriptionResult

## Validation Rules

-   AudioFile.path must be valid and readable
-   TranscriptionResult.segments must be non-empty and ordered by start time
