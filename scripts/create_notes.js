import { $ } from 'bun';

// Get the last tag commit
const gitInfo = (await $`git describe --tags --abbrev=0`.text()).trim()
const lastTagCommit = (await $`git rev-list -n 1 ${gitInfo.trim()}`.text()).trim()
const current = (await $`git rev-parse HEAD`.text()).trim()
const messages = (await $`git log --oneline ${lastTagCommit}..${current}`.text())

const prompt = `
Old Release notes:
"""
What's new? 🎉📣

- 🌍 Fix linux i18n (Thanks for @oleole39)
- ⏱️ Add option to transcribe word timestamps
- 🍏 Add macOS dmg installation background
- 💻 Set GPU preference to high performance on Windows by default
- 🔠 Max letters per sentence! (Thanks for @sdimantsd)
- 🎮 Choose GPU device (Thanks for @israelxss for the suggestion!)
"""

Please write new one. based on the new commits. 
Please keep only new features that important to simple users.
And add technical features only if they are critical.
Commits are:
${messages}
`


console.log(prompt)