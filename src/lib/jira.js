import { Version2Client } from 'jira.js/out/version2';
import keys from 'lodash/keys';
import map from 'lodash/map';
import { logger } from '@broadshield/github-actions-core-typed-inputs';
import ActionError from './action-error';

/**
 * @typedef {import('../@types').JiraConfig} JiraConfig
 * @typedef {import('jira.js/out/version2/parameters/index').GetTransitions} GetTransitions
 * @typedef {import('jira.js/out/version2/parameters/index').GetIssue} GetIssue
 * @typedef {import('jira.js/out/version2/parameters/index').DoTransition} DoTransition
 * @typedef {import('jira.js/out/version2/models/index').Transitions} Transitions
 * @typedef {import('jira.js/out/version2/models/index').Issue} Issue
 * @typedef {import('jira.js/out/version2/models/index').IssueTransition} IssueTransition

 */
export class Jira {
  /**
   * @param {JiraConfig} config
   * @returns boolean
   */
  static validateConfig(config) {
    if (!config.email || !config.token || !config.baseUrl) {
      let errorMessage = '';
      errorMessage += `JIRA_BASE_URL was ${config.baseUrl ? 'found' : 'missing'}, `;
      errorMessage += `JIRA_API_TOKEN was ${config.token ? 'found' : 'missing'}, `;
      errorMessage += `and JIRA_USER_EMAIL ${config.email ? 'found' : 'missing'}, `;
      errorMessage += `but all are required`;
      throw new ActionError(errorMessage);
    }
    return true;
  }

  static transformFields(fieldsString) {
    const fields = JSON.parse(fieldsString);

    return map(keys(fields), (fieldKey) => ({
      key: fieldKey,
      value: fields[fieldKey],
    }));
  }

  /** @type {string} */
  baseUrl;

  /** @type {Version2Client} */
  client;

  /**
   *
   * @param {JiraConfig} config
   */
  constructor(config) {
    this.baseUrl = config.baseUrl;
    Jira.validateConfig(config);

    this.client = new Version2Client({
      host: config.baseUrl,
      telemetry: false,
      newErrorHandling: true,
      authentication: {
        basic: {
          email: config.email,
          apiToken: config.token,
        },
      },
    });
  }

  /**
   *
   * @param {string} issueId
   * @param {{fields?: string[]; expand?: string; }} [query]
   * @returns {Promise<Issue|undefined>}
   */
  async getIssue(issueId, query) {
    /** @type {GetIssue} */
    const parameters = {
      issueIdOrKey: issueId,
    };
    if (query !== undefined) {
      parameters.fields = query.fields || [];
      parameters.expand = query.expand || undefined;
    }
    try {
      return this.client.issues.getIssue(parameters);
    } catch (error) {
      logger.error(`Error getting issue ${issueId} from Jira: ${error}`);
    }
  }

  /**
   *
   * @param {string} issueId
   * @returns Promise<Transitions>
   */
  async getIssueTransitions(issueId) {
    /** @type {GetTransitions} */
    const parameters = {
      issueIdOrKey: issueId,
    };
    return this.client.issues.getTransitions(parameters);
  }

  /**
   *
   * @param {string} issueId
   * @param {IssueTransition} data
   * @returns {Promise<object>}
   */
  async transitionIssue(issueId, data) {
    /** @type DoTransition */
    const parameters = {
      issueIdOrKey: issueId,
      transition: data,
    };
    return this.client.issues.doTransition(parameters);
  }
}

export default Jira;
