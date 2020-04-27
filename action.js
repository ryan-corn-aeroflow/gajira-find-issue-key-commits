const _ = require('lodash')
const core = require('@actions/core')
const github = require('@actions/github')
const YAML = require('yaml')
const Jira = require('./common/net/Jira')
const J2M = require('./lib/J2M')

const issueIdRegEx = /([a-zA-Z0-9]+-[0-9]+)/g

const startJiraToken = 'JIRA-ISSUE-TEXT-START'
const endJiraToken = 'JIRA-ISSUE-TEXT-END'

const eventTemplates = {
  branch: '{{event.ref}}',
  commits: "{{event.commits.map(c=>c.message).join(' ')}}",
}

const { context } = github

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
    this.githubIssues = []

    if (Object.prototype.hasOwnProperty.call(githubEvent, 'pull_request')) {
      this.headRef = githubEvent.pull_request.head.ref || null
      this.baseRef = githubEvent.pull_request.base.ref || null
    } else if (Object.prototype.hasOwnProperty.call(githubEvent, 'ref')) {
      this.headRef = githubEvent.ref || null
      this.baseRef = null
    }
    this.headRef = argv.headRef || this.headRef || null
    this.baseRef = argv.baseRef || this.baseRef || null

    this.github = new github.GitHub(argv.githubToken) || null
  }

  async findGithubMilestone (issueMilestone) {
    if (!issueMilestone) { return }
    const milestones = await this.github.issues.listMilestonesForRepo({
      ...context.repo,
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
    if (!issueMilestone) { return }
    let milestone = await this.findGithubMilestone(issueMilestone)

    if (milestone) {
      this.github.issues.updateMilestone({
        ...context.repo,
        milestone_number: milestone.number,
        description: issueMilestoneDescription,
        state: 'open',
        due_on: issueMilestoneDueDate,
      })

      return milestone.number
    }

    milestone = await this.github.issues.createMilestone({
      ...context.repo,
      title: `${issueMilestone}`,
      description: issueMilestoneDescription,
      state: 'open',
      // YYYY-MM-DDTHH:MM:SSZ
      due_on: issueMilestoneDueDate,
    })

    return milestone.number
  }

  async updateStringByToken (startToken, endToken, fullText, insertText) {
    const regex = new RegExp(`(?<start>\\[\\/]: \\/ "${startToken}"\\n)(?<text>(?:.|\\s)+)(?<end>\\n\\[\\/]: \\/ "${endToken}"(?:\\s)?)`, 'gm')

    if (regex.test(fullText)) {
      return fullText.replace(regex, `$1${insertText}$3`)
    }

    return `${fullText}\n[/]: / "${startToken}"\n${insertText}\n[/]: / "${endToken}"`
  }

  async updatePullRequestBody (text, startToken, endToken) {
    if (this.githubEvent.pull_request === null && context.payload.pull_request === null) {
      core.debug(`Skipping pull request update, pull_request not found in current github context, or received event`)

      return
    }

    const { number, body } = this.githubEvent.pull_request || context.payload.pull_request

    core.debug(`Updating PR number ${number}`)
    core.debug(`With text:\n ${text}`)

    const bodyUpdate = await this.updateStringByToken(startToken, endToken, body, text)

    const pr = await this.github.pulls.update({
      ...context.repo,
      body: bodyUpdate,
      pull_number: number,
    })

    core.debug(`Final text:\n ${pr.data.body}`)
  }

  async createOrUpdateGHIssue (issueKey, issueTitle, issueBody, milestoneNumber) {
    core.debug(`Getting list of issues`)
    const issues = await this.github.issues.listForRepo({
      ...context.repo,
      state: 'open',
    })
    let issueNumber = null

    core.debug(`Checking for ${issueKey} in list of issues`)
    for (const i of issues.data) {
      if (!i.pull_request && i.title && i.title.includes(issueKey)) {
        issueNumber = i.number
        break
      }
    }

    let issue = null

    if (issueNumber) {
      core.debug(`Updating ${issueKey} with issue number ${issueNumber}`)
      issue = await this.github.issues.update({
        ...context.repo,
        issue_number: issueNumber,
        title: `${issueKey}: ${issueTitle}`,
        body: this.J2M.toM(issueBody || ''),
        assignees: [],
        // assignees: issueAssignee ? [issueAssignee] : null,
        milestone: milestoneNumber,
      })
    } else {
      core.debug(`Creating ${issueKey}`)
      issue = await this.github.issues.create({
        ...context.repo,
        title: `${issueKey}: ${issueTitle}`,
        body: this.J2M.toM(issueBody || ''),
        assignees: [],
        // assignees: issueAssignee ? [issueAssignee] : null,
        milestone: milestoneNumber,
      })
    }

    this.githubIssues.push(issue)

    core.debug(`Github Issue: \n${YAML.stringify(issue)}`)
  }

  async jiraToGitHub (jiraIssue) {
    // Get or set milestone from issue
    // for (let version of jiraIssue.fixVersions) {
    core.debug(`JiraIssue is in project ${jiraIssue.get('project')} sprint ${jiraIssue.get('sprint')} and `)

    const msNumber = await this.createOrUpdateMilestone(
      jiraIssue.get('sprint') || null,
      jiraIssue.get('duedate'),
      `Jira project ${jiraIssue.get('project')} sprint ${jiraIssue.get('sprint')}`
    )

    // set or update github issue

    await this.createOrUpdateGHIssue(
      jiraIssue.get('key'),
      jiraIssue.get('summary'),
      jiraIssue.get('description'),
      msNumber
    )

    if (context.eventName === 'pull_request') {
      if (context.payload.action in ['closed'] && context.payload.pull_request.merged === 'true') {
        core.debug('Update issue to state closed')
        core.debug('Update Jira Task to state Testing')
      } else if (context.payload.action in ['opened', 'synchronized']) {
        core.debug('Update Jira Task to state In Progress')
      }
    }
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
      ...context.repo,
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
          let skipCommit = false

          if ((item.commit.message.startsWith('Merge branch') || item.commit.message.startsWith('Merge pull'))) {
            if (!this.argv.includeMergeMessages) {
              skipCommit = true
            }
          }

          if (skipCommit === false) {
            for (const issueKey of match) {
              fullArray.push(issueKey)
            }
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
      // Version 3 includes Sprint information, but description is in Atlassian Document Format
      // Which is used only by atlassian, and we need a converter to Markdown.
      // Version 2 uses Atlassian RichText for its Descriptions,
      // and this can be converted to Markdown
      // TODO: Harass Atlassian about conversion between their own products
      const issue = await this.Jira.getIssue(issueKey, {}, '3')
      const issueV2 = await this.Jira.getIssue(issueKey, { fields: ['description'] }, '2')
      const issueObject = new Map()

      if (issue) {
        core.debug(`Issue ${issue.key}: \n${YAML.stringify(issue)}`)
        issueObject.set('key', issue.key)
        try {
          issueObject.set('projectName', issue.fields.project.name)
          core.debug(`Jira ${issue.key} project name: ${issue.fields.project.name}`)
          issueObject.set('projectKey', issue.fields.project.key)
          core.debug(`Jira ${issue.key} project key: ${issue.fields.project.key}`)
          issueObject.set('priority', issue.fields.priority.name)
          core.debug(`Jira ${issue.key} priority: ${issue.fields.priority.name}`)
          issueObject.set('status', issue.fields.status.name)
          core.debug(`Jira ${issue.key} status: ${issue.fields.status.name}`)
          issueObject.set('statusCategory', issue.fields.status.statusCategory.name)
          core.debug(`Jira ${issue.key} statusCategory: ${issue.fields.status.statusCategory.name}`)
          if (Array.isArray(issue.fields.customfield_11306)) {
            // Assigned to
            core.debug(`Jira ${issue.key} displayName: ${issue.fields.customfield_11306[0].displayName}`)
          }
          issueObject.set('summary', issue.fields.summary)
          core.debug(`Jira ${issue.key} summary: ${issue.fields.summary}`)
          if (issueV2.fields.description) {
            issueObject.set('descriptionJira', issueV2.fields.description)
            issueObject.set('description', this.J2M.toM(issueV2.fields.description))
          }
          if (issue.fields.sprint) {
            issueObject.set('sprint', issue.fields.sprint.name)
            issueObject.set('duedate', issue.fields.sprint.endDate)
            core.debug(`Jira ${issue.key} sprint: \n${YAML.stringify(issue.fields.sprint)}`)
          }

          // issue.fields.comment.comments[]
          // issue.fields.worklog.worklogs[]
        } finally {
          this.foundKeys.push(issueObject)
        }
        try {
          this.jiraToGitHub(issueObject)
        } catch (error) {
          core.error(error)
        }
      }
    }
    core.debug(`Found Jira Keys: ${this.foundKeys.map(a => a.get('key'))}\n`)

    return this.foundKeys
  }

  async execute () {
    const issues = await this.getJiraKeysFromGitRange()

    if (issues) {
      const jIssues = this.foundKeys.map(a => `[${a.get('key')}]`)
      const ghIssues = this.githubIssues.map(a => `Resolves: #${a.get('number')})`)
      let text = ''

      text += `**Linked Jira Issues: ${jIssues}**\n\n`
      text += '*GitHub Issues Mirror the Jira Issues, and will be closed when this PR is merged into the default branch.*\n'
      text += `${ghIssues}\n`
      await this.updatePullRequestBody(text, startJiraToken, endJiraToken)

      return issues
    }

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

        return new Map(['key', issue.key])
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
