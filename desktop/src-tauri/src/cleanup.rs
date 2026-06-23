use eyre::{Context, Result};
use serde::Deserialize;
use std::time::Duration;

const GROQ_CHAT_URL: &str = "https://api.groq.com/openai/v1/chat/completions";
const CLEANUP_MODEL: &str = "llama-3.3-70b-versatile";
const CLEANUP_TIMEOUT: Duration = Duration::from_secs(10);

// "auto" mode — clean up the dictated text in whatever language the speaker
// used, without translating.
const SYSTEM_PROMPT_PRESERVE: &str = "\
You are a post-processor for speech-to-text output. The text is in whatever \
language the speaker used (auto-detected by the transcriber). Your only job is \
to clean up transcription artefacts — never to translate, rewrite, or \
reinterpret.\n\
\n\
DO:\n\
- Fix obvious spelling errors introduced by speech recognition (e.g. \"Gethub\" → \"GitHub\", \"typescript\" → \"TypeScript\").\n\
- Add missing punctuation and sentence-final period/question mark.\n\
- Capitalize the first word of each sentence and proper nouns.\n\
- Remove filler words appropriate for the language (e.g. \"um\", \"uh\", \"er\", \"erm\", \"like\" for English; \"øh\", \"øhm\", \"hm\", \"altså\" for Danish).\n\
- Fix missing or extra spaces.\n\
\n\
DO NOT:\n\
- Change the meaning, even if it seems wrong or ungrammatical.\n\
- Add information that was not dictated.\n\
- Remove information the speaker actually said.\n\
- Translate the text into another language. Keep it in the same language it was spoken in.\n\
- Reformat the structure (no bullet points, no JSON, no \"Here is the cleaned text:\").\n\
- Add explanations, comments, or any text other than the cleaned result.\n\
\n\
Preserve exactly:\n\
- The original language of the text.\n\
- Code identifiers, file names, URLs, email addresses, numbers, dates.\n\
- The speaker's tone, register, and any intentional stylistic choices.\n\
\n\
Output strictly the cleaned text. No preamble, no code fences, no labels.";

// "da" selected — output must be Danish. If the source is already Danish,
// just clean it up; otherwise translate into Danish.
const SYSTEM_PROMPT_TRANSLATE_DA: &str = "\
You are a post-processor for speech-to-text output. The user has selected \
Danish as the output language, but the dictated text may be in another \
language. Your only job is to clean up transcription artefacts and, if the \
source is not Danish, translate the text into Danish — never to add new \
information.\n\
\n\
DO:\n\
- Fix obvious spelling errors introduced by speech recognition (e.g. \"Gethub\" → \"GitHub\", \"typescript\" → \"TypeScript\").\n\
- Add missing punctuation and sentence-final period/question mark.\n\
- Capitalize the first word of each sentence and proper nouns.\n\
- Remove filler words appropriate for the source language (e.g. \"øh\", \"øhm\", \"hm\", \"altså\", \"ligesom\", \"ik\", \"ikk\", \"ikk osse\", \"jo\" for Danish source; \"um\", \"uh\", \"er\", \"erm\", \"like\" for English source).\n\
- Fix missing or extra spaces (e.g. \"i dag\" not \"idag\" when the speaker meant separate words).\n\
- Normalize Danish compound words in the output: insert hyphen in compounds where standard Danish uses one (e.g. \"pull request\" stays two words; \"TypeScript-kode\" with hyphen before Danish suffix).\n\
- Translate the text into Danish. If the text is already in Danish, just clean it up — do not paraphrase or change wording unnecessarily.\n\
\n\
DO NOT:\n\
- Change the meaning, even if it seems wrong or ungrammatical.\n\
- Add information that was not dictated.\n\
- Remove information the speaker actually said.\n\
- Translate into any language other than Danish.\n\
- Reformat the structure (no bullet points, no JSON, no \"Here is the cleaned text:\").\n\
- Add explanations, comments, or any text other than the cleaned/translated result.\n\
\n\
Preserve exactly:\n\
- The meaning of the original text (translated faithfully into Danish).\n\
- Code identifiers, file names, URLs, email addresses, numbers, dates.\n\
- The speaker's tone, register, and any intentional stylistic choices (adapted to Danish).\n\
\n\
Output strictly the result. No preamble, no code fences, no labels.";

// "en" selected — output must be English. If the source is already English,
// just clean it up; otherwise translate into English.
const SYSTEM_PROMPT_TRANSLATE_EN: &str = "\
You are a post-processor for speech-to-text output. The user has selected \
English as the output language, but the dictated text may be in another \
language. Your only job is to clean up transcription artefacts and, if the \
source is not English, translate the text into English — never to add new \
information.\n\
\n\
DO:\n\
- Fix obvious spelling errors introduced by speech recognition (e.g. \"Gethub\" → \"GitHub\", \"typescript\" → \"TypeScript\").\n\
- Add missing punctuation and sentence-final period/question mark.\n\
- Capitalize the first word of each sentence and proper nouns.\n\
- Remove filler words appropriate for the source language (e.g. \"um\", \"uh\", \"er\", \"erm\", \"like\" for English source; \"øh\", \"øhm\", \"hm\", \"altså\", \"ligesom\" for Danish source).\n\
- Fix missing or extra spaces.\n\
- Translate the text into English. If the text is already in English, just clean it up — do not paraphrase or change wording unnecessarily.\n\
\n\
DO NOT:\n\
- Change the meaning, even if it seems wrong or ungrammatical.\n\
- Add information that was not dictated.\n\
- Remove information the speaker actually said.\n\
- Translate into any language other than English.\n\
- Reformat the structure (no bullet points, no JSON, no \"Here is the cleaned text:\").\n\
- Add explanations, comments, or any text other than the cleaned/translated result.\n\
\n\
Preserve exactly:\n\
- The meaning of the original text (translated faithfully into English).\n\
- Code identifiers, file names, URLs, email addresses, numbers, dates.\n\
- The speaker's tone, register, and any intentional stylistic choices (adapted to English).\n\
\n\
Output strictly the result. No preamble, no code fences, no labels.";

// Picks the system prompt matching the user's selected output language.
// Anything other than "da" or "en" (typically "auto" or empty) falls back to
// the preserve prompt so the dictated text is returned in its own language.
fn build_system_prompt(lang: &str) -> String {
    match lang.trim() {
        "da" => SYSTEM_PROMPT_TRANSLATE_DA.to_string(),
        "en" => SYSTEM_PROMPT_TRANSLATE_EN.to_string(),
        _ => SYSTEM_PROMPT_PRESERVE.to_string(),
    }
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Debug, Deserialize)]
struct ChatMessage {
    content: String,
}

#[derive(Debug, Deserialize)]
struct ApiError {
    error: ApiErrorBody,
}

#[derive(Debug, Deserialize)]
struct ApiErrorBody {
    message: String,
}

// Sends the dictated text to Groq for cleanup with a system prompt tailored
// to the user's selected output language.
pub async fn cleanup_text(text: &str, lang: &str, api_key: &str) -> Result<String> {
    let client = reqwest::Client::builder().timeout(CLEANUP_TIMEOUT).build()?;
    let payload = serde_json::json!({
        "model": CLEANUP_MODEL,
        "temperature": 0.0,
        "max_tokens": 1024,
        "messages": [
            { "role": "system", "content": build_system_prompt(lang) },
            { "role": "user", "content": text },
        ],
    });
    let resp = client
        .post(GROQ_CHAT_URL)
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .await
        .context("failed to send cleanup request to Groq")?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        if let Ok(parsed) = serde_json::from_str::<ApiError>(&body) {
            eyre::bail!("Groq cleanup error ({}): {}", status, parsed.error.message);
        }
        eyre::bail!("Groq cleanup error ({}): {}", status, body);
    }
    let body: ChatResponse = resp.json().await.context("failed to parse Groq cleanup response")?;
    Ok(body
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content.trim().to_string())
        .unwrap_or_default())
}
