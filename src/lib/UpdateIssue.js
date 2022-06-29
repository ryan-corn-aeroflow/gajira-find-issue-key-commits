import * as core from '@actions/core';
import { Version2Client } from 'jira.js';


export default class UpdateIssue {
  constructor({ context, argv, config }) {

        this.Jira = new Version2Client({
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
      const {projectKey,issuetypeName ,fields, description, summary} = argv;


        // map custom fields
      let projects;
      await this.Jira.projects.searchProjects({
          startAt: 0,
            expand: 'issuetypes.fields',
            projectKeys: [projectKey],
            typeKey: issuetypeName,
        }, (err, data) => {
          projects = data;
          if (err) {
            core.error(`Error: ${err}`);
          }
        });



        if (projects.length === 0) {
            core.error(`project '${projectKey}' not found`);

            return;
        }
        const [project] = projects;

        core.info(`Project Metadata: ${JSON.stringify(project, null, ' ')}`);

        if (project.issuetypes.length === 0) {
            core.error(`issuetype '${issuetypeName}' not found`);

            return;
        }

        let providedFields = [{
            key: 'project',
            value: {
                key: projectKey,
            },
        }, {
            key: 'issuetype',
            value: {
                name: issuetypeName,
            },
        }, {
            key: 'summary',
            value: summary,
        }];

        if (description) {
            providedFields.push({
                key: 'description',
                value: description,
            });
        }

        if (fields) {
            providedFields = [...providedFields, ...this.transformFields(fields)];
        }
      const payload = { fields: {} };
      providedFields.forEach((field) => {

            payload.fields[field.key] = field.value;

        });

        const issue = await this.Jira.createIssue(payload);

        return { issue: issue.key };
    }

    transformFields(fieldsString) {
        const fields = JSON.parse(fieldsString);

        return Object.keys(fields).map(fieldKey => ({
            key: fieldKey,
            value: fields[fieldKey],
        }));
    }
};
