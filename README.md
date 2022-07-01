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

> **Only supports Jira Cloud. Does not support Jira Server (hosted)**

## Usage

> **Note: this action requires [Jira Login Action](https://github.com/marketplace/actions/jira-login)**

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

- `description` - Provide jsonpath for the GitHub event to extract issue from
- `string` - Provide a string to extract issue key from
- `from` - Find from predefined place (should be either 'branch', or 'commits')

### Outputs

- `issue` - Key of the found issue

### Reads fields from config file at $HOME/jira/config.yml

- None

### Writes fields to config file at $HOME/jira/config.yml

- `issue` - a key of a found issue

### Writes fields to CLI config file at $HOME/.jira.d/config.yml

- `issue` - a key of a found issue
