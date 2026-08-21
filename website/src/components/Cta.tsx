import { useEffect, useState } from 'react'
import mobile from 'is-mobile'
import { m } from '../paraglide/messages.js'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '~/components/ui/dialog'
import Chip from '~/icons/Chip'
import Github from '~/icons/Github'
import Linux from '~/icons/Linux'
import Mac from '~/icons/Mac'
import Windows from '~/icons/Windows'
import { isVersionOverride, release as latestRelease } from '~/lib/release'
import linuxInstallOptions from '~/lib/linux_install_options.json'
import CopyButton from './CopyButton'
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
			<div id="download" className="flex scroll-mt-24 flex-col items-center gap-3 sm:flex-row sm:justify-center">
				{isMobile ? (
					<Button size="lg" className="cta-hero" onMouseDown={ctaClick}>
						{m.download()}
					</Button>
				) : currentPlatform === 'macos' ? (
					<Button size="lg" className="cta-hero hidden lg:flex" onMouseDown={ctaClick}>
						<Mac className="size-[18px]" />
						{m['download-for']()}
						{asset?.platform}
					</Button>
				) : currentPlatform === 'windows' ? (
					<Button size="lg" className="cta-hero hidden md:flex" asChild>
						<a href={asset?.url} onClick={() => setPostDownloadOpen(true)}>
							<Windows className="size-[18px]" />
							{m['download-for']()}
							{asset?.platform}
						</a>
					</Button>
				) : currentPlatform === 'linux' ? (
					<Button size="lg" className="hidden md:flex" onClick={() => setLinuxModalOpen(true)}>
						<Linux className="size-[18px]" />
						{m['download-for']()}
						{asset?.platform}
					</Button>
				) : null}

				<Button variant="outline" size="lg" asChild>
					<a href="https://github.com/thewh1teagle/vibe" target="_blank" rel="noreferrer">
						<Github width="18" height="18" />
						{m['star-on-github']()}
					</a>
				</Button>
			</div>

			{currentPlatform === 'macos' && ctaClicked && (
				<div className="mt-4 flex gap-2">
					<Button variant="outline" size="sm" className="animate-pulse-glow" asChild>
						<a href={macSiliconAsset?.url} onClick={() => setPostDownloadOpen(true)}>
							<Mac className="size-4" />
							{m['apple-silicon']()}
						</a>
					</Button>
					<Button variant="outline" size="sm" className="animate-pulse-glow" asChild>
						<a href={macIntelAsset?.url} onClick={() => setPostDownloadOpen(true)}>
							<Chip />
							{m.intel()}
						</a>
					</Button>
				</div>
			)}

			<div className="mt-6 flex flex-col items-center gap-2.5">
				<div className="flex items-center gap-1 rounded-full border border-border p-1">
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="macOS"
						aria-pressed={currentPlatform === 'macos'}
						className={currentPlatform === 'macos' ? 'bg-secondary text-foreground' : ''}
						onMouseDown={() => changePlatform('macos')}>
						<Mac className="size-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Windows"
						aria-pressed={currentPlatform === 'windows'}
						className={currentPlatform === 'windows' ? 'bg-secondary text-foreground' : ''}
						onClick={() => changePlatform('windows')}>
						<Windows className="size-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Linux"
						aria-pressed={currentPlatform === 'linux'}
						className={currentPlatform === 'linux' ? 'bg-secondary text-foreground' : ''}
						onClick={() => changePlatform('linux')}>
						<Linux className="size-4" />
					</Button>
				</div>
				<span dir="ltr" className="text-center font-mono text-[11px] leading-none tracking-[0.04em] text-muted-foreground">
					{latestRelease.version}
					{isVersionOverride && (
						<span
							dir="ltr"
							className="ms-2 inline-flex items-center rounded-full border border-rose-500/40 bg-rose-500/10 px-1.5 py-px align-middle font-mono text-[9px] font-semibold tracking-[0.1em] text-rose-500 uppercase">
							Beta
						</span>
					)}
				</span>
			</div>

			<Dialog open={mobileModalOpen} onOpenChange={setMobileModalOpen}>
				<DialogContent className="w-[92vw] max-w-md p-6">
					<h3 className="text-center text-lg font-semibold tracking-[-0.03em]">{m['download-on-pc']()}</h3>
					<p className="py-4 text-center text-muted-foreground">{m['available-for']()} macOS / Windows / Linux</p>
					<div className="flex justify-center">
						<Button onClick={() => navigator.clipboard.writeText(currentURL)}>{m['copy-download-link']()}</Button>
					</div>
					<DialogFooter>
						<Button variant="ghost" onClick={() => setMobileModalOpen(false)}>
							{m.cancel()}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={linuxModalOpen} onOpenChange={setLinuxModalOpen}>
				<DialogContent className="w-[88vw] max-w-[88vw] overflow-hidden p-6 sm:!max-w-3xl md:p-8">
					<h3 className="pe-8 text-[24px] font-semibold tracking-[-0.03em] md:text-[28px]">{m['install-on-linux']()}</h3>
					<div className="mt-2 max-h-[70vh] overflow-y-auto pe-1">
						{linuxInstallOptions.map((option) => (
							<div key={option.title} className="mt-6 first:mt-2" dir="ltr">
								<div className="eyebrow mb-2">{option.title}</div>
								<div className="flex w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-muted pe-1">
									<code className="block flex-1 whitespace-nowrap p-3 font-mono text-[13px] text-foreground">
										{option.command.replace('{tag}', latestRelease.version)}
									</code>
									<CopyButton text={option.command.replace('{tag}', latestRelease.version)} />
								</div>
							</div>
						))}
						<div className="mt-10 flex items-center justify-center">
							<SupportButton onOpenKofi={onOpenKofi} />
						</div>
					</div>
				</DialogContent>
			</Dialog>

			<PostDownload open={postDownloadOpen} onOpenChange={setPostDownloadOpen} onOpenKofi={onOpenKofi} />
		</>
	)
}
