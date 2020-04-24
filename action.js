const _ = require('lodash')
const Jira = require('./common/net/Jira')
const Octokit = require('@octokit/rest')
const core = require('@actions/core')

const issueIdRegEx = /([a-zA-Z0-9]+-[0-9]+)/g

const eventTemplates = {
  branch: '{{event.ref}}',
  commits: "{{event.commits.map(c=>c.message).join(' ')}}",
}

module.exports = class {

  constructor({ githubEvent, argv, config }) {
    this.Jira = new Jira({
      baseUrl: config.baseUrl,
      token: config.token,
      email: config.email,
    })

    this.config = config
    this.argv = argv
    this.githubEvent = githubEvent
    this.head_ref = config.head_ref
    this.base_ref = config.base_ref
    this.gist_private = config.gist_private
    this.payload = process.env.GITHUB_EVENT_PATH ? require(process.env.GITHUB_EVENT_PATH) : {}
    this.github = null
    this.createGist = false
    this.commitMessageList = null

    if (config.github_token && (config.gist_name || (config.base_ref && config.head_ref))) {

      this.github = new Octokit({ auth: `token ${config.github_token}` })

      if (config.gist_name)
        this.createGist = true

      if (config.base_ref && config.head_ref)
        this.foundKeys = new Array()


    }
  }

  get repo() {
    if (process.env.GITHUB_REPOSITORY) {
      const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/')
      return { owner, repo }
    }

    if (this.payload.repository) {
      return {
        owner: this.payload.repository.owner.login,
        repo: this.payload.repository.name
      }
    }

    throw new Error('this.repo requires a GITHUB_REPOSITORY environment variable like \'owner/repo\'')
  }

  async getJiraKeysFromGit() {
    var match = null
    if (!(this.base_ref && this.head_ref))
      return this.foundKeys

    // This will work fine up to 250 commit messages
    commits = await this.github.repos.compareCommits({
      ...this.repo,
      base: this.base_ref,
      head: this.head_ref,
    })

    if (!commits || !commits.data)
      return this.foundKeys

    let fullArray = new Array()
    match = this.head_ref.match(issueIdRegEx)

    for (const issueKey of match)
      fullArray.push(issueKey)

    for (const commit of commits.data.commits) {

      if (!commit.message)
        continue

      match = commit.message.match(issueIdRegEx)
      if (!match)
        continue

      for (const issueKey of match)
        fullArray.push(issueKey)

    }
    // Make the array Unique
    const uniqueKeys = [...new Set(fullArray)]
    console.log(`Unique Keys: ${uniqueKeys}\n`)
    // Verify that the strings that look like key match real Jira keys
    for (const issueKey of uniqueKeys) {
      const issue = await this.Jira.getIssue(issueKey)
      if (issue)
        this.foundKeys.push(issue)
    }
    console.log(`Found Jira Keys: ${this.foundKeys}\n`)
    return this.foundKeys
  }

  async execute() {

    const issues = await this.getJiraKeysFromGit()

    if (issues)
      return issues

    const template = eventTemplates[this.argv.from] || this.argv._.join(' ')
    const extractString = this.preprocessString(template)
    if (!extractString) {
      core.warning(`The event type ${this.githubEvent} is not compatible with this usage`)
      return
    }
    const match = extractString.match(issueIdRegEx)

    if (!match) {
      console.log(`String "${extractString}" does not contain issueKeys`)

      return
    }

    for (const issueKey of match) {
      const issue = await this.Jira.getIssue(issueKey)

      if (issue) {
        return { issue: issue.key }
      }
    }
  }

  preprocessString(str) {
    _.templateSettings.interpolate = /{{([\s\S]+?)}}/g
    const tmpl = _.template(str)
    try {
      return tmpl({ event: this.githubEvent })
    } catch (error) {
      console.error(error)
      return
    }

  }


}