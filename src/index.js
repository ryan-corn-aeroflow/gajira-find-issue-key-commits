import _ from 'lodash';
import * as YAML from 'yaml';
import {
  context,
  getBooleanInput,
  getStringInput,
  logger,
  setFailed,
} from '@broadshield/github-actions-core-typed-inputs';
import Action from './action';
import * as fsHelper from './lib/fs-helper';

const cliConfigPath = `${process.env.HOME}/.jira.d/config.yml`;
const configPath = `${process.env.HOME}/jira/config.yml`;
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
 * Write the issue key to the config file
 * @param {Array<JiraIssueObject>} result
 * @returns {Promise<void>}
 */
export async function writeKey(result) {
  if (result.length === 0) {
    return;
  }
  const issue = result[0];
  logger.debug(`Detected issueKey: ${issue.key}`);
  logger.debug(`Saving ${issue.key} to ${cliConfigPath}`);
  logger.debug(`Saving ${issue.key} to ${configPath}`);

  fsHelper.mkdir(configPath);
  fsHelper.mkdir(cliConfigPath);
  try {
    // Expose created issue's key as an output
    if (fsHelper.existsSync(configPath)) {
      const _config = YAML.parse(fsHelper.loadFileSync(configPath));
      const yamledResult = YAML.stringify(issue);
      const extendedConfig = { ..._config, ...issue };

      fsHelper.writeFileSync(configPath, YAML.stringify(extendedConfig));

      fsHelper.appendFileSync(cliConfigPath, yamledResult);
    }
  } catch (error) {
    logger.debug(error);
  }
}

/**
 * @returns {Promise<void>}
 */
export const exec = async () => {
  try {
    let configFromFile = {};
    try {
      if (fsHelper.existsSync(configPath)) {
        configFromFile = YAML.parse(fsHelper.loadFileSync(configPath));
      }
    } catch (error) {
      logger.debug(`Error finding/parsing config file: ${error}, moving on`);
    }

    const argv = parseArguments(configFromFile);
    const config = {
      baseUrl: argv?.jiraConfig?.baseUrl,
      token: argv?.jiraConfig?.token,
      email: argv?.jiraConfig?.email,
      string: argv?.string,
    };
    const result = await new Action({
      context,
      argv,
      config,
    }).execute();
    await writeKey(result);
  } catch (error) {
    setFailed(error);
  }
};

export function concatStringList(providedString1, providedString2) {
  const stringArray = [..._.split(_.trim(providedString1), ','), ..._.split(_.trim(providedString2), ',')].flatMap(
    (f) => (f && f.length > 0 ? [f] : []),
  );
  return [...new Set(stringArray)];
}
export function parseArguments(providedJiraConfig) {
  const fromList = ['string', 'commits', 'pull_request', 'branch'];
  const jiraConfig = {
    baseUrl: '',
    token: '',
    email: '',
  };
  jiraConfig.baseUrl = process.env.JIRA_BASE_URL ?? providedJiraConfig?.baseUrl ?? getStringInput('jira_base_url');
  if (!jiraConfig.baseUrl) {
    throw new Error('JIRA_BASE_URL env not defined, or supplied as action input jira_base_url');
  }
  jiraConfig.token = process.env.JIRA_API_TOKEN ?? providedJiraConfig?.token ?? getStringInput('jira_api_token');
  if (!jiraConfig.token) {
    throw new Error('JIRA_API_TOKEN env not defined, or supplied as action input jira_api_token');
  }
  jiraConfig.email = process.env.JIRA_USER_EMAIL ?? providedJiraConfig?.email ?? getStringInput('jira_user_email');
  if (!jiraConfig.email) {
    throw new Error('JIRA_USER_EMAIL env not defined, or supplied as action input jira_user_email');
  }

  return {
    string: getStringInput('string'),
    from: _.includes(fromList, getStringInput('from')) ? getStringInput('from') : 'commits',
    headRef: getStringInput('head-ref'),
    baseRef: getStringInput('base-ref'),
    includeMergeMessages: getBooleanInput('include-merge-messages'),
    GitHubIssues: getBooleanInput('generate-github-issues'),
    GitHubMilestones: getBooleanInput('generate-github-milestones'),
    returns: getStringInput('returns', 'first'),
    updatePRTitle: getBooleanInput('standardize-pr-title'),
    transitionChain: getStringInput('jira-transition-chain'),
    transitionOnNewBranch: getStringInput('jira-transition-on-new-branch'),
    transitionOnPrOpen: getStringInput('jira-transition-on-pr-open'),
    transitionOnPrApproval: getStringInput('jira-transition-on-pr-approval'),
    transitionOnPrMerge: getStringInput('jira-transition-on-pr-merge'),
    gist_private: getBooleanInput('gist-private'),
    gist_name: getStringInput('create-gist-output-named'),
    jiraTransition: getStringInput('jira-transition'),

    fixVersions: [concatStringList(getStringInput('fix-versions'), getStringInput('fix-version'))],
    replaceFixVersions: getBooleanInput('replace-fix-versions'),
    jiraConfig,
  };
}

exec().catch((error) => {
  setFailed(error);
});
