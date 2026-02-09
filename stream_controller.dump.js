async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fade(setter, from, to, steps, stepMs) {
  const n = Math.max(1, steps);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const v = from + (to - from) * t;
    await setter(v);
    if (i < n) await sleep(stepMs);
  }
}

module.exports = { sleep, fade };
