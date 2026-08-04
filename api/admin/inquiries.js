import { requireSession } from '../../lib/guard.js';
import { listInquiries } from '../../lib/db.js';

export default async function handler(req, res) {
  if (!requireSession(req, res)) return;
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false });
    return;
  }
  try {
    const items = await listInquiries(req.query.status);
    res.status(200).json({ ok: true, items });
  } catch (error) {
    console.error('목록 조회 실패', error);
    res.status(500).json({ ok: false });
  }
}
