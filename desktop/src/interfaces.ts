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
