import _ from 'lodash';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import { logger } from '@broadshield/github-actions-core-typed-inputs';
import { Jira } from './jira';

export class JiraIssueObject {
  /** @type Jira */
  static jira;

  /**
   * @param {Jira} jira
   * @returns void
   * */

  static setJira(jira) {
    this.jira = jira;
  }

  /**
   * @returns {Jira | undefined}
   */
  static getJira() {
    return this.jira;
  }

  /**
   * @param {string} key
   * @param {Jira} [jira]
   * @param {boolean} loadIssueData
   * @param {boolean} throwErrorOnLoadFail
   * @returns {Promise<JiraIssueObject>}
   * */
  static async create(key, jira, loadIssueData = false, throwErrorOnLoadFail = false) {
    if (jira && jira instanceof Jira) {
      JiraIssueObject.setJira(jira);
    }
    const issue = new JiraIssueObject(key, throwErrorOnLoadFail);
    // if (loadIssueData && JiraIssueObject.getJira()) {
    //   await issue.loadIssueData({ jira: JiraIssueObject.getJira() });
    // }
    return issue;
  }

  throwErrorOnLoadFail = false;

  /** @type {string} */
  key;

  /** @type {boolean} */
  exists;

  /** @type {number} */
  dataLoaded;

  /** @type {string?} */
  description;

  /** @type {string} */
  projectKey;

  /** @type {string} */
  projectName;

  /** @type {string[]} */
  fixVersions;

  /** @type {string=} */
  priority;

  /** @type {string=} */
  status;

  /** @type {string} */
  summary;

  /** @type {string=} */
  dueDate;

  /** @type {string=} */
  ghNumber;

  /**
   * @param {string} key
   * @param {boolean} throwErrorOnLoadFail
   * */
  constructor(key, throwErrorOnLoadFail) {
    this.key = key;
    this.throwErrorOnLoadFail = throwErrorOnLoadFail;
  }

  /**
   *
   * @param {import('../@types').LoadIssueDataInterface} config
   * @returns {Promise<JiraIssueObject>}
   */
  async loadIssueData(config) {
    let jira = JiraIssueObject.getJira();
    const forceReload = config?.forceReload ?? false;
    if (config?.jira && config.jira instanceof Jira && !!jira) {
      JiraIssueObject.setJira(config.jira);
      jira = config.jira;
    }
    if (!jira) {
      const errorMessage = 'JiraIssueObject:loadIssueData: No Jira instance provided';
      if (this.throwErrorOnLoadFail) {
        throw new Error(errorMessage);
      } else {
        logger.error(errorMessage);
        return this;
      }
    }
    if (this.dataLoaded && !forceReload) {
      return this;
    }
    const query = {
      fields: ['status', 'summary', 'fixVersions', 'priority', 'project', 'description', 'duedate', 'renderedFields'],
      expand: 'renderedFields',
    };
    try {
      const jiraIssue = await jira.getIssue(this.key, query);

      if (jiraIssue) {
        const descriptionHTML = jiraIssue.renderedFields?.description;
        this.description = descriptionHTML
          ? NodeHtmlMarkdown.translate(/* html */ descriptionHTML ?? '', /* options (optional) */ {})
          : jiraIssue.fields.summary ?? '';
        this.projectKey = jiraIssue.fields?.project?.key;
        this.projectName = jiraIssue.fields?.project?.name;
        this.fixVersions = _.map(jiraIssue.fields.fixVersions, (f) => f.name);
        this.priority = jiraIssue.fields.priority.name;
        this.status = jiraIssue.fields.status.name;
        this.summary = jiraIssue.fields.summary;
        this.dueDate = jiraIssue.fields?.duedate ?? undefined;
      }
      this.exists = !!jiraIssue;
      this.dataLoaded = Date.now();
      logger.debug(`JiraIssueObject:loadIssueData: Loaded issue data for ${this.key}`);
      logger.debug(`JiraIssueObject:loadIssueData: description\n${JSON.stringify(this.description)}`);
      return this;
    } catch (error) {
      const message = `JiraIssueObject:loadIssueData: Failed to load issue data for ${this.key}: ${error}`;
      if (this.throwErrorOnLoadFail) {
        throw new Error(message);
      } else {
        logger.error(message);
        return this;
      }
    }
  }
}

export default JiraIssueObject;
