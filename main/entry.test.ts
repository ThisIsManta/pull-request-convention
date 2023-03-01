import { jest, expect, it } from '@jest/globals'
import { default as entryOriginal } from './entry'

const core = {
	getInput: jest.fn((key: string) => ''),
	setFailed: jest.fn(),
	info: jest.fn(),
	error: jest.fn(),
	debug: jest.fn(),
}

const pull = {
	title: 'chore: xxx',
	body: '',
	labels: [],
}

const entry = (overriding: Partial<Parameters<typeof entryOriginal>[0]>) => {
	jest.clearAllMocks()

	return entryOriginal({
		pull,
		core,
		getPullTemplate: async () => '',
		...overriding
	})
}

it('throws given no pull request information', async () => {
	await entry({
		pull: undefined,
	})

	expect(core.setFailed).toHaveBeenCalledWith('The pull request information could not be found. Please make sure that the action is triggered on "pull_request" event.')
})

it('throws if the PR title violates the convention', async () => {
	await entry({
		pull: {
			...pull,
			title: 'chore: xxx'
		},
	})

	expect(core.setFailed).not.toHaveBeenCalled()

	await entry({
		pull: {
			...pull,
			title: 'chore!: xxx'
		},
	})

	expect(core.setFailed).not.toHaveBeenCalled()

	await entry({
		pull: {
			...pull,
			title: 'xxx'
		},
	})

	expect(core.setFailed).toHaveBeenCalledWith('The type in a pull request title must be one of \"feat\", \"fix\", \"test\", \"refactor\", \"chore\".')

	await entry({
		pull: {
			...pull,
			title: 'unknown: xxx'
		},
	})

	expect(core.setFailed).toHaveBeenCalledWith('The type in a pull request title must be one of \"feat\", \"fix\", \"test\", \"refactor\", \"chore\".')

	await entry({
		pull: {
			...pull,
			title: 'CHORE: xxx'
		},
	})

	expect(core.setFailed).toHaveBeenCalledWith('The type in a pull request title must be in lower case only.')

	await entry({
		pull: {
			...pull,
			title: 'chore:xxx'
		},
	})

	expect(core.setFailed).toHaveBeenCalledWith('A single space must be after ":" symbol.')

	await entry({
		pull: {
			...pull,
			title: 'chore: Xxx'
		},
	})

	expect(core.setFailed).toHaveBeenCalledWith('The subject must start with a lower case latin alphabet.')

	await entry({
		pull: {
			...pull,
			title: 'chore(scope): xxx'
		},
	})

	expect(core.setFailed).toHaveBeenCalledWith('A scope in a pull request title is never allowed.')
})

it('throws if the PR title is feat/fix but no graphics in the PR description', async () => {
	await entry({
		pull: {
			...pull,
			title: 'feat: xxx',
			body: '![img](https://i.picsum.photos/id/8/200/200.jpg)',
		},
	})

	expect(core.setFailed).not.toHaveBeenCalled()

	await entry({
		pull: {
			...pull,
			title: 'chore: xxx',
			body: '',
		},
	})

	expect(core.setFailed).not.toHaveBeenCalled()

	await entry({
		pull: {
			...pull,
			title: 'feat: xxx',
			body: '',
		},
	})

	expect(core.setFailed).toHaveBeenCalledWith('A screenshot or video is required in the description because the PR title is the type of "feat".')

	await entry({
		pull: {
			...pull,
			title: 'fix: xxx',
			body: '',
		},
	})

	expect(core.setFailed).toHaveBeenCalledWith('A screenshot or video is required in the description because the PR title is the type of "fix".')
})

it('throws if the PR has "do-not-merge" label', async () => {
	await entry({
		pull: {
			...pull,
			labels: [{ name: 'do-not-merge' }]
		},
	})

	expect(core.setFailed).toHaveBeenCalledWith('The label "do-not-merge" must be removed in order to proceed merging the pull request.')
})

it('throws if the required headings are not found', async () => {
	await entry({
		pull: {
			...pull,
			body: `
### Problems
Content goes here
			`,
		},
		getPullTemplate: async () => `
### Problems
Content goes here
		`
	})

	expect(core.setFailed).not.toHaveBeenCalled()

	await entry({
		pull: {
			...pull,
			body: '',
		},
		getPullTemplate: async () => `
### Problems
Content goes here
		`
	})

	expect(core.setFailed).toHaveBeenCalledWith('The heading "Problems" must be in the description.')
})

it('throws if a heading has no content', async () => {
	await entry({
		pull: {
			...pull,
			body: `
### Problems
Content goes here
### Solutions
Content goes here
			`,
		},
	})

	expect(core.setFailed).not.toHaveBeenCalled()

	await entry({
		pull: {
			...pull,
			body: `
### Problems
### Solutions
Content goes here
			`,
		},
	})

	expect(core.setFailed).toHaveBeenCalledWith('The heading "Problems" must be followed by some content.')
})

it('throws if the required checklists are not found', async () => {
	await entry({
		pull: {
			...pull,
			body: '',
		},
		getPullTemplate: async () => `
- [ ] zzz
		`
	})

	expect(core.setFailed).not.toHaveBeenCalled()

	await entry({
		pull: {
			...pull,
			body: `
### Problems
### Solutions
Content goes here
			`,
		},
		getPullTemplate: async () => `
- [ ] www <!-- required -->
- [ ] xxx <!-- Required -->
- [ ] yyy <!-- REQUIRED -->
- [ ] zzz
		`
	})

	expect(core.setFailed).toHaveBeenCalledWith('The checklist item "www" must be in the description.')
	expect(core.setFailed).toHaveBeenCalledWith('The checklist item "xxx" must be in the description.')
})

it('throws if the required checklists are not checked', async () => {
	await entry({
		pull: {
			...pull,
			body: `
### Solutions
- [x] www
- [ ] xxx
- [x] yyy
- [ ] zzz
			`,
		},
		getPullTemplate: async () => `
- [ ] www <!-- required -->
- [ ] xxx <!-- required -->
- [ ] yyy
- [ ] zzz
		`
	})

	expect(core.setFailed).toHaveBeenCalledWith('The checklist item "xxx" must be checked.')

	await entry({
		pull: {
			...pull,
			body: `
### Solutions
- [x] www
- [x] xxx
			`,
		},
		getPullTemplate: async () => `
- [ ] www <!-- required -->
- [ ] xxx <!-- required -->
		`
	})

	expect(core.setFailed).not.toHaveBeenCalled()
})

describe('exclusive-labels', () => {
	it('throws if none of the exclusive labels is chosen', async () => {
		core.getInput.mockImplementation((key) => {
			if (key === 'exclusive-labels') {
				return `
					review-me
					ready-to-merge
				`
			}

			return ''
		})

		await entry({
			pull: { ...pull, labels: [{ name: 'something-else' }] },
		})

		expect(core.setFailed).toHaveBeenCalledWith('The added labels must be one of "review-me", "ready-to-merge".')
	})

	it('throws if more than one exclusive labels are chosen', async () => {
		core.getInput.mockImplementation((key) => {
			if (key === 'exclusive-labels') {
				return `
					review-me
					ready-to-merge
				`
			}

			return ''
		})

		await entry({
			pull: {
				...pull,
				labels: [{ name: 'review-me' }, { name: 'something-else' }]
			},
		})

		expect(core.setFailed).not.toHaveBeenCalled()

		await entry({
			pull: {
				...pull,
				labels: [{ name: 'review-me' }, { name: 'ready-to-merge' }]
			},
		})

		expect(core.setFailed).toHaveBeenCalledWith('The following labels could not co-exist: "review-me", "ready-to-merge".')
	})
})
