import compact from 'lodash/compact'
import difference from 'lodash/difference'
import escapeRegExp from 'lodash/escapeRegExp'

export default async function entry({ pull, repo, core, octokit, skip, fail }) {
	if (pull.draft) {
		skip('A draft PR is not ready to be checked.')
		return
	}

	const titleRule = core.getInput('title')
	if (titleRule) {
		const titleValidator = new RegExp(titleRule)
		if (!titleValidator.test(pull.title)) {
			fail('Pull request title must conform to ' + titleRule + '.')
		}
	}

	const exclusiveLabels = toArray(core.getInput('exclusive-labels'))
	if (exclusiveLabels.length > 0) {
		const foundLabels = pull.labels.filter(label => exclusiveLabels.includes(label.name))
		if (foundLabels.length === 0) {
			fail('One of the following pull request labels must be chosen: ' + exclusiveLabels.join(', ') + '.')
		} else if (foundLabels.length > 1) {
			fail('The following pull request labels could not co-exist: ' + foundLabels.join(', ') + '.')
		}
	}

	const description = pull.body
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
	if (requiredSections.length > 0) {
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
	if (requiredChecklists.length > 0) {
		const uncompletedChecklists = requiredChecklists.filter(text =>
			new RegExp('^' + escapeRegExp('- [x] ' + text), 'm').test(description) === false
		)
		if (uncompletedChecklists.length > 0) {
			fail('The following checklist items must be checked:' + uncompletedChecklists.map(text => '\n - ' + text).join(''))
		}
	}

	const requiredGraphicsOnTitle = core.getInput('required-graphics-on-title')
	const requiredGraphicsOnFiles = core.getInput('required-graphics-on-files')
	const markdownImageTag = /!\[[^\]]*\]\((.*?)\s*("(?:.*[^"])")?\s*\)/m
	const htmlImageTag = /\<img\W(.|\r?\n)*?\>/m
	const htmlVideoTag = /\<video\W(.|\r?\n)*?\>/m
	const gitHubVideoURL = /https:\/\/user-images\.githubusercontent\.com(?:\/[a-zA-Z0-9\-]+?)+?\.(?:mp4|mov)/mi

	if (
		!markdownImageTag.test(description) &&
		!htmlImageTag.test(description) && // TODO: check "src" attribute
		!htmlVideoTag.test(description) && // TODO: check "src" attribute
		!gitHubVideoURL.test(description)
	) {
		if (requiredGraphicsOnFiles === '.*') {
			// Avoid reaching GitHub API rate limit
			fail('A screenshot or video is always required in the description')

		} else if (requiredGraphicsOnFiles) {
			const filePattern = new RegExp(requiredGraphicsOnFiles, 'i')

			let pageIndex = 0
			while (++pageIndex) {
				const { data: files } = await octokit.rest.pulls.listFiles({
					...repo,
					pull_number: pull.number,
					page: pageIndex,
				})
				if (!Array.isArray(files) || files.length === 0) {
					break
				}

				const graphicFile = files.find(file => file.status !== 'deleted' && filePattern.test(file.filename))
				if (graphicFile) {
					fail('A screenshot or video is required in the description because of ' + graphicFile.filename)
					break
				}
			}
		}

		if (requiredGraphicsOnTitle) {
			const titlePattern = new RegExp(requiredGraphicsOnTitle)
			if (titlePattern.test(pull.title)) {
				fail('A screenshot or video is required in the description because the title matches ' + titlePattern.source)
			}
		}
	}
}

function toArray(newLineSeparatedText) {
	if (typeof newLineSeparatedText !== 'string') {
		return []
	}

	return compact(newLineSeparatedText.trim().split('\n'))
}
