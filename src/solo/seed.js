// Copied unchanged from reference/seed.mjs (BUILD_AND_HANDOFF.md/SCENARIOS.md:
// "Copy reference/seed.mjs to src/solo/seed.js unchanged. It fixes pool
// ordering, all five PRNG draws and the first-run START override.").
export function hashSeed(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619) >>> 0;
  return value;
}
export function makeRng(seed) {
  let value = seed >>> 0;
  return () => (value = (Math.imul(value, 1664525) + 1013904223) >>> 0);
}
export function parameters(code) {
  const match = /^TF1-(HM|BR|OF)-([1-4])-([PIVDM])-([A-Za-z0-9_]{1,24})$/.exec(code);
  if (!match) throw new Error('Invalid case code');
  const [, layout, tierText, family] = match;
  const tier = Number(tierText);
  if ((tier === 4) !== (family === 'M') || (tier === 4 && layout === 'HM')) throw new Error('Invalid case combination');
  const pools = {P:['P1','P2'], I:['I1','I2'], V:layout === 'HM' ? ['V1'] : ['V1','V2'], D:['D1','D2'], M:['P1+D1','P2+I2','I1+D1','V1+D1','V2+I2','V2+D1']};
  const next = makeRng(hashSeed(code));
  const x = 1 + next() % 200;
  const host = 130 + next() % 20;
  let recipe = pools[family][next() % pools[family].length];
  const label = next() % 3;
  const detail = next() % 3;
  // Stable first-run walkthrough, part of TF1's permanent specification.
  if (code === 'TF1-HM-1-P-START') recipe = 'P1';
  return {layout,tier,family,x,host,recipes:recipe.split('+'),label,detail};
}
