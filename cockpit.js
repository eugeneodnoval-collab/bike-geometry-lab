/*
  Общий солвер кокпита и каталог реальных деталей. Одна цепочка на все страницы.

  Жил внутри fit-lab.html. Вынесен, когда понадобился второй странице: сравнение
  геометрий оценивает рост под раму через RAD, а RAD рамы — это рама плюс кокпит.
  Копия цепочки на второй странице разошлась бы с Fit Lab так же, как когда-то
  разошлись две копии солвера рамы (см. model.js).

  Классический скрипт, не модуль — по той же причине, что model.js: file://.

  Тела здесь нет — только железо и тригонометрия. Состояния страницы тоже нет:
  рама приходит готовым решением, кокпит — явным аргументом. Всё, что зависит от
  райдера (цель по росту, секторы RAAD, телесная проверка, вердикт), осталось
  в Fit Lab.
*/
(function (global) {
  'use strict';

  const rad = d => d * Math.PI / 180;
  const deg = r => r * 180 / Math.PI;

  /* Цепочка: верх стакана -> чашка рулевой -> проставки -> центр обхвата выноса
     -> вынос -> центр руля -> отгиб -> центр хвата.
     Ключевое: угол выноса задан от ПЕРПЕНДИКУЛЯРА к штоку.
     Подъём от горизонта = (90 - HTA) + угол выноса.

     F — решение рамы: нужны hta, P.htTop и pitchSag (если его нет — 0). Система
     координат любая, лишь бы у рамы и у ответа она была одна: Fit Lab передаёт
     раму, сдвинутую на землю, сравнение — сырое решение BikeModel.solveFrame.
     Результат — в той же системе, третья координата — поперёк рамы. */
  function solve(F, c) {
    const hta = rad(F.hta), ht = F.P.htTop;
    const up = [-Math.cos(hta), 0, Math.sin(hta)];
    const h = c.headsetStack + c.spacers + c.stemClampH / 2;
    const steer = [ht[0] + up[0] * h, 0, ht[1] + up[2] * h];
    const sa = c.stemFlip ? -c.stemAngle : c.stemAngle;
    const elev = (90 - F.hta) + sa;
    const bar = [steer[0] + Math.cos(rad(elev)) * c.stemLen, 0, steer[2] + Math.sin(rad(elev)) * c.stemLen];
    const L = c.barWidth / 2 - c.gripInset;            // центр хвата от центра руля, поперёк
    const s = Math.max(L - c.riserBendHalf, 0);
    const bs = rad(c.backsweep), us = rad(c.upsweep);
    // смещение ручки от центра руля до поворота руля в обхвате
    let d = [-s * Math.sin(bs) * Math.cos(us), c.riserBendHalf + s * Math.cos(bs) * Math.cos(us), c.barRise + s * Math.sin(us)];
    /* Поворот вокруг поперечной оси, два слагаемых:
       barRoll — как ты провернул руль в обхвате, выставляя его на СТОЯЩЕМ велосипеде;
       pitchSag — доворот рамы под просадкой вилки. Руль закреплён на раме жёстко,
       поэтому клюёт вперёд вместе с ней; без этого члена он вёл бы себя так, будто
       подвешен в кардане и сам подкручивается обратно по мере просадки. */
    const r = rad(c.barRoll + (F.pitchSag || 0));
    d = [d[0] * Math.cos(r) + d[2] * Math.sin(r), d[1], -d[0] * Math.sin(r) + d[2] * Math.cos(r)];
    const grip = [bar[0] + d[0], d[1], bar[2] + d[2]];
    // край руля и точка отгиба — для вида сверху
    const e = c.barWidth / 2 - c.riserBendHalf;
    let de = [-e * Math.sin(bs) * Math.cos(us), c.riserBendHalf + e * Math.cos(bs) * Math.cos(us), c.barRise + e * Math.sin(us)];
    de = [de[0] * Math.cos(r) + de[2] * Math.sin(r), de[1], -de[0] * Math.sin(r) + de[2] * Math.cos(r)];
    let db = [0, c.riserBendHalf, c.barRise];
    db = [db[0] * Math.cos(r) + db[2] * Math.sin(r), db[1], -db[0] * Math.sin(r) + db[2] * Math.cos(r)];
    return { steer, bar, grip, elev,
             barEnd: [bar[0] + de[0], de[1], bar[2] + de[2]],
             barBend: [bar[0] + db[0], db[1], bar[2] + db[2]] };
  }

  /* Каталог реальных деталей, а не декартово произведение диапазонов: последнее
     даёт несуществующее железо (вынос 35 мм с подъёмом 30°) и топит вывод в мусоре.
     Каждую строку можно показать пальцем в магазине — это наблюдаемый ассортимент,
     а не подобранный коэффициент. Границы каталога намеренно совпадают с теми, что
     в литературе считаются пределом настройки: вынос 35–60, проставки до 40,
     rise до 38, backsweep 8–16. Поэтому выход за каталог — это и есть признанный
     красный флаг «размер рамы выбран неверно», встроенный в саму постановку.
     Отрицательный угол — вынос, перевёрнутый вниз. */
  const CATALOG = {
    stems: [{ len: 35, ang: 0 }, { len: 40, ang: 0 }, { len: 45, ang: 0 }, { len: 50, ang: 0 }, { len: 60, ang: 0 },
            { len: 45, ang: -6 }, { len: 50, ang: -7 }, { len: 60, ang: -7 },
            { len: 40, ang: 6 }, { len: 50, ang: 6 }, { len: 60, ang: 6 }, { len: 50, ang: 7 }, { len: 60, ang: 7 },
            { len: 50, ang: 17 }, { len: 50, ang: 30 }, { len: 60, ang: 30 }],
    /* upsweep у серийных рулей 4–6° и на длину почти не влияет — держим 5 общим,
       чтобы перебор не разбухал вдвое ради десятых долей миллиметра. */
    bars: [{ rise: 0, bs: 8 }, { rise: 10, bs: 8 }, { rise: 15, bs: 8 }, { rise: 20, bs: 9 }, { rise: 25, bs: 9 },
           { rise: 30, bs: 9 }, { rise: 35, bs: 9 }, { rise: 38, bs: 8 }, { rise: 15, bs: 12 }, { rise: 25, bs: 12 },
           { rise: 20, bs: 16 }],
    spacers: [0, 5, 10, 15, 20, 25, 30, 35, 40],
    us: 5
  };
  /* Что каталог НЕ перебирает и берёт из переданного кокпита: ширину руля, отступ
     хвата, ширину отгиба, чашку рулевой и высоту обхвата выноса. Ширина здесь не
     «не влияет», а именно берётся своя: вместе с загибом она реально двигает хват
     назад, и подставлять вместо неё каталожную значило бы менять пользователю руль
     в вопросе, который он не задавал. */

  /* Ролл руля в переборе НЕ участвует и держится в нейтрали. Он стоит до 12 мм
     RAD — больше допуска, — но это не покупка, а поворот руля в обхвате, и
     выставляют его по запястьям, а не по RAD. Позволить перебору тратить ролл на
     попадание в цель значило бы ровно то, что инструмент должен ловить:
     компенсацию неверного размера рамы кокпитом. Поэтому конверт считается на
     нейтрали, а собственный ролл райдера Fit Lab показывает отдельной строкой. */
  function cfgToCk(c) {
    return { spacers: c.sp, stemLen: c.st.len, stemAngle: c.st.ang, stemFlip: 0,
             barRise: c.bar.rise, backsweep: c.bar.bs, upsweep: CATALOG.us, barRoll: 0 };
  }

  /* Перебор каталога на готовой раме. Им пользуются конверт Fit Lab, обмерный
     слой вида сбоку (облако достижимых точек хвата) и оценка роста на сравнении.
     Тела здесь нет вовсе — чистая тригонометрия, 1584 вызова solve на одну раму.
     base — кокпит, из которого берётся всё, что каталог не перебирает. */
  function sweep(F, base) {
    const BB = F.P.BB, out = [];
    for (const sp of CATALOG.spacers)
      for (const st of CATALOG.stems)
        for (const bar of CATALOG.bars) {
          const c = { sp, st, bar };
          const CO = solve(F, { ...base, ...cfgToCk(c) });
          c.er = CO.grip[0] - BB[0]; c.es = CO.grip[2] - BB[1];
          c.rad = Math.hypot(c.er, c.es); c.raad = deg(Math.atan2(c.es, c.er));
          out.push(c);
        }
    return out;
  }

  global.BikeCockpit = { solve, CATALOG, cfgToCk, sweep };

})(typeof globalThis !== 'undefined' ? globalThis : this);
