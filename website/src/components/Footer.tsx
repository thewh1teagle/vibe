import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import Discord from '~/icons/Discord'
import Github from '~/icons/Github'

interface FooterProps {
  onOpenKofi: () => void
  onOpenPrivacyPolicy: () => void
}

export default function Footer({ onOpenKofi, onOpenPrivacyPolicy }: FooterProps) {
  const { t } = useTranslation()

  return (
    <footer className="mt-36 rounded-xl border border-border bg-card/60 p-10 text-foreground">
      <nav className="flex flex-row flex-wrap justify-center gap-4">
        <Link className="underline-offset-4 hover:underline" to="/">
          {t('home')}
        </Link>
        <button className="underline-offset-4 hover:underline" onClick={onOpenKofi}>
          {t('support-vibe')}
        </button>
        <button className="underline-offset-4 hover:underline" onClick={onOpenPrivacyPolicy}>
          {t('privacy-policy')}
        </button>
        <Link className="underline-offset-4 hover:underline" to="/features">
          {t('features')}
        </Link>
        <Link className="underline-offset-4 hover:underline" to="/docs">
          {t('documentation')}
        </Link>
      </nav>
      <nav className="mt-6">
        <div className="flex items-center gap-4">
          <a href="https://github.com/thewh1teagle/vibe" target="_blank" rel="noreferrer">
            <Github width="24" height="24" />
          </a>
          <div className="h-6 w-px bg-border" />
          <a href="https://discord.gg/EcxWSstQN8" target="_blank" rel="noreferrer">
            <Discord />
          </a>
        </div>
      </nav>
      <aside className="mt-4 text-center text-sm text-muted-foreground">
        <p>
          Vibe - {t('title')}
        </p>
      </aside>
    </footer>
  )
}
