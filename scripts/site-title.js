/* ==========================================================================
   EndlessLoop · 主页 Hero 大标题独立覆盖
   --------------------------------------------------------------------------
   导航栏品牌名 = config.title（EndlessLiu），必须保持原样。
   主页 Hero 中央大标题是另一个独立元素（header/index.pug 的 h1#site-title，
   它默认也取 config.title），这里把它单独替换成 HERO_TITLE。

   只精确匹配首页的 <h1 id="site-title">config.title</h1>：
   非首页 #site-title 内容是 page.title（如「关于」），不会命中；
   导航栏是 span.site-name，SEO 隐藏标题是 h1.title-seo，也都不会命中。
   ========================================================================== */

'use strict';

// 主页 Hero 大标题
var HERO_TITLE = '阅己·越己·悦己';

hexo.extend.filter.register('after_render:html', function (str) {
  var from = '<h1 id="site-title">' + hexo.config.title + '</h1>';
  var to = '<h1 id="site-title">' + HERO_TITLE + '</h1>';
  return str.replace(from, to);
});
