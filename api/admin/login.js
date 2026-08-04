import { verifyPassword, createSession, sessionCookie } from '../../lib/auth.js';
import { getPasswordHash, getLoginState, recordLoginFailure, clearLoginFailures } from '../../lib/db.js';
import { isLocked, lockUntil } from '../../lib/guard.js';
import { readJson, clientIp } from '../../lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false });
    return;
  }

  const ip = clientIp(req);
  const state = await getLoginState(ip);
  if (isLocked(state)) {
    res.status(429).json({ ok: false, error: 'locked' });
    return;
  }

  const { password } = await readJson(req);
  const stored = await getPasswordHash();

  if (!stored || !password || !verifyPassword(String(password), stored)) {
    await recordLoginFailure(ip, lockUntil((state?.fail_count ?? 0) + 1));
    res.status(401).json({ ok: false, error: 'invalid' });
    return;
  }

  await clearLoginFailures(ip);
  res.setHeader('Set-Cookie', sessionCookie(createSession(process.env.SESSION_SECRET)));
  res.status(200).json({ ok: true });
}
