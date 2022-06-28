
const { get } = require('lodash');

const serviceName = 'jira';
const { format } = require('url');
const client = require('./client')(serviceName);

const APPLICATION_JSON = 'application/json'
const CONTENT_TYPE = 'Content-Type'
class Jira {
  constructor({ baseUrl, token, email }) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.email = email;
  }

  async createIssue(body, version = '2') {
    return this.fetch(
      'createIssue',
      { pathname: `/rest/api/${version}/issue` },
      { method: 'POST', body }
    );
  }

  async getIssue(issueId, query = {}, version = '2') {
    const { fields = [], expand = [] } = query;

    try {
      return this.fetch('getIssue', {
        pathname: `/rest/api/${version}/issue/${issueId}`,
        query: {
          fields: fields.join(','),
          expand: expand.join(','),
        },
      });
    } catch (error) {
      if (get(error, 'res.status') === 404) {
        return {};
      }

      throw error;
    }
  }

  async getIssueTransitions(issueId, version = '2') {
    return this.fetch(
      'getIssueTransitions',
      {
        pathname: `/rest/api/${version}/issue/${issueId}/transitions`,
      },
      {
        method: 'GET',
      }
    );
  }

  async transitionIssue(issueId, data, version = '3') {
    return this.fetch(
      'transitionIssue',
      {
        pathname: `/rest/api/${version}/issue/${issueId}/transitions`,
      },
      {
        method: 'POST',
        body: data,
      }
    );
  }

  /* eslint-disable no-param-reassign */
  async fetch(
    apiMethodName,
    { host, pathname, query },
    { method, body, headers = {} } = {}
  ) {
    const url = format({
      host: host || this.baseUrl,
      pathname,
      query,
    });

    if (!method) {
      method = 'GET';
    }

    if (headers[CONTENT_TYPE] === undefined) {
      headers[CONTENT_TYPE] = APPLICATION_JSON;
    }

    if (headers.Accept === undefined) {
      headers.Accept = APPLICATION_JSON;
    }

    if (headers.Authorization === undefined) {
      const authStr = Buffer.from(`${this.email}:${this.token}`).toString('base64');
      headers.Authorization = `Basic ${authStr}`;
    }

    // strong check for undefined
    // cause body variable can be 'false' boolean value
    if (body && headers[CONTENT_TYPE] === APPLICATION_JSON) {
      body = JSON.stringify(body);
    }

    const state = {
      req: {
        method,
        headers,
        body,
        url,
      },
    };

    try {
      await client(state, `${serviceName}:${apiMethodName}`);
    } catch (error) {
      const fields = {
        originError: error,
        source: 'jira',
      };

      delete state.req.headers;

      throw Object.assign(new Error(`Jira API error: ${error}`), state, fields);
    }

    return state.res.body;
  }
}
/* eslint-enable no-param-reassign */

module.exports = Jira;
