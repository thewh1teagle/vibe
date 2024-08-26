import { $ } from 'bun'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

const originalCWD = process.cwd()
// Change CWD to src-tauri
process.chdir(path.join(__dirname, '../desktop/src-tauri'))
const platform = {
	win32: 'windows',
	darwin: 'macos',
	linux: 'linux',
}[os.platform()]
const cwd = process.cwd()

function hasFeature(name) {
	return process.argv.includes(`--${name}`) || process.argv.includes(name)
}

const config = {
	ffmpegRealname: 'ffmpeg',
	openblasRealname: 'openblas',
	clblastRealname: 'clblast',
	vulkanRuntimeRealName: 'vulkan_runtime',
	vulkanSdkRealName: 'vulkan_sdk',
	windows: {
		ffmpegName: 'ffmpeg-7.0-windows-desktop-vs2022-default',
		ffmpegUrl: 'https://unlimited.dl.sourceforge.net/project/avbuild/windows-desktop/ffmpeg-7.0-windows-desktop-vs2022-default.7z?viasf=1',

		openBlasName: 'OpenBLAS-0.3.26-x64',
		openBlasUrl: 'https://github.com/OpenMathLib/OpenBLAS/releases/download/v0.3.26/OpenBLAS-0.3.26-x64.zip',

		clblastName: 'CLBlast-1.6.2-windows-x64',
		clblastUrl: 'https://github.com/CNugteren/CLBlast/releases/download/1.6.2/CLBlast-1.6.2-windows-x64.zip',

		vulkanRuntimeName: 'VulkanRT-1.3.290.0-Components',
		vulkanRuntimeUrl: 'https://sdk.lunarg.com/sdk/download/1.3.290.0/windows/VulkanRT-1.3.290.0-Components.zip',
		vulkanSdkName: 'VulkanSDK-1.3.290.0-Installer',
		vulkanSdkUrl: 'https://sdk.lunarg.com/sdk/download/1.3.290.0/windows/VulkanSDK-1.3.290.0-Installer.exe',
		vcpkgPackages: [],
	},
	linux: {
		aptPackages: [
			'ffmpeg',
			'libopenblas-dev', // Runtime
			'pkg-config',
			'build-essential',
			'libglib2.0-dev',
			'libgtk-3-dev',
			'libwebkit2gtk-4.1-dev',
			'clang',
			'cmake', // Tauri
			'libavutil-dev',
			'libavformat-dev',
			'libavfilter-dev',
			'libavdevice-dev', // FFMPEG
			'libasound2-dev', // cpal
			'libomp-dev', // OpenMP in ggml.ai
			'libstdc++-12-dev', //ROCm
		],
	},
	macos: {
		ffmpegName: 'ffmpeg-6.1-macOS-default',
		ffmpegUrl: 'https://master.dl.sourceforge.net/project/avbuild/macOS/ffmpeg-6.1-macOS-default.tar.xz?viasf=1',
	},
	diarization: {
		embedModelUrl: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/wespeaker_en_voxceleb_CAM++.onnx',
		embedModelFilename: 'wespeaker_en_voxceleb_CAM++.onnx',
		segmentModelUrl: 'https://github.com/pengzhendong/pyannote-onnx/raw/master/pyannote_onnx/segmentation-3.0.onnx',
		segmentModelFilename: 'segmentation-3.0.onnx',
	},
}

// Export for Github actions
const exports = {
	ffmpeg: path.join(cwd, config.ffmpegRealname),
	openBlas: path.join(cwd, config.openblasRealname),
	clblast: path.join(cwd, config.clblastRealname, 'lib/cmake/CLBlast'),
	libClang: 'C:\\Program Files\\LLVM\\bin',
	cmake: 'C:\\Program Files\\CMake\\bin',
}

/* ########## Linux ########## */
if (platform == 'linux') {
	// Install APT packages
	await $`sudo apt-get update`
	if (hasFeature('vulkan')) {
		config.linux.aptPackages.push('libvulkan1')
		config.linux.aptPackages.push('mesa-vulkan-drivers')
	}
	for (const name of config.linux.aptPackages) {
		await $`sudo apt-get install -y ${name}`
	}
}

/* ########## Windows ########## */
if (platform == 'windows') {
	// Setup FFMPEG
	if (!(await fs.exists(config.ffmpegRealname))) {
		await $`C:\\msys64\\usr\\bin\\wget.exe -nc --show-progress ${config.windows.ffmpegUrl} -O ${config.windows.ffmpegName}.7z`
		await $`'C:\\Program Files\\7-Zip\\7z.exe' x ${config.windows.ffmpegName}.7z`
		await $`mv ${config.windows.ffmpegName} ${config.ffmpegRealname}`
		await $`rm -rf ${config.windows.ffmpegName}.7z`
		await $`mv ${config.ffmpegRealname}/lib/x64/* ${config.ffmpegRealname}/lib/`
	}

	// Setup OpenBlas
	if (!(await fs.exists(config.openblasRealname)) && hasFeature('openblas')) {
		await $`C:\\msys64\\usr\\bin\\wget.exe -nc --show-progress ${config.windows.openBlasUrl} -O ${config.windows.openBlasName}.zip`
		await $`"C:\\Program Files\\7-Zip\\7z.exe" x ${config.windows.openBlasName}.zip -o${config.openblasRealname}`
		await $`rm ${config.windows.openBlasName}.zip`
		fs.cp(path.join(config.openblasRealname, 'include'), path.join(config.openblasRealname, 'lib'), { recursive: true, force: true })
		// It tries to link only openblas.lib but our is libopenblas.lib`
		fs.cp(path.join(config.openblasRealname, 'lib/libopenblas.lib'), path.join(config.openblasRealname, 'lib/openblas.lib'))
	}

	// Setup CLBlast
	if (!(await fs.exists(config.clblastRealname)) && !hasFeature('cuda')) {
		await $`C:\\msys64\\usr\\bin\\wget.exe -nc --show-progress ${config.windows.clblastUrl} -O ${config.windows.clblastName}.zip`
		await $`"C:\\Program Files\\7-Zip\\7z.exe" x ${config.windows.clblastName}.zip` // 7z file inside
		await $`"C:\\Program Files\\7-Zip\\7z.exe" x ${config.windows.clblastName}.7z` // Inner folder
		await $`mv ${config.windows.clblastName} ${config.clblastRealname}`
		await $`rm ${config.windows.clblastName}.zip`
		await $`rm ${config.windows.clblastName}.7z`
	}

	// Setup Vulkan
	if (!(await fs.exists(config.vulkanSdkRealName)) && hasFeature('vulkan')) {
		await $`C:\\msys64\\usr\\bin\\wget.exe -nc --show-progress ${config.windows.vulkanSdkUrl} -O ${config.windows.vulkanSdkName}.exe`
		let executable = path.join(cwd, `${config.windows.vulkanSdkName}.exe`)
		let vulkanSdkRoot = path.join(cwd, config.vulkanSdkRealName)
		await $`${executable} --root ${vulkanSdkRoot} --accept-licenses --default-answer --confirm-command install`

		await $`C:\\msys64\\usr\\bin\\wget.exe -nc --show-progress ${config.windows.vulkanRuntimeUrl} -O ${config.windows.vulkanRuntimeName}.zip`
		await $`"C:\\Program Files\\7-Zip\\7z.exe" x ${config.windows.vulkanRuntimeName}.zip` // 7z file inside
		await $`mv ${config.windows.vulkanRuntimeName} ${config.vulkanRuntimeRealName}`
		await $`rm ${config.windows.vulkanSdkName}.exe`
		await $`rm ${config.windows.vulkanRuntimeName}.zip`
	}

	// Setup vcpkg packages
	if (config.windows.vcpkgPackages.length > 0) {
		await $`C:\\vcpkg\\vcpkg.exe install ${config.windows.vcpkgPackages}`.quiet()
	}
}

/* ########## macOS ########## */
if (platform == 'macos') {
	// Setup FFMPEG
	if (!(await fs.exists(config.ffmpegRealname))) {
		await $`wget -nc --show-progress ${config.macos.ffmpegUrl} -O ${config.macos.ffmpegName}.tar.xz`
		await $`tar xf ${config.macos.ffmpegName}.tar.xz`
		await $`mv ${config.macos.ffmpegName} ${config.ffmpegRealname}`
		await $`rm ${config.macos.ffmpegName}.tar.xz`
	}
}

// Nvidia
let cudaPath
if (hasFeature('cuda')) {
	if (process.env['CUDA_PATH']) {
		cudaPath = process.env['CUDA_PATH']
	} else if (platform === 'windows') {
		const cudaRoot = 'C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\'
		cudaPath = 'C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v12.5'
		if (await fs.exists(cudaRoot)) {
			const folders = await fs.readdir(cudaRoot)
			if (folders.length > 0) {
				cudaPath = cudaPath.replace('v12.5', folders[0])
			}
		}
	}

	if (process.env.GITHUB_ENV) {
		console.log('CUDA_PATH', cudaPath)
	}

	if (platform === 'windows') {
		const tauriConfigContent = await fs.readFile('tauri.windows.conf.json', { encoding: 'utf-8' })
		const tauriConfig = JSON.parse(tauriConfigContent)
		tauriConfig.bundle.resources[`${cudaPath}\\bin\\cudart64_*`] = './'
		tauriConfig.bundle.resources[`${cudaPath}\\bin\\cublas64_*`] = './'
		tauriConfig.bundle.resources[`${cudaPath}\\bin\\cublasLt64_*`] = './'
		await fs.writeFile('tauri.windows.conf.json', JSON.stringify(tauriConfig, null, 4))
	}
	if (platform === 'linux') {
		// Add cuda toolkit depends package
		const tauriConfigContent = await fs.readFile('tauri.linux.conf.json', { encoding: 'utf-8' })
		const tauriConfig = JSON.parse(tauriConfigContent)
		tauriConfig.bundle.linux.deb.depends.push('nvidia-cuda-toolkit')
		await fs.writeFile('tauri.linux.conf.json', JSON.stringify(tauriConfig, null, 4))
	}
}

// OpenBlas
if (hasFeature('openblas')) {
	if (platform === 'windows') {
		const tauriConfigContent = await fs.readFile('tauri.windows.conf.json', { encoding: 'utf-8' })
		const tauriConfig = JSON.parse(tauriConfigContent)
		tauriConfig.bundle.resources['openblas\\bin\\*.dll'] = './'
		await fs.writeFile('tauri.windows.conf.json', JSON.stringify(tauriConfig, null, 4))
	}
}

// Vulkan
let vulkanPath = path.join(cwd, config.vulkanSdkRealName)
let vulkanRuntimePath = path.join(cwd, config.vulkanRuntimeRealName)
if (hasFeature('vulkan')) {
	if (platform === 'windows') {
		const tauriConfigContent = await fs.readFile('tauri.windows.conf.json', { encoding: 'utf-8' })
		const tauriConfig = JSON.parse(tauriConfigContent)
		tauriConfig.bundle.resources['vulkan_runtime\\x64\\*.dll'] = './'
		await fs.writeFile('tauri.windows.conf.json', JSON.stringify(tauriConfig, null, 4))
	}
	if (platform === 'linux') {
		// Add vulkan depends
		const tauriConfigContent = await fs.readFile('tauri.linux.conf.json', { encoding: 'utf-8' })
		const tauriConfig = JSON.parse(tauriConfigContent)
		tauriConfig.bundle.linux.deb.depends.push('libvulkan1')
		tauriConfig.bundle.linux.deb.depends.push('mesa-vulkan-drivers')
		await fs.writeFile('tauri.linux.conf.json', JSON.stringify(tauriConfig, null, 4))
	}
}

// ROCM
let rocmPath = '/opt/rocm'
if (hasFeature('rocm')) {
	if (process.env.GITHUB_ENV) {
		console.log('ROCM_PATH', rocmPath)
	}
	if (platform === 'linux') {
		// Add rocm toolkit depends package
		const tauriConfigContent = await fs.readFile('tauri.linux.conf.json', { encoding: 'utf-8' })
		const tauriConfig = JSON.parse(tauriConfigContent)
		tauriConfig.bundle.linux.deb.depends.push('rocm')
		await fs.writeFile('tauri.linux.conf.json', JSON.stringify(tauriConfig, null, 4))
	}
}

// Diarization
if (!(await fs.exists(config.diarization.embedModelFilename))) {
	if (platform == 'windows') {
		await $`C:\\msys64\\usr\\bin\\wget.exe -nc --show-progress ${config.diarization.embedModelUrl} -O ${config.diarization.embedModelFilename}`
		await $`C:\\msys64\\usr\\bin\\wget.exe -nc --show-progress ${config.diarization.segmentModelUrl} -O ${config.diarization.segmentModelFilename}`
	} else {
		await $`wget -nc --show-progress ${config.diarization.embedModelUrl} -O ${config.diarization.embedModelFilename}`
		await $`wget -nc --show-progress ${config.diarization.segmentModelUrl} -O ${config.diarization.segmentModelFilename}`
	}
}

// Development hints
if (!process.env.GITHUB_ENV) {
	console.log('\nCommands to build 🔨:')
	if (originalCWD != cwd) {
		// Get relative path to desktop folder
		const relativePath = path.relative(originalCWD, path.join(cwd, '..'))
		console.log(`cd ${relativePath}`)
	}
	console.log('bun install')
	if (platform == 'windows') {
		console.log(`$env:FFMPEG_DIR = "${exports.ffmpeg}"`)
		console.log(`$env:OPENBLAS_PATH = "${exports.openBlas}"`)
		console.log(`$env:LIBCLANG_PATH = "${exports.libClang}"`)
		console.log(`$env:PATH += "${exports.cmake}"`)
		if (hasFeature('older-cpu')) {
			console.log(`$env:WHISPER_NO_AVX = "ON"`)
			console.log(`$env:WHISPER_NO_AVX2 = "ON"`)
			console.log(`$env:WHISPER_NO_FMA = "ON"`)
			console.log(`$env:WHISPER_NO_F16C = "ON"`)
		}
		if (hasFeature('cuda')) {
			console.log(`$env:CUDA_PATH = "${cudaPath}"`)
			console.log(`$env:KNF_STATIC_CRT = "0"`)
			console.log('$env:WHISPER_USE_STATIC_MSVC= "0"')
		}
		if (hasFeature('rocm')) {
			console.log(`$env:ROCM_VERSION = "6.1.2"`)
			console.log(`$env:ROCM_PATH = "${rocmPath}"`)
		}

		if (hasFeature('portable')) {
			console.log('$env:WINDOWS_PORTABLE=1')
		}

		if (hasFeature('vulkan')) {
			console.log(`$env:VULKAN_SDK = "${vulkanPath}"`)
			console.log(`$env:PATH += "${vulkanRuntimePath}"`)
		}
	}
	if (platform == 'macos') {
		console.log(`export FFMPEG_DIR="${exports.ffmpeg}"`)
		console.log(`export WHISPER_METAL_EMBED_LIBRARY=ON`)
	}
	if (!process.env.GITHUB_ENV) {
		const features = ['openblas', 'vulkan', 'cuda'].filter((f) => hasFeature(f)).join(',')
		if (features) {
			console.log(`bunx tauri build --features "${features}"`)
		} else {
			console.log(`bunx tauri build`)
		}
	}
}

// Config Github ENV
if (process.env.GITHUB_ENV) {
	console.log('Adding ENV')
	if (platform == 'macos' || platform == 'windows') {
		const ffmpeg = `FFMPEG_DIR=${exports.ffmpeg}\n`
		console.log('Adding ENV', ffmpeg)
		await fs.appendFile(process.env.GITHUB_ENV, ffmpeg)
	}
	if (platform == 'macos') {
		const embed_metal = 'WHISPER_METAL_EMBED_LIBRARY=ON'
		await fs.appendFile(process.env.GITHUB_ENV, embed_metal)
	}
	if (platform == 'windows') {
		const openblas = `OPENBLAS_PATH=${exports.openBlas}\n`
		console.log('Adding ENV', openblas)
		await fs.appendFile(process.env.GITHUB_ENV, openblas)

		if (hasFeature('older-cpu')) {
			await fs.appendFile(process.env.GITHUB_ENV, `WHISPER_NO_AVX=ON\n`)
			await fs.appendFile(process.env.GITHUB_ENV, `WHISPER_NO_AVX2=ON\n`)
			await fs.appendFile(process.env.GITHUB_ENV, `WHISPER_NO_FMA=ON\n`)
			await fs.appendFile(process.env.GITHUB_ENV, `WHISPER_NO_F16C=ON\n`)
		}

		if (hasFeature('portable')) {
			const windowsPortable = 'WINDOWS_PORTABLE=1\n'
			console.log('Adding ENV', windowsPortable)
			await fs.appendFile(process.env.GITHUB_ENV, windowsPortable)
		}

		if (hasFeature('vulkan')) {
			await fs.appendFile(process.env.GITHUB_ENV, `VULKAN_SDK=${vulkanPath}\n`)
		}
	}
}

// --dev or --build
const action = process.argv?.[2]
if (action?.includes('--build' || action.includes('--dev'))) {
	process.chdir(path.join(cwd, '..'))
	process.env['FFMPEG_DIR'] = exports.ffmpeg
	if (platform === 'windows') {
		process.env['OPENBLAS_PATH'] = exports.openBlas
		process.env['CLBlast_DIR'] = exports.clblast
		process.env['LIBCLANG_PATH'] = process.env['LIBCLANG_PATH'] || exports.libClang
		process.env['PATH'] = `${process.env['PATH']};${exports.cmake}`
	}
	if (platform == 'macos') {
		process.env['WHISPER_METAL_EMBED_LIBRARY'] = 'ON'
	}
	await $`bun install`
	await $`bunx tauri ${action.includes('--dev') ? 'dev' : 'build'}`
}
