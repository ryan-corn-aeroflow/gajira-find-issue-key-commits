const fs = require('fs')
const YAML = require('yaml')
const core = require('@actions/core')

const cliConfigPath = `${process.env.HOME}/.jira.d/config.yml`
const configPath = `${process.env.HOME}/jira/config.yml`
const Action = require('./action')

// eslint-disable-next-line import/no-dynamic-require
const githubEvent = require(process.env.GITHUB_EVENT_PATH)
const config = YAML.parse(fs.readFileSync(configPath, 'utf8'))

async function writeKey(result) {
  console.log(`Detected issueKey: ${result.issue}`)
  console.log(`Saving ${result.issue} to ${cliConfigPath}`)
  console.log(`Saving ${result.issue} to ${configPath}`)

  // Expose created issue's key as an output


  const yamledResult = YAML.stringify(result)
  const extendedConfig = Object.assign({}, config, result)


  fs.writeFileSync(configPath, YAML.stringify(extendedConfig))

  return fs.appendFileSync(cliConfigPath, yamledResult)
}

async function exec() {
  try {
    const result = await new Action({
      githubEvent,
      argv: parseArgs(),
      config,
    }).execute()

    if (result) {
      if (Array.isArray(result)) {

        let outputIssues = new Array()

        for (const item of result) {
          await writeKey(item)
          outputIssues.push(item.issue)
        }

        core.setOutput('issues', outputIssues.join(','))
        return
        
      } else {

        core.setOutput('issue', result.issue)
        return await writeKey(result)

      }
    }

    console.log('No issue keys found.')
  } catch (error) {
    core.setFailed(error.toString())
  }
}

function parseArgs() {
  return {
    string: core.getInput('string') || config.string,
    from: core.getInput('from'),
    github_token: core.getInput('github-token'),
    head_ref: core.getInput('head-ref'),
    base_ref: core.getInput('base-ref'),
    gist_private: core.getInput('gist-private') && core.getInput('gist-private') == 'true' ? true : false,
    gist_name: core.getInput('create-gist-output-named'),
  }
}

exec()
