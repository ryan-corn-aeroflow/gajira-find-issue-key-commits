import * as core from '@actions/core';
import { Version2Client } from 'jira.js';

export default class CreateIssue {
  constructor({ context, argv, config }) {
       this.baseUrl = config.baseUrl;
    this.token = config.token;
    this.email = config.email;
        this.Jira = new Version2Client({
      host: this.baseUrl,
      telemetry: false,
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

    async execute() {
        const { argv } = this;
        const projectKey = argv.project;
        const issuetypeName = argv.issuetype;

        // map custom fields
        const { projects } = await this.Jira.getCreateMeta({
            expand: 'projects.issuetypes.fields',
            projectKeys: projectKey,
            issuetypeNames: issuetypeName,
        }, '2');



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
            value: argv.summary,
        }];

        if (argv.description) {
            providedFields.push({
                key: 'description',
                value: argv.description,
            });
        }

        if (argv.fields) {
            providedFields = [...providedFields, ...CreateIssue.transformFields(argv.fields)];
        }
      const payload = { fields: {}};
        providedFields.forEach((field) => {
            payload.fields[field.key] = field.value;
        });

      let issue;
      await this.Jira.issues.createIssue(payload, (err, data) => {
        issue = data;
        if (err) {
          core.error(`Error: ${err}`);
        }
      });

        return { issue: issue.key };
    }

    static transformFields(fieldsString) {
        const fields = JSON.parse(fieldsString);

        return Object.keys(fields).map(fieldKey => ({
            key: fieldKey,
            value: fields[fieldKey],
        }));
    }
};
