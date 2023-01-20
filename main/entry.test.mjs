import { jest, expect, it } from '@jest/globals'
import entry from './entry.mjs'

const core = {
	getInput: jest.fn(),
}

const repo = {}

const octokit = {
	rest: {
		pulls: {
			listFiles: jest.fn(),
		}
	}
}

const skip = jest.fn()

const fail = jest.fn()

afterEach(() => {
	jest.resetAllMocks()
})

it('does not fail, given a draft PR', () => {
	const pull = { draft: true }

	entry({ pull, repo, core, octokit, skip, fail })

	expect(skip).toHaveBeenCalled()
	expect(fail).not.toHaveBeenCalled()
})

// TODO: add more test cases

describe('required-graphics', () => {
	it('checks against the PR title', () => {
		core.getInput.mockImplementation((key) => {
			if (key === 'required-graphics') {
				return { title: '^(feat|fix)\\S' }
			}
		})

		entry({
			pull: {
				title: 'feat: xx',
				body: '![img](https://i.picsum.photos/id/8/200/200.jpg)',
			},
			repo, core, octokit, skip, fail
		})

		expect(fail).not.toHaveBeenCalled()

		entry({
			pull: {
				title: 'chore: xx',
				body: '',
			},
			repo, core, octokit, skip, fail
		})

		expect(fail).not.toHaveBeenCalled()

		entry({
			pull: {
				title: 'feat: xx',
				body: '',
			},
			repo, core, octokit, skip, fail
		})

		expect(fail).toHaveBeenCalledWith('A screenshot or video is required in the description because the title matches ^(feat|fix)\\S')
	})
})
