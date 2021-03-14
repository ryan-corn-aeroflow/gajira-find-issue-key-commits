const _ = require('lodash')
const core = require('@actions/core')
const Octokit = require('@octokit/rest')
const Jira = require('./common/net/Jira')

const issueIdRegEx = /([a-zA-Z0-9]+-[0-9]+)/g

const eventTemplates = {
  branch: '{{event.ref}}',
  commits: "{{event.commits.map(c=>c.message).join(' ')}}",
}

module.exports = class {
  constructor ({ githubEvent, argv, config }) {
    this.Jira = new Jira({
      baseUrl: config.baseUrl,
      token: config.token,
      email: config.email,
    })
    core.debug(`Config found: ${JSON.stringify(config)}`)
    core.debug(`Args found: ${JSON.stringify(argv)}`)
    this.config = config
    this.argv = argv
    this.githubEvent = githubEvent
    this.head_ref = argv.head_ref
    this.base_ref = argv.base_ref
    this.gist_private = argv.gist_private
    this.github = null
    this.createGist = false
    this.commitMessageList = null
    this.foundKeys = null

    if (argv.github_token && (argv.gist_name || (this.base_ref && this.head_ref))) {
      this.github = new Octokit({ auth: `token ${argv.github_token}` })

      if (argv.gist_name) this.createGist = true
    }
  }

  get repo () {
    if (process.env.GITHUB_REPOSITORY) {
      const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/')

      return { owner, repo }
    }

    if (this.githubEvent.repository) {
      return {
        owner: this.githubEvent.repository.owner.login,
        repo: this.githubEvent.repository.name,
      }
    }

    throw new Error('this.repo requires a GITHUB_REPOSITORY environment variable like \'owner/repo\'')
  }

  async getJiraKeysFromGit () {
    let match = null

    if (!(this.base_ref && this.head_ref)) {
      core.debug('Base ref and head ref not found')

      return
    }

    // This will work fine up to 250 commit messages
    const commits = await this.github.repos.compareCommits({
      ...this.repo,
      base: this.base_ref,
      head: this.head_ref,
    })

    if (!commits || !commits.data) { return }

    const fullArray = []

    match = this.head_ref.match(issueIdRegEx)

    for (const issueKey of match) { fullArray.push(issueKey) }

    for (const commit of commits.data.commits) {
      if (commit.message) {
        match = commit.message.match(issueIdRegEx)
        if (match) {
          for (const issueKey of match) { fullArray.push(issueKey) }
        }
      }
    }
    // Make the array Unique
    const uniqueKeys = [...new Set(fullArray)]

    core.debug(`Unique Keys: ${uniqueKeys}\n`)
    // Verify that the strings that look like key match real Jira keys
    this.foundKeys = []
    for (const issueKey of uniqueKeys) {
      const issue = await this.Jira.getIssue(issueKey)

      if (issue) { this.foundKeys.push(issue) }
    }
    core.debug(`Found Jira Keys: ${this.foundKeys}\n`)

    return this.foundKeys
  }

  async execute () {
    const issues = await this.getJiraKeysFromGit()

    if (issues) { return issues }

    const template = eventTemplates[this.argv.from] || this.argv._.join(' ')
    const extractString = this.preprocessString(template)

    if (!extractString) {
      core.warning(`This github event is not compatible with this usage.`)

      return
    }
    const match = extractString.match(issueIdRegEx)

    if (!match) {
      core.warning(`String "${extractString}" does not contain issueKeys`)

      return
    }

    for (const issueKey of match) {
      const issue = await this.Jira.getIssue(issueKey)

      if (issue) {
        return { issue: issue.key }
      }
    }
  }

  preprocessString (str) {
    try {
      _.templateSettings.interpolate = /{{([\s\S]+?)}}/g
      const tmpl = _.template(str)

      return tmpl({ event: this.githubEvent })
    } catch (error) {
      core.error(error)
    }
  }
}
