/* eslint-disable no-unused-vars,unicorn/consistent-function-scoping */
const fetch = require('node-fetch');

module.exports =
  (serviceName) =>
  async (_state, apiMethod = 'unknown') => {
    const state = { ..._state };

    const response = await fetch(state.req.url, state.req);

    state.res = {
      headers: response.headers.raw(),
      status: response.status,
    };

    state.res.body = await response.text();

    const isJSON = (response.headers.get('content-type') || '').includes('application/json');

    if (isJSON && state.res.body) {
      state.res.body = JSON.parse(state.res.body);
    }

    if (!response.ok) {
      throw new Error(response.statusText);
    }

    return state;
  };
/* eslint-enable no-unused-vars,unicorn/consistent-function-scoping */
