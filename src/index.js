import * as core from '@actions/core';
import * as github from '@actions/github';
import * as YAML from 'yaml';

import Action from './action';
import * as fsHelper from './lib/fs-helper';
import { undefinedOnEmpty } from './utils';

const cliConfigPath = `${process.env.HOME}/.jira.d/config.yml`;
const configPath = `${process.env.HOME}/jira/config.yml`;

export async function writeKey(result) {
  if (!result) {
    return;
  }
  core.debug(`Detected issueKey: ${result.get('key')}`);
  core.debug(`Saving ${result.get('key')} to ${cliConfigPath}`);
  core.debug(`Saving ${result.get('key')} to ${configPath}`);

  // Expose created issue's key as an output
  if (fsHelper.existsSync(configPath)) {
    const _config = YAML.parse(fsHelper.loadFileSync(configPath));
    const yamledResult = YAML.stringify(result);
    const extendedConfig = { ..._config, ...result };

    fsHelper.writeFileSync(configPath, YAML.stringify(extendedConfig));

    return fsHelper.appendFileSync(cliConfigPath, yamledResult);
  }
}

export const exec = async () => {
  try {
    const argv = parseArgs();
    const { context } = github;
    let configFromFile = {};
    try {
      if (fsHelper.existsSync(configPath)) {
        configFromFile = YAML.parse(fsHelper.loadFileSync(configPath));
      }
    } catch (error) {
      core.debug(`Error finding/parsing config file: ${error}, moving on`);
    }
    const config = {
      ...configFromFile,
      baseUrl: argv?.jiraConfig?.baseUrl ?? configFromFile?.baseUrl,
      token: argv?.jiraConfig?.token ?? configFromFile?.token,
      email: argv?.jiraConfig?.email ?? configFromFile?.email,
      string: argv?.string ?? configFromFile?.string,
    };
    const result = await new Action({
      context,
      argv,
      config,
    }).execute();

    if (result) {
      if (Array.isArray(result)) {
        core.debug('Result is an array');

        const outputIssues = [];
        const results = [];
        result.forEach((item) => {
          results.push(item);
          outputIssues.push(item.get('key'));
        });
        await Promise.all(results);
        const issueListString = outputIssues.join(',');
        core.setOutput('issues', issueListString);

        return;
      }
      const issueKey = result.get('key');
      core.setOutput('issue', issueKey);
      core.setOutput('issues', [issueKey]);

      return await writeKey(result);
    }

    core.debug('No issueKeys found.');
  } catch (error) {
    core.setFailed(error);
  }
};

export function parseArgs() {
  const fromList = ['string', 'commits', 'pull_request', 'branch'];
  const jiraConfig = {
    baseUrl: '',
    token: '',
    email: '',
  };
  jiraConfig.baseUrl = process.env.JIRA_BASE_URL || core.getInput('jira_base_url');
  if (!jiraConfig.baseUrl || jiraConfig.baseUrl === '') {
    throw new Error('JIRA_BASE_URL env not defined, or supplied as action input jira_base_url');
  }
  jiraConfig.token = process.env.JIRA_API_TOKEN || core.getInput('jira_api_token');
  if (!jiraConfig.token || jiraConfig.token === '') {
    throw new Error('JIRA_API_TOKEN env not defined, or supplied as action input jira_api_token');
  }
  jiraConfig.email = process.env.JIRA_USER_EMAIL || core.getInput('jira_user_email');
  if (!jiraConfig.email || jiraConfig.email === '') {
    throw new Error('JIRA_USER_EMAIL env not defined, or supplied as action input jira_user_email');
  }

  return {
    string: undefinedOnEmpty(core.getInput('string')),
    from: fromList.includes(core.getInput('from')) ? core.getInput('from') : 'commits',
    headRef: undefinedOnEmpty(core.getInput('head-ref')),
    baseRef: undefinedOnEmpty(core.getInput('base-ref')),
    includeMergeMessages: core.getBooleanInput('include-merge-messages'),
    GitHubIssues: core.getBooleanInput('generate-github-issues'),
    GitHubMilestones: core.getBooleanInput('generate-github-milestones'),
    returns: undefinedOnEmpty(core.getInput('returns')) ?? 'first',
    updatePRTitle: core.getBooleanInput('standardize-pr-title'),
    transitionChain: undefinedOnEmpty(core.getInput('jira-transition-chain')),
    transitionOnNewBranch: core.getInput('jira-transition-on-new-branch'),
    transitionOnPrOpen: core.getInput('jira-transition-on-pr-open'),
    transitionOnPrApproval: core.getInput('jira-transition-on-pr-approval'),
    transitionOnPrMerge: core.getInput('jira-transition-on-pr-merge'),
    gist_private: core.getBooleanInput('gist-private'),
    gist_name: core.getInput('create-gist-output-named'),
    jiraTransition: core.getInput('jira-transition'),

    fixVersions: [
      ...new Set(
        [(core.getInput('fix-version') ?? '').split(','), (core.getInput('fix-versions') ?? '').split(',')].map((x) =>
          x.map((y) => y?.trim() ?? '').filter((z) => z && z !== ''),
        ),
      ),
    ],
    replaceFixVersions: core.getBooleanInput('replace-fix-versions'),
    jiraConfig,
  };
}

exec();
