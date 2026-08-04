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

// Vercel 은 원래 접속 IP 를 이 헤더에 넣는다.
export function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (!forwarded) return 'unknown';
  return String(forwarded).split(',')[0].trim();
}
