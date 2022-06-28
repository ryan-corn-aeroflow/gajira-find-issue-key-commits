import * as core from '@actions/core';
import * as github from '@actions/github';
import * as path from 'node:path';

import { parseArgs } from '../src';
import Action from '../src/action';
import * as fsHelper from '../src/lib/fs-helper';
import { githubEvent, loadEnv } from './config/constants';
const originalGitHubWorkspace = process.env.GITHUB_WORKSPACE;
const gitHubWorkspace = path.resolve('/checkout-tests/workspace');
// Shallow clone original @actions/github context
const originalContext = { ...github.context };

describe('validate that jira variables exist', () => {
  let issueKey, owner, repo;
  beforeEach(() => {
    jest.setTimeout(50_000);
    loadEnv();
    issueKey = process.env.TEST_ISSUE_KEY ?? 'UNICORN-1';
    [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
    // Mock error/warning/info/debug
    jest.spyOn(core, 'error').mockImplementation(console.log);
    jest.spyOn(core, 'warning').mockImplementation(console.log);
    jest.spyOn(core, 'info').mockImplementation(console.log);
    jest.spyOn(core, 'debug').mockImplementation(console.log);
    jest.spyOn(core, 'notice').mockImplementation(console.log);
    jest.spyOn(core, 'getBooleanInput').mockImplementation((name) => {
      const regMatTrue = /(true|True|TRUE)/;
      const regMatFalse = /(false|False|FALSE)/;
      const inputValue = process.env[`INPUT_${name.toUpperCase()}`] || 'false';
      if (regMatTrue.test(inputValue)) {
        return true;
      } else if (regMatFalse.test(inputValue)) {
        return false;
      }
      // eslint-disable-next-line security/detect-object-injection
      throw new Error(`
      JEST: TypeError: Input does not meet YAML 1.2 "Core Schema" specification: ${name}
      Support boolean input list: true | True | TRUE | false | False | FALSE
    `);
    });
    // Mock github context
    jest.spyOn(github.context, 'repo', 'get').mockImplementation(() => {
      return {
        owner,
        repo,
      };
    });

    github.context.ref = `refs/heads/${issueKey}`;
    github.context.sha = '1234567890123456789012345678901234567890';

    // Mock ./fs-helper directoryExistsSync()
    jest.spyOn(fsHelper, 'directoryExistsSync').mockImplementation((fspath) => fspath === gitHubWorkspace);

    // GitHub workspace
    process.env['GITHUB_WORKSPACE'] = gitHubWorkspace;
  });

  afterAll(() => {
    // Restore GitHub workspace
    process.env.GITHUB_WORKSPACE = undefined;
    if (originalGitHubWorkspace) {
      process.env.GITHUB_WORKSPACE = originalGitHubWorkspace;
    }

    // Restore @actions/github context
    github.context.ref = originalContext.ref;
    github.context.sha = originalContext.sha;

    // Restore
    jest.restoreAllMocks();
  });

  it('check for Jira Environment Variables', () => {
    expect.hasAssertions();
    const argv = parseArgs();
    expect(argv.jiraConfig).toBeTruthy();
    const { baseUrl, email, token } = argv.jiraConfig;
    expect(baseUrl).toBeTruthy();
    expect(email).toBeTruthy();
    expect(token).toBeTruthy();
  });

  it('jira Base Url includes HTTPS', () => {
    expect.hasAssertions();
    const argv = parseArgs();
    expect(argv.jiraConfig).toBeTruthy();
    const { baseUrl } = argv.jiraConfig;
    expect(baseUrl.slice(0, 5)).toBe('https');
  });

  it('gets a Jira Issue', async () => {
    expect.hasAssertions();
    const argv = parseArgs();
    expect(argv.string).toContain(issueKey);
    const j = new Action({ context: githubEvent, argv, config: argv.jiraConfig });
    const result = await j.getIssue(issueKey);
    expect(result.key).toBe(issueKey);
  });
});
