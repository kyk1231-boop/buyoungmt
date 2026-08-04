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
