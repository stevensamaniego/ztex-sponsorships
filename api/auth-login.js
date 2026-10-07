const { msConfig, beginLogin, createFlowCookie, sendPage, notConfiguredPage } = require('../lib/approver');

// GET /api/auth/login?returnTo=/api/action?... — start Microsoft sign-in.
// No `prompt` parameter, so an existing M365 browser session signs in silently.
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  const config = msConfig();
  if (!config) return sendPage(res, notConfiguredPage());

  const { url, flow } = beginLogin(config, (req.query || {}).returnTo);
  res.setHeader('Set-Cookie', createFlowCookie(flow));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Location', url);
  return res.status(302).send('');
};
