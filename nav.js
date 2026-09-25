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

  Второй, отдельный блок в конце — поведение выпадающих меню тулбара: оно общее
  у страниц с расчётами, а nav.js и так стоит на каждой странице первым.
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

  /* Ссылка наверх, на сайт автора. Стоит в той же шапке, а не в подвале:
     подвал на длинной справке нужно ещё domotать, а вернуться к автору и
     понять, чей это проект, должно быть можно с любого экрана.

     Адрес абсолютный и с явным https — инструмент лежит и на GitHub Pages,
     и на своём хостинге, откуда относительная ссылка вела бы в разные места.
     Открывается в той же вкладке: состояние страницы целиком в адресе,
     поэтому «назад» возвращает расчёт как был. */
  var HOME = { href: 'https://evo-profile.online', title: 'Project by EVO', sub: 'сайт автора' };

  var here = current();
  var link = function (l, cls) {
    var cur = l.href === here ? ' aria-current="page"' : '';
    return '<a href="' + l.href + '"' + cur + (cls ? ' class="' + cls + '"' : '') + '>' +
           l.title + ' <span class="nsub">' + l.sub + '</span></a>';
  };
  var html = '<nav class="nav">' + LINKS.map(function (l) { return link(l); }).join('') +
             link(HOME, 'nhome') + '</nav>';

  var s = document.currentScript;
  if (s) s.insertAdjacentHTML('afterend', html);
  else document.write(html);   // страховка на случай очень старого браузера
})();

/* Выпадающие меню тулбара — это <details class="menu">: открываются и
   закрываются сами, без скрипта. Здесь только то, чего <details> не умеет:
   закрыться по клику мимо, после выбора пункта списка, когда открыли соседнее,
   и по Escape. Клик внутри панели с полем ввода («Колесо») меню не закрывает —
   иначе в поле не попасть. Обработчики на document, поэтому им всё равно,
   когда страница построит свой тулбар. На страницах без меню они ничего не
   находят и ничего не делают. */
(function () {
  'use strict';
  document.addEventListener('click', function (e) {
    document.querySelectorAll('details.menu[open]').forEach(function (m) {
      if (!m.contains(e.target) || e.target.closest('.menulist button')) m.open = false;
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('details.menu[open]').forEach(function (m) {
      m.open = false; m.querySelector('summary').focus();
    });
  });
})();
