use eyre::{Context, Result};
use serde::Deserialize;
use std::time::Duration;

const GROQ_CHAT_URL: &str = "https://api.groq.com/openai/v1/chat/completions";
const CLEANUP_MODEL: &str = "llama-3.3-70b-versatile";
const CLEANUP_TIMEOUT: Duration = Duration::from_secs(10);

const FIX_PROMPT: &str = "\
You are a minimal text repair assistant. Fix ONLY obvious typos and errors. \
When in doubt, do NOT change anything.\n\
\n\
DO:\n\
- Fix obvious typos (e.g. \"teh\" → \"the\", \"adn\" → \"and\").\n\
- Fix missing or wrong punctuation (missing periods, commas, question marks).\n\
- Capitalize sentence starts and proper nouns.\n\
- Fix double spaces or missing spaces between words.\n\
\n\
DO NOT:\n\
- Change ANY word that is already correctly spelled, even if you think a different word fits better.\n\
- Replace words with synonyms or different words.\n\
- Change the meaning, tone, or wording of any sentence.\n\
- Add or remove information.\n\
- Rephrase or restructure sentences.\n\
- Add explanations, comments, or labels.\n\
- Reformat the text.\n\
\n\
CRITICAL RULE: If every word in a sentence is already correctly spelled, return that sentence EXACTLY as-is. \
Do not \"improve\" text — only fix actual errors.\n\
\n\
CRITICAL RULE: You MUST return the ENTIRE text, every sentence, every paragraph. \
Never output only a portion of the input. If only one sentence has errors, still return all sentences.\n\
\n\
CRITICAL RULE: Keep the text in its original language. If translation is ever needed, \
only translate to Danish or English — never to any other language.\n\
\n\
Preserve exactly:\n\
- The original language of the text.\n\
- Every correctly spelled word, even if uncommon.\n\
- Code identifiers, file names, URLs, email addresses, numbers, dates.\n\
- All technical terms, software jargon, and commonly used English loanwords in their original form. Tech vocabulary is universally understood and should never be translated.\n\
- The author's tone, register, and stylistic choices.\n\
\n\
Output strictly the full corrected text. No preamble, no labels.";

const IMPROVE_PROMPT: &str = "\
You are a writing improvement assistant. The user has selected text that may \
contain errors and unclear phrasing. Fix errors and improve clarity while \
preserving the original meaning.\n\
\n\
DO:\n\
- Fix spelling, grammar, and punctuation errors.\n\
- Improve unclear or awkward phrasing for better readability.\n\
- Simplify overly complex sentences where possible.\n\
- Ensure logical flow between sentences.\n\
\n\
DO NOT:\n\
- Change the meaning or add new information.\n\
- Remove content the author included.\n\
- Add explanations, comments, or labels.\n\
- Reformat the text (no bullet points, no JSON, no code fences).\n\
- Over-rewrite — keep changes minimal and faithful to the original.\n\
- Translate to any language other than Danish or English.\n\
\n\
Preserve exactly:\n\
- The original language of the text.\n\
- Code identifiers, file names, URLs, email addresses, numbers, dates.\n\
- All technical terms, software jargon, and commonly used English loanwords in their original form. Tech vocabulary is universally understood and should never be translated.\n\
- The author's core intent and message.\n\
\n\
Output strictly the improved text. No preamble, no labels.";

const FORMAL_PROMPT: &str = "\
You are a tone adjustment assistant. The user has selected text and wants it \
in a more formal register. Fix errors and adjust the tone to be professional \
and formal while preserving meaning.\n\
\n\
DO:\n\
- Fix spelling, grammar, and punctuation errors.\n\
- Replace casual/informal expressions with formal equivalents.\n\
- Use professional vocabulary and sentence structure.\n\
- Ensure proper grammar and complete sentences.\n\
\n\
DO NOT:\n\
- Change the meaning or add new information.\n\
- Remove content the author included.\n\
- Add explanations, comments, or labels.\n\
- Reformat the text (no bullet points, no JSON, no code fences).\n\
- Make it sound robotic — keep it natural but professional.\n\
- Translate to any language other than Danish or English.\n\
\n\
Preserve exactly:\n\
- The original language of the text.\n\
- Code identifiers, file names, URLs, email addresses, numbers, dates.\n\
- All technical terms, software jargon, and commonly used English loanwords in their original form. Tech vocabulary is universally understood and should never be translated.\n\
- The author's core intent and message.\n\
\n\
Output strictly the formal text. No preamble, no labels.";

const CASUAL_PROMPT: &str = "\
You are a tone adjustment assistant. The user has selected text and wants it \
in a more casual, relaxed register. Fix errors and adjust the tone to be \
conversational while preserving meaning.\n\
\n\
DO:\n\
- Fix spelling, grammar, and punctuation errors.\n\
- Replace stiff or overly formal expressions with natural, everyday language.\n\
- Use contractions and conversational phrasing where appropriate.\n\
- Keep sentences readable and natural-sounding.\n\
\n\
DO NOT:\n\
- Change the meaning or add new information.\n\
- Remove content the author included.\n\
- Add explanations, comments, or labels.\n\
- Reformat the text (no bullet points, no JSON, no code fences).\n\
- Make it too slangy — keep it relaxed but clear.\n\
- Translate to any language other than Danish or English.\n\
\n\
Preserve exactly:\n\
- The original language of the text.\n\
- Code identifiers, file names, URLs, email addresses, numbers, dates.\n\
- All technical terms, software jargon, and commonly used English loanwords in their original form. Tech vocabulary is universally understood and should never be translated.\n\
- The author's core intent and message.\n\
\n\
Output strictly the casual text. No preamble, no labels.";

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

// Sends a user text to Groq with a given system prompt and returns the response.
async fn call_groq(system_prompt: &str, user_text: &str, api_key: &str, label: &str, max_tokens: u32) -> Result<String> {
    let client = reqwest::Client::builder().timeout(CLEANUP_TIMEOUT).build()?;
    let payload = serde_json::json!({
        "model": CLEANUP_MODEL,
        "temperature": 0.0,
        "max_tokens": max_tokens,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": user_text },
        ],
    });
    let resp = client
        .post(GROQ_CHAT_URL)
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .await
        .context(format!("failed to send {label} request to Groq"))?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        if let Ok(parsed) = serde_json::from_str::<ApiError>(&body) {
            eyre::bail!("Groq {label} error ({}): {}", status, parsed.error.message);
        }
        eyre::bail!("Groq {label} error ({}): {}", status, body);
    }
    let body: ChatResponse = resp.json().await.context(format!("failed to parse Groq {label} response"))?;
    Ok(body
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content.trim().to_string())
        .unwrap_or_default())
}

// Sends the dictated text to Groq for cleanup with a system prompt tailored
// to the user's selected output language.
pub async fn cleanup_text(text: &str, lang: &str, api_key: &str) -> Result<String> {
    call_groq(&build_system_prompt(lang), text, api_key, "cleanup", 1024).await
}

fn build_fix_prompt(mode: &str) -> &'static str {
    match mode.trim() {
        "improve" => IMPROVE_PROMPT,
        "formal" => FORMAL_PROMPT,
        "casual" => CASUAL_PROMPT,
        _ => FIX_PROMPT,
    }
}

pub async fn fix_text(text: &str, mode: &str, api_key: &str) -> Result<String> {
    // Estimate tokens: ~4 chars per token, give 2x headroom for output, cap at 8192
    let estimated_tokens = (text.len() as u32) / 4;
    let max_tokens = (estimated_tokens * 2).clamp(1024, 8192);
    call_groq(build_fix_prompt(mode), text, api_key, "fix", max_tokens).await
}
