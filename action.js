const _ = require('lodash')
const core = require('@actions/core')
const { Octokit } = require('@octokit/rest')
const Jira = require('./common/net/Jira')
const J2M = require('./lib/J2M')

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
    this.J2M = new J2M()
    core.debug(`Config found: ${JSON.stringify(config)}`)
    core.debug(`Args found: ${JSON.stringify(argv)}`)
    this.config = config
    this.argv = argv
    this.githubEvent = githubEvent
    this.github = null
    this.createIssue = argv.createIssue
    this.commitMessageList = null
    this.foundKeys = null

    if (Object.prototype.hasOwnProperty.call(githubEvent, 'pull_request')) {
      this.headRef = githubEvent.pull_request.head.ref || null
      this.baseRef = githubEvent.pull_request.base.ref || null
    } else if (Object.prototype.hasOwnProperty.call(githubEvent, 'ref')) {
      this.headRef = githubEvent.ref || null
      this.baseRef = null
    }
    this.headRef = argv.headRef || this.headRef || null
    this.baseRef = argv.baseRef || this.baseRef || null

    if (argv.githubToken && (argv.createIssue || (this.baseRef && this.headRef))) {
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

    core.debug(`Milestones: ${JSON.stringify(milestones)}`)
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
      this.github.issues.updateMilestone({
        ...this.repo,
        milestone_number: milestone.number,
        description: issueMilestoneDescription,
        state: 'open',
        due_on: issueMilestoneDueDate,
      })

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
    core.debug(`Getting list of issues`)
    const issues = await this.github.issues.listForRepo({
      ...this.repo,
      state: 'open',
    })
    let issueNumber = null

    core.debug(`Checking for ${issueKey} in list of issues`)
    for (const i in issues.data) {
      if (!i.pull_request && i.title.contains(issueKey)) {
        issueNumber = i.issue_number
        break
      }
    }

    let issue = null

    if (issueNumber) {
      core.debug(`Updating ${issueKey} with issue number ${issueNumber}`)
      issue = await this.github.issues.update({
        title: `${issueKey}: ${issueTitle}`,
        body: this.J2M.toM(issueBody),
        assignees: issueAssignee ? [issueAssignee] : null,
        milestone: milestoneNumber,
      })
    } else {
      core.debug(`Creating ${issueKey}`)
      issue = await this.github.issues.create({
        title: `${issueKey}: ${issueTitle}`,
        body: this.J2M.toM(issueBody),
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

    if (!(this.baseRef && this.headRef)) {
      core.debug('Base ref and head ref not found')

      return
    }
    core.debug(`Getting list of github commits between ${this.baseRef} and ${this.headRef}`)
    // This will work fine up to 250 commit messages
    const commits = await this.github.repos.compareCommits({
      ...this.repo,
      base: this.baseRef,
      head: this.headRef,
    })

    if (!commits || !commits.data) { return }
    const fullArray = []

    match = this.headRef.match(issueIdRegEx)
    if (match) {
      for (const issueKey of match) { fullArray.push(issueKey) }
    }
    for (const item of commits.data.commits) {
      if (item.commit && item.commit.message) {
        match = item.commit.message.match(issueIdRegEx)
        if (match) {
          if (this.argv.includeMergeMessages) {
            if (!(item.commit.message.startsWith('Merge branch') || item.commit.message.startsWith('Merge pull'))) {
              core.warning('Commit message indicates that it is a merge')
            } else {
              core.warning('Commit message indicates that it is not a merge')
            }
          }
          for (const issueKey of match) {
            core.debug(`Jira key regex found ${issueKey} in: ${item.commit.message}`)
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
        try {
          core.debug(`Jira ${issue.key} project name: ${issue.fields.project.name}`)
          core.debug(`Jira ${issue.key} project key: ${issue.fields.project.key}`)
          if (Array.isArray(issue.fields.customfield_10500)) {
          // Pull Request
            core.debug(`Jira ${issue.key} linked pull request: ${issue.fields.customfield_10500[0]}`)
          }
          core.debug(`Jira ${issue.key} priority: ${issue.fields.priority.name}`)
          core.debug(`Jira ${issue.key} status: ${issue.fields.status.name}`)
          core.debug(`Jira ${issue.key} statusCategory: ${issue.fields.status.statusCategory.name}`)
          if (Array.isArray(issue.fields.customfield_11306)) {
          // Assigned to
            core.debug(`Jira ${issue.key} displayName: ${issue.fields.customfield_11306[0].displayName}`)
          }

          core.debug(`Jira ${issue.key} summary: ${issue.fields.summary}`)
          core.debug(`Jira ${issue.key} description: ${issue.fields.description}`)
          core.debug(`Jira ${issue.key} description as markdown: ${this.J2M.toM(issue.fields.description)}`)
          core.debug(`Jira ${issue.key} duedate: ${issue.fields.duedate}`)

        // issue.fields.comment.comments[]
        // issue.fields.worklog.worklogs[]
        } finally {
          this.foundKeys.push(issue)
        }
      }
    }
    core.debug(`Found Jira Keys: ${this.foundKeys.map(a => a.key)}\n`)

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
