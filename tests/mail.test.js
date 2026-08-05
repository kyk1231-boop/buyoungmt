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

// 알림 메일은 국외(도쿄) 발송망을 거친다. 담당자 성함과 연락처는 담지 않고
// 관리자 페이지에서만 본다.
test('본문에 담당자 성함과 연락처가 없다', () => {
  const { text } = buildNotification(INQUIRY);
  assert.ok(!text.includes('홍길동'), '본문에 담당자 성함이 들어 있다');
  assert.ok(!text.includes('010-1234-5678'), '본문에 연락처가 들어 있다');
});

// 자유입력 칸에는 무엇이든 적힐 수 있다. 개인정보가 섞여도 새지 않게 뺀다.
test('본문에 자유입력 항목이 없다', () => {
  const { text } = buildNotification(INQUIRY);
  assert.ok(!text.includes('주 2회 납품 희망합니다.'), '본문에 요청 사항이 들어 있다');
  assert.ok(!text.includes('겉지방 3mm'), '본문에 손질 요청이 들어 있다');
  assert.ok(!text.includes('경기 하남시'), '본문에 배송 지역이 들어 있다');
});

test('본문에 거래 조건 요약이 들어간다', () => {
  const { text } = buildNotification(INQUIRY);
  for (const value of ['하남상회', '식당', '삼겹살, 목살', '월 500kg', '진공포장']) {
    assert.ok(text.includes(value), `본문에 ${value} 가 없다`);
  }
});

test('본문에 관리자 페이지 주소가 들어간다', () => {
  const { text } = buildNotification(INQUIRY);
  assert.ok(text.includes('/admin'), '본문에 관리자 페이지 주소가 없다');
});

test('샘플 신청 여부를 한글로 적는다', () => {
  assert.ok(buildNotification(INQUIRY).text.includes('샘플 신청: 예'));
  assert.ok(buildNotification({ ...INQUIRY, sample: false }).text.includes('샘플 신청: 아니오'));
});

test('비어 있는 항목은 미선택으로 적는다', () => {
  const { text } = buildNotification({ ...INQUIRY, volume: '', cuts: [] });
  assert.ok(text.includes('월 예상 물량: 미선택'));
  assert.ok(text.includes('관심 부위: 미선택'));
});
