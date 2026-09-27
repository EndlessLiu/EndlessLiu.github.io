/* ==========================================================================
   EndlessLoop · 首页仪表盘（打卡热力图 + 考研倒计时 + 我的日历）
   --------------------------------------------------------------------------
   在首页文章列表下方注入一整块「仪表盘」：
     1. 打卡热力图：GitHub 风格 53 周 × 7 天格子，紫色渐变，记录每日打卡（看长期坚持）；
     2. 考研倒计时：距离 2027.12.18 的实时倒计时（天 + 时:分:秒）；
     3. 我的日历：可交互月历，点击某天查看/新增/编辑/删除当天记录（看具体某天做了什么）。
        记录按类型（学习/跑步/技术/博客/考试/生活）用不同颜色圆点区分，
        数据存 localStorage，刷新不丢。

   打卡数据存在下面的 CHECKINS 里（日期 → 活跃等级 0-4），
   目前是随机示例，你以后打卡后把对应日期填进来即可。

   只在首页注入（检测 #recent-posts）。全部自定义层，不碰主题模板。
   ========================================================================== */

(function () {
  'use strict';

  /* 考研目标日期 */
  var TARGET = new Date('2027-12-18T00:00:00');

  /* 我的日历 · 记录类型（不同颜色的小圆点区分，颜色固定保证互不混淆） */
  var CAL_TYPES = [
    { key: 'study', label: '学习', emoji: '📚', color: '#5b8cff' },
    { key: 'run',   label: '跑步', emoji: '🏃', color: '#34c99a' },
    { key: 'code',  label: '技术', emoji: '💻', color: '#9a6bff' },
    { key: 'blog',  label: '博客', emoji: '✍️', color: '#ff7fb2' },
    { key: 'exam',  label: '考试', emoji: '📖', color: '#ffa94d' },
    { key: 'life',  label: '生活', emoji: '🌱', color: '#3fd0c9' }
  ];

  /* 日历记录持久化 key（localStorage —— 静态博客无后端的最轻量方案） */
  var CAL_STORE = 'el-calendar-records';

  /* ---------------------------------------------------------------------
     打卡数据
     ---------------------------------------------------------------------
     格式：'YYYY-MM-DD': 活跃等级(0-4)。0 表示没打卡，4 表示很充实。
     示例：'2026-09-25': 2 表示这天打卡了 2 次。
     目前是随机生成的示例，替换成你的真实记录即可。 */
  var CHECKINS = generateDemo();

  var MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  /* ---- 日期工具 ---- */
  function startOfDay(d) {
    var r = new Date(d);
    r.setHours(0, 0, 0, 0);
    return r;
  }
  function addDays(d, n) {
    var r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }
  function dateKey(d) {
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + m + '-' + day;
  }

  /* 示例打卡：过去一年随机生成（40% 的天有打卡），替换成真实数据 */
  function generateDemo() {
    var out = {};
    var end = startOfDay(new Date());
    var start = addDays(end, -364);
    for (var d = new Date(start); d <= end; d = addDays(d, 1)) {
      if (Math.random() < 0.38) out[dateKey(d)] = 1 + ((Math.random() * 4) | 0);
    }
    return out;
  }

  function levelOf(d) {
    return CHECKINS[dateKey(d)] || 0;
  }

  /* ---------------------------------------------------------------------
     构建整块
     --------------------------------------------------------------------- */

  function build() {
    var sec = document.createElement('section');
    sec.className = 'el-dashboard';
    sec.id = 'el-dashboard';

    var head = document.createElement('div');
    head.className = 'el-dashboard__head';
    head.innerHTML =
      '<h2 class="el-dashboard__title">打卡热力图</h2>' +
      '<p class="el-dashboard__sub">记录每一天的学习、跑步与代码</p>';
    sec.appendChild(head);

    /* 热力图 */
    var hcard = document.createElement('div');
    hcard.className = 'el-dashboard__card el-dashboard__heatmap';
    var hmap = document.createElement('div');
    hmap.className = 'hmap';
    renderHeatmap(hmap);
    hcard.appendChild(hmap);
    sec.appendChild(hcard);

    /* 两个小组件 */
    var widgets = document.createElement('div');
    widgets.className = 'el-dashboard__widgets';

    var cd = document.createElement('div');
    cd.className = 'el-dashboard__card el-cd';
    renderCountdown(cd);

    var cal = document.createElement('div');
    cal.className = 'el-dashboard__card el-calendar';
    renderCalendar(cal);

    widgets.appendChild(cd);
    widgets.appendChild(cal);
    sec.appendChild(widgets);

    return sec;
  }

  function renderHeatmap(el) {
    var today = startOfDay(new Date());
    var lastSat = addDays(today, 6 - today.getDay()); // 本周六
    var startSun = addDays(lastSat, -(53 * 7) + 1);   // 53 周前的周日

    /* 月份标签：记录每周（周日那列）的月份，变化时打一个标签 */
    var months = document.createElement('div');
    months.className = 'hmap__months';
    var prevM = -1;
    for (var col = 0; col < 53; col++) {
      var m = addDays(startSun, col * 7).getMonth();
      if (m !== prevM) {
        var s = document.createElement('span');
        s.textContent = MONTHS[m];
        s.style.left = (col / 53 * 100) + '%';
        months.appendChild(s);
        prevM = m;
      }
    }

    /* 网格：53 列 × 7 行，grid-auto-flow: column 自动按列填 */
    var grid = document.createElement('div');
    grid.className = 'hmap__grid';
    for (var c = 0; c < 53; c++) {
      for (var r = 0; r < 7; r++) {
        var date = addDays(startSun, c * 7 + r);
        var lv = levelOf(date);
        var cell = document.createElement('span');
        cell.className = 'hmap__cell hmap-l' + lv;
        cell.title = dateKey(date) + ' · ' + lv + ' 次';
        grid.appendChild(cell);
      }
    }

    /* 图例 */
    var legend = document.createElement('div');
    legend.className = 'hmap__legend';
    legend.innerHTML =
      '<span class="hmap__legend-text">少</span>' +
      [0, 1, 2, 3, 4].map(function (l) {
        return '<i class="hmap__cell hmap-l' + l + '"></i>';
      }).join('') +
      '<span class="hmap__legend-text">多</span>';

    el.appendChild(months);
    el.appendChild(grid);
    el.appendChild(legend);
  }

  function renderCountdown(el) {
    el.innerHTML =
      '<div class="el-cd__label">距离考研还有</div>' +
      '<div class="el-cd__main"><span class="el-cd__days">0</span><span class="el-cd__unit">天</span></div>' +
      '<div class="el-cd__time">00:00:00</div>' +
      '<div class="el-cd__target">目标 2027.12.18</div>';

    var daysEl = el.querySelector('.el-cd__days');
    var timeEl = el.querySelector('.el-cd__time');

    function pad(n) {
      return (n < 10 ? '0' : '') + n;
    }
    function tick() {
      var diff = TARGET - new Date();
      if (diff <= 0) {
        daysEl.textContent = '0';
        timeEl.textContent = '已到';
        return;
      }
      var days = Math.floor(diff / 86400000);
      var hours = Math.floor((diff % 86400000) / 3600000);
      var mins = Math.floor((diff % 3600000) / 60000);
      var secs = Math.floor((diff % 60000) / 1000);
      daysEl.textContent = days;
      timeEl.textContent = pad(hours) + ':' + pad(mins) + ':' + pad(secs);
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ---------------------------------------------------------------------
     我的日历（交互月历 + 每日记录增删改，localStorage 持久化）
     --------------------------------------------------------------------- */

  function calType(key) {
    for (var i = 0; i < CAL_TYPES.length; i++) if (CAL_TYPES[i].key === key) return CAL_TYPES[i];
    return CAL_TYPES[0];
  }

  function calLoad() {
    try {
      var raw = localStorage.getItem(CAL_STORE);
      var o = raw ? JSON.parse(raw) : {};
      return (o && typeof o === 'object') ? o : {};
    } catch (e) {
      return {};
    }
  }

  function calSave(recs) {
    try { localStorage.setItem(CAL_STORE, JSON.stringify(recs)); } catch (e) { /* 隐私模式忽略 */ }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function parseKey(key) {
    var p = key.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function renderCalendar(el) {
    var records = calLoad();
    var now = new Date();
    var viewY = now.getFullYear();
    var viewM = now.getMonth();       // 0-based
    var selKey = dateKey(now);
    var showForm = false;

    el.innerHTML =
      '<div class="el-cal__head">' +
        '<button class="el-cal__nav" type="button" data-cal="prev" aria-label="上一月">‹</button>' +
        '<div class="el-cal__title" data-cal="title"></div>' +
        '<button class="el-cal__nav" type="button" data-cal="next" aria-label="下一月">›</button>' +
      '</div>' +
      '<div class="el-cal__week">' +
        ['一', '二', '三', '四', '五', '六', '日'].map(function (w) { return '<span>' + w + '</span>'; }).join('') +
      '</div>' +
      '<div class="el-cal__grid" data-cal="grid"></div>' +
      '<div class="el-cal__detail" data-cal="detail"></div>';

    var gridEl = el.querySelector('[data-cal="grid"]');
    var detailEl = el.querySelector('[data-cal="detail"]');
    var titleEl = el.querySelector('[data-cal="title"]');

    function daysInMonth(y, m) {
      return new Date(y, m + 1, 0).getDate();
    }

    function dayRecords(key) {
      return records[key] || [];
    }

    function renderGrid() {
      titleEl.textContent = viewY + '年' + (viewM + 1) + '月';

      var first = new Date(viewY, viewM, 1);
      var lead = (first.getDay() + 6) % 7;      // 周一排头：前面补几个上月格
      var total = daysInMonth(viewY, viewM);
      var rows = Math.ceil((lead + total) / 7);
      var frag = document.createDocumentFragment();

      for (var i = 0; i < rows * 7; i++) {
        var dayNum = i - lead + 1;               // 本月 1-based 日
        var cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'el-cal__day';

        var showNum = dayNum;
        if (dayNum < 1 || dayNum > total) {
          // 上月/下月补位格：淡显数字，不可点
          showNum = dayNum < 1 ? daysInMonth(viewY, viewM - 1) + dayNum : dayNum - total;
          cell.className += ' el-cal__day--out';
          cell.disabled = true;
        }

        var num = document.createElement('span');
        num.className = 'el-cal__num';
        num.textContent = showNum;
        cell.appendChild(num);

        if (dayNum >= 1 && dayNum <= total) {
          var d = new Date(viewY, viewM, dayNum);
          var key = dateKey(d);
          var recs = dayRecords(key);
          var uniq = [];
          recs.forEach(function (r) {
            if (uniq.indexOf(r.type) === -1) uniq.push(r.type);
          });

          var dots = document.createElement('span');
          dots.className = 'el-cal__dots';
          uniq.slice(0, 3).forEach(function (t) {
            var dot = document.createElement('i');
            dot.className = 'el-cal__dot';
            dot.style.background = calType(t).color;
            dot.style.boxShadow = '0 0 5px ' + calType(t).color;
            dots.appendChild(dot);
          });
          if (uniq.length > 3) {
            var more = document.createElement('i');
            more.className = 'el-cal__dot el-cal__dot--more';
            more.textContent = '+' + (uniq.length - 3);
            dots.appendChild(more);
          }
          cell.appendChild(dots);

          cell.dataset.key = key;
          if (key === dateKey(now)) cell.className += ' el-cal__day--today';
          if (key === selKey) cell.className += ' el-cal__day--sel';
          if (recs.length) cell.title = key + ' · ' + recs.length + ' 条记录';
        }

        frag.appendChild(cell);
      }

      gridEl.innerHTML = '';
      gridEl.appendChild(frag);
    }

    function renderDetail() {
      var recs = dayRecords(selKey);
      var selDate = parseKey(selKey);

      var head =
        '<div class="el-cal__detail-head">' +
          '<div class="el-cal__detail-date">' +
            '<b>' + (selDate.getMonth() + 1) + '月' + selDate.getDate() + '日</b>' +
            '<span>' + (recs.length ? recs.length + ' 条记录' : '今天做了什么？') + '</span>' +
          '</div>' +
          '<button class="el-cal__add" type="button" data-cal="add">' + (showForm ? '收起' : '+ 添加记录') + '</button>' +
        '</div>';

      var body;
      if (recs.length) {
        body = '<ul class="el-cal__list">' + recs.map(function (r, idx) {
          var t = calType(r.type);
          return '<li class="el-cal__item" data-idx="' + idx + '">' +
            '<i class="el-cal__dot" style="background:' + t.color + ';box-shadow:0 0 5px ' + t.color + '"></i>' +
            '<span class="el-cal__item-type">' + t.emoji + ' ' + t.label + '</span>' +
            '<span class="el-cal__item-text">' + escapeHtml(r.text) + '</span>' +
            '<button class="el-cal__item-btn" type="button" data-cal="edit" data-idx="' + idx + '" aria-label="编辑">✎</button>' +
            '<button class="el-cal__item-btn" type="button" data-cal="del" data-idx="' + idx + '" aria-label="删除">×</button>' +
          '</li>';
        }).join('') + '</ul>';
      } else {
        body = '<div class="el-cal__empty">这一天还没有记录，点右上角「添加记录」开始</div>';
      }

      var form = '';
      if (showForm) {
        form =
          '<form class="el-cal__form" data-cal="form">' +
            '<select class="el-cal__type" data-cal="type">' +
              CAL_TYPES.map(function (t) { return '<option value="' + t.key + '">' + t.emoji + ' ' + t.label + '</option>'; }).join('') +
            '</select>' +
            '<input class="el-cal__text" type="text" maxlength="60" placeholder="记下这一刻…" data-cal="text" />' +
            '<button class="el-cal__submit" type="submit">添加</button>' +
          '</form>';
      }

      detailEl.innerHTML = head + body + form;
    }

    function refresh() {
      renderGrid();
      renderDetail();
    }

    function goMonth(delta) {
      var m = viewY * 12 + viewM + delta;
      viewY = Math.floor(m / 12);
      viewM = ((m % 12) + 12) % 12;
      // 切月后：当前月选中今天，否则选中该月 1 号
      selKey = (viewY === now.getFullYear() && viewM === now.getMonth())
        ? dateKey(now)
        : dateKey(new Date(viewY, viewM, 1));
      showForm = false;
      refresh();
    }

    function addRecord() {
      var typeEl = detailEl.querySelector('[data-cal="type"]');
      var textEl = detailEl.querySelector('[data-cal="text"]');
      var text = textEl ? textEl.value.trim() : '';
      if (!text) return;
      var type = typeEl ? typeEl.value : 'life';
      if (!records[selKey]) records[selKey] = [];
      records[selKey].push({ id: String(Date.now()) + Math.random().toString(16).slice(2), type: type, text: text });
      calSave(records);
      showForm = false;
      refresh();
    }

    function delRecord(idx) {
      var arr = records[selKey];
      if (!arr) return;
      arr.splice(idx, 1);
      if (!arr.length) delete records[selKey];
      calSave(records);
      refresh();
    }

    function editRecord(idx) {
      var arr = records[selKey];
      if (!arr || !arr[idx]) return;
      var li = detailEl.querySelector('[data-idx="' + idx + '"]');
      if (!li) return;
      var textSpan = li.querySelector('.el-cal__item-text');
      if (!textSpan) return;

      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'el-cal__text el-cal__edit';
      input.value = arr[idx].text;
      input.maxLength = 60;
      textSpan.replaceWith(input);
      input.focus();
      input.select();

      var done = false;
      function commit() {
        if (done) return;
        done = true;
        var v = input.value.trim();
        if (v) {
          arr[idx].text = v;
          calSave(records);
        }
        refresh();
      }
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { done = true; refresh(); }
      });
      input.addEventListener('blur', commit);
    }

    // 事件委托：卡片内的点击 / 提交统一处理
    el.addEventListener('click', function (e) {
      var day = e.target.closest ? e.target.closest('.el-cal__day') : null;
      if (day && !day.disabled && day.dataset.key) {
        selKey = day.dataset.key;
        showForm = false;
        refresh();
        return;
      }
      var t = e.target.closest ? e.target.closest('[data-cal]') : null;
      if (!t) return;
      var act = t.getAttribute('data-cal');
      if (act === 'prev') goMonth(-1);
      else if (act === 'next') goMonth(1);
      else if (act === 'add') { showForm = !showForm; renderDetail(); }
      else if (act === 'del') delRecord(parseInt(t.getAttribute('data-idx'), 10));
      else if (act === 'edit') editRecord(parseInt(t.getAttribute('data-idx'), 10));
    });

    el.addEventListener('submit', function (e) {
      if (e.target && e.target.getAttribute('data-cal') === 'form') {
        e.preventDefault();
        addRecord();
      }
    });

    refresh();
  }

  /* ---------------------------------------------------------------------
     启动
     --------------------------------------------------------------------- */

  function boot() {
    var posts = document.getElementById('recent-posts');
    var items = posts && posts.querySelector('.recent-post-items');
    if (!posts || !items) return;              // 只在首页
    if (document.getElementById('el-dashboard')) return; // 防重复

    var sec = build();
    // 插进右侧内容栏、文章列表之前：和文章同列，位于侧栏（简介/公告/分类）右边
    posts.insertBefore(sec, items);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  document.addEventListener('pjax:complete', boot);
})();
