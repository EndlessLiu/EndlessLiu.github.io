/* ==========================================================================
   EndlessLoop · 站点动效脚本
   --------------------------------------------------------------------------
   - 三层景深粒子画布（远景点 / 中景樱花瓣 / 近景光斑）+ 鼠标光晕
     全部在同一个 canvas、同一次 rAF 里画完，不新增渲染循环
   - IntersectionObserver 滚动进场
   - 卡片跟随光标（悬停时局部高光）
   - 自动性能降级：减少动效偏好 / 省流模式 / 低核心数 / 移动端
   无任何第三方依赖，失败时静默降级，不影响页面功能。

   本文件还是全站两个基础设施的提供方（都挂在 window 上，供
   live2d-init.js / music.js / vision.js 复用）：
     window.EL_CAPS    能力探测结果，避免每个脚本各判一遍、阈值还不一致
     window.EL_POINTER 全局唯一的 pointermove 分发器 ——
                       一期 site-fx.js 自己就有两个 mousemove，
                       再让二期的视差和光标环各加一个就是四个，
                       所以这里收敛成一个监听 + 订阅列表。
   ========================================================================== */

(function () {
  'use strict';

  /* ---------------------------------------------------------------------
     能力探测
     --------------------------------------------------------------------- */

  var root = document.documentElement;

  var prefersReduced =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  var saveData = !!(conn && (conn.saveData || /2g/.test(conn.effectiveType || '')));
  var lowCores = (navigator.hardwareConcurrency || 4) <= 4;
  var narrowScreen = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
  var finePointer =
    window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // 粒子动画：桌面端且未要求减少动效时启用
  var FX_PARTICLES = !prefersReduced && !saveData && !narrowScreen;
  // 鼠标光晕：需要精确指针
  var FX_CURSOR = FX_PARTICLES && finePointer;

  /* 用户偏好：樱花 / 光斑粒子。
     两个概念必须分清 ——
       FX_PARTICLES = 这台设备**能不能**跑（能力上限，用户改不了）
       FX_SAKURA    = 用户**想不想要**（外观面板里可切）
     FX_SAKURA 只决定"建好之后要不要开跑"，**不决定建不建**。
     不这样分的话，开关一旦被关掉就再也没有入口把它打开了（画布根本没建）。
     必须在模块求值期读：这是初始状态，晚读一步就得先建好再拆。 */
  function readFxPref(key) {
    try {
      return localStorage.getItem(key) !== 'off';
    } catch (err) {
      return true; // 隐私模式/沙箱里读不到 localStorage，按"开"处理
    }
  }

  var FX_SAKURA = FX_PARTICLES && readFxPref('el-fx-sakura');

  var DPR_CAP = lowCores ? 1.5 : 2;

  /* ---------------------------------------------------------------------
     对外暴露能力表
     ---------------------------------------------------------------------
     必须在这里（模块求值期）就挂上去，不能等 boot()：
     这几个脚本是按 <script> 顺序同步执行的，
     music.js / live2d-init.js / vision.js 在求值时就要读它。
     --------------------------------------------------------------------- */

  window.EL_CAPS = {
    reduce: prefersReduced,
    saveData: saveData,
    slowNet: !!(conn && /2g/.test(conn.effectiveType || '')),
    lowCores: lowCores,
    narrowScreen: narrowScreen,
    finePointer: !!finePointer,
    // 动效总开关：任何一项命中就关掉非必要的持续动画
    allowFx: FX_PARTICLES
  };

  /* ---------------------------------------------------------------------
     全局指针总线
     --------------------------------------------------------------------- */

  var pointerSubs = [];
  var pointerBound = false;

  function dispatchPointer(e) {
    for (var i = 0; i < pointerSubs.length; i++) {
      // 单个订阅者抛错不能连累其他订阅者
      try {
        pointerSubs[i](e);
      } catch (err) {
        /* 静默 */
      }
    }
  }

  window.EL_POINTER = {
    on: function (fn) {
      if (typeof fn !== 'function' || pointerSubs.indexOf(fn) !== -1) return;
      pointerSubs.push(fn);
      if (!pointerBound) {
        pointerBound = true;
        document.addEventListener('pointermove', dispatchPointer, { passive: true });
      }
    },
    off: function (fn) {
      var i = pointerSubs.indexOf(fn);
      if (i !== -1) pointerSubs.splice(i, 1);
    }
  };

  // 拿不到总线时的兜底订阅（理论上不会走到，防的是脚本被单独引入）
  function onPointer(fn) {
    if (window.EL_POINTER) window.EL_POINTER.on(fn);
    else document.addEventListener('pointermove', fn, { passive: true });
  }

  /* ---------------------------------------------------------------------
     滚动进场
     --------------------------------------------------------------------- */

  // 卡片类：位移大、带 will-change，视觉分量最重
  var REVEAL_SELECTOR = '#recent-posts .recent-post-item, #aside-content .card-widget';

  // 文章正文里的元素：数量可能很多（长文几十个 h2 + 代码块），
  // 所以用不带 will-change 的轻量版，避免一次性堆出几十个合成层。
  // 类名对应 vision.css 里的 .el-reveal-soft。
  var REVEAL_SOFT_SELECTOR = [
    '#article-container h2',
    '#article-container h3',
    '#article-container figure.highlight',
    '#article-container table',
    '#article-container blockquote',
    '#pagination-post > *',
    '#related-posts > *',
    '#post .post-copyright',
    '#post .reward'
  ].join(',');

  // 轻量版最多同时挂多少个，超出的直接不做动画（保底）
  var SOFT_LIMIT = 60;

  function collect(selector, cls, limit) {
    var nodes = document.querySelectorAll(selector);
    var out = [];
    var fold = window.innerHeight * 0.92;

    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.classList.contains(cls)) continue;
      // 关键：只给「首屏之外」的元素加进场类。
      // 如果连已经看到的元素一起隐藏再淡入，会闪一下，观感反而更差。
      if (el.getBoundingClientRect().top < fold) continue;
      el.classList.add(cls);
      out.push(el);
      if (limit && out.length >= limit) break;
    }
    return out;
  }

  function initReveal() {
    // 不支持就直接不做动画，元素保持原样可见
    if (!('IntersectionObserver' in window) || prefersReduced) return;

    var pending = collect(REVEAL_SELECTOR, 'el-reveal').concat(
      collect(REVEAL_SOFT_SELECTOR, 'el-reveal-soft', SOFT_LIMIT)
    );

    if (!pending.length) return;

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('el-in');
          io.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.05 }
    );

    for (var j = 0; j < pending.length; j++) io.observe(pending[j]);
  }

  /* ---------------------------------------------------------------------
     粒子 + 光晕画布
     --------------------------------------------------------------------- */

  /* 调色板不再写死：从 :root 的色相令牌现读（--el-sakura / --el-violet / --el-sky / --el-mint）。
     为什么绕一圈用 canvas 归一化：自定义属性的计算值在各浏览器格式不统一
     （可能回 hsl(286, 100%, 81%)，也可能回 hsl(286 100% 81%)），
     而 fillStyle 是标准化的 —— 写进去 hsl()、读出来一定是 #rrggbb 或 rgb(...)。
     fillStyle 赋非法值时会被静默忽略、保留上一次的值，所以先写 #000 再写目标色。
     兜底用白色而不是某个品牌色：这里写死的任何颜色都会变成色相滑块够不到的残留。 */
  var COLOR_TOKENS = {
    sakura: '--el-sakura',
    violet: '--el-violet',
    sky: '--el-sky',
    mint: '--el-mint'
  };

  function readAccentColors() {
    var cs = getComputedStyle(document.documentElement);
    var probe = document.createElement('canvas').getContext('2d');
    var out = {};

    Object.keys(COLOR_TOKENS).forEach(function (key) {
      var raw = cs.getPropertyValue(COLOR_TOKENS[key]).trim();
      if (!raw) {
        out[key] = '255,255,255';
        return;
      }
      probe.fillStyle = '#000';
      probe.fillStyle = raw;
      var hex = String(probe.fillStyle);
      var m = /^#([0-9a-f]{6})$/i.exec(hex);
      if (m) {
        var n = parseInt(m[1], 16);
        out[key] = ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
        return;
      }
      m = /rgb\((\d+)\D+(\d+)\D+(\d+)\)/.exec(hex); // 极老浏览器
      out[key] = m ? m[1] + ',' + m[2] + ',' + m[3] : '255,255,255';
    });

    return out;
  }

  function initCanvas() {
    if (!FX_PARTICLES) return;

    /* 防重复挂载：将来开 pjax 后换页会再跑一次 boot()，
       不挡住就会叠出第二块全屏画布（两份 rAF，双倍开销）。 */
    if (document.getElementById('fx-canvas')) return;

    var canvas = document.createElement('canvas');
    canvas.id = 'fx-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);

    var ctx = canvas.getContext('2d');
    if (!ctx) {
      canvas.remove();
      return;
    }

    /* 四色从色相令牌现读（见文件上方的 readAccentColors）。
       C 保留命名索引，鼠标光晕要按名字取 violet / sakura；COLORS 只给 pickColor 随机用。 */
    var C = readAccentColors();
    var COLORS = [C.sakura, C.violet, C.sky, C.mint];

    /* 色相变了之后重新取色。外观面板拖色相时经 window.EL_FX 调它。
       ⚠️ glowSprites 是按颜色字符串做键缓存的离屏贴图，颜色一变必须清空，
       否则光斑还是老颜色。 */
    function refreshColors() {
      C = readAccentColors();
      COLORS = [C.sakura, C.violet, C.sky, C.mint];
      glowSprites = {};
    }

    /* 对外接口。setParticles 是**函数声明**，写在下面 start/stop 旁边 ——
       声明会提升，所以这里可以先引用、后定义。 */
    window.EL_FX = {
      refreshColors: refreshColors,
      // 外观面板的"樱花光斑"开关走这里：粒子是 canvas + rAF，CSS 关不掉
      setParticles: setParticles
    };

    /* 三层景深。数量、尺寸、速度、透明度都分层，
       近景慢而大、远景小而快，合起来才有纵深，
       而不是一片均匀的"雪花"。
       总量和一期基本持平（一期是 14/24 个），
       但近景光斑只有 2~3 个，所以填充开销反而更低。 */
    var FAR_COUNT = lowCores ? 9 : 16; // 远景小光点
    var MID_COUNT = lowCores ? 6 : 11; // 中景樱花瓣
    var NEAR_COUNT = lowCores ? 2 : 3; // 近景大光斑

    var w = 0;
    var h = 0;
    var dpr = 1;
    var far = [];
    var mid = [];
    var near = [];
    var rafId = null;
    var running = false;
    // 粒子是否开启（初始值来自模块求值期读到的用户偏好）
    var sakuraOn = FX_SAKURA;

    // 鼠标光晕状态
    var pointer = { x: 0, y: 0, active: false };

    function rand(min, max) {
      return min + Math.random() * (max - min);
    }

    /* 近景光斑用径向渐变画。渐变如果在每一帧里现建，
       就是每帧 3 次 createRadialGradient 分配 —— 没必要，
       光斑的颜色是固定的四种，所以每种预渲染成一张离屏贴图，
       之后每帧只是 drawImage。 */
    var glowSprites = {};
    function glowSprite(rgb) {
      if (glowSprites[rgb]) return glowSprites[rgb];
      var size = 128;
      var s = document.createElement('canvas');
      s.width = s.height = size;
      var c = s.getContext('2d');
      var g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, 'rgba(' + rgb + ',0.55)');
      g.addColorStop(0.45, 'rgba(' + rgb + ',0.18)');
      g.addColorStop(1, 'rgba(' + rgb + ',0)');
      c.fillStyle = g;
      c.fillRect(0, 0, size, size);
      glowSprites[rgb] = s;
      return s;
    }

    function pickColor() {
      return COLORS[(Math.random() * COLORS.length) | 0];
    }

    // 远景：小圆点，最快，最淡
    function makeFar(initial) {
      return {
        x: rand(0, w),
        y: initial ? rand(0, h) : rand(-40, -6),
        r: rand(0.9, 2.2),
        vy: rand(0.16, 0.42),
        sway: rand(0.3, 0.9),
        phase: rand(0, Math.PI * 2),
        alpha: rand(0.18, 0.42),
        color: pickColor()
      };
    }

    // 中景：樱花瓣（椭圆 + 自转），一期的主力
    function makeMid(initial) {
      return {
        x: rand(0, w),
        y: initial ? rand(0, h) : rand(-60, -10),
        r: rand(2.2, 6.4),
        vy: rand(0.24, 0.72),
        sway: rand(0.5, 1.5),
        phase: rand(0, Math.PI * 2),
        spin: rand(-0.012, 0.012),
        angle: rand(0, Math.PI * 2),
        alpha: rand(0.28, 0.72),
        color: pickColor()
      };
    }

    // 近景：大光斑，慢、糊、极淡
    function makeNear(initial) {
      return {
        x: rand(0, w),
        y: initial ? rand(0, h) : rand(-160, -80),
        r: rand(34, 82),
        vy: rand(0.08, 0.2),
        sway: rand(1.2, 2.6),
        phase: rand(0, Math.PI * 2),
        alpha: rand(0.14, 0.3),
        color: pickColor()
      };
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function seed() {
      var i;
      far = [];
      mid = [];
      near = [];
      for (i = 0; i < FAR_COUNT; i++) far.push(makeFar(true));
      for (i = 0; i < MID_COUNT; i++) mid.push(makeMid(true));
      for (i = 0; i < NEAR_COUNT; i++) near.push(makeNear(true));
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);

      // 鼠标光晕（画在所有粒子下方，避免盖住前景）
      // 注意：只在 active 时创建渐变，否则每帧都会白分配一个
      if (FX_CURSOR && pointer.active) {
        var glow = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 260);
        // 色从 C 现取（原先写死的是 violet / sakura，透明度原样保留）
        glow.addColorStop(0, 'rgba(' + C.violet + ',0.20)');
        glow.addColorStop(0.45, 'rgba(' + C.sakura + ',0.09)');
        glow.addColorStop(1, 'rgba(' + C.violet + ',0)');
        ctx.fillStyle = glow;
        ctx.fillRect(pointer.x - 260, pointer.y - 260, 520, 520);
      }

      var i;
      var p;
      var dx;

      // ---- 远景：小光点 ----
      ctx.globalAlpha = 1;
      for (i = 0; i < far.length; i++) {
        p = far[i];
        p.y += p.vy;
        p.phase += 0.01;
        dx = Math.sin(p.phase) * p.sway * 8;

        if (p.y - p.r > h + 10) {
          far[i] = makeFar(false);
          continue;
        }

        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = 'rgba(' + p.color + ',1)';
        ctx.beginPath();
        ctx.arc(p.x + dx, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // ---- 中景：樱花瓣 ----
      for (i = 0; i < mid.length; i++) {
        p = mid[i];
        p.y += p.vy;
        p.phase += 0.014;
        p.angle += p.spin;
        dx = Math.sin(p.phase) * p.sway * 12;

        if (p.y - p.r > h + 20) {
          mid[i] = makeMid(false);
          continue;
        }

        ctx.save();
        ctx.translate(p.x + dx, p.y);
        ctx.rotate(p.angle);
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = 'rgba(' + p.color + ',1)';

        // 花瓣：一个椭圆，比圆更有花瓣感，且比贝塞尔便宜
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r, p.r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // ---- 近景：大光斑（最慢、最大、最淡，靠预渲染贴图绘制）----
      for (i = 0; i < near.length; i++) {
        p = near[i];
        p.y += p.vy;
        p.phase += 0.006;
        dx = Math.sin(p.phase) * p.sway * 26;

        if (p.y - p.r > h + 40) {
          near[i] = makeNear(false);
          continue;
        }

        ctx.globalAlpha = p.alpha;
        ctx.drawImage(glowSprite(p.color), p.x + dx - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }

      ctx.globalAlpha = 1;
      rafId = requestAnimationFrame(draw);
    }

    function start() {
      if (running) return;
      running = true;
      rafId = requestAnimationFrame(draw);
    }

    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      ctx.clearRect(0, 0, w, h);
    }

    /* 外观面板开关的落点。关掉时**停 rAF 和藏画布两件都要做**：
       只停 rAF → 画布上留着最后一帧的残影；
       只藏不画 → rAF 还在每帧空转，白烧 CPU。
       打开时重新 seed 一次，让粒子回到随机分布 —— 否则会接着上次停的位置继续飘，
       看起来像"卡住了"。 */
    function setParticles(on) {
      sakuraOn = !!on;
      canvas.style.display = sakuraOn ? '' : 'none';

      if (sakuraOn) {
        seed();
        start();
      } else {
        stop();
      }
    }

    // 鼠标移动：只记录坐标，绘制统一在 rAF 里做。
    // 走全局指针总线，不再自己 addEventListener（见文件头说明）。
    if (FX_CURSOR) {
      onPointer(function (e) {
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        pointer.active = true;
      });

      document.addEventListener('mouseleave', function () {
        pointer.active = false;
      });

      window.addEventListener(
        'scroll',
        function () {
          pointer.active = false;
        },
        { passive: true }
      );
    }

    // 标签页不可见时停掉动画，省电
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      // 回前台时只有在"用户也开着"的情况下才恢复，否则会把面板关掉的粒子又拉起来
      else if (sakuraOn) start();
    });

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        resize();
        seed();
      }, 180);
    });

    resize();
    seed();
    /* 初始就按用户偏好决定跑不跑。关掉时把画布藏起来 ——
       否则它虽然没画，那块透明区域仍然参与命中测试与合成。 */
    if (sakuraOn) {
      start();
    } else {
      canvas.style.display = 'none';
    }
  }

  /* ---------------------------------------------------------------------
     卡片局部高光：只在被悬停的那张卡上更新 CSS 变量
     --------------------------------------------------------------------- */

  function initCardGlow() {
    if (!FX_CURSOR) return;

    var selector = '#recent-posts .recent-post-item, #aside-content .card-widget';
    var current = null;

    onPointer(function (e) {
      var card = e.target && e.target.closest ? e.target.closest(selector) : null;

      if (!card) {
        // 离开卡片时把坐标变量清掉，否则高光会停在最后一次的位置
        if (current) {
          current.style.removeProperty('--el-mx');
          current.style.removeProperty('--el-my');
          current = null;
        }
        return;
      }

      if (card !== current) current = card;

      var rect = card.getBoundingClientRect();
      card.style.setProperty('--el-mx', e.clientX - rect.left + 'px');
      card.style.setProperty('--el-my', e.clientY - rect.top + 'px');
    });
  }

  /* ---------------------------------------------------------------------
     启动
     --------------------------------------------------------------------- */

  function boot() {
    // no-fx 同时被 custom.css 和 vision.css 消费：
    // custom.css 用它让 .el-reveal 直接可见，
    // vision.css 用它关掉背景流光和头像光环。
    // 省流模式也一并关掉，这是纯装饰性的持续动画。
    if (prefersReduced || saveData) root.classList.add('no-fx');

    initReveal();
    initCanvas();
    initCardGlow();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // 兼容以后可能开启的 pjax：换页后重新挂载
  document.addEventListener('pjax:complete', function () {
    boot();
  });
})();
