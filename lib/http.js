// 서버리스 핸들러에서 공통으로 쓰는 짧은 헬퍼들.

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// Vercel 은 클라이언트가 보낸 요청의 x-forwarded-for 헤더를 서버 측에서 원래 접속 주소로 덮어쓴다.
// 따라서 지금 배포 대상(Vercel)에서는 이 값을 신뢰할 수 있다.
//
// 주의: 이 신뢰는 다음 조건이 유지될 때만 유효하다:
// - Vercel 배포 환경에서 실행되거나
// - 앞단에 신뢰할 수 있는 리버스 프록시(예: Nginx, 로드 밸런서)가 있거나
//
// 다른 호스팅이나 프록시 없이 동작하면, 클라이언트가 헤더를 직접 조작해
// 로그인 실패 횟수 잠금(rate limit)을 우회할 수 있다.
export function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (!forwarded) return 'unknown';
  const ip = String(forwarded).split(',')[0].trim();
  return ip || 'unknown';
}
