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
