/* ==========================================================================
   EndlessLoop · 非首页自动二次元背景（纯自动，无任何切换控件）
   --------------------------------------------------------------------------
   图库来自构建期注入的 window.EL_BG_POOL（scripts/background.js 从
   照片墙「二次元」分类自动扫描）。首页（#page-header.full_page）不参与。

   行为：
     - 进入非首页时自动随机选一张，双背景层交叉淡入；
     - 定时自动切换到下一张（SWITCH_INTERVAL），切换前预加载，无闪烁、无空白；
     - 一个恒定深色渐变 + 淡网格遮罩保证正文可读；
     - 不注入任何按钮/控件。
   ========================================================================== */

(function () {
  'use strict';

  var POOL = window.EL_BG_POOL || [];
  if (!POOL.length) return;
  if (document.querySelector('#page-header.full_page')) return; // 首页不参与

  var SWITCH_INTERVAL = 45000; // 定时自动切换间隔（毫秒）

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

  // 初始：随机一张并淡入，预加载下一张
  current = pickIdx(-1);
  setImage(B, current);
  B.style.opacity = '1';
  A.style.opacity = '0';
  next = pickIdx(current);
  preload(next);

  // 定时自动切换
  window.setInterval(swap, SWITCH_INTERVAL);
})();
