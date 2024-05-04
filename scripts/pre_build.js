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

const config = {
    ffmpegRealname: 'ffmpeg',
    openblasRealname: 'openblas',
    clblastRealname: 'clblast',
    windows: {
        ffmpegName: 'ffmpeg-6.1-windows-desktop-vs2022ltl-default',
        ffmpegUrl: 'https://master.dl.sourceforge.net/project/avbuild/windows-desktop/ffmpeg-6.1-windows-desktop-vs2022ltl-default.7z?viasf=1',

        openBlasName: 'OpenBLAS-0.3.26-x64',
        openBlasUrl: 'https://github.com/OpenMathLib/OpenBLAS/releases/download/v0.3.26/OpenBLAS-0.3.26-x64.zip',

        clblastName: 'CLBlast-1.6.2-windows-x64',
        clblastUrl: 'https://github.com/CNugteren/CLBlast/releases/download/1.6.2/CLBlast-1.6.2-windows-x64.zip',

        vcpkgPackages: ['opencl'],
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
        ],
    },
    macos: {
        ffmpegName: 'ffmpeg-6.1-macOS-default',
        ffmpegUrl: 'https://master.dl.sourceforge.net/project/avbuild/macOS/ffmpeg-6.1-macOS-default.tar.xz?viasf=1',
    },
}

// Export for Github actions
const exports = {
    ffmpeg: path.join(cwd, config.ffmpegRealname),
    openBlas: path.join(cwd, config.openblasRealname, 'lib'),
    clblast: path.join(cwd, config.clblastRealname, 'lib/cmake/CLBlast'),
    libClang: 'C:\\Program Files\\LLVM\\bin',
    cmake: 'C:\\Program Files\\CMake\\bin',
}

/* ########## Linux ########## */
if (platform == 'linux') {
    // Install APT packages
    await $`sudo apt-get update`
    await $`sudo apt-get install -y ${config.linux.aptPackages.join(' ')}`
}

/* ########## Windows ########## */
if (platform == 'windows') {
    // Setup FFMPEG
    if (!(await fs.exists(config.ffmpegRealname))) {
        await $`wget -nc --show-progress ${config.windows.ffmpegUrl} -O ${config.windows.ffmpegName}.7z`
        await $`'C:\\Program Files\\7-Zip\\7z.exe' x ${config.windows.ffmpegName}.7z`
        await $`mv ${config.windows.ffmpegName} ${config.ffmpegRealname}`
        await $`rm -rf ${config.windows.ffmpegName}.7z`
        await $`mv ${config.ffmpegRealname}/lib/x64/* ${config.ffmpegRealname}/lib/`
    }

    // Setup OpenBlas
    if (!(await fs.exists(config.openblasRealname))) {
        await $`wget -nc --show-progress ${config.windows.openBlasUrl} -O ${config.windows.openBlasName}.zip`
        await $`"C:\\Program Files\\7-Zip\\7z.exe" x ${config.windows.openBlasName}.zip -o${config.openblasRealname}`
        await $`rm ${config.windows.openBlasName}.zip`
        fs.cp(path.join(config.openblasRealname, 'include'), path.join(config.openblasRealname, 'lib'), { recursive: true, force: true })
        // It tries to link only openblas.lib but our is libopenblas.lib`
        fs.cp(path.join(config.openblasRealname, 'lib/libopenblas.lib'), path.join(config.openblasRealname, 'lib/openblas.lib'))
    }

    // Setup CLBlast
    if (!(await fs.exists(config.clblastRealname))) {
        await $`wget -nc --show-progress ${config.windows.clblastUrl} -O ${config.windows.clblastName}.zip`
        await $`"C:\\Program Files\\7-Zip\\7z.exe" x ${config.windows.clblastName}.zip` // 7z file inside
        await $`"C:\\Program Files\\7-Zip\\7z.exe" x ${config.windows.clblastName}.7z` // Inner folder
        await $`mv ${config.windows.clblastName} ${config.clblastRealname}`
        await $`rm ${config.windows.clblastName}.zip`
        await $`rm ${config.windows.clblastName}.7z`
    }

    // Setup vcpkg packages
    await $`C:\\vcpkg\\vcpkg.exe install ${config.windows.vcpkgPackages}`.quiet()
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
        console.log(`$env:CLBlast_DIR = "${exports.clblast}"`)
        console.log(`$env:LIBCLANG_PATH = "${exports.libClang}"`)
        console.log(`$env:PATH += "${exports.cmake}"`)
    }
    if (platform == 'macos') {
        console.log(`export FFMPEG_DIR="${exports.ffmpeg}"`)
    }
    console.log('bunx tauri build')
}

// Config Github ENV
if (process.env.GITHUB_ENV) {
    console.log('Adding ENV')
    if (platform == 'macos' || platform == 'windows') {
        const ffmpeg = `FFMPEG_DIR=${exports.ffmpeg}\n`
        console.log('Adding ENV', ffmpeg)
        await fs.appendFile(process.env.GITHUB_ENV, ffmpeg)
    }
    if (platform == 'windows') {
        const openblas = `OPENBLAS_PATH=${exports.openBlas}\n`
        console.log('Adding ENV', openblas)
        await fs.appendFile(process.env.GITHUB_ENV, openblas)
        const clblast = `CLBlast_DIR=${exports.clblast}\n`
        console.log('Adding ENV', clblast)
        await fs.appendFile(process.env.GITHUB_ENV, clblast)
    }
}
