import { $ } from 'bun'
import fs from 'fs/promises'
import path from 'path'
import { Glob } from 'bun'

// Tired of non functional workflows extensions
// Upload specifid file to latest release script

// Github options
const OWNER = 'thewh1teagle'
const REPO = 'vibe'
const TOKEN = process.env.GITHUB_TOKEN
const TAG = await $`git describe --abbrev=0`.text()
const DST = process.argv[2]
const glob = new Glob(DST)

async function publish(dst, token, tag) {
	if (!(await fs.exists(dst))) {
		throw new Error(`${dst} Not exists`)
	}
	try {
		const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases`, {
			headers: {
				Authorization: `Bearer ${token}`,
				'X-GitHub-Api-tag': '2022-11-28',
				Accept: 'application/vnd.github+json',
			},
			method: 'POST',
			body: JSON.stringify({
				tag_name: tag,
				target_commitish: 'main',
				name: tag,
				body: 'See assets for download',
				draft: false,
				prerelease: false,
				generate_release_notes: false,
			}),
		})
		checkResponse(res)
		const data = await res.json()
		if (!data?.errors?.code === 'already_exists') {
			await checkResponse(res)
		}

		console.log(`Created Release ${tag}`)
	} catch (e) {
		console.error(`Failed to create release ${tag}: ${e}`)
	}

	// Get release ID
	const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${tag}`, {
		headers: {
			Authorization: `Bearer ${token}`,
			'X-GitHub-Api-tag': '2022-11-28',
			Accept: 'application/vnd.github+json',
		},
	})
	checkResponse(res)
	const releaseData = await res.json()
	const releaseID = releaseData.id
	const prevID = releaseData.assets.find((a) => a.name === dst)?.id

	if (prevID) {
		// Delete previous asset
		const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/assets/${prevID}`, {
			headers: {
				Authorization: `Bearer ${token}`,
				'X-GitHub-Api-tag': '2022-11-28',
				Accept: 'application/vnd.github+json',
			},
			method: 'DELETE',
		})
		await checkResponse(res)
	}

	// Upload asset
	try {
		const name = path.basename(dst)
		const res = await fetch(`https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${releaseID}/assets?name=${name}`, {
			headers: {
				Authorization: `Bearer ${token}`,
				'X-GitHub-Api-tag': '2022-11-28',
				Accept: 'application/vnd.github+json',
				'Content-Type': 'application/octet-stream',
			},
			method: 'POST',
			body: await fs.readFile(dst),
		})
		await checkResponse(res)
		console.log(`Upload asset ${name} from ${dst} successfuly!`)
	} catch (e) {
		console.error(`Failed to upload asset ${dst}: ${e}`)
	}
}

async function checkResponse(response) {
	if (![200, 201, 204, 422].includes(response.status)) {
		const reason = await response.text()
		console.error(`status ${response.status} for ${response.url}: `, reason)
		process.exit(1)
	}
}

for await (const file of glob.scan()) {
	await publish(file, TOKEN, TAG)
}
