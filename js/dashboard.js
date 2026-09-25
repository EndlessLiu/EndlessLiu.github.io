/* ==========================================================================
   EndlessLoop · 首页仪表盘（打卡热力图 + 考研倒计时 + 每日一言）
   --------------------------------------------------------------------------
   在首页文章列表下方注入一整块「仪表盘」：
     1. 打卡热力图：GitHub 风格 53 周 × 7 天格子，紫色渐变，记录每日打卡；
     2. 考研倒计时：距离 2027.12.18 的实时倒计时（天 + 时:分:秒）；
     3. 每日一言：按日期取一条固定的话（同一天刷新不变）。

   打卡数据存在下面的 CHECKINS 里（日期 → 活跃等级 0-4），
   目前是随机示例，你以后打卡后把对应日期填进来即可。

   只在首页注入（检测 #recent-posts）。全部自定义层，不碰主题模板。
   ========================================================================== */

(function () {
  'use strict';

  /* 考研目标日期 */
  var TARGET = new Date('2027-12-18T00:00:00');

  /* 每日一言（可按需增删） */
  var QUOTES = [
    '无解的话就永远模糊不清吧',
    '橙黄橘绿时',
    '人生小满胜万全',
    '发光先要吃饱饭',
    '向上的生命力比皮囊更有杀伤力',
    '严禁过度自燃',
    '我们天生都是冒险家',
    '别赶路感受路',
    '永远洒脱自由',
    '请允许我枯萎几天',
    '悲伤就大口吃饭',
    '小部分的我',
    '万幸得以相识',
    '看世界听自己',
    '在想什么呢',
    '玫瑰从不慌张',
    '让理性永远占上风',
    '人说百花深处',
    '或许自由更胜一筹',
    '暂停/安静/放空',
    '在幸福里这个角Zzzz',
    '永远做自己想一出是一出',
    '允许一切如其所是',
    '你该是一棵树春华秋实年年繁荣',
    '旺盛的日子里睡大觉',
    '日常事日常是',
    '人类真的需要晴天'
  ];

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

    var quote = document.createElement('div');
    quote.className = 'el-dashboard__card el-quote';
    renderQuote(quote);

    widgets.appendChild(cd);
    widgets.appendChild(quote);
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

  function renderQuote(el) {
    el.innerHTML =
      '<div class="el-quote__label">每日一言</div>' +
      '<p class="el-quote__text"></p>';
    var d = new Date();
    var dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
    el.querySelector('.el-quote__text').textContent = QUOTES[dayOfYear % QUOTES.length];
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
