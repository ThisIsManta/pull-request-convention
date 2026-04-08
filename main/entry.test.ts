import * as fp from 'path'
import { vi, expect, it, describe, beforeEach } from 'vitest'
import { default as entryOriginal, getPullTemplate } from './entry'

const core = {
	getInput: vi.fn((key: string) => ''),
	setFailed: vi.fn(),
	info: vi.fn(),
	error: vi.fn(),
	debug: vi.fn(),
	isDebug: vi.fn(() => false)
}

const pull = {
	title: 'chore: xxx',
	body: '',
	labels: [],
}

const entry = (overriding: Partial<Parameters<typeof entryOriginal>[0]>) => {
	vi.clearAllMocks()

	return entryOriginal({
		pull,
		core,
		...overriding
	})
}

beforeEach(() => {
	vi.clearAllMocks()
})

vi.mock('@actions/github', () => ({
	getOctokit: vi.fn(() => ({
		rest: {
			repos: {
				getContent: async () => ({
					data: {
						type: 'file',
						path: '.github/PULL_REQUEST_TEMPLATE.md',
						encoding: 'base64',
						content: 'UHVsbCByZXF1ZXN0IHRlbXBsYXRlIHNhbXBsZS4=\n',
					}
				})
			}
		}
	})),
	context: {
		repo: {
			owner: 'owner',
			repo: 'repo'
		},
		payload: {
			pull_request: { number: 1 }
		}
	}
}))

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
			title: 'xxx'
		},
	})

	expect(core.setFailed).toHaveBeenCalledWith('The pull request title must match the pattern of "<type>[!]: <subject>" which is a reduced set of https://www.conventionalcommits.org/en/v1.0.0/')
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
			title: 'feat: xxx',
			body: 'https://github.com/taskworld/tw-frontend/assets/5592654/76a88f74-a49c-448d-8d5b-6be42c024ba9',
		},
	})

	expect(core.setFailed).not.toHaveBeenCalled()

	await entry({
		pull: {
			...pull,
			title: 'feat: xxx',
			body: 'https://github.com/user-attachments/assets/4ef10e40-c39a-4100-8961-1a9e720ab016',
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

	expect(core.setFailed).toHaveBeenLastCalledWith('A screenshot or a video is required in the description because the PR title has the type of "feat" or "fix".')

	core.setFailed.mockClear()

	await entry({
		pull: {
			...pull,
			title: 'fix: xxx',
			body: '',
		},
	})

	expect(core.setFailed).toHaveBeenLastCalledWith('A screenshot or a video is required in the description because the PR title has the type of "feat" or "fix".')
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
		template: `
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
		template: `
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
		template: `
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
		template: `
- [ ] www <!-- required -->
- [ ] xxx <!-- Required -->
- [ ] yyy <!-- REQUIRED -->
- [ ] zzz
		`
	})

	expect(core.setFailed).toHaveBeenCalledWith('The checklist item "www" must be in the description.')
	expect(core.setFailed).toHaveBeenCalledWith('The checklist item "xxx" must be in the description.')
})

it('throws if the required checklists are not checked, given a template', async () => {
	await entry({
		pull: {
			...pull,
			body: `
### Solutions
- [x] www
- [ ] xxx
- [X] yyy
- [ ] zzz
			`,
		},
		template: `
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
		template: `
- [ ] www <!-- required -->
- [ ] xxx <!-- required -->
		`
	})

	expect(core.setFailed).not.toHaveBeenCalled()
})

it('throws if the required checklists are not checked, given as-is PR description when a template is not accessible', async () => {
	await entry({
		pull: {
			...pull,
			body: `
### Solutions
- [ ] www <!-- required -->
- [ ] xxx
			`,
		},
	})

	expect(core.setFailed).toHaveBeenCalled()
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

describe(getPullTemplate, () => {
	it('returns the content of the local template', async () => {
		process.env.GITHUB_WORKSPACE = fp.resolve(__dirname, '..')
		delete process.env.GITHUB_TOKEN

		expect(await getPullTemplate(core)).toMatchInlineSnapshot(`"Pull request template sample."`)
	})

	it('returns the content of the remote template', async () => {
		delete process.env.GITHUB_WORKSPACE
		process.env.GITHUB_TOKEN = 'token'

		expect(await getPullTemplate(core)).toMatchInlineSnapshot(`"Pull request template sample."`)

		const { getOctokit } = await import('@actions/github')

		expect(getOctokit).toHaveBeenCalledWith('token')
	})

	it('returns undefined, given no template', async () => {
		process.env.GITHUB_WORKSPACE = fp.resolve(__dirname, 'invalid')
		process.env.GITHUB_TOKEN = 'token'

		const { getOctokit } = await import('@actions/github')
		vi.mocked(getOctokit).mockImplementationOnce(() => ({
			rest: {
				repos: {
					getContent: async () => {
						throw { status: 404 }
					}
				}
			}
		} as any))

		expect(await getPullTemplate(core)).toBeUndefined()
	})
})
