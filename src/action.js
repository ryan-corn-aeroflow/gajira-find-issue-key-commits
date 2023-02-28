import ansiColors from 'ansi-colors';
import { highlight } from 'cli-highlight';
import _ from 'lodash';
import filter from 'lodash/filter';
import find from 'lodash/find';
import get from 'lodash/get';
import includes from 'lodash/includes';
import isArray from 'lodash/isArray';
import isArrayLike from 'lodash/isArrayLike';
import isSet from 'lodash/isSet';
import isString from 'lodash/isString';
import join from 'lodash/join';
import map from 'lodash/map';
import replace from 'lodash/replace';
import split from 'lodash/split';
import startsWith from 'lodash/startsWith';
import template from 'lodash/template';
import templateSettings from 'lodash/templateSettings';
import toLower from 'lodash/toLower';
import trim from 'lodash/trim';
import uniq from 'lodash/uniq';
import * as YAML from 'yaml';
import { core, logger, setOutput } from '@broadshield/github-actions-core-typed-inputs';
import { Jira } from './lib/jira';
import { JiraIssueObject } from './lib/jira-issue-object';
import {
  GetStartAndEndPoints,
  assignJiraTransition,
  endJiraToken,
  graphqlWithAuth,
  issueIdRegEx,
  listCommitMessagesInPullRequest,
  octokit,
  startJiraToken,
  strictIssueIdRegEx,
  normaliseKey,
  titleCasePipe,
} from './utils';

export default class Action {
  /**
   * @param {JiraIssueObject[]} jiraIssuesList
   * @return {string[]}
   */
  static issueKeys(jiraIssuesList) {
    if (isArrayLike(jiraIssuesList)) {
      return uniq(map(jiraIssuesList, 'key'));
    }
    return [];
  }

  /**
   *
   * @param {string} startToken
   * @param {string} endToken
   * @param {string} fullText
   * @param {string} insertText
   * @returns {string}
   */
  static updateStringByToken(startToken, endToken, fullText, insertText) {
    const regex = new RegExp(
      `(?<start>\\[\\/]: \\/ "${startToken}"\\n)(?<text>(?:.|\\s)+)(?<end>\\n\\[\\/]: \\/ "${endToken}"(?:\\s)?)`,
      'gm',
    );

    if (regex.test(fullText)) {
      return replace(fullText, regex, `$1${insertText}$3`);
    }

    return `${trim(fullText)}\n\n[/]: / "${startToken}"\n${insertText}\n[/]: / "${endToken}"`;
  }

  /**
   *
   * @param {Set<string>|string[]|string} stringSet
   * @returns {string}
   */
  static setToCommaDelimitedString(stringSet) {
    if (stringSet) {
      if (isSet(stringSet)) {
        return [...stringSet].join(',');
      }
      if (isArray(stringSet)) {
        return join(stringSet, ',');
      }
      if (isString(stringSet)) {
        return stringSet;
      }
    }
    return '';
  }

  /**
   *
   * @param {object} param0
   * @param {import('@broadshield/github-actions-core-typed-inputs').Context} param0.context
   * @param {import('./@types').Args} param0.argv
   * @param {import('./@types').JiraConfig} param0.config
   */
  constructor({ context, argv, config }) {
    this.style = ansiColors.create();
    this.baseUrl = config.baseUrl;
    this.token = config.token;
    this.email = config.email;
    this.jira = new Jira(config);

    const configLog = highlight(JSON.stringify(config), { language: 'json', ignoreIllegals: true });
    const argvLog = highlight(JSON.stringify(argv), { language: 'json', ignoreIllegals: true });
    logger.debug(`Config found: \n${configLog}`);
    logger.debug(`Args found: \n${argvLog}`);
    if (argv.from) {
      logger.debug(`Getting issues from: ${argv.from}`);
    }
    this.config = config;
    this.argv = argv;
    this.rawString = this.argv.string ?? config.string;
    /** @type {import('@broadshield/github-actions-core-typed-inputs').Context} */
    this.context = context;
    this.updatePRTitle = argv.updatePRTitle;
    this.includeMergeMessages = argv.includeMergeMessages;
    /** @type string[] */
    this.commitMessageList = [];
    /** @type JiraIssueObject[] */
    this.jiraIssueArray = [];
    /** @type string[] */
    this.githubIssues = [];
    this.jiraTransition = undefined;
    this.createGist = false;
    this.gist_private = argv.gist_private;
    this.fixVersions = argv.fixVersions;
    this.transitionChain = split(argv.transitionChain ?? '', ',');
    this.jiraTransition = assignJiraTransition(context, argv);
    this.headRef = argv.headRef;
    this.baseRef = argv.baseRef;

    if (argv.gist_name) {
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
      const milestone = filter(milestones.data, ['title', issueMilestone]);
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

  async updatePullRequestBody(jiraIssuesList, startToken, endToken) {
    const pullRequest = this.context.payload.pull_request ?? this.argv.pr;
    if (!pullRequest) {
      logger.info(`Skipping pull request update, pull_request not found in current github context, or received event`);

      return;
    }
    const issues = this.formattedIssueList(jiraIssuesList);
    const text = `### Linked Jira Issues:\n\n${issues}\n`;

    const { number, body, title } = pullRequest;

    logger.debug(`Updating PR number ${number}`);
    logger.debug(`With text:\n ${text}`);

    let newTitle = trim(title);

    if (this.updatePRTitle) {
      logger.debug(`Current PR Title: ${title}`);

      const issueKeys = [...Action.issueKeys(jiraIssuesList)];

      if (issueKeys.length > 0) {
        try {
          const re =
            /(?:^|[ [])*(?<=^|[a-z]-|[\s&P[\]^cnptu{}\-])([A-Za-z]\w*[ \-]\d+)(?![^\W_])[ ,:[\]|\-]*(?<title>.*)$/;

          const { groups } = newTitle.match(re) || {};
          if (groups) {
            logger.info(`The title match found: ${YAML.stringify(groups)}`);
            const titleString = titleCasePipe(replace(trim(groups.title), /\s+/g, ' '));
            newTitle = `${join(issueKeys, ',')}: ${titleString}`.slice(0, 71);
            logger.debug(`Revised PR Title: ${newTitle}`);
            setOutput('title', `${titleString}`);
          }
        } catch (error) {
          logger.warning(error);
        }
      }
    }
    if (issues) {
      const bodyUpdate = Action.updateStringByToken(startToken, endToken, body ?? '', text);

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
    if (isArray(issueAssignee)) {
      assignees.push(...issueAssignee);
    } else if (isString(issueAssignee)) {
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

      if (data && isArrayLike(data) && data.length > 0) {
        for (const element of data) {
          if (!element.pull_request && isString(element.title) && includes(element.title, issueKey)) {
            issueNumbers.push(element.number);
          }
        }
      }
    }
    const issuePromises = [];

    if (issueNumbers && issueNumbers.length > 0) {
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
    return Promise.all(issuePromises)
      .then((values) => {
        const issueNumbersInner = [];
        for (const issue of values) {
          core.startGroup(`GitHub issue ${issue.data.number} data`);
          logger.debug(`Github Issue: \n${YAML.stringify(issue.data)}`);
          core.endGroup();
          this.githubIssues.push(String(issue.data.number));
          issueNumbersInner.push(issue.data.number);
        }
        return issueNumbersInner;
      })
      .catch((error) => {
        logger.error('Unable to update Github Issues');
        logger.error(error);
        return [];
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
      `JiraIssue is in project ${jiraIssue.projectKey} Fix Versions ${Action.setToCommaDelimitedString(
        jiraIssue.fixVersions,
      )}`,
    );
    let chainP = Promise.resolve(-1);

    if (isArrayLike(jiraIssue.fixVersions) && jiraIssue.fixVersions?.length === 1) {
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

  /**
   * @param {{headRef: string, baseRef: string}} range
   * @returns {Promise<{startDate: string, endDate: string}>}
   * */
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

  /**
   * @param {string} issueId
   * @return {Promise<JiraIssueObject>} */
  async getIssue(issueId) {
    if (!isString(issueId)) {
      logger.error(`Issue ID must be a string, was: ${typeof issueId}, ${YAML.stringify(issueId)}`);
      throw new Error(`Issue ID must be a string, was: ${typeof issueId}, ${YAML.stringify(issueId)}`);
    }
    const jio = find(this.jiraIssueArray, ['key', issueId]);
    return jio ?? JiraIssueObject.create(issueId, this.jira, true, this.argv.failOnError);
  }

  /**
   *
   * @param {string} string1
   * @param {Set<string>|undefined=} _set
   * @returns {Set<string>}
   */
  getIssueSetFromString(string1, _set) {
    const set = isSet(_set) ? _set : new Set();
    if (isString(string1)) {
      const match = string1.match(strictIssueIdRegEx);

      if (match) {
        for (const issueKey of match) {
          set.add(normaliseKey(issueKey));
        }
      }
    }
    return set;
  }

  /**
   * @param {number|undefined=} after
   * @return {import('@octokit/graphql/dist-types/types').GraphQlResponse<any>}
   * */
  async getRepositoriesNodes(after) {
    const pullRequest = this.context?.payload.pull_request ?? this.argv.pr;
    return graphqlWithAuth(listCommitMessagesInPullRequest, {
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      prNumber: pullRequest?.number ?? this.argv.pr?.number,
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
   *
   * @returns {Promise<JiraIssueObject[]>}
   */
  async getJiraKeysFromGitRange() {
    const stringSet = this.getIssueSetFromString(this.rawString);
    if (this.rawString) {
      logger.debug(`Raw string provided is: ${this.rawString}`);
      setOutput('string_issues', Action.setToCommaDelimitedString(stringSet));
    }
    const pullRequest = this.context?.payload.pull_request ?? this.argv.pr;
    const titleSet = this.getIssueSetFromString(pullRequest?.title);
    if (pullRequest?.title) {
      logger.debug(`Pull request title is: ${pullRequest?.title}`);
      setOutput('title_issues', Action.setToCommaDelimitedString(titleSet));
    }
    const commitSet = new Set();
    const referenceSet = new Set();
    if (this.baseRef && this.headRef) {
      logger.info(
        `getJiraKeysFromGitRange: Getting list of GitHub commits between ${this.baseRef} and ${this.headRef}`,
      );

      referenceSet.add([...this.getIssueSetFromString(this.headRef)]);
      setOutput('ref_issues', Action.setToCommaDelimitedString(referenceSet));

      if (pullRequest?.number) {
        const nodes = await this.getRepositoriesNodes();
        if (nodes) {
          for (const node of nodes) {
            if (node) {
              const { message } = node.commit;
              let skipCommit = false;
              if (isString(message)) {
                if (startsWith(message, 'Merge branch') || startsWith(message, 'Merge pull')) {
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

      setOutput('commit_issues', Action.setToCommaDelimitedString(commitSet));
    }
    /** @type string[] */
    const combinedArray = [...new Set([...stringSet, ...titleSet, ...referenceSet, ...commitSet].flat())];
    /** @type {Promise<number[]>[]} */
    const ghResults = [];
    /** @type {Promise<JiraIssueObject>[]} */
    const issuesPromises = [];
    for (const issueKey of combinedArray) {
      logger.info(`getJiraKeysFromGitRange: Getting issue ${issueKey} from Jira`);
      issuesPromises.push(this.getIssue(issueKey));
    }

    const issuesRaw = await Promise.all(issuesPromises);
    const issues = filter(issuesRaw, (issue) => issue !== undefined && issue.exists);
    for (const issueObject of issues) {
      try {
        ghResults.push(this.jiraToGitHub(issueObject));
      } catch (error) {
        logger.error(error);
      }
      this.jiraIssueArray.push(issueObject);
    }

    await Promise.all(ghResults);
    setOutput('issues', Action.setToCommaDelimitedString(combinedArray));

    return this.jiraIssueArray;
  }

  /**
   *
   * @param {JiraIssueObject[]} jiraIssuesList
   */
  async transitionIssues(jiraIssuesList) {
    logger.debug(this.style.bold.green(`TransitionIssues: Number of keys ${jiraIssuesList?.length}`));
    const transitionOptionsProm = [];
    /** @type string[] */
    const issueIds = [];
    if (isArray(jiraIssuesList) && jiraIssuesList?.length > 0) {
      for (const a of jiraIssuesList) {
        const issueId = a?.key;
        if (isString(issueId)) {
          issueIds.push(issueId);
        }
        logger.debug(this.style.bold.green(`TransitionIssues: Checking transition for ${issueId}`));
        if (this.jiraTransition && this.transitionChain) {
          transitionOptionsProm.push(
            this.jira
              .getIssueTransitions(issueId)
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
                const indexJT = this.transitionChain.indexOf(this.jiraTransition ?? '');
                /** @type Promise<void>[] */
                const transitionProm = [];
                for (let index = 0; index < indexJT; index++) {
                  const link = this.transitionChain[index];

                  const transitionToApply = find(
                    transitions,
                    (t) => t.id === link || toLower(t.name) === toLower(link),
                  );
                  if (transitionToApply) {
                    const transitionId = transitionToApply.id;
                    logger.info(
                      this.style.bold.green(
                        `Applying transition:\n${this.style.bold.greenBright(YAML.stringify(transitionToApply))}`,
                      ),
                    );
                    /** @type {import('./lib/jira').IssueTransition} */
                    const transitionData = {
                      id: transitionId,
                    };
                    const tI = this.jira.transitionIssue(issueId, transitionData);
                    transitionProm.push(tI);
                  }
                }
                return Promise.allSettled(transitionProm);
              }),
          );
        }
      }
    }
    await Promise.all(transitionOptionsProm);
    const issuesProm = [];
    if (issueIds.length > 0) {
      for (const issueId of issueIds) {
        /** @type {JiraIssueObject|undefined} */
        const issueObject = find(jiraIssuesList, (indexO) => indexO?.key === issueId);
        if (issueObject) {
          const w = this.getIssue(issueId).then((transitionedIssue) => {
            const statusName = get(transitionedIssue, 'fields.status.name');
            logger.info(this.style.bold.green(`Jira ${issueId} status is: ${statusName}.`));
            logger.info(this.style.bold.green(`Link to issue: ${this.config.baseUrl}/browse/${issueId}`));
            issueObject.status = statusName;
          });
          issuesProm.push(w);
        }
      }
    }
    await Promise.all(issuesProm);
  }

  /**
   *
   * @param {JiraIssueObject[]} jiraIssuesList
   * @returns {string[]}
   */
  formattedIssueList(jiraIssuesList) {
    if (jiraIssuesList && jiraIssuesList.length > 0) {
      return map(
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

  outputReleaseNotes(jiraIssuesList) {
    const issues = this.formattedIssueList(jiraIssuesList);
    const issuesJoined = join(issues, '\n');
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
    this.outputReleaseNotes(jiraIssuesList);
    await Promise.all([
      this.transitionIssues(jiraIssuesList),
      this.updatePullRequestBody(jiraIssuesList, startJiraToken, endJiraToken),
    ]);

    return jiraIssuesList;
  }

  /**
   *
   * @param {string} searchString
   * @returns {Promise<JiraIssueObject[]>}
   */
  async findIssueKeyIn(searchString) {
    /** @type {JiraIssueObject[]} */
    let issues = [];
    if (isString(searchString)) {
      if (!searchString) {
        logger.info(`no issues found in ${this.argv.from}`);
        return issues;
      }
      const match = searchString.match(issueIdRegEx);

      if (match) {
        /** @type Promise<JiraIssueObject>[] */
        const issuesPromises = [];
        for (const issueKey of match) {
          logger.debug(`Looking up key ${issueKey} in jira`);

          const issueFound = this.getIssue(issueKey);
          if (issueFound) {
            issuesPromises.push(issueFound);
          }
        }

        /** its always an array of 0 or 1 item */
        issues = await Promise.all(issuesPromises);
      } else {
        logger.info(`String "${searchString}" does not contain issueKeys`);
      }
      if (issues && issues.length > 0) {
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

  /**
   * @param {string} string_
   * @returns {string|undefined}
   */
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
