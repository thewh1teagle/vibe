use eyre::{Context, Result};
use serde::Deserialize;
use std::time::Duration;

const GROQ_CHAT_URL: &str = "https://api.groq.com/openai/v1/chat/completions";
const CLEANUP_MODEL: &str = "llama-3.3-70b-versatile";
const CLEANUP_TIMEOUT: Duration = Duration::from_secs(10);

const SYSTEM_PROMPT: &str = "\
You are a post-processor for speech-to-text output. The text is dictated in \
Danish, possibly with English technical terms mixed in. Your only job is to \
clean up transcription artefacts — never to rewrite or reinterpret.\n\
\n\
DO:\n\
- Fix obvious spelling errors introduced by speech recognition (e.g. \"Gethub\" → \"GitHub\", \"typescript\" → \"TypeScript\").\n\
- Add missing punctuation and sentence-final period/question mark.\n\
- Capitalize the first word of each sentence and proper nouns.\n\
- Remove Danish filler words: \"øh\", \"øhm\", \"hm\", \"altså\", \"ligesom\", \"ik\", \"ikk\", \"ikk osse\", \"jo\".\n\
- Fix missing or extra spaces (e.g. \"GitHubrepositoriet\" → \"GitHub-repositoriet\", or \"i dag\" not \"idag\" if the speaker meant separate words).\n\
- Normalize Danish compound words: insert hyphen in compounds where standard Danish uses one (e.g. \"pull request\" stays two words; \"TypeScript-kode\" with hyphen before Danish suffix).\n\
\n\
DO NOT:\n\
- Change the meaning, even if it seems wrong or ungrammatical.\n\
- Add information that was not dictated.\n\
- Remove information the speaker actually said.\n\
- Translate between Danish and English.\n\
- Reformat the structure (no bullet points, no JSON, no \"Here is the cleaned text:\").\n\
- Add explanations, comments, or any text other than the cleaned result.\n\
\n\
Preserve exactly:\n\
- The original language mix (Danish words stay Danish, English words stay English).\n\
- Code identifiers, file names, URLs, email addresses, numbers, dates.\n\
- The speaker's tone, register, and any intentional stylistic choices.\n\
\n\
Output strictly the cleaned text. No preamble, no code fences, no labels.";

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

pub async fn cleanup_text(text: &str, api_key: &str) -> Result<String> {
    let client = reqwest::Client::builder().timeout(CLEANUP_TIMEOUT).build()?;
    let payload = serde_json::json!({
        "model": CLEANUP_MODEL,
        "temperature": 0.0,
        "max_tokens": 1024,
        "messages": [
            { "role": "system", "content": SYSTEM_PROMPT },
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
