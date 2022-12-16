import ansiColors from 'ansi-colors';
import { highlight } from 'cli-highlight';
import { Version2Client } from 'jira.js';
import _ from 'lodash';
import get from 'lodash/get';
import template from 'lodash/template';
import templateSettings from 'lodash/templateSettings';
import * as YAML from 'yaml';
import { core, logger, setOutput } from '@broadshield/github-actions-core-typed-inputs';
import JiraMarkupToMarkdown from './lib/jira-markup-to-markdown';
import {
  GetStartAndEndPoints,
  assignJiraTransition,
  assignReferences,
  endJiraToken,
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

    this.J2M = new JiraMarkupToMarkdown();
    logger.debug(`Config found: \n${highlight(YAML.stringify(config), { language: 'yml', ignoreIllegals: true })}`);
    logger.debug(`Args found: \n${highlight(YAML.stringify(argv), { language: 'yml', ignoreIllegals: true })}`);
    logger.debug(`Getting issues from: ${argv.from}`);
    if (argv.from === 'string') {
      logger.debug(`Getting issues from string: ${argv.string}`);
    }
    this.config = config;
    this.argv = argv;
    this.rawString = this.argv.string ?? config.string;
    /** @type {import('@broadshield/github-actions-core-typed-inputs').Context} */
    this.context = context;
    this.createIssue = argv.createIssue;
    this.updatePRTitle = argv.updatePRTitle;
    this.includeMergeMessages = argv.includeMergeMessages;
    this.commitMessageList = [];
    /** @type JiraIssueObject[] */
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
    logger.info(this.style.bold.yellow(`Milestone: finding a milestone with title matching ${issueMilestone}`));
    const milestones = await octokit.rest.issues.listMilestones({
      ...this.context.repo,
      state: 'all',
    });
    if (milestones?.data) {
      const milestone = _.filter(milestones.data, ['title', issueMilestone]);
      if (milestone) {
        return milestone;
      }
    }
    logger.debug(this.style.bold.yellow(`Milestone: Existing milestone not found.`));
  }

  async createOrUpdateMilestone(
    issueMilestone,
    /** type {string} */ issueMilestoneDueDate,
    /** type {string} */ issueMilestoneDescription,
  ) {
    logger.debug(this.style.bold.yellow.underline(`createOrUpdateMilestone: issueMilestone is ${issueMilestone}`));

    const foundMilestones = await this.findGithubMilestone(issueMilestone);
    const duedateData = {};
    if (issueMilestoneDueDate) {
      // YYYY-MM-DDTHH:MM:SSZ | ISO 8601
      duedateData.due_on = issueMilestoneDueDate;
    }
    if (foundMilestones && foundMilestones.length > 0) {
      try {
        const foundMilestone = foundMilestones[0];
        octokit.rest.issues.updateMilestone({
          ...this.context.repo,
          milestone_number: foundMilestone.number,
          description: issueMilestoneDescription,
          state: 'open',
          ...duedateData,
        });
        logger.info(
          this.style.bold.yellow(`Milestone: ${issueMilestone} with number ${foundMilestone.number} updated`),
        );
        return foundMilestone.number;
      } catch (error) {
        logger.error('createOrUpdateMilestone', error);
      }
    }
    try {
      const milestoneNumber = await octokit.rest.issues
        .createMilestone({
          ...this.context.repo,
          title: `${issueMilestone}`,
          description: issueMilestoneDescription,
          state: 'open',
          ...duedateData,
        })
        .then((resp) => {
          return resp.data.number;
        });
      logger.info(this.style.bold.yellow(`Milestone: ${issueMilestone} with number ${milestoneNumber} created`));
      return milestoneNumber;
    } catch (error) {
      logger.error('createOrUpdateMilestone', error);
      return -1;
    }
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

  async updatePullRequestBody(jiraIssuesList, startToken, endToken) {
    if (!this.context.payload.pull_request) {
      logger.info(`Skipping pull request update, pull_request not found in current github context, or received event`);

      return;
    }
    const issues = await this.formattedIssueList();
    const text = `### Linked Jira Issues:\n\n${issues}\n`;

    const { number, body, title } = this.context.payload.pull_request;

    logger.debug(`Updating PR number ${number}`);
    logger.debug(`With text:\n ${text}`);

    let newTitle = _.trim(title);

    if (this.updatePRTitle) {
      logger.debug(`Current PR Title: ${title}`);

      const issueKeys = this.issueKeys(jiraIssuesList);

      if (issueKeys.length > 0) {
        try {
          const re = /\[?(?<issues>(?:\w{2,8}[ _-]\d{3,5}(?:[ ,]+)?)+)[ :\]_-]+(?<title>.*)?/;

          const { groups } = newTitle.match(re) || {};
          if (groups) {
            logger.info(`The title match found: ${YAML.stringify(groups)}`);

            newTitle = `${issueKeys.join(', ')}: ${upperCaseFirst(_.trim(groups.title))}`.slice(0, 71);
            setOutput('title', `${upperCaseFirst(_.trim(groups.titles))}`);
          }
        } catch (error) {
          logger.warning(error);
        }
      }
    }
    if (issues) {
      const bodyUpdate = await this.updateStringByToken(startToken, endToken, body, text);

      await octokit.rest.pulls.update({
        ...this.context.repo,
        title: newTitle,
        body: bodyUpdate,
        pull_number: number,
      });
    }
  }

  async createOrUpdateGHIssues(issueKey, issueTitle, issueBody, issueAssignee = [], milestoneNumber = -1) {
    logger.debug(`Getting list of issues`);
    /** @type {number[]} */
    const issueNumbers = [];
    /** @type string[] */
    const assignees = [];
    if (_.isArray(issueAssignee)) {
      assignees.push(...issueAssignee);
    } else if (_.isString(issueAssignee)) {
      assignees.push(issueAssignee);
    }

    for await (const response of octokit.paginate.iterator(octokit.rest.issues.listForRepo, {
      ...this.context.repo,
      state: 'open',
      milestone: '*',
      assignee: '*',
      sort: 'created',
    })) {
      const { data } = response;

      logger.debug(`Checking for ${issueKey} in list of issues`);

      if (_.isArrayLike(data) && data.length > 0) {
        for (const element of data) {
          if (!element.pull_request && _.isString(element.title) && _.includes(element.title, issueKey)) {
            issueNumbers.push(element.number);
          }
        }
      }
    }
    const issuePromises = [];

    if (issueNumbers.length > 0) {
      for (const issueNumber of issueNumbers) {
        logger.debug(`Updating github issue number ${issueNumber} with Jira ${issueKey}`);
        issuePromises.push(
          octokit.rest.issues.update({
            ...this.context.repo,
            issue_number: issueNumber,
            title: `${issueKey}: ${issueTitle}`,
            body: issueBody,
            assignees,
            milestone: milestoneNumber === -1 ? undefined : milestoneNumber,
          }),
        );
      }
    } else {
      logger.debug(`Creating ${issueKey}`);
      issuePromises.push(
        octokit.rest.issues.create({
          ...this.context.repo,
          title: `${issueKey}: ${issueTitle}`,
          body: issueBody,

          assignees,
          milestone: milestoneNumber === -1 ? undefined : milestoneNumber,
        }),
      );
    }
    return Promise.all(issuePromises).then((values) => {
      const issueNumbersInner = [];
      for (const issue of values) {
        core.startGroup(`GitHub issue ${issue.data.number} data`);
        logger.debug(`Github Issue: \n${YAML.stringify(issue.data)}`);
        core.endGroup();
        this.githubIssues.push(issue.data.number);
        issueNumbersInner.push(issue.data.number);
      }
      return issueNumbersInner;
    });
  }

  /**
   * @param {JiraIssueObject} jiraIssue
   * @returns {Promise<number[]>}
   * */
  async jiraToGitHub(jiraIssue) {
    // Get or set milestone from issue
    // for (let version of jiraIssue.fixVersions) {
    logger.info(
      `JiraIssue is in project ${jiraIssue.projectKey} Fix Versions ${this.setToCommaDelimitedString(
        jiraIssue.fixVersions,
      )}`,
    );
    let chainP = Promise.resolve(-1);

    if (jiraIssue.fixVersions?.length === 1) {
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
      this.createOrUpdateGHIssues(jiraIssue.key, jiraIssue.summary, jiraIssue.description, undefined, msNumber),
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

  /** @return {Promise<JiraIssueObject[]>} */
  async getIssue(issueId, query) {
    if (!_.isString(issueId)) {
      logger.error(`Issue ID must be a string, was: ${typeof issueId}, ${YAML.stringify(issueId)}`);
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
      .then((issue) => {
        const objectList = [];
        if (issue) {
          const jiraIssueObject = this.jiraIssueToJiraIssueObject(issue);
          if (jiraIssueObject) {
            objectList.push(jiraIssueObject);
          }
        }
        return objectList;
      })
      .catch(() => {
        logger.error(`Error getting issue ${issueId}`);
        return [];
      });
  }

  /**
   * @param {import('jira.js/out/version2/models').Issue} jiraIssue
   * @return {JiraIssueObject | undefined}
   * */
  jiraIssueToJiraIssueObject(jiraIssue) {
    if (jiraIssue?.key) {
      /** @type {JiraIssueObject} */
      const jiraIssueObject = {
        key: jiraIssue.key,
        description: JiraMarkupToMarkdown.toM(jiraIssue.fields?.description ?? ''),
        projectKey: jiraIssue?.fields?.project?.key,
        projectName: jiraIssue?.fields?.project?.name,
        fixVersions: _.map(jiraIssue?.fields?.fixVersions, 'name'),
        priority: jiraIssue?.fields.priority?.name,
        status: jiraIssue?.fields.status?.name,
        summary: jiraIssue?.fields?.summary,
        dueDate: jiraIssue?.fields?.duedate ?? undefined,
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
          jiraIssueObject.fixVersions = fixArray;
        } else {
          this.fixVersions = [...new Set([...jiraIssueObject.fixVersions, ...fixArray])];
          jiraIssueObject.fixVersions = this.fixVersions;
          setOutput(`${jiraIssueObject.key}_fixVersions`, this.setToCommaDelimitedString(jiraIssueObject.fixVersions));
        }
      }

      return jiraIssueObject;
    }
    return;
  }

  getIssueSetFromString(string1, _set) {
    const set = _.isSet(_set) ? _set : new Set();
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

  issueKeys(jiraIssuesList) {
    if (_.isArray(jiraIssuesList)) {
      return _.map(jiraIssuesList, 'key');
    }
    return [];
  }

  /** @return {import('@octokit/graphql/dist-types/types').GraphQlResponse<any>} */
  async getRepositoriesNodes(after) {
    return graphqlWithAuth(listCommitMessagesInPullRequest, {
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      prNumber: this.context.payload?.pull_request?.number,
      after,
    }).then(
      async (result) => {
        const { repository } = result;
        if (repository?.pullRequest?.commits?.nodes) {
          const { totalCount = 0, pageInfo, nodes } = repository.pullRequest.commits;
          if (totalCount === 0) {
            return [...nodes];
          }
          if (pageInfo && pageInfo.hasNextPage === true) {
            const remainingNodes = await this.getRepositoriesNodes(pageInfo.endCursor);
            return [...nodes, ...remainingNodes];
          }
        }
        return [];
      },
      (error) => {
        logger.error(error);
        return [];
      },
    );
  }

  /**
   * @typedef {Object} JiraIssueObject
   * @property {string} key
   * @property {string} description=''
   * @property {string} projectKey=
   * @property {string} projectName=
   * @property {string[]} fixVersions=[]
   * @property {string|undefined} priority=
   * @property {string|undefined} status=
   * @property {string} summary=
   * @property {string|undefined} dueDate=
   * @property {number|undefined} ghNumber=
   */
  /**
   *
   * @returns {Promise<JiraIssueObject[]>}
   */
  async getJiraKeysFromGitRange() {
    const stringSet = this.getIssueSetFromString(this.rawString);
    if (this.rawString) {
      logger.debug(`Raw string provided is: ${this.rawString}`);
      setOutput('string_issues', this.setToCommaDelimitedString(stringSet));
    }

    const titleSet = this.getIssueSetFromString(this.context?.payload.pull_request?.title);
    if (_.startsWith(this.context.eventName, 'pull_request')) {
      logger.debug(`Pull request title is: ${this.context.payload?.pull_request?.title}`);
      setOutput('title_issues', this.setToCommaDelimitedString(titleSet));
    }
    const commitSet = new Set();
    const referenceSet = new Set();
    if (this.baseRef && this.headRef) {
      logger.info(
        `getJiraKeysFromGitRange: Getting list of GitHub commits between ${this.baseRef} and ${this.headRef}`,
      );

      referenceSet.add([...this.getIssueSetFromString(this.headRef)]);
      setOutput('ref_issues', this.setToCommaDelimitedString(referenceSet));

      if (this.context.payload?.pull_request?.number) {
        const nodes = await this.getRepositoriesNodes();
        if (nodes) {
          for (const node of nodes) {
            if (node) {
              const { message } = node.commit;
              let skipCommit = false;
              if (_.isString(message)) {
                if (_.startsWith(message, 'Merge branch') || _.startsWith(message, 'Merge pull')) {
                  logger.debug('Commit message indicates that it is a merge');
                  if (!this.includeMergeMessages) {
                    skipCommit = true;
                  }
                }
                if (skipCommit === false) {
                  this.getIssueSetFromString(message, commitSet);
                }
              } else {
                logger.debug(`Commit message is not a string: ${YAML.stringify(message)}`);
              }
            }
          }
        }
      }

      setOutput('commit_issues', this.setToCommaDelimitedString(commitSet));
    }
    const combinedArray = [...new Set([...stringSet, ...titleSet, ...referenceSet, ...commitSet])];
    /** @type {Promise<number[]>[]} */
    const ghResults = [];
    /** @type {Promise<JiraIssueObject[]>[]} */
    const issuesPromises = [];
    for (const issueKey of combinedArray) {
      issuesPromises.push(
        this.getIssue(issueKey, {
          fields: ['status', 'summary', 'fixVersions', 'priority', 'project', 'description', 'duedate'],
        }),
      );
    }
    /** its always an array of 0 or 1 item */
    const issues = await Promise.all(issuesPromises).then((results) =>
      _.map(
        _.filter(results, (f) => f.length > 0),
        (r) => r[0],
      ),
    );

    for (const issueObject of issues) {
      try {
        ghResults.push(this.jiraToGitHub(issueObject));
      } catch (error) {
        logger.error(error);
      }
      this.foundKeys.push(issueObject);
    }

    await Promise.all(ghResults);
    setOutput('issues', this.setToCommaDelimitedString(combinedArray));

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

  async transitionIssues(jiraIssuesList) {
    logger.debug(this.style.bold.green(`TransitionIssues: Number of keys ${jiraIssuesList.length}`));
    const transitionOptionsProm = [];

    const issueIds = [];

    for (const a of jiraIssuesList) {
      const issueId = a?.key;
      logger.debug(this.style.bold.green(`TransitionIssues: Checking transition for ${issueId}`));
      if (this.jiraTransition && this.transitionChain) {
        transitionOptionsProm.push(
          this.getIssueTransitions(issueId)
            .then((transObject) => {
              const { transitions } = transObject;
              logger.info(
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
                  logger.info(
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
      const issueObject = _.find(jiraIssuesList, (indexO) => indexO?.key === issueId);
      const w = this.getIssue(issueId).then((transitionedIssue) => {
        const statusName = get(transitionedIssue, 'fields.status.name');

        logger.info(this.style.bold.green(`Jira ${issueId} status is: ${statusName}.`));
        logger.info(this.style.bold.green(`Link to issue: ${this.config.baseUrl}/browse/${issueId}`));
        issueObject.set('status', statusName);
      });
      issuesProm.push(w);
    }
    await Promise.all(issuesProm);
  }

  async formattedIssueList(jiraIssuesList) {
    if (jiraIssuesList.length > 0) {
      return _.map(
        jiraIssuesList,
        (a) =>
          a &&
          `*  **[${a?.key}](${this.baseUrl}/browse/${a?.key ?? 'unknown'})** [${a?.status ?? 'Jira Status Unknown'}] ${
            a?.summary ?? 'unknown'
          } (Fix: #${a?.ghNumber ?? 'unknown'})`,
      );
    }
    return ['No Jira Issues Found'];
  }

  async outputReleaseNotes(jiraIssuesList) {
    const issues = await this.formattedIssueList(jiraIssuesList);
    const issuesJoined = _.join(issues, '\n');
    setOutput('notes', `### Release Notes:\n\n${issuesJoined}`);
    setOutput('notes_raw', `${issuesJoined}`);
    core.summary.addHeading(`Release Notes`).addList(issues).write();
  }

  /** @returns {Promise<JiraIssueObject[]>} */
  async execute() {
    if (this.argv.from === 'string') {
      return this.findIssueKeyIn(this.argv.string);
    }

    const jiraIssuesList = await this.getJiraKeysFromGitRange();
    await Promise.all([
      this.transitionIssues(jiraIssuesList),
      this.outputReleaseNotes(jiraIssuesList),
      this.updatePullRequestBody(jiraIssuesList, startJiraToken, endJiraToken),
    ]);

    return jiraIssuesList;
  }

  async findIssueKeyIn(searchString) {
    /** @type {JiraIssueObject[]} */
    let issues = [];
    if (_.isString(searchString)) {
      if (!searchString) {
        logger.info(`no issues found in ${this.argv.from}`);
        return issues;
      }
      const match = searchString.match(issueIdRegEx);

      if (match) {
        /** @type Promise<JiraIssueObject[]>[] */
        const issuesPromises = [];
        for (const issueKey of match) {
          logger.debug(`Looking up key ${issueKey} in jira`);
          const issueFound = this.getIssue(issueKey);
          if (issueFound) {
            issuesPromises.push(issueFound);
          }
        }

        /** its always an array of 0 or 1 item */
        issues = await Promise.all(issuesPromises).then((results) =>
          _.map(
            _.filter(results, (f) => f.length > 0),
            (r) => r[0],
          ),
        );
      } else {
        logger.info(`String "${searchString}" does not contain issueKeys`);
      }
      if (issues.length > 0) {
        let plural = 's';
        if (issues.length === 1) {
          plural = '';
        }
        logger.debug(`Jira key${plural}: ${_(issues).map('key').join(',')}`);
        logger.debug(`Found ${issues.length} issue${plural}`);
      }
    }
    return issues;
  }

  preprocessString(string_) {
    try {
      templateSettings.interpolate = /{{([\S\s]+?)}}/g;
      const tmpl = template(string_);

      return tmpl({ event: this.context });
    } catch (error) {
      logger.error(error);
    }
  }
}
