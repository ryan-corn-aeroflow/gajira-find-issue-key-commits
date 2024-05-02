import ansiColors from 'ansi-colors';
import _ from 'lodash';
import { logger } from '@broadshield/github-actions-core-typed-inputs';

/** @typedef {NodeJS.ErrnoException | Error | string | object | undefined | null | number | unknown} additionalErrorArgumentType */
/** @typedef {'debug' | 'info' | 'warning' | 'notice' | 'error'} LogLevel */
/** @typedef {{ [key in LogLevel]: boolean }} LogLevels */
/** @typedef {Object} JsonHighlightInterface */
const kIsNodeError = Symbol('kIsNodeError');
/**
 * A typeguarded version of `instanceof Error` for NodeJS.
 * @author Joseph JDBar Barron
 * @link https://dev.to/jdbar
 * @template {new (...arguments_: any) => Error} T
 * @param {any} value
 * @param {T} errorType
 * @returns {boolean}
 */
export function instanceOfNodeError(value, errorType) {
  return value instanceof errorType;
}

/** @extends Error */
export default class ActionError extends Error {
  /** @static
   * @default []
   */
  static errors = [];

  /** @static
   * @default ansiColors.create()
   */
  static style = ansiColors.create();

  /** @static
   * @param {Error | unknown} error
   * @returns {ActionError}
   */
  static from(error) {
    if (error instanceof ActionError) {
      return error;
    }
    return new ActionError(`Unhandled Error:`, error);
  }

  /** @static
   * @returns {string[]}
   */
  static getErrorMessagesArray() {
    return ActionError.errors;
  }

  /** @static
   * @returns {void}
   */
  static logErrorMessagesArray() {
    for (const error of ActionError.errors) {
      logger.error(`⛔️ ${ActionError.style.red(error)}`);
    }
  }

  /** @static
   * @param {string | object | number} providedJson
   * @returns {string}
   */
  static prettyString(providedJson) {
    const jsonHighlight = {
      number: ActionError.style.yellow,
      string: ActionError.style.green,
      boolean: ActionError.style.cyanBright,
      null: ActionError.style.bold.cyanBright,
      key: ActionError.style.bold.cyan,
    };
    let json = JSON.stringify(providedJson, undefined, 2);
    json = _.replace(json, /&/g, '&amp;');
    json = _.replace(json, /</g, '&lt;');
    json = _.replace(json, />/g, '&gt;');
    return _.replace(
      json,
      /("(\\u[\dA-Za-z]{4}|\\[^u]|[^"\\])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[Ee][+-]?\d+)?)/g,
      (match) => {
        let typeKey = 'number';
        if (_.startsWith(match, '"')) {
          typeKey = _.endsWith(match, ':') ? 'key' : 'string';
        } else if (/(true|false)/.test(match)) {
          typeKey = 'boolean';
        } else if (_.includes(match, 'null')) {
          typeKey = 'null';
        }
        return jsonHighlight[typeKey](match);
      },
    );
  }

  constructor(message, ...arguments_) {
    super(message);
    // 👇️ because we are extending a built-in class
    Object.setPrototypeOf(this, ActionError.prototype);
    ActionError.errors.push(message);
    this.parseExtraArgs(...arguments_);
  }

  /**
   * @param {additionalErrorArgumentType[]} arguments_
   * @returns {void}
   */
  parseExtraArgs(...arguments_) {
    if (arguments_.length === 0) {
      return;
    }
    if (!this.stack) {
      this.stack = '';
    }
    for (const argument of arguments_) {
      if (_.isError(argument)) {
        let errorString = '';
        if (kIsNodeError in argument) {
          /** @type NodeJS.ErrnoException */
          const error = argument;
          errorString = `${error.name} [${error.code}]: ${error.message}`;
        } else {
          const error = argument;
          errorString = error.toString();
        }
        this.stack += ActionError.prettyString({
          message: errorString,
          stack: argument.stack ? _.split(argument.stack, '\n') : undefined,
        });
      } else if (_.isString(argument)) {
        this.stack += `\n${argument}`;
      } else if (_.isObject(argument)) {
        this.stack += `\n${JSON.stringify(argument, undefined, 2)}`;
      } else if (_.isNumber(argument)) {
        this.stack += `\n${argument}`;
      } else if (_.isUndefined(argument)) {
        this.stack += `\nundefined`;
      }
    }
  }

  /** @returns {string} */
  getError() {
    return `${this.getErrorMessage()}\n${this.getErrorStack()}`;
  }

  /** @returns {void} */
  logError() {
    this.logErrorMessage();
    this.logErrorStack();
  }

  /** @returns {string} */
  getErrorMessage() {
    return `${this.message}`;
  }

  /** @returns {string} */
  getErrorStack() {
    return this.stack || '';
  }

  /** @returns {void} */
  logErrorStack() {
    if (this.stack) {
      logger.error(this.stack);
    }
  }

  /** @returns {void} */
  logErrorMessage() {
    logger.error(`⛔️ ${ActionError.style.red(this.getErrorMessage())}`);
  }

  /** @returns {string} */
  toString() {
    return this.getError();
  }
}
