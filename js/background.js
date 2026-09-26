/* ==========================================================================
   EndlessLoop · 非首页动态二次元背景（随机 + 手动切换）
   --------------------------------------------------------------------------
   图库来自构建期注入的 window.EL_BG_POOL（scripts/background.js 从
   照片墙「二次元」分类自动扫描）。首页（#page-header.full_page）不参与。

   实现：
     - 两个全屏背景层交叉淡入淡出（无闪烁、无闪白）；
     - 切换前用 new Image() 预加载下一张，避免空白；
     - 一个恒定深色渐变 + 淡网格遮罩层保证正文可读；
     - 一个「↻ 换背景」HUD 玻璃按钮，右下/右上角。
   ========================================================================== */

(function () {
  'use strict';

  var POOL = window.EL_BG_POOL || [];
  if (!POOL.length) return;
  if (document.querySelector('#page-header.full_page')) return; // 首页不参与

  function makeLayer() {
    var d = document.createElement('div');
    d.className = 'el-bg';
    d.setAttribute('aria-hidden', 'true');
    document.body.appendChild(d);
    return d;
  }

  var A = makeLayer();
  var B = makeLayer();

  var overlay = document.createElement('div');
  overlay.className = 'el-bg-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  document.body.appendChild(overlay);

  var btn = document.createElement('button');
  btn.className = 'el-bg-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', '换一张背景');
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/></svg>' +
    '<span>换背景</span>';
  document.body.appendChild(btn);

  var showing = B;
  var current = -1;
  var next = -1;

  function pickIdx(exclude) {
    if (POOL.length < 2) return 0;
    var i;
    do {
      i = Math.floor(Math.random() * POOL.length);
    } while (i === exclude);
    return i;
  }

  function setImage(layer, idx) {
    layer.style.backgroundImage = 'url("' + POOL[idx] + '")';
  }

  function preload(idx) {
    if (idx < 0) return;
    var img = new Image();
    img.src = POOL[idx];
  }

  function swap() {
    if (next < 0) next = pickIdx(current);
    var show = showing === B ? A : B;
    setImage(show, next);
    show.style.opacity = '1';
    showing.style.opacity = '0';
    showing = show;
    current = next;
    next = pickIdx(current);
    preload(next);
  }

  // 初始：B 显示第一张随机图并淡入，预加载下一张
  current = pickIdx(-1);
  setImage(B, current);
  B.style.opacity = '1';
  A.style.opacity = '0';
  next = pickIdx(current);
  preload(next);

  btn.addEventListener('click', swap);
})();
