import { useEffect } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { ReactComponent as SunIcon } from '~/icons/sun.svg'
import { ReactComponent as MoonIcon } from '~/icons/moon.svg'

const systemIsDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches

export default function ThemeToggle() {
	const [theme, setTheme] = useLocalStorage('theme', systemIsDark ? 'dark' : 'light')

	useEffect(() => {
		document.documentElement.setAttribute('data-theme', theme)
	}, [theme])

	function onChange() {
		setTheme(theme === 'light' ? 'dark' : 'light')
	}

	return (
		<label className="swap swap-rotate">
			{/* this hidden checkbox controls the state */}
			<input checked={theme === 'dark'} onChange={onChange} type="checkbox" />
			<SunIcon className="swap-on fill-current w-8 h-8 z-[1000]" />
			<MoonIcon className="swap-off fill-current w-8 h-8 z-[1000]" />
		</label>
	)
}
