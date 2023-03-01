import * as core from '@actions/core'
import * as github from '@actions/github'
import type { PullRequest } from '@octokit/webhooks-definitions/schema'
import entry from './entry'
import * as fs from 'fs/promises'
import * as fp from 'path'

if (github.context.eventName !== 'pull_request') {
	core.setFailed('This action only works on "pull_request" events.')
	process.exit(1)
}

const pull = github.context.payload.pull_request as PullRequest

entry({
	pull,
	core,
	getPullTemplate: async () => {
		try {
			if (!process.env.GITHUB_WORKSPACE) {
				throw new Error('Expect `process.env.GITHUB_WORKSPACE` to be a non-empty string but got ' + JSON.stringify(process.env.GITHUB_WORKSPACE))
			}

			const path = fp.resolve(process.env.GITHUB_WORKSPACE, '.github/PULL_REQUEST_TEMPLATE.md')
			core.debug(path)

			return await fs.readFile(path, 'utf-8')

		} catch (error) {
			core.debug(String(error))
			return ''
		}
	},
}).catch((error) => {
	core.setFailed(error)
})
