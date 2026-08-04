import { clearedCookie } from '../../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Set-Cookie', clearedCookie());
  res.status(200).json({ ok: true });
}
