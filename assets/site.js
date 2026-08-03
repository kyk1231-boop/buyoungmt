/* ============================================================
   (주)부영미트 — 공통 스크립트
   헤더 상태 / 모바일 메뉴 / 스크롤 등장 / 하단 액션 바 / 폼 검증
   ============================================================ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 헤더: 스크롤 시 축소 ---------- */
  var header = document.querySelector('.site-header');
  var actionBar = document.querySelector('.action-bar');

  function onScroll() {
    var y = window.scrollY;
    if (header) header.classList.toggle('is-scrolled', y > 24);
    if (actionBar) actionBar.classList.toggle('is-up', y > 520);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- 모바일 메뉴 ---------- */
  var menuBtn = document.getElementById('menuBtn');
  var mobileMenu = document.getElementById('mobileMenu');

  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', function () {
      var open = mobileMenu.classList.toggle('is-open');
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
      // 메뉴가 열리면 투명 헤더도 불투명하게 (히어로 위에서 가독성 확보)
      if (header) header.classList.toggle('is-scrolled', open || window.scrollY > 24);
    });

    // 링크를 누르거나 데스크톱 폭으로 넓어지면 닫기
    mobileMenu.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        mobileMenu.classList.remove('is-open');
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mobileMenu.classList.contains('is-open')) {
        mobileMenu.classList.remove('is-open');
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.focus();
      }
    });
  }

  /* ---------- 현재 페이지 내비게이션 표시 ---------- */
  var here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  document.querySelectorAll('[data-nav]').forEach(function (a) {
    if (a.getAttribute('data-nav').toLowerCase() === here) {
      a.setAttribute('aria-current', 'page');
    }
  });

  /* ---------- 스크롤 등장 (staggered) ----------
     IntersectionObserver는 빠른 스크롤이나 앵커 점프로 요소를 통째로 건너뛸 때
     콜백이 발생하지 않아 요소가 영영 숨겨질 수 있습니다.
     매 스크롤마다 위치를 직접 확인하는 방식으로 그 문제를 없앴습니다. */
  var revealables = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));

  if (reduced) {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    // 컨테이너에 data-stagger가 있으면 자식들에게 순차 딜레이 부여
    document.querySelectorAll('[data-stagger]').forEach(function (group) {
      var gap = parseInt(group.getAttribute('data-stagger'), 10) || 90;
      group.querySelectorAll('[data-reveal]').forEach(function (el, i) {
        el.style.setProperty('--d', (i * gap) + 'ms');
      });
    });

    var pending = revealables.slice();
    var ticking = false;

    function sweep() {
      ticking = false;
      var h = window.innerHeight;
      var still = [];
      for (var i = 0; i < pending.length; i++) {
        var el = pending[i];
        // 화면 하단 근처에 들어왔거나 이미 지나간 요소는 모두 노출
        if (el.getBoundingClientRect().top < h * 0.93) el.classList.add('is-in');
        else still.push(el);
      }
      pending = still;
      if (!pending.length) {
        window.removeEventListener('scroll', request);
        window.removeEventListener('resize', request);
      }
    }
    function request() {
      if (!ticking) { ticking = true; requestAnimationFrame(sweep); }
    }

    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    window.addEventListener('load', request);
    request();
  }

  /* ---------- 숫자 카운트업 ---------- */
  var counters = document.querySelectorAll('[data-count]');
  if (counters.length) {
    if (reduced || !('IntersectionObserver' in window)) {
      counters.forEach(function (el) { el.textContent = el.getAttribute('data-count'); });
    } else {
      var cio = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          cio.unobserve(el);
          var target = parseFloat(el.getAttribute('data-count'));
          var suffix = el.getAttribute('data-suffix') || '';
          var start = performance.now();
          var dur = 1400;
          (function tick(now) {
            var p = Math.min((now - start) / dur, 1);
            var eased = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.round(target * eased) + suffix;
            if (p < 1) requestAnimationFrame(tick);
          })(start);
        });
      }, { threshold: 0.4 });
      counters.forEach(function (el) { cio.observe(el); });
    }
  }

  /* ---------- 제품 페이지 목차: 현재 섹션 하이라이트 ---------- */
  var tocLinks = document.querySelectorAll('[data-toc] a');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var sections = [];
    tocLinks.forEach(function (a) {
      var el = document.querySelector(a.getAttribute('href'));
      if (el) sections.push({ el: el, link: a });
    });
    var tio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var match = sections.find(function (s) { return s.el === entry.target; });
        if (!match) return;
        if (entry.isIntersecting) {
          tocLinks.forEach(function (a) { a.removeAttribute('aria-current'); });
          match.link.setAttribute('aria-current', 'true');
        }
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    sections.forEach(function (s) { tio.observe(s.el); });
  }
})();

/* ============================================================
   폼 검증 유틸 — inquiry.html에서 사용
   ============================================================ */
window.BYForm = (function () {
  'use strict';

  function setError(field, message) {
    var wrap = field.closest('[data-field]');
    if (!wrap) return;
    wrap.classList.add('has-error');
    var box = wrap.querySelector('.field-error');
    if (box) box.textContent = message;
    field.setAttribute('aria-invalid', 'true');
  }

  function clearError(field) {
    var wrap = field.closest('[data-field]');
    if (!wrap) return;
    wrap.classList.remove('has-error');
    field.removeAttribute('aria-invalid');
  }

  var rules = {
    company: function (v) { return v.trim().length >= 2 ? '' : '업체명을 2자 이상 입력해 주세요.'; },
    type:    function (v) { return v ? '' : '업종을 선택해 주세요.'; },
    name:    function (v) { return v.trim().length >= 2 ? '' : '담당자 성함을 입력해 주세요.'; },
    phone:   function (v) {
      var digits = v.replace(/[^0-9]/g, '');
      return digits.length >= 9 && digits.length <= 11 ? '' : '연락처를 정확히 입력해 주세요. (예: 010-1234-5678)';
    }
  };

  function formatPhone(el) {
    el.addEventListener('input', function () {
      var d = el.value.replace(/[^0-9]/g, '').slice(0, 11);
      if (d.length < 4) el.value = d;
      else if (d.length < 8) el.value = d.slice(0, 3) + '-' + d.slice(3);
      else el.value = d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
    });
  }

  return { setError: setError, clearError: clearError, rules: rules, formatPhone: formatPhone };
})();
