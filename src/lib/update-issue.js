import { Version2Client } from 'jira.js';
import _ from 'lodash';
import { logger } from '@broadshield/github-actions-core-typed-inputs';

export default class UpdateIssue {
  constructor({ context, argv, config }) {
    this.client = new Version2Client({
      host: config.baseUrl,
      telemetry: false,
      authentication: {
        basic: {
          email: config.email,
          apiToken: config.token,
        },
      },
    });

    this.config = config;
    this.argv = argv;
    this.githubEvent = context;
  }

  async execute() {
    const { argv } = this;
    const { projectKey, issuetypeName, fields, description, summary } = argv;
    // map custom fields
    /** @type {import('jira.js/out/version2/models').Project[]} */
    let projects = [];
    let isLast = false;
    let startAt = 0;
    function callbackF(error, data) {
      projects = [...projects, ...(data?.values || [])];
      isLast = !!(!data || data?.isLast || !data?.nextPage);
      startAt = (data?.startAt || 0) + (data?.total || 0);
      if (error) {
        logger.error(`Error: ${error}`);
      }
    }
    while (!isLast) {
      await this.client.projects.searchProjects(
        {
          startAt,
          expand: 'issuetypes.fields',
          keys: [projectKey],
          typeKey: issuetypeName,
        },
        callbackF,
      );
    }

    if (!projects || projects.length === 0) {
      logger.error(`project '${projectKey}' not found`);
      return;
    }
    const [project] = projects;

    logger.info(`Project Metadata: ${JSON.stringify(project, undefined, ' ')}`);

    if (!project.issueTypes || project.issueTypes?.length === 0) {
      logger.error(`issuetype '${issuetypeName}' not found`);
      return;
    }

    /** @typedef {object} ProvidedFields
     * @property {string} key
     * @property {string} value
     * /
    /** @type {ProvidedFields[]} */
    let providedFields = [];

    if (fields) {
      providedFields = [...providedFields, ...this.transformFields(fields)];
    }

    const payload = {
      fields: {
        project: projectKey,
        issuetype: issuetypeName,
        summary,
        description,
      },
    };
    for (const field of providedFields) {
      payload.fields[field.key] = field.value;
    }

    const issue = await this.client.issues.createIssue(payload);

    return { issue: issue.key };
  }

  transformFields(fieldsString) {
    const fields = JSON.parse(fieldsString);

    return _.map(_.keys(fields), (fieldKey) => ({
      key: fieldKey,
      value: fields[fieldKey],
    }));
  }
}