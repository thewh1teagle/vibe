import fs from 'fs/promises'
import path from 'path'
import { Glob } from 'bun'

// Usage: node script.js <src_path> <dst_path_template>
// Note: <src_path> supports glob patterns for matching multiple files.
// Use @name for the filename and @ext for the extension (without the dot) in <dst_path_template>.
// Use @dir for the dirname from src_path into <dst_path_template>.

const srcArg = process.argv[process.argv.length - 2]
let dstArg = process.argv[process.argv.length - 1]

const srcGlob = new Glob(srcArg)

for await (const file of srcGlob.scan('.')) {
	let nameWithExtension = path.basename(file)
	const ext = path.extname(nameWithExtension).slice(1)
	const name = nameWithExtension.substring(0, nameWithExtension.lastIndexOf('.'))
	let dst = dstArg.replace('@name', name)
	dst = dst.replace('@ext', ext)
	dst = dst.replace('@dir', path.dirname(srcArg))
	await fs.rename(file, dst)
	console.log(dst)
}
