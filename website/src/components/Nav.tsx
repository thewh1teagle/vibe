import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Button } from '~/components/ui/button'
import Github from '~/icons/Github'
import Logo from '~/icons/Logo'

export default function Nav() {
  const { t } = useTranslation()

  return (
    <div className="mx-auto mt-3 flex w-full items-center justify-between px-3 py-2 lg:max-w-[1065px]">
      <div className="flex-1">
        <Button variant="ghost" asChild className="text-sm lg:text-xl">
          <Link to="/" aria-label={t('home')}>
            <Logo />
            <span className="opacity-95">Vibe</span>
          </Link>
        </Button>
      </div>
      <ul className="flex-none px-1" dir="ltr">
        <a href="https://github.com/thewh1teagle/vibe" target="_blank" rel="noreferrer">
          <Github width="28" height="28" />
        </a>
      </ul>
    </div>
  )
}
