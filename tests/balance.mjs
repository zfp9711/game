// 无头批量对局：用机器人跑 N 局，输出通关率、平均到达夜数、时长分布。
// 用法：node tests/balance.mjs [局数]

import { STEP, botInput, chooseUpgrade, createGame, getSummary, startRun, step } from '../src/sim.js';

const runs = Number(process.argv[2] || 200);

function play(seed) {
  const g = createGame(seed);
  startRun(g, { seed });
  let guard = 0;
  const maxSteps = 60 * 60 * 12;
  while (g.mode !== 'dead' && g.mode !== 'won' && guard++ < maxSteps) {
    if (g.mode === 'intermission') {
      chooseUpgrade(g, 0);
      continue;
    }
    step(g, botInput(g), STEP);
  }
  return getSummary(g);
}

const results = [];
for (let i = 1; i <= runs; i++) {
  results.push(play(1000 + i * 7919));
}

const wins = results.filter((r) => r.mode === 'won');
const reasons = {};
for (const r of results) reasons[r.stats.reason || 'none'] = (reasons[r.stats.reason || 'none'] || 0) + 1;
const waveCount = new Array(9).fill(0);
for (const r of results) waveCount[r.stats.wave] = (waveCount[r.stats.wave] || 0) + 1;

const avg = (arr) => (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2);
const avgWave = avg(results.map((r) => r.stats.wave));
const avgTime = avg(results.map((r) => r.stats.time));
const times = results.map((r) => r.stats.time).sort((a, b) => a - b);
const p50 = times[Math.floor(times.length * 0.5)];
const p90 = times[Math.floor(times.length * 0.9)];

console.log(`局数            ${runs}`);
console.log(`通关率          ${((wins.length / runs) * 100).toFixed(1)}%`);
console.log(`平均到达        ${avgWave} / 8`);
console.log(`平均时长        ${avgTime}s`);
console.log(`时长 P50 / P90  ${p50.toFixed(0)}s / ${p90.toFixed(0)}s`);
console.log('到达夜数分布    ' + waveCount.map((n, i) => (n ? `${i}夜:${n}` : '')).filter(Boolean).join('  '));
console.log('失败原因        ' + Object.entries(reasons).map(([k, n]) => `${k}:${n}`).join('  '));
if (wins.length) {
  console.log(`通关平均用时    ${avg(wins.map((r) => r.stats.time))}s`);
  console.log(`通关平均得分    ${avg(wins.map((r) => r.stats.score))}`);
}
