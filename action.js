const _ = require('lodash')
const core = require('@actions/core')
const { Octokit } = require('@octokit/rest')
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
    this.github = null
    this.createIssue = argv.createIssue
    this.commitMessageList = null
    this.foundKeys = null

    if (argv.githubToken && (argv.createIssue || (this.base_ref && this.head_ref))) {
      this.github = new Octokit({ auth: `token ${argv.githubToken}` })
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

  async findGithubMilestone (issueMilestone) {
    const milestones = await this.github.issues.listMilestonesForRepo({
      ...this.repo,
      state: 'all',
    })

    for (const element of milestones.data) {
      if (element.title === issueMilestone.toString()) {
        core.debug(`Existing milestone found: ${element.title}`)

        return element
      }
    }
    core.debug(`Existing milestone not found.`)
  }

  async createOrUpdateMilestone (issueMilestone, issueMilestoneDueDate, issueMilestoneDescription) {
    let milestone = await this.findGithubMilestone(issueMilestone)

    if (milestone) {
      if (milestone.state === 'closed') {
        this.github.issues.updateMilestone({
          ...this.repo,
          milestone_number: milestone.number,
          description: issueMilestoneDescription,
          state: 'open',
          due_on: issueMilestoneDueDate,
        })
      }

      return milestone.number
    }

    milestone = await this.github.issues.createMilestone({
      ...this.repo,
      title: `${issueMilestone}`,
      description: issueMilestoneDescription,
      state: 'open',
      // YYYY-MM-DDTHH:MM:SSZ
      due_on: issueMilestoneDueDate,
    })

    return milestone.number
  }

  async createOrUpdateGHIssue (issueKey, issueTitle, issueBody, issueAssignee, milestoneNumber) {
    const issues = await this.github.issues.listForRepo({
      ...this.repo,
      state: 'open',
    })
    let issueNumber = null

    for (const i in issues.data) {
      if (!i.pull_request && i.title.contains(issueKey)) {
        issueNumber = i.issue_number
        break
      }
    }

    let issue = null

    if (issueNumber) {
      issue = await this.github.issues.update({
        title: `${issueKey}: ${issueTitle}`,
        body: issueBody,
        assignees: issueAssignee ? [issueAssignee] : null,
        milestone: milestoneNumber,
      })
    } else {
      issue = await this.github.issues.create({
        title: `${issueKey}: ${issueTitle}`,
        body: issueBody,
        assignees: issueAssignee ? [issueAssignee] : null,
        milestone: milestoneNumber,
      })
    }

    core.debug(`Github Issue: ${JSON.stringify(issue)}`)
  }

  async jiraToGitHub (jiraIssue, state = 'open') {
    // Get or set milestone from issue
    // msNumber = await createOrUpdateMilestone (
    // jiraIssue.sprint,
    // jiraIssue.DueDate,
    // `Jira project ${jiraIssue.project} sprint ${jiraIssue.sprint}`
    // )
    // set or update github issue
    // ghIssue = await createOrUpdateGHIssue (
    // jiraIssue.key,
    //  jiraIssue.title,
    //  jiraIssue.body,
    //  this.githubEvent.author,
    //  msNumber)
    // if (this.githubEvent.pull_request.event == closed && type == merged) {
    // Update issue to state closed
    // update Jira Task to state 'Testing'
    // } else if (this.githubEvent.pull_request.event in ['opened', 'synchronized']) {
    // update Jira Task to state 'In Progress'
    // }

  }

  async getJiraKeysFromGitRange () {
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
          for (const issueKey of match) {
            core.debug(`Jira key regex found ${issueKey} in: ${commit.message}`)
            fullArray.push(issueKey)
          }
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

      if (issue) {
        core.debug(`Jira issue: ${JSON.stringify(issue)}`)
        this.foundKeys.push(issue)
      }
    }
    core.debug(`Found Jira Keys: ${this.foundKeys}\n`)

    return this.foundKeys
  }

  async execute () {
    const issues = await this.getJiraKeysFromGitRange()

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
        core.debug(`Jira issue: ${JSON.stringify(issue)}`)

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
