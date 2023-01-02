
export interface JiraConfig {
  baseUrl: string;
  token: string;
  email: string;
  transitionId?: string;
  project?: string;
  issuetype?: string;
  summary?: string;
  description?: string;
  issue?: string;
  string?: string;
}
export interface Args {
  token: string;
  string: string;
  headRef?: string;
  baseRef?: string;
  projects?: string;
  projectsIgnore?: string;
  includeMergeMessages: boolean;
  ignoreCommits: boolean;
  failOnError: boolean;
  octokit?: import('@broadshield/github-actions-octokit-hydrated').OctokitInstance;
  from: string;
  GitHubIssues:boolean;
  GitHubMilestones:boolean;
  returns: string;
  jiraConfig: JiraConfig;
  updatePRTitle:boolean;
  transitionChain: string;
  transitionOnNewBranch: string;
  transitionOnPrOpen: string;
  transitionOnPrMerge: string;
  transitionOnPrApproval: string;
  gist_private:boolean;
  gist_name: string;
  jiraTransition: string;
  fixVersions: string[];
  replaceFixVersions: boolean;
  updatePRTitle: boolean;
}

export interface RefRange {
  headRef: string;
  baseRef: string;
}

export interface LoadIssueDataInterface {
  [key: string]: string | boolean | Jira | undefined;
  jira?: Jira;
  forceReload?: boolean;
}
