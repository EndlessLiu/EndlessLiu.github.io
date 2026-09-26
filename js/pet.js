/* ==========================================================================
   EndlessLoop · 互动宠物群 + 贴纸点击特效
   --------------------------------------------------------------------------
   宠物群：用 img/pet/pets.png（2×3 共 6 只宠物透明图）做精灵图，裁剪出 6 只，
   分散分布在页面左右两侧（左侧 3 只、右侧 3 只），各带一块淡玻璃底座：
     - 眼神跟随鼠标（整只宠物朝鼠标偏移 + 转头，幅度明显）；
     - 生命动画：呼吸、跳跃、伸懒腰、点头、扭动、轻晃，随机冒气泡主动跟访客说话；
     - 点击某只 → 弹跳反应 + 气泡；悬停 → 抬头变亮。

   点击特效（贴纸）：点击页面任意处弹出 Hello Kitty 风格贴纸 + 核心价值观文字。

   性能：一个 rAF 循环驱动眼神跟随；reduced-motion / 省流 / 移动端降级。
   ========================================================================== */

(function () {
  'use strict';

  var CAPS = window.EL_CAPS || {};
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isMobile = window.matchMedia('(max-width: 768px)').matches;
  var enabled =
    CAPS.reduce !== true &&
    CAPS.saveData !== true &&
    !reduceMotion;

  var SHEET_W = 1536;
  var SHEET_H = 1024;

  /* 6 只：side=left/right 分布，offset=距边缘，bottom=距底部（px/vh），dh=显示高度
     左右各 3 只，分别放在「下 / 中 / 上」三个高度，不聚集 */
  var PET_CONFIGS = [
    // 左侧：下 / 中 / 上
    { sx: 11,   sy: 516, sw: 467, sh: 500, dh: 100, side: 'left',  offset: 8,  bottom: '20px', z: 6, phrases: ['你好呀～', '欢迎来玩~', '今天也要加油哦！', '在写代码还是摸鱼？'] },
    { sx: 615,  sy: 0,   sw: 309, sh: 509, dh: 82,  side: 'left',  offset: 12, bottom: '38vh', z: 5, phrases: ['今天读了几页书呀？', '慢慢来，比较快~', '再坚持一下下~', '加油鸭！'] },
    { sx: 1074, sy: 34,  sw: 352, sh: 482, dh: 74,  side: 'left',  offset: 8,  bottom: '66vh', z: 3, phrases: ['夜深了早点休息~', '跑完步记得拉伸哦', '考研加油！', '明天会更好~'] },
    // 右侧：下 / 中 / 上
    { sx: 1110, sy: 516, sw: 279, sh: 507, dh: 84,  side: 'right', offset: 84, bottom: '110px', z: 4, phrases: ['我最小但我最活泼！', '点我呀~', '一起来玩~', '嘿嘿嘿~'] },
    { sx: 588,  sy: 517, sw: 408, sh: 501, dh: 88,  side: 'right', offset: 12, bottom: '40vh', z: 2, phrases: ['你在看我吗？', '嘿嘿，被发现啦', '摸鱼快乐~', '记得多喝水哦'] },
    { sx: 87,   sy: 13,  sw: 390, sh: 499, dh: 76,  side: 'right', offset: 8,  bottom: '66vh', z: 1, phrases: ['呼…有点困了', 'zzZ…', '别吵我睡觉~', '梦里也在写代码…'] }
  ];

  function initPetCorner() {
    if (!enabled || document.getElementById('el-pet-rug--left')) return;

    ['left', 'right'].forEach(function (side) {
      var rug = document.createElement('div');
      rug.className = 'el-pet-rug el-pet-rug--' + side;
      rug.id = 'el-pet-rug--' + side;
      rug.setAttribute('aria-hidden', 'true');
      document.body.appendChild(rug);
    });

    var pets = [];
    PET_CONFIGS.forEach(function (cfg, i) {
      pets.push(makePet(cfg, i));
    });

    var cacheCenter = function () {
      pets.forEach(function (p) {
        var r = p.wrap.getBoundingClientRect();
        p.cx = r.left + r.width / 2;
        p.cy = r.top + r.height / 2;
      });
    };
    cacheCenter();
    window.addEventListener('resize', cacheCenter, { passive: true });

    var mouseX = -9999;
    var mouseY = -9999;
    document.addEventListener('pointermove', function (e) {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }, { passive: true });

    function tick() {
      pets.forEach(function (p) {
        updatePet(p, mouseX, mouseY);
      });
      window.requestAnimationFrame(tick);
    }
    window.requestAnimationFrame(tick);
  }

  function makePet(cfg, idx) {
    var dh = isMobile ? cfg.dh * 0.72 : cfg.dh;
    var k = dh / cfg.sh;
    var dw = cfg.sw * k;

    var wrap = document.createElement('div');
    wrap.className = 'el-pet';
    wrap.style.zIndex = String(9994 + Math.min(cfg.z, 3));
    if (cfg.side === 'left') {
      wrap.style.left = cfg.offset + 'px';
    } else {
      wrap.style.right = cfg.offset + 'px';
    }
    wrap.style.bottom = cfg.bottom;

    var bubble = document.createElement('div');
    bubble.className = 'el-pet-bubble';
    bubble.setAttribute('role', 'status');
    bubble.setAttribute('aria-live', 'polite');

    var body = document.createElement('button');
    body.type = 'button';
    body.className = 'el-pet-body';
    body.setAttribute('aria-label', '和宠物互动');
    body.style.width = dw.toFixed(1) + 'px';
    body.style.height = dh.toFixed(1) + 'px';
    body.style.backgroundImage = 'url(/img/pet/pets.png)';
    body.style.backgroundSize = (SHEET_W * k).toFixed(1) + 'px ' + (SHEET_H * k).toFixed(1) + 'px';
    body.style.backgroundPosition = (-cfg.sx * k).toFixed(1) + 'px ' + (-cfg.sy * k).toFixed(1) + 'px';

    wrap.appendChild(bubble);
    wrap.appendChild(body);
    document.body.appendChild(wrap);

    var pet = {
      wrap: wrap,
      body: body,
      bubble: bubble,
      cfg: cfg,
      idx: idx,
      lx: 0,
      ly: 0,
      tilt: 0,
      cx: 0,
      cy: 0,
      bubbleTimer: null,
      nextActAt: performance.now() + 600 + Math.random() * 1000
    };

    function say(text, ms) {
      bubble.textContent = text;
      bubble.classList.add('is-visible');
      if (pet.bubbleTimer) clearTimeout(pet.bubbleTimer);
      pet.bubbleTimer = setTimeout(function () {
        bubble.classList.remove('is-visible');
      }, ms || 2200);
    }
    pet.say = say;

    function replay(cls) {
      body.classList.remove(cls);
      void body.offsetWidth;
      body.classList.add(cls);
    }

    body.addEventListener('click', function () {
      replay('is-pop');
      say(cfg.phrases[(Math.random() * cfg.phrases.length) | 0]);
    });

    body.addEventListener('mouseenter', function () {
      body.classList.add('is-hover');
    });
    body.addEventListener('mouseleave', function () {
      body.classList.remove('is-hover');
    });

    pet.wrap.style.transform = 'translate(0px,0px)';
    return pet;
  }

  function updatePet(pet, mouseX, mouseY) {
    var now = performance.now();

    /* 随机生命行为 + 主动说话（高频，访客不用点击） */
    if (now > pet.nextActAt) {
      var pick = Math.random();
      if (pick < 0.1) {
        pet.body.classList.add('is-jumping');
        setTimeout(function () { pet.body.classList.remove('is-jumping'); }, 750);
      } else if (pick < 0.18) {
        pet.body.classList.add('is-stretch');
        setTimeout(function () { pet.body.classList.remove('is-stretch'); }, 1100);
      } else if (pick < 0.26) {
        pet.body.classList.add('is-sway');
        setTimeout(function () { pet.body.classList.remove('is-sway'); }, 950);
      } else if (pick < 0.34) {
        pet.body.classList.add('is-nod');
        setTimeout(function () { pet.body.classList.remove('is-nod'); }, 900);
      } else if (pick < 0.42) {
        pet.body.classList.add('is-wiggle');
        setTimeout(function () { pet.body.classList.remove('is-wiggle'); }, 700);
      } else {
        pet.say(pet.cfg.phrases[(Math.random() * pet.cfg.phrases.length) | 0]);
      }
      pet.nextActAt = now + 1200 + Math.random() * 2000;
    }

    /* 眼神跟随：朝鼠标偏移 + 转头 */
    if (!isMobile && mouseX > -9999 && pet.cx) {
      var dx = mouseX - pet.cx;
      var dy = mouseY - pet.cy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var range = dist < 380 ? 20 : (dist < 820 ? 8 : 0);
      var tx = dist > 0 ? (dx / dist) * range : 0;
      var ty = dist > 0 ? (dy / dist) * range : 0;
      pet.lx += (tx - pet.lx) * 0.22;
      pet.ly += (ty - pet.ly) * 0.22;
      var t = dist < 450 ? (dx / dist) * 10 : 0;
      pet.tilt += (t - pet.tilt) * 0.22;
    }

    pet.wrap.style.transform =
      'translate(' + pet.lx.toFixed(2) + 'px,' + pet.ly.toFixed(2) + 'px)' +
      ' rotate(' + (pet.tilt || 0).toFixed(2) + 'deg)';
  }

  /* ---------------------------------------------------------------------
     贴纸点击特效（Hello Kitty 风格贴纸 + 核心价值观文字）
     --------------------------------------------------------------------- */

  var FEEDBACK = [
    '富强', '民主', '文明', '和谐', '自由', '平等',
    '公正', '法治', '爱国', '敬业', '诚信', '友善'
  ];

  var lastFeedback = -1;
  function pickFeedback() {
    var i;
    do {
      i = Math.floor(Math.random() * FEEDBACK.length);
    } while (i === lastFeedback && FEEDBACK.length > 1);
    lastFeedback = i;
    return FEEDBACK[i];
  }

  var isCoarse = window.matchMedia('(max-width: 768px)').matches;
  var lastFxAt = 0;

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
        stickerClick(e.clientX, e.clientY);
      },
      { passive: true }
    );
  }

  function stickerClick(x, y) {
    if (isCoarse) {
      var now = Date.now();
      if (now - lastFxAt < 350) return;
      lastFxAt = now;
    }

    var sticker = document.createElement('img');
    sticker.className = 'el-click-sticker';
    sticker.src = '/img/click.png';
    sticker.alt = '';
    sticker.style.left = x + 'px';
    sticker.style.top = y + 'px';
    document.body.appendChild(sticker);
    autoRemove(sticker);

    var text = document.createElement('span');
    text.className = 'el-click-text';
    text.textContent = pickFeedback();
    text.style.left = x + 'px';
    text.style.top = y - 34 + 'px';
    document.body.appendChild(text);
    autoRemove(text);
  }

  /* ---------------------------------------------------------------------
     启动
     --------------------------------------------------------------------- */

  function boot() {
    if (!enabled) return;
    initPetCorner();
    initClickFx();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('pjax:complete', boot);
})();
