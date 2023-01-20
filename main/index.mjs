import * as core from '@actions/core'
import * as github from '@actions/github'
import entry from './entry.mjs'

let failed = false

entry({
	pull: github.context.payload.pull_request,
	repo: github.context.repo,
	core,
	octokit: github.getOctokit(process.env.GITHUB_TOKEN),
	skip,
	fail,
}).then(() => {
	if (failed) {
		process.exit(1)
	}
}).catch((error) => {
	console.log(error)
	process.exit(2)
})

function fail(message) {
	core.error(message)
	failed = true
}

function skip(message) {
	core.info(message)
}
