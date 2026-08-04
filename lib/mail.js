// 접수 알림 메일. Resend REST API 를 fetch 로 호출한다.

function or(value, fallback) {
  return value && String(value).trim() ? value : fallback;
}

export function buildNotification(inquiry) {
  // 배포 초기에는 도메인이 아직 연결되지 않아 *.vercel.app 임시 주소로 뜬다.
  // 환경변수는 호출 시점에 읽어야 배포 환경이 바뀌어도 즉시 반영된다.
  const siteUrl = or(process.env.SITE_URL, 'https://buyoungmt.com');
  const adminUrl = `${siteUrl}/admin`;
  const received = new Date(inquiry.created_at).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
  });
  const text = [
    '[부영미트 홈페이지 견적 요청]',
    '',
    `접수 시각: ${received}`,
    `업체명: ${inquiry.company}`,
    `업종: ${or(inquiry.business_type, '미선택')}`,
    `담당자: ${inquiry.contact_name}`,
    `연락처: ${inquiry.phone}`,
    `관심 부위: ${inquiry.cuts?.length ? inquiry.cuts.join(', ') : '미선택'}`,
    `월 예상 물량: ${or(inquiry.volume, '미선택')}`,
    `희망 포장: ${or(inquiry.packing, '미선택')}`,
    `손질 요청: ${or(inquiry.trim_request, '미입력')}`,
    `배송 지역: ${or(inquiry.region, '미입력')}`,
    `샘플 신청: ${inquiry.sample ? '예' : '아니오'}`,
    '',
    '요청 사항:',
    or(inquiry.message, '(없음)'),
    '',
    `관리자 페이지: ${adminUrl}`,
  ].join('\n');

  return { subject: `[견적요청] ${inquiry.company}`, text };
}

export async function sendNotification(inquiry) {
  const { subject, text } = buildNotification(inquiry);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: process.env.NOTIFY_EMAILS.split(',').map((s) => s.trim()),
      subject,
      text,
    }),
  });
  if (!res.ok) throw new Error(`메일 발송 실패 ${res.status}: ${await res.text()}`);
}
