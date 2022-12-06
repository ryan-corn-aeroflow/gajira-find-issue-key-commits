import { Version2Client } from 'jira.js';
import _ from 'lodash';
import { logger } from '@broadshield/github-actions-core-typed-inputs';
import ActionError from './action-error';

/**
 * @typedef {Object} JiraConfig
 * @property {string} [baseUrl]
 * @property {string} [token]
 * @property {string} [email]
 * @property {string} [transitionId]
 * @property {string} [project]
 * @property {string} [issuetype]
 * @property {string} [summary]
 * @property {string} [description]
 * @property {string} [issue]
 */
/**
 * @typedef {Object} JiraAuthConfig
 * @property {string} baseUrl
 * @property {string} token
 * @property {string} email
 * @property {string} [string]
 */
/** @typedef {Object} ArgumentsIndex */
/**
 * @typedef {Object} Arguments
 * @property {string} token
 * @property {string} string
 * @property {string} [headRef]
 * @property {string} [baseRef]
 * @property {string} projects
 * @property {string} projectsIgnore
 * @property {boolean} includeMergeMessages
 * @property {boolean} ignoreCommits
 * @property {boolean} failOnError
 * @property {JiraAuthConfig} config
 * @property {string} [githubApiBaseUrl]
 * @property {string} enterpriseServerVersion
 */
/**
 * @typedef {Object} ReferenceRange
 * @property {string} [headRef]
 * @property {string} [baseRef]
 */
/**
 * @typedef {Object} ProjectFilter
 * @property {string[]} projectsIncluded
 * @property {string[]} projectsExcluded
 */

export default class CreateIssue {
  /**
   *
   * @param {JiraAuthConfig | JiraConfig} config
   * @returns {boolean}
   * @throws {import('./action-error.js').default}
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

    return _.map(_.keys(fields), (fieldKey) => ({
      key: fieldKey,
      value: fields[fieldKey],
    }));
  }

  constructor({ context, argv, config }) {
    CreateIssue.validateConfig(config);
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

    this.config = config;
    this.argv = argv;
    this.githubEvent = context;
  }

  /**
   *
   * @param {string} issueId
   * @param {{fields?: string[];expand?: string;}} query=
   * @returns {Promise<import('jira.js/out/version2/models/index').Issue>}
   */
  async getIssue(issueId, query) {
    /** @type {import('jira.js/out/version2/parameters/index').GetIssue} */
    const parameters = {
      issueIdOrKey: issueId,
    };
    if (query !== undefined) {
      parameters.fields = query.fields || [];
      parameters.expand = query.expand || undefined;
    }
    return this.client.issues.getIssue(parameters);
  }

  async execute() {
    const { argv } = this;
    const projectKey = argv.project;
    const issuetypeName = argv.issuetype;

    // map custom fields
    const customFields = await this.client.issues.getCreateIssueMeta({
      expand: 'projects.issuetypes.fields',
      projectKeys: projectKey,
      issuetypeNames: issuetypeName,
    });
    const { projects } = customFields;

    if (!projects || projects.length === 0) {
      logger.error(`project '${projectKey}' not found`);

      return;
    }
    const [project] = projects;
    if (!project || project.issuetypes?.length === 0) {
      logger.error(`issuetype '${issuetypeName}' not found`);
      return;
    }

    logger.info(`Project Metadata: ${JSON.stringify(project, undefined, ' ')}`);
    /** @typedef {object} ProvidedFields
     * @property {string} key
     * @property {string} value
     * /
/** @type {ProvidedFields[]} */
    let providedFields = [];

    if (argv.fields) {
      providedFields = [...CreateIssue.transformFields(argv.fields)];
    }

    const payload = {
      fields: {
        project: projectKey,
        issuetype: issuetypeName,
        summary: argv.summary,
        description: argv.description,
      },
    };
    for (const field of providedFields) {
      payload.fields[field.key] = field.value;
    }
    /** @type {import('jira.js/out/version2/models/index').CreatedIssue | undefined} */
    let issue;
    /** @type {import('jira.js/out/version2/parameters/index').CreateIssue} payload */
    const createIssuePayload = payload;
    await this.client.issues.createIssue(createIssuePayload, (error, data) => {
      issue = data;
      if (error) {
        logger.error(`Error: ${error}`);
      }
    });

    return { issue: issue?.key ?? '' };
  }
}
