/* ==========================================================================
   EndlessLoop · 页面切换转场（配合 pjax）
   --------------------------------------------------------------------------
   pjax:complete 时给 #content-inner 加 .el-page-enter，播放
   「淡入 + 上浮 + 微缩放 + 轻微模糊→清晰」（见 page-transition.css），
   再叠一层极淡的光晕扫描。首页 hero 标题/副标题自带 el-title-in / el-fade-up
   入场动画（pjax 换页后是新元素会重播），所以整页会形成「标题 → 内容」的层次。

   返回/前进都走同一条 pjax:complete，动画逻辑统一；
   不劫持历史记录，浏览器后退/前进不受影响。
   尊重 prefers-reduced-motion；移动端在 CSS 里降级为纯淡入。
   ========================================================================== */

(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  function sweep() {
    var s = document.createElement('div');
    s.className = 'el-page-sweep';
    s.setAttribute('aria-hidden', 'true');
    document.body.appendChild(s);
    s.addEventListener('animationend', function () {
      s.remove();
    });
  }

  function enter() {
    var content = document.getElementById('content-inner');
    if (!content) return;
    content.classList.remove('el-page-enter');
    void content.offsetWidth; // 强制重排，确保重复导航时动画能重新触发
    content.classList.add('el-page-enter');
  }

  document.addEventListener('pjax:complete', function () {
    enter();
    sweep();
  });
})();
