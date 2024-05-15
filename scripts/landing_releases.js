import path from 'path'
import fs from 'fs/promises'

const RELEASES_PATH = path.resolve(__dirname, '../landing/src/lib/latest_release.json')
const OWNER = 'thewh1teagle'
const REPO = 'vibe'

function getAssetInfo(name) {
    const platformMap = {
        '.deb': {
            platform: 'Linux',
            arch: name.includes('aarch64') ? 'darwin-aarch64' : 'linux-x86_64',
        },
        '.exe': {
            platform: 'Windows',
            arch: name.includes('x64-setup') ? 'windows-x86_64' : 'unknown',
        },
        '.dmg': {
            platform: 'MacOS',
            arch: name.includes('aarch64') ? 'darwin-aarch64' : 'darwin-x86_64',
        },
    }

    const extension = Object.keys(platformMap).find((ext) => name.includes(ext)) || 'unknown'
    return platformMap[extension]
}

function filterValidAssets(assets) {
    const validExtensions = /\.(sig|json|zip|tar\.gz)$/
    return assets.filter((asset) => !validExtensions.test(asset.name))
}

function mapAssets(assets) {
    return assets.map((asset) => {
        const info = getAssetInfo(asset.name)
        return {
            url: asset.browser_download_url,
            name: asset.name,
            ...info,
        }
    })
}

async function writeToFile(data) {
    await fs.writeFile(RELEASES_PATH, JSON.stringify(data, null, 4))
}

async function fetchLatestRelease() {
    const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`)

    if (!response.ok) {
        throw new Error(`Failed to fetch latest release. Status: ${response.status} URL: ${response.url} Body: ${response.body}`)
    }

    return await response.json()
}

try {
    const latestRelease = await fetchLatestRelease()
    const tagName = latestRelease.tag_name
    const validAssets = filterValidAssets(latestRelease.assets)
    const mappedAssets = mapAssets(validAssets)

    const releasesData = {
        assets: mappedAssets,
        version: tagName,
    }

    await writeToFile(releasesData)
    console.log(`Updated releases at ${RELEASES_PATH} with \n${JSON.stringify(releasesData, null, 4)}`)
} catch (error) {
    console.error('Error fetching or processing latest release:', error.message)
}
