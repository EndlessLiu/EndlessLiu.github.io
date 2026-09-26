/* ==========================================================================
   EndlessLoop · 二期交互层
   --------------------------------------------------------------------------
   这个文件负责四件事，都不改主题源码、不改页面 DOM 结构：
     1. 背景流光元素注入 + 极轻的鼠标视差
     2. 返回顶部按钮的 SVG 进度环
     3. Giscus 未配置时的友好占位（而不是一片空白 iframe）
     4. 跟随光标的玻璃环 + 点击波纹

   加载顺序：site-fx.js → music.js → live2d-init.js → vision.js
   能力开关优先复用 site-fx.js 暴露的 window.EL_CAPS；
   读不到就自己算一份（脚本顺序被改动时不至于失效）。
   ========================================================================== */

(function () {
  'use strict';

  /* ---------------------------------------------------------------------
     能力判定
     --------------------------------------------------------------------- */

  var CAPS = window.EL_CAPS || (function () {
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    var cores = navigator.hardwareConcurrency || 4;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    var narrow = window.matchMedia('(max-width: 768px)').matches;
    return {
      reduce: reduce,
      saveData: !!(conn && conn.saveData),
      slowNet: !!(conn && /2g/.test(conn.effectiveType || '')),
      lowCores: cores <= 4,
      finePointer: fine,
      narrowScreen: narrow,
      // 动效总开关：任何一项命中就关掉非必要的持续动画
      allowFx: !reduce && !(conn && (conn.saveData || /2g/.test(conn.effectiveType || ''))) && !narrow
    };
  })();

  /* 画布/粒子类动效只在 allowFx 且非低端机上跑 */
  var allowMotion = CAPS.allowFx && !CAPS.lowCores;

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function rafThrottle(fn) {
    var queued = false;
    return function () {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(function () {
        queued = false;
        fn();
      });
    };
  }

  /* =====================================================================
     1. 背景流光 + 视差
     ===================================================================== */

  function initBackground() {
    var bg = document.getElementById('web_bg');
    if (!bg) return; // 主题没配 background 时不会有这个元素

    // 流光光束：只有允许动效时才注入，省流/低端机连元素都不建
    if (allowMotion && !bg.querySelector('.el-beam')) {
      var beam = document.createElement('div');
      beam.className = 'el-beam';
      beam.setAttribute('aria-hidden', 'true');
      bg.appendChild(beam);
    }

    // 背景不再做视差 / 放大 / 模糊（壁纸静止清晰），只保留上面的流光光束注入。
  }

  /* =====================================================================
     2. 返回顶部进度环
     ===================================================================== */

  var RING_LEN = 100.53; // 2 * PI * 16，和 vision.css 里的 viewBox/半径对应

  function initGoUpRing() {
    var goUp = document.getElementById('go-up');
    if (!goUp || goUp.querySelector('.el-ring')) return;

    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'el-ring');
    svg.setAttribute('viewBox', '0 0 36 36');
    svg.setAttribute('aria-hidden', 'true');

    var bgCircle = document.createElementNS(NS, 'circle');
    bgCircle.setAttribute('class', 'el-ring__bg');
    bgCircle.setAttribute('cx', '18');
    bgCircle.setAttribute('cy', '18');
    bgCircle.setAttribute('r', '16');

    var fgCircle = document.createElementNS(NS, 'circle');
    fgCircle.setAttribute('class', 'el-ring__fg');
    fgCircle.setAttribute('cx', '18');
    fgCircle.setAttribute('cy', '18');
    fgCircle.setAttribute('r', '16');

    svg.appendChild(bgCircle);
    svg.appendChild(fgCircle);

    // 插到最前面，让主题原生的百分比文字和箭头压在环上面
    goUp.insertBefore(svg, goUp.firstChild);

    var lastPct = -1;
    var wasTop = null;

    var update = rafThrottle(function () {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var pct = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;

      // 百分比量化到 0.5%，避免每像素都写一次 DOM
      var q = Math.round(pct * 200) / 200;
      if (q !== lastPct) {
        lastPct = q;
        fgCircle.style.strokeDashoffset = (RING_LEN * (1 - q)).toFixed(2);
      }

      goUp.classList.toggle('is-near-bottom', pct > 0.85);
      goUp.classList.toggle('is-at-top', pct <= 0.001);

      // 到顶时脉冲一次，之后不再重复触发
      if (wasTop !== null && wasTop === false && pct <= 0.001) {
        goUp.classList.remove('is-at-top');
        // 强制重排以便动画能重新触发
        void goUp.offsetWidth;
        goUp.classList.add('is-at-top');
      }
      wasTop = pct <= 0.001;
    });

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  }

  /* =====================================================================
     3. Giscus 占位提示
     ---------------------------------------------------------------------
     主题模板无条件渲染 #giscus-wrap，并把带 data-repo-id / data-category-id
     的 <script> 塞进去。如果这两个 ID 还是空的（还没去 giscus.app 生成），
     giscus 会加载出一个空白 iframe，看着像"页面坏了"。
     这里检测到空 ID 就把 script 摘掉，换成人话提示。
     ===================================================================== */

  function initGiscusGuard() {
    var wrap = document.getElementById('giscus-wrap');
    if (!wrap) return;

    function check() {
      var script = wrap.querySelector('script[src*="giscus"]');
      if (!script) return false;

      var repoId = script.getAttribute('data-repo-id') || '';
      var catId = script.getAttribute('data-category-id') || '';
      if (repoId && catId) return true; // 配置完整，交给 giscus 自己跑

      // 配置不全：移除脚本，避免加载空白 iframe
      script.remove();
      if (wrap.querySelector('.el-giscus-placeholder')) return true;

      var box = document.createElement('div');
      box.className = 'el-giscus-placeholder';
      box.innerHTML =
        '<strong>评论还没接通 🔧</strong>' +
        'Giscus 需要在 <a href="https://giscus.app" target="_blank" rel="noopener">giscus.app</a> ' +
        '上生成两个 ID 才能工作：<code>repo_id</code> 和 <code>category_id</code>。' +
        '<br>把它们填进 <code>_config.butterfly.yml</code> 的 <code>giscus:</code> 段，' +
        '重新构建后这里就会变成留言框。';
      wrap.appendChild(box);
      return true;
    }

    if (check()) return;

    // 还没插入（lazyload 打开时，要等评论容器滚进视口才插），监听一下
    var mo = new MutationObserver(function () {
      if (check()) mo.disconnect();
    });
    mo.observe(wrap, { childList: true });

    // 兜底：30 秒后还没等到就放弃，避免 observer 长期挂着
    window.setTimeout(function () {
      mo.disconnect();
    }, 30000);
  }

  /* =====================================================================
     4. 点击波纹
     ===================================================================== */

  var RIPPLE_SELECTOR = [
    '#card-info-btn',
    '#pagination .page-number',
    '#pagination .extend',
    '#rightside > div > button',
    '#aside-content .card-info .site-data > a',
    '.el-music-mini__btn',
    '.el-music-panel__close',
    '#giscus-wrap a',
    '.el-giscus-placeholder a',
    // 首屏两个按钮（阶段 4）。它们是本站最像"按钮"的元素，没波纹反而突兀。
    '.el-hero-btn',
    // 导航右侧的深浅色开关（阶段 3）。圆钮 + 圆形波纹，尺寸正好。
    '.el-nav-btn'
  ].join(',');

  function initRipple() {
    if (!allowMotion) return;

    document.addEventListener(
      'click',
      function (e) {
        var t = e.target;
        if (!t || t.nodeType !== 1 || !t.closest) return;

        var host = t.closest(RIPPLE_SELECTOR);
        if (!host) return;

        // 波纹靠 position: relative + overflow: hidden 定位，
        // 但给导航菜单这类元素加 overflow: hidden 可能裁掉下拉内容，
        // 所以只在真的要画波纹的那一刻、只对白名单元素加。
        host.classList.add('el-ripple-host');

        var rect = host.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        // 直径取对角线，保证无论点在哪里都能铺满
        var size = Math.ceil(Math.sqrt(rect.width * rect.width + rect.height * rect.height) * 2);

        var wave = document.createElement('span');
        wave.className = 'el-ripple-wave';
        wave.style.width = size + 'px';
        wave.style.height = size + 'px';
        wave.style.left = e.clientX - rect.left - size / 2 + 'px';
        wave.style.top = e.clientY - rect.top - size / 2 + 'px';

        host.appendChild(wave);
        wave.addEventListener('animationend', function () {
          wave.remove();
        });
      },
      { passive: true }
    );
  }

  /* =====================================================================
     5. 首页满屏 hero 的装饰层（阶段 4）
     ---------------------------------------------------------------------
     注入三样东西：hero 图、压暗遮罩、波浪衔接。样式全在 custom.css 第 5b 节。
     为什么用 JS 注入真实元素而不是伪元素：#page-header 的 ::before（主题
     --mark-bg 遮罩）与 ::after（站点洗色+网格）都已经被占用了。

     只在**首页**跑（.full_page）。内页的 hero 化是阶段 6 的事，
     那边 .post-bg / .not-home-page 的高度只能靠 CSS 覆盖，做法与这里不同。
     ===================================================================== */

  /* 从 header 的内联 background-image 里取图。
     为什么不读配置：配置在构建期就变成内联样式了（header/index.pug 的
     `style=bg_img`），JS 读不到 YAML。
     为什么不读计算样式：custom.css 第 5 节为了拿掉"上下两张图"已经把它写成
     `background-image: none !important`，计算值恒为 none —— 只剩内联这层留着原值。
     取不到就返回空串，调用方整体放弃注入，退回"纯色 hero"，
     不会留下"有遮罩没图"这种半截状态。 */
  function heroArtUrl(header) {
    var raw = (header.style && header.style.backgroundImage) || '';
    var m = /url\((['"]?)([^'")]+)\1\)/.exec(raw);
    return m ? m[2] : '';
  }

  function initHero() {
    var header = document.getElementById('page-header');
    if (!header || !header.classList.contains('full_page')) return;
    if (header.querySelector('.el-hero-media')) return; // pjax 换页防重复

    var art = heroArtUrl(header);
    if (!art) return;

    var media = document.createElement('div');
    media.className = 'el-hero-media';
    media.setAttribute('aria-hidden', 'true');

    var img = document.createElement('img');
    img.className = 'el-hero-media__art';
    img.src = art;
    img.alt = '';
    img.draggable = false;
    /* 这是 LCP 元素，但它是脚本注入的 —— 预扫描阶段浏览器根本不知道有这张图，
       所以要显式提优先级。同源本地图，没有额外连接开销。 */
    img.setAttribute('fetchpriority', 'high');
    img.decoding = 'async';
    media.appendChild(img);

    var scrim = document.createElement('div');
    scrim.className = 'el-hero-scrim';
    scrim.setAttribute('aria-hidden', 'true');

    /* 四层共用一条 path，靠 y 偏移 + 透明度 + 漂移速度差形成水面层次。
       id 必须是唯一的：<use href> 是**文档级**查找 —— 页面上出现第二个同名
       defs 时，先注入的那个会吃到后者的定义（pjax 换页最容易撞）。
       所以除了 id 唯一，initHero 开头还有一道 querySelector 防重复。 */
    var waves = document.createElement('div');
    waves.className = 'el-hero-waves';
    waves.setAttribute('aria-hidden', 'true');
    waves.innerHTML =
      '<svg viewBox="0 24 150 28" preserveAspectRatio="none" role="presentation">' +
      '<defs><path id="el-gentle-wave" d="M-160 44c30 0 58-18 88-18s58 18 88 18 58-18 88-18 58 18 88 18v48h-352z"></path></defs>' +
      '<g>' +
      '<use href="#el-gentle-wave" x="48" y="0"></use>' +
      '<use href="#el-gentle-wave" x="48" y="3"></use>' +
      '<use href="#el-gentle-wave" x="48" y="5"></use>' +
      '<use href="#el-gentle-wave" x="48" y="7"></use>' +
      '</g></svg>';

    /* 装饰层一律 append 到末尾，层级完全交给 z-index（见 custom.css 第 5b 节的
       层级表）。不插到 #nav 前面去"抢"顺序 —— 主题的 scrollFn 与 nav-fixed
       定位都建立在"#nav 是 header 的第一个孩子"这个假设上，
       虽然它 position: absolute 不看兄弟顺序，但保持原顺序能避免将来改导航时踩坑。 */
    header.appendChild(media);
    header.appendChild(scrim);
    header.appendChild(waves);

    /* ---- 两个按钮 ----
       插在副标题之后、社交图标之前。#site_social_icons 只在配了 social 时才渲染，
       所以用"如果有就拿它当参照、没有就 append"的写法，不赌它一定存在。 */
    var info = header.querySelector('#site-info');
    if (!info) return;

    var actions = document.createElement('div');
    actions.className = 'el-hero-actions';
    actions.innerHTML =
      '<a class="el-hero-btn el-hero-btn--primary" href="#recent-posts" data-el-scroll>' +
      '<i class="fas fa-book-open" aria-hidden="true"></i><span>开始阅读</span></a>' +
      '<a class="el-hero-btn" href="/about/">' +
      '<i class="fas fa-user" aria-hidden="true"></i><span>关于我</span></a>';

    var social = info.querySelector('#site_social_icons');
    if (social) info.insertBefore(actions, social);
    else info.appendChild(actions);
  }

  /* 「开始阅读」的落点。三件事必须一起做对：
     1) 拦掉原生锚点 —— 它不做导航补偿，#recent-posts 的顶部会被固定导航盖住；
     2) **不要自己再减 60** —— btf.scrollToDest 内部已经有 `pos - 70` 的补偿
        （utils.js:145-148），而本站 nav.fixed: true 让它必然命中那个分支，
        再减一次就是减两遍，落点会偏高 130px；
     3) 坐标用 getBoundingClientRect().top + scrollY，不用 offsetTop ——
        offsetTop 是相对 offsetParent 的，不一定是文档坐标。 */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var link = t.closest('[data-el-scroll]');
    if (!link) return;

    var href = link.getAttribute('href') || '';
    if (href.charAt(0) !== '#') return;

    var target = document.getElementById(href.slice(1));
    if (!target) return; // 目标不在（比如首页没有文章列表）就让浏览器按原生锚点走

    e.preventDefault();

    var top = target.getBoundingClientRect().top + window.scrollY;
    if (window.btf && window.btf.scrollToDest) window.btf.scrollToDest(top);
    else target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* =====================================================================
     导航当前页高亮
     ===================================================================== */

  /* Butterfly 桌面导航不带 active 类，这里按 URL 前缀匹配给当前项加 .is-current。
     首页只精确匹配 /，其余菜单项用前缀匹配（/archives/ 命中 /archives/xxx）。 */
  function initNavActive() {
    var links = document.querySelectorAll('#nav #menus .menus_item > a.site-page[href]');
    if (!links.length) return;

    // 先清掉上次的高亮：pjax 换页时 boot() 会重跑，不清会累积两个高亮项
    var stale = document.querySelectorAll('#nav #menus .menus_item.is-current');
    for (var k = 0; k < stale.length; k++) stale[k].classList.remove('is-current');

    var path = location.pathname.replace(/\/+$/, '') || '/';

    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var href = a.getAttribute('href');
      if (!href) continue;

      var aPath;
      try {
        aPath = new URL(href, location.origin).pathname;
      } catch (err) {
        aPath = href;
      }
      aPath = aPath.replace(/\/+$/, '') || '/';

      var match =
        aPath === '/' ? path === '/' : path === aPath || path.indexOf(aPath + '/') === 0;
      if (match && a.parentElement) a.parentElement.classList.add('is-current');
    }
  }

  /* =====================================================================
     启动
     ===================================================================== */

  function boot() {
    initBackground();
    initHero();
    initGoUpRing();
    initGiscusGuard();
    initRipple();
    initNavActive();
  }

  onReady(boot);

  // pjax 目前是关的，留着是为了以后开启时不用再改代码
  document.addEventListener('pjax:complete', boot);
})();
