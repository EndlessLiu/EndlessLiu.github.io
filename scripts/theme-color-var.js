'use strict'

/* ==========================================================================
   把主题「构建期」写死的品牌色，改写成跟随 --accent-hue 的运行时表达式
   --------------------------------------------------------------------------
   为什么需要这个文件
   ─────────────────
   `_config.butterfly.yml` 里的 `theme_color.*` 是给 Stylus 用的，主题在
   `themes/butterfly/source/css/var.styl:7` 用 `convert(hexo-config(...))`
   把它变成一个**构建期字面量**，编译进 `public/css/index.css`。CSS 变量塞不进去，
   所以光改配置只能让默认色对 —— 色相滑块够不到那 61 处。

   而 `themes/butterfly/**` 是不允许改的（要保留主题可升级能力）。
   所以退一步：在**站点目录**里挂一个过滤器，在生成之后改写编译产物。
   只动产物、不动主题源码。

   当前它改写的 61 处（实测清单，见下方 RULES）
   ─────────────────
     正文链接 `.container a`、选中文字 `*::selection`、`blockquote`、
     行内代码底色、页脚底色、文章标签、TOC 选中项、分页器当前页、
     搜索框、时间线、tabs、文章排序页、以及 `#nav` 的菜单下划线等。

   替换规则为什么是「保 S/L/A、只换色相」
   ─────────────────
   这些派生色（`#ffbbd6` = lighten 30%、`#ffcfe2` = lighten 50%、
   `#fff0f6` = lighten 85%）都是主题在构建期对主题色做**亮度**调整得到的，
   饱和度不变。而色相滑块只改色相、S/L 恒定（见 custom.css 的令牌定义）。
   既然派生只依赖 L、而 L 不变，那么在任何色相下，「保留实测 S/L/A、
   把色相替换成 var(--accent-hue)」都是**精确正确**的 ——
   不需要反推主题用的到底是 HSL 绝对加亮还是向白色插值。

   ⚠️ 维护须知
   ─────────────────
   下面这张表是对着**当前 `_config.butterfly.yml` 的 theme_color 取值**实测出来的。
   如果哪天改了 `theme_color.*`，这张表就会失配 —— 那时不会静默出错，
   过滤器会打印 `⚠ 未命中` 警告（见 assertRules）。重新生成这张表的方法：
     把 theme_color 各键临时换成差异极大的测试色 → `hexo clean && hexo generate`
     → 逐行 diff 新旧 `public/css/index.css`，选择器上下文会直接告诉你对应关系。

   已知的两个「不改」是刻意的，不是漏改：
     · `.article-sort` 上的 `#fff` —— 它是 lighten(main, 100%)，在主题色
       L=81% 的前提下无论如何都会钳到纯白，任何色相下都是白的，保持 #fff 即正确。
     · `:root` 的 `--card-meta: #8b90a8` —— 站点已在 custom.css:117 覆盖为
       `var(--el-text-mute)`，轮不到它生效。
   ========================================================================== */

const path = require('path')
const { Readable } = require('stream')

/**
 * [匹配, 替换, 期望最少命中数]
 * 期望数是用来发现「主题升级后字面量变了」的：命中数少于期望就告警。
 */
const RULES = [
  // ── 主色 sakura（theme_color.main / text_selection / hr_color / blockquote_padding_color）
  [/#ff9ec4/gi, 'hsl(var(--accent-hue), 100%, 81%)', 48],
  // ── sakura 的构建期派生（主题对主色做亮度调整得到，饱和度不变）
  [/#ffbbd6/gi, 'hsl(var(--accent-hue), 100%, 87%)', 2],
  [/#ffcfe2/gi, 'hsl(var(--accent-hue), 100%, 91%)', 1],
  [/#fff0f6/gi, 'hsl(var(--accent-hue), 100%, 97%)', 1],
  // ── theme_color.code_foreground（与站点令牌 --el-sakura-deep 同值）
  [/#ff6fa5/gi, 'hsl(var(--accent-hue), 100%, 72%)', 1],
  // ── 主色的透明度派生（--text-bg-hover / 行内代码底色 / blockquote 底色）
  [/rgba\(255,\s*158,\s*196,\s*0?\.7\)/gi, 'hsla(var(--accent-hue), 100%, 81%, 0.7)', 1],
  [/rgba\(255,\s*158,\s*196,\s*0?\.12\)/gi, 'hsla(var(--accent-hue), 100%, 81%, 0.12)', 2],
  [/rgba\(255,\s*158,\s*196,\s*0?\.1\)/gi, 'hsla(var(--accent-hue), 100%, 81%, 0.1)', 1],
  // ── 紫（theme_color.paginator / link_color / toc_color）
  [/#a78bfa/gi, 'hsl(calc(var(--accent-hue) - 37), 92%, 76%)', 4],
]

/** 目标路由。注意必须用正斜杠：路由用的是 URL 风格路径，
    在 Windows 上 path.join 会给出反斜杠，匹配不上。 */
const CSS_TARGET = 'css/index.css'

function applyRules(str) {
  const report = []
  let out = str

  for (const [re, to, min] of RULES) {
    const hits = (out.match(re) || []).length
    report.push({ re: String(re), hits, min, ok: hits >= min })
    if (hits) out = out.replace(re, to)
  }
  return { out, report }
}

/**
 * 把路由数据（可能是字符串 / Buffer / stream / 返回上述之一的函数）统一收成字符串。
 * Hexo 的主题路由是一个惰性函数，返回 stream，所以这几种形态都要照顾。
 */
function collect(data) {
  return Promise.resolve(typeof data === 'function' ? data() : data).then(d => {
    if (d == null) return ''
    if (typeof d === 'string') return d
    if (Buffer.isBuffer(d)) return d.toString('utf8')
    if (typeof d.pipe === 'function' || d instanceof Readable) {
      return new Promise((resolve, reject) => {
        const chunks = []
        d.on('data', c => chunks.push(Buffer.from(c)))
        d.once('error', reject)
        d.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      })
    }
    return String(d)
  })
}

/*
  为什么挂在 after_generate 且改写「路由」而不是「文件」
  ─────────────────────────────────────────────
  Hexo 的流程是：_runGenerators → 设好路由 → after_generate 过滤器 → 才把路由
  逐个落盘（见 node_modules/hexo/dist/hexo/index.js:428 与 plugins/console/generate.js:52）。
  所以 after_generate 触发时 public/css/index.css 还没写出来，直接读文件必然失败。
  但此刻改路由是有效的：落盘、hash 缓存、以及 `hexo g -d` 的部署都读同一份路由数据。
*/
hexo.extend.filter.register('after_generate', function () {
  const route = hexo.route
  if (!route.list().includes(CSS_TARGET)) {
    hexo.log.warn('[theme-color-var] 路由里没有 ' + CSS_TARGET + '，跳过')
    return
  }

  const original = route.get(CSS_TARGET)

  route.set(CSS_TARGET, function () {
    return collect(original).then(str => {
      const { out, report } = applyRules(str)

      const total = report.reduce((n, r) => n + r.hits, 0)
      if (!total) {
        hexo.log.warn('[theme-color-var] 没有任何替换发生 —— 主题色字面量可能已经变了')
      }
      // 命中数不足 = 主题升级后字面量变了，需按文件头的方法重新生成 RULES
      for (const r of report) {
        if (!r.ok) {
          hexo.log.warn(
            '[theme-color-var] ⚠ 未命中 ' + r.re + '（实际 ' + r.hits + '，期望至少 ' + r.min + '）'
          )
        }
      }

      return out
    })
  })

  hexo.log.info('[theme-color-var] 已挂上 ' + CSS_TARGET + ' 的品牌色改写')
})
