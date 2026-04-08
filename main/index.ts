import * as core from '@actions/core'
import * as github from '@actions/github'
import type { PullRequest } from '@octokit/webhooks-types'
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
		const path = '.github/PULL_REQUEST_TEMPLATE.md'

		// Try to read the template locally
		if (process.env.GITHUB_WORKSPACE) {
			const localPath = fp.join(process.env.GITHUB_WORKSPACE, path)
			if (await fs.access(localPath).then(() => true).catch(() => false)) {
				return await fs.readFile(localPath, 'utf-8')
			}
		}

		// Try to fetch the template remotely
		if (process.env.GITHUB_TOKEN) {
			const octokit = github.getOctokit(process.env.GITHUB_TOKEN)

			try {
				const response = await octokit.rest.repos.getContent({
					owner: github.context.repo.owner,
					repo: github.context.repo.repo,
					path,
				})
				if (core.isDebug()) {
					core.debug('response »' + JSON.stringify(response, null, 2))
				}

				if ('type' in response.data && response.data.type === 'file' && typeof response.data.content === 'string') {
					return Buffer.from(response.data.content, 'base64').toString("utf-8")
				}
			} catch (error) {
				core.debug(String(error))
			}
		}

		return ''
	},
}).catch((error) => {
	core.setFailed(error)
})
