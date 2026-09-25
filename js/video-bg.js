/* ==========================================================================
   EndlessLoop · 主页首屏动态背景（视频）
   --------------------------------------------------------------------------
   只把首页首屏 hero 换成 /img/hly.mp4；全站背景保持静态柔焦图（那个整屏
   视频 + blur 是最耗性能的一层，去掉后页面明显更流畅）。

   性能优化：
     - 视频静音自动播放（浏览器要求）；
     - 滚出首屏 → 暂停，滚回来 → 继续（IntersectionObserver）；
     - 标签页切走 → 暂停；
     - 省流 / 移动端 / 减少动效 → 不注入视频，退回原图。

   全站背景视频已移除，静态 background.webp 继续作为柔焦氛围层。
   ========================================================================== */

(function () {
  'use strict';

  var VIDEO_SRC = '/img/pink.mp4';

  var CAPS = window.EL_CAPS || {};
  var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  var saveData = !!(conn && (conn.saveData || /2g/.test(conn.effectiveType || '')));
  var narrow = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var playVideo = !saveData && !narrow && !reduced;

  function initHeroVideo() {
    var media = document.querySelector('.el-hero-media');
    var img = media && media.querySelector('.el-hero-media__art');
    if (!media || !img || media.querySelector('video')) return;

    var v = document.createElement('video');
    v.src = VIDEO_SRC;
    v.poster = img.getAttribute('src') || '';
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.autoplay = true;
    v.setAttribute('preload', 'auto');
    v.setAttribute('aria-hidden', 'true');
    v.className = 'el-hero-media__video';
    media.appendChild(v);

    /* 滚出首屏就暂停，滚回来再播 */
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) {
              var p = v.play();
              if (p && p.catch) p.catch(function () {});
            } else {
              v.pause();
            }
          });
        },
        { threshold: 0.05 }
      );
      io.observe(media);
    }

    /* 标签页切走就暂停 */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) v.pause();
    });
  }

  function boot() {
    if (!playVideo) return;
    initHeroVideo();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('pjax:complete', boot);
})();
