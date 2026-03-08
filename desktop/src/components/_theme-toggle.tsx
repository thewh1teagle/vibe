import { ReactComponent as SunIcon } from '~/icons/sun.svg'
import { ReactComponent as MoonIcon } from '~/icons/moon.svg'
import { ModifyState } from '~/lib/utils'
import { Button } from '~/components/ui/button'

interface ThemeToggleProps {
	theme: 'dark' | 'light'
	setTheme: ModifyState<'light' | 'dark'>
}

export default function ThemeToggle({ theme, setTheme }: ThemeToggleProps) {
	function onChange() {
		setTheme(theme === 'light' ? 'dark' : 'light')
	}

	return (
		<Button variant="ghost" size="icon" type="button" onClick={onChange}>
			{theme === 'dark' ? <SunIcon className="w-8 h-8 z-[1000]" /> : <MoonIcon className="w-8 h-8 z-[1000]" />}
		</Button>
	)
}
