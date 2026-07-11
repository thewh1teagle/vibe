import { useCallback, useEffect, useState } from 'react'
import { getLocale, getTextDirection, setLocale, type Locale } from '../paraglide/runtime.js'
import { supportedWebsiteLocales } from '~/lib/i18n'
import { Outlet } from 'react-router-dom'
import useUrlActions from '~/lib/useUrlActions'
import Footer from './Footer'
import KofiDialog from './KofiDialog'
import Nav from './Nav'
import PrivacyPolicy from './PrivacyPolicy'

export default function Layout() {
	const [kofiOpen, setKofiOpen] = useState(false)
	const [privacyOpen, setPrivacyOpen] = useState(false)
	const [locale, setCurrentLocale] = useState<Locale>(getLocale())
	const direction = getTextDirection(locale)
	const availableLocales = supportedWebsiteLocales as readonly Locale[]
	const onOpenKofi = useCallback(() => setKofiOpen(true), [])
	const onOpenPrivacyPolicy = useCallback(() => setPrivacyOpen(true), [])
	const onLocaleChange = useCallback((nextLocale: Locale) => {
		setLocale(nextLocale, { reload: false })
		setCurrentLocale(nextLocale)
	}, [])

	useEffect(() => {
		document.documentElement.setAttribute('dir', direction)
		document.body.setAttribute('dir', direction)
	}, [direction])

	useUrlActions({
		'support-vibe': onOpenKofi,
		'open-privacy-policy': onOpenPrivacyPolicy,
	})

	return (
		<div dir={direction}>
			<Nav locale={locale} availableLocales={availableLocales} onLocaleChange={onLocaleChange} />
			<Outlet context={{ onOpenKofi }} />
			<Footer onOpenKofi={onOpenKofi} onOpenPrivacyPolicy={onOpenPrivacyPolicy} />
			<KofiDialog open={kofiOpen} onOpenChange={setKofiOpen} />
			<PrivacyPolicy open={privacyOpen} onOpenChange={setPrivacyOpen} />
		</div>
	)
}
