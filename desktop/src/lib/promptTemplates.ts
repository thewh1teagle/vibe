export interface PromptTemplate {
	labelKey: string
	prompt: (lang: string) => string
}

const SYSTEM_RULE = 'Output only the requested content. No introductions, explanations, or commentary.'

export const promptTemplates: PromptTemplate[] = [
	{
		labelKey: 'common.prompt-template-meeting-notes',
		prompt: (lang) =>
			`${SYSTEM_RULE}\n\nTurn this transcript into structured meeting notes in ${lang} using markdown. Include:\n- **Topics discussed** as headings\n- Key points under each topic\n- **Decisions** highlighted in bold\n- **Action items** as a checklist at the end\n\n"""\n%s\n"""`,
	},
	{
		labelKey: 'common.prompt-template-tldr',
		prompt: (lang) =>
			`${SYSTEM_RULE}\n\nWrite a TL;DR of this transcript in ${lang} using markdown. Start with a one-paragraph overview, then list the 3-5 most important takeaways as bold bullet points.\n\n"""\n%s\n"""`,
	},
	{
		labelKey: 'common.prompt-template-translate',
		prompt: (lang) =>
			`${SYSTEM_RULE}\n\nTranslate this transcript into ${lang} (the current app language). Preserve the original structure and formatting. Use markdown headings and paragraphs. Do not wrap the output in fenced code blocks.\n\n"""\n%s\n"""`,
	},
	{
		labelKey: 'common.prompt-template-rewrite',
		prompt: (lang) =>
			`${SYSTEM_RULE}\n\nRewrite this transcript as a clean, well-structured article in ${lang}. Use markdown headings and paragraphs.\n\n"""\n%s\n"""`,
	},
]
