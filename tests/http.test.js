import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientIp } from '../lib/http.js';

test('첫 번째 주소를 꺼낸다', () => {
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } }), '1.2.3.4');
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '  1.2.3.4  ' } }), '1.2.3.4');
});

test('헤더가 없거나 비어 있으면 unknown 을 준다', () => {
  for (const header of [undefined, '', '   ', ', ,']) {
    const req = { headers: header === undefined ? {} : { 'x-forwarded-for': header } };
    assert.equal(clientIp(req), 'unknown');
  }
});
