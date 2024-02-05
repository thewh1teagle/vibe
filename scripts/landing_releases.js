const path = require('path')
const fs = require('fs')

const releasesPath = path.resolve(__dirname, '../landing/src/lib/latest_release.json')
const owner = 'thewh1teagle';
const repo = 'vibe';

function getAssetInfo(name) {
  if (name.includes('.deb')) {
    return { platform: 'Linux', arch: name.includes('aarch64') ? 'darwin-aarch64' : 'linux-x86_64' };
  } else if (name.includes(".exe")) {
    return { platform: 'Windows', arch: name.includes('x64-setup') ? 'windows-x86_64' : 'unknown' };
  } else if (name.includes(".dmg")) {
    return { platform: 'MacOS', arch: name.includes('aarch64') ? 'darwin-aarch64' : 'darwin-x86_64' };
  } 
  return { platform: 'unknown', arch: 'unknown' };
}

async function main() {
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch latest release. Status: ${response.status}`);
    }

    const latestRelease = await response.json();
    const tagName = latestRelease.tag_name
    const assets = latestRelease.assets.filter(asset => {
      return !/\.(sig|json|zip|tar\.gz)$/.test(asset.name);

    }).map(asset => {
      const info = getAssetInfo(asset.name)
      return {
        url: asset.browser_download_url,
        name: asset.name,
        ...info
      }
    })

    const releasesJson = JSON.stringify({
      assets,
      version: tagName
    }, null, 4)
    
    fs.writeFileSync(releasesPath, releasesJson)
    console.log(`Updated releases at ${releasesPath} with \n${releasesJson}`)

  } catch (error) {
    console.error('Error fetching latest release:', error.message);
  }
}

main();