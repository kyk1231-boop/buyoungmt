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
