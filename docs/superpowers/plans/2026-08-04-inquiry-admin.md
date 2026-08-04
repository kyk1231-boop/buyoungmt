# 견적문의 접수·관리 시스템 구현 계획 (1단계)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 견적 폼을 서버로 접수해 데이터베이스에 저장하고, 사장님 두 분에게 이메일로 알리며, `/admin`에서 문의 목록과 처리 상태를 관리한다.

**Architecture:** 기존 정적 HTML은 그대로 두고 Vercel 서버리스 함수(`api/`)를 얹는다. 순수 함수는 `lib/`에 두어 단위 테스트하고, 핸들러는 얇게 유지한다. 데이터베이스와 이메일은 표준 `fetch`로 REST 호출한다.

**Tech Stack:** Vercel (정적 + 서버리스 함수, Node 20 ESM) · Supabase Postgres 서울 리전 (PostgREST) · Resend (이메일) · Node 내장 `node:crypto`, `node:test`

설계 문서: `docs/superpowers/specs/2026-08-04-inquiry-admin-design.md`

## Global Constraints

- **npm 의존성 0개.** Node 내장 모듈과 `fetch`만 쓴다. 빌드 도구를 도입하지 않는다
- 테스트는 `npm test`(= `node --test`)로 돌린다. Node 24 에서는 `node --test tests/` 처럼 디렉터리를 인자로 주면 동작하지 않으므로 인자 없이 쓴다
- 개인정보는 Supabase 서울 리전에만 저장한다
- 브라우저에서 데이터베이스에 직접 접근하지 않는다. 서비스 키는 서버 환경변수에만 둔다
- 저장이 확인된 경우에만 방문자에게 완료를 표시한다
- 이메일 발송이 실패해도 저장이 성공했으면 방문자에게는 성공으로 응답한다
- `/api/admin/*`는 유효한 세션 없이 모두 거부한다
- 비밀번호를 평문으로 저장하거나 저장소·문서·로그에 남기지 않는다
- 상태값은 `new` / `contacted` / `quoted` / `closed` 네 가지
- 처리자값은 `배명운 대표이사` / `김유경 상무` 두 가지
- 색·서체는 기존 `assets/site.css`를 재사용한다
- 자동 삭제 기능을 만들지 않는다 (보유기간 무제한, 수동 삭제만)

---

### Task 1: 입력 검증 모듈

폼으로 들어온 값을 검증하고 저장 가능한 형태로 정리한다. 스팸 차단도 여기서 판정한다.

**Files:**
- Create: `package.json`
- Create: `lib/validate.js`
- Test: `tests/validate.test.js`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `validateInquiry(body, { now }) -> { ok: true, value: Row } | { ok: false, errors: string[] }`
  - `Row` = `{ company, business_type, contact_name, phone, cuts, volume, packing, trim_request, region, message, sample, agreed_at }`
  - `isValidStatus(status) -> boolean`
  - `isValidHandler(handler) -> boolean`
  - 상수 `STATUSES`, `HANDLERS`

- [ ] **Step 1: package.json 생성**

```json
{
  "name": "buyoungmt",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/validate.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateInquiry, isValidStatus, isValidHandler } from '../lib/validate.js';

const NOW = 1770000000000;

function form(extra = {}) {
  return {
    company: '하남상회',
    name: '홍길동',
    phone: '010-1234-5678',
    agree: true,
    startedAt: NOW - 10000,
    ...extra,
  };
}

test('필수값이 갖춰지면 통과하고 저장할 행을 만든다', () => {
  const result = validateInquiry(form({ cuts: ['삼겹살', '목살'], sample: true }), { now: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.value.company, '하남상회');
  assert.equal(result.value.contact_name, '홍길동');
  assert.deepEqual(result.value.cuts, ['삼겹살', '목살']);
  assert.equal(result.value.sample, true);
  assert.equal(result.value.agreed_at, new Date(NOW).toISOString());
});

test('업체명이 비면 거부한다', () => {
  const result = validateInquiry(form({ company: '   ' }), { now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('company'));
});

test('연락처 형식이 아니면 거부한다', () => {
  const result = validateInquiry(form({ phone: '전화주세요' }), { now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('phone'));
});

test('개인정보 동의가 없으면 거부한다', () => {
  const result = validateInquiry(form({ agree: false }), { now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('agree'));
});

test('함정 칸이 채워지면 스팸으로 본다', () => {
  const result = validateInquiry(form({ website: 'http://spam.example' }), { now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('spam'));
});

test('3초 안에 제출되면 봇으로 본다', () => {
  const result = validateInquiry(form({ startedAt: NOW - 500 }), { now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('too_fast'));
});

test('긴 입력은 잘라낸다', () => {
  const result = validateInquiry(form({ message: 'ㄱ'.repeat(5000) }), { now: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.value.message.length, 2000);
});

test('상태값과 처리자값을 검사한다', () => {
  assert.equal(isValidStatus('new'), true);
  assert.equal(isValidStatus('deleted'), false);
  assert.equal(isValidHandler('김유경 상무'), true);
  assert.equal(isValidHandler(null), true);
  assert.equal(isValidHandler('누구'), false);
});
```

- [ ] **Step 3: 테스트를 돌려 실패를 확인한다**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/validate.js'`

- [ ] **Step 4: 구현**

`lib/validate.js`:

```js
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
```

- [ ] **Step 5: 테스트를 돌려 통과를 확인한다**

Run: `npm test`
Expected: PASS — 8 tests

- [ ] **Step 6: 커밋**

```bash
git add package.json lib/validate.js tests/validate.test.js
git commit -m "feat: 견적 폼 입력 검증과 스팸 판정 모듈"
```

---

### Task 2: 데이터베이스 스키마와 접근 계층

Supabase에 테이블을 만들고, 서버에서 접근하는 함수를 둔다.

**Files:**
- Create: `db/schema.sql`
- Create: `lib/db.js`
- Test: `tests/db.test.js`

**Interfaces:**
- Consumes: Task 1의 `Row` 형태
- Produces:
  - `insertInquiry(row) -> Promise<Inquiry>`
  - `listInquiries(status) -> Promise<Inquiry[]>` — `status`가 `'all'`이거나 비면 전체
  - `updateInquiry(id, patch) -> Promise<Inquiry>`
  - `deleteInquiry(id) -> Promise<void>`
  - `getPasswordHash() -> Promise<string>`
  - `setPasswordHash(hash) -> Promise<void>`
  - `getLoginState(ip) -> Promise<{ fail_count, locked_until } | null>`
  - `recordLoginFailure(ip, lockedUntil) -> Promise<void>`
  - `clearLoginFailures(ip) -> Promise<void>`
  - `buildQuery(status) -> string` (테스트 대상인 순수 함수)

- [ ] **Step 1: 스키마 작성**

`db/schema.sql`:

```sql
-- (주)부영미트 견적문의 시스템 스키마
-- Supabase SQL Editor 에서 한 번 실행한다.

create extension if not exists "pgcrypto";

create table if not exists inquiries (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  status        text not null default 'new'
                check (status in ('new', 'contacted', 'quoted', 'closed')),
  handler       text,
  company       text not null,
  business_type text,
  contact_name  text not null,
  phone         text not null,
  cuts          text[] not null default '{}',
  volume        text,
  packing       text,
  trim_request  text,
  region        text,
  message       text,
  sample        boolean not null default false,
  agreed_at     timestamptz not null,
  updated_at    timestamptz not null default now()
);

create index if not exists inquiries_created_at_idx on inquiries (created_at desc);
create index if not exists inquiries_status_idx on inquiries (status);

-- 관리자 비밀번호 해시. 한 행만 존재한다.
create table if not exists admin_settings (
  id            int primary key default 1 check (id = 1),
  password_hash text not null,
  updated_at    timestamptz not null default now()
);

-- 로그인 실패 기록. 무차별 대입을 막는다.
create table if not exists login_attempts (
  ip           text primary key,
  fail_count   int not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);

-- 세 테이블 모두 공개 키로는 접근할 수 없게 잠근다.
-- 서버는 service_role 키를 쓰므로 이 제한을 받지 않는다.
alter table inquiries      enable row level security;
alter table admin_settings enable row level security;
alter table login_attempts enable row level security;
```

- [ ] **Step 2: Supabase 프로젝트 생성과 스키마 적용**

1. https://supabase.com 에 구글 계정 `kyk1231@gmail.com` 으로 로그인
2. New project — 이름 `buyoungmt`, **Region: Northeast Asia (Seoul)** 선택. 다른 리전을 고르면 개인정보가 국외에 저장되므로 반드시 확인한다
3. 프로젝트가 준비되면 SQL Editor 에서 `db/schema.sql` 내용을 붙여넣고 실행
4. Project Settings → API 에서 다음 두 값을 복사해 둔다
   - `Project URL` → 환경변수 `SUPABASE_URL`
   - `service_role` 키 → 환경변수 `SUPABASE_SERVICE_ROLE_KEY` (**이 키는 절대 브라우저나 저장소에 넣지 않는다**)

- [ ] **Step 3: 실패하는 테스트 작성**

`tests/db.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuery } from '../lib/db.js';

test('상태를 지정하지 않으면 전체를 최신순으로 조회한다', () => {
  assert.equal(buildQuery(), '/inquiries?select=*&order=created_at.desc');
  assert.equal(buildQuery('all'), '/inquiries?select=*&order=created_at.desc');
});

test('상태를 지정하면 조건을 붙인다', () => {
  assert.equal(buildQuery('new'), '/inquiries?select=*&order=created_at.desc&status=eq.new');
});

test('허용되지 않은 상태는 무시하고 전체를 조회한다', () => {
  assert.equal(buildQuery('; drop table'), '/inquiries?select=*&order=created_at.desc');
});
```

- [ ] **Step 4: 테스트를 돌려 실패를 확인한다**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/db.js'`

- [ ] **Step 5: 구현**

`lib/db.js`:

```js
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
```

- [ ] **Step 6: 테스트를 돌려 통과를 확인한다**

Run: `npm test`
Expected: PASS — 11 tests

- [ ] **Step 7: 커밋**

```bash
git add db/schema.sql lib/db.js tests/db.test.js
git commit -m "feat: Supabase 스키마와 데이터 접근 계층"
```

---

### Task 3: 인증 모듈

비밀번호 해시와 세션 쿠키를 다룬다. Node 기본 암호화 기능만 쓴다.

**Files:**
- Create: `lib/auth.js`
- Create: `scripts/hash-password.js`
- Test: `tests/auth.test.js`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `hashPassword(password) -> string` (형식 `scrypt$<salt>$<hash>`)
  - `verifyPassword(password, stored) -> boolean`
  - `createSession(secret, { now }) -> string`
  - `verifySession(token, secret, { now }) -> boolean`
  - `sessionCookie(token) -> string`
  - `clearedCookie() -> string`
  - `readCookie(header) -> string | null`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/auth.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword, verifyPassword,
  createSession, verifySession,
  sessionCookie, clearedCookie, readCookie,
} from '../lib/auth.js';

const SECRET = 'test-secret-value';
const NOW = 1770000000000;

test('해시는 평문을 담지 않고, 같은 비밀번호도 매번 다른 값이 된다', () => {
  const a = hashPassword('0000');
  const b = hashPassword('0000');
  assert.ok(!a.includes('0000'));
  assert.notEqual(a, b);
});

test('올바른 비밀번호만 통과한다', () => {
  const stored = hashPassword('correct-horse');
  assert.equal(verifyPassword('correct-horse', stored), true);
  assert.equal(verifyPassword('wrong', stored), false);
});

test('망가진 해시 값에는 예외 없이 false 를 준다', () => {
  assert.equal(verifyPassword('x', 'garbage'), false);
  assert.equal(verifyPassword('x', ''), false);
});

test('발급한 세션은 검증을 통과한다', () => {
  const token = createSession(SECRET, { now: NOW });
  assert.equal(verifySession(token, SECRET, { now: NOW }), true);
});

test('다른 비밀키로 만든 세션은 거부한다', () => {
  const token = createSession('other-secret', { now: NOW });
  assert.equal(verifySession(token, SECRET, { now: NOW }), false);
});

test('내용을 고친 세션은 거부한다', () => {
  const token = createSession(SECRET, { now: NOW });
  const tampered = `${Buffer.from('{"exp":9999999999999}').toString('base64url')}.${token.split('.')[1]}`;
  assert.equal(verifySession(tampered, SECRET, { now: NOW }), false);
});

test('30일이 지난 세션은 거부한다', () => {
  const token = createSession(SECRET, { now: NOW });
  assert.equal(verifySession(token, SECRET, { now: NOW + 31 * 86400000 }), false);
});

test('형식이 아닌 값은 거부한다', () => {
  assert.equal(verifySession(null, SECRET, { now: NOW }), false);
  assert.equal(verifySession('nodot', SECRET, { now: NOW }), false);
});

test('쿠키를 만들고 읽는다', () => {
  const cookie = sessionCookie('abc.def');
  assert.ok(cookie.includes('HttpOnly'));
  assert.ok(cookie.includes('Secure'));
  assert.ok(cookie.includes('SameSite=Lax'));
  assert.equal(readCookie('bym_session=abc.def; other=1'), 'abc.def');
  assert.equal(readCookie('other=1'), null);
  assert.equal(readCookie(undefined), null);
  assert.ok(clearedCookie().includes('Max-Age=0'));
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/auth.js'`

- [ ] **Step 3: 구현**

`lib/auth.js`:

```js
// 비밀번호 해시와 세션 쿠키. Node 내장 암호화만 쓴다.
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

const KEY_LENGTH = 64;
const SESSION_DAYS = 30;
const COOKIE_NAME = 'bym_session';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, KEY_LENGTH);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

function sign(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createSession(secret, { now = Date.now() } = {}) {
  const payload = Buffer.from(
    JSON.stringify({ exp: now + SESSION_DAYS * 86400000 }),
  ).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySession(token, secret, { now = Date.now() } = {}) {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, signature] = token.split('.');
  const expected = sign(payload, secret);
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof exp === 'number' && exp > now;
  } catch {
    return false;
  }
}

export function sessionCookie(token) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}`;
}

export function clearedCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function readCookie(header) {
  if (!header) return null;
  for (const part of String(header).split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE_NAME) return rest.join('=');
  }
  return null;
}
```

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

Run: `npm test`
Expected: PASS — 20 tests

- [ ] **Step 5: 해시 생성 스크립트 작성**

`scripts/hash-password.js`:

```js
// 초기 비밀번호의 해시를 만든다. 결과를 Supabase admin_settings 에 넣는다.
// 사용법: node scripts/hash-password.js '실제비밀번호'
import { hashPassword } from '../lib/auth.js';

const password = process.argv[2];
if (!password) {
  console.error("사용법: node scripts/hash-password.js '비밀번호'");
  process.exit(1);
}
console.log(hashPassword(password));
```

- [ ] **Step 6: 초기 비밀번호를 등록한다**

1. 터미널에서 실행 — **명령에 쓴 비밀번호는 터미널 기록에 남으므로, 실행 후 기록을 지우거나 가동 직후 비밀번호를 변경한다**

```bash
node scripts/hash-password.js '<사장님이 정한 초기 비밀번호>'
```

2. 출력된 `scrypt$...` 문자열을 복사해 Supabase SQL Editor 에서 실행

```sql
insert into admin_settings (id, password_hash)
values (1, '<복사한 해시 값>')
on conflict (id) do update set password_hash = excluded.password_hash;
```

- [ ] **Step 7: 커밋**

```bash
git add lib/auth.js scripts/hash-password.js tests/auth.test.js
git commit -m "feat: 비밀번호 해시와 세션 쿠키 처리"
```

---

### Task 4: 접수 API

폼 제출을 받아 저장하고 이메일로 알린다.

**Files:**
- Create: `lib/mail.js`
- Create: `lib/http.js`
- Create: `api/inquiry.js`
- Test: `tests/mail.test.js`

**Interfaces:**
- Consumes: `validateInquiry` (Task 1), `insertInquiry` (Task 2)
- Produces:
  - `buildNotification(inquiry) -> { subject, text }`
  - `sendNotification(inquiry) -> Promise<void>`
  - `readJson(req) -> Promise<object>`
  - `clientIp(req) -> string`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/mail.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNotification } from '../lib/mail.js';

const INQUIRY = {
  created_at: '2026-08-04T01:23:45.000Z',
  company: '하남상회',
  business_type: '식당',
  contact_name: '홍길동',
  phone: '010-1234-5678',
  cuts: ['삼겹살', '목살'],
  volume: '월 500kg',
  packing: '진공포장',
  trim_request: '겉지방 3mm',
  region: '경기 하남시',
  message: '주 2회 납품 희망합니다.',
  sample: true,
};

test('제목에 업체명이 들어간다', () => {
  const { subject } = buildNotification(INQUIRY);
  assert.equal(subject, '[견적요청] 하남상회');
});

test('본문에 모든 입력 항목이 들어간다', () => {
  const { text } = buildNotification(INQUIRY);
  for (const value of ['하남상회', '홍길동', '010-1234-5678', '삼겹살, 목살',
                       '월 500kg', '진공포장', '겉지방 3mm', '경기 하남시',
                       '주 2회 납품 희망합니다.']) {
    assert.ok(text.includes(value), `본문에 ${value} 가 없다`);
  }
});

test('샘플 신청 여부를 한글로 적는다', () => {
  assert.ok(buildNotification(INQUIRY).text.includes('샘플 신청: 예'));
  assert.ok(buildNotification({ ...INQUIRY, sample: false }).text.includes('샘플 신청: 아니오'));
});

test('비어 있는 항목은 미입력으로 적는다', () => {
  const { text } = buildNotification({ ...INQUIRY, region: '', cuts: [] });
  assert.ok(text.includes('배송 지역: 미입력'));
  assert.ok(text.includes('관심 부위: 미선택'));
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/mail.js'`

- [ ] **Step 3: 이메일 모듈 구현**

`lib/mail.js`:

```js
// 접수 알림 메일. Resend REST API 를 fetch 로 호출한다.

const ADMIN_URL = 'https://buyoungmt.com/admin';

function or(value, fallback) {
  return value && String(value).trim() ? value : fallback;
}

export function buildNotification(inquiry) {
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
    `관리자 페이지: ${ADMIN_URL}`,
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
```

- [ ] **Step 4: 공통 헬퍼 구현**

`lib/http.js`:

```js
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
```

- [ ] **Step 5: 접수 핸들러 구현**

`api/inquiry.js`:

```js
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

  // 봇으로 판정된 요청은 조용히 성공으로 응답한다.
  // 실패를 알려주면 어디를 고쳐야 하는지 가르쳐 주는 셈이 된다.
  if (!result.ok && (result.errors.includes('spam') || result.errors.includes('too_fast'))) {
    res.status(200).json({ ok: true });
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
```

- [ ] **Step 6: 테스트를 돌려 통과를 확인한다**

Run: `npm test`
Expected: PASS — 24 tests

- [ ] **Step 7: 커밋**

```bash
git add lib/mail.js lib/http.js api/inquiry.js tests/mail.test.js
git commit -m "feat: 견적 접수 API 와 알림 메일"
```

---

### Task 5: 견적 폼을 서버에 연결

`inquiry.html`의 제출 동작을 바꾼다. 디자인과 입력 항목은 건드리지 않는다.

**Files:**
- Modify: `inquiry.html:182` (폼 안에 함정 칸 추가)
- Modify: `inquiry.html:408-456` (제출 처리 전체 교체)

**Interfaces:**
- Consumes: `POST /api/inquiry` (Task 4)
- Produces: 없음

- [ ] **Step 1: 함정 칸과 시작 시각 추가**

`inquiry.html`에서 `<form id="quoteForm" ...>` 바로 다음 줄에 넣는다.

```html
        <!-- 봇 차단용. 사람에게는 보이지 않는다 -->
        <div aria-hidden="true" style="position:absolute;left:-9999px;top:-9999px;">
          <label>홈페이지 주소<input type="text" name="website" tabindex="-1" autocomplete="off"></label>
        </div>
```

- [ ] **Step 2: 제출 처리 교체**

`inquiry.html`의 `form.addEventListener('submit', ...)` 블록 전체(현재 408~456행)를 아래로 바꾼다.

```js
  var formStartedAt = Date.now();

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var problems = validate();
    if (problems.length) {
      var first = problems[0];
      var target = fieldOf(first) || first;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      try { first.focus({ preventScroll: true }); } catch (err) { first.focus(); }
      return;
    }

    var btn = document.getElementById('submitBtn');
    btn.setAttribute('data-busy', 'true');

    var f = new FormData(form);
    var payload = {
      company: f.get('company'),
      type: f.get('type'),
      name: f.get('name'),
      phone: f.get('phone'),
      cuts: f.getAll('cuts'),
      volume: f.get('volume'),
      packing: f.get('packing'),
      trim: f.get('trim'),
      region: f.get('region'),
      message: f.get('message'),
      sample: !!f.get('sample'),
      agree: !!f.get('agree'),
      website: f.get('website') || '',
      startedAt: formStartedAt
    };

    fetch('/api/inquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) { return res.ok ? res.json() : Promise.reject(res.status); })
      .then(function (data) {
        if (!data.ok) return Promise.reject('rejected');
        btn.removeAttribute('data-busy');
        document.getElementById('formWrap').classList.add('hidden');
        var panel = document.getElementById('successPanel');
        panel.classList.remove('hidden');
        panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      })
      .catch(function () {
        btn.removeAttribute('data-busy');
        showSendError();
      });
  });

  // 전송이 실패하면 입력 내용을 지우지 않고 전화 안내를 띄운다.
  function showSendError() {
    var box = document.getElementById('sendError');
    if (!box) return;
    box.classList.remove('hidden');
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
```

- [ ] **Step 3: 실패 안내 영역 추가**

`inquiry.html`에서 `<form id="quoteForm" ...>` 바로 앞에 넣는다.

```html
        <div id="sendError" class="hidden rounded-xl border-2 border-brand bg-brand-tint p-6 mb-7">
          <p class="font-bold text-ink text-lg mb-2">전송에 실패했습니다</p>
          <p class="text-ink-soft text-[15px] mb-5">
            입력하신 내용은 그대로 남아 있습니다. 잠시 후 다시 시도하시거나,
            아래 번호로 전화 주시면 바로 도와드리겠습니다.
          </p>
          <div class="flex flex-wrap gap-3">
            <a href="tel:010-4017-1231" class="btn btn-primary tnum">010-4017-1231</a>
            <a href="tel:010-4404-0731" class="btn btn-outline tnum">010-4404-0731</a>
          </div>
        </div>
```

- [ ] **Step 4: 브라우저에서 확인**

1. `inquiry.html`을 열고 개발자도구 Network 탭을 연다
2. 필수값을 채우고 제출한다
3. `/api/inquiry` 요청이 나가는지 확인한다 (아직 서버가 없으므로 실패 안내가 떠야 정상이다)
4. **입력 내용이 지워지지 않고 남아 있는지 확인한다**

- [ ] **Step 5: 커밋**

```bash
git add inquiry.html
git commit -m "feat: 견적 폼을 서버 접수로 전환하고 실패 안내 추가"
```

---

### Task 6: 로그인 API

비밀번호를 확인해 세션을 발급한다. 반복 실패는 차단한다.

**Files:**
- Create: `lib/guard.js`
- Create: `api/admin/login.js`
- Create: `api/admin/logout.js`
- Test: `tests/guard.test.js`

**Interfaces:**
- Consumes: `verifyPassword`, `createSession`, `verifySession`, `readCookie`, `sessionCookie`, `clearedCookie` (Task 3), `getPasswordHash`, `getLoginState`, `recordLoginFailure`, `clearLoginFailures` (Task 2)
- Produces:
  - `isLocked(state, now) -> boolean`
  - `lockUntil(failCount, now) -> string | null`
  - `requireSession(req, res) -> boolean` — 세션이 없으면 401 을 보내고 `false` 를 준다

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/guard.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLocked, lockUntil } from '../lib/guard.js';

const NOW = 1770000000000;

test('잠금 시각이 지나지 않았으면 잠긴 상태다', () => {
  assert.equal(isLocked({ locked_until: new Date(NOW + 60000).toISOString() }, NOW), true);
});

test('잠금 시각이 지났으면 풀린다', () => {
  assert.equal(isLocked({ locked_until: new Date(NOW - 1000).toISOString() }, NOW), false);
});

test('기록이 없으면 잠기지 않은 상태다', () => {
  assert.equal(isLocked(null, NOW), false);
  assert.equal(isLocked({ locked_until: null }, NOW), false);
});

test('5회 미만 실패는 잠그지 않는다', () => {
  assert.equal(lockUntil(1, NOW), null);
  assert.equal(lockUntil(4, NOW), null);
});

test('5회째 실패부터 15분간 잠근다', () => {
  assert.equal(lockUntil(5, NOW), new Date(NOW + 15 * 60000).toISOString());
  assert.equal(lockUntil(9, NOW), new Date(NOW + 15 * 60000).toISOString());
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/guard.js'`

- [ ] **Step 3: 구현**

`lib/guard.js`:

```js
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
```

`api/admin/login.js`:

```js
import { verifyPassword, createSession, sessionCookie } from '../../lib/auth.js';
import { getPasswordHash, getLoginState, recordLoginFailure, clearLoginFailures } from '../../lib/db.js';
import { isLocked, lockUntil } from '../../lib/guard.js';
import { readJson, clientIp } from '../../lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false });
    return;
  }

  const ip = clientIp(req);
  const state = await getLoginState(ip);
  if (isLocked(state)) {
    res.status(429).json({ ok: false, error: 'locked' });
    return;
  }

  const { password } = await readJson(req);
  const stored = await getPasswordHash();

  if (!stored || !password || !verifyPassword(String(password), stored)) {
    await recordLoginFailure(ip, lockUntil((state?.fail_count ?? 0) + 1));
    res.status(401).json({ ok: false, error: 'invalid' });
    return;
  }

  await clearLoginFailures(ip);
  res.setHeader('Set-Cookie', sessionCookie(createSession(process.env.SESSION_SECRET)));
  res.status(200).json({ ok: true });
}
```

`api/admin/logout.js`:

```js
import { clearedCookie } from '../../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Set-Cookie', clearedCookie());
  res.status(200).json({ ok: true });
}
```

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

Run: `npm test`
Expected: PASS — 이 작업이 추가한 5개를 포함해 전부 통과. 검토 과정에서 테스트가 추가되므로 총계는 늘어날 수 있다. 중요한 것은 fail 0 이다

- [ ] **Step 5: 커밋**

```bash
git add lib/guard.js api/admin/login.js api/admin/logout.js tests/guard.test.js
git commit -m "feat: 관리자 로그인과 시도 제한"
```

---

### Task 7: 관리자 데이터 API

목록 조회, 상태·처리자 변경, 삭제, 비밀번호 변경.

**Files:**
- Create: `api/admin/inquiries.js`
- Create: `api/admin/inquiries/[id].js`
- Create: `api/admin/password.js`

**Interfaces:**
- Consumes: `requireSession` (Task 6), `listInquiries` / `updateInquiry` / `deleteInquiry` / `getPasswordHash` / `setPasswordHash` (Task 2), `isValidStatus` / `isValidHandler` (Task 1), `verifyPassword` / `hashPassword` (Task 3)
- Produces:
  - `GET /api/admin/inquiries?status=<all|new|contacted|quoted|closed>` → `{ ok, items }`
  - `PATCH /api/admin/inquiries/<id>` body `{ status?, handler? }` → `{ ok, item }`
  - `DELETE /api/admin/inquiries/<id>` → `{ ok }`
  - `POST /api/admin/password` body `{ current, next }` → `{ ok }`

- [ ] **Step 1: 목록 API 구현**

`api/admin/inquiries.js`:

```js
import { requireSession } from '../../lib/guard.js';
import { listInquiries } from '../../lib/db.js';

export default async function handler(req, res) {
  if (!requireSession(req, res)) return;
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false });
    return;
  }
  try {
    const items = await listInquiries(req.query.status);
    res.status(200).json({ ok: true, items });
  } catch (error) {
    console.error('목록 조회 실패', error);
    res.status(500).json({ ok: false });
  }
}
```

- [ ] **Step 2: 단건 수정·삭제 API 구현**

`api/admin/inquiries/[id].js`:

```js
import { requireSession } from '../../../lib/guard.js';
import { updateInquiry, deleteInquiry } from '../../../lib/db.js';
import { isValidStatus, isValidHandler } from '../../../lib/validate.js';
import { readJson } from '../../../lib/http.js';

export default async function handler(req, res) {
  if (!requireSession(req, res)) return;

  const { id } = req.query;

  if (req.method === 'DELETE') {
    try {
      await deleteInquiry(id);
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
      res.status(200).json({ ok: true, item });
    } catch (error) {
      console.error('수정 실패', error);
      res.status(500).json({ ok: false });
    }
    return;
  }

  res.status(405).json({ ok: false });
}
```

- [ ] **Step 3: 비밀번호 변경 API 구현**

`api/admin/password.js`:

```js
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
    res.status(401).json({ ok: false, error: 'invalid_current' });
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
```

- [ ] **Step 4: 테스트가 여전히 통과하는지 확인한다**

Run: `npm test`
Expected: PASS — fail 0. 이 작업은 테스트를 추가하지 않으며, 기존 테스트를 하나도 깨뜨리지 않아야 한다

- [ ] **Step 5: 커밋**

```bash
git add api/admin/inquiries.js api/admin/inquiries/ api/admin/password.js
git commit -m "feat: 관리자 목록·수정·삭제·비밀번호 변경 API"
```

---

### Task 8: 관리자 화면

**Files:**
- Create: `admin/index.html`
- Create: `admin/admin.js`
- Create: `robots.txt`
- Create: `vercel.json`

**Interfaces:**
- Consumes: Task 6·7의 모든 API
- Produces: 없음

- [ ] **Step 1: 검색엔진 차단 설정**

`robots.txt`:

```
User-agent: *
Allow: /
Disallow: /admin
```

`vercel.json`:

```json
{
  "headers": [
    {
      "source": "/admin",
      "headers": [{ "key": "X-Robots-Tag", "value": "noindex, nofollow" }]
    },
    {
      "source": "/admin/:path*",
      "headers": [{ "key": "X-Robots-Tag", "value": "noindex, nofollow" }]
    }
  ]
}
```

- [ ] **Step 2: 화면 작성**

`admin/index.html`:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>견적문의 관리 | (주)부영미트</title>
<link rel="icon" href="/images/logo-mark.png" type="image/png">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {
  theme: { extend: {
    colors: {
      brand: { DEFAULT:'#1555A2', deep:'#0E3E79', soft:'#2069BE', tint:'#EAF2FA' },
      ink:   { DEFAULT:'#101720', soft:'#3D4A57', mute:'#6B7885' },
      paper: { DEFAULT:'#F8FAFC' },
      line:  '#DCE3EA'
    },
    fontFamily: { sans: ['"Pretendard Variable"','Pretendard','-apple-system','sans-serif'] }
  }}
}
</script>
<link rel="stylesheet" href="/assets/site.css?v=7">
</head>
<body class="font-sans bg-paper text-ink">

<!-- 로그인 -->
<section id="loginView" class="min-h-screen flex items-center justify-center px-5">
  <form id="loginForm" class="w-full max-w-sm bg-white rounded-2xl border border-line p-8">
    <img src="/images/logo.png" alt="(주)부영미트" class="h-7 mb-7">
    <h1 class="text-xl font-extrabold mb-6">견적문의 관리</h1>
    <label class="block text-[14px] font-bold mb-2" for="pw">비밀번호</label>
    <input id="pw" type="password" class="input mb-4" autocomplete="current-password" required>
    <p id="loginError" class="hidden text-[14px] text-brand font-semibold mb-4"></p>
    <button type="submit" class="btn btn-primary w-full !py-3.5">들어가기</button>
  </form>
</section>

<!-- 목록 -->
<section id="listView" class="hidden max-w-[1100px] mx-auto px-5 py-8">
  <header class="flex items-center justify-between mb-7">
    <div class="flex items-center gap-3">
      <img src="/images/logo.png" alt="(주)부영미트" class="h-6">
      <h1 class="text-lg font-extrabold">견적문의</h1>
    </div>
    <div class="flex items-center gap-2">
      <button id="pwBtn" class="btn btn-outline !py-2 !px-3.5 text-[13px]">비밀번호 변경</button>
      <button id="logoutBtn" class="btn btn-outline !py-2 !px-3.5 text-[13px]">나가기</button>
    </div>
  </header>

  <!-- 비밀번호 변경 -->
  <form id="pwForm" class="hidden bg-white rounded-xl border border-line p-6 mb-6 max-w-md">
    <h2 class="font-extrabold mb-4">비밀번호 변경</h2>
    <label class="block text-[14px] font-bold mb-2" for="pwCurrent">현재 비밀번호</label>
    <input id="pwCurrent" type="password" class="input mb-4" autocomplete="current-password" required>
    <label class="block text-[14px] font-bold mb-2" for="pwNext">새 비밀번호 (8자 이상)</label>
    <input id="pwNext" type="password" class="input mb-4" autocomplete="new-password" minlength="8" required>
    <p id="pwMessage" class="hidden text-[14px] font-semibold mb-4"></p>
    <div class="flex gap-2">
      <button type="submit" class="btn btn-primary !py-3">변경</button>
      <button type="button" id="pwCancel" class="btn btn-outline !py-3">취소</button>
    </div>
  </form>

  <nav class="flex flex-wrap gap-2 mb-6" id="filters">
    <button class="badge" data-filter="all">전체</button>
    <button class="badge" data-filter="new">신규 <span id="newCount"></span></button>
    <button class="badge" data-filter="contacted">연락함</button>
    <button class="badge" data-filter="quoted">견적발송</button>
    <button class="badge" data-filter="closed">종료</button>
  </nav>

  <p id="empty" class="hidden text-ink-mute py-16 text-center">해당하는 문의가 없습니다.</p>
  <div id="list" class="grid gap-3"></div>
</section>

<script src="/admin/admin.js"></script>
</body>
</html>
```

- [ ] **Step 3: 동작 스크립트 작성**

`admin/admin.js`:

```js
(function () {
  'use strict';

  var STATUS_LABEL = { new: '신규', contacted: '연락함', quoted: '견적발송', closed: '종료' };
  var STATUS_ORDER = ['new', 'contacted', 'quoted', 'closed'];
  var HANDLERS = ['배명운 대표이사', '김유경 상무'];

  var loginView = document.getElementById('loginView');
  var listView = document.getElementById('listView');
  var list = document.getElementById('list');
  var empty = document.getElementById('empty');
  var filter = 'all';

  function api(path, options) {
    return fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options))
      .then(function (res) {
        if (res.status === 401) { showLogin(); return Promise.reject('unauthorized'); }
        if (!res.ok) return Promise.reject(res.status);
        return res.json();
      });
  }

  function showLogin() {
    loginView.classList.remove('hidden');
    listView.classList.add('hidden');
  }

  function showList() {
    loginView.classList.add('hidden');
    listView.classList.remove('hidden');
    load();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function row(label, value) {
    if (!value || (Array.isArray(value) && !value.length)) return '';
    var shown = Array.isArray(value) ? value.join(', ') : value;
    return '<div class="spec-row"><dt class="spec-key">' + label + '</dt><dd>' + escapeHtml(shown) + '</dd></div>';
  }

  function card(item) {
    var when = new Date(item.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    var statusOptions = STATUS_ORDER.map(function (s) {
      return '<option value="' + s + '"' + (s === item.status ? ' selected' : '') + '>' + STATUS_LABEL[s] + '</option>';
    }).join('');
    var handlerOptions = ['<option value="">처리자 미지정</option>'].concat(
      HANDLERS.map(function (h) {
        return '<option value="' + h + '"' + (h === item.handler ? ' selected' : '') + '>' + h + '</option>';
      })
    ).join('');

    return '' +
      '<article class="bg-white rounded-xl border border-line p-5" data-id="' + item.id + '">' +
        '<div class="flex flex-wrap items-start justify-between gap-3 mb-3">' +
          '<div>' +
            '<p class="font-extrabold text-[17px]">' + escapeHtml(item.company) + '</p>' +
            '<p class="text-ink-mute text-[13px] tnum">' + when + '</p>' +
          '</div>' +
          '<a href="tel:' + escapeHtml(item.phone) + '" class="btn btn-primary !py-2 !px-4 text-[14px] tnum">' +
            escapeHtml(item.contact_name) + ' ' + escapeHtml(item.phone) +
          '</a>' +
        '</div>' +
        '<dl class="mb-4">' +
          row('업종', item.business_type) +
          row('관심 부위', item.cuts) +
          row('월 물량', item.volume) +
          row('희망 포장', item.packing) +
          row('손질 요청', item.trim_request) +
          row('배송 지역', item.region) +
          row('샘플 신청', item.sample ? '예' : '') +
          row('요청 사항', item.message) +
        '</dl>' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<select class="select !py-2 !text-[14px] w-auto" data-action="status">' + statusOptions + '</select>' +
          '<select class="select !py-2 !text-[14px] w-auto" data-action="handler">' + handlerOptions + '</select>' +
          '<button class="btn btn-outline !py-2 !px-3.5 text-[13px] ml-auto" data-action="delete">삭제</button>' +
        '</div>' +
      '</article>';
  }

  function load() {
    api('/api/admin/inquiries?status=' + filter).then(function (data) {
      list.innerHTML = data.items.map(card).join('');
      empty.classList.toggle('hidden', data.items.length > 0);
      if (filter === 'all') countNew(data.items);
    }).catch(function () {});
  }

  function countNew(items) {
    var n = items.filter(function (i) { return i.status === 'new'; }).length;
    document.getElementById('newCount').textContent = n ? '(' + n + ')' : '';
  }

  document.getElementById('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var error = document.getElementById('loginError');
    error.classList.add('hidden');
    fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: document.getElementById('pw').value })
    }).then(function (res) {
      if (res.ok) { document.getElementById('pw').value = ''; showList(); return; }
      error.textContent = res.status === 429
        ? '로그인 시도가 많아 잠시 잠겼습니다. 15분 후 다시 시도해 주세요.'
        : '비밀번호가 맞지 않습니다.';
      error.classList.remove('hidden');
    });
  });

  document.getElementById('filters').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-filter]');
    if (!btn) return;
    filter = btn.dataset.filter;
    load();
  });

  list.addEventListener('change', function (e) {
    var select = e.target.closest('select[data-action]');
    if (!select) return;
    var id = select.closest('[data-id]').dataset.id;
    var patch = {};
    patch[select.dataset.action] = select.value;
    api('/api/admin/inquiries/' + id, { method: 'PATCH', body: JSON.stringify(patch) })
      .then(function () { if (filter !== 'all') load(); else countNewFromDom(); })
      .catch(function () { alert('저장하지 못했습니다. 다시 시도해 주세요.'); load(); });
  });

  function countNewFromDom() {
    var n = Array.prototype.filter.call(
      list.querySelectorAll('select[data-action="status"]'),
      function (s) { return s.value === 'new'; }
    ).length;
    document.getElementById('newCount').textContent = n ? '(' + n + ')' : '';
  }

  list.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action="delete"]');
    if (!btn) return;
    var article = btn.closest('[data-id]');
    if (!confirm('이 문의를 완전히 삭제합니다. 되돌릴 수 없습니다.')) return;
    api('/api/admin/inquiries/' + article.dataset.id, { method: 'DELETE' })
      .then(load)
      .catch(function () { alert('삭제하지 못했습니다.'); });
  });

  document.getElementById('logoutBtn').addEventListener('click', function () {
    fetch('/api/admin/logout', { method: 'POST' }).then(showLogin);
  });

  var pwForm = document.getElementById('pwForm');
  var pwMessage = document.getElementById('pwMessage');

  function showPwMessage(text, ok) {
    pwMessage.textContent = text;
    pwMessage.className = 'text-[14px] font-semibold mb-4 ' + (ok ? 'text-brand' : 'text-ink');
  }

  document.getElementById('pwBtn').addEventListener('click', function () {
    pwForm.classList.toggle('hidden');
    pwMessage.classList.add('hidden');
    if (!pwForm.classList.contains('hidden')) document.getElementById('pwCurrent').focus();
  });

  document.getElementById('pwCancel').addEventListener('click', function () {
    pwForm.reset();
    pwForm.classList.add('hidden');
  });

  pwForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var current = document.getElementById('pwCurrent').value;
    var next = document.getElementById('pwNext').value;
    api('/api/admin/password', { method: 'POST', body: JSON.stringify({ current: current, next: next }) })
      .then(function () {
        pwForm.reset();
        showPwMessage('비밀번호를 변경했습니다.', true);
      })
      .catch(function (status) {
        showPwMessage(
          status === 400
            ? '새 비밀번호가 너무 짧습니다. 8자 이상으로 정해 주세요.'
            : '현재 비밀번호가 맞지 않습니다.',
          false
        );
      });
  });

  // 세션이 살아 있으면 바로 목록을 연다.
  api('/api/admin/inquiries?status=all')
    .then(function () { showList(); })
    .catch(function () { showLogin(); });
})();
```

- [ ] **Step 4: 커밋**

```bash
git add admin/ robots.txt vercel.json
git commit -m "feat: 관리자 화면과 검색엔진 차단 설정"
```

---

### Task 9: 배포와 개인정보처리방침 정리

**Files:**
- Modify: `privacy.html` (3절 보유 기간, 1절 수집 방법)
- Create: `.env.example`

**Interfaces:**
- Consumes: 앞의 모든 작업
- Produces: 가동 중인 사이트

- [ ] **Step 1: 환경변수 목록 문서화**

`.env.example`:

```bash
# 실제 값은 Vercel 프로젝트 설정 → Environment Variables 에 넣는다.
# 이 파일에는 값을 적지 않는다.

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SESSION_SECRET=
RESEND_API_KEY=
MAIL_FROM=
NOTIFY_EMAILS=siaabba@naver.com,kyk12318638@naver.com
```

- [ ] **Step 2: Resend 준비**

1. https://resend.com 에 구글 계정 `kyk1231@gmail.com` 으로 가입
2. API Key 발급 → `RESEND_API_KEY`
3. 도메인 인증 전에는 Resend 가 주는 테스트 발신 주소를 `MAIL_FROM` 에 넣어 먼저 확인한다. 도메인 연결(2단계) 후 `견적문의 <no-reply@buyoungmt.com>` 으로 바꾼다

- [ ] **Step 3: Vercel 배포**

1. https://vercel.com 에 구글 계정으로 로그인
2. 이 저장소를 올린다. **원격 저장소가 없으므로 GitHub 비공개 저장소를 먼저 만들어 연결한다** (`.env.example` 외 비밀값이 저장소에 없는지 확인한 뒤 올린다)
3. Environment Variables 에 위 여섯 개를 넣는다. `SESSION_SECRET` 은 아래 명령으로 만든 무작위 값을 쓴다

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

4. 배포 후 나온 `*.vercel.app` 주소로 접속해 확인한다

- [ ] **Step 4: 실제로 확인한다**

1. `/inquiry.html` 에서 견적 문의를 한 건 넣는다 → **완료 화면이 뜨는지**
2. 두 이메일 주소로 알림이 왔는지
3. `/admin` 에서 로그인하고 방금 넣은 문의가 보이는지
4. 상태를 `연락함` 으로 바꾸고 새로고침해도 유지되는지
5. 처리자를 지정하고 유지되는지
6. 필터 `신규` / `연락함` 이 맞게 걸리는지
7. 틀린 비밀번호로 5회 시도하면 잠기는지
8. 삭제가 되는지
9. **비밀번호를 8자 이상으로 변경하고, 새 비밀번호로 로그인되는지**

- [ ] **Step 5: 개인정보처리방침 수정**

`privacy.html` 3절 "개인정보의 보유 및 이용 기간" 본문을 아래로 바꾼다.

```html
      <p>
        회사는 견적 상담을 위해 수집한 개인정보를 국내에 소재한 클라우드 데이터베이스에 보관합니다.
        정보주체가 삭제를 요청하거나 회사가 보관 필요성이 없다고 판단한 경우 지체 없이 파기하며,
        거래가 성립된 경우에는 관계 법령에 따라 아래 기간 동안 보관합니다.
      </p>
```

같은 절 1항 "수집 방법" 칸의 값을 아래로 바꾼다.

```html
          <tr><th>수집 방법</th><td>홈페이지 견적 문의 양식(국내 클라우드 데이터베이스에 저장), 이메일, 전화 상담</td></tr>
```

- [ ] **Step 6: 커밋**

```bash
git add .env.example privacy.html
git commit -m "feat: 배포 설정과 개인정보처리방침 정리"
```

---

## 다음 단계 (이 계획 밖)

1. `buyoungmt.com` 연결 — 설계 문서 12절의 도메인 연결 항목(canonical, og:url, og:image 절대 주소, sitemap.xml)을 함께 처리한다
2. 문자 알림 — 발신번호 사전등록 후 `lib/mail.js` 옆에 `lib/sms.js` 를 추가하고 `api/inquiry.js` 에서 함께 호출한다
