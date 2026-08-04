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
