import * as core from '@actions/core';
import * as github from '@actions/github';
import { graphql } from '@octokit/graphql';

export const GetStartAndEndPoints = `
query getStartAndEndPoints($owner: String!, $repo: String!, $headRef: String!,$baseRef: String!) {
  repository(owner: $owner, name: $repo) {
    endPoint: ref(qualifiedName: $headRef) {
      ...internalBranchContent
    }
    startPoint: ref(qualifiedName: $baseRef) {
      ...internalBranchContent
    }
  }
}

fragment internalBranchContent on Ref {
  target {
    ... on Commit {
      history(first: 1) {
        edges {
          node {
            committedDate
          }
        }
      }
    }
  }
}
`;
export const listCommitMessagesInPullRequest = `
query listCommitMessagesInPullRequest($owner: String!, $repo: String!, $prNumber: Int!, $after: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
      baseRef {
        name
      }
      headRef {
        name
      }
      commits(first: 100, after: $after) {
        nodes {
          commit {
            message
          }
        }
        pageInfo {
          startCursor
          hasNextPage
          endCursor
        }
      }
    }
  }
}
`;

export function undefinedOnEmpty(value) {
  if (!value || value === '') {
    return;
  }
  return value;
}
export const githubToken =
  undefinedOnEmpty(core.getInput('github_token', { required: false })) ??
  undefinedOnEmpty(core.getInput('github-token', { required: false })) ??
  undefinedOnEmpty(core.getInput('token', { required: false })) ??
  process.env.GITHUB_TOKEN ??
  'NO_TOKEN';
export const graphqlWithAuth = graphql.defaults({
  headers: {
    authorization: `token ${githubToken}`,
  },
});
export const octokit = github.getOctokit(githubToken);

export const { context } = github;
export async function getPreviousReleaseRef(octo) {
  if (!context.repo || !octo) {
    return;
  }
  const releases = await octo.rest.repos.getLatestRelease({
    ...context.repo,
  });

  const { tag_name } = releases.payload;

  return tag_name;
}

export function upperCaseFirst(str) {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1));
}

export const issueIdRegEx = /([\dA-Za-z]+-\d+)/g;

export const startJiraToken = 'JIRA-ISSUE-TEXT-START';
export const endJiraToken = 'JIRA-ISSUE-TEXT-END';

export const eventTemplates = {
  branch: '{{event.ref}}',
  commits: "{{event.commits.map(c=>c.message).join(' ')}}",
};

export function assignJiraTransition(_context, _argv) {
  if (_context.eventName === 'pull_request') {
    if (_context.payload.action in ['closed'] && _context.payload.pull_request.merged === 'true') {
      return _argv.transitionOnPrMerge;
    }
    if (_context.payload.action in ['opened']) {
      return _argv.transitionOnPrOpen;
    }
  } else if (_context.eventName === 'pull_request_review') {
    if (_context.payload.state === 'APPROVED') {
      return _argv.transitionOnPrApproval;
    }
  } else if (_context.eventName in ['create']) {
    return _argv.transitionOnNewBranch;
  }
}

export function assignRefs(_githubEvent, _context, _argv) {
  let headRef;
  let baseRef;
  if (Object.prototype.hasOwnProperty.call(_githubEvent, 'pull_request')) {
    headRef = _githubEvent.pull_request.head.ref || null;
    baseRef = _githubEvent.pull_request.base.ref || null;
  } else if (Object.prototype.hasOwnProperty.call(_githubEvent, 'ref')) {
    headRef = _githubEvent.ref || null;
    baseRef = null;
  }
  if (_context.eventName === 'pull_request') {
    headRef = headRef || _context.payload.pull_request.head.ref || null;
    baseRef = baseRef || _context.payload.pull_request.base.ref || null;
  } else if (_context.eventName === 'push') {
    if (_context.payload.ref.startsWith('refs/tags')) {
      baseRef = baseRef || getPreviousReleaseRef(github);
    }
    headRef = headRef || _context.payload.ref || null;
  }
  headRef = _argv.headRef || headRef || null;
  baseRef = _argv.baseRef || baseRef || null;
  return { headRef, baseRef };
}
