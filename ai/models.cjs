const profiles = Object.freeze({
  fast: Object.freeze({ model: 'gpt-6-luna', reasoningEffort: 'low', label: '快速 · Luna' }),
  precise: Object.freeze({ model: 'gpt-6.1-sol', reasoningEffort: 'low', label: '精细 · Sol' }),
});
function resolveProfile(id = 'fast') {
  if (!Object.hasOwn(profiles, id)) throw Error('AI 模型选项无效');
  return profiles[id];
}
module.exports = { profiles, resolveProfile };
