import { $ } from 'bun'
import fs from 'fs/promises'
import path from 'path'
import { Glob } from 'bun'

// Tired of non functional workflows extensions
// Upload specifid file to latest release script

// Github options
const OWNER = 'thewh1teagle'
const REPO = 'vibe'
const TOKEN = process.env.GH_TOKEN
const tauriConfPath = path.join(__dirname, '../desktop/src-tauri/tauri.conf.json')
const TAG = 'v' + (await JSON.parse(await fs.readFile(tauriConfPath)).version)
const DST = process.argv[2]
const glob = new Glob(DST)
const DEBUG = process.env.DEBUG === '1'

async function publish(dst, token, tag) {
	await $`gh release upload ${tag} ${dst} --clobber`
}

for await (const file of glob.scan()) {
	await publish(file, TOKEN, TAG)
}
