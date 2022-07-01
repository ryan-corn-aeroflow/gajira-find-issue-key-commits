import * as core from '@actions/core';
import ansiColors from 'ansi-colors';
import { highlight } from 'cli-highlight';
import { Version2Client } from 'jira.js';

import get from 'lodash/get';
import template from 'lodash/template';
import templateSettings from 'lodash/templateSettings';
import * as YAML from 'yaml';

import J2M from './lib/J2M';
import {
  assignJiraTransition,
  assignRefs,
  endJiraToken,
  eventTemplates,
  GetStartAndEndPoints,
  graphqlWithAuth,
  issueIdRegEx,
  listCommitMessagesInPullRequest,
  octokit,
  startJiraToken,
  upperCaseFirst,
} from './utils';

export default class Action {
  constructor({ context, argv, config }) {
    this.style = ansiColors.create();
    this.baseUrl = config.baseUrl;
    this.token = config.token;
    this.email = config.email;
    this.client = new Version2Client({
      host: this.baseUrl,
      telemetry: false,
      newErrorHandling: true,
      authentication: {
        basic: {
          email: this.email,
          apiToken: this.token,
        },
      },
    });

    this.J2M = new J2M();
    core.debug(`Config found: \n${highlight(YAML.stringify(config), { language: 'yml', ignoreIllegals: true })}`);
    core.debug(`Args found: \n${highlight(YAML.stringify(argv), { language: 'yml', ignoreIllegals: true })}`);
    core.debug(`Getting issues from: ${argv.from}`);
    if (argv.from === 'string') {
      core.debug(`Getting issues from string: ${argv.string}`);
    }
    this.config = config;
    this.argv = argv;
    this.rawString = this.argv.string ?? config.string;
    this.context = context || context.payload;
    this.github = octokit;
    this.createIssue = argv.createIssue;
    this.updatePRTitle = argv.updatePRTitle;
    this.includeMergeMessages = argv.includeMergeMessages;
    this.commitMessageList = null;
    this.foundKeys = [];
    this.githubIssues = [];
    this.jiraTransition = null;
    this.createGist = false;
    this.gist_private = config.gist_private;
    this.fixVersions = argv.fixVersions;
    this.transitionChain = argv.transitionChain?.split(',') || [];
    this.jiraTransition = assignJiraTransition(context, argv);
    const refs = assignRefs(context, context, argv);
    this.headRef = refs.headRef;
    this.baseRef = refs.baseRef;

    if (config.gist_name) this.createGist = true;
  }

  // if (context.payload.action in ['closed'] && context.payload.pull_request.merged === 'true')

  async findGithubMilestone(issueMilestone) {
    core.info(this.style.bold.yellow(`Milestone: finding a milestone with title matching ${issueMilestone}`));
    const milestones = await this.github.rest.issues.listMilestones({
      ...this.context.repo,
      state: 'all',
    });
    if (milestones.data) {
      const milestone = milestones.data.filter((element) => element.title === issueMilestone.toString());
      if (milestone.length === 1) {
        return milestone[0];
      }
    }
    core.debug(this.style.bold.yellow(`Milestone: Existing milestone not found.`));
  }

  async createOrUpdateMilestone(issueMilestone, issueMilestoneDueDate, issueMilestoneDescription) {
    core.debug(this.style.bold.yellow.underline(`createOrUpdateMilestone: issueMilestone is ${issueMilestone}`));

    const foundMilestone = await this.findGithubMilestone(issueMilestone);

    if (foundMilestone) {
      this.github.rest.issues.updateMilestone({
        ...this.context.repo,
        milestone_number: foundMilestone.number,
        description: issueMilestoneDescription,
        state: 'open',
        due_on: issueMilestoneDueDate,
      });
      core.info(this.style.bold.yellow(`Milestone: ${issueMilestone} with number ${foundMilestone.number} updated`));
      return foundMilestone.number;
    }

    const newMilestone = await this.github.rest.issues.createMilestone({
      ...this.context.repo,
      title: `${issueMilestone}`,
      description: issueMilestoneDescription,
      state: 'open',
      // YYYY-MM-DDTHH:MM:SSZ | ISO 8601
      due_on: issueMilestoneDueDate,
    });

    core.info(this.style.bold.yellow(`Milestone: ${issueMilestone} with number ${newMilestone.data.number} created`));

    return newMilestone.data.number;
  }

  async updateStringByToken(startToken, endToken, fullText, insertText) {
    const regex = new RegExp(
      `(?<start>\\[\\/]: \\/ "${startToken}"\\n)(?<text>(?:.|\\s)+)(?<end>\\n\\[\\/]: \\/ "${endToken}"(?:\\s)?)`,
      'gm',
    );

    if (regex.test(fullText)) {
      return fullText.replace(regex, `$1${insertText}$3`);
    }

    return `${fullText.trim()}\n\n[/]: / "${startToken}"\n${insertText}\n[/]: / "${endToken}"`;
  }

  async updatePullRequestBody(startToken, endToken) {
    if (!this.context.pull_request) {
      core.info(`Skipping pull request update, pull_request not found in current github context, or received event`);

      return;
    }
    const issues = await this.formattedIssueList();
    const text = `### Linked Jira Issues:\n\n${issues}\n`;

    const { number, body, title } = this.context.pull_request;

    core.debug(`Updating PR number ${number}`);
    core.debug(`With text:\n ${text}`);

    let newTitle = title.trim();

    if (this.updatePRTitle) {
      core.debug(`Current PR Title: ${title}`);

      const issueKeys = this.foundKeys.map((a) => a.get('key'));

      if (Array.isArray(issueKeys)) {
        try {
          const re = /\[?(?<issues>(?:\w{2,8}[ _-]\d{3,5}(?:[ ,]+)?)+)[ :\]_-]+(?<title>.*)?/;

          const { groups } = newTitle.match(re);

          core.info(`The title match found: ${YAML.stringify(groups)}`);

          newTitle = `${issueKeys.join(', ')}: ${upperCaseFirst(groups.title.trim())}`.slice(0, 71);
          core.setOutput('title', `${upperCaseFirst(groups.title.trim())}`);
        } catch (error) {
          core.warning(error);
        }
      }
    }
    if (issues) {
      const bodyUpdate = await this.updateStringByToken(startToken, endToken, body, text);

      await this.github.rest.pulls.update({
        ...this.context.repo,
        title: newTitle,
        body: bodyUpdate,
        pull_number: number,
      });
    }
  }

  async createOrUpdateGHIssue(issueKey, issueTitle, issueBody, issueAssignee, milestoneNumber) {
    core.debug(`Getting list of issues`);
    const issues = await this.github.rest.issues.listForRepo({
      ...this.context.repo,
      state: 'open',
      milestone: '*',
      assignee: '*',
      sort: 'created',
    });
    let issueNumber = null;

    core.debug(`Checking for ${issueKey} in list of issues`);
    if (issues?.data) {
      const isu = issues.data.find((i) => !i.pull_request && i.title && i.title.includes(issueKey));
      issueNumber = isu?.number ?? null;
    }

    let issue = null;

    if (issueNumber) {
      core.debug(`Updating ${issueKey} with issue number ${issueNumber}`);
      issue = await this.github.rest.issues.update({
        ...this.context.repo,
        issue_number: issueNumber,
        title: `${issueKey}: ${issueTitle}`,
        body: issueBody,
        assignees: [],
        // assignees: issueAssignee ? [issueAssignee] : null,
        milestone: milestoneNumber === -1 ? undefined : milestoneNumber,
      });
    } else {
      core.debug(`Creating ${issueKey}`);
      issue = await this.github.rest.issues.create({
        ...this.context.repo,
        title: `${issueKey}: ${issueTitle}`,
        body: issueBody,
        assignees: [],
        // assignees: issueAssignee ? [issueAssignee] : null,
        milestone: milestoneNumber === -1 ? undefined : milestoneNumber,
      });
    }

    this.githubIssues.push(issue.data.number);
    core.startGroup(`GitHub issue ${issue.data.number} data`);
    core.debug(`Github Issue: \n${YAML.stringify(issue.data)}`);
    core.endGroup();

    return issue.data.number;
  }

  async jiraToGitHub(jiraIssue) {
    // Get or set milestone from issue
    // for (let version of jiraIssue.fixVersions) {
    core.info(
      `JiraIssue is in project ${jiraIssue.projectKey} Fix Versions ${this.setToCommaDelimitedString(
        jiraIssue.fixVersions,
      )}`,
    );
    let chainP = Promise.resolve(-1);

    if (jiraIssue.fixVersions.length === 1) {
      chainP = chainP.then(() =>
        this.createOrUpdateMilestone(
          this.fixVersions[0],
          jiraIssue.dueDate,
          `Jira project ${jiraIssue.projectKey} Fix Version ${this.fixVersions[0]}`,
        ),
      );
    }

    // set or update github issue
    return chainP.then((msNumber) =>
      this.createOrUpdateGHIssue(jiraIssue.key, jiraIssue.summary, jiraIssue.description, msNumber),
    );
  }

  async getStartAndEndDates(range) {
    const { repository } = await graphqlWithAuth(GetStartAndEndPoints, {
      ...this.context.repo,
      ...range,
    });
    const startDateList = repository?.startPoint?.target?.history?.edges;
    const startDate = startDateList ? startDateList[0]?.node?.committedDate : '';
    const endDateList = repository?.endPoint?.target?.history?.edges;
    const endDate = endDateList ? endDateList[0]?.node?.committedDate : '';
    return { startDate, endDate };
  }

  async getIssue(issueId, query) {
    if (typeof issueId !== 'string') {
      core.error(`Issue ID must be a string, was: ${typeof issueId}, ${YAML.stringify(issueId)}`);
      return undefined;
    }
    const defaultFields = ['description', 'project', 'fixVersions', 'priority', 'status', 'summary', 'duedate'];
    const params = {
      issueIdOrKey: issueId,
      fields: defaultFields,
    };
    if (query != null) {
      params.fields = query.fields || defaultFields;
      params.expand = query.expand || undefined;
    }

    return this.client.issues.getIssue(params).catch(() => {
      core.error(`Error getting issue ${issueId}`);
      return undefined;
    });
  }

  getIssueSetFromString(str1, _set) {
    const set = _set || new Set();
    if (typeof str1 === 'string') {
      const match = str1.match(issueIdRegEx);

      if (match) {
        match.forEach((issueKey) => {
          set.add(issueKey);
        });
      }
    }
    return set;
  }

  setToCommaDelimitedString(strSet) {
    if (strSet) {
      if (strSet.toString() === '[object Set]') {
        return [...strSet].join(',');
      }
      if (Array.isArray(strSet)) {
        return strSet.join(',');
      }
      if (typeof strSet === 'string') {
        return strSet;
      }
    }
    return '';
  }

  get issueKeys() {
    if (Array.isArray(this.foundKeys)) {
      return this.foundKeys.map((a) => a.get('key'));
    }
    return [];
  }

  async getRepositoriesNodes(after) {
    return graphqlWithAuth(listCommitMessagesInPullRequest, {
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      prNumber: this.context.payload?.pull_request?.number,
      after,
    }).then(
      (result) => {
        const { repository } = result;
        if (repository?.pullRequest?.commits?.nodes) {
          const { totalCount = 0, pageInfo, nodes } = repository.pullRequest.commits;
          if (totalCount === 0) {
            return [...nodes];
          }
          if (pageInfo && pageInfo.hasNextPage === true) {
            return [...nodes, ...this.getRepositoriesNodes(pageInfo.endCursor)];
          }
        }
        return [];
      },
      (error) => {
        core.error(error);
        return null;
      },
    );
  }

  async getJiraKeysFromGitRange() {
    const stringSet = this.getIssueSetFromString(this.rawString);
    if (this.rawString) {
      core.debug(`Raw string provided is: ${this.rawString}`);
      core.setOutput('string_issues', this.setToCommaDelimitedString(stringSet));
    }

    const titleSet = this.getIssueSetFromString(this.context?.pull_request?.title);
    if (this.context.eventName.startsWith('pull_request')) {
      core.debug(`Pull request title is: ${this.context.payload?.pull_request?.title}`);
      core.setOutput('title_issues', this.setToCommaDelimitedString(titleSet));
    }
    const commitSet = new Set();
    const refSet = new Set();
    if (this.baseRef && this.headRef) {
      core.info(`getJiraKeysFromGitRange: Getting list of GitHub commits between ${this.baseRef} and ${this.headRef}`);

      refSet.add([...this.getIssueSetFromString(this.headRef)]);
      core.setOutput('ref_issues', this.setToCommaDelimitedString(refSet));

      if (this.context.payload?.pull_request?.number) {
        const nodes = await this.getRepositoriesNodes(null);
        if (nodes) {
          [...nodes].forEach((node) => {
            if (node) {
              const { message } = node.commit;
              let skipCommit = false;
              if (typeof message === 'string') {
                if (message.startsWith('Merge branch') || message.startsWith('Merge pull')) {
                  core.debug('Commit message indicates that it is a merge');
                  if (!this.includeMergeMessages) {
                    skipCommit = true;
                  }
                }
                if (skipCommit === false) {
                  this.getIssueSetFromString(message, commitSet);
                }
              } else {
                core.debug(`Commit message is not a string: ${YAML.stringify(message)}`);
              }
            }
          });
        }
      }

      core.setOutput('commit_issues', this.setToCommaDelimitedString(commitSet));
    }
    const combinedArray = [...new Set([...stringSet, ...titleSet, ...refSet, ...commitSet])];
    const ghResults = [];

    combinedArray.forEach(async (issueKey) => {
      try {
        const issue = await this.getIssue(issueKey, {
          fields: ['status', 'summary', 'fixVersions', 'priority', 'project', 'description', 'duedate'],
        });
        if (issue?.key) {
          const issueObj = {
            key: issue.key,
            description: J2M.toM(issue.fields?.description ?? ''),
            projectKey: issue?.fields?.project?.key,
            projectName: issue?.fields?.project?.name,
            fixVersions: issue?.fields?.fixVersions,
            priority: issue?.fields.priority?.name,
            status: issue?.fields.status?.name,
            summary: issue?.fields?.summary,
            dueDate: issue?.fields?.duedate,
            ghNumber: undefined,
          };
          if (this.fixVersions) {
            const fixArr =
              this.fixVersions.toUpperCase() === 'NONE' ? [] : this.fixVersions.split(',').map((f) => f.trim());
            if (this.argv.replaceFixVersions) {
              issueObj.fixVersions = fixArr;
            } else {
              const _fixVersions = new Set(issueObj.fixVersions.map((f) => f.name));
              if (this.fixVersions) {
                const fixVArr = this.fixVersions.split(',').map((f) => f.trim());
                if (fixVArr && fixVArr.length > 0) {
                  fixVArr.forEach((vStr) => {
                    if (!_fixVersions.has(vStr)) {
                      _fixVersions.add(vStr);
                    }
                  });
                }
              }
              this.fixVersions = [..._fixVersions];
              issueObj.fixVersions = this.fixVersions;
              core.setOutput(`${issueObj.key}_fixVersions`, this.setToCommaDelimitedString(issueObj.fixVersions));
            }
          }

          try {
            ghResults.push(this.jiraToGitHub(issueObj));
          } catch (error) {
            core.error(error);
          }
          this.foundKeys.push(issueObj);
        }
      } catch (error) {
        core.error(error);
      }
    });
    await Promise.all(ghResults);
    core.setOutput('issues', this.setToCommaDelimitedString(combinedArray));
    // Below is old code
    // for (const item of commits.data.commits) {
    //   if (item.commit && item.commit.message) {
    //     match = item.commit.message.match(issueIdRegEx);
    //     if (match) {
    //       let skipCommit = false;

    //       if (
    //         item.commit.message.startsWith('Merge branch') ||
    //         item.commit.message.startsWith('Merge pull')
    //       ) {
    //         core.debug('Commit message indicates that it is a merge');
    //         if (!this.argv.includeMergeMessages) {
    //           skipCommit = true;
    //         }
    //       }

    //       if (skipCommit === false) {
    //         for (const issueKey of match) {
    //           fullArray.push(issueKey);
    //         }
    //       }
    //     }
    //   }
    // }
    // // Make the array Unique
    // const uniqueKeys = [...new Set(fullArray.map((a) => a.toUpperCase()))];

    // core.notice(`Unique Keys: ${uniqueKeys}\n`);
    // // Verify that the strings that look like key match real Jira keys
    // this.foundKeys = [];
    // for (const issueKey of uniqueKeys) {
    //   // Version 3 includes Sprint information, but description is in Atlassian Document Format
    //   // Which is used only by atlassian, and we need a converter to Markdown.
    //   // Version 2 uses Atlassian RichText for its Descriptions,
    //   // and this can be converted to Markdown
    //   // TODO: Harass Atlassian about conversion between their own products
    //   const issue = await this.getIssue(issueKey, {});
    //   const issueV2 = await this.getIssue(issueKey, { fields: ['description', 'fixVersions'] });
    //   const issueObject = new Map();

    //   if (issue) {
    //     core.startGroup(this.style.bold.cyan(`Issue ${issue.key} raw details`));
    //     core.debug(this.style.cyan(`Issue ${issue.key}: \n${YAML.stringify(issue)}`));
    //     core.endGroup();
    //     core.startGroup(this.style.bold.cyanBright(`Issue ${issue.key} collected details`));
    //     issueObject.set('key', issue.key);
    //     const _fixVersions = new Set(issue.fields.fixVersions.map((f) => f.name));
    //     if (this.fixVersions) {
    //       if (!_fixVersions.has(this.fixVersions)) {
    //         _fixVersions.add(this.fixVersions);
    //         // this.Jira.updateIssue()
    //         // Update the Jira Issue to include the fix version and Project
    //       }
    //     }
    //     const fixVersions = Array.from(_fixVersions);

    //     try {
    //       issueObject.set('key', issue.key);
    //       if (Array.isArray(issue.fields.customfield_10500)) {
    //         // Pull Request
    //         core.debug(`linked pull request: ${issue.fields.customfield_10500[0]}`);
    //       }
    //       issueObject.set('projectName', issue.fields.project.name);
    //       core.debug(`project name: ${issue.fields.project.name}`);
    //       issueObject.set('fixVersions', fixVersions);
    //       core.debug(`fixVersions name: ${issue.fields.project.name}`);
    //       issueObject.set('projectKey', issue.fields.project.key);
    //       core.debug(`project key: ${issue.fields.project.key}`);
    //       issueObject.set('priority', issue.fields.priority.name);
    //       core.debug(`priority: ${issue.fields.priority.name}`);
    //       issueObject.set('status', issue.fields.status.name);
    //       core.debug(`status: ${issue.fields.status.name}`);
    //       issueObject.set('statusCategory', issue.fields.status.statusCategory.name);
    //       core.debug(`statusCategory: ${issue.fields.status.statusCategory.name}`);
    //       if (Array.isArray(issue.fields.customfield_11306)) {
    //         // Assigned to
    //         core.debug(`displayName: ${issue.fields.customfield_11306[0].displayName}`);
    //       }
    //       issueObject.set('summary', issue.fields.summary);
    //       core.debug(`summary: ${issue.fields.summary}`);
    //       if (issueV2.fields.description) {
    //         issueObject.set('descriptionJira', issueV2.fields.description);
    //         issueObject.set('description', this.J2M.toM(issueV2.fields.description));
    //       }
    //       if (issue.fields.sprint) {
    //         issueObject.set('sprint', issue.fields.sprint.name);
    //         issueObject.set('duedate', issue.fields.sprint.endDate);
    //         core.startGroup(`sprint details`);
    //         core.debug(`sprint: \n${YAML.stringify(issue.fields.sprint)}`);
    //         core.endGroup();
    //       }
    //       if (issueV2.fields.sprint) {
    //         issueObject.set('sprint', issueV2.fields.sprint.name);
    //         issueObject.set('duedate', issueV2.fields.sprint.endDate);
    //         core.startGroup(`JiraV2 sprint details`);
    //         core.debug(`JiraV2 sprint: \n${YAML.stringify(issueV2.fields.sprint)}`);
    //         core.endGroup();
    //       }

    //       // issue.fields.comment.comments[]
    //       // issue.fields.worklog.worklogs[]
    //     } finally {
    //       try {
    //         issueObject.set('ghNumber', await this.jiraToGitHub(issueObject));
    //       } catch (error) {
    //         core.error(error);
    //       }
    //       this.foundKeys.push(issueObject);
    //     }
    //   }
    // }
    // core.endGroup();
    // core.info(
    //   this.style.blueBright(
    //     `Found Jira Keys  : ${style.bold(this.foundKeys.map((a) => a.get('key')))}\n`
    //   )
    // );
    // core.info(
    //   this.style.yellowBright(
    //     `Found GitHub Keys: ${style.bold(this.foundKeys.map((a) => a.get('ghNumber')))}\n`
    //   )
    // );

    return this.foundKeys;
  }

  async getIssueTransitions(issueId) {
    const params = {
      issueIdOrKey: issueId,
    };
    return this.client.issues.getTransitions(params);
  }

  async transitionIssue(issueId, data) {
    const params = {
      issueIdOrKey: issueId,
      transition: data,
    };
    return this.client.issues.doTransition(params);
  }

  async transitionIssues() {
    core.debug(this.style.bold.green(`TransitionIssues: Number of keys ${this.foundKeys.length}`));
    const transitionOptionsProm = [];

    const issueIds = [];

    this.foundKeys.forEach((a) => {
      const issueId = a.get('key');
      core.debug(this.style.bold.green(`TransitionIssues: Checking transition for ${issueId}`));
      if (this.jiraTransition && this.transitionChain) {
        transitionOptionsProm.push(
          this.getIssueTransitions(issueId)
            .then((transObj) => {
              const { transitions } = transObj;
              core.info(
                this.style.bold.green(
                  `TransitionIssues: Transitions available for ${issueId}:\n${this.style.bold.greenBright(
                    YAML.stringify(transitions),
                  )}`,
                ),
              );
              if (!transitions) {
                throw new Error('No transitions available');
              }
              return transitions;
            })
            .then((transitions) => {
              const idxJT = this.transitionChain.indexOf(this.jiraTransition);
              const transitionProm = [];
              for (let i = 0; i < idxJT; i++) {
                const link = this.transitionChain[i];

                const transitionToApply = transitions.find(
                  (t) => t.id === link || t.name?.toLowerCase() === link.toLowerCase(),
                );

                issueIds.push(issueId);
                if (transitionToApply) {
                  const transitionId = transitionToApply.id;
                  core.info(
                    this.style.bold.green(
                      `Applying transition:\n${this.style.bold.greenBright(YAML.stringify(transitionToApply))}`,
                    ),
                  );
                  const tI = this.transitionIssue(issueId, {
                    transition: {
                      id: transitionId,
                    },
                  });
                  transitionProm.push(tI);
                }
              }
              return Promise.allSettled(transitionProm);
            }),
        );
      }
    });

    await Promise.all(transitionOptionsProm);
    const issuesProm = [];
    issueIds.forEach((issueId) => {
      const issueObj = this.foundKeys.find((iO) => iO.get('key') === issueId);
      const w = this.getIssue(issueId).then((transitionedIssue) => {
        const statusName = get(transitionedIssue, 'fields.status.name');

        core.info(this.style.bold.green(`Jira ${issueId} status is: ${statusName}.`));
        core.info(this.style.bold.green(`Link to issue: ${this.config.baseUrl}/browse/${issueId}`));
        issueObj.set('status', statusName);
      });
      issuesProm.push(w);
    });
    await Promise.all(issuesProm);
  }

  async formattedIssueList() {
    if (Array.isArray(this.foundKeys) && this.foundKeys.length > 0) {
      return this.foundKeys
        .map(
          (a) =>
            `*  **[${a.get('key')}](${this.baseUrl}/browse/${a.get('key')})** [${a.get(
              'status',
              'Jira Status Unknown',
            )}] ${a.get('summary')} (Fix: #${a.get('ghNumber')})`,
        )
        .join('\n');
    }
    return '';
  }

  async outputReleaseNotes() {
    const issues = await this.formattedIssueList();

    core.setOutput('notes', `### Release Notes:\n\n${issues}`);
  }

  async execute() {
    if (this.argv.from === 'string') {
      return this.findIssueKeyIn(this.argv.string);
    }

    await this.getJiraKeysFromGitRange();

    if (this.foundKeys.length > 0) {
      await this.transitionIssues();
      await this.updatePullRequestBody(startJiraToken, endJiraToken);
      await this.outputReleaseNotes();

      return this.foundKeys;
    }

    const templateStr = eventTemplates[this.argv.from] || this.argv._.join(' ');
    const searchStr = this.preprocessString(templateStr);
    return this.findIssueKeyIn(searchStr);
  }

  async findIssueKeyIn(searchStr) {
    /** @type import('jira.js/out/version2/models').Issue[] */
    const result = [];
    if (typeof searchStr === 'string') {
      if (!searchStr) {
        core.info(`no issues found in ${this.argv.from}`);
        return result;
      }
      const match = searchStr.match(issueIdRegEx);

      if (!match) {
        core.info(`String "${searchStr}" does not contain issueKeys`);
      } else {
        /** @type Promise<import('jira.js/out/version2/models').Issue | undefined>[] */
        const issuePArray = [];
        match.forEach((issueKey) => {
          core.debug(`Looking up key ${issueKey} in jira`);
          const issueFound = this.getIssue(issueKey);
          if (issueFound) {
            issuePArray.push(issueFound);
          }
        });

        const resultArray = await Promise.all(issuePArray);
        result.push(...resultArray.flatMap((f) => (f ? [f] : [])));
      }
      if (result.length > 0) {
        if (result.length !== 1) {
          core.debug(`Found ${result.length} issues`);
          core.debug(`Jira keys: ${result.map((i) => i.key).join(',')}`);
        } else {
          core.debug(`Jira key: ${result.map((i) => i.key).join(',')}`);
          core.debug(`Found ${result.length} issue`);
        }
      }
      return result;
    }
  }

  preprocessString(str) {
    try {
      templateSettings.interpolate = /{{([\S\s]+?)}}/g;
      const tmpl = template(str);

      return tmpl({ event: this.context });
    } catch (error) {
      core.error(error);
    }
  }
}
