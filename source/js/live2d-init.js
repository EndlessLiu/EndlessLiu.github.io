/* ==========================================================================
   EndlessLoop · Live2D 看板娘（多模型 / 换装 / 多动作 / 互动）
   --------------------------------------------------------------------------
   为什么不用静态 <script> 标签：
     引擎 1MB + 模型，直接写进 HTML 会挤占首屏带宽。
     这里改成「页面完全加载 → 浏览器空闲 → 再下载」，首屏零影响。

   依赖（全部本地，无外链）：
     /js/lib/oh-my-live2d.min.js      UMD 引擎，暴露 window.OML2D
     /live2d/shizuku/shizuku.model.json   Cubism 2
     /live2d/haru/haru01.model.json       Cubism 2
     /live2d/wanko/wanko.model.json       Cubism 2
     /live2d/hijiki/hijiki.model.json     Cubism 2（未启用，见文件末尾说明）

   想彻底关掉：把 CONFIG.enable 改成 false。

   ⚠️ 关于「换装」的实际含义（不夸大）：
     引擎菜单里的「切换模型」是在下面 models[] 数组里轮换，
     也就是 shizuku → haru → wanko 三个**不同角色**之间切换。
     「切换衣服」需要同一个角色有多套模型文件（path 传数组），
     免费且合法的同角色多套素材我没有，所以对单模型它只会弹一句
     「该模型没有其他衣服~」——这是引擎的优雅降级，不是报错。
     两个菜单项都保留：前者是真能用的换人，后者是留给以后补素材的接口。
   ========================================================================== */

(function () {
  'use strict';

  var CONFIG = {
    enable: true,

    // 引擎脚本
    enginePath: '/js/lib/oh-my-live2d.min.js',

    // 停靠方向：left / right
    // 左边为了给右下角的返回顶部、深浅色切换按钮让位
    dockedPosition: 'left',

    // 移动端是否展示（默认关闭：小屏遮挡内容，且渲染开销大）
    mobileDisplay: false,

    /* 主题色。⚠️ 这里是**故意保留的死值**：看板娘已下架（_config.butterfly.yml 里
       注入 live2d-init.js 的那行 inject.bottom 已删），这个文件当前根本不会被执行，
       所以它不参与"色相滑块必须覆盖全站"那条规则。
       将来若恢复看板娘，**必须**把这一行一起改成从 :root 读：
         getComputedStyle(document.documentElement).getPropertyValue('--el-sakura').trim()
       同一个文件里 :121 的 errorColor: '#F08080' 是语义红（报错必须显红），
       和 --el-danger 同类，恢复时**不要**染成色相派生。 */
    primaryColor: '#ff9ec4',

    // 入场动画时长（ms）
    transitionTime: 900,

    // 首次加载时是否打招呼（用 welcomeTips，按一天中的时段给不同问候）
    sayHello: true,

    /* -----------------------------------------------------------------
       模型列表
       -----------------------------------------------------------------
       scale 是按 layout.width 换算的，不是拍脑袋：
         shizuku / haru / wanko 的 layout.width 分别是 2.4 / 2.9 / 2.9，
         引擎的 scale 是乘在模型原始尺寸上的，
         所以想让三个角色的**屏幕宽度看起来一致**，
         scale 要和 width 成反比：0.075 × (2.4 / 2.9) ≈ 0.062。
         想整体放大/缩小看板娘，等比改这三个数即可。

       ⚠️ wanko 的 layout.y 是 1.8，另外两个是 1.2。
          这意味着 wanko 在它自己的画布里画得偏高，
          三个模型共用同一个 stageBottom 时它可能会"浮"在地面上方。
          如果看起来别扭，只调下面 wanko 的 stageBottom 这一个值：
          往上飘就往负方向调（如 '-60px'），贴太死就往正方向调。

       motionPreloadStrategy：
         可选 'ALL' / 'IDLE' / 'NONE'，默认 'IDLE'。
         实测过这份素材的体积 —— shizuku 的音效文件有 909KB，
         占它总体积的 34%，而下面 volume 设成 0（动作自带音效默认静音），
         也就是说这 909KB 永远不会被播放。
         'ALL' 会把每个动作连同它的音效一起预载，
         等于白下载 1.1MB。所以这里保持 'IDLE'（只预载待机组），
         点击时再按需取那个动作的 .mtn —— 同源静态文件，只有十几 KB，
         首屏省下的是实打实的带宽。
         如果你的机器/网络不在乎，改成 'ALL' 可以换来点击零延迟。
       ----------------------------------------------------------------- */
    models: [
      {
        name: 'shizuku',
        path: '/live2d/shizuku/shizuku.model.json',
        scale: 0.075,
        mobileScale: 0.055,
        motionPreloadStrategy: 'IDLE',
        stageBottom: '12px'
      },
      {
        name: 'haru',
        // 入口是 haru01.model.json，不是 haru.model.json
        path: '/live2d/haru/haru01.model.json',
        scale: 0.062,
        mobileScale: 0.046,
        motionPreloadStrategy: 'IDLE',
        stageBottom: '12px'
      },
      {
        name: 'wanko',
        path: '/live2d/wanko/wanko.model.json',
        scale: 0.062,
        mobileScale: 0.046,
        motionPreloadStrategy: 'IDLE',
        stageBottom: '12px'
      }
    ],

    /* -----------------------------------------------------------------
       状态条
       ⚠️ 这个配置块没有 title 选项，也没有 enable ——
          引擎用的是反向开关 disable（默认 false，也就是默认就开着）。
          写 enable / title 不会报错，但完全不会生效。
       ----------------------------------------------------------------- */
    statusBar: {
      disable: false,
      loadingMessage: '正在唤醒…',
      loadSuccessMessage: '我来啦～',
      loadFailMessage: '唔…加载失败了',
      reloadMessage: '再试一次',
      restMessage: '那我先休息一下…',
      switchingMessage: '正在切换',
      restMessageDuration: 8000,
      errorColor: '#F08080'
    },

    /* -----------------------------------------------------------------
       提示语
       ⚠️ 这里也只认真实存在的键。引擎**没有**"点击头部出提示"这类配置，
          hitHead / hitBody / hoverBody / mouseover 都是不存在的键，
          写了会静默无效（本项目里已经踩过一次同类坑）。
          实际可用的只有下面三组：welcome（进场）/ idle（闲聊循环）/ copy（复制）。
       ----------------------------------------------------------------- */
    tips: {
      // 提示文字最多显示几行
      messageLine: 3,

      // 进场问候，按一天中的时段取值
      welcomeTips: {
        duration: 6000,
        priority: 3,
        message: {
          daybreak: '天快亮了，你还没睡吗？',
          morning: '早上好！新的一天，慢慢来～',
          noon: '中午了，记得好好吃午饭。',
          afternoon: '午后容易犯困呢，来杯咖啡吧～',
          dusk: '傍晚了，今天也辛苦啦。',
          night: '晚上好，今天过得怎么样？',
          lateNight: '已经这么晚了，早点休息吧，晚安～',
          weeHours: '这个点还不睡吗？当心掉头发哦！'
        }
      },

      // 待机闲聊：隔一段时间冒一句
      // wordTheDay 保持 false —— 打开它会去请求第三方「一言」API，
      // 这个站点其他部分已经全部本地化，不该为一句随机文案破例。
      idleTips: {
        wordTheDay: false,
        duration: 5000,
        interval: 14000,
        priority: 2,
        message: [
          '戳我一下试试？',
          '不要摸头啦 >_<',
          '好痒呀～',
          '记得常回来看看哦！',
          '文章看完了吗？',
          '要不要来点音乐？',
          '今天也要加油鸭！',
          '这个站点是我一点点搭起来的～'
        ]
      },

      // 复制正文时触发
      copyTips: {
        duration: 3000,
        priority: 3,
        message: ['复制成功啦，记得注明出处哦～', '内容已经在你剪贴板里了！']
      }
    }
  };

  if (!CONFIG.enable) return;

  /* ---------------------------------------------------------------------
     不该加载的场景
     --------------------------------------------------------------------- */

  // 统一读 site-fx.js 的能力表；读不到就退回自己判一遍
  var CAPS = window.EL_CAPS;
  var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

  if (conn && (conn.saveData || /2g/.test(conn.effectiveType || ''))) return;
  if ((navigator.hardwareConcurrency || 4) <= 2) return;
  if (!CONFIG.mobileDisplay && window.matchMedia('(max-width: 768px)').matches) return;
  if (CAPS && CAPS.reduce) return; // 系统开了「减少动态效果」就别给她加戏

  // 用户上次手动让看板娘休息了就不再自动叫醒
  try {
    if (localStorage.getItem('el-live2d-hidden') === '1') return;
  } catch (e) {
    /* 隐私模式下 localStorage 可能不可用，忽略 */
  }

  /* ---------------------------------------------------------------------
     加载流程
     --------------------------------------------------------------------- */

  var started = false;

  function loadScript(src, onload, onerror) {
    var s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = onload;
    s.onerror = onerror;
    document.head.appendChild(s);
  }

  function start() {
    if (started) return;
    started = true;

    // 已经有引擎（pjax 二次进入等）就直接初始化
    if (window.OML2D && typeof window.OML2D.loadOml2d === 'function') {
      initModel();
      return;
    }

    loadScript(
      CONFIG.enginePath,
      function () {
        if (!window.OML2D || typeof window.OML2D.loadOml2d !== 'function') {
          console.warn('[Live2D] 引擎已加载但未暴露 OML2D，跳过初始化');
          return;
        }
        initModel();
      },
      function () {
        console.warn('[Live2D] 引擎加载失败，看板娘不会显示（不影响其他功能）');
      }
    );
  }

  /* ---------------------------------------------------------------------
     组装给引擎的模型配置
     --------------------------------------------------------------------- */

  function buildModels() {
    return CONFIG.models.map(function (m) {
      return {
        name: m.name,
        path: m.path,
        scale: m.scale,
        mobileScale: m.mobileScale,
        motionPreloadStrategy: m.motionPreloadStrategy,
        // 动作自带音效，静音避免吓到访客
        volume: 0,
        stageStyle: { bottom: m.stageBottom }
      };
    });
  }

  /* ---------------------------------------------------------------------
     菜单
     ---------------------------------------------------------------------
     传函数而不是数组：引擎会把这个函数拿默认菜单项数组调用一次
     （menus.items = fn(defaultItems)），返回什么就用什么。
     这样以后升级引擎、默认菜单变了，我们也只是"在默认基础上改"，
     不会因为写死数组而丢掉新功能。
     --------------------------------------------------------------------- */

  function buildMenus(defaultItems) {
    return defaultItems
      // 默认的「关于」会在新标签页打开 oml2d.com —— 访客点它离开站点不合适
      .filter(function (item) {
        return item.id !== 'About';
      })
      .map(function (item) {
        // 默认标题已经是中文，这里只是顺手把「切换模型」说得更直白
        if (item.id === 'SwitchModel') {
          return Object.assign({}, item, { title: '换一个角色' });
        }
        if (item.id === 'SwitchModelClothes') {
          return Object.assign({}, item, { title: '换一套衣服' });
        }
        return item;
      })
      .concat([
        {
          id: 'Hide',
          // 可用的内置图标只有 7 个：about / like / loading / rest /
          // setting / skin / switch。自定义菜单不支持任意外部图标。
          icon: 'icon-setting',
          title: '隐藏看板娘',
          onClick: function (oml2d) {
            try {
              localStorage.setItem('el-live2d-hidden', '1');
            } catch (e) {
              /* 忽略 */
            }
            if (typeof oml2d.clearTips === 'function') oml2d.clearTips();
            if (typeof oml2d.stageSlideOut === 'function') oml2d.stageSlideOut();
          }
        }
      ]);
  }

  function initModel() {
    try {
      window.OML2D.loadOml2d({
        dockedPosition: CONFIG.dockedPosition,
        mobileDisplay: CONFIG.mobileDisplay,
        primaryColor: CONFIG.primaryColor,
        sayHello: CONFIG.sayHello,
        transitionTime: CONFIG.transitionTime,
        statusBar: CONFIG.statusBar,
        tips: CONFIG.tips,
        menus: { disable: false, items: buildMenus },
        models: buildModels()
      });
    } catch (err) {
      console.warn('[Live2D] 初始化失败：', err);
    }
  }

  /* ---------------------------------------------------------------------
     等首屏忙完再加载
     --------------------------------------------------------------------- */

  function schedule() {
    if (window.requestIdleCallback) {
      window.requestIdleCallback(start, { timeout: 4000 });
    } else {
      setTimeout(start, 1200);
    }
  }

  if (document.readyState === 'complete') {
    schedule();
  } else {
    window.addEventListener('load', schedule, { once: true });
  }

  /* ---------------------------------------------------------------------
     想让看板娘回来：
       隐藏之后 localStorage 里会留一个 el-live2d-hidden = '1'。
       在浏览器控制台执行 localStorage.removeItem('el-live2d-hidden')
       再刷新即可。这是唯一的手动恢复方式（看板娘藏起来了，
       自然也就点不到她自己的菜单了）。

     想加第四个模型（比如已经躺在仓库里的 hijiki）：
       hijiki 是 Cubism 2，文件完整，但它没有 hit_areas、没有表情，
       点它任何部位都只会随机播一个动作，互动性最弱，所以没放进列表。
       想启用就在 CONFIG.models 里加一项：
         { name: 'hijiki', path: '/live2d/hijiki/hijiki.model.json',
           scale: 0.052, mobileScale: 0.038,
           motionPreloadStrategy: 'IDLE', stageBottom: '12px' }
       （hijiki 的 model.json 里没有 layout 字段，
         所以 scale 只能靠肉眼调，给的是按它体积估的起始值。）
     --------------------------------------------------------------------- */
})();
