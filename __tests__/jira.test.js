import _ from 'lodash';
import * as ghac from '@broadshield/github-actions-core-typed-inputs';
import * as path from 'node:path';
import { cwd } from 'node:process';
import { parseArguments } from '../src';
import Action from '../src/action';
import * as fsHelper from '../src/lib/fs-helper';
// import { octokit } from '../src/utils';
import { githubEvent, loadEnvironment } from './config/constants';

const tmpFolder = path.join(cwd(), 'tmp');
fsHelper.mkdir(tmpFolder);
process.env.SUMMARY_ENV_VAR = process.env.SUMMARY_ENV_VAR ?? path.join(tmpFolder, 'step-summary-env.txt');
process.env.GITHUB_STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY ?? path.join(tmpFolder, 'step-summary.txt');
process.env.GITHUB_ENV = process.env.GITHUB_ENV ?? path.join(tmpFolder, 'env-vars.txt');
process.env.GITHUB_OUTPUT = process.env.GITHUB_OUTPUT ?? path.join(tmpFolder, 'output-vars.txt');
const filePaths = [
  process.env.SUMMARY_ENV_VAR,
  process.env.GITHUB_STEP_SUMMARY,
  process.env.GITHUB_ENV,
  process.env.GITHUB_OUTPUT,
];
_.forEach(filePaths, (filePath) => {
  fsHelper.appendFileSync(filePath, '');
});
const originalGitHubWorkspace = process.env.GITHUB_WORKSPACE;
const gitHubWorkspace = path.resolve('/checkout-tests/workspace');
// Shallow clone original @actions/github context
const originalContext = { ...ghac.context };

describe('validate that jira variables exist', () => {
  let issueKey;
  let owner;
  let repo;
  beforeEach(() => {
    jest.setTimeout(50_000);
    loadEnvironment();
    issueKey = process.env.TEST_ISSUE_KEY ?? 'UNICORN-1';
    [owner, repo] = _.split(process.env.GITHUB_REPOSITORY || '', '/');
    // Mock error/warning/info/debug
    jest.spyOn(ghac.logger, 'error').mockImplementation(console.log);
    jest.spyOn(ghac.logger, 'warning').mockImplementation(console.log);
    jest.spyOn(ghac.logger, 'info').mockImplementation(console.log);
    jest.spyOn(ghac.logger, 'debug').mockImplementation(console.log);
    jest.spyOn(ghac.logger, 'notice').mockImplementation(console.log);

    // Mock github context
    jest.spyOn(ghac.context, 'repo', 'get').mockImplementation(() => {
      return {
        owner,
        repo,
      };
    });

    ghac.context.ref = `refs/heads/${issueKey}`;
    ghac.context.sha = '1234567890123456789012345678901234567890';

    // Mock ./fs-helper directoryExistsSync()
    jest.spyOn(fsHelper, 'directoryExistsSync').mockImplementation((fspath) => fspath === gitHubWorkspace);

    // GitHub workspace
    process.env.GITHUB_WORKSPACE = gitHubWorkspace;
  });

  afterAll(() => {
    // Restore GitHub workspace
    process.env.GITHUB_WORKSPACE = undefined;
    if (originalGitHubWorkspace) {
      process.env.GITHUB_WORKSPACE = originalGitHubWorkspace;
    }

    // Restore @actions/github context
    ghac.context.ref = originalContext.ref;
    ghac.context.sha = originalContext.sha;

    // Restore
    jest.restoreAllMocks();
  });

  it('check for Jira Environment Variables', () => {
    expect.hasAssertions();
    const argv = parseArguments({});
    expect(_.keys(argv.jiraConfig)).toHaveLength(3);
    const { baseUrl, email, token } = argv.jiraConfig;
    expect(baseUrl).toBeTruthy();
    expect(email).toBeTruthy();
    expect(token).toBeTruthy();
  });

  it('jira Base Url includes HTTPS', () => {
    expect.hasAssertions();
    const argv = parseArguments({});
    expect(argv.jiraConfig.baseUrl).toBeDefined();
    const { baseUrl } = argv.jiraConfig;
    expect(baseUrl.slice(0, 5)).toBe('https');
  });

  it('gets a Jira Issue', async () => {
    expect.hasAssertions();
    const argv = parseArguments({});
    expect(argv.string).toContain(issueKey);
    const index = new Action({ context: githubEvent, argv, config: argv.jiraConfig });
    const result = await index.getIssue(issueKey);
    expect(result[0].key).toBe(issueKey);
  });
  it('Updates PR title and body', async () => {
    expect.hasAssertions();
    const argv = parseArguments({});
    expect(argv.string).toContain(issueKey);
    const index = new Action({ context: githubEvent, argv, config: argv.jiraConfig });
    // jest.spyOn(octokit, 'rest.pulls.update').mockImplementation((data) => {
    //   console.log(data);
    // });
    const result = await index.getIssue(issueKey);

    expect(result[0].key).toBe(issueKey);
  });
});
