/* ==========================================================================
   EndlessLoop · 像素猫电子宠物（边上蹲着 / 说话互动）+ 电子木鱼点击特效
   --------------------------------------------------------------------------
   像素猫：用经典 oneko 猫素材（公有领域），蹲在左下角：
     - 常驻 idle，偶尔自己「睡觉 / 挠痒」；
     - 时不时冒一句话（气泡）跟访客互动；
     - 点击小猫：警觉表情 + 回一句。

   点击特效（电子木鱼）：点击页面任意处：
     - 落点浮现一枚小木鱼（木色 + 开口）；
     - 一圈金色波纹向外扩散；
     - 「功德+1」金色小字向上飘散。
     简洁、克制，不堆粒子、不游戏化。

   性能：一个 rAF 循环 + 短命 DOM 元素；
     reduced-motion / 省流 / 移动端下全部关闭。
   ========================================================================== */

(function () {
  'use strict';

  var CAPS = window.EL_CAPS || {};
  var enabled =
    CAPS.reduce !== true &&
    CAPS.saveData !== true &&
    CAPS.finePointer !== false &&
    CAPS.narrowScreen !== true;

  /* ---------------------------------------------------------------------
     像素猫
     --------------------------------------------------------------------- */

  var SPRITE = {
    idle: [[-3, -3]],
    alert: [[-7, -3]],
    scratchSelf: [[-5, 0], [-6, 0], [-7, 0]],
    tired: [[-3, -2]],
    sleeping: [[-2, 0], [-2, -1]]
  };

  var FRAME = 32;
  var SCALE = 2.5;
  var DISPLAY = FRAME * SCALE;
  var SHEET_W = 256 * SCALE;
  var SHEET_H = 128 * SCALE;

  var SAY_IDLE = [
    '喵~ 欢迎来玩呀',
    '今天也要加油鸭！',
    '点我一下试试~',
    '在写代码还是摸鱼呀？',
    '考研加油！',
    '跑完步记得拉伸哦',
    '夜深了，早点休息~'
  ];

  var SAY_CLICK = [
    '喵！别戳我~',
    '嘿嘿，被你发现啦',
    '摸鱼快乐~',
    '喵呜~ 你好呀'
  ];

  function initCat() {
    if (!enabled || document.getElementById('el-pet')) return;

    var pet = document.createElement('div');
    pet.id = 'el-pet';
    pet.setAttribute('aria-label', '像素猫');

    var bubble = document.createElement('div');
    bubble.className = 'el-pet-bubble';
    bubble.setAttribute('role', 'status');
    bubble.setAttribute('aria-live', 'polite');

    var cat = document.createElement('button');
    cat.type = 'button';
    cat.className = 'el-pet-cat';
    cat.setAttribute('aria-label', '和像素猫互动');

    pet.appendChild(bubble);
    pet.appendChild(cat);
    document.body.appendChild(pet);

    cat.style.backgroundImage = 'url(/img/oneko.gif)';
    cat.style.backgroundSize = SHEET_W + 'px ' + SHEET_H + 'px';

    var state = 'idle';
    var frame = 0;
    var stateUntil = 0;
    var nextIdleAt = 0;
    var rafId = null;
    var bubbleTimer = null;

    function setSprite(name, f) {
      var s = SPRITE[name][f % SPRITE[name].length];
      cat.style.backgroundPosition = s[0] * DISPLAY + 'px ' + s[1] * DISPLAY + 'px';
    }

    function say(text, ms) {
      bubble.textContent = text;
      bubble.classList.add('is-visible');
      if (bubbleTimer) clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(function () {
        bubble.classList.remove('is-visible');
      }, ms || 3600);
    }

    function enter(name, dur) {
      state = name;
      frame = 0;
      stateUntil = performance.now() + dur;
    }

    function react() {
      enter('alert', 1100);
      say(SAY_CLICK[(Math.random() * SAY_CLICK.length) | 0]);
    }

    cat.addEventListener('click', react);

    function tick(now) {
      if (state !== 'idle' && now > stateUntil) {
        state = 'idle';
        nextIdleAt = now + 15000 + Math.random() * 15000;
      }

      if (state === 'idle' && now > nextIdleAt) {
        var pick = Math.random();
        if (pick < 0.45) enter('sleeping', 6000);
        else if (pick < 0.75) enter('scratchSelf', 2400);
        else say(SAY_IDLE[(Math.random() * SAY_IDLE.length) | 0]);
        nextIdleAt = now + 15000 + Math.random() * 15000;
      }

      if (state === 'sleeping') {
        setSprite('tired', 0);
        if (now > stateUntil - 3000) setSprite('sleeping', (frame++ % 2));
      } else if (state === 'scratchSelf') {
        setSprite('scratchSelf', (frame++ >> 3) % 3);
      } else if (state === 'alert') {
        setSprite('alert', 0);
      } else {
        setSprite('idle', 0);
      }

      rafId = requestAnimationFrame(tick);
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
      } else if (!rafId) {
        rafId = requestAnimationFrame(tick);
      }
    });

    setSprite('idle', 0);
    nextIdleAt = performance.now() + 6000;
    setTimeout(function () {
      say(SAY_IDLE[(Math.random() * SAY_IDLE.length) | 0]);
    }, 1200);
    rafId = requestAnimationFrame(tick);
  }

  /* ---------------------------------------------------------------------
     赛博禅意点击特效
     --------------------------------------------------------------------- */

  /* 文字反馈：贴合个人成长 / 技术博客氛围 */
  var FEEDBACK = [
    'Knowledge +1',
    'Insight +1',
    'Experience +1',
    '灵感 +1',
    '专注 +1',
    '认知 +1'
  ];

  var DUST_COLORS = ['var(--el-violet)', 'var(--el-sky)', 'var(--el-sakura)', '#a98bff', '#7ec8ff'];

  function autoRemove(el) {
    el.addEventListener('animationend', function () {
      el.remove();
    });
  }

  function initClickFx() {
    if (!enabled) return;
    document.addEventListener(
      'pointerdown',
      function (e) {
        cyberZen(e.clientX, e.clientY);
      },
      { passive: true }
    );
  }

  function cyberZen(x, y) {
    /* 柔和光晕 */
    var glow = document.createElement('span');
    glow.className = 'el-zen-glow';
    glow.style.left = x + 'px';
    glow.style.top = y + 'px';
    document.body.appendChild(glow);
    autoRemove(glow);

    /* 金色能量波纹（双层，第二圈延迟 90ms 造出层次） */
    for (var i = 0; i < 2; i++) {
      var ring = document.createElement('span');
      ring.className = 'el-zen-ring';
      ring.style.left = x + 'px';
      ring.style.top = y + 'px';
      ring.style.animationDelay = i * 90 + 'ms';
      document.body.appendChild(ring);
      autoRemove(ring);
    }

    /* 紫蓝星尘粒子 */
    var n = 5 + ((Math.random() * 3) | 0);
    for (var j = 0; j < n; j++) {
      var d = document.createElement('span');
      d.className = 'el-zen-dust';
      d.style.color = DUST_COLORS[(Math.random() * DUST_COLORS.length) | 0];
      d.style.left = x + 'px';
      d.style.top = y + 'px';
      d.style.setProperty('--dx', (Math.random() * 130 - 65).toFixed(0) + 'px');
      d.style.setProperty('--dy', (-(Math.random() * 110 + 20)).toFixed(0) + 'px');
      d.style.setProperty('--size', (2.5 + Math.random() * 4).toFixed(1) + 'px');
      document.body.appendChild(d);
      autoRemove(d);
    }

    /* 文字反馈 */
    var text = document.createElement('span');
    text.className = 'el-zen-text';
    text.textContent = FEEDBACK[(Math.random() * FEEDBACK.length) | 0];
    text.style.left = x + 'px';
    text.style.top = y - 28 + 'px';
    document.body.appendChild(text);
    autoRemove(text);
  }

  /* ---------------------------------------------------------------------
     启动
     --------------------------------------------------------------------- */

  function boot() {
    if (!enabled) return;
    initCat();
    initClickFx();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('pjax:complete', boot);
})();
