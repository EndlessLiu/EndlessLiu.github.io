/* ==========================================================================
   EndlessLoop · 友链页交互（Tab 切换 + 复制 + 申请表单）
   --------------------------------------------------------------------------
   挂在 #el-friends 上（由 scripts/friends.js 的 {% friends %} 输出），
   页面没有友链时静默返回。
   ========================================================================== */

(function () {
  'use strict';

  function boot() {
    var wall = document.getElementById('el-friends');
    if (!wall || wall.dataset.ready === '1') return;
    wall.dataset.ready = '1';

    /* ---- Tab 切换 ---- */
    var tabs = wall.querySelectorAll('.el-friends-tab');
    var panels = wall.querySelectorAll('.el-friends-panel');

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var target = tab.getAttribute('data-tab');
        tabs.forEach(function (t) {
          var on = t === tab;
          t.classList.toggle('is-active', on);
          t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        panels.forEach(function (p) {
          p.classList.toggle('is-active', p.getAttribute('data-panel') === target);
        });
      });
    });

    /* ---- 复制 ---- */
    function copyText(text, btn) {
      var done = function () {
        var old = btn.textContent;
        btn.textContent = '已复制';
        btn.classList.add('is-done');
        setTimeout(function () {
          btn.textContent = old;
          btn.classList.remove('is-done');
        }, 1200);
      };
      var fallback = function () {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
        } catch (e) { /* 忽略 */ }
        document.body.removeChild(ta);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {
          fallback();
          done();
        });
      } else {
        fallback();
        done();
      }
    }

    wall.querySelectorAll('.el-friends-copy').forEach(function (btn) {
      btn.addEventListener('click', function () {
        copyText(btn.getAttribute('data-copy') || '', btn);
      });
    });

    /* ---- 申请表单 → mailto ---- */
    var form = wall.querySelector('.el-friends-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var mail = form.getAttribute('data-mail') || '';
        var fd = new FormData(form);
        var subject = '友链申请：' + (fd.get('name') || '');
        var body =
          '昵称：' + (fd.get('name') || '') + '\n' +
          '网站地址：' + (fd.get('url') || '') + '\n' +
          '头像地址：' + (fd.get('avatar') || '') + '\n' +
          '一句话介绍：' + (fd.get('desc') || '') + '\n' +
          '联系邮箱：' + (fd.get('email') || '') + '\n' +
          '标签：' + (fd.get('tags') || '') + '\n' +
          'RSS：' + (fd.get('rss') || '');
        window.location.href =
          'mailto:' + mail +
          '?subject=' + encodeURIComponent(subject) +
          '&body=' + encodeURIComponent(body);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('pjax:complete', boot);
})();
