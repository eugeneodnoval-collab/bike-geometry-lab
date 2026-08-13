/*
  Общая модель геометрии рамы. Одна физика на все страницы.

  Классический скрипт, не модуль: ES-модули браузер не грузит с file://, а обычный
  <script src> грузит. Поэтому страницы по-прежнему открываются двойным кликом.

  Раньше этот солвер existовал дважды — в index.html и в fit-lab.html, написанный
  в разном стиле. Числа сходились, но держалось это на дисциплине: каждую правку
  приходилось вносить в обе копии руками.

  Наружу отдаётся сырое решение в системе координат каретки, без сдвигов и без
  производных, специфичных для страницы. Своё каждая страница досчитывает сама.
*/
(function (global) {
  'use strict';

  const rad = d => d * Math.PI / 180;
  const deg = r => r * 180 / Math.PI;

  /*
    solveFrame(bike, wheelR, sagOverride)

    Задача нетривиальна ровно в одном месте: что происходит при смене хода вилки
    или при её просадке. Здесь не правило большого пальца, а кинематика.

    1. Рама строится в системе координат каретки из reach, stack, углов, длин труб,
       перьев и BB drop.
    2. Вилка ВЫВОДИТСЯ из введённой геометрии, а не задаётся формулой. Из положения
       передней оси (её даёт колёсная база при известном BB drop) вычисляется
       составляющая вилки вдоль оси рулевой трубы и её офсет. Поэтому при паспортном
       ходе и sag 0 расчёт совпадает с паспортом до знака после запятой — независимо
       от того, какую вилку ставил производитель.
       Если базы нет, обратно: берём офсет и выводим базу.
    3. Смена хода удлиняет вилку вдоль оси рулевой, sag укорачивает. При заданных
       A2C обеих вилок вместо хода работает их разность — см. ниже.
    4. Рама поворачивается вокруг задней оси на угол, при котором передняя ось снова
       оказывается на высоте радиуса колеса, то есть оба колеса стоят на земле.
       Угол находится аналитически, одним atan2.
    5. Из повёрнутых точек читаются фактические reach, stack, углы, база, трейл.

    Для хардтейла это полная модель — других степеней свободы у рамы нет.
    Размер колеса в решение не входит: обе оси по построению на высоте bbDrop.
    Радиус нужен только для трейла и для сдвига на землю на стороне страницы.
  */
  function solveFrame(b, wheelR, sagOverride) {
    const hta = rad(b.hta), sta = rad(b.sta);
    const htTop = [b.reach, b.stack];
    const u = [Math.cos(hta), -Math.sin(hta)];   // вниз-вперёд вдоль оси рулевой
    const p = [Math.sin(hta), Math.cos(hta)];    // перпендикуляр вперёд (офсет)
    const htBot = [htTop[0] + u[0] * b.ht, htTop[1] + u[1] * b.ht];
    const rear = [-Math.sqrt(Math.max(b.cs * b.cs - b.bbDrop * b.bbDrop, 1)), b.bbDrop];
    const stTop = [-b.st * Math.cos(sta), b.st * Math.sin(sta)];

    // Паспортная передняя ось всегда лежит на высоте bbDrop (оба колеса на земле).
    // Не хватает одного числа: либо колёсная база, либо офсет вилки.
    let front, dRef, oRef;
    if (b.wb) {
      front = [b.wb + rear[0], b.bbDrop];
      const fk = [front[0] - htBot[0], front[1] - htBot[1]];
      dRef = fk[0] * u[0] + fk[1] * u[1];
      oRef = fk[0] * p[0] + fk[1] * p[1];
    } else {
      oRef = (b.offset != null ? b.offset : 44);
      dRef = (b.bbDrop - htBot[1] - oRef * p[1]) / u[1];
      front = [htBot[0] + u[0] * dRef + p[0] * oRef, htBot[1] + u[1] * dRef + p[1] * oRef];
    }

    const sagMM = b.travel * ((sagOverride != null ? sagOverride : (b.sag || 0)) / 100);

    /* Замена вилки. По умолчанию модель считает, что A2C растёт 1:1 с ходом, а офсет
       не меняется — это верно для «накрутил ход на той же вилке» и неверно при смене
       модели: у двух 140-х вилок A2C расходится на 10 мм.
       Если заданы A2C обеих вилок, берём их РАЗНОСТЬ. Именно разность, а не абсолют:
       dRef меряется от низа рулевого стакана, а A2C — от посадочного места кольца
       короны, которое ниже на высоту нижней чашки. Эта неизвестная константа в
       разности сокращается, поэтому знать её не нужно, а заодно неважно, меряет ли
       производитель A2C по прямой или вдоль оси штока. Офсет абсолютный. */
    const dA2C = (b.forkA2C != null && b.forkA2Cnew != null) ? (b.forkA2Cnew - b.forkA2C)
                                                             : (b.travel - b.travelRef);
    const oNew = (b.forkOffsetNew != null) ? b.forkOffsetNew : oRef;
    const dNew = dRef + dA2C - sagMM;
    const fkNew = [u[0] * dNew + p[0] * oNew, u[1] * dNew + p[1] * oNew];

    // поворот рамы вокруг задней оси до касания земли передним колесом
    const W = [htBot[0] - rear[0] + fkNew[0], htBot[1] - rear[1] + fkNew[1]];
    const th = -Math.atan2(W[1], W[0]);          // > 0 => нос поднимается
    const rot = q => {
      const dx = q[0] - rear[0], dy = q[1] - rear[1];
      return [rear[0] + dx * Math.cos(th) - dy * Math.sin(th),
              rear[1] + dx * Math.sin(th) + dy * Math.cos(th)];
    };
    const P = {
      BB: rot([0, 0]), htTop: rot(htTop), htBot: rot(htBot), stTop: rot(stTop),
      rear: rear.slice(),
      front: [rear[0] + W[0] * Math.cos(th) - W[1] * Math.sin(th),
              rear[1] + W[0] * Math.sin(th) + W[1] * Math.cos(th)]
    };

    const htaN = deg(Math.atan2(P.htTop[1] - P.htBot[1], P.htBot[0] - P.htTop[0]));
    const staN = deg(Math.atan2(P.stTop[1] - P.BB[1], P.BB[0] - P.stTop[0]));

    return {
      P, hta: htaN, sta: staN,
      reach: P.htTop[0] - P.BB[0],
      stack: P.htTop[1] - P.BB[1],
      bbDrop: P.rear[1] - P.BB[1],
      wb: P.front[0] - P.rear[0],
      theta: deg(th),
      dRef, oRef, dNew, oNew, dA2C, sagMM, wheelR,
      a2cRef: Math.hypot(dRef, oRef),
      a2cNew: Math.hypot(dNew, oNew),
      trail: (wheelR / Math.tan(rad(htaN))) - oNew / Math.sin(rad(htaN))
    };
  }

  /* Паспортная колёсная база из офсета — когда база не задана. Той же формулой,
     что и ветка «базы нет» в solveFrame, иначе числа разъедутся. */
  function passportWB(b) {
    if (b.wb) return b.wb;
    const hta = rad(b.hta);
    const u = [Math.cos(hta), -Math.sin(hta)], p = [Math.sin(hta), Math.cos(hta)];
    const htBot = [b.reach + u[0] * b.ht, b.stack + u[1] * b.ht];
    const rearX = -Math.sqrt(Math.max(b.cs * b.cs - b.bbDrop * b.bbDrop, 1));
    const o = (b.offset != null ? b.offset : 44);
    const d = (b.bbDrop - htBot[1] - o * p[1]) / u[1];
    return (htBot[0] + u[0] * d + p[0] * o) - rearX;
  }

  global.BikeModel = { rad, deg, solveFrame, passportWB };

})(typeof globalThis !== 'undefined' ? globalThis : this);
