import * as core from '@actions/core'
import * as github from '@actions/github'
import type { PullRequest } from '@octokit/webhooks-types'
import entry, { getPullTemplate } from './entry'

if (github.context.eventName !== 'pull_request') {
	core.setFailed('This action only works on "pull_request" events.')
	process.exit(1)
}

const pull = github.context.payload.pull_request as PullRequest

getPullTemplate(core).then(template => {
	entry({ pull, core, template }).catch((error) => {
		core.setFailed(error)
	})
})
