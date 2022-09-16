import * as core from '@actions/core';
import * as github from '@actions/github';
import { GitHub } from '@actions/github/lib/utils';
import { graphql } from '@octokit/graphql';
import { throttling } from '@octokit/plugin-throttling';
// eslint-disable-next-line lodash/import-scope
import _ from 'lodash';

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
const OctokitThrottling = GitHub.plugin(throttling);
export const octokit = new OctokitThrottling({
  auth: `${githubToken}`,
  throttle: {
    onRateLimit: (retryAfter, options, oKit) => {
      oKit.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`);

      if (options.request.retryCount === 0) {
        // only retries once
        oKit.log.info(`Retrying after ${retryAfter} seconds!`);
        return true;
      }
    },
    onSecondaryRateLimit: (_retryAfter, options, oKit) => {
      // does not retry, only logs a warning
      oKit.log.warn(`SecondaryRateLimit detected for request ${options.method} ${options.url}`);
    },
  },
});

export const { context } = github;
export async function getPreviousReleaseReference(octo) {
  if (!context.repo || !octo) {
    return;
  }
  const releases = await octo.rest.repos.getLatestRelease({
    ...context.repo,
  });

  const { tag_name } = releases.payload;

  return tag_name;
}

export function upperCaseFirst(string_) {
  return _.replace(string_, /\w\S*/g, (txt) => _.toUpper(txt.charAt(0)) + txt.slice(1));
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

export function assignReferences(_githubEvent, _context, _argv) {
  let headReference;
  let baseReference;
  if (Object.prototype.hasOwnProperty.call(_githubEvent, 'pull_request')) {
    headReference = _githubEvent.pull_request.head.ref || undefined;
    baseReference = _githubEvent.pull_request.base.ref || undefined;
  } else if (Object.prototype.hasOwnProperty.call(_githubEvent, 'ref')) {
    headReference = _githubEvent.ref || undefined;
    baseReference = undefined;
  }
  if (_context.eventName === 'pull_request') {
    headReference = headReference || _context.payload?.pull_request?.head?.ref || undefined;
    baseReference = baseReference || _context.payload?.pull_request?.base?.ref || undefined;
  } else if (_context.eventName === 'push') {
    if (_context.payload?.ref && _.startsWith(_context.payload.ref, 'refs/tags')) {
      baseReference = baseReference || getPreviousReleaseReference(github);
    }
    headReference = headReference || _context.payload.ref || undefined;
  }
  headReference = _argv.headRef || headReference || undefined;
  baseReference = _argv.baseRef || baseReference || undefined;
  return { headRef: headReference, baseRef: baseReference };
}
