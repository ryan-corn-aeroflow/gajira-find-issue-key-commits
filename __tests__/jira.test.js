import * as core from '@actions/core';
import * as github from '@actions/github';
import _ from 'lodash';
import * as path from 'node:path';
import { parseArguments } from '../src';

import Action from '../src/action';
import * as fsHelper from '../src/lib/fs-helper';
import { githubEvent, loadEnvironment } from './config/constants';

const originalGitHubWorkspace = process.env.GITHUB_WORKSPACE;
const gitHubWorkspace = path.resolve('/checkout-tests/workspace');
// Shallow clone original @actions/github context
const originalContext = { ...github.context };

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
    jest.spyOn(core, 'error').mockImplementation(console.log);
    jest.spyOn(core, 'warning').mockImplementation(console.log);
    jest.spyOn(core, 'info').mockImplementation(console.log);
    jest.spyOn(core, 'debug').mockImplementation(console.log);
    jest.spyOn(core, 'notice').mockImplementation(console.log);
    jest.spyOn(core, 'getBooleanInput').mockImplementation((name) => {
      const regMatTrue = /(true|True|TRUE)/;
      const regMatFalse = /(false|False|FALSE)/;
      const inputValue = process.env[`INPUT_${_.toUpper(name)}`] || 'false';
      if (regMatTrue.test(inputValue)) {
        return true;
      }
      if (regMatFalse.test(inputValue)) {
        return false;
      }
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
    process.env.GITHUB_WORKSPACE = gitHubWorkspace;
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
});
