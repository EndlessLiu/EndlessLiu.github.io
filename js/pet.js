/* ==========================================================================
   EndlessLoop · 互动宠物窝 + 贴纸点击特效
   --------------------------------------------------------------------------
   宠物窝：用唯一一张 oneko 猫精灵图，通过「缩放 / 镜像 / 换色」变出 5 只
   形态各异的宠物，错落堆在左下角「玻璃小窝」里：
     - 眼神跟随鼠标（整只宠物朝鼠标轻微偏移，距离越近越明显）；
     - 生命动画：呼吸（CSS）、随机眨眼/挠痒/打盹（精灵帧）、偶尔跳一下；
     - 点击某只 → 不同反应 + 随机气泡文字；悬停 → 轻微警觉反应；
     - 随机互相转头/小动作，像一群住在博客里的小家伙。

   点击特效（贴纸）：点击页面任意处弹出 Hello Kitty 风格贴纸 + 核心价值观文字。

   性能：一个 rAF 循环驱动所有宠物的帧与眼神；reduced-motion / 省流 / 移动端降级。
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

  /* ---------------------------------------------------------------------
     宠物窝
     --------------------------------------------------------------------- */

  var FRAME = 32;
  var SCALE = 2.5;              // 精灵基础放大（32px → 80px）
  var DISPLAY = FRAME * SCALE;  // 80
  var SHEET_W = 256 * SCALE;    // 640
  var SHEET_H = 128 * SCALE;    // 320

  var SPRITE = {
    idle: [[-3, -3]],
    alert: [[-7, -3]],
    scratchSelf: [[-5, 0], [-6, 0], [-7, 0]],
    tired: [[-3, -2]],
    sleeping: [[-2, 0], [-2, -1]]
  };

  /* 宠物配置：size=缩放 / flip=镜像 / hue=换色 / x,y=窝内坐标 / z=前后层 / phrases=性格台词 */
  var PET_CONFIGS = [
    { size: 1.1,  flip: 1,  hue: 0,   x: 52,  y: -78,  z: 3, phrases: ['喵~ 你好呀', '今天也要加油鸭！', '在写代码还是摸鱼？', '考研加油！', '点我一下试试~'] },
    { size: 0.85, flip: -1, hue: 90,  x: 10,  y: -60,  z: 2, phrases: ['嘿嘿，被你发现啦', '摸鱼快乐~', '记得多喝水哦', '今天阳光真好~'] },
    { size: 0.92, flip: 1,  hue: 190, x: 96,  y: -56,  z: 1, phrases: ['呼…有点困了', 'zzZ…', '别吵我睡觉~', '梦里也在写代码…'] },
    { size: 0.72, flip: -1, hue: 280, x: 32,  y: -104, z: 4, phrases: ['你在看我吗？', '眼睛会跟着你哦~', '我最活泼啦！', '来呀来呀~'] },
    { size: 0.78, flip: 1,  hue: 330, x: 82,  y: -98,  z: 2, phrases: ['夜深了，早点休息~', '跑完步记得拉伸哦', '今天读了几页书呀？', '慢慢来，比较快~'] }
  ];

  var count = isMobile ? 3 : 5;

  function initPetCorner() {
    if (!enabled || document.getElementById('el-pet-corner')) return;

    var corner = document.createElement('div');
    corner.id = 'el-pet-corner';
    corner.className = 'el-pet-corner';
    corner.setAttribute('aria-label', '互动宠物窝');

    var rug = document.createElement('div');
    rug.className = 'el-pet-corner__rug';
    rug.setAttribute('aria-hidden', 'true');
    corner.appendChild(rug);

    var pets = [];
    for (var i = 0; i < count; i++) {
      pets.push(makePet(corner, PET_CONFIGS[i], i));
    }
    document.body.appendChild(corner);

    // 缓存每只宠物的中心（用于眼神跟随的方向），resize 时更新
    var cacheCenter = function () {
      pets.forEach(function (p) {
        var r = p.wrap.getBoundingClientRect();
        p.cx = r.left + r.width / 2;
        p.cy = r.top + r.height / 2;
      });
    };
    cacheCenter();
    window.addEventListener('resize', cacheCenter, { passive: true });

    // 全局鼠标位置
    var mouseX = -9999;
    var mouseY = -9999;
    document.addEventListener('pointermove', function (e) {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }, { passive: true });

    function tick() {
      for (var k = 0; k < pets.length; k++) {
        updatePet(pets[k], mouseX, mouseY);
      }
      window.requestAnimationFrame(tick);
    }
    window.requestAnimationFrame(tick);
  }

  function makePet(corner, cfg, idx) {
    var wrap = document.createElement('div');
    wrap.className = 'el-pet';
    wrap.style.zIndex = cfg.z;

    var bubble = document.createElement('div');
    bubble.className = 'el-pet-bubble';
    bubble.setAttribute('role', 'status');
    bubble.setAttribute('aria-live', 'polite');

    var cat = document.createElement('button');
    cat.type = 'button';
    cat.className = 'el-pet-cat';
    cat.setAttribute('aria-label', '和宠物互动');
    cat.style.backgroundImage = 'url(/img/oneko.gif)';
    cat.style.backgroundSize = SHEET_W + 'px ' + SHEET_H + 'px';
    cat.style.filter = 'hue-rotate(' + cfg.hue + 'deg)';

    wrap.appendChild(bubble);
    wrap.appendChild(cat);
    corner.appendChild(wrap);

    var pet = {
      wrap: wrap,
      cat: cat,
      bubble: bubble,
      cfg: cfg,
      idx: idx,
      state: 'idle',
      frame: 0,
      stateUntil: 0,
      nextIdleAt: performance.now() + 3000 + Math.random() * 7000,
      lx: 0,
      ly: 0,
      cx: 0,
      cy: 0,
      bubbleTimer: null
    };

    function setSprite(name, f) {
      var s = SPRITE[name][f % SPRITE[name].length];
      cat.style.backgroundPosition = s[0] * DISPLAY + 'px ' + s[1] * DISPLAY + 'px';
    }
    pet.setSprite = setSprite;

    function say(text, ms) {
      bubble.textContent = text;
      bubble.classList.add('is-visible');
      if (pet.bubbleTimer) clearTimeout(pet.bubbleTimer);
      pet.bubbleTimer = setTimeout(function () {
        bubble.classList.remove('is-visible');
      }, ms || 2200);
    }
    pet.say = say;

    /* 点击：警觉 + 随机气泡 */
    cat.addEventListener('click', function () {
      pet.state = 'alert';
      pet.stateUntil = performance.now() + 1200;
      say(cfg.phrases[(Math.random() * cfg.phrases.length) | 0]);
    });

    /* 悬停：轻微警觉反应 */
    cat.addEventListener('mouseenter', function () {
      pet.state = 'alert';
      pet.stateUntil = performance.now() + 900;
    });

    setSprite('idle', 0);

    /* 先落一次基础 transform，保证 initPetCorner 里 cacheCenter 能拿到正确位置 */
    pet.wrap.style.transform =
      'translate(' + cfg.x + 'px,' + cfg.y + 'px) scale(' + cfg.size + ') scaleX(' + cfg.flip + ')';

    return pet;
  }

  function updatePet(pet, mouseX, mouseY) {
    var now = performance.now();

    /* 状态机：随机生命行为 */
    if (pet.state !== 'idle' && now > pet.stateUntil) {
      pet.state = 'idle';
      pet.nextIdleAt = now + 10000 + Math.random() * 14000;
    }
    if (pet.state === 'idle' && now > pet.nextIdleAt) {
      var pick = Math.random();
      if (pick < 0.3) {
        pet.state = 'sleeping';
        pet.stateUntil = now + 6000;
      } else if (pick < 0.52) {
        pet.state = 'scratchSelf';
        pet.stateUntil = now + 2600;
      } else if (pick < 0.62) {
        pet.jumpAt = now;             // 偶尔跳一下
        pet.cat.classList.add('is-jumping');
        setTimeout(function () { pet.cat.classList.remove('is-jumping'); }, 700);
      } else if (pick < 0.75) {
        pet.say(pet.cfg.phrases[(Math.random() * pet.cfg.phrases.length) | 0]);
      }
      pet.nextIdleAt = now + 10000 + Math.random() * 14000;
    }

    /* 渲染精灵帧 */
    if (pet.state === 'sleeping') {
      pet.setSprite('tired', 0);
      if (now > pet.stateUntil - 3000) pet.setSprite('sleeping', (pet.frame++ % 2));
    } else if (pet.state === 'scratchSelf') {
      pet.setSprite('scratchSelf', (pet.frame++ >> 3) % 3);
    } else if (pet.state === 'alert') {
      pet.setSprite('alert', 0);
    } else {
      pet.setSprite('idle', 0);
    }

    /* 眼神跟随：朝鼠标轻微偏移（桌面端，lerp 平滑） */
    if (!isMobile && mouseX > -9999 && pet.cx) {
      var dx = mouseX - pet.cx;
      var dy = mouseY - pet.cy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var range = dist < 260 ? 3.2 : (dist < 600 ? 1.6 : 0);
      var tx = dist > 0 ? (dx / dist) * range : 0;
      var ty = dist > 0 ? (dy / dist) * range : 0;
      pet.lx += (tx - pet.lx) * 0.12;
      pet.ly += (ty - pet.ly) * 0.12;
    }

    /* 应用 transform：基础位置 + 眼神偏移 + 缩放 + 镜像 */
    pet.wrap.style.transform =
      'translate(' + (pet.cfg.x + pet.lx).toFixed(2) + 'px,' + (pet.cfg.y + pet.ly).toFixed(2) + 'px)' +
      ' scale(' + pet.cfg.size + ') scaleX(' + pet.cfg.flip + ')';
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
