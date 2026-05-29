// SmallCode — web-research prompt advertisement (issue #58, part 3)
//
// Small models trust the prose tool list in the system prompt over the raw
// `tools` array. When SMALLCODE_WEB_BROWSE=true they must be told the web
// tools exist, otherwise they refuse research tasks. These tests pin the
// behaviour of model_client.js buildSystemPrompt().

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { buildSystemPrompt } = require('../bin/model_client');

function baseCtx() {
  return {
    config: { model: { name: 'test-model', baseUrl: 'http://localhost:1234/v1', provider: 'openai' } },
    conversationHistory: [{ role: 'user', content: 'look up the latest node release' }],
    currentTaskType: 'coding',
    // No memory/skill/plugin context for these tests.
    memoryStore: null,
    skillManager: null,
    pluginLoader: null,
  };
}

test('web tools are advertised when SMALLCODE_WEB_BROWSE=true', () => {
  const prev = process.env.SMALLCODE_WEB_BROWSE;
  process.env.SMALLCODE_WEB_BROWSE = 'true';
  try {
    const prompt = buildSystemPrompt(baseCtx());
    assert.match(prompt, /WEB RESEARCH/);
    assert.match(prompt, /web_search/);
    assert.match(prompt, /web_fetch/);
  } finally {
    if (prev === undefined) delete process.env.SMALLCODE_WEB_BROWSE;
    else process.env.SMALLCODE_WEB_BROWSE = prev;
  }
});

test('web tools are NOT advertised when SMALLCODE_WEB_BROWSE is unset', () => {
  const prev = process.env.SMALLCODE_WEB_BROWSE;
  delete process.env.SMALLCODE_WEB_BROWSE;
  try {
    const prompt = buildSystemPrompt(baseCtx());
    assert.doesNotMatch(prompt, /WEB RESEARCH/);
  } finally {
    if (prev !== undefined) process.env.SMALLCODE_WEB_BROWSE = prev;
  }
});

test('web tools are NOT advertised when SMALLCODE_WEB_BROWSE=false', () => {
  const prev = process.env.SMALLCODE_WEB_BROWSE;
  process.env.SMALLCODE_WEB_BROWSE = 'false';
  try {
    const prompt = buildSystemPrompt(baseCtx());
    assert.doesNotMatch(prompt, /WEB RESEARCH/);
  } finally {
    if (prev === undefined) delete process.env.SMALLCODE_WEB_BROWSE;
    else process.env.SMALLCODE_WEB_BROWSE = prev;
  }
});
