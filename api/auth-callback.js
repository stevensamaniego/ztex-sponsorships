const {
  msConfig, parseCookies, readFlow, clearFlowCookie, createSessionCookie, safeReturnTo,
  redeemCode, validateIdToken, safeEqual, messagePage, sendPage, notConfiguredPage
} = require('../lib/approver');

// GET /api/auth/callback — Microsoft redirects here with ?code&state (or ?error).
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  const config = msConfig();
  if (!config) return sendPage(res, notConfiguredPage());

  const query = req.query || {};
  const flow = readFlow(parseCookies(req));
  // The flow cookie is single-use: clear it whatever happens next
  res.setHeader('Set-Cookie', clearFlowCookie());

  if (query.error) {
    console.error('Sign-in error from Microsoft:', query.error, query.error_description);
    return sendPage(res, messagePage('Sign-in didn\'t complete',
      'Microsoft sign-in was cancelled or failed. Please open the approve/deny link from the email again.', 401));
  }

  if (!flow || typeof query.state !== 'string' || !safeEqual(query.state, flow.state)) {
    return sendPage(res, messagePage('Sign-in expired',
      'This sign-in attempt expired or is invalid. Please open the approve/deny link from the email again.', 400));
  }
  if (typeof query.code !== 'string' || !query.code) {
    return sendPage(res, messagePage('Sign-in failed', 'Microsoft did not return a sign-in code. Please try again.', 400));
  }

  let identity;
  try {
    const idToken = await redeemCode(config, query.code, flow.verifier);
    identity = validateIdToken(config, idToken, flow.nonce);
  } catch (err) {
    console.error('Sign-in callback error:', err.message);
    return sendPage(res, messagePage('Sign-in failed',
      'We couldn\'t verify your Microsoft sign-in. Please open the approve/deny link from the email again.', 401));
  }

  res.setHeader('Set-Cookie', [clearFlowCookie(), createSessionCookie(identity.email, identity.name)]);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Location', safeReturnTo(flow.returnTo));
  return res.status(302).send('');
};
