/*
  Общая шапка навигации. Один список ссылок на весь сайт.

  Раньше <nav> лежал в каждой из пяти страниц дословной копией, и добавление
  раздела означало пять одинаковых правок руками. Забыть одну было легко —
  ошибка при этом не ломала страницу, а просто тихо уводила ссылку из шапки.

  Разметка вставляется СИНХРОННО, на место самого тега <script>, через
  document.currentScript. Не в DOMContentLoaded: тогда шапка появлялась бы
  после отрисовки и сдвигала содержимое вниз. Не через document.write: он
  делает то же самое, но ломается, если скрипт когда-нибудь станет async.

  Плата за вынос: без JavaScript шапки не будет вовсе. Для инструмента, который
  целиком на JavaScript и без него всё равно бесполезен, это ничего не меняет;
  для статей это осознанная уступка ради одного места правки.

  Стили берутся из .nav на самой странице — здесь только разметка.
*/
(function () {
  'use strict';

  /* Порядок здесь и есть порядок в шапке. Новая страница добавляется одной
     строкой, и она появляется сразу на всех остальных. */
  var LINKS = [
    { href: 'index.html',    title: 'Сравнение геометрий', sub: 'две рамы рядом' },
    { href: 'fit-lab.html',  title: 'Посадка',             sub: 'райдер на раме' },
    { href: 'help.html',     title: 'Как это мерить',      sub: 'справка по параметрам' },
    { href: 'articles.html', title: 'Статьи',              sub: 'исследования и практика' }
  ];

  /* Какая страница открыта. Три случая, все реальные:
     file:///…/fit-lab.html      — двойной клик,
     /bike-geometry-lab/         — GitHub Pages отдаёт индекс без имени файла,
     article-<слаг>.html         — статья, подсвечивать надо раздел «Статьи». */
  function current() {
    var file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (file.indexOf('article-') === 0) return 'articles.html';
    return file;
  }

  var here = current();
  var html = '<nav class="nav">' + LINKS.map(function (l) {
    var cur = l.href === here ? ' aria-current="page"' : '';
    return '<a href="' + l.href + '"' + cur + '>' + l.title +
           ' <span class="nsub">' + l.sub + '</span></a>';
  }).join('') + '</nav>';

  var s = document.currentScript;
  if (s) s.insertAdjacentHTML('afterend', html);
  else document.write(html);   // страховка на случай очень старого браузера
})();
