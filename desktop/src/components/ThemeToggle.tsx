import { Dispatch, SetStateAction, useEffect } from 'react'
import { ReactComponent as SunIcon } from '~/icons/sun.svg'
import { ReactComponent as MoonIcon } from '~/icons/moon.svg'

interface ThemeToggleProps {
	theme: 'dark' | 'light'
	setTheme: Dispatch<SetStateAction<'light' | 'dark'>>
}
export default function ThemeToggle({ theme, setTheme }: ThemeToggleProps) {
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
