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
 * @typedef {Object} IssueArguments
 * @property {string} projectKey
 * @property {string} [issuetypeName]
 * @property {string} [fields]
 * @property {string} [description]
 * @property {string} summary
 */
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

export * from './action-error';
export * from './fs-helper';
export * from './jira-issue-object';
export * from './jira';
