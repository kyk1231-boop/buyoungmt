// 견적 폼 입력을 검증하고 저장할 형태로 정리한다. 서버에서만 쓴다.

export const STATUSES = ['new', 'contacted', 'quoted', 'closed'];
export const HANDLERS = ['배명운 대표이사', '김유경 상무'];

// 사람이 폼을 채우는 데 걸리는 최소 시간. 이보다 빠르면 자동 입력으로 본다.
const MIN_FILL_SECONDS = 3;

function text(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

export function validateInquiry(body, { now = Date.now() } = {}) {
  const errors = [];

  // 사람에게 보이지 않는 칸이다. 채워져 있으면 봇이 작성한 것이다.
  if (text(body.website, 100)) errors.push('spam');

  const elapsed = (now - Number(body.startedAt)) / 1000;
  if (!Number.isFinite(elapsed) || elapsed < MIN_FILL_SECONDS) errors.push('too_fast');

  const company = text(body.company, 100);
  const contactName = text(body.name, 50);
  const phone = text(body.phone, 30);

  if (!company) errors.push('company');
  if (!contactName) errors.push('name');
  if (!/^[0-9+\-\s()]{9,20}$/.test(phone)) errors.push('phone');
  if (body.agree !== true) errors.push('agree');

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      company,
      business_type: text(body.type, 50),
      contact_name: contactName,
      phone,
      cuts: Array.isArray(body.cuts)
        ? body.cuts.map((c) => text(c, 30)).filter(Boolean).slice(0, 10)
        : [],
      volume: text(body.volume, 50),
      packing: text(body.packing, 50),
      trim_request: text(body.trim, 300),
      region: text(body.region, 100),
      message: text(body.message, 2000),
      sample: body.sample === true,
      agreed_at: new Date(now).toISOString(),
    },
  };
}

export function isValidStatus(status) {
  return STATUSES.includes(status);
}

export function isValidHandler(handler) {
  return handler === null || HANDLERS.includes(handler);
}
