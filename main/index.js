const core = require('@actions/core')
const github = require('@actions/github')
const compact = require('lodash/compact')
const difference = require('lodash/difference')
const escapeRegExp = require('lodash/escapeRegExp')

const octokit = github.getOctokit(process.env.GITHUB_TOKEN)
const pr = github.context.payload.pull_request

let failed = false

	;
(async () => {
	if (pr.draft) {
		skip('A draft PR is not ready to be checked.')
	}

	const titleRule = core.getInput('title')
	if (titleRule) {
		const titleValidator = new RegExp(titleRule)
		if (!titleValidator.test(pr.title)) {
			fail('Pull request title must conform to ' + titleRule + '.')
		}
	}

	const exclusiveLabels = toArray(core.getInput('exclusive-labels'))
	if (exclusiveLabels) {
		const foundLabels = pr.labels.filter(label => exclusiveLabels.includes(label.name))
		if (foundLabels.length === 0) {
			fail('One of the following pull request labels must be chosen: ' + exclusiveLabels.join(', ') + '.')
		} else if (foundLabels.length > 1) {
			fail('The following pull request labels could not co-exist: ' + foundLabels.join(', ') + '.')
		}
	}

	const description = pr.body
		.replace(/<!--.+?-->/g, '') // Strip out Markdown comments
		.trim()

	const sections = description
		.split(/^#+/m)
		.slice(1)
		.map(text => {
			const [head, ...body] = text.split('\n')
			return {
				head: head.trim(),
				body: body.filter(line => line.trim().length > 0),
			}
		})
		.filter(({ head }) => head.length > 0)

	const requiredSections = toArray(core.getInput('required-sections'))
	if (requiredSections) {
		const missingSections = difference(requiredSections, sections.map(section => section.head))
		if (missingSections.length > 0) {
			fail('The following sections must be presented in the description:' + missingSections.map(text => '\n - ' + text).join(''))
		}
	}

	const emptySections = sections.filter(section => section.body.length === 0).map(section => section.head)
	if (emptySections.length > 0) {
		fail('The following sections must not be empty:' + emptySections.map(text => '\n - ' + text).join(''))
	}

	const requiredChecklists = toArray(core.getInput('required-checklists'))
	if (requiredChecklists) {
		const uncompletedChecklists = requiredChecklists.filter(text =>
			new RegExp('^' + escapeRegExp('- [x] ' + text), 'm').test(description) === false
		)
		if (uncompletedChecklists.length > 0) {
			fail('The following checklist items must be checked:' + uncompletedChecklists.map(text => '\n - ' + text).join(''))
		}
	}

	const screenshotsOrVideosRequired = core.getBooleanInput('screenshots-or-videos-required')
	if (screenshotsOrVideosRequired) {
		const markdownImageTag = /!\[[^\]]*\]\((.*?)\s*("(?:.*[^"])")?\s*\)/m
		const htmlImageTag = /\<img\W(.|\r?\n)*?\>/m
		const htmlVideoTag = /\<video\W(.|\r?\n)*?\>/m
		const gitHubVideoURL = /https:\/\/user-images\.githubusercontent\.com(?:\/[a-zA-Z0-9\-]+?)+?\.(?:mp4|mov)/mi

		if (
			!markdownImageTag.test(description) &&
			!htmlImageTag.test(description) &&
			!htmlVideoTag.test(description) &&
			!gitHubVideoURL.test(description)
		) {
			let pageIndex = 0
			while (++pageIndex) {
				const files = await octokit.rest.pulls.listFiles({
					...github.context.repo,
					pull_number: pr.number,
					page: pageIndex,
				})
				if (!Array.isArray(files) || files.length === 0) {
					break
				}

				const graphicFile = files.find(file => /\.(html|jsx|tsx|jpg|gif|png|svg|woff2?)$/i.test(file.filename) && file.status !== 'deleted')
				if (graphicFile) {
					fail('Screenshots or videos are required in the description because of ' + graphicFile.filename)
					break
				}
			}
		}
	}

	if (failed) {
		process.exit(1)
	}
})().catch((error) => {
	console.log(error)
	process.exit(2)
})

function fail(message) {
	core.error(message)
	failed = true
}

function skip(message) {
	core.info(message)
	process.exit(0)
}

function toArray(newLineSeparatedText) {
	if (typeof newLineSeparatedText !== 'string') {
		return undefined
	}

	return compact(newLineSeparatedText.trim().split('\n'))
}