import { useState, useEffect } from "react";
import { useLocalStorage } from "usehooks-ts";

// https://www.codeconvert.ai/rust-to-typescript-converter
const Languages: {[key: string]: string} = {
  "Auto": "auto",
  "English": "en",
  "Chinese": "zh",
  "German": "de",
  "Spanish": "es",
  "Russian": "ru",
  "Korean": "ko",
  "French": "fr",
  "Japanese": "ja",
  "Portuguese": "pt",
  "Turkish": "tr",
  "Polish": "pl",
  "Catalan": "ca",
  "Dutch": "nl",
  "Arabic": "ar",
  "Swedish": "sv",
  "Italian": "it",
  "Indonesian": "id",
  "Hindi": "hi",
  "Finnish": "fi",
  "Vietnamese": "vi",
  "Hebrew": "he",
  "Ukrainian": "uk",
  "Greek": "el",
  "Malay": "ms",
  "Czech": "cs",
  "Romanian": "ro",
  "Danish": "da",
  "Hungarian": "hu",
  "Tamil": "ta",
  "Norwegian": "no",
  "Thai": "th",
  "Urdu": "ur",
  "Croatian": "hr",
  "Bulgarian": "bg",
  "Lithuanian": "lt",
  "Latin": "la",
  "Maori": "mi",
  "Malayalam": "ml",
  "Welsh": "cy",
  "Slovak": "sk",
  "Telugu": "te",
  "Persian": "fa",
  "Latvian": "lv",
  "Bengali": "bn",
  "Serbian": "sr",
  "Azerbaijani": "az",
  "Slovenian": "sl",
  "Kannada": "kn",
  "Estonian": "et",
  "Macedonian": "mk",
  "Breton": "br",
  "Basque": "eu",
  "Icelandic": "is",
  "Armenian": "hy",
  "Nepali": "ne",
  "Mongolian": "mn",
  "Bosnian": "bs",
  "Kazakh": "kk",
  "Albanian": "sq",
  "Swahili": "sw",
  "Galician": "gl",
  "Marathi": "mr",
  "Punjabi": "pa",
  "Sinhala": "si",
  "Khmer": "km",
  "Shona": "sn",
  "Yoruba": "yo",
  "Somali": "so",
  "Afrikaans": "af",
  "Occitan": "oc",
  "Georgian": "ka",
  "Belarusian": "be",
  "Tajik": "tg",
  "Sindhi": "sd",
  "Gujarati": "gu",
  "Amharic": "am",
  "Yiddish": "yi",
  "Lao": "lo",
  "Uzbek": "uz",
  "Faroese": "fo",
  "HaitianCreole": "ht",
  "Pashto": "ps",
  "Turkmen": "tk",
  "Nynorsk": "nn",
  "Maltese": "mt",
  "Sanskrit": "sa",
  "Luxembourgish": "lb",
  "Myanmar": "my",
  "Tibetan": "bo",
  "Tagalog": "tl",
  "Malagasy": "mg",
  "Assamese": "as",
  "Tatar": "tt",
  "Hawaiian": "haw",
  "Lingala": "ln",
  "Hausa": "ha",
  "Bashkir": "ba",
  "Javanese": "jw",
  "Sundanese": "su",
}

export default function LanguageInput({onChange}: {onChange: (lang: string) => void}) {
  const [selected, setSelected] = useLocalStorage('language', Languages["Auto"]);

  const handleChange = (event: any) => {
    setSelected(event.target.value);
    onChange(event.target.value)
  };

  useEffect(() => {
    onChange(selected)
  }, [])
  

  return (
    <select
      value={selected}
      onChange={handleChange}
      className="select select-bordered"
    >
      {Object.keys(Languages).map((langKey, index) => (
        <option key={index} value={Languages[langKey] as any}>
          {langKey}
        </option>
      ))}
    </select>
  );
}
