import _ from 'lodash';
import { logger } from '@broadshield/github-actions-core-typed-inputs';

export default class JiraMarkupToMarkdown {
  /**
   * Takes Jira markup and converts it to Markdown.
   *
   * @param {string} inputText - Jira markup text
   * @returns {string} - Markdown formatted text
   */
  static toM(inputText) {
    let input = _.replace(
      inputText,
      /^h([0-6])\.(.*)$/gm,
      (match, level, content) => _.join(_.fill(new Array(Number.parseInt(level, 10) + 1), ''), '#') + content,
    );

    input = _.replace(input, /([*_])(.*)\1/g, (match, wrapper, content) => {
      const to = wrapper === '*' ? '**' : '*';

      return to + content + to;
    });

    input = _.replace(input, /{{([^}]+)}}/g, '`$1`');
    input = _.replace(input, /\?\?((?:.[^?]|[^?].)+)\?\?/g, '<cite>$1</cite>');
    input = _.replace(input, /\+([^+]*)\+/g, '<ins>$1</ins>');
    input = _.replace(input, /\^([^^]*)\^/g, '<sup>$1</sup>');
    input = _.replace(input, /~([^~]*)~/g, '<sub>$1</sub>');
    input = _.replace(input, /-([^-]*)-/g, '-$1-');

    input = _.replace(input, /{code(:([a-z]+))?}([^]*){code}/gm, '```$2$3```');

    input = _.replace(input, /\[(.+?)\|(.+)]/g, '[$1]($2)');
    input = _.replace(input, /\[(.+?)]([^(]*)/g, '<$1>$2');

    input = _.replace(input, /{noformat}/g, '```');

    // Convert header rows of tables by splitting input on lines
    const lines = _.split(input, /\r?\n/gm);

    for (let index = 0; index < lines.length; index++) {
      const line_content = lines[index];

      const separators = line_content.match(/\|\|/g);

      if (separators) {
        lines[index] = _.replace(lines[index], /\|\|/g, '|');
        logger.debug(_.toString(separators));

        // Add a new line to mark the header in Markdown,
        // we require that at least 3 -'s are between each |
        let header_line = '';

        for (let index_ = 0; index_ < separators.length - 1; index_++) {
          header_line += '|---';
        }

        header_line += '|';

        lines.splice(index + 1, 0, header_line);
      }
    }

    // Join the split lines back
    return lines.join('\n');
  }

  /**
   * Takes Markdown and converts it to Jira formatted text
   *
   * @param {string} inputText
   * @returns {string}
   */
  static toJ(inputText) {
    // remove sections that shouldn't be recursively processed
    const START = 'J2MBLOCKPLACEHOLDER';
    const replacementsList = [];
    let counter = 0;

    let input = _.replace(inputText, /`{3,}(\w+)?([\n.]+?)`{3,}/g, (match, synt, content) => {
      let code = '{code';

      if (synt) {
        code += `:${synt}`;
      }

      code += `}${content}{code}`;
      const key = `${START + counter++}%%`;

      replacementsList.push({ key, value: code });

      return key;
    });

    input = _.replace(input, /`([^`]+)`/g, (match, content) => {
      const code = `{{${content}}}`;
      const key = `${START + counter++}%%`;

      replacementsList.push({ key, value: code });

      return key;
    });

    input = _.replace(input, /`([^`]+)`/g, '{{$1}}');

    input = _.replace(
      input,
      /^(.*?)\n([=-])+$/gm,
      (match, content, level) => `h${level[0] === '=' ? 1 : 2}. ${content}`,
    );

    input = _.replace(input, /^(#+)(.*?)$/gm, (match, level, content) => `h${level.length}.${content}`);

    input = _.replace(input, /([*_]+)(.*?)\1/g, (match, wrapper, content) => {
      const to = wrapper.length === 1 ? '_' : '*';

      return to + content + to;
    });
    // Make multi-level bulleted lists work
    input = _.replace(input, /^(\s*)- (.*)$/gm, (match, level, content) => {
      let length = 2;

      if (_.isString(level) && level.length > 0) {
        length = level.length / 4 + 2;
      }
      const bar = _.fill(new Array(length), '-');
      return `${bar} ${content}`;
    });

    const map = {
      cite: '??',
      del: '-',
      ins: '+',
      sup: '^',
      sub: '~',
    };

    input = _.replace(input, new RegExp(`<(${_.join(_.keys(map), '|')})>(.*?)</\\1>`, 'g'), (match, from, content) => {
      // logger.debug(from);
      const to = map[from];

      return to + content + to;
    });

    input = _.replace(input, /~~(.*?)~~/g, '-$1-');
    input = _.replace(input, /\[([^\]]+)]\(([^)]+)\)/g, '[$1|$2]');
    input = _.replace(input, /<([^>]+)>/g, '[$1]');

    // restore extracted sections
    for (const subSt of _.keys(replacementsList)) {
      const sub = replacementsList[subSt];
      input = _.replace(input, sub.key, sub.value);
    }

    // Convert header rows of tables by splitting input on lines
    const lines = _.split(input, /\r?\n/gm);

    for (let index = 0; index < lines.length; index++) {
      const line_content = lines[index];

      if (/\|---/g.test(line_content)) {
        lines[index - 1] = _.replace(lines[index - 1], /\|/g, '||');
        lines.splice(index, 1);
      }
    }

    // Join the split lines back
    return lines.join('\n');
  }
}
