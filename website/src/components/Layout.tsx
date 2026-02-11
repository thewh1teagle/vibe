import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router-dom'
import Footer from './Footer'
import KofiDialog from './KofiDialog'
import Nav from './Nav'
import PrivacyPolicy from './PrivacyPolicy'

export default function Layout() {
	const { i18n } = useTranslation()
	const [kofiOpen, setKofiOpen] = useState(false)
	const [privacyOpen, setPrivacyOpen] = useState(false)
	const direction = i18n.dir()
	const onOpenKofi = useCallback(() => setKofiOpen(true), [])
	const onOpenPrivacyPolicy = useCallback(() => setPrivacyOpen(true), [])

	useEffect(() => {
		document.documentElement.setAttribute('dir', direction)
		document.body.setAttribute('dir', direction)
	}, [direction])

	return (
		<div dir={direction}>
			<Nav />
			<Outlet context={{ onOpenKofi }} />
			<Footer onOpenKofi={onOpenKofi} onOpenPrivacyPolicy={onOpenPrivacyPolicy} />
			<KofiDialog open={kofiOpen} onOpenChange={setKofiOpen} />
			<PrivacyPolicy open={privacyOpen} onOpenChange={setPrivacyOpen} />
		</div>
	)
}
