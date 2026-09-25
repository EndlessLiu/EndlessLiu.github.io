/* ==========================================================================
   EndlessLoop · 右侧玻璃拟态迷你音乐卡片（可拖动 / 点击展开完整播放器）
   --------------------------------------------------------------------------
   形态：
     右下角一张常驻的玻璃小卡片（旋转封面唱片 + 歌名/歌手 + 进度条 + 控制键）。
     点卡片空白处（或右上「展开」键）滑出完整 APlayer 面板（歌单 + 歌词）。
     首屏不加载任何播放器资源 —— 第一次点「播放」才去拉 APlayer 与歌单。

   相比旧的圆形悬浮钮，升级点：
     - 封面：唱片样式圆形封面，播放时缓缓自转；无封面时是渐变底 + 音符
     - 歌曲信息：歌名 + 歌手，超长自动省略
     - 控制：上一首 / 播放暂停 / 下一首 / 展开完整播放器
     - 进度条：实时播放进度 + 时间（读 APlayer 的 <audio> 的 currentTime/duration）
     - 动画：唱片自转、播放态均衡器跳动、玻璃高光、液态按压

   卡片与面板都能拖着走，位置记在 localStorage，刷新后还在原处。

   歌单来自 Meting API（把网易云 / QQ 音乐等的歌单转成可播放列表）。
   换歌单：改下面 EL_MUSIC.id 即可；server / type 一般不用动。

   ⚠️ 公共 Meting API 是第三方免费服务，可能限流或失效。
      如果发现播放列表加载不出来，把 api 换成自建地址（部署 Meting-API 即可）。
   ⚠️ 歌词能不能显示，取决于 Meting 返回的每条 audio 里有没有 lrc 字段。
      它必须是一个 .lrc 文件的 **URL**（lrcType: 3 就是这个意思）。
      接口不返回 lrc 的话歌词区就是空的 —— 那是接口问题，不是代码问题。
   ========================================================================== */

(function () {
  'use strict';

  var EL_MUSIC = {
    // 网易云热歌榜，先用它占位，换成自己的歌单 ID 即可
    // 歌单 ID 取法：网页版网易云打开歌单，地址栏 playlist?id= 后面那串数字
    id: '3778678',

    // netease / tencent / kugou / xiami / baidu
    server: 'netease',

    // playlist 歌单 / song 单曲 / album 专辑
    type: 'playlist',

    // 公共 API，失效时可换自建地址
    api: 'https://api.i-meto.com/meting/api',

    volume: 0.7,

    // 打开主页时自动播放。浏览器可能因"无用户交互"拦截自动播放，
    // 被拦截时播放器保持暂停，用户点一下播放键即可（见 maybeAutoPlay）。
    autoPlay: true
  };

  window.EL_MUSIC = EL_MUSIC;

  /* APlayer 的主题色（驱动播放器的进度条 / 音量条 / 播放列表当前项高亮）。
     不写死颜色 —— 从 :root 的 --el-sakura 现读，这样色相滑块拖走之后播放器内部也跟着走。
     aplayer 拿到这个串是原样拼进内联样式（`background: <theme>`），
     不做字符串裁剪或加 alpha 后缀，所以 hsl()/rgb() 都合法。 */
  function accentTheme() {
    var v = getComputedStyle(document.documentElement).getPropertyValue('--el-sakura').trim();
    return v || 'currentColor';
  }

  /* ---------------------------------------------------------------------
     能力判断
     --------------------------------------------------------------------- */

  var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (conn && conn.saveData) return; // 省流模式不打扰

  var STORE_PANEL = 'el-music-pos';
  var STORE_BTN = 'el-music-btn-pos';
  var DRAG_THRESHOLD = 5; // px：小于这个位移就当成点击，不是拖动

  /* ---------------------------------------------------------------------
     图标（全部内联 SVG，颜色走 currentColor，跟随卡片文字色）
     --------------------------------------------------------------------- */

  var ICON = {
    note: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
    prev: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>',
    next: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z"/></svg>',
    list: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.3 19.7 2.88 18.3 9.17 12 2.88 5.7 4.3 4.3l6.29 6.29 6.3-6.3z"/></svg>'
  };

  /* ---------------------------------------------------------------------
     构建 UI
     --------------------------------------------------------------------- */

  var toggle, panel, playerBox, hintBox;
  var disc, coverImg, titleText, artistEl, barFill, timeEl, expandBtn;
  var player = null;
  var loadPromise = null;
  var open = false;

  function buildUI() {
    /* ---- 迷你卡片根。id 沿用 el-music-toggle：pjax 防重 + 位置记忆都靠它，
       但样式类换成 .el-music-mini（旧圆形钮的 .el-music-toggle 类已废弃）。
       卡片本身只是视觉容器：交互入口是里面的按钮（尤其"展开"键，键盘可达），
       所以不给它 role/aria-label，避免变成误导性的 region 地标。 ---- */
    toggle = document.createElement('div');
    toggle.id = 'el-music-toggle';
    toggle.className = 'el-music-mini';

    // 封面唱片（外圈渐变环 + 内圈封面图 + 中心轴孔；无封面时显示音符）
    disc = document.createElement('div');
    disc.className = 'el-music-mini__disc';
    disc.setAttribute('aria-hidden', 'true');
    disc.innerHTML =
      '<div class="el-music-mini__disc-inner">' +
      '<img class="el-music-mini__cover" alt="" />' +
      '<span class="el-music-mini__note">' + ICON.note + '</span>' +
      '</div>' +
      '<span class="el-music-mini__cap"></span>';
    coverImg = disc.querySelector('.el-music-mini__cover');

    // 信息（歌名 + 均衡器 / 歌手）+ 进度条 + 时间
    titleText = document.createElement('span');
    titleText.className = 'el-music-mini__title-text';
    titleText.textContent = '音乐播放器';

    var eq = document.createElement('span');
    eq.className = 'el-music-mini__eq';
    eq.setAttribute('aria-hidden', 'true');
    eq.innerHTML = '<i></i><i></i><i></i>';

    var titleRow = document.createElement('div');
    titleRow.className = 'el-music-mini__title';
    titleRow.appendChild(titleText);
    titleRow.appendChild(eq);

    artistEl = document.createElement('div');
    artistEl.className = 'el-music-mini__artist';
    artistEl.textContent = '点击 ▶ 播放';

    barFill = document.createElement('div');
    barFill.className = 'el-music-mini__bar-fill';
    var bar = document.createElement('div');
    bar.className = 'el-music-mini__bar';
    bar.appendChild(barFill);

    timeEl = document.createElement('span');
    timeEl.className = 'el-music-mini__time';

    var barRow = document.createElement('div');
    barRow.className = 'el-music-mini__bar-row';
    barRow.appendChild(bar);
    barRow.appendChild(timeEl);

    var body = document.createElement('div');
    body.className = 'el-music-mini__body';
    body.appendChild(titleRow);
    body.appendChild(artistEl);
    body.appendChild(barRow);

    // 控制键（上一首 / 播放暂停 / 下一首 / 展开）
    var controls = document.createElement('div');
    controls.className = 'el-music-mini__controls';
    controls.innerHTML =
      '<button class="el-music-mini__btn el-music-mini__prev" type="button" data-el-music="prev" aria-label="上一首">' + ICON.prev + '</button>' +
      '<button class="el-music-mini__btn el-music-mini__play" type="button" data-el-music="toggle" aria-label="播放 / 暂停">' +
      '<span class="el-music-mini__ico el-music-mini__ico--play">' + ICON.play + '</span>' +
      '<span class="el-music-mini__ico el-music-mini__ico--pause">' + ICON.pause + '</span>' +
      '</button>' +
      '<button class="el-music-mini__btn el-music-mini__next" type="button" data-el-music="next" aria-label="下一首">' + ICON.next + '</button>' +
      '<button class="el-music-mini__btn el-music-mini__expand" type="button" data-el-music="expand" aria-label="展开完整播放器" aria-expanded="false">' + ICON.list + '</button>';
    expandBtn = controls.querySelector('[data-el-music="expand"]');

    toggle.appendChild(disc);
    toggle.appendChild(body);
    toggle.appendChild(controls);

    /* ---- 完整面板（歌单 + 歌词）---- */
    panel = document.createElement('div');
    panel.className = 'el-music-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '音乐播放器');

    var head = document.createElement('div');
    head.className = 'el-music-panel__head';
    head.title = '拖动这里可以移动播放器';

    var title = document.createElement('span');
    title.className = 'el-music-panel__title';
    title.textContent = '正在播放';

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'el-music-panel__close';
    closeBtn.setAttribute('aria-label', '收起播放器');
    closeBtn.innerHTML = ICON.close;
    closeBtn.addEventListener('click', function () {
      setOpen(false);
    });

    head.appendChild(title);
    head.appendChild(closeBtn);

    hintBox = document.createElement('div');
    hintBox.className = 'el-music-panel__hint';
    hintBox.textContent = '正在准备播放器…';

    playerBox = document.createElement('div');
    playerBox.id = 'el-music-player';
    playerBox.className = 'el-music-player';

    panel.appendChild(head);
    panel.appendChild(hintBox);
    panel.appendChild(playerBox);

    document.body.appendChild(toggle);
    document.body.appendChild(panel);

    // Esc 收起
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && open) setOpen(false);
    });

    // 卡片空白处点击：拖过不算、控制键不算，其余展开/收起完整面板
    toggle.addEventListener('click', function (e) {
      if (toggle.dataset.dragged === '1') {
        delete toggle.dataset.dragged;
        e.preventDefault();
        return;
      }
      if (e.target.closest && e.target.closest('.el-music-mini__controls')) return;
      onClick();
    });

    // 控制键集中分发。点击会冒泡到上面的卡片 click，
    // 但被 closest('.el-music-mini__controls') 拦下，不会重复触发面板。
    controls.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-el-music]') : null;
      if (btn) handleAction(btn.getAttribute('data-el-music'));
    });

    makeDraggable(toggle, toggle, STORE_BTN, '.el-music-mini__controls');
    makeDraggable(head, panel, STORE_PANEL, '.el-music-panel__close');
  }

  /* ---------------------------------------------------------------------
     控制动作
     --------------------------------------------------------------------- */

  function handleAction(action) {
    if (action === 'toggle') {
      if (player) {
        player.toggle();
      } else if (!loadPromise) {
        // 首次点播放：懒加载，加载完直接开播（不强制展开面板）。
        // 加载中再点不排队第二次 toggle：loadPlayer 复用同一个 promise，
        // 否则偶数次点击会 net 成"播了又立刻停"。
        loadPlayer()
          .then(function (p) {
            p.toggle();
          })
          .catch(function () {
            /* 加载失败：面板里已有错误提示，这里静默 */
          });
      }
    } else if (action === 'prev') {
      if (player) player.skipBack();
    } else if (action === 'next') {
      if (player) player.skipForward();
    } else if (action === 'expand') {
      onClick();
    }
  }

  /* ---------------------------------------------------------------------
     面板开合
     --------------------------------------------------------------------- */

  function setOpen(next) {
    open = next;
    document.body.classList.toggle('el-music-open', open);
    if (expandBtn) expandBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function onClick() {
    // 第一次点击（还没开始加载）：展开面板并加载
    if (!player && !loadPromise) {
      setOpen(true);
      loadPlayer().catch(function () {
        /* 失败提示在面板里 */
      });
      return;
    }
    // 已加载 / 加载中：收起 / 展开（加载中也能收起，不必等歌单回来）
    setOpen(!open);
  }

  /* ---------------------------------------------------------------------
     拖动
     ---------------------------------------------------------------------
     用 Pointer Events（同时覆盖鼠标 / 触摸 / 触控笔），
     拖动期间用 rAF 合并写入，避免每个 pointermove 都改一次样式。

     为什么用 left/top 而不是 transform：
       卡片/面板的展开动画与 hover 都在用 transform，
       拖动也走 transform 会和它们互相覆盖。left/top 天然错开，各管各的。

     落定时机：pointerup 才把位置写进 localStorage，
     拖动过程中只改样式，避免高频写存储。
     --------------------------------------------------------------------- */

  function makeDraggable(handle, target, storeKey, ignoreSelector) {
    var dragging = false;
    var startX = 0;
    var startY = 0;
    var originLeft = 0;
    var originTop = 0;
    var originWidth = 0;
    var originHeight = 0;
    var pendingLeft = 0;
    var pendingTop = 0;
    var raf = null;
    var pointerId = null;

    function flush() {
      raf = null;
      target.style.left = pendingLeft + 'px';
      target.style.top = pendingTop + 'px';
    }

    function clamp(left, top, w, h) {
      var margin = 6;
      var maxL = window.innerWidth - w - margin;
      var maxT = window.innerHeight - h - margin;
      if (maxL < margin) maxL = margin;
      if (maxT < margin) maxT = margin;
      return {
        left: Math.min(Math.max(left, margin), maxL),
        top: Math.min(Math.max(top, margin), maxT)
      };
    }

    handle.addEventListener('pointerdown', function (e) {
      // 手柄里的按钮（卡片的控制键 / 面板的关闭键）不触发拖
      if (ignoreSelector && e.target.closest && e.target.closest(ignoreSelector)) return;
      // 只处理主键 / 触摸
      if (e.button !== undefined && e.button !== 0) return;

      var rect = target.getBoundingClientRect();

      dragging = true;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      originLeft = rect.left;
      originTop = rect.top;
      originWidth = rect.width;
      originHeight = rect.height;
      pendingLeft = rect.left;
      pendingTop = rect.top;

      if (handle.setPointerCapture) {
        try {
          handle.setPointerCapture(e.pointerId);
        } catch (err) {
          /* 某些浏览器在元素不可捕获时会抛，忽略即可 */
        }
      }
    });

    handle.addEventListener('pointermove', function (e) {
      if (!dragging) return;

      var dx = e.clientX - startX;
      var dy = e.clientY - startY;

      // 超过阈值才真正进入"拖动"状态，这样轻微抖动不会把点击吃掉
      if (!target.dataset.dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        target.dataset.dragging = '1';
        handle.dataset.dragged = '1';
        document.body.classList.add('el-music-dragging');
        // 拖动期间关掉过渡，否则元素会"追"着指针走
        target.style.transition = 'none';

        // 真正开拖的这一刻才把 right/bottom 锚点换成 left/top，并把宽度锁死。
        // 放在这里而不是 pointerdown：这样"只点一下不拖"就不会顶掉 CSS 的
        // right/bottom 定位，卡片/面板在没拖过的情况下仍能随断点自适应。
        target.style.right = 'auto';
        target.style.bottom = 'auto';
        target.style.left = originLeft + 'px';
        target.style.top = originTop + 'px';
        target.style.width = originWidth + 'px';
        target.style.maxWidth = 'none';
      }

      if (!target.dataset.dragging) return;

      var pos = clamp(originLeft + dx, originTop + dy, originWidth, originHeight);
      pendingLeft = pos.left;
      pendingTop = pos.top;

      if (!raf) raf = window.requestAnimationFrame(flush);
    });

    function end() {
      if (!dragging) return;
      dragging = false;

      if (target.dataset.dragging) {
        delete target.dataset.dragging;
        document.body.classList.remove('el-music-dragging');
        target.style.transition = '';

        // 只在真的拖过之后才记位置
        try {
          localStorage.setItem(storeKey, JSON.stringify({ left: pendingLeft, top: pendingTop }));
        } catch (err) {
          /* 隐私模式忽略 */
        }
      }

      if (pointerId !== null && handle.releasePointerCapture) {
        try {
          handle.releasePointerCapture(pointerId);
        } catch (err) {
          /* 忽略 */
        }
      }
      pointerId = null;
      checkDock();
    }

    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  // 视口变化后原来的坐标可能跑到屏幕外，重新钳一下
  function reclampAll() {
    [
      { el: toggle, key: STORE_BTN },
      { el: panel, key: STORE_PANEL }
    ].forEach(function (item) {
      var el = item.el;
      if (!el || !el.style.left) return;
      var rect = el.getBoundingClientRect();
      var margin = 6;
      var left = Math.min(Math.max(rect.left, margin), Math.max(margin, window.innerWidth - rect.width - margin));
      var top = Math.min(Math.max(rect.top, margin), Math.max(margin, window.innerHeight - rect.height - margin));
      el.style.left = left + 'px';
      el.style.top = top + 'px';
    });
    checkDock();
  }

  function restorePositions() {
    [
      { el: toggle, key: STORE_BTN },
      { el: panel, key: STORE_PANEL }
    ].forEach(function (item) {
      var raw;
      try {
        raw = localStorage.getItem(item.key);
      } catch (e) {
        return;
      }
      if (!raw) return;

      var pos;
      try {
        pos = JSON.parse(raw);
      } catch (e) {
        return;
      }
      if (!pos || typeof pos.left !== 'number' || typeof pos.top !== 'number') return;

      // 恢复时也要锁宽度，理由同 makeDraggable 里那段注释。
      // 用 offsetWidth/offsetHeight（未受 transform 影响的布局尺寸）而不是
      // getBoundingClientRect()：面板恢复时处于收起态（scale(0.97)），
      // rect 会拿到 97% 的宽高，把宽度锁成 349px 这种错值。
      var w = item.el.offsetWidth || 360;
      var h = item.el.offsetHeight || 70;
      var left = Math.min(Math.max(pos.left, 6), Math.max(6, window.innerWidth - w - 6));
      var top = Math.min(Math.max(pos.top, 6), Math.max(6, window.innerHeight - h - 6));

      item.el.style.right = 'auto';
      item.el.style.bottom = 'auto';
      item.el.style.left = left + 'px';
      item.el.style.top = top + 'px';
      item.el.style.width = w + 'px';
      item.el.style.maxWidth = 'none';
    });
    checkDock();
  }

  /* 靠边自动隐藏：卡片拖到屏幕左右边缘时淡出，悬停恢复 */
  function checkDock() {
    if (!toggle) return;
    var rect = toggle.getBoundingClientRect();
    var threshold = 24; // 距左右边缘 < 24px 算"靠边"
    var docked = rect.left < threshold || window.innerWidth - rect.right < threshold;
    toggle.classList.toggle('is-docked', docked);
  }

  /* ---------------------------------------------------------------------
     迷你卡片状态回显（把 APlayer 的实时状态映射到卡片上）
     --------------------------------------------------------------------- */

  // 换歌：同步歌名 / 歌手 / 封面
  function syncTrack() {
    if (!player || !player.list) return;
    var a = player.list.audios[player.list.index];
    if (!a) return;
    titleText.textContent = a.name || '未知曲目';
    artistEl.textContent = a.artist || '未知艺术家';
    setCover(a.cover);
  }

  function setCover(url) {
    if (!url) {
      disc.classList.remove('has-cover');
      coverImg.removeAttribute('src');
      return;
    }
    coverImg.onload = function () {
      disc.classList.add('has-cover');
    };
    coverImg.onerror = function () {
      disc.classList.remove('has-cover');
      coverImg.removeAttribute('src');
    };
    coverImg.src = url;
  }

  function fmtTime(t) {
    if (!isFinite(t) || t < 0) t = 0;
    var m = Math.floor(t / 60);
    var s = Math.floor(t % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function updateProgress() {
    if (!player || !player.audio) return;
    var cur = player.audio.currentTime || 0;
    var dur = player.audio.duration || 0;
    barFill.style.width = (dur > 0 ? (cur / dur) * 100 : 0).toFixed(2) + '%';
    timeEl.textContent = fmtTime(cur) + ' / ' + (dur > 0 ? fmtTime(dur) : '--:--');
  }

  function bindPlayerEvents() {
    player.on('play', function () {
      toggle.classList.add('is-playing');
    });
    player.on('pause', function () {
      toggle.classList.remove('is-playing');
    });
    player.on('ended', function () {
      toggle.classList.remove('is-playing');
    });
    player.on('listswitch', syncTrack);
    player.on('timeupdate', updateProgress);
  }

  /* ---------------------------------------------------------------------
     资源加载
     --------------------------------------------------------------------- */

  function loadCss(href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.APlayer) return resolve();
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = function () {
        reject(new Error('脚本加载失败: ' + src));
      };
      document.head.appendChild(s);
    });
  }

  function fetchPlaylist() {
    var url =
      EL_MUSIC.api +
      '?server=' + encodeURIComponent(EL_MUSIC.server) +
      '&type=' + encodeURIComponent(EL_MUSIC.type) +
      '&id=' + encodeURIComponent(EL_MUSIC.id) +
      '&r=' + Math.random();

    return fetch(url, { credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (list) {
        if (!Array.isArray(list) || !list.length) {
          throw new Error('歌单为空或 ID 无效');
        }
        return list.map(function (item) {
          return {
            name: item.title || item.name || '未知曲目',
            artist: item.author || item.artist || '未知艺术家',
            url: item.url,
            cover: item.pic || item.cover,
            // lrc 必须是 .lrc 的 URL（lrcType: 3）。接口没给就留空，
            // APlayer 会保持歌词区空白而不是报错。
            lrc: item.lrc || '',
            type: 'auto'
          };
        });
      });
  }

  /* ---------------------------------------------------------------------
     主流程
     --------------------------------------------------------------------- */

  function showHint(text, isError) {
    hintBox.textContent = text;
    hintBox.classList.toggle('is-error', !!isError);
    hintBox.style.display = '';
  }

  function clearLoading() {
    toggle.classList.remove('is-loading');
  }

  /* 懒加载 APlayer + 歌单，返回 Promise。重复调用复用同一次加载，
     失败时把 loadPromise 置空，允许下一次点击重试。 */
  function loadPlayer() {
    if (player) return Promise.resolve(player);
    if (loadPromise) return loadPromise;

    showHint('正在加载歌单…');
    toggle.classList.add('is-loading');
    loadCss('/js/lib/aplayer.min.css');

    loadPromise = loadScript('/js/lib/aplayer.min.js')
      .then(fetchPlaylist)
      .then(function (audio) {
        hintBox.style.display = 'none';

        player = new window.APlayer({
          container: playerBox,
          audio: audio,
          theme: accentTheme(),
          lrcType: 3,
          listFolded: false,
          listMaxHeight: '200px',
          volume: EL_MUSIC.volume,
          preload: 'none',
          mutex: true,
          order: 'list',
          loop: 'all',
          storageName: 'el-music-player',
          // 不自动播放：浏览器会拦截，交给用户点播放键
          autoplay: false
        });

        bindPlayerEvents();
        syncTrack();
        toggle.classList.add('is-ready');
        return player;
      })
      .catch(function (err) {
        console.warn('[Music]', err);
        showHint('歌单加载失败，可能是公共 API 限流。稍后重试，或改用自己的 Meting API。', true);
        loadPromise = null; // 允许下次重试
        throw err;
      });

    // 成功失败都撤掉 loading 态
    loadPromise.then(clearLoading, clearLoading);
    return loadPromise;
  }

  /* ---------------------------------------------------------------------
     启动
     --------------------------------------------------------------------- */

  /* 打开主页时自动加载并播放。浏览器会拦截"无用户交互"的自动播放：
     这里先尝试播放，若被拦（audio 仍暂停），等首次点击/按键后自动补播。 */
  function maybeAutoPlay() {
    if (!EL_MUSIC.autoPlay) return;
    if (!document.querySelector('#page-header.full_page')) return; // 只在主页

    loadPlayer()
      .then(function (p) {
        p.play();

        /* 首次交互兜底：自动播放被拦时，第一次点页面任意处就补播 */
        document.addEventListener(
          'pointerdown',
          function start(e) {
            // 点的是播放器本身时跳过（交给它自己的按钮，避免重复触发）
            var onCard =
              e.target && e.target.closest && e.target.closest('#el-music-toggle');
            if (onCard) return;
            if (p.audio && p.audio.paused) p.play();
            document.removeEventListener('pointerdown', start);
          },
          { passive: true }
        );
      })
      .catch(function () {
        /* 加载失败已在面板提示，这里静默 */
      });
  }

  function boot() {
    if (document.getElementById('el-music-toggle')) return; // pjax 重复挂载保护
    buildUI();
    restorePositions();
    checkDock();
    window.addEventListener('resize', reclampAll, { passive: true });
    maybeAutoPlay();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('pjax:complete', boot);
})();
