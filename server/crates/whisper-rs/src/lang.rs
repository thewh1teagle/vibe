//! The whisper language table, ported verbatim from whisper.cpp `g_lang`.
//! Index in this slice is the language id.

pub(crate) const LANGUAGES: &[(&str, &str)] = &[
    ("en", "english"), // 0
    ("zh", "chinese"), // 1
    ("de", "german"), // 2
    ("es", "spanish"), // 3
    ("ru", "russian"), // 4
    ("ko", "korean"), // 5
    ("fr", "french"), // 6
    ("ja", "japanese"), // 7
    ("pt", "portuguese"), // 8
    ("tr", "turkish"), // 9
    ("pl", "polish"), // 10
    ("ca", "catalan"), // 11
    ("nl", "dutch"), // 12
    ("ar", "arabic"), // 13
    ("sv", "swedish"), // 14
    ("it", "italian"), // 15
    ("id", "indonesian"), // 16
    ("hi", "hindi"), // 17
    ("fi", "finnish"), // 18
    ("vi", "vietnamese"), // 19
    ("he", "hebrew"), // 20
    ("uk", "ukrainian"), // 21
    ("el", "greek"), // 22
    ("ms", "malay"), // 23
    ("cs", "czech"), // 24
    ("ro", "romanian"), // 25
    ("da", "danish"), // 26
    ("hu", "hungarian"), // 27
    ("ta", "tamil"), // 28
    ("no", "norwegian"), // 29
    ("th", "thai"), // 30
    ("ur", "urdu"), // 31
    ("hr", "croatian"), // 32
    ("bg", "bulgarian"), // 33
    ("lt", "lithuanian"), // 34
    ("la", "latin"), // 35
    ("mi", "maori"), // 36
    ("ml", "malayalam"), // 37
    ("cy", "welsh"), // 38
    ("sk", "slovak"), // 39
    ("te", "telugu"), // 40
    ("fa", "persian"), // 41
    ("lv", "latvian"), // 42
    ("bn", "bengali"), // 43
    ("sr", "serbian"), // 44
    ("az", "azerbaijani"), // 45
    ("sl", "slovenian"), // 46
    ("kn", "kannada"), // 47
    ("et", "estonian"), // 48
    ("mk", "macedonian"), // 49
    ("br", "breton"), // 50
    ("eu", "basque"), // 51
    ("is", "icelandic"), // 52
    ("hy", "armenian"), // 53
    ("ne", "nepali"), // 54
    ("mn", "mongolian"), // 55
    ("bs", "bosnian"), // 56
    ("kk", "kazakh"), // 57
    ("sq", "albanian"), // 58
    ("sw", "swahili"), // 59
    ("gl", "galician"), // 60
    ("mr", "marathi"), // 61
    ("pa", "punjabi"), // 62
    ("si", "sinhala"), // 63
    ("km", "khmer"), // 64
    ("sn", "shona"), // 65
    ("yo", "yoruba"), // 66
    ("so", "somali"), // 67
    ("af", "afrikaans"), // 68
    ("oc", "occitan"), // 69
    ("ka", "georgian"), // 70
    ("be", "belarusian"), // 71
    ("tg", "tajik"), // 72
    ("sd", "sindhi"), // 73
    ("gu", "gujarati"), // 74
    ("am", "amharic"), // 75
    ("yi", "yiddish"), // 76
    ("lo", "lao"), // 77
    ("uz", "uzbek"), // 78
    ("fo", "faroese"), // 79
    ("ht", "haitian creole"), // 80
    ("ps", "pashto"), // 81
    ("tk", "turkmen"), // 82
    ("nn", "nynorsk"), // 83
    ("mt", "maltese"), // 84
    ("sa", "sanskrit"), // 85
    ("lb", "luxembourgish"), // 86
    ("my", "myanmar"), // 87
    ("bo", "tibetan"), // 88
    ("tl", "tagalog"), // 89
    ("mg", "malagasy"), // 90
    ("as", "assamese"), // 91
    ("tt", "tatar"), // 92
    ("haw", "hawaiian"), // 93
    ("ln", "lingala"), // 94
    ("ha", "hausa"), // 95
    ("ba", "bashkir"), // 96
    ("jw", "javanese"), // 97
    ("su", "sundanese"), // 98
    ("yue", "cantonese"), // 99
];

/// `whisper_lang_id`: resolve a language code or full name to its id.
pub(crate) fn lang_id(lang: &str) -> Option<usize> {
    LANGUAGES
        .iter()
        .position(|(code, full)| *code == lang || *full == lang)
}

pub(crate) fn lang_str(id: usize) -> Option<&'static str> {
    LANGUAGES.get(id).map(|(code, _)| *code)
}

#[allow(dead_code)]
pub(crate) fn max_lang_id() -> usize {
    LANGUAGES.len() - 1
}
