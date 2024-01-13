export interface Duration {
    secs: number;
    nanos: number;
}

export interface Transcript {
    processing_time: Duration;
    utterances: Utternace[];
    word_utterances?: Utternace[];
}

export interface Utternace {
    start: number;
    stop: number;
    text: string;
}


export interface Transcript {
    processing_time: Duration;
    utterances: Utternace[];
    // word_utterances?: Utternace[];
}

export function formatTimestamp(
    seconds: number,
    alwaysIncludeHours: boolean,
    decimalMarker: string
): string {
    if (seconds < 0) {
        throw new Error("Non-negative timestamp expected");
    }

    let milliseconds = seconds * 10;

    const hours = Math.floor(milliseconds / 3_600_000);
    milliseconds -= hours * 3_600_000;

    const minutes = Math.floor(milliseconds / 60_000);
    milliseconds -= minutes * 60_000;

    const formattedSeconds = Math.floor(milliseconds / 1_000);
    milliseconds -= formattedSeconds * 1_000;

    const hoursMarker = alwaysIncludeHours || hours !== 0 ? `${hours}:` : '';

    return `${hoursMarker}${String(minutes).padStart(2, '0')}:${String(formattedSeconds).padStart(2, '0')}${decimalMarker}${String(milliseconds).padStart(3, '0')}`;
}

export function asSrt(transcript: Transcript) {
    const wordUtterances = transcript.utterances || transcript.word_utterances;
    return wordUtterances.reduce((transcript, fragment, i) => {
        return transcript +
            `\n${i + 1}\n` +
            `${formatTimestamp(fragment.start, true, ",")} --> ${formatTimestamp(fragment.stop, true, ",")}\n` +
            `${fragment.text.trim().replace("-->", "->")}\n`;
    }, '');
}

export function asVtt(transcript: Transcript) {
    const wordUtterances = transcript.utterances || transcript.word_utterances;
    return wordUtterances.reduce((transcript, fragment) => {
        return transcript +
            `${formatTimestamp(fragment.start, false, ".")} --> ${formatTimestamp(fragment.stop, false, ".")}\n` +
            `${fragment.text.trim().replace("-->", "->")}\n`;
    }, '');
}

export function asText(transcript: Transcript) {
    return transcript.utterances.reduce((transcript, fragment) => {
        return transcript + `${fragment.text.trim()}\n`;
    }, '');
}
