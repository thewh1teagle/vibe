import { useEffect, useState } from 'react'
import mobile from 'is-mobile'
import { useTranslation } from 'react-i18next'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '~/components/ui/dialog'
import Chip from '~/icons/Chip'
import Github from '~/icons/Github'
import Linux from '~/icons/Linux'
import Mac from '~/icons/Mac'
import Windows from '~/icons/Windows'
import latestRelease from '~/lib/latest_release.json'
import linuxInstallOptions from '~/lib/linux_install_options.json'
import PostDownload from './PostDownload'
import SupportButton from './SupportButton'

type Platform = 'macos' | 'windows' | 'linux'

const windowsAsset = latestRelease.assets.find((asset) => asset.platform?.toLowerCase() === 'windows')
const macIntelAsset = latestRelease.assets.find((asset) => asset.platform?.toLowerCase() === 'macos' && asset.arch === 'darwin-x86_64')
const macSiliconAsset = latestRelease.assets.find((asset) => asset.platform?.toLowerCase() === 'macos' && asset.arch === 'darwin-aarch64')

function getOS(): Platform {
	const platform = navigator.platform?.toLowerCase()

	if (platform?.includes('win')) return 'windows'
	if (platform?.includes('linux')) return 'linux'

	return 'macos'
}

interface CtaProps {
	onOpenKofi: () => void
}

export default function Cta({ onOpenKofi }: CtaProps) {
	const { t } = useTranslation()
	const [currentPlatform, setCurrentPlatform] = useState<Platform>('macos')
	const [ctaClicked, setCtaClicked] = useState(false)
	const [mobileModalOpen, setMobileModalOpen] = useState(false)
	const [linuxModalOpen, setLinuxModalOpen] = useState(false)
	const [postDownloadOpen, setPostDownloadOpen] = useState(false)
	const [isMobile, setIsMobile] = useState(false)
	const [currentURL, setCurrentURL] = useState('')

	const asset = latestRelease.assets.find((releaseAsset) => releaseAsset.platform?.toLowerCase() === currentPlatform)

	useEffect(() => {
		setCurrentPlatform(getOS())
		setIsMobile(mobile() || window.screen.width < 480)
	}, [])

	function ctaClick() {
		if (isMobile) {
			setCurrentURL(location.href)
			setMobileModalOpen(true)
			return
		}

		if (currentPlatform === 'macos') {
			setCtaClicked(true)
			return
		}

		if (currentPlatform === 'windows') {
			window.open(windowsAsset?.url, '_blank')
			setPostDownloadOpen(true)
			return
		}

		if (currentPlatform === 'linux') {
			setLinuxModalOpen(true)
		}
	}

	function changePlatform(platform: Platform) {
		setCurrentPlatform(platform)
		setCtaClicked(false)
		setCurrentURL(location.href)
	}

	return (
		<>
			<div className="flex flex-col gap-3 lg:flex-row">
				{isMobile ? (
					<Button onMouseDown={ctaClick}>{t('download')}</Button>
				) : currentPlatform === 'macos' ? (
					<Button className="hidden lg:flex" onMouseDown={ctaClick}>
						<Mac className="size-[18px]" />
						{t('download-for')}
						{asset?.platform}
					</Button>
				) : currentPlatform === 'windows' ? (
					<Button className="hidden md:flex" asChild>
						<a href={asset?.url} onClick={() => setPostDownloadOpen(true)}>
							<Windows className="size-[18px]" />
							{t('download-for')}
							{asset?.platform}
						</a>
					</Button>
				) : currentPlatform === 'linux' ? (
					<Button className="hidden md:flex" onClick={() => setLinuxModalOpen(true)}>
						<Linux className="size-[18px]" />
						{t('download-for')}
						{asset?.platform}
					</Button>
				) : null}

				<Button variant="outline" asChild>
					<a href="https://github.com/thewh1teagle/vibe" target="_blank" rel="noreferrer">
						<Github width="18" height="18" />
						{t('star-on-github')}
					</a>
				</Button>
			</div>

			<div className="mt-2 text-center text-sm text-muted-foreground">{latestRelease.version}</div>

			{currentPlatform === 'macos' && ctaClicked && (
				<div className="mt-3 flex gap-2">
					<Button variant="outline" size="sm" asChild>
						<a href={macIntelAsset?.url} onClick={() => setPostDownloadOpen(true)}>
							<Chip />
							{t('intel')}
						</a>
					</Button>
					<Button variant="outline" size="sm" asChild>
						<a href={macSiliconAsset?.url} onClick={() => setPostDownloadOpen(true)}>
							<Chip />
							{t('apple-silicon')}
						</a>
					</Button>
				</div>
			)}

			<div className="mt-4 flex gap-2">
				<Button variant="ghost" size="icon" onMouseDown={() => changePlatform('macos')}>
					<Mac className="size-6" />
				</Button>
				<Button variant="ghost" size="icon" onClick={() => changePlatform('windows')}>
					<Windows className="size-6" />
				</Button>
				<Button variant="ghost" size="icon" onClick={() => changePlatform('linux')}>
					<Linux className="size-6" />
				</Button>
			</div>

			<Dialog open={mobileModalOpen} onOpenChange={setMobileModalOpen}>
				<DialogContent className="w-[92vw] max-w-md p-6">
					<h3 className="text-center text-lg font-bold">{t('download-on-pc')}</h3>
					<p className="py-4 text-center">{t('available-for')} macOS / Windows / Linux</p>
					<div className="flex justify-center">
						<Button onClick={() => navigator.clipboard.writeText(currentURL)}>{t('copy-download-link')}</Button>
					</div>
					<DialogFooter>
						<Button variant="ghost" onClick={() => setMobileModalOpen(false)}>
							{t('cancel')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={linuxModalOpen} onOpenChange={setLinuxModalOpen}>
				<DialogContent className="w-[88vw] max-w-[88vw] overflow-hidden p-6 sm:!max-w-3xl">
					<h3 className="pr-8 text-3xl font-bold">{t('install-on-linux')}</h3>
					<div className="mt-2 max-h-[70vh] overflow-y-auto pr-1">
						{linuxInstallOptions.map((option) => (
							<div key={option.title} className="mt-5 first:mt-3" dir="ltr">
								<div className="mb-2 text-3xl text-primary opacity-80">{option.title}</div>
								<div className="w-full overflow-x-auto rounded-sm bg-[#2b2b2b]">
									<code className="block whitespace-nowrap p-2 text-sm">{option.command.replace('{tag}', latestRelease.version)}</code>
								</div>
							</div>
						))}
						<div className="mt-10 flex items-center justify-center">
							<SupportButton onOpenKofi={onOpenKofi} />
						</div>
					</div>
					<DialogFooter showCloseButton />
				</DialogContent>
			</Dialog>

			<PostDownload open={postDownloadOpen} onOpenChange={setPostDownloadOpen} onOpenKofi={onOpenKofi} />
		</>
	)
}
