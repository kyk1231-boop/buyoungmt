// 초기 비밀번호의 해시를 만든다. 결과를 Supabase admin_settings 에 넣는다.
// 사용법: node scripts/hash-password.js '실제비밀번호'
import { hashPassword } from '../lib/auth.js';

const password = process.argv[2];
if (!password) {
  console.error("사용법: node scripts/hash-password.js '비밀번호'");
  process.exit(1);
}
console.log(hashPassword(password));
