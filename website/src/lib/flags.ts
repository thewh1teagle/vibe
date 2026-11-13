/** One flag per ISO 639-1 language code, the same picks the desktop app makes. */
// prettier-ignore
const FLAGS: Record<string, string> = {
	en: '🇺🇸', es: '🇪🇸', hi: '🇮🇳', fr: '🇫🇷', de: '🇩🇪', it: '🇮🇹', pt: '🇧🇷', ru: '🇷🇺',
	ja: '🇯🇵', ko: '🇰🇷', zh: '🇨🇳', ar: '🇸🇦', he: '🇮🇱', iw: '🇮🇱', tr: '🇹🇷', nl: '🇳🇱',
	pl: '🇵🇱', uk: '🇺🇦', sv: '🇸🇪', no: '🇳🇴', nb: '🇳🇴', da: '🇩🇰', fi: '🇫🇮', cs: '🇨🇿',
	sk: '🇸🇰', hu: '🇭🇺', ro: '🇷🇴', bg: '🇧🇬', hr: '🇭🇷', sr: '🇷🇸', sl: '🇸🇮', el: '🇬🇷',
	id: '🇮🇩', ms: '🇲🇾', vi: '🇻🇳', th: '🇹🇭', fa: '🇮🇷', ur: '🇵🇰', bn: '🇧🇩', ta: '🇮🇳',
	te: '🇮🇳', mr: '🇮🇳', kn: '🇮🇳', ml: '🇮🇳', pa: '🇮🇳', gu: '🇮🇳', az: '🇦🇿', kk: '🇰🇿',
	uz: '🇺🇿', ka: '🇬🇪', hy: '🇦🇲', et: '🇪🇪', lv: '🇱🇻', lt: '🇱🇹', be: '🇧🇾', mk: '🇲🇰',
	sq: '🇦🇱', bs: '🇧🇦', is: '🇮🇸', mt: '🇲🇹', sw: '🇰🇪', af: '🇿🇦', am: '🇪🇹', ne: '🇳🇵',
	si: '🇱🇰', my: '🇲🇲', km: '🇰🇭', lo: '🇱🇦', mn: '🇲🇳', tl: '🇵🇭', ca: '🇦🇩', gl: '🇪🇸',
	eu: '🇪🇸', cy: '🇬🇧', ga: '🇮🇪', yi: '🇮🇱',
}

export function flagFor(code: string): string | null {
	return FLAGS[code.toLowerCase()] ?? null
}
