/* ==========================================================================
   EndlessLoop · 照片墙交互（分类首页 ↔ 画廊 + 灯箱）
   --------------------------------------------------------------------------
   挂在 #photo-wall 上（由 scripts/photo-wall.js 的 {% photowall %} 输出），
   页面没有照片墙时静默返回。

   两级视图：
     - 分类首页：点 .photo-wall__card 打开对应分类的画廊；
     - 画廊：显示当前分类的 .photo-wall__section，点「全部分类」返回首页。

   灯箱是完整版：左右切换 + 方向键 + Esc 关闭 + 点遮罩关闭，
   且只在「当前分类」的照片范围内前后切换。
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
    if (!wall || wall.dataset.wallReady === '1') return;
    wall.dataset.wallReady = '1';

    var index = wall.querySelector('.photo-wall__index');
    var gallery = wall.querySelector('.photo-wall__gallery');
    var backBtn = wall.querySelector('.photo-wall__gallery-back');
    var titleEl = wall.querySelector('.photo-wall__gallery-title');
    var cards = wall.querySelectorAll('.photo-wall__card');
    var sections = wall.querySelectorAll('.photo-wall__section');

    /* ---- 当前分类下可见的照片 ---- */
    function activeItems() {
      var s = wall.querySelector('.photo-wall__section:not([hidden])');
      return s ? Array.prototype.slice.call(s.querySelectorAll('.photo-wall__item')) : [];
    }

    function openCategory(zh) {
      sections.forEach(function (s) {
        s.hidden = s.getAttribute('data-category') !== zh;
      });
      titleEl.textContent = zh;
      index.hidden = true;
      gallery.hidden = false;
      window.scrollTo(0, 0);
    }

    function closeCategory() {
      index.hidden = false;
      gallery.hidden = true;
      window.scrollTo(0, 0);
    }

    Array.prototype.forEach.call(cards, function (card) {
      card.addEventListener('click', function () {
        openCategory(card.getAttribute('data-pw-open'));
      });
    });
    backBtn.addEventListener('click', closeCategory);

    /* ---- 灯箱 ---- */
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
    var idx = 0;

    function openAt(i) {
      var vis = activeItems();
      if (!vis.length) return;
      idx = ((i % vis.length) + vis.length) % vis.length;
      var it = vis[idx];
      lbImg.src = it.querySelector('img').getAttribute('src');
      lbCaption.textContent = it.getAttribute('data-caption') || '';
      lightbox.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    }

    function close() {
      lightbox.classList.remove('is-open');
      document.body.style.overflow = '';
    }

    // 画廊里点照片开灯箱（事件委托，item 随分类切换而变，不逐个绑）
    wall.querySelector('.photo-wall__gallery-body').addEventListener('click', function (e) {
      var it = e.target.closest ? e.target.closest('.photo-wall__item') : null;
      if (!it) return;
      var vis = activeItems();
      var i = vis.indexOf(it);
      openAt(i >= 0 ? i : 0);
    });

    lightbox.querySelector('.photo-wall-lightbox__close').addEventListener('click', close);
    lightbox.querySelector('.photo-wall-lightbox__prev').addEventListener('click', function () {
      openAt(idx - 1);
    });
    lightbox.querySelector('.photo-wall-lightbox__next').addEventListener('click', function () {
      openAt(idx + 1);
    });
    // 点遮罩空白处关闭
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) close();
    });

    document.addEventListener('keydown', function (e) {
      if (!lightbox.classList.contains('is-open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') openAt(idx - 1);
      else if (e.key === 'ArrowRight') openAt(idx + 1);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('pjax:complete', boot);
})();
