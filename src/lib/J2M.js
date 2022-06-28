

const core = require('@actions/core')

module.exports = class {
  /**
 * Takes Jira markup and converts it to Markdown.
 *
 * @param {string} input - Jira markup text
 * @returns {string} - Markdown formatted text
 */
  toM (inputText) {
    let input = inputText.replace(/^h([0-6])\.(.*)$/gm, (_match, level, content) => Array.from({length: parseInt(level, 10) + 1}).join('#') + content)

    input = input.replace(/([*_])(.*)\1/g, (_match, wrapper, content) => {
      const to = (wrapper === '*') ? '**' : '*'

      return to + content + to
    })

    input = input.replace(/{{([^}]+)}}/g, '`$1`')
    input = input.replace(/\?\?((?:.[^?]|[^?].)+)\?\?/g, '<cite>$1</cite>')
    input = input.replace(/\+([^+]*)\+/g, '<ins>$1</ins>')
    input = input.replace(/\^([^^]*)\^/g, '<sup>$1</sup>')
    input = input.replace(/~([^~]*)~/g, '<sub>$1</sub>')
    input = input.replace(/-([^-]*)-/g, '-$1-')

    input = input.replace(/{code(:([a-z]+))?}([^]*){code}/gm, '```$2$3```')

    input = input.replace(/\[(.+?)\|(.+)]/g, '[$1]($2)')
    input = input.replace(/\[(.+?)]([^(]*)/g, '<$1>$2')

    input = input.replace(/{noformat}/g, '```')

    // Convert header rows of tables by splitting input on lines
    const lines = input.split(/\r?\n/gm)

    for (let i = 0; i < lines.length; i += 1) {
      // eslint-disable-next-line camelcase
      const lineContent = lines[i]

      const separators = lineContent.match(/\|\|/g)

      if (separators != null) {
        lines[i] = lines[i].replace(/\|\|/g, '|')
        core.debug(separators)

        // Add a new line to mark the header in Markdown,
        // we require that at least 3 -'s are between each |
        let headerLine = ''

        for (let j = 0; j < separators.length - 1; j += 1) {
          headerLine += '|---'
        }

        headerLine += '|'

        lines.splice(i + 1, 0, headerLine)
      }
    }

    // Join the split lines back
    input = ''
    lines.forEach(line => {
      input += `${line}\n`
    })

    return input
  }

  /**
       * Takes Markdown and converts it to Jira formatted text
       *
       * @param {string} input
       * @returns {string}
       */
  toJ (inputText) {
    // remove sections that shouldn't be recursively processed
    const START = 'J2MBLOCKPLACEHOLDER'
    const replacementsList = []
    let counter = 0

    let input = inputText.replace(/`{3,}(\w+)?([\n.]+?)`{3,}/g, (_match, synt, content) => {
      let code = '{code'

      if (synt) {
        code += `:${synt}`
      }

      code += `}${content}{code}`
      counter += 1
      const key = `${START + counter}%%`

      replacementsList.push({ key, value: code })

      return key
    })

    input = input.replace(/`([^`]+)`/g, (_match, content) => {
      const code = `{{${content}}}`
      counter += 1
      const key = `${START + counter}%%`

      replacementsList.push({ key, value: code })

      return key
    })

    input = input.replace(/`([^`]+)`/g, '{{$1}}')

    input = input.replace(/^(.*?)\n([=-])+$/gm, (_match, content, level) => `h${level[0] === '=' ? 1 : 2}. ${content}`)

    input = input.replace(/^(#+)(.*?)$/gm, (_match, level, content) => `h${level.length}.${content}`)

    input = input.replace(/([*_]+)(.*?)\1/g, (_match, wrapper, content) => {
      const to = (wrapper.length === 1) ? '_' : '*'

      return to + content + to
    })
    // Make multi-level bulleted lists work
    input = input.replace(/^(\s*)- (.*)$/gm, (_match, level, content) => {
      let len = 2

      if (level.length > 0) {
        len = parseInt(level.length / 4, 10) + 2
      }

      return `${'-'.repeat(len)} ${content}`
    })

    const map = {
      cite: '??',
      del: '-',
      ins: '+',
      sup: '^',
      sub: '~',
    }

    input = input.replace(new RegExp(`<(${Object.keys(map).join('|')})>(.*?)</\\1>`, 'g'), (_match, from, content) => {
      const to = map[from]

      return to + content + to
    })

    input = input.replace(/~~(.*?)~~/g, '-$1-')

    input = input.replace(/\[([^\]]+)]\(([^)]+)\)/g, '[$1|$2]')
    input = input.replace(/<([^>]+)>/g, '[$1]')

    // restore extracted sections
    replacementsList.forEach((sub) => {
      input = input.replace(sub.key, sub.value)
    })

    // Convert header rows of tables by splitting input on lines
    const lines = input.split(/\r?\n/gm)

    for (let i = 0; i < lines.length; i += 1) {
      const lineContent = lines[i]

      if (lineContent.match(/\|---/g) != null) {
        lines[i - 1] = lines[i - 1].replace(/\|/g, '||')
        lines.splice(i, 1)
      }
    }

    // Join the split lines back
    input = ''
    lines.forEach(line => {
      input += `${line}\n`
    })

    return input
  }
}
