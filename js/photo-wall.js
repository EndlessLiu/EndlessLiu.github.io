/* ==========================================================================
   EndlessLoop · 照片墙交互（分类筛选 + 灯箱）
   --------------------------------------------------------------------------
   挂在 #photo-wall 上（由 scripts/photo-wall.js 的 {% photowall %} 输出），
   页面没有照片墙时静默返回。
   灯箱是完整版：左右切换 + 方向键 + Esc 关闭 + 点遮罩关闭。
   ========================================================================== */

(function () {
  'use strict';

  var ICON = {
    close:
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.3 19.7 2.88 18.3 9.17 12 2.88 5.7 4.3 4.3l6.29 6.29 6.3-6.3z"/></svg>',
    prev:
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>',
    next:
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8.59 16.59 10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>'
  };

  function boot() {
    var wall = document.getElementById('photo-wall');
    if (!wall) return;
    // pjax 防重复挂载：灯箱已建就跳过
    if (wall.dataset.wallReady === '1') return;
    wall.dataset.wallReady = '1';

    var tabs = Array.prototype.slice.call(wall.querySelectorAll('.photo-wall__tab'));
    var items = Array.prototype.slice.call(wall.querySelectorAll('.photo-wall__item'));

    /* ---- 分类筛选 ---- */
    function visibleItems() {
      return items.filter(function (it) {
        return !it.classList.contains('is-hidden');
      });
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var filter = tab.getAttribute('data-filter');
        tabs.forEach(function (t) {
          var on = t === tab;
          t.classList.toggle('is-active', on);
          t.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        items.forEach(function (it) {
          var show = filter === 'all' || it.getAttribute('data-category') === filter;
          it.classList.toggle('is-hidden', !show);
        });
      });
    });

    /* ---- 灯箱 ---- */
    if (!items.length) return;

    var lightbox = document.createElement('div');
    lightbox.className = 'photo-wall-lightbox';
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-label', '照片查看');
    lightbox.innerHTML =
      '<button class="photo-wall-lightbox__btn photo-wall-lightbox__close" type="button" aria-label="关闭">' + ICON.close + '</button>' +
      '<button class="photo-wall-lightbox__btn photo-wall-lightbox__prev" type="button" aria-label="上一张">' + ICON.prev + '</button>' +
      '<div class="photo-wall-lightbox__stage">' +
      '<img class="photo-wall-lightbox__img" alt="">' +
      '<p class="photo-wall-lightbox__caption"></p>' +
      '</div>' +
      '<button class="photo-wall-lightbox__btn photo-wall-lightbox__next" type="button" aria-label="下一张">' + ICON.next + '</button>';
    document.body.appendChild(lightbox);

    var lbImg = lightbox.querySelector('.photo-wall-lightbox__img');
    var lbCaption = lightbox.querySelector('.photo-wall-lightbox__caption');
    var index = 0;

    // 在「当前可见」的照片里定位到第 i 张（负数/越界回绕）
    function openAt(i) {
      var vis = visibleItems();
      if (!vis.length) return;
      index = ((i % vis.length) + vis.length) % vis.length;
      var it = vis[index];
      lbImg.src = it.querySelector('img').getAttribute('src');
      lbCaption.textContent = it.getAttribute('data-caption') || '';
      lightbox.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    }

    function close() {
      lightbox.classList.remove('is-open');
      document.body.style.overflow = '';
    }

    items.forEach(function (it, i) {
      it.addEventListener('click', function () {
        // 传 items 的下标，openAt 内部会映射到可见列表
        var vis = visibleItems();
        var idx = vis.indexOf(it);
        openAt(idx >= 0 ? idx : 0);
      });
    });

    lightbox.querySelector('.photo-wall-lightbox__close').addEventListener('click', close);
    lightbox.querySelector('.photo-wall-lightbox__prev').addEventListener('click', function () {
      openAt(index - 1);
    });
    lightbox.querySelector('.photo-wall-lightbox__next').addEventListener('click', function () {
      openAt(index + 1);
    });
    // 点遮罩空白处关闭
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) close();
    });

    document.addEventListener('keydown', function (e) {
      if (!lightbox.classList.contains('is-open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') openAt(index - 1);
      else if (e.key === 'ArrowRight') openAt(index + 1);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('pjax:complete', boot);
})();
