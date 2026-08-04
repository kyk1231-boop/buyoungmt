import { clearedCookie } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false });
    return;
  }

  // 다른 관리자 API 와 달리 requireSession 을 넣지 않는다(의도적).
  // 세션이 이미 만료됐거나 무효한 사람도 브라우저에 남은 쿠키는 지울 수 있어야
  // 한다. 로그아웃까지 세션을 요구하면 만료된 세션을 가진 사람은 쿠키를
  // 영영 지우지 못하고 401 만 받게 된다.
  res.setHeader('Set-Cookie', clearedCookie());
  res.status(200).json({ ok: true });
}
