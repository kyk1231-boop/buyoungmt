import { requireSession } from '../../lib/guard.js';
import { getPasswordHash, setPasswordHash } from '../../lib/db.js';
import { verifyPassword, hashPassword } from '../../lib/auth.js';
import { readJson } from '../../lib/http.js';

const MIN_LENGTH = 8;

export default async function handler(req, res) {
  if (!requireSession(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false });
    return;
  }

  const { current, next } = await readJson(req);
  const stored = await getPasswordHash();

  if (!stored || !verifyPassword(String(current ?? ''), stored)) {
    res.status(401).json({ ok: false, error: 'invalid_current' });
    return;
  }

  if (typeof next !== 'string' || next.length < MIN_LENGTH) {
    res.status(400).json({ ok: false, error: 'too_short' });
    return;
  }

  try {
    await setPasswordHash(hashPassword(next));
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('비밀번호 변경 실패', error);
    res.status(500).json({ ok: false });
  }
}
