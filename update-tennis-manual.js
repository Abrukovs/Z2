/* eslint-disable @typescript-eslint/no-require-imports */
// Обновление теннисных пиков вручную по результатам веб-поиска
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({ log: ['error'] });

// Результаты из веб-поиска
const updates = [
  // Khachanov vs Cobolli (4 июля, Уимблдон) — ставили "Больше 3.5" сетов
  // Cobolli won 3-2 (5 сетов) → Больше 3.5 = WON
  {
    team1Contains: 'Хачанов', team2Contains: 'Коболли', pickDate: '2026-07-04',
    result: 'won', homeScore: 2, awayScore: 3,
    note: 'Cobolli won 3-2 (5 sets) — Больше 3.5 сетов = WON'
  },
  // de Minaur vs Cobolli (6 июля, Уимблдон) — ставили на de Minaur
  // Cobolli won 7-5, 7-6, 6-3 (3-0) → de Minaur lost
  {
    team1Contains: 'де Минор', team2Contains: 'Коболли', pickDate: '2026-07-06',
    result: 'lost', homeScore: 0, awayScore: 3,
    note: 'Cobolli won 3-0 — de Minaur lost'
  },
  // Krueger vs Kostjuk (6 июля, Уимблдон) — ставили на Kostjuk
  // Kostyuk won 6-4, 6-4 (2-0) → WON
  {
    team1Contains: 'Крюгер', team2Contains: 'Костюк', pickDate: '2026-07-06',
    result: 'won', homeScore: 2, awayScore: 0,
    note: 'Kostyuk won 6-4, 6-4 (2-0) — WON'
  },
  // Cowan vs Vondrousova (6 июля, Уимблдон) — ставили на Vondrousova
  // Не нашёл точный матч, но Vondrousova — топ игрок, вероятно won
  // Пропускаем — нет точного результата
  // Charaeva vs Jimenez-Kasintseva (13 июля, Iasi Open) — ставили на Charaeva
  // Charaeva won 6-0, 6-1 (2-0) → WON
  {
    team1Contains: 'Чараева', team2Contains: 'Хименес', pickDate: '2026-07-13',
    result: 'won', homeScore: 2, awayScore: 0,
    note: 'Charaeva won 6-0, 6-1 (2-0) — WON'
  },
  // Collignon vs Skatov (13 июля, ATP 250 Gstaad) — ставили на Skatov
  // Collignon won 3-6, 7-6, 6-... (2-1) → Skatov lost
  {
    team1Contains: 'Коллиньон', team2Contains: 'Скатов', pickDate: '2026-07-13',
    result: 'lost', homeScore: 1, awayScore: 2,
    note: 'Collignon won 2-1 — Skatov lost'
  },
  // Muchova vs Krejcikova (14 июля, Уимблдон) — ставили на Muchova
  // Muchova won 7-5, 5-7, 6-3 (2-1) → WON
  {
    team1Contains: 'Мухова', team2Contains: 'Крейчикова', pickDate: '2026-07-14',
    result: 'won', homeScore: 2, awayScore: 1,
    note: 'Muchova won 7-5, 5-7, 6-3 (2-1) — WON'
  },
  // Siniakova vs Keys (18 авг, Цинциннати) — ставили на Keys
  // Keys won 6-1, 6-3 (2-0) → WON
  {
    team1Contains: 'Синякова', team2Contains: 'Киз', pickDate: '2026-08-18',
    result: 'won', homeScore: 2, awayScore: 0,
    note: 'Keys won 6-1, 6-3 (2-0) — WON'
  },
  // Tiafoe vs Rune (6 авг, Цинциннати) — ставили на Rune
  // Tiafoe defeated Rune 4-6, 6-1, 7-6(4) (2-1) → Rune lost
  {
    team1Contains: 'Тиафо', team2Contains: 'Руне', pickDate: '2026-08-06',
    result: 'lost', homeScore: 1, awayScore: 2,
    note: 'Tiafoe won 2-1 — Rune lost'
  },
  // Bublik vs Wolf (30 авг, US Open) — ставили "Больше 21.5" геймов
  // Bublik won 6-4, 6-2, 3-6, 6-1 → всего 28 геймов → Больше 21.5 = WON
  {
    team1Contains: 'Бублик', team2Contains: 'Вулф', pickDate: '2026-08-30',
    result: 'won', homeScore: 21, awayScore: 7,
    note: 'Bublik won 6-4, 6-2, 3-6, 6-1 (28 games) — Больше 21.5 = WON'
  },
];

(async () => {
  console.log('=== Обновление теннисных пиков вручную ===');
  let updated = 0;
  for (const u of updates) {
    const pick = await db.storedPick.findFirst({
      where: {
        sportKey: 'tennis',
        pickDate: u.pickDate,
        team1: { contains: u.team1Contains },
        team2: { contains: u.team2Contains },
      },
      select: { id: true, team1: true, team2: true, selection: true, market: true, result: true },
    });
    if (!pick) {
      console.log('✗ НЕ НАЙДЕН: ' + u.team1Contains + ' vs ' + u.team2Contains + ' (' + u.pickDate + ')');
      continue;
    }
    if (pick.result !== 'no_result' && pick.result !== 'pending') {
      console.log('⏭ УЖЕ ' + pick.result.toUpperCase() + ': ' + pick.team1 + ' vs ' + pick.team2);
      continue;
    }
    await db.storedPick.update({
      where: { id: pick.id },
      data: {
        result: u.result,
        homeScore: u.homeScore,
        awayScore: u.awayScore,
        resultCheckedAt: new Date(),
      },
    });
    console.log('✓ ' + u.result.toUpperCase() + ' (' + u.homeScore + ':' + u.awayScore + '): ' + pick.team1 + ' vs ' + pick.team2);
    console.log('   ' + u.note);
    updated++;
  }
  console.log('');
  console.log('Обновлено: ' + updated + ' пиков');
  await db.$disconnect();
})();
