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
    // 401 은 "당신이 누구인지 모른다"는 뜻이다. 여기는 세션은 유효하고
    // (requireSession 통과) 현재 비밀번호 입력값만 틀린 경우이므로
    // "당신이 누구인지는 알지만 이 요청은 거절한다"는 403 이 맞다.
    // 401 로 응답하면 api() 헬퍼가 로그인 화면으로 튕겨내 오타 한 번에
    // 비밀번호 변경을 포기하게 만든다.
    res.status(403).json({ ok: false, error: 'invalid_current' });
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
