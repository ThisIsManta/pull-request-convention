import difference from 'lodash/difference'
import truncate from 'lodash/truncate'

export default async function entry({
	pull,
	repo,
	core,
	getPullTemplate,
}) {
	if (!pull) {
		core.setFailed('The pull request information could not be found. Please make sure that the action is triggered on "pull_request" event.')
		return
	}

	const template = await getPullTemplate()
	core.debug('template »', template)

	const titlePattern = /^(\w+)(\(.*?\))?(\!)?:(.+)/
	const [, type, scope, breaking, subject] = pull.title.match(titlePattern) || []
	core.debug(JSON.stringify({ type, scope, breaking, subject }, null, 2))

	const allowedTypes = ['feat', 'fix', 'test', 'refactor', 'chore']

	const titleErrors = [
		allowedTypes.includes(type) === false &&
		'The type in a pull request title must be one of ' + allowedTypes.map(name => '"' + name + '"').join(', ') + '.',

		typeof type === 'string' && /^[a-z]+$/.test(type) === false &&
		'The type in a pull request title must be in lower case only.',

		scope &&
		'A scope in a pull request title is never allowed.',

		typeof type === 'string' && typeof subject !== 'string' &&
		'The subject in a pull request title must be provided.',

		typeof subject === 'string' && (subject.startsWith(' ') === false || subject.match(/^ +/)[0].length > 1) &&
		'A single space must be after ":" symbol.',

		typeof subject === 'string' && /^[a-z]/.test(subject.trim()) === false &&
		'The subject must start with a lower case latin alphabet.',
	].filter(error => typeof error === 'string')
	if (titleErrors.length > 0) {
		core.info('The pull request title must match the pattern of "<type>[!]: <subject>" which is a reduced set of https://www.conventionalcommits.org/en/v1.0.0/')
		for (const message of titleErrors) {
			core.setFailed(message)
		}
	}

	const exclusiveLabels = toArray(core.getInput('exclusive-labels'))
	if (exclusiveLabels.length > 0) {
		const foundLabels = pull.labels
			.map(label => label.name)
			.filter(name => exclusiveLabels.includes(name))
		if (foundLabels.length === 0) {
			core.setFailed('The added labels must be one of ' + exclusiveLabels.map(name => '"' + name + '"').join(', ') + '.')
		} else if (foundLabels.length > 1) {
			core.setFailed('The following labels could not co-exist: ' + foundLabels.map(name => '"' + name + '"').join(', ') + '.')
		}
	}

	const description = stripHTMLComments(pull.body)

	const foundSections = getSections(description)

	const requiredSections = getSections(template)
	if (requiredSections.length > 0) {
		const missingSections = difference(
			requiredSections.map(section => section.head),
			foundSections.map(section => section.head)
		)
		for (const name of missingSections) {
			core.setFailed(`The heading "${name}" must be in the description.`)
		}
	}

	const emptySections = foundSections.filter(section => section.body.length === 0).map(section => section.head)
	for (const name of emptySections) {
		core.setFailed(`The heading "${name}" must be followed by some content.`)
	}

	const requiredChecklists = getChecklistItems(template)
		.filter(({ text }) => /<!--\s*REQUIRED\s*-->/i.test(text))
		.map(({ text }) => stripHTMLComments(text))
	if (requiredChecklists.length > 0) {
		const foundChecklistItems = getChecklistItems(description)

		const missingChecklists = difference(
			requiredChecklists,
			foundChecklistItems.map(({ text }) => text)
		)
		if (missingChecklists.length > 0) {
			core.info('See https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#task-lists')
			for (const name of missingChecklists) {
				core.setFailed(`The checklist item "${truncate(name, { length: 30, separator: /,?\s+/ })}" must be in the description.`)
			}
		}

		const uncompletedChecklists = foundChecklistItems
			.filter(({ checked, text }) => checked === false && requiredChecklists.includes(text))
			.map(({ text }) => text)
		for (const name of uncompletedChecklists) {
			core.setFailed(`The checklist item "${truncate(name, { length: 30, separator: /,?\s+/ })}" must be checked.`)
		}
	}

	const markdownImageTag = /!\[[^\]]*\]\((.*?)\s*("(?:.*[^"])")?\s*\)/m
	const htmlImageTag = /\<img\W(.|\r?\n)*?\>/m
	const htmlVideoTag = /\<video\W(.|\r?\n)*?\>/m
	const gitHubVideoURL = /https:\/\/user-images\.githubusercontent\.com(?:\/[a-zA-Z0-9\-]+?)+?\.(?:mp4|mov)/mi

	const graphicRequiredTypes = ['feat', 'fix']
	if (
		graphicRequiredTypes.includes(type) &&
		!markdownImageTag.test(description) &&
		!htmlImageTag.test(description) && // TODO: check "src" attribute
		!htmlVideoTag.test(description) && // TODO: check "src" attribute
		!gitHubVideoURL.test(description)
	) {
		core.setFailed('A screenshot or video is required in the description because the PR title is the type of "' + graphicRequiredTypes[graphicRequiredTypes.indexOf(type)] + '".')
	}

	if (pull.labels.some(label => label.name === 'do-not-merge')) {
		core.setFailed('The label "do-not-merge" must be removed in order to proceed merging the pull request.')
	}
}

function toArray(newLineSeparatedText) {
	if (typeof newLineSeparatedText !== 'string') {
		return []
	}

	return newLineSeparatedText.split('\n')
		.map(line => line.trim())
		.filter(line => line.length > 0)
}

function getSections(description) {
	return description
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
}

function getChecklistItems(description) {
	return description
		.split('\n')
		.map(line => line.trim().match(/^- \[(?<mark>x| )\] (?<text>.+)/))
		.filter(item => !!item)
		.map(({ groups }) => ({ text: groups.text, checked: groups.mark === 'x' }))
}

function stripHTMLComments(description) {
	return description
		.replace(/(?=<!--)([\s\S]*?)-->/gm, '')
		.trim()
}
