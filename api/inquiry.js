import { validateInquiry } from '../lib/validate.js';
import { insertInquiry } from '../lib/db.js';
import { sendNotification } from '../lib/mail.js';
import { readJson } from '../lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false });
    return;
  }

  const body = await readJson(req);
  const result = validateInquiry(body);

  // 함정 칸이 채워졌으면 확실한 봇이다. 조용히 성공으로 응답한다.
  // 실패를 알려주면 어디를 고쳐야 하는지 가르쳐 주는 셈이 된다.
  if (!result.ok && result.errors.includes('spam')) {
    console.warn('봇 차단: 함정 칸이 채워짐');
    res.status(200).json({ ok: true });
    return;
  }

  // 너무 빠른 제출은 사람일 수도 있다(전송 실패 후 재시도 등).
  // 성공으로 응답하면 문의가 조용히 사라지므로 실패를 알린다.
  if (!result.ok && result.errors.includes('too_fast')) {
    console.warn('빠른 제출 거부: 경과 ' + Number(body.elapsedMs) + 'ms');
    res.status(400).json({ ok: false, errors: result.errors });
    return;
  }

  if (!result.ok) {
    res.status(400).json({ ok: false, errors: result.errors });
    return;
  }

  let saved;
  try {
    saved = await insertInquiry(result.value);
  } catch (error) {
    console.error('접수 저장 실패', error);
    res.status(500).json({ ok: false, errors: ['save_failed'] });
    return;
  }

  // 저장이 끝났으면 방문자에게는 성공이다.
  // 메일이 안 가더라도 문의 자체를 잃지 않는 것이 우선이다.
  try {
    await sendNotification(saved);
  } catch (error) {
    console.error('알림 메일 실패', error);
  }

  res.status(200).json({ ok: true });
}
