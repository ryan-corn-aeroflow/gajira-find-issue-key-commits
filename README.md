# Jira Find Issue Key [2022]

## Changes in the 2022 release

### META CHANGES

- Configured to use [ACT](https://github.com/nektos/act) for testing github actions locally
- Build system now uses [esbuild](https://esbuild.github.io/) to a Node16 bundle
  - i.e. `yarn exec esbuild src/index.js --bundle --outdir=lib/ --platform=node --target=node16.10 --sourcemap --format=cjs`
- Action now uses the new [GitHub Node16 runtime](https://github.blog/changelog/2022-05-20-actions-can-now-run-in-a-node-js-16-runtime/)
- New Jest tests have been added (still more required)
- Added prettier, eslint and shellcheck to keep the formatting consistent

## Previous Details Below

Extract issue key from string

For examples on how to use this, check out the [gajira-demo](https://github.com/atlassian/gajira-demo) repository

> ~~**Only supports Jira Cloud. Does not support Jira Server (hosted)**~~
> Now supports Jira server, and GitHub enterprise

## Usage

> **Note: this action requires [Jira Login Action](https://github.com/marketplace/actions/jira-login)**

<!-- start usage -->

```yaml
- uses: Broadshield/gajira-find-issue-key@v2.1.1
  with:
    # Provide a string to extract issue key from
    string: ''

    # Find from predefined place. Can be 'branch', 'pull_request', 'string', or
    # 'commits', default is 'commits'
    # Default: commits
    from: ''

    # Options can be: 'first', or 'all'
    # This variable controls both how many results are returned, and how many results
    # are processed.
    # If the 'from' variable is 'pull_request', and this 'returns' variable is 'all',
    # then base-ref defaults to the pull_request.base.ref, and the head-ref defaults
    # to pull_request.head.ref from the github event.
    # NOTE: This action originally returned only the first Jira Ticket ID found. For
    # backwards compatibility the default is set to 'first'.
    # Default: first
    returns: ''

    # The Git Head Ref to which commit messages will be collected up to. If the
    # base-ref is included, and the github event is a pull_request or push, The
    # head-ref from the event will be used.
    head-ref: ''

    # The Git Base Ref to which commit messages will be collected up from. If the
    # base-ref is not included,
    base-ref: ''

    # Collects the Jira issue numbers from the Pull Request, and puts them at the
    # start of the PR title. Trims to 70 characters, i.e:
    #  MYISSUE-123, MYISSUE-124: Resolve callback error, and fix typo
    # Default: true
    standardize-pr-title: ''

    # When parsing commit messages, include merge and pull messages. This is disabled
    # by default, to exclude tickets that may be included or fixed in other branches
    # or pull requests.
    # Default: false
    include-merge-messages: ''

    # Create GitHub Milestones from the Jira Issue' sprints
    # Default: false
    generate-github-milestones: ''

    # When a Jira Issue is found, the existing list of GitHub issues is iterated
    # through, and if a GitHub issue starts with the Jira Issue Key, then the Github
    # Issue is updated with details from the Jira issue. If the Github issue doesn't
    # exist, the GitHub issue is created.
    # If 'generate-github-milestones' is 'true', then the GitHub issue is linked to
    # the milestone.
    # If this action is triggered through a pull_request event, then when the
    # pull_request is closed, and merged, the GitHub issues are also closed, by adding
    # 'Resolves #<IssueNumber>' syntax on the pull_request body
    # Default: false
    generate-github-issues: ''

    # A comma separated list of all allowed Jira Transitions in order
    jira-transition-chain: ''

    # The name of the transition to apply when a new branch is created
    jira-transition-on-new-branch: ''

    # The name of the transition to apply when a Pull Request is opened
    jira-transition-on-pr-open: ''

    # The name of the transition to apply when a Pull Request is approved
    jira-transition-on-pr-approval: ''

    # The name of the transition to apply when a Pull Request is closed and merged
    jira-transition-on-pr-merge: ''

    # The Jira Fix Versions that the Jira Issues found will be assigned.
    fix-version: ''

    # The Jira Fix Versions that the Jira Issues found will be assigned, as a comma
    # separated list. Use `NONE` to remove the Fix Version from the Jira Issue.
    fix-versions: ''

    # If 'true', then the Jira Fix Versions will be replaced with the 'fix-versions'
    # input. Otherwise it will combine the existing Fix Versions with the
    # 'fix-versions' input.
    # Default: true
    replace-fix-versions: ''

    # GitHub Token used for authentication
    github-token: ''

    # If 'true', then the Gist will be private. Otherwise it will be public.
    # Default: false
    gist-private: ''

    # Options can be: 'first', or 'all'
    # This variable controls both how many results are returned, and how many results
    # are processed.
    # If the 'from' variable is 'pull_request', and this 'returns' variable is 'all',
    # then base-ref defaults to the pull_request.base.ref, and the head-ref defaults
    # to pull_request.head.ref from the github event.
    # NOTE: This action originally returned only the first Jira Ticket ID found. For
    # backwards compatibility the default is set to 'first'.
    create-gist-output-named: ''

    # The Jira cloud base url including protocol i.e. 'https://company.atlassian.net'
    # or use environment variable JIRA_BASE_URL
    jira_base_url: ''

    # The Jira cloud user email address or use environment variable JIRA_USER_EMAIL
    jira_user_email: ''

    # The Jira cloud user api token or use environment variable JIRA_API_TOKEN
    jira_api_token: ''
```

<!-- end usage -->

## Examples

To find an issue key inside github event (branch):

```yaml
- name: Find in commit messages
  uses: atlassian/gajira-find-issue-key@master
  with:
    string: ${{ github.event.ref }}
```

Or do the same using shortcut `from`:

```yaml
- name: Find in commit messages
  uses: atlassian/gajira-find-issue-key@master
  with:
    from: branch
```

To find an issue key inside commit messages:

```yaml
- name: Find in commit messages
  uses: atlassian/gajira-find-issue-key@master
  with:
    string: ${{ github.event.ref }}
```

To find an issue key inside github event (branch):

```yaml
- name: Find in commit messages
  uses: atlassian/gajira-find-issue-key@master
  with:
    from: branch
```

To find an issue key inside commit messages:

```yaml
- name: Find in commit messages
  uses: atlassian/gajira-find-issue-key@master
  with:
    from: commits
```

---

## Action Spec

### Environment variables

- None

### Inputs

<!-- start inputs -->

| \***\*Input\*\***                               | \***\*Description\*\***                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | \***\*Default\*\***  | \***\*Required\*\*** |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | -------------------- |
| <code>**string**</code>                         | Provide a string to extract issue key from                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |                      | **false**            |
| <code>**from**</code>                           | Find from predefined place. Can be 'branch', 'pull_request', 'string', or 'commits', default is 'commits'                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | <code>commits</code> | **false**            |
| <code>**returns**</code>                        | Options can be: 'first', or 'all'<br />This variable controls both how many results are returned, and how many results are processed.<br />If the 'from' variable is 'pull_request', and this 'returns' variable is 'all', then base-ref defaults to the pull_request.base.ref, and the head-ref defaults to pull_request.head.ref from the github event.<br />NOTE: This action originally returned only the first Jira Ticket ID found. For backwards compatibility the default is set to 'first'.                                                                                                   | <code>first</code>   | **false**            |
| <code>**head-ref**</code>                       | The Git Head Ref to which commit messages will be collected up to. If the base-ref is included, and the github event is a pull_request or push, The head-ref from the event will be used.                                                                                                                                                                                                                                                                                                                                                                                                              |                      | **false**            |
| <code>**base-ref**</code>                       | The Git Base Ref to which commit messages will be collected up from. If the base-ref is not included,                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |                      | **false**            |
| <code>**standardize-pr-title**</code>           | Collects the Jira issue numbers from the Pull Request, and puts them at the start of the PR title. Trims to 70 characters, i.e:<br /> MYISSUE-123, MYISSUE-124: Resolve callback error, and fix typo                                                                                                                                                                                                                                                                                                                                                                                                   | <code>true</code>    | **false**            |
| <code>**include-merge-messages**</code>         | When parsing commit messages, include merge and pull messages. This is disabled by default, to exclude tickets that may be included or fixed in other branches or pull requests.                                                                                                                                                                                                                                                                                                                                                                                                                       |                      | **false**            |
| <code>**generate-github-milestones**</code>     | Create GitHub Milestones from the Jira Issue' sprints                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |                      | **false**            |
| <code>**generate-github-issues**</code>         | When a Jira Issue is found, the existing list of GitHub issues is iterated through, and if a GitHub issue starts with the Jira Issue Key, then the Github Issue is updated with details from the Jira issue. If the Github issue doesn't exist, the GitHub issue is created.<br />If 'generate-github-milestones' is 'true', then the GitHub issue is linked to the milestone.<br />If this action is triggered through a pull_request event, then when the pull_request is closed, and merged, the GitHub issues are also closed, by adding 'Resolves #<IssueNumber>' syntax on the pull_request body | <code>false</code>   | **false**            |
| <code>**jira-transition-chain**</code>          | A comma separated list of all allowed Jira Transitions in order                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |                      | **false**            |
| <code>**jira-transition-on-new-branch**</code>  | The name of the transition to apply when a new branch is created                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |                      | **false**            |
| <code>**jira-transition-on-pr-open**</code>     | The name of the transition to apply when a Pull Request is opened                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |                      | **false**            |
| <code>**jira-transition-on-pr-approval**</code> | The name of the transition to apply when a Pull Request is approved                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |                      | **false**            |
| <code>**jira-transition-on-pr-merge**</code>    | The name of the transition to apply when a Pull Request is closed and merged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |                      | **false**            |
| <code>**fix-version**</code>                    | The Jira Fix Versions that the Jira Issues found will be assigned.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |                      | **false**            |
| <code>**fix-versions**</code>                   | The Jira Fix Versions that the Jira Issues found will be assigned, as a comma separated list. Use <code>NONE</code> to remove the Fix Version from the Jira Issue.                                                                                                                                                                                                                                                                                                                                                                                                                                     |                      | **false**            |
| <code>**replace-fix-versions**</code>           | If 'true', then the Jira Fix Versions will be replaced with the 'fix-versions' input. Otherwise it will combine the existing Fix Versions with the 'fix-versions' input.                                                                                                                                                                                                                                                                                                                                                                                                                               | <code>true</code>    | **false**            |
| <code>**github-token**</code>                   | GitHub Token used for authentication                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |                      | **false**            |
| <code>**gist-private**</code>                   | If 'true', then the Gist will be private. Otherwise it will be public.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | <code>false</code>   | **false**            |
| <code>**create-gist-output-named**</code>       | Options can be: 'first', or 'all'<br />This variable controls both how many results are returned, and how many results are processed.<br />If the 'from' variable is 'pull_request', and this 'returns' variable is 'all', then base-ref defaults to the pull_request.base.ref, and the head-ref defaults to pull_request.head.ref from the github event.<br />NOTE: This action originally returned only the first Jira Ticket ID found. For backwards compatibility the default is set to 'first'.                                                                                                   |                      | **false**            |
| <code>**jira_base_url**</code>                  | The Jira cloud base url including protocol i.e. 'https://company.atlassian.net' or use environment variable JIRA_BASE_URL                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |                      | **false**            |
| <code>**jira_user_email**</code>                | The Jira cloud user email address or use environment variable JIRA_USER_EMAIL                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |                      | **false**            |
| <code>**jira_api_token**</code>                 | The Jira cloud user api token or use environment variable JIRA_API_TOKEN                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |                      | **false**            |

<!-- end inputs -->

### Outputs

<!-- start outputs -->

| \***\*Output\*\***         | \***\*Description\*\***                          |
| -------------------------- | ------------------------------------------------ |
| <code>**issue**</code>     | Key of the found issue                           |
| <code>**issues**</code>    | Keys of the found issues as comma separated list |
| <code>**gist-url**</code>  | The url to the generated Gist                    |
| <code>**gist-name**</code> | The name of the Gist created                     |

<!-- end outputs -->
<!-- start [.github/ghdocs/examples/] -->
<!-- end [.github/ghdocs/examples/] -->

### Reads fields from config file at $HOME/jira/config.yml

- None

### Writes fields to config file at $HOME/jira/config.yml

- `issue` - a key of a found issue

### Writes fields to CLI config file at $HOME/.jira.d/config.yml

- `issue` - a key of a found issue
