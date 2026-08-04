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

test('본문이 없거나 객체가 아니어도 예외 없이 거부한다', () => {
  for (const body of [null, undefined, 'string', 42, ['a'], true]) {
    const result = validateInquiry(body, { now: NOW });
    assert.equal(result.ok, false);
    assert.ok(result.errors.length > 0);
  }
});
