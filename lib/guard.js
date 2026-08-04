// 로그인 시도 제한과 관리자 API 접근 검사.
import { verifySession, readCookie } from './auth.js';

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

export function isLocked(state, now = Date.now()) {
  if (!state?.locked_until) return false;
  return new Date(state.locked_until).getTime() > now;
}

export function lockUntil(failCount, now = Date.now()) {
  if (failCount < MAX_FAILURES) return null;
  return new Date(now + LOCK_MINUTES * 60000).toISOString();
}

// 세션이 없으면 401 응답까지 처리하고 false 를 돌려준다.
export function requireSession(req, res) {
  const token = readCookie(req.headers.cookie);
  if (verifySession(token, process.env.SESSION_SECRET)) return true;
  res.status(401).json({ ok: false, error: 'unauthorized' });
  return false;
}
