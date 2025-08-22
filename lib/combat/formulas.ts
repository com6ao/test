// lib/formulas.ts

export type Attr = {
  str: number;
  dex: number;
  intt: number;
  wis: number;
  cha: number;
  con: number;
  luck: number; // ✅ incluído
};

export type LevelPack = { level: number };

export const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

export const hp = (a: Attr, l: LevelPack) => 30 + (l.level - 1) * 5 + a.con * 1;
export const mpMain = (a: Attr, l: LevelPack, main: 'str' | 'dex' | 'intt') =>
  30 + (l.level - 1) * 5 + a[main] + Math.floor(a.con * 0.5);

// ⚔️ Dano base
export const meleeAttack   = (a: Attr) => Math.floor(a.str * 1.8);                    // ✅ STR * 1.8
export const rangedAttack  = (a: Attr) => a.dex + Math.floor(a.str * 0.5);
export const magicAttack   = (a: Attr) => Math.floor(a.intt * 1.8);                   // ✅ INT * 1.8
export const mentalAttack  = (a: Attr) => a.wis;                                      // ✅ novo: WIS * 1

// 🛡️ Resistências
export const resistPhysicalMelee   = (a: Attr) => a.str + Math.floor(a.dex * 0.5) + a.con;
export const resistPhysicalRanged  = (a: Attr) => a.dex + Math.floor(a.str * 0.5) + a.con;
export const resistMagic           = (a: Attr) => a.intt + a.con;
export const resistMental          = (a: Attr) => a.wis + a.con;
export const resistCrit            = (a: Attr) => a.cha;

// ⏩ Velocidades
export const attackSpeed = (a: Attr) => a.dex + a.wis;

// 🎯 Crítico / Reduções
export const critChance       = (a: Attr) => clamp(a.luck * 2, 0, 60);                // ✅ sorte
export const critMultiplier   = (a: Attr) => 150 + Math.floor(a.cha * 1.5);           // %
export const trueDamageChance = (a: Attr) => clamp(a.wis * 2, 0, 50);                 // %
export const damageReductionChance = (a: Attr) => clamp(a.cha * 2, 0, 60);            // %
export const damageReductionPercent = 80;

// 🌀 Esquiva
export function dodgeChance(a: Attr) {
  // ✅ apenas Destreza
  return clamp(Math.floor(a.dex * 1.5), 0, 95);
}

// 🎯 Precisão (mantido)
export function accuracyPercent(
  atkLv: number,
  defLv: number,
  atkMax: number,
  defMax: number
) {
  let acc = 100;
  if (defLv > atkLv) acc -= (defLv - atkLv) * 5;
  if (defMax > atkMax) acc -= (defMax - atkMax) * 2;
  return clamp(acc, 5, 100);
}
