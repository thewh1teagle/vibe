import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import * as clipboard from '@tauri-apps/plugin-clipboard-manager'
import { platform } from '@tauri-apps/plugin-os'
import { Check, Copy, FolderOpen, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { Spinner } from '~/components/ui/spinner'
import { Switch } from '~/components/ui/switch'
import { ActionRow, IconAction, SettingsField, SettingsGroup, SettingsNote, SettingsRow, type SettingsViewModel } from './shared'

/* -------------------------------------------------------------------------- */
/*  QR encoding — byte mode, error-correction level L, automatic version.      */
/*  Self-contained on purpose: the payload is one short ASCII URL, which is     */
/*  not worth an npm dependency. Structure follows ISO/IEC 18004.               */
/* -------------------------------------------------------------------------- */

const EC_CODEWORDS_PER_BLOCK = [
	-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
	30, 30, 30, 30,
]
const EC_BLOCKS = [
	-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25,
]

/** Format-info value for error-correction level L. */
const EC_FORMAT_BITS = 1

const PENALTY_N1 = 3
const PENALTY_N2 = 3
const PENALTY_N3 = 40
const PENALTY_N4 = 10

function getBit(x: number, i: number): boolean {
	return ((x >>> i) & 1) !== 0
}

/** Modules available for data and error correction, i.e. everything but the function patterns. */
function rawDataModules(version: number): number {
	let result = (16 * version + 128) * version + 64
	if (version >= 2) {
		const numAlign = Math.floor(version / 7) + 2
		result -= (25 * numAlign - 10) * numAlign - 55
		if (version >= 7) result -= 36
	}
	return result
}

function rawCodewords(version: number): number {
	return Math.floor(rawDataModules(version) / 8)
}

function dataCodewords(version: number): number {
	return rawCodewords(version) - EC_CODEWORDS_PER_BLOCK[version] * EC_BLOCKS[version]
}

function alignmentPatternPositions(version: number): number[] {
	if (version === 1) return []
	const numAlign = Math.floor(version / 7) + 2
	const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2) / 2) * 2
	const result = [6]
	for (let pos = version * 4 + 17 - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos)
	return result
}

/* ---- GF(2^8) arithmetic for Reed–Solomon ---- */

function gfMultiply(x: number, y: number): number {
	let z = 0
	for (let i = 7; i >= 0; i--) {
		z = (z << 1) ^ ((z >>> 7) * 0x11d)
		z ^= ((y >>> i) & 1) * x
	}
	return z & 0xff
}

function rsDivisor(degree: number): number[] {
	const result: number[] = []
	for (let i = 0; i < degree - 1; i++) result.push(0)
	result.push(1)
	let root = 1
	for (let i = 0; i < degree; i++) {
		for (let j = 0; j < result.length; j++) {
			result[j] = gfMultiply(result[j], root)
			if (j + 1 < result.length) result[j] ^= result[j + 1]
		}
		root = gfMultiply(root, 0x02)
	}
	return result
}

function rsRemainder(data: number[], divisor: number[]): number[] {
	const result = divisor.map(() => 0)
	for (const b of data) {
		const factor = b ^ (result.shift() as number)
		result.push(0)
		divisor.forEach((coef, i) => (result[i] ^= gfMultiply(coef, factor)))
	}
	return result
}

/* ---- Encoding ---- */

function appendBits(value: number, len: number, bits: number[]): void {
	for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1)
}

function toCodewords(text: string): { version: number; codewords: number[] } {
	const data = Array.from(new TextEncoder().encode(text))
	let version = 1
	for (; version <= 40; version++) {
		const charCountBits = version <= 9 ? 8 : 16
		if (4 + charCountBits + data.length * 8 <= dataCodewords(version) * 8) break
	}
	if (version > 40) throw new Error('QR payload too long')

	const bits: number[] = []
	appendBits(0b0100, 4, bits) // byte mode
	appendBits(data.length, version <= 9 ? 8 : 16, bits)
	for (const b of data) appendBits(b, 8, bits)

	const capacityBits = dataCodewords(version) * 8
	appendBits(0, Math.min(4, capacityBits - bits.length), bits) // terminator
	appendBits(0, (8 - (bits.length % 8)) % 8, bits) // pad to a byte boundary
	for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) appendBits(pad, 8, bits)

	const codewords: number[] = []
	for (let i = 0; i < bits.length; i += 8) {
		let byte = 0
		for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j]
		codewords.push(byte)
	}
	return { version, codewords }
}

/** Split into blocks, append error-correction codewords to each, then interleave as the spec requires. */
function addEccAndInterleave(version: number, data: number[]): number[] {
	const numBlocks = EC_BLOCKS[version]
	const blockEccLen = EC_CODEWORDS_PER_BLOCK[version]
	const raw = rawCodewords(version)
	const numShortBlocks = numBlocks - (raw % numBlocks)
	const shortBlockLen = Math.floor(raw / numBlocks)

	const blocks: number[][] = []
	const divisor = rsDivisor(blockEccLen)
	for (let i = 0, k = 0; i < numBlocks; i++) {
		const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1))
		k += dat.length
		const ecc = rsRemainder(dat, divisor)
		if (i < numShortBlocks) dat.push(0) // placeholder, skipped while interleaving
		blocks.push(dat.concat(ecc))
	}

	const result: number[] = []
	for (let i = 0; i < blocks[0].length; i++) {
		blocks.forEach((block, j) => {
			if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i])
		})
	}
	return result
}

function maskAt(mask: number, x: number, y: number): boolean {
	switch (mask) {
		case 0:
			return (x + y) % 2 === 0
		case 1:
			return y % 2 === 0
		case 2:
			return x % 3 === 0
		case 3:
			return (x + y) % 3 === 0
		case 4:
			return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0
		case 5:
			return ((x * y) % 2) + ((x * y) % 3) === 0
		case 6:
			return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
		default:
			return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
	}
}

function applyMask(modules: boolean[][], isFunction: boolean[][], mask: number): void {
	const size = modules.length
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			if (!isFunction[y][x] && maskAt(mask, x, y)) modules[y][x] = !modules[y][x]
		}
	}
}

function finderPenaltyAddHistory(size: number, runLength: number, history: number[]): void {
	if (history[0] === 0) runLength += size // the quiet zone counts as a light run
	history.pop()
	history.unshift(runLength)
}

function finderPenaltyCountPatterns(history: number[]): number {
	const n = history[1]
	const core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n
	return (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0) + (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0)
}

function finderPenaltyTerminate(size: number, runColor: boolean, runLength: number, history: number[]): number {
	if (runColor) {
		finderPenaltyAddHistory(size, runLength, history)
		runLength = 0
	}
	finderPenaltyAddHistory(size, runLength + size, history)
	return finderPenaltyCountPatterns(history)
}

/** The spec's four penalty rules; the mask with the lowest score wins. */
function penaltyScore(modules: boolean[][]): number {
	const size = modules.length
	let result = 0

	for (let outer = 0; outer < size; outer++) {
		for (const horizontal of [true, false]) {
			let runColor = false
			let runLength = 0
			const history = [0, 0, 0, 0, 0, 0, 0]
			for (let inner = 0; inner < size; inner++) {
				const cell = horizontal ? modules[outer][inner] : modules[inner][outer]
				if (cell === runColor) {
					runLength++
					if (runLength === 5) result += PENALTY_N1
					else if (runLength > 5) result++
				} else {
					finderPenaltyAddHistory(size, runLength, history)
					if (!runColor) result += finderPenaltyCountPatterns(history) * PENALTY_N3
					runColor = cell
					runLength = 1
				}
			}
			result += finderPenaltyTerminate(size, runColor, runLength, history) * PENALTY_N3
		}
	}

	for (let y = 0; y < size - 1; y++) {
		for (let x = 0; x < size - 1; x++) {
			const cell = modules[y][x]
			if (cell === modules[y][x + 1] && cell === modules[y + 1][x] && cell === modules[y + 1][x + 1]) result += PENALTY_N2
		}
	}

	let dark = 0
	for (const row of modules) for (const cell of row) if (cell) dark++
	const total = size * size
	const deviation = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1
	return result + deviation * PENALTY_N4
}

/**
 * Encode `text` into a square matrix of modules; `true` is a dark module.
 * The matrix carries no quiet zone — the renderer adds it.
 */
function encodeQr(text: string): boolean[][] {
	const { version, codewords } = toCodewords(text)
	const size = version * 4 + 17
	const modules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
	const isFunction: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))

	const setFunction = (x: number, y: number, dark: boolean) => {
		modules[y][x] = dark
		isFunction[y][x] = true
	}

	// Timing patterns
	for (let i = 0; i < size; i++) {
		setFunction(6, i, i % 2 === 0)
		setFunction(i, 6, i % 2 === 0)
	}

	// Finder patterns, together with their separators
	for (const [cx, cy] of [
		[3, 3],
		[size - 4, 3],
		[3, size - 4],
	]) {
		for (let dy = -4; dy <= 4; dy++) {
			for (let dx = -4; dx <= 4; dx++) {
				const dist = Math.max(Math.abs(dx), Math.abs(dy))
				const x = cx + dx
				const y = cy + dy
				if (x >= 0 && x < size && y >= 0 && y < size) setFunction(x, y, dist !== 2 && dist !== 4)
			}
		}
	}

	// Alignment patterns, skipping the three that would collide with the finders
	const alignPos = alignmentPatternPositions(version)
	for (let i = 0; i < alignPos.length; i++) {
		for (let j = 0; j < alignPos.length; j++) {
			if ((i === 0 && j === 0) || (i === 0 && j === alignPos.length - 1) || (i === alignPos.length - 1 && j === 0)) continue
			for (let dy = -2; dy <= 2; dy++) {
				for (let dx = -2; dx <= 2; dx++) {
					setFunction(alignPos[i] + dx, alignPos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
				}
			}
		}
	}

	const drawFormatBits = (mask: number) => {
		const data = (EC_FORMAT_BITS << 3) | mask
		let rem = data
		for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
		const bits = ((data << 10) | rem) ^ 0x5412
		for (let i = 0; i <= 5; i++) setFunction(8, i, getBit(bits, i))
		setFunction(8, 7, getBit(bits, 6))
		setFunction(8, 8, getBit(bits, 7))
		setFunction(7, 8, getBit(bits, 8))
		for (let i = 9; i < 15; i++) setFunction(14 - i, 8, getBit(bits, i))
		for (let i = 0; i < 8; i++) setFunction(size - 1 - i, 8, getBit(bits, i))
		for (let i = 8; i < 15; i++) setFunction(8, size - 15 + i, getBit(bits, i))
		setFunction(8, size - 8, true) // the module that is always dark
	}
	drawFormatBits(0)

	if (version >= 7) {
		let rem = version
		for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
		const bits = (version << 12) | rem
		for (let i = 0; i < 18; i++) {
			const dark = getBit(bits, i)
			const a = size - 11 + (i % 3)
			const b = Math.floor(i / 3)
			setFunction(a, b, dark)
			setFunction(b, a, dark)
		}
	}

	// Data, zig-zagging up and down two-module-wide columns
	const allCodewords = addEccAndInterleave(version, codewords)
	let bit = 0
	for (let right = size - 1; right >= 1; right -= 2) {
		if (right === 6) right = 5
		for (let vert = 0; vert < size; vert++) {
			for (let j = 0; j < 2; j++) {
				const x = right - j
				const upward = ((right + 1) & 2) === 0
				const y = upward ? size - 1 - vert : vert
				if (!isFunction[y][x] && bit < allCodewords.length * 8) {
					modules[y][x] = getBit(allCodewords[bit >>> 3], 7 - (bit & 7))
					bit++
				}
			}
		}
	}

	// Try every mask and keep the one the penalty rules like best
	let bestMask = 0
	let bestPenalty = Infinity
	for (let mask = 0; mask < 8; mask++) {
		applyMask(modules, isFunction, mask)
		drawFormatBits(mask)
		const penalty = penaltyScore(modules)
		if (penalty < bestPenalty) {
			bestPenalty = penalty
			bestMask = mask
		}
		applyMask(modules, isFunction, mask) // XOR is its own inverse, so this undoes it
	}
	applyMask(modules, isFunction, bestMask)
	drawFormatBits(bestMask)
	return modules
}

/**
 * QR codes are read optically, so the colours are hard-coded rather than themed:
 * a dark-on-dark code in dark mode does not scan.
 */
function QrCode({ value, size }: { value: string; size: number }) {
	const matrix = useMemo(() => {
		try {
			return encodeQr(value)
		} catch (error) {
			console.error(error)
			return null
		}
	}, [value])

	if (!matrix) return <p className="text-xs text-destructive">{m.pairingQrCodeError()}</p>

	const quietZone = 4
	const dimension = matrix.length + quietZone * 2
	let path = ''
	for (let y = 0; y < matrix.length; y++) {
		for (let x = 0; x < matrix.length; x++) {
			if (matrix[y][x]) path += `M${x + quietZone} ${y + quietZone}h1v1h-1z`
		}
	}

	return (
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${dimension} ${dimension}`}
			shapeRendering="crispEdges"
			role="img"
			aria-label={m.pairingQrCode()}>
			<rect width={dimension} height={dimension} fill="#ffffff" />
			<path d={path} fill="#000000" />
		</svg>
	)
}

/* -------------------------------------------------------------------------- */
/*  Phone handoff settings                                                     */
/* -------------------------------------------------------------------------- */

/** As it comes off the wire — accept either spelling, the Rust side may or may not rename to camelCase. */
interface HandoffStatusPayload {
	enabled: boolean
	endpointId?: string | null
	endpoint_id?: string | null
	pairingUrl?: string | null
	pairing_url?: string | null
}

interface HandoffStatus {
	enabled: boolean
	endpointId: string | null
	pairingUrl: string | null
}

interface HandoffActivity {
	state: 'receiving' | 'loading_model' | 'transcribing' | 'done' | 'error'
	message: string | null
	/** Where the phone's audio was saved. Only present on `done`; either spelling is accepted. */
	savedPath?: string | null
	saved_path?: string | null
}

const OFF: HandoffStatus = { enabled: false, endpointId: null, pairingUrl: null }

function normalizeStatus(payload: HandoffStatusPayload): HandoffStatus {
	return {
		enabled: Boolean(payload.enabled),
		endpointId: payload.endpointId ?? payload.endpoint_id ?? null,
		pairingUrl: payload.pairingUrl ?? payload.pairing_url ?? null,
	}
}

function errorMessage(error: unknown): string {
	if (typeof error === 'string') return error
	if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message)
	return String(error)
}

/** The backend half of this feature may not be in the build yet — tell them so instead of crashing. */
function isMissingCommand(error: unknown): boolean {
	const text = errorMessage(error).toLowerCase()
	return text.includes('not found') || text.includes('not allowed') || text.includes('unknown') || text.includes('__tauri')
}

/** Whatever the platform calls its file manager. Falls back to neutral wording off-Tauri. */
function revealLabel(): string {
	try {
		if (platform() === 'macos') return m.showInFinder()
		if (platform() === 'windows') return m.showInFileExplorer()
	} catch (error) {
		console.error(error)
	}
	return m.showInFolder()
}

/** Endpoint ids are 64 hex characters; only the ends are useful to a human. */
function shortenEndpointId(id: string): string {
	return id.length <= 20 ? id : `${id.slice(0, 8)}…${id.slice(-8)}`
}

function activityLine(activity: HandoffActivity | null): { text: string; busy: boolean; failed: boolean } {
	if (!activity) return { text: m.phoneWaitingForRecording(), busy: false, failed: false }
	switch (activity.state) {
		case 'receiving':
			return { text: activity.message ?? m.phoneReceivingAudio(), busy: true, failed: false }
		case 'loading_model':
			return { text: activity.message ?? m.phoneLoadingModel(), busy: true, failed: false }
		case 'transcribing':
			return { text: activity.message ?? m.phoneTranscribing(), busy: true, failed: false }
		case 'done':
			return { text: activity.message ?? m.phoneTranscriptSentBack(), busy: false, failed: false }
		default:
			return { text: activity.message ?? m.phoneRecordingFailed(), busy: false, failed: true }
	}
}

export function PhoneSection(_props: { vm: SettingsViewModel }) {
	const [status, setStatus] = useState<HandoffStatus>(OFF)
	const [unavailable, setUnavailable] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)
	const [activity, setActivity] = useState<HandoffActivity | null>(null)
	const [copied, setCopied] = useState(false)

	function handleError(caught: unknown) {
		console.error(caught)
		if (isMissingCommand(caught)) setUnavailable(true)
		else setError(errorMessage(caught))
	}

	useEffect(() => {
		invoke<HandoffStatusPayload>('handoff_status')
			.then((payload) => setStatus(normalizeStatus(payload)))
			.catch((caught) => {
				console.error(caught)
				if (isMissingCommand(caught)) setUnavailable(true)
				else setError(errorMessage(caught))
			})
	}, [])

	useEffect(() => {
		let unlisten: UnlistenFn | undefined
		let cancelled = false
		listen<HandoffActivity>('handoff_activity', (event) => setActivity(event.payload))
			.then((fn) => {
				if (cancelled) fn()
				else unlisten = fn
			})
			.catch(console.error)
		return () => {
			cancelled = true
			unlisten?.()
		}
	}, [])

	async function toggle(next: boolean) {
		setBusy(true)
		setError(null)
		try {
			if (next) {
				setStatus(normalizeStatus(await invoke<HandoffStatusPayload>('handoff_start')))
			} else {
				await invoke('handoff_stop')
				setStatus(OFF)
				setActivity(null)
			}
		} catch (caught) {
			handleError(caught)
		} finally {
			setBusy(false)
		}
	}

	async function regenerate() {
		setBusy(true)
		setError(null)
		try {
			setStatus(normalizeStatus(await invoke<HandoffStatusPayload>('handoff_regenerate_token')))
		} catch (caught) {
			handleError(caught)
		} finally {
			setBusy(false)
		}
	}

	async function copyPairingUrl() {
		if (!status.pairingUrl) return
		try {
			await clipboard.writeText(status.pairingUrl)
			setCopied(true)
			setTimeout(() => setCopied(false), 1500)
		} catch (caught) {
			handleError(caught)
		}
	}

	const blurb = m.phoneHandoffInfo()

	if (unavailable) {
		return (
			<div className="space-y-6">
				<SettingsGroup description={blurb}>
					<SettingsNote>{m.phoneHandoffUnavailable()}</SettingsNote>
				</SettingsGroup>
			</div>
		)
	}

	const activityState = activityLine(activity)
	// The phone's recording is kept, not transcribed from a temp file — so it is worth pointing at.
	const savedPath = activity?.state === 'done' ? (activity.savedPath ?? activity.saved_path ?? null) : null

	return (
		<div className="space-y-6">
			<SettingsGroup description={blurb}>
				<SettingsRow label={m.phoneHandoff()} description={m.phoneHandoffToggleInfo()}>
					<Switch checked={status.enabled} disabled={busy} onCheckedChange={toggle} />
				</SettingsRow>
				<SettingsNote>{m.phoneHandoffRelayNote()}</SettingsNote>
			</SettingsGroup>

			{error && (
				<SettingsGroup>
					<SettingsNote>
						<span className="text-destructive">{error}</span>
					</SettingsNote>
				</SettingsGroup>
			)}

			{status.enabled && (
				<>
					<SettingsGroup title={m.pairAPhone()}>
						{status.pairingUrl ? (
							<>
								<SettingsField description={m.scanPairingCodeInfo()}>
									<div className="flex justify-center">
										<div className="rounded-xl bg-white p-3 shadow-xs">
											<QrCode value={status.pairingUrl} size={200} />
										</div>
									</div>
								</SettingsField>

								<SettingsField label={m.pairingLink()}>
									<div className="flex items-center gap-2">
										<code className="min-w-0 flex-1 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 font-mono text-xs break-all text-foreground select-text">
											{status.pairingUrl}
										</code>
										<IconAction
											label={copied ? m.copied() : m.copyPairingLink()}
											icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
											onClick={copyPairingUrl}
										/>
									</div>
								</SettingsField>
							</>
						) : (
							<SettingsNote>{m.noPairingCode()}</SettingsNote>
						)}

						{status.endpointId && (
							<SettingsRow label={m.thisComputer()} description={m.endpointIdInfo()}>
								<span className="font-mono text-xs text-muted-foreground select-text">{shortenEndpointId(status.endpointId)}</span>
							</SettingsRow>
						)}
					</SettingsGroup>

					<SettingsGroup title={m.status()}>
						<SettingsRow label={m.phone()} description={activityState.text} clampDescription={false}>
							{activityState.busy && <Spinner className="text-muted-foreground" />}
							{activityState.failed && <span className="text-xs text-destructive">{m.failed()}</span>}
						</SettingsRow>

						{savedPath && (
							<ActionRow
								label={revealLabel()}
								description={savedPath}
								icon={<FolderOpen className="h-4 w-4" />}
								onClick={() => void invoke('open_path', { path: savedPath })}
							/>
						)}
					</SettingsGroup>

					<SettingsGroup>
						<ActionRow
							label={m.regeneratePairingCode()}
							description={m.regeneratePairingCodeInfo()}
							icon={<RefreshCw className="h-4 w-4" />}
							disabled={busy}
							destructive
							onClick={regenerate}
						/>
					</SettingsGroup>
				</>
			)}
		</div>
	)
}
