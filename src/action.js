import * as core from '@actions/core';
import ansiColors from 'ansi-colors';
import { highlight } from 'cli-highlight';
import { Version2Client } from 'jira.js';
import _ from 'lodash';
import get from 'lodash/get';
import template from 'lodash/template';
import templateSettings from 'lodash/templateSettings';
import * as YAML from 'yaml';

import J2M from './lib/J2M';
import {
  assignJiraTransition,
  assignReferences,
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
    this.commitMessageList = [];
    this.foundKeys = [];
    this.githubIssues = [];
    this.jiraTransition = undefined;
    this.createGist = false;
    this.gist_private = config.gist_private;
    this.fixVersions = argv.fixVersions;
    this.transitionChain = _.split(argv.transitionChain, ',') || [];
    this.jiraTransition = assignJiraTransition(context, argv);
    const references = assignReferences(context, context, argv);
    this.headRef = references.headRef;
    this.baseRef = references.baseRef;

    if (config.gist_name) {
      this.createGist = true;
    }
  }

  // if (context.payload.action in ['closed'] && context.payload.pull_request.merged === 'true')

  async findGithubMilestone(issueMilestone) {
    core.info(this.style.bold.yellow(`Milestone: finding a milestone with title matching ${issueMilestone}`));
    const milestones = await this.github.rest.issues.listMilestones({
      ...this.context.repo,
      state: 'all',
    });
    if (milestones.data) {
      const milestone = _.filter(milestones.data, ['title', issueMilestone]);
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
      return _.replace(fullText, regex, `$1${insertText}$3`);
    }

    return `${_.trim(fullText)}\n\n[/]: / "${startToken}"\n${insertText}\n[/]: / "${endToken}"`;
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

    let newTitle = _.trim(title);

    if (this.updatePRTitle) {
      core.debug(`Current PR Title: ${title}`);

      const issueKeys = _.invokeMap(this.foundKeys, (a) => a.get('key'));

      if (_.isArray(issueKeys)) {
        try {
          const re = /\[?(?<issues>(?:\w{2,8}[ _-]\d{3,5}(?:[ ,]+)?)+)[ :\]_-]+(?<title>.*)?/;

          const { groups } = newTitle.match(re) || {};
          if (groups) {
            core.info(`The title match found: ${YAML.stringify(groups)}`);

            newTitle = `${issueKeys.join(', ')}: ${upperCaseFirst(_.trim(groups.title))}`.slice(0, 71);
            core.setOutput('title', `${upperCaseFirst(_.trim(groups.titles))}`);
          }
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

  async createOrUpdateGHIssue(issueKey, issueTitle, issueBody, _issueAssignee, milestoneNumber) {
    core.debug(`Getting list of issues`);

    /** @type {import('@octokit/plugin-rest-endpoint-methods').RestEndpointMethodTypes["issues"]["listForRepo"]["response"]} */
    const issues = await this.github.rest.issues.listForRepo({
      ...this.context.repo,
      state: 'open',
      milestone: '*',
      assignee: '*',
      sort: 'created',
    });
    let issueNumber;

    core.debug(`Checking for ${issueKey} in list of issues`);
    if (issues?.data) {
      const { data } = issues;
      const isu = _.find(data, (index) => !index.pull_request && index.title && _.includes(index.title, issueKey));

      // @ts-ignore
      issueNumber = isu?.number;
    }

    let issue;

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

  /** @return {Promise<import('jira.js/out/version2/models').Issue[]>} */
  async getIssue(issueId, query) {
    if (!_.isString(issueId)) {
      core.error(`Issue ID must be a string, was: ${typeof issueId}, ${YAML.stringify(issueId)}`);
      return [];
    }
    const defaultFields = ['description', 'project', 'fixVersions', 'priority', 'status', 'summary', 'duedate'];
    const parameters = {
      issueIdOrKey: issueId,
      fields: defaultFields,
    };
    if (query !== undefined) {
      parameters.fields = query.fields || defaultFields;
      parameters.expand = query.expand || undefined;
    }

    return this.client.issues
      .getIssue(parameters)
      .then((issue) => [issue])
      .catch(() => {
        core.error(`Error getting issue ${issueId}`);
        return [];
      });
  }

  getIssueSetFromString(string1, _set) {
    const set = _set || new Set();
    if (_.isString(string1)) {
      const match = string1.match(issueIdRegEx);

      if (match) {
        for (const issueKey of match) {
          set.add(issueKey);
        }
      }
    }
    return set;
  }

  setToCommaDelimitedString(stringSet) {
    if (stringSet) {
      if (_.isSet(stringSet)) {
        return [...stringSet].join(',');
      }
      if (_.isArray(stringSet)) {
        return _.join(stringSet, ',');
      }
      if (_.isString(stringSet)) {
        return stringSet;
      }
    }
    return '';
  }

  get issueKeys() {
    if (_.isArray(this.foundKeys)) {
      return _.invokeMap(this.foundKeys, (a) => a.get('key'));
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
    if (_.startsWith(this.context.eventName, 'pull_request')) {
      core.debug(`Pull request title is: ${this.context.payload?.pull_request?.title}`);
      core.setOutput('title_issues', this.setToCommaDelimitedString(titleSet));
    }
    const commitSet = new Set();
    const referenceSet = new Set();
    if (this.baseRef && this.headRef) {
      core.info(`getJiraKeysFromGitRange: Getting list of GitHub commits between ${this.baseRef} and ${this.headRef}`);

      referenceSet.add([...this.getIssueSetFromString(this.headRef)]);
      core.setOutput('ref_issues', this.setToCommaDelimitedString(referenceSet));

      if (this.context.payload?.pull_request?.number) {
        const nodes = await this.getRepositoriesNodes();
        if (nodes) {
          for (const node of nodes) {
            if (node) {
              const { message } = node.commit;
              let skipCommit = false;
              if (_.isString(message)) {
                if (_.startsWith(message, 'Merge branch') || _.startsWith(message, 'Merge pull')) {
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
          }
        }
      }

      core.setOutput('commit_issues', this.setToCommaDelimitedString(commitSet));
    }
    const combinedArray = [...new Set([...stringSet, ...titleSet, ...referenceSet, ...commitSet])];
    const ghResults = [];
    const issuesPromises = [];
    for (const issueKey of combinedArray) {
      issuesPromises.push(
        this.getIssue(issueKey, {
          fields: ['status', 'summary', 'fixVersions', 'priority', 'project', 'description', 'duedate'],
        }),
      );
    }
    const issuesPatchy = await Promise.all(issuesPromises);
    const issues = issuesPatchy.flatMap((f) => (f.length > 0 ? [...f] : []));
    for (const issue of issues) {
      if (issue?.key) {
        const issueObject = {
          key: issue.key,
          description: J2M.toM(issue.fields?.description ?? ''),
          projectKey: issue?.fields?.project?.key,
          projectName: issue?.fields?.project?.name,
          fixVersions: _.map(issue?.fields?.fixVersions, 'name'),
          priority: issue?.fields.priority?.name,
          status: issue?.fields.status?.name,
          summary: issue?.fields?.summary,
          dueDate: issue?.fields?.duedate,
          ghNumber: undefined,
        };
        if (this.fixVersions) {
          const fixArray =
            _.toUpper(this.fixVersions) === 'NONE'
              ? []
              : _(this.fixVersions)
                  .split(',')
                  .invokeMap((f) => _.trim(f))
                  .value();
          if (this.argv.replaceFixVersions) {
            issueObject.fixVersions = fixArray;
          } else {
            this.fixVersions = [...new Set([...issueObject.fixVersions, ...fixArray])];
            issueObject.fixVersions = this.fixVersions;
            core.setOutput(`${issueObject.key}_fixVersions`, this.setToCommaDelimitedString(issueObject.fixVersions));
          }
        }

        try {
          ghResults.push(this.jiraToGitHub(issueObject));
        } catch (error) {
          core.error(error);
        }
        this.foundKeys.push(issueObject);
      }
    }
    await Promise.all(ghResults);
    core.setOutput('issues', this.setToCommaDelimitedString(combinedArray));
    // Below is old code
    // for (const item of commits.data.commits) {
    //   if (item.commit && item.commit.message) {
    //     match = item.commit.message.match(issueIdRegEx);
    //     if (match) {
    //       let skipCommit = false;

    //       if (
    //         _.startsWith(item.commit.message, 'Merge branch') ||
    //         _.startsWith(item.commit.message, 'Merge pull')
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
    // const uniqueKeys = [...new Set(fullArray.map((a) => _.toUpper(a)))];

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
    //       if (_.isArray(issue.fields.customfield_10500)) {
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
    //       if (_.isArray(issue.fields.customfield_11306)) {
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
    const parameters = {
      issueIdOrKey: issueId,
    };
    return this.client.issues.getTransitions(parameters);
  }

  async transitionIssue(issueId, data) {
    const parameters = {
      issueIdOrKey: issueId,
      transition: data,
    };
    return this.client.issues.doTransition(parameters);
  }

  async transitionIssues() {
    core.debug(this.style.bold.green(`TransitionIssues: Number of keys ${this.foundKeys.length}`));
    const transitionOptionsProm = [];

    const issueIds = [];

    for (const a of this.foundKeys) {
      const issueId = a.get('key');
      core.debug(this.style.bold.green(`TransitionIssues: Checking transition for ${issueId}`));
      if (this.jiraTransition && this.transitionChain) {
        transitionOptionsProm.push(
          this.getIssueTransitions(issueId)
            .then((transObject) => {
              const { transitions } = transObject;
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
              const indexJT = this.transitionChain.indexOf(this.jiraTransition);
              const transitionProm = [];
              for (let index = 0; index < indexJT; index++) {
                const link = this.transitionChain[index];

                const transitionToApply = _.find(
                  transitions,
                  (t) => t.id === link || _.toLower(t.name) === _.toLower(link),
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
    }

    await Promise.all(transitionOptionsProm);
    const issuesProm = [];
    for (const issueId of issueIds) {
      const issueObject = _.find(this.foundKeys, (indexO) => indexO.get('key') === issueId);
      const w = this.getIssue(issueId).then((transitionedIssue) => {
        const statusName = get(transitionedIssue, 'fields.status.name');

        core.info(this.style.bold.green(`Jira ${issueId} status is: ${statusName}.`));
        core.info(this.style.bold.green(`Link to issue: ${this.config.baseUrl}/browse/${issueId}`));
        issueObject.set('status', statusName);
      });
      issuesProm.push(w);
    }
    await Promise.all(issuesProm);
  }

  async formattedIssueList() {
    if (_.isArray(this.foundKeys) && this.foundKeys.length > 0) {
      return _(this.foundKeys)
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

    const templateString = eventTemplates[this.argv.from] || this.argv._.join(' ');
    const searchString = this.preprocessString(templateString);
    return this.findIssueKeyIn(searchString);
  }

  async findIssueKeyIn(searchString) {
    /** @type import('jira.js/out/version2/models').Issue[] */
    const result = [];
    if (_.isString(searchString)) {
      if (!searchString) {
        core.info(`no issues found in ${this.argv.from}`);
        return result;
      }
      const match = searchString.match(issueIdRegEx);

      if (!match) {
        core.info(`String "${searchString}" does not contain issueKeys`);
      } else {
        /** @type Promise<import('jira.js/out/version2/models').Issue[]>[] */
        const issuePArray = [];
        for (const issueKey of match) {
          core.debug(`Looking up key ${issueKey} in jira`);
          const issueFound = this.getIssue(issueKey);
          if (issueFound) {
            issuePArray.push(issueFound);
          }
        }

        const resultArray = await Promise.all(issuePArray);
        result.push(...resultArray.flatMap((f) => (f.length > 0 ? [...f] : [])));
      }
      if (result.length > 0) {
        if (result.length !== 1) {
          core.debug(`Found ${result.length} issues`);
          core.debug(`Jira keys: ${_(result).map('key').join(',')}`);
        } else {
          core.debug(`Jira key: ${_(result).map('key').join(',')}`);
          core.debug(`Found ${result.length} issue`);
        }
      }
      return result;
    }
  }

  preprocessString(string_) {
    try {
      templateSettings.interpolate = /{{([\S\s]+?)}}/g;
      const tmpl = template(string_);

      return tmpl({ event: this.context });
    } catch (error) {
      core.error(error);
    }
  }
}
