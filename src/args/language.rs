#[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord, clap::ValueEnum, Debug)]
pub enum Language {
    #[clap(name = "auto")]
    Auto,
    #[clap(name = "en")]
    English,
    #[clap(name = "zh")]
    Chinese,
    #[clap(name = "de")]
    German,
    #[clap(name = "es")]
    Spanish,
    #[clap(name = "ru")]
    Russian,
    #[clap(name = "ko")]
    Korean,
    #[clap(name = "fr")]
    French,
    #[clap(name = "ja")]
    Japanese,
    #[clap(name = "pt")]
    Portuguese,
    #[clap(name = "tr")]
    Turkish,
    #[clap(name = "pl")]
    Polish,
    #[clap(name = "ca")]
    Catalan,
    #[clap(name = "nl")]
    Dutch,
    #[clap(name = "ar")]
    Arabic,
    #[clap(name = "sv")]
    Swedish,
    #[clap(name = "it")]
    Italian,
    #[clap(name = "id")]
    Indonesian,
    #[clap(name = "hi")]
    Hindi,
    #[clap(name = "fi")]
    Finnish,
    #[clap(name = "vi")]
    Vietnamese,
    #[clap(name = "he")]
    Hebrew,
    #[clap(name = "uk")]
    Ukrainian,
    #[clap(name = "el")]
    Greek,
    #[clap(name = "ms")]
    Malay,
    #[clap(name = "cs")]
    Czech,
    #[clap(name = "ro")]
    Romanian,
    #[clap(name = "da")]
    Danish,
    #[clap(name = "hu")]
    Hungarian,
    #[clap(name = "ta")]
    Tamil,
    #[clap(name = "no")]
    Norwegian,
    #[clap(name = "th")]
    Thai,
    #[clap(name = "ur")]
    Urdu,
    #[clap(name = "hr")]
    Croatian,
    #[clap(name = "bg")]
    Bulgarian,
    #[clap(name = "lt")]
    Lithuanian,
    #[clap(name = "la")]
    Latin,
    #[clap(name = "mi")]
    Maori,
    #[clap(name = "ml")]
    Malayalam,
    #[clap(name = "cy")]
    Welsh,
    #[clap(name = "sk")]
    Slovak,
    #[clap(name = "te")]
    Telugu,
    #[clap(name = "fa")]
    Persian,
    #[clap(name = "lv")]
    Latvian,
    #[clap(name = "bn")]
    Bengali,
    #[clap(name = "sr")]
    Serbian,
    #[clap(name = "az")]
    Azerbaijani,
    #[clap(name = "sl")]
    Slovenian,
    #[clap(name = "kn")]
    Kannada,
    #[clap(name = "et")]
    Estonian,
    #[clap(name = "mk")]
    Macedonian,
    #[clap(name = "br")]
    Breton,
    #[clap(name = "eu")]
    Basque,
    #[clap(name = "is")]
    Icelandic,
    #[clap(name = "hy")]
    Armenian,
    #[clap(name = "ne")]
    Nepali,
    #[clap(name = "mn")]
    Mongolian,
    #[clap(name = "bs")]
    Bosnian,
    #[clap(name = "kk")]
    Kazakh,
    #[clap(name = "sq")]
    Albanian,
    #[clap(name = "sw")]
    Swahili,
    #[clap(name = "gl")]
    Galician,
    #[clap(name = "mr")]
    Marathi,
    #[clap(name = "pa")]
    Punjabi,
    #[clap(name = "si")]
    Sinhala,
    #[clap(name = "km")]
    Khmer,
    #[clap(name = "sn")]
    Shona,
    #[clap(name = "yo")]
    Yoruba,
    #[clap(name = "so")]
    Somali,
    #[clap(name = "af")]
    Afrikaans,
    #[clap(name = "oc")]
    Occitan,
    #[clap(name = "ka")]
    Georgian,
    #[clap(name = "be")]
    Belarusian,
    #[clap(name = "tg")]
    Tajik,
    #[clap(name = "sd")]
    Sindhi,
    #[clap(name = "gu")]
    Gujarati,
    #[clap(name = "am")]
    Amharic,
    #[clap(name = "yi")]
    Yiddish,
    #[clap(name = "lo")]
    Lao,
    #[clap(name = "uz")]
    Uzbek,
    #[clap(name = "fo")]
    Faroese,
    #[clap(name = "ht")]
    HaitianCreole,
    #[clap(name = "ps")]
    Pashto,
    #[clap(name = "tk")]
    Turkmen,
    #[clap(name = "nn")]
    Nynorsk,
    #[clap(name = "mt")]
    Maltese,
    #[clap(name = "sa")]
    Sanskrit,
    #[clap(name = "lb")]
    Luxembourgish,
    #[clap(name = "my")]
    Myanmar,
    #[clap(name = "bo")]
    Tibetan,
    #[clap(name = "tl")]
    Tagalog,
    #[clap(name = "mg")]
    Malagasy,
    #[clap(name = "as")]
    Assamese,
    #[clap(name = "tt")]
    Tatar,
    #[clap(name = "haw")]
    Hawaiian,
    #[clap(name = "ln")]
    Lingala,
    #[clap(name = "ha")]
    Hausa,
    #[clap(name = "ba")]
    Bashkir,
    #[clap(name = "jw")]
    Javanese,
    #[clap(name = "su")]
    Sundanese,
}

impl From<Language> for &str {
    #[allow(clippy::too_many_lines)]
    fn from(val: Language) -> Self {
        match val {
            Language::Auto => "auto",
            Language::English => "en",
            Language::Chinese => "zh",
            Language::German => "de",
            Language::Spanish => "es",
            Language::Russian => "ru",
            Language::Korean => "ko",
            Language::French => "fr",
            Language::Japanese => "ja",
            Language::Portuguese => "pt",
            Language::Turkish => "tr",
            Language::Polish => "pl",
            Language::Catalan => "ca",
            Language::Dutch => "nl",
            Language::Arabic => "ar",
            Language::Swedish => "sv",
            Language::Italian => "it",
            Language::Indonesian => "id",
            Language::Hindi => "hi",
            Language::Finnish => "fi",
            Language::Vietnamese => "vi",
            Language::Hebrew => "he",
            Language::Ukrainian => "uk",
            Language::Greek => "el",
            Language::Malay => "ms",
            Language::Czech => "cs",
            Language::Romanian => "ro",
            Language::Danish => "da",
            Language::Hungarian => "hu",
            Language::Tamil => "ta",
            Language::Norwegian => "no",
            Language::Thai => "th",
            Language::Urdu => "ur",
            Language::Croatian => "hr",
            Language::Bulgarian => "bg",
            Language::Lithuanian => "lt",
            Language::Latin => "la",
            Language::Maori => "mi",
            Language::Malayalam => "ml",
            Language::Welsh => "cy",
            Language::Slovak => "sk",
            Language::Telugu => "te",
            Language::Persian => "fa",
            Language::Latvian => "lv",
            Language::Bengali => "bn",
            Language::Serbian => "sr",
            Language::Azerbaijani => "az",
            Language::Slovenian => "sl",
            Language::Kannada => "kn",
            Language::Estonian => "et",
            Language::Macedonian => "mk",
            Language::Breton => "br",
            Language::Basque => "eu",
            Language::Icelandic => "is",
            Language::Armenian => "hy",
            Language::Nepali => "ne",
            Language::Mongolian => "mn",
            Language::Bosnian => "bs",
            Language::Kazakh => "kk",
            Language::Albanian => "sq",
            Language::Swahili => "sw",
            Language::Galician => "gl",
            Language::Marathi => "mr",
            Language::Punjabi => "pa",
            Language::Sinhala => "si",
            Language::Khmer => "km",
            Language::Shona => "sn",
            Language::Yoruba => "yo",
            Language::Somali => "so",
            Language::Afrikaans => "af",
            Language::Occitan => "oc",
            Language::Georgian => "ka",
            Language::Belarusian => "be",
            Language::Tajik => "tg",
            Language::Sindhi => "sd",
            Language::Gujarati => "gu",
            Language::Amharic => "am",
            Language::Yiddish => "yi",
            Language::Lao => "lo",
            Language::Uzbek => "uz",
            Language::Faroese => "fo",
            Language::HaitianCreole => "ht",
            Language::Pashto => "ps",
            Language::Turkmen => "tk",
            Language::Nynorsk => "nn",
            Language::Maltese => "mt",
            Language::Sanskrit => "sa",
            Language::Luxembourgish => "lb",
            Language::Myanmar => "my",
            Language::Tibetan => "bo",
            Language::Tagalog => "tl",
            Language::Malagasy => "mg",
            Language::Assamese => "as",
            Language::Tatar => "tt",
            Language::Hawaiian => "haw",
            Language::Lingala => "ln",
            Language::Hausa => "ha",
            Language::Bashkir => "ba",
            Language::Javanese => "jw",
            Language::Sundanese => "su",
        }
    }
}
