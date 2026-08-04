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
