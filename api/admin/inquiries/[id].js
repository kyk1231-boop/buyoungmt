import { requireSession } from '../../../lib/guard.js';
import { updateInquiry, deleteInquiry } from '../../../lib/db.js';
import { isValidStatus, isValidHandler } from '../../../lib/validate.js';
import { readJson } from '../../../lib/http.js';

export default async function handler(req, res) {
  if (!requireSession(req, res)) return;

  const { id } = req.query;

  if (req.method === 'DELETE') {
    try {
      const removed = await deleteInquiry(id);
      if (!removed || removed.length === 0) {
        res.status(404).json({ ok: false, error: 'not_found' });
        return;
      }
      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('삭제 실패', error);
      res.status(500).json({ ok: false });
    }
    return;
  }

  if (req.method === 'PATCH') {
    const body = await readJson(req);
    const patch = {};

    if (body.status !== undefined) {
      if (!isValidStatus(body.status)) {
        res.status(400).json({ ok: false, error: 'status' });
        return;
      }
      patch.status = body.status;
    }

    if (body.handler !== undefined) {
      const handler = body.handler === '' ? null : body.handler;
      if (!isValidHandler(handler)) {
        res.status(400).json({ ok: false, error: 'handler' });
        return;
      }
      patch.handler = handler;
    }

    if (!Object.keys(patch).length) {
      res.status(400).json({ ok: false, error: 'empty' });
      return;
    }

    try {
      const item = await updateInquiry(id, patch);
      if (!item) {
        res.status(404).json({ ok: false, error: 'not_found' });
        return;
      }
      res.status(200).json({ ok: true, item });
    } catch (error) {
      console.error('수정 실패', error);
      res.status(500).json({ ok: false });
    }
    return;
  }

  res.status(405).json({ ok: false });
}
