import * as core from '@actions/core'
import * as github from '@actions/github'
import entry from './entry.mjs'
import * as fs from 'fs/promises'
import * as fp from 'path'

const pull = github.context.payload.pull_request
const repo = github.context.repo

entry({
	pull,
	repo,
	core,
	getPullTemplate: async () => {
		try {
			const path = fp.resolve(process.env.GITHUB_WORKSPACE, '.github/PULL_REQUEST_TEMPLATE.md')
			core.debug(path)

			return await fs.readFile(path, 'utf-8')

		} catch (error) {
			core.debug(error)
			return ''
		}
	},
	getFilesChanged: async (pageIndex) => {
		if (!process.env.GITHUB_TOKEN) {
			throw new Error('The env `GITHUB_TOKEN` is required to make API calls.')
		}

		// See https://octokit.github.io/rest.js/v19#pulls-list-files
		const octokit = github.getOctokit(process.env.GITHUB_TOKEN)
		const { data } = await octokit.rest.pulls.listFiles({
			...repo,
			pull_number: pull.number,
			per_page: 50,
			page: pageIndex,
		})
		return data
	},
}).catch((error) => {
	core.setFailed(error)
})
