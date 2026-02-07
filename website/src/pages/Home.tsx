import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useOutletContext } from 'react-router-dom'
import Cta from '~/components/Cta'

interface LayoutContext {
  onOpenKofi: () => void
}

export default function Home() {
  const { t } = useTranslation()
  const { onOpenKofi } = useOutletContext<LayoutContext>()

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const action = urlParams.get('action')

    if (action === 'support-vibe') {
      onOpenKofi()
    }
  }, [onOpenKofi])

  return (
    <>
      <h1 className="text-center text-3xl capitalize lg:text-6xl">{t('title')}</h1>
      <p className="m-auto mt-5 max-w-[78%] text-center text-base leading-8 text-muted-foreground lg:max-w-[600px]">{t('description')}</p>
      <div className="mt-10 flex flex-col items-center">
        <Cta onOpenKofi={onOpenKofi} />
      </div>
      <div className="m-auto mt-16 h-auto w-[95%] lg:w-[1000px]">
        <img
          className="h-auto w-full rounded-2xl object-cover transition-transform duration-500 ease-in-out hover:-translate-y-1 hover:scale-[1.03]"
          alt="preview"
          src="/vibe/preview.png"
        />
      </div>
    </>
  )
}
