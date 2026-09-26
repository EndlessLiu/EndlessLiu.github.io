/* ==========================================================================
   EndlessLoop · 关于页交互（MBTI 数字动画 + 站点运行时间）
   --------------------------------------------------------------------------
   只在关于页生效（有 .el-mbti 或 .el-site 才跑），其它页面直接返回。

   1. MBTI 四维进度条：滚动进入视口时，分段条宽度从 0 长到目标值，
      主导百分比数字从 0 滚动到目标值（一次性，不回放）。
   2. 站点运行时间：读 .el-site__uptime-value 的 data-start，每秒刷新
      「X 天 HH:MM:SS」。
   ========================================================================== */

(function () {
  'use strict';

  /* 数字滚动：ease-out，1 秒内从 0 数到 target */
  function animateCount(el, target, dur) {
    var start = null;
    dur = dur || 1000;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + '%';
      if (p < 1) window.requestAnimationFrame(step);
      else el.textContent = target + '%';
    }
    window.requestAnimationFrame(step);
  }

  function initMbti() {
    var mbti = document.getElementById('el-mbti');
    if (!mbti || mbti.dataset.revealed === '1') return;
    mbti.dataset.revealed = '1';

    var dims = mbti.querySelectorAll('.el-mbti-dim');
    Array.prototype.forEach.call(dims, function (dim) {
      // 分段条：从 0 长到 data-w
      dim.querySelectorAll('[data-w]').forEach(function (seg) {
        seg.style.width = seg.getAttribute('data-w') + '%';
      });
      // 主导百分比：从 0 数到 data-count
      var count = dim.querySelector('[data-count]');
      if (count) animateCount(count, parseInt(count.getAttribute('data-count'), 10));
    });
  }

  function initUptime() {
    var el = document.querySelector('.el-site__uptime-value');
    if (!el) return;

    var start = new Date(el.getAttribute('data-start')).getTime();

    function pad(n) {
      return (n < 10 ? '0' : '') + n;
    }

    function tick() {
      var ms = Date.now() - start;
      if (!isFinite(start) || ms < 0) {
        el.textContent = '—';
        return;
      }
      var total = Math.floor(ms / 1000);
      var d = Math.floor(total / 86400);
      var h = Math.floor((total % 86400) / 3600);
      var m = Math.floor((total % 3600) / 60);
      var s = total % 60;
      el.textContent = d + ' 天 ' + pad(h) + ':' + pad(m) + ':' + pad(s);
    }

    tick();
    window.setInterval(tick, 1000);
  }

  function boot() {
    if (!document.querySelector('.el-mbti, .el-site')) return;

    var mbti = document.getElementById('el-mbti');

    // MBTI 进入视口才播放（IntersectionObserver 不支持就立即播）
    if (mbti && !mbti.dataset.revealed && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            initMbti();
            io.disconnect();
          }
        });
      }, { threshold: 0.25 });
      io.observe(mbti);
    } else {
      initMbti();
    }

    initUptime();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('pjax:complete', boot);
})();
