// Supabase 에 PostgREST 로 접근한다. 서버에서만 쓴다.
import { STATUSES } from './validate.js';

function endpoint(path) {
  return `${process.env.SUPABASE_URL}/rest/v1${path}`;
}

function headers(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function request(path, options = {}) {
  const res = await fetch(endpoint(path), {
    ...options,
    headers: headers(options.headers),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`DB ${res.status}: ${body}`);
  return body ? JSON.parse(body) : null;
}

// 목록 조회 경로를 만든다. 알 수 없는 상태값은 조건에서 뺀다.
export function buildQuery(status) {
  const base = '/inquiries?select=*&order=created_at.desc';
  if (!status || status === 'all' || !STATUSES.includes(status)) return base;
  return `${base}&status=eq.${status}`;
}

export async function insertInquiry(row) {
  const [saved] = await request('/inquiries', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  return saved;
}

export async function listInquiries(status) {
  return request(buildQuery(status));
}

export async function updateInquiry(id, patch) {
  const [saved] = await request(`/inquiries?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  return saved;
}

export async function deleteInquiry(id) {
  await request(`/inquiries?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getPasswordHash() {
  const rows = await request('/admin_settings?select=password_hash&id=eq.1');
  return rows?.[0]?.password_hash ?? null;
}

export async function setPasswordHash(hash) {
  await request('/admin_settings', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: 1, password_hash: hash, updated_at: new Date().toISOString() }),
  });
}

export async function getLoginState(ip) {
  const rows = await request(`/login_attempts?select=*&ip=eq.${encodeURIComponent(ip)}`);
  return rows?.[0] ?? null;
}

export async function recordLoginFailure(ip, lockedUntil) {
  const current = await getLoginState(ip);
  await request('/login_attempts', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      ip,
      fail_count: (current?.fail_count ?? 0) + 1,
      locked_until: lockedUntil,
      updated_at: new Date().toISOString(),
    }),
  });
}

export async function clearLoginFailures(ip) {
  await request(`/login_attempts?ip=eq.${encodeURIComponent(ip)}`, { method: 'DELETE' });
}
