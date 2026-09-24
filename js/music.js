/* ==========================================================================
   EndlessLoop · 全局悬浮音乐播放器（可拖动 / 带歌词）
   --------------------------------------------------------------------------
   行为：
     右下角一个玻璃小圆钮 → 点击才下载 APlayer（约 60KB）与歌单
     → 面板上滑展开，再点一次收起。首屏不加载任何播放器资源。

   二期新增：
     - 小圆钮和面板都能拖着走，位置记在 localStorage，刷新后还在原处
     - 收起状态下，小圆钮旁边会滚一行"当前歌词"
     - 面板展开时是完整歌词区

   歌单来自 Meting API（把网易云 / QQ 音乐等的歌单转成可播放列表）。
   换歌单：改下面 EL_MUSIC.id 即可，server 和 type 一般不用动。

   ⚠️ 公共 Meting API 是第三方免费服务，可能限流或失效。
      如果发现播放列表加载不出来，把 api 换成自建地址（部署 Meting-API 即可）。
   ⚠️ 歌词能不能显示，取决于 Meting 返回的每条 audio 里有没有 lrc 字段。
      它必须是一个 .lrc 文件的 **URL**（lrcType: 3 就是这个意思）。
      注意 APlayer 的 lrcType 没有"数组"这一档：
        1 = 直接给 LRC 文本，2 = LRC 写在 HTML 里，3 = 给 .lrc 的 URL。
      这个接口不返回 lrc 的话歌词区就是空的 —— 那是接口问题，不是代码问题。
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

    volume: 0.7
  };

  window.EL_MUSIC = EL_MUSIC;

  /* APlayer 的主题色（驱动播放器的进度条 / 音量条 / 播放列表当前项高亮）。
     不写死颜色 —— 从 :root 的 --el-sakura 现读，这样色相滑块拖走之后播放器内部也跟着走。

     为什么可以直接用计算值、不做归一化：aplayer 拿到这个串是**原样拼进内联样式**的
     （`background: <theme>` / `style.backgroundColor = <theme>`，见 lib/aplayer.min.js），
     不做任何字符串裁剪或加 alpha 后缀，所以 hsl()/rgb() 都合法。
     这也是这一处最容易漏的原因 —— 它藏在第三方库的配置对象里，
     查 CSS 的字面量残留时完全扫不到。 */
  function accentTheme() {
    var v = getComputedStyle(document.documentElement).getPropertyValue('--el-sakura').trim();
    /* 读不到时兜底给 currentColor，而不是写一份"默认粉"的副本 ——
       副本一旦和 :root 里的值漂移，就变成了第二处需要同步的真相。
       （正常情况下读不到是不可能的：--el-sakura 定义在 custom.css 的 :root 里，
         不依赖 JS、不依赖任何运行时状态。） */
    return v || 'currentColor';
  }

  /* ---------------------------------------------------------------------
     能力判断
     --------------------------------------------------------------------- */

  var CAPS = window.EL_CAPS;
  var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (conn && conn.saveData) return; // 省流模式不打扰

  var STORE_PANEL = 'el-music-pos';
  var STORE_BTN = 'el-music-btn-pos';
  var DRAG_THRESHOLD = 5; // px：小于这个位移就当成点击，不是拖动

  /* ---------------------------------------------------------------------
     构建 UI
     --------------------------------------------------------------------- */

  var ICON_NOTE =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">' +
    '<path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>';

  var ICON_CLOSE =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">' +
    '<path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.3 19.7 2.88 18.3 9.17 12 2.88 5.7 4.3 4.3l6.29 6.29 6.3-6.3z"/></svg>';

  var toggle, panel, playerBox, hintBox, nowPlaying;
  var player = null;
  var loading = false;
  var open = false;

  function buildUI() {
    // 悬浮按钮
    toggle = document.createElement('button');
    toggle.id = 'el-music-toggle';
    toggle.type = 'button';
    toggle.className = 'el-music-toggle';
    toggle.setAttribute('aria-label', '音乐播放器');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = ICON_NOTE;

    // 面板
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
    closeBtn.innerHTML = ICON_CLOSE;
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

    // 收起时贴在圆钮旁边的"当前歌词"
    nowPlaying = document.createElement('div');
    nowPlaying.className = 'el-music-now';
    nowPlaying.setAttribute('aria-hidden', 'true');

    document.body.appendChild(toggle);
    document.body.appendChild(panel);
    document.body.appendChild(nowPlaying);

    // Esc 收起
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && open) setOpen(false);
    });

    // 圆钮点击：拖过就不算点击
    toggle.addEventListener('click', function (e) {
      if (toggle.dataset.dragged === '1') {
        delete toggle.dataset.dragged;
        e.preventDefault();
        return;
      }
      onClick();
    });

    makeDraggable(toggle, toggle, STORE_BTN, null);
    makeDraggable(head, panel, STORE_PANEL, closeBtn);
  }

  /* ---------------------------------------------------------------------
     面板开合
     --------------------------------------------------------------------- */

  function setOpen(next) {
    open = next;
    document.body.classList.toggle('el-music-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    positionNowPlaying();
  }

  /* ---------------------------------------------------------------------
     拖动
     ---------------------------------------------------------------------
     用 Pointer Events（同时覆盖鼠标 / 触摸 / 触控笔），
     拖动期间用 rAF 合并写入，避免每个 pointermove 都改一次样式。

     为什么用 left/top 而不是 transform：
       面板的展开/收起动画本身就在用 transform
       （收起态是 translateY(16px) scale(.97)），
       拖动也走 transform 会和开合动画互相覆盖。
       left/top 和它天然错开，各管各的。

     落定时机：pointerup 才把位置写进 localStorage，
     拖动过程中只改样式，避免高频写存储。
     --------------------------------------------------------------------- */

  function makeDraggable(handle, target, storeKey, excludeEl) {
    var dragging = false;
    var startX = 0;
    var startY = 0;
    var originLeft = 0;
    var originTop = 0;
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
      // 手柄里如果有按钮（面板的关闭键），点它不算拖
      if (excludeEl && e.target.closest && e.target.closest('.el-music-panel__close')) return;
      // 只处理主键 / 触摸
      if (e.button !== undefined && e.button !== 0) return;

      var rect = target.getBoundingClientRect();

      dragging = true;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      originLeft = rect.left;
      originTop = rect.top;
      pendingLeft = rect.left;
      pendingTop = rect.top;

      // 落定成显式 left/top，并把 right/bottom 让开，
      // 否则默认的 right/bottom 锚点会和 left/top 打架。
      // 同时把宽度固定下来 —— 移动端面板原本是 left+right 双向定位
      // （宽度由两边挤出来），一旦改成 left/top，不锁宽度就会缩成内容宽。
      target.style.right = 'auto';
      target.style.bottom = 'auto';
      target.style.left = rect.left + 'px';
      target.style.top = rect.top + 'px';
      target.style.width = rect.width + 'px';
      target.style.maxWidth = 'none';

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

      // 超过阈值才真正进入"拖动"状态，
      // 这样轻微抖动不会把点击吃掉。
      if (!target.dataset.dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        target.dataset.dragging = '1';
        handle.dataset.dragged = '1';
        document.body.classList.add('el-music-dragging');
        // 拖动期间关掉过渡，否则面板会"追"着指针走
        target.style.transition = 'none';
      }

      if (!target.dataset.dragging) return;

      var rect = target.getBoundingClientRect();
      var pos = clamp(originLeft + dx, originTop + dy, rect.width, rect.height);
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
    positionNowPlaying();
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

      // 恢复时也要锁宽度，理由同 makeDraggable 里那段注释
      var rect = item.el.getBoundingClientRect();
      var w = rect.width || (item.el === toggle ? 50 : 360);
      var left = Math.min(Math.max(pos.left, 6), Math.max(6, window.innerWidth - w - 6));
      var top = Math.min(Math.max(pos.top, 6), Math.max(6, window.innerHeight - (rect.height || 60) - 6));

      item.el.style.right = 'auto';
      item.el.style.bottom = 'auto';
      item.el.style.left = left + 'px';
      item.el.style.top = top + 'px';
      item.el.style.width = w + 'px';
      item.el.style.maxWidth = 'none';
    });
    positionNowPlaying();
  }

  /* ---------------------------------------------------------------------
     收起状态的"当前歌词"
     --------------------------------------------------------------------- */

  function positionNowPlaying() {
    if (!nowPlaying || !toggle) return;

    var show = !!player && !open && nowPlaying.textContent;
    nowPlaying.classList.toggle('is-visible', !!show);
    if (!show) return;

    var r = toggle.getBoundingClientRect();
    var w = nowPlaying.offsetWidth || 0;

    // 圆钮在屏幕右半边就把歌词放左边，反之放右边，
    // 免得歌词被拖出屏幕外。
    if (r.left + r.width / 2 > window.innerWidth / 2) {
      nowPlaying.style.left = 'auto';
      nowPlaying.style.right = window.innerWidth - r.left + 10 + 'px';
    } else {
      nowPlaying.style.right = 'auto';
      nowPlaying.style.left = r.left + r.width + 10 + 'px';
    }
    nowPlaying.style.top = r.top + (r.height - (nowPlaying.offsetHeight || 30)) / 2 + 'px';
    void w;
  }

  function bindNowPlaying() {
    var last = '';
    player.on('timeupdate', function () {
      var cur = playerBox.querySelector('.aplayer-lrc p.aplayer-lrc-current');
      var text = cur ? cur.textContent.trim() : '';
      if (text === last) return;
      last = text;
      nowPlaying.textContent = text;
      positionNowPlaying();
    });

    player.on('destroy', function () {
      nowPlaying.textContent = '';
      positionNowPlaying();
    });
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
            // lrc 必须是 .lrc 的 URL（lrcType: 3）。
            // 接口没给就留空，APlayer 会保持歌词区空白而不是报错。
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

  function init() {
    if (player || loading) return;
    loading = true;

    showHint('正在加载歌单…');
    toggle.classList.add('is-loading');

    loadCss('/js/lib/aplayer.min.css');

    loadScript('/js/lib/aplayer.min.js')
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

        player.on('play', function () {
          toggle.classList.add('is-playing');
        });
        player.on('pause', function () {
          toggle.classList.remove('is-playing');
        });
        player.on('ended', function () {
          toggle.classList.remove('is-playing');
        });

        bindNowPlaying();
        positionNowPlaying();
      })
      .catch(function (err) {
        console.warn('[Music]', err);
        showHint('歌单加载失败，可能是公共 API 限流。稍后重试，或改用自己的 Meting API。', true);
      })
      .then(function () {
        loading = false;
        toggle.classList.remove('is-loading');
      });
  }

  function onClick() {
    // 第一次点击：展开面板并加载
    if (!player) {
      setOpen(true);
      init();
      return;
    }

    // 已加载：收起 / 展开
    setOpen(!open);
  }

  /* ---------------------------------------------------------------------
     启动
     --------------------------------------------------------------------- */

  function boot() {
    if (document.getElementById('el-music-toggle')) return; // pjax 重复挂载保护
    buildUI();
    restorePositions();
    window.addEventListener('resize', reclampAll, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('pjax:complete', boot);
})();
