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
        if (res.status === 401) { showLogin(); return Promise.reject(res.status); }
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
          '<select class="select !py-2.5 !text-[14px] !min-h-[44px] w-auto" data-action="status">' + statusOptions + '</select>' +
          '<select class="select !py-2.5 !text-[14px] !min-h-[44px] w-auto" data-action="handler">' + handlerOptions + '</select>' +
          '<button class="btn btn-outline !py-2.5 !px-4 !min-h-[44px] text-[13px] ml-auto border-l-2 border-line pl-4" data-action="delete">삭제</button>' +
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

  // 어떤 필터를 보고 있든 신규 건수는 서버에서 다시 세어 맞춘다.
  // 목록 하나만큼의 가벼운 요청이라 체감 지연은 없다.
  function updateNewCount() {
    api('/api/admin/inquiries?status=new').then(function (data) {
      countNew(data.items);
    }).catch(function () {});
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
      if (res.status >= 500) {
        error.textContent = '서버에 문제가 있습니다. 잠시 후 다시 시도해 주세요.';
      } else if (res.status === 429) {
        error.textContent = '로그인 시도가 많아 잠시 잠겼습니다. 15분 후 다시 시도해 주세요.';
      } else {
        error.textContent = '비밀번호가 맞지 않습니다.';
      }
      error.classList.remove('hidden');
    });
  });

  document.getElementById('filters').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-filter]');
    if (!btn) return;
    filter = btn.dataset.filter;
    Array.prototype.forEach.call(document.querySelectorAll('#filters [data-filter]'), function (b) {
      b.classList.toggle('badge-solid', b === btn);
    });
    load();
  });

  list.addEventListener('change', function (e) {
    var select = e.target.closest('select[data-action]');
    if (!select) return;
    var id = select.closest('[data-id]').dataset.id;
    var action = select.dataset.action;
    var patch = {};
    patch[action] = select.value;
    api('/api/admin/inquiries/' + id, { method: 'PATCH', body: JSON.stringify(patch) })
      .then(function () {
        if (filter !== 'all') load();
        // 상태가 바뀌면 지금 어떤 필터를 보고 있든 신규 건수를 다시 맞춘다.
        if (action === 'status') updateNewCount();
      })
      .catch(function () { alert('저장하지 못했습니다. 다시 시도해 주세요.'); load(); });
  });

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
        var text = '현재 비밀번호가 맞지 않습니다.';
        if (status === 400) {
          text = '새 비밀번호가 너무 짧습니다. 8자 이상으로 정해 주세요.';
        } else if (typeof status === 'number' && status >= 500) {
          text = '서버에 문제가 있습니다. 잠시 후 다시 시도해 주세요.';
        }
        showPwMessage(text, false);
      });
  });

  // 세션이 살아 있으면 바로 목록을 연다.
  api('/api/admin/inquiries?status=all')
    .then(function () { showList(); })
    .catch(function () { showLogin(); });
})();
