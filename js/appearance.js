/* ==========================================================================
   EndlessLoop · 外观设置（色相 / 显示模式 / 特效开关）
   --------------------------------------------------------------------------
   这个文件是"单色相推导"体系的操作端：整站颜色只有一个输入 --accent-hue，
   这里给它一个能拖的控件，并把选择记在 localStorage 里。

   加载顺序：必须排在 site-fx.js 之后（要读 window.EL_FX 与 window.EL_CAPS），
   也就是 inject.bottom 的最末一项。

   ⚠️ 三个必须守住的约定
   1) `--accent-hue` 的**定义权在 CSS**（custom.css 的 :root），这里只覆写它的值。
      原因见 custom.css 里的 IACVT 注释：JS 一旦成了定义方，
      JS 挂掉/被 CSP 拦掉时整站颜色会崩成 unset，而不是退回默认色相。
   2) 亮暗模式**复用主题自己的 `theme` 键**（btf.saveToLocal），绝不另起一套 ——
      两套状态打架时，刷新后会出现"图标是深色、页面是浅色"这种没法查的 bug。
   3) 所有事件都用**文档级委托**（closest + 一个 document 监听），
      不往注入的节点上逐个绑 —— 将来开 pjax 时节点会被换掉，委托能活下来。

   面板 DOM 由本文件注入，样式在 source/css/appearance.css。
   ========================================================================== */

(function () {
  'use strict';

  var root = document.documentElement;

  /* 状态键。色相/布局/特效用**裸** localStorage（和 music.js 的 el-music-pos、
     live2d-init.js 的 el-live2d-hidden 一致）；亮暗模式不在这里，见下方说明。 */
  var KEYS = {
    hue: 'el-accent-hue',
    layout: 'el-content-layout',
    gradient: 'el-fx-gradient',
    sakura: 'el-fx-sakura',
    waves: 'el-fx-waves',
    themeMode: 'el-theme-mode'
  };

  /* 布局只有两档，默认列表。写死成白名单而不是直接信 localStorage：
     存进去的字符串将来可能被手改/被别的版本写脏，`html[data-content-layout="list"]`
     匹配不上任何规则就等于"没有布局"，卡片会掉回主题原始形态 ——
     一个读不懂的值应该退回默认，而不是让页面裸奔。 */
  function readLayout() {
    return lsGet(KEYS.layout) === 'grid' ? 'grid' : 'list';
  }

  /* 开关的中文名。syncFxUI 要用它拼"当前设备不启用：xxx"的提示，
     事件处理器也要靠 kind → 处理函数的映射来分发。 */
  var FX_NAME = {
    sakura: '樱花光斑',
    gradient: '背景流光',
    waves: '波浪衔接'
  };

  /* 预设色板。第一项就是默认值，和 custom.css 的 :root 保持一致。
     为什么固定这几个：默认紫、原来的品牌粉、以及蓝紫/天蓝/青绿/暖橙四个方向，
     覆盖冷暖两端，拖起来能立刻看出"色相弧"是怎么跟着走的。 */
  var PRESETS = [
    { h: 286, name: '默认紫' },
    { h: 336, name: '樱粉' },
    { h: 255, name: '蓝紫' },
    { h: 203, name: '天蓝' },
    { h: 171, name: '青绿' },
    { h: 25, name: '暖橙' }
  ];

  var DOCK_ID = 'el-dock';
  var TRIGGER_ID = 'el-dock-btn';

  /* ---------------------------------------------------------------------
     小工具
     --------------------------------------------------------------------- */

  // localStorage 在隐私模式 / 沙箱 iframe 里会抛，一律包起来
  function lsGet(k) {
    try {
      return localStorage.getItem(k);
    } catch (err) {
      return null;
    }
  }

  function lsSet(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch (err) {
      /* 存不下就算了，本次会话内仍然生效 */
    }
  }

  function lsDel(k) {
    try {
      localStorage.removeItem(k);
    } catch (err) {
      /* 同上 */
    }
  }

  /* 从样式表里读默认色相，而不是在 JS 里再抄一份 286。
     为什么不直接读计算值：计算值会把"用户拖过的内联覆盖"一起读出来，
     那样"恢复默认"就变成了"恢复到我刚才拖到的位置"。
     所以扫 CSSOM 找 :root 里那条定义。同源样式表才读得到 cssRules，跨域的跳过。 */
  function stylesheetDefaultHue() {
    var sheets = document.styleSheets;

    for (var i = 0; i < sheets.length; i++) {
      var rules;
      try {
        rules = sheets[i].cssRules;
      } catch (err) {
        continue;
      }
      if (!rules) continue;

      for (var j = 0; j < rules.length; j++) {
        var style = rules[j].style;
        if (!style || !style.getPropertyValue) continue;

        var v = style.getPropertyValue('--accent-hue');
        if (v) {
          var n = parseInt(v, 10);
          if (!isNaN(n)) return n;
        }
      }
    }

    // 真读不到（样式表还没加载完 / 被拦）时才用计划里定的默认值
    return 286;
  }

  var DEFAULT_HUE = stylesheetDefaultHue();

  function currentHue() {
    var n = parseInt(
      (getComputedStyle(root).getPropertyValue('--accent-hue') || '').trim(),
      10
    );
    return isNaN(n) ? DEFAULT_HUE : n;
  }

  /* ---------------------------------------------------------------------
     状态应用
     --------------------------------------------------------------------- */

  function applyHue(h, persist) {
    h = Math.max(0, Math.min(360, Math.round(h)));
    root.style.setProperty('--accent-hue', String(h));
    if (persist) lsSet(KEYS.hue, String(h));

    /* 粒子四色和鼠标光晕的颜色是 site-fx.js **求值期**读一次就缓存的，
       色相变了必须显式通知它重新取色（顺手清掉按颜色缓存的离屏贴图）。 */
    if (window.EL_FX && window.EL_FX.refreshColors) window.EL_FX.refreshColors();

    syncHueUI(h);
  }

  /* 亮暗：三段里只有"跟随系统"需要自己实现。
     主题的 darkmode.autoChangeMode 配的是 false，也就是它**不会**跟着系统走；
     但它的内联脚本对"没有存过 theme 键"这一状态是不干预的 ——
     所以"跟随系统"= 清掉 theme 键 + 我们自己按 prefers-color-scheme 落一次。
     这样主题的键仍然是显式模式的唯一真相，我们只在它缺位时补位。 */
  var mqDark =
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');

  function applySystemTheme() {
    var wantDark = !!(mqDark && mqDark.matches);
    if (window.btf && window.btf.activateDarkMode && window.btf.activateLightMode) {
      // 走主题的函数：它同时会更新 <meta name="theme-color">
      if (wantDark) window.btf.activateDarkMode();
      else window.btf.activateLightMode();
    } else {
      root.dataset.theme = wantDark ? 'dark' : 'light';
    }
  }

  function applyThemeMode(mode) {
    if (mode === 'auto') {
      lsSet(KEYS.themeMode, 'auto');
      lsDel('theme'); // 主题自己的键（存的是 JSON），清掉 = 回到"未设置"
      applySystemTheme();
    } else {
      lsDel(KEYS.themeMode);
      if (window.btf && window.btf.saveToLocal) {
        window.btf.saveToLocal.set('theme', mode, 2);
      }
      if (window.btf && window.btf.activateDarkMode && window.btf.activateLightMode) {
        if (mode === 'dark') window.btf.activateDarkMode();
        else window.btf.activateLightMode();
      } else {
        root.dataset.theme = mode;
      }
    }

    syncModeUI(mode);
  }

  /* 读当前模式。**先看主题的键** —— 顺序不能反：
     主题自己的那枚暗色按钮（#rightside-config-hide 里）随时会写 `theme` 键，
     用户点它一下，我们的 'auto' 标记就过期了。若先看标记，面板会一直
     显示"跟随系统"高亮，而页面其实已经是用户手选的深色 ——
     一个和页面对不上的控件比没有控件更糟。
     theme 键没写（首次访问 / 选了"跟随系统"）就一律当 auto，首次访问即跟随系统。 */
  function currentThemeMode() {
    var t = null;
    if (window.btf && window.btf.saveToLocal) t = window.btf.saveToLocal.get('theme');
    if (t === 'dark' || t === 'light') return t;
    return 'auto';
  }

  /* 特效开关：CSS 侧的显隐走 html 上的 data 属性（见 appearance.css 末尾），
     所以这里只负责写属性 + 存偏好，不需要去碰 vision.js 的注入逻辑。 */
  function readFx(key) {
    return lsGet(key) !== 'off';
  }

  function applyGradient(on, persist) {
    if (persist) lsSet(KEYS.gradient, on ? 'on' : 'off');
    root.dataset.fxGradient = on ? 'on' : 'off';
  }

  /* 樱花开关不能只写属性 —— 粒子是 canvas + rAF，CSS 关不掉。
     真正的开关在 site-fx.js 的 EL_FX.setParticles；能力不足时它不存在，
     这时开关会被置灰（见 syncFxUI）。 */
  function applySakura(on, persist) {
    if (persist) lsSet(KEYS.sakura, on ? 'on' : 'off');
    if (window.EL_FX && window.EL_FX.setParticles) window.EL_FX.setParticles(on);
  }

  /* 波浪开关是纯 CSS 的落点（appearance.css 末尾的 html[data-fx-waves='off']），
     和"背景流光"同一路：只写属性 + 存偏好，不碰 vision.js 的注入逻辑。
     关掉它的实际含义是"首屏与内容区之间不要那层过渡，直接硬接" ——
     这是审美取舍，不是故障，所以关闭态给的是普通的 OFF，不置灰。 */
  function applyWaves(on, persist) {
    if (persist) lsSet(KEYS.waves, on ? 'on' : 'off');
    root.dataset.fxWaves = on ? 'on' : 'off';
  }

  /* 文章布局（列表 / 网格）也是纯 CSS 的落点 —— custom.css 里
     `html[data-content-layout='grid']` 那一组规则负责真的重排，
     这里同样只写属性 + 存偏好。**不重建 DOM**：卡片节点一动，
     波纹、点击热区、pjax 缓存全都要跟着重新挂，代价远大于收益。 */
  function applyLayout(mode, persist) {
    var m = mode === 'grid' ? 'grid' : 'list';
    if (persist) lsSet(KEYS.layout, m);
    root.dataset.contentLayout = m;
    syncLayoutUI(m);
  }

  /* ---------------------------------------------------------------------
     UI 注入
     --------------------------------------------------------------------- */

  function injectTrigger() {
    if (document.getElementById(TRIGGER_ID)) return;

    var host = document.getElementById('rightside-config-show');
    if (!host) return; // 主题没渲染出 rightside（比如某些窄屏布局）就跳过

    var btn = document.createElement('button');
    btn.id = TRIGGER_ID;
    btn.type = 'button';
    btn.title = '外观设置';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', DOCK_ID);
    btn.innerHTML = '<i class="fas fa-palette" aria-hidden="true"></i>';

    // 插在齿轮和"回到顶部"之间，成为右上角按钮列的中间一项
    var gear = document.getElementById('rightside-config');
    if (gear && gear.parentNode === host && gear.nextSibling) {
      host.insertBefore(btn, gear.nextSibling);
    } else {
      host.appendChild(btn);
    }
  }

  function panelHTML() {
    var swatches = PRESETS.map(function (p) {
      return (
        '<button class="el-swatch" type="button" data-el-hue="' +
        p.h +
        '" style="--el-swatch-h: ' +
        p.h +
        '" title="' +
        p.name +
        '" aria-pressed="false" aria-label="色相 ' +
        p.h +
        '（' +
        p.name +
        '）"></button>'
      );
    }).join('');

    return (
      '<div class="el-dock__head">' +
      '<span class="el-dock__title">外观</span>' +
      '<span class="el-dock__dot" aria-hidden="true"></span>' +
      '<button class="el-dock__close" type="button" data-el-close aria-label="关闭外观设置">' +
      '<i class="fas fa-xmark" aria-hidden="true"></i></button>' +
      '</div>' +

      '<section class="el-set">' +
      '<label class="el-set__label" for="el-hue-input">主题色相</label>' +
      '<div class="el-hue__top">' +
      '<input class="el-hue__input" id="el-hue-input" type="range" min="0" max="360" step="1" value="' +
      DEFAULT_HUE +
      '">' +
      '<output class="el-hue__out" for="el-hue-input" id="el-hue-out">' +
      DEFAULT_HUE +
      '°</output>' +
      '</div>' +
      '<div class="el-hue__bottom">' +
      '<div class="el-swatches">' +
      swatches +
      '</div>' +
      '<button class="el-reset" type="button" data-el-reset>恢复默认</button>' +
      '</div>' +
      '</section>' +

      '<section class="el-set">' +
      '<span class="el-set__label">显示模式</span>' +
      '<div class="el-seg" role="group" aria-label="显示模式">' +
      '<button type="button" data-el-mode="auto" aria-pressed="false">跟随系统</button>' +
      '<button type="button" data-el-mode="light" aria-pressed="false">浅色</button>' +
      '<button type="button" data-el-mode="dark" aria-pressed="false">深色</button>' +
      '</div>' +
      '</section>' +

      '<section class="el-set">' +
      '<span class="el-set__label">文章布局</span>' +
      '<div class="el-seg" role="group" aria-label="文章布局">' +
      '<button type="button" data-el-layout="list" aria-pressed="false">列表</button>' +
      '<button type="button" data-el-layout="grid" aria-pressed="false">网格</button>' +
      '</div>' +
      '<p class="el-switch__note" data-el-layout-note></p>' +
      '</section>' +

      '<section class="el-set">' +
      '<span class="el-set__label">特效</span>' +
      '<label class="el-switch">' +
      '<input type="checkbox" data-el-fx="sakura" checked>' +
      '<em aria-hidden="true"></em><span>樱花光斑</span>' +
      '</label>' +
      '<label class="el-switch">' +
      '<input type="checkbox" data-el-fx="gradient" checked>' +
      '<em aria-hidden="true"></em><span>背景流光</span>' +
      '</label>' +
      '<label class="el-switch">' +
      '<input type="checkbox" data-el-fx="waves" checked>' +
      '<em aria-hidden="true"></em><span>波浪衔接</span>' +
      '</label>' +
      '<p class="el-switch__note" data-el-fx-note></p>' +
      '</section>'
    );
  }

  function injectPanel() {
    if (document.getElementById(DOCK_ID)) return;

    var panel = document.createElement('div');
    panel.id = DOCK_ID;
    panel.className = 'el-dock';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '外观设置');
    panel.innerHTML = panelHTML();

    /* 必须挂在 <body> 下，不能挂进 #rightside：
       那一列上有 transform（包含块）和 opacity（backdrop root），
       挂进去会导致面板被推出屏幕、玻璃失效。详见 appearance.css 头部注释。 */
    document.body.appendChild(panel);
  }

  /* ---------------------------------------------------------------------
     无封面文章的占位封面
     --------------------------------------------------------------------- */

  /* 为什么这里必须注入**真实元素**，而不是给 .post_cover 写样式：
     本站三篇文章在 front-matter 里都没有配 cover，主题于是**根本不渲染
     .post_cover 节点** —— 编译产物 `index.css:2726` 有一条
     `&.no-cover { width: 100% }`，直接把文字区铺满整卡。
     给一个不存在的元素写样式不会有任何效果，而且是静默失败。
     伪元素也走不通：::before 没法当兄弟节点的 flex 项。

     降级行为（刻意的）：JS 没跑（被 CSP 拦 / 用户禁用）时这些块不存在，
     卡片回到"整宽文字卡"的原样 —— 纯装饰，不会崩布局。
     将来若有文章配了 cover，.post_cover 已存在就跳过，不会出现两个封面。 */
  var COVER_ICONS = ['fa-book-open', 'fa-code', 'fa-pen-nib', 'fa-mug-hot'];

  function initCardCovers() {
    var items = document.querySelectorAll('#recent-posts .recent-post-item');

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      /* ads-wrap 是主题留给 AdSense 的插槽（`display:block !important` 撑成通栏），
         它不是文章卡 —— 给它塞装饰封面会是"广告位上挂了个假封面"。 */
      if (it.classList.contains('ads-wrap')) continue;
      if (it.querySelector('.post_cover') || it.querySelector('.el-card-cover')) continue;

      /* 封面必须自己带一块点击面。主题里**只有 .article-title 是链接**，
         整卡并不接受点击（main.js 里没有卡片级的跳转处理）——
         凭空多出一块 42% 宽、看起来能点却点不动的区域，是纯粹的倒退。

         做法：在装饰层里再放一个真正铺满的 <a>，指向与标题同一个 href。
         无障碍上它是**冗余链接**（标题已经提供了可访问名称），所以给
         aria-hidden="true" + tabindex="-1" 让它对读屏和 Tab 键都隐形 ——
         键盘用户仍然只 Tab 到标题那一个链接，不会多出一个重复项。
         （aria-hidden 里放可聚焦元素才是违规；tabindex="-1" 正好躲开那一类。） */
      var title = it.querySelector('.article-title');
      var href = title && title.getAttribute('href');

      var cover = document.createElement('div');
      cover.className = 'el-card-cover';
      cover.setAttribute('aria-hidden', 'true');
      /* 索引写进自定义属性，CSS 拿它错开渐变的角度与色标位置 ——
         否则一排卡片是同一张图复制出来的，比没有封面还显廉价。 */
      cover.style.setProperty('--el-cover-i', String(i));
      cover.innerHTML =
        '<i class="fas ' + COVER_ICONS[i % COVER_ICONS.length] + '" aria-hidden="true"></i>';

      if (href) {
        /* 用 DOM API 赋值而不是拼进 innerHTML：href 是从已渲染的属性里读回来的
           原文，拼字符串时若 slug 里含引号就会破出属性边界。
           （Hexo 会转义，但"上游已经转义过了"不该是这里的安全依据。） */
        var link = document.createElement('a');
        link.className = 'el-card-cover__link';
        link.tabIndex = -1;
        link.href = href;
        cover.appendChild(link);
      }

      it.insertBefore(cover, it.firstChild);
    }
  }

  /* ---------------------------------------------------------------------
     UI 同步
     --------------------------------------------------------------------- */

  function syncHueUI(h) {
    var input = document.getElementById('el-hue-input');
    var out = document.getElementById('el-hue-out');

    if (input && input.value !== String(h)) input.value = String(h);
    if (out) out.textContent = h + '°';

    var swatches = document.querySelectorAll('.el-swatch');
    for (var i = 0; i < swatches.length; i++) {
      var on = parseInt(swatches[i].getAttribute('data-el-hue'), 10) === h;
      swatches[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function syncModeUI(mode) {
    var btns = document.querySelectorAll('[data-el-mode]');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-el-mode') === mode;
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  /* 三个特效开关各有"当前页面上根本没东西可关"的路径，全都要置灰：
     - 樱花：能力不足，或 site-fx.js 的 setParticles 没挂上；
     - 流光：vision.js 的 .el-beam 受 allowMotion 门控（同一套省流/窄屏/
       低核数条件），不满足时它**根本没被注入**；
     - 波浪：只有首页会注入 .el-hero-waves（vision.js 的 initHero 先判 .full_page），
       内页上这一项没有对象 —— 在内页把开关显示成可用是个谎。
     置灰而不是留着假的 ON —— 一个按了没反应的开关比没有开关更糟。
     ⚠️ "没用"和"关掉"要分清：置灰说的是**没有对象**，
     关掉说的是**有对象但用户不要**（波浪就是后者，所以它在首页上是正常可用的）。 */
  function syncFxUI() {
    var allow = !window.EL_CAPS || window.EL_CAPS.allowFx !== false;

    var usable = {
      sakura: allow && !!(window.EL_FX && window.EL_FX.setParticles),
      gradient: !!document.querySelector('.el-beam'),
      waves: !!document.querySelector('.el-hero-waves')
    };

    var boxes = document.querySelectorAll('[data-el-fx]');
    var disabled = [];

    for (var i = 0; i < boxes.length; i++) {
      var kind = boxes[i].getAttribute('data-el-fx');
      if (!(kind in usable)) continue; // 面板加了新开关但这里还没登记时，宁可不碰

      var can = usable[kind];
      boxes[i].disabled = !can;
      boxes[i].checked = can && readFx(KEYS[kind]);

      if (!can) disabled.push(FX_NAME[kind] || kind);
    }

    var note = document.querySelector('[data-el-fx-note]');
    if (note) {
      note.textContent = disabled.length
        ? disabled.join('、') +
          '：当前页面不启用（省流 / 窄屏 / 系统开启了减少动效，或本页没有对应元素）。这是性能取舍，不是故障。'
        : '';
    }
  }

  /* 布局开关在**没有文章卡列表的页面上没有对象**（关于页 / 归档页 / 文章页
     都没有 #recent-posts）—— 那里必须置灰，理由同 syncFxUI：
     一个按了没反应的开关比没有开关更糟。 */
  function syncLayoutUI(mode) {
    var has = !!document.querySelector('#recent-posts .recent-post-item');
    var btns = document.querySelectorAll('[data-el-layout]');

    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-el-layout') === mode;
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      btns[i].disabled = !has;
    }

    var note = document.querySelector('[data-el-layout-note]');
    if (note) {
      note.textContent = has ? '' : '文章布局：本页没有文章卡片列表，这一项只在首页可用。';
    }
  }

  function openPanel() {
    var panel = document.getElementById(DOCK_ID);
    var btn = document.getElementById(TRIGGER_ID);
    if (!panel) return;

    syncHueUI(currentHue());
    syncModeUI(currentThemeMode());
    syncLayoutUI(readLayout());
    syncFxUI();

    panel.classList.add('is-open');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }

  function closePanel() {
    var panel = document.getElementById(DOCK_ID);
    var btn = document.getElementById(TRIGGER_ID);
    if (panel) panel.classList.remove('is-open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function togglePanel() {
    var panel = document.getElementById(DOCK_ID);
    if (!panel) return;
    if (panel.classList.contains('is-open')) closePanel();
    else openPanel();
  }

  function panelIsOpen() {
    var panel = document.getElementById(DOCK_ID);
    return !!panel && panel.classList.contains('is-open');
  }

  /* ---------------------------------------------------------------------
     事件（全部文档级委托，见文件头第 3 条约定）
     --------------------------------------------------------------------- */

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    if (t.closest('#' + TRIGGER_ID)) {
      togglePanel();
      return;
    }

    if (t.closest('[data-el-close]')) {
      closePanel();
      var btn = document.getElementById(TRIGGER_ID);
      if (btn) btn.focus();
      return;
    }

    var swatch = t.closest('[data-el-hue]');
    if (swatch) {
      applyHue(parseInt(swatch.getAttribute('data-el-hue'), 10), true);
      return;
    }

    if (t.closest('[data-el-reset]')) {
      applyHue(DEFAULT_HUE, true);
      return;
    }

    var mode = t.closest('[data-el-mode]');
    if (mode) {
      applyThemeMode(mode.getAttribute('data-el-mode'));
      return;
    }

    var lay = t.closest('[data-el-layout]');
    if (lay) {
      applyLayout(lay.getAttribute('data-el-layout'), true);
      return;
    }

    /* 点面板外面关掉。这条必须放在最后 —— 前面的分支都要先有机会命中。 */
    if (panelIsOpen() && !t.closest('#' + DOCK_ID)) closePanel();
  });

  // range 用 input 事件（拖动过程中连续触发），才能实时预览
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || !t.matches || !t.matches('#el-hue-input')) return;
    applyHue(parseInt(t.value, 10), true);
  });

  /* kind → 处理函数的映射。写成表而不是 if/else 链：加第三项（波浪）时
     漏写一个分支的表现是"开关能拨、页面没反应"，这种 bug 不会报错、
     只能靠人眼发现，所以让它连写错的机会都没有 —— 表里没有的 kind 直接跳过。 */
  var FX_APPLY = {
    sakura: applySakura,
    gradient: applyGradient,
    waves: applyWaves
  };

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.matches || !t.matches('[data-el-fx]')) return;

    var fn = FX_APPLY[t.getAttribute('data-el-fx')];
    if (fn) fn(!!t.checked, true);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panelIsOpen()) {
      closePanel();
      var btn = document.getElementById(TRIGGER_ID);
      if (btn) btn.focus();
    }
  });

  // 只在"跟随系统"模式下跟着系统变；显式选了浅/深就不干预
  if (mqDark && mqDark.addEventListener) {
    mqDark.addEventListener('change', function () {
      if (currentThemeMode() === 'auto') applySystemTheme();
    });
  }

  /* ---------------------------------------------------------------------
     导航右侧的深浅色开关
     --------------------------------------------------------------------- */

  /* 为什么是"注入一个自己的按钮、点击时转发"，而不是把主题的 #darkmode 搬进导航：
     主题用的是 `#rightside` 上的事件委托 ——
         main.js:738  document.getElementById('rightside').addEventListener('click', e => {
                        const $target = e.target.closest('[id]')
                        if ($target && rightSideFn[$target.id]) rightSideFn[$target.id](e.currentTarget, $target)
                      })
     把 #darkmode 节点搬出 #rightside，它就不再经过这条冒泡路径，深色切换直接失效。
     而 .click() 转发能原样复用主题的全部逻辑（localStorage 的 `theme` 键、Snackbar、
     handleThemeChange 对 giscus 等的通知），一行都不用重写，也不用维护第二份状态。
     —— 注意必须复用主题的 `theme` 键，绝不能另起一套，否则两个主题状态会打架。 */
  function initNavTheme() {
    var nav = document.getElementById('nav');
    if (!nav) return;
    if (document.getElementById('el-nav-theme')) return;   // pjax 换页防重复

    var btn = document.createElement('button');
    btn.id = 'el-nav-theme';
    btn.className = 'el-nav-btn';
    btn.type = 'button';
    btn.title = '日间和夜间模式切换';
    btn.setAttribute('aria-label', '切换深色模式');
    btn.innerHTML =
      '<i class="fas fa-moon" aria-hidden="true"></i>' +
      '<i class="fas fa-sun" aria-hidden="true"></i>';

    btn.addEventListener('click', function () {
      var themeBtn = document.getElementById('darkmode');
      if (themeBtn) {
        themeBtn.click();
        return;
      }
      // 兜底：主题节点不在（换主题 / 配置关掉了 rightside）时自己走一遍
      if (!window.btf) return;
      var toDark = document.documentElement.getAttribute('data-theme') !== 'dark';
      if (toDark) btf.activateDarkMode();
      else btf.activateLightMode();
      btf.saveToLocal.set('theme', toDark ? 'dark' : 'light', 2);
    });

    nav.appendChild(btn);
  }

  /* ---------------------------------------------------------------------
     启动
     --------------------------------------------------------------------- */

  function boot() {
    injectTrigger();
    injectPanel();
    initNavTheme();

    /* 重新落一次状态。pre-paint 的内联脚本正常情况下已经把色相和"跟随系统"
       处理过了，这里是为了兜住"内联脚本被 CSP 拦掉 / 被扩展干扰"的情况，
       顺便把控件同步到正确的初始位置。 */
    var storedHue = parseInt(lsGet(KEYS.hue), 10);
    if (!isNaN(storedHue)) applyHue(storedHue, false);
    else syncHueUI(currentHue());

    applyGradient(readFx(KEYS.gradient), false);
    applySakura(readFx(KEYS.sakura), false);
    applyWaves(readFx(KEYS.waves), false);

    /* 先补封面再落布局 —— 顺序反过来的话，网格模式下万一 CSS 还没生效，
       卡片会先按"列表 + 无封面"排一帧再跳，白闪一下。 */
    initCardCovers();
    applyLayout(readLayout(), false);

    if (currentThemeMode() === 'auto') applySystemTheme();
    syncModeUI(currentThemeMode());
    syncFxUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // 兼容以后可能开启的 pjax：换页后把被换掉的节点补回来
  document.addEventListener('pjax:complete', function () {
    boot();
  });
})();
