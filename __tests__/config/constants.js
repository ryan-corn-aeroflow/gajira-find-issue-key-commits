export function loadEnv() {
  process.env['INPUT_INCLUDE-MERGE-MESSAGES'] = 'false';
  process.env['INPUT_GENERATE-GITHUB-MILESTONES'] = 'true';
  process.env['INPUT_GENERATE-GITHUB-ISSUES'] = 'true';
  process.env['INPUT_STANDARDIZE-PR-TITLE'] = 'true';
  process.env['INPUT_JIRA-TRANSITION-CHAIN'] = '';
  process.env['INPUT_FIX-VERSIONS'] = '';
  process.env['INPUT_REPLACE-FIX-VERSIONS'] = 'true';
  process.env['INPUT_GIST-PRIVATE'] = 'true';
  process.env['GITHUB_REPOSITORY'] = 'Broadshield/gajira-find-issue-key';
  process.env['TEST_ISSUE_KEY'] = 'UNICORN-9744';
  process.env['INPUT_STRING'] = 'There is an Issue in here UNICORN-9744 ok';
  process.env['INPUT_FROM'] = 'commits';
  process.env['INPUT_HEAD-REF'] = 'dev';
  process.env['INPUT_BASE-REF'] = 'dev';
  process.env['INPUT_REPO'] = 'Broadshield/gajira-find-issue-key';
  process.env['INPUT_RETURNS'] = 'all';
}
export const projectKey = 'UNICORN';

export const issuetypeName = 'Task';
export const argv = {
  project: projectKey,
  issuetype: issuetypeName,
  summary: 'GAJIRA This is a summary ref/head/blah',
  description: 'This is a description ref/head/blah',
  fields: '{"customfield_10027":{"value":"API"},"fixVersions":[{"name":"2.16.0 - API"}] }',
};

export const githubEvent = {};
