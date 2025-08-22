/* ===== Atributos + fórmulas ===== */
export type Attr = { str:number; dex:number; intt:number; wis:number; cha:number; con:number; luck:number };
export type LevelPack = { level:number };

export const clamp = (v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
export const hp = (a:Attr,l:LevelPack)=>30+(l.level-1)*5+a.con*1;
export const mpMain=(a:Attr,l:LevelPack,main:"str"|"dex"|"intt")=>30+(l.level-1)*5+a[main]+Math.floor(a.con*0.5);

// dano base
export const meleeAttack =(a:Attr)=>Math.floor(a.str*1.8);
export const rangedAttack=(a:Attr)=>a.dex+Math.floor(a.str*0.5);
export const magicAttack =(a:Attr)=>Math.floor(a.intt*1.8);
export const mentalAttack=(a:Attr)=>a.wis;

// resistências
export const resistPhysicalMelee =(a:Attr)=>a.str+Math.floor(a.dex*0.5)+a.con;
export const resistPhysicalRanged=(a:Attr)=>a.dex+Math.floor(a.str*0.5)+a.con;
export const resistMagic          =(a:Attr)=>a.intt+a.con;
export const resistMental         =(a:Attr)=>a.wis+a.con;
export const resistCrit           =(a:Attr)=>a.cha;

// velocidades
export const attackSpeed=(a:Attr)=>a.dex+a.wis;
export const castSpeed  =(a:Attr)=>a.wis;

// crítico / reduções
export const critChance=(a:Attr)=>clamp(a.luck*2,0,60);
export const critMultiplier=(a:Attr)=>150+Math.floor(a.cha*1.5);
export const trueDamageChance=(a:Attr)=>clamp(a.wis*2,0,50);
export const damageReductionChance=(a:Attr)=>clamp(a.cha*2,0,60);
export const damageReductionPercent=80;

// esquiva + acerto
export function dodgeChance(a:Attr){ return clamp(Math.floor(a.dex*1.5),0,95); }
export function accuracyPercent(atkLv:number,defLv:number,atkMax:number,defMax:number){
  let acc=100;
  if(defLv>atkLv) acc-=(defLv-atkLv)*5;
  if(defMax>atkMax) acc-=(defMax-atkMax)*2;
  return clamp(acc,5,100);
}

/* ===== Estruturas ===== */
export type UnitBase = {
  id:"player"|"enemy"; name:string; level:number; attrs:Attr;
  hp:number; hpMax:number; mp:number; mpMax:number; atb:number;
  usedFull?:boolean; usedBonus?:boolean; nextIcon?:string;
  buffs:{ accBonus?:number; dmgBonus?:number; enemyResDown?:number; turns?:number; };
};
export type PlayerUnit = UnitBase & { id:"player" };
export type EnemyUnit  = UnitBase & { id:"enemy" };
export type Unit = PlayerUnit|EnemyUnit;

export type Calc = { text:string; side:"player"|"enemy" };
export type Log  = { text:string; side:"neutral"|"player"|"enemy" };
export type ServerState = { player:PlayerUnit; enemy:EnemyUnit; log:Log[]; calc:Calc[] };

type SkillId = "golpe_poderoso"|"explosao_arcana"|"tiro_preciso";
type BuffId  = "foco"|"fortalecer"|"enfraquecer";

export type ClientCmd = { kind:"basic" }|{ kind:"skill"; id?:SkillId }|{ kind:"buff"; id?:BuffId };

export type PublicSnapshot = {
  player: { id:"player"; name:string; level:number; hp:number; hpMax:number; mp:number; mpMax:number; atb:number; nextIcon?:string };
  enemy:  { id:"enemy";  name:string; level:number; hp:number; hpMax:number; mp:number; mpMax:number; atb:number; nextIcon?:string };
  log:Log[]; calc:Calc[]; srv:ServerState;
};

// preserva literal do id
function copyPub(u:PlayerUnit):PublicSnapshot["player"];
function copyPub(u:EnemyUnit): PublicSnapshot["enemy"];
function copyPub(u:Unit){
  return { id:u.id, name:u.name, level:u.level, hp:u.hp, hpMax:u.hpMax, mp:u.mp, mpMax:u.mpMax, atb:u.atb, nextIcon:u.nextIcon } as any;
}

const rnd=(n:number)=>Math.floor(Math.random()*n);
const roll=(pct:number)=>Math.random()*100<pct;

function applyBuffDecay(u:Unit){
  if(u.buffs.turns && u.buffs.turns>0){ u.buffs.turns!--; if(u.buffs.turns<=0) u.buffs={}; }
}

/* ===== Criação ===== */
function defaults():Attr{ return { str:10,dex:10,intt:10,wis:10,cha:10,con:10,luck:10 }; }
const main=(a:Attr)=>a.intt>=a.str&&a.intt>=a.dex?"intt":a.str>=a.dex?"str":"dex";

function buildUnit<T extends "player"|"enemy">(id:T,name:string,level:number,attrs?:Partial<Attr>):(Unit&{id:T}){
  const a:Attr={...defaults(),...attrs};
  const m=main(a);
  const u:UnitBase={ id, name, level, attrs:a,
    hp:hp(a,{level}), hpMax:hp(a,{level}),
    mp:mpMain(a,{level},m), mpMax:mpMain(a,{level},m),
    atb:0, buffs:{} };
  return u as Unit&{id:T};
}

/* ===== Combate ===== */
type DmgType="melee"|"magic"|"ranged"|"mental";
const bestBasic=(att:Unit)=> {
  const arr:[number,DmgType,string][]= [
    [meleeAttack(att.attrs), "melee","⚔️"],
    [magicAttack(att.attrs), "magic","✨"],
    [rangedAttack(att.attrs),"ranged","🏹"],
    [mentalAttack(att.attrs),"mental","🧠"],
  ];
  arr.sort((a,b)=>b[0]-a[0]); const [base,dtype,icon]=arr[0]; return {base,dtype,icon};
};
const resist=(def:Unit,dt:DmgType)=> dt==="melee"?resistPhysicalMelee(def.attrs)
  : dt==="ranged"?resistPhysicalRanged(def.attrs)
  : dt==="magic"?resistMagic(def.attrs):resistMental(def.attrs);

function tryHit(att:Unit,def:Unit){
  const acc=accuracyPercent(att.level,def.level,att.hpMax,def.hpMax)+(att.buffs.accBonus??0);
  const dodge=dodgeChance(def.attrs);
  const accRoll=clamp(acc-dodge,5,100);
  const miss=!roll(accRoll);
  const crit=!miss&&roll(critChance(att.attrs));
  const trueDmg=!miss&&roll(trueDamageChance(att.attrs));
  return { miss,crit,trueDmg,accUsed:accRoll,dodgeUsed:dodge };
}

function applyDamage(att:Unit,def:Unit,raw:number,dt:DmgType,calc:Calc[],label:string){
  let base=raw;
  if(att.buffs.dmgBonus) base=Math.floor(base*(1+att.buffs.dmgBonus/100));
  const h=tryHit(att,def);
  if(h.miss){ calc.push({side:att.id,text:`${label}: errou • acc=${h.accUsed}% vs dodge=${h.dodgeUsed}%`}); return {dmg:0,miss:true,crit:false}; }
  let res=h.trueDmg?0:resist(def,dt);
  if(def.id==="enemy"&&att.id==="player"&&att.buffs.enemyResDown){ res=Math.max(0,Math.floor(res*(1-att.buffs.enemyResDown/100))); }
  let dmg=Math.max(1, base-Math.floor(res*0.35));
  if(h.crit) dmg=Math.floor(dmg*critMultiplier(att.attrs)/100);
  if(roll(damageReductionChance(def.attrs))){
    dmg=Math.floor(dmg*(100-damageReductionPercent)/100);
    calc.push({side:def.id,text:`redução de dano acionada (-${damageReductionPercent}%)`});
  }
  calc.push({side:att.id,text:`${label}: base=${base} • res=${res} • ${h.crit?"CRIT":"HIT"} • true=${h.trueDmg?"sim":"não"} • final=${dmg}`});
  def.hp=clamp(def.hp-dmg,0,def.hpMax);
  return { dmg,miss:false,crit:h.crit };
}

function doBasic(att:Unit,def:Unit,log:Log[],calc:Calc[]){
  const b=bestBasic(att); att.nextIcon=b.icon;
  const r=applyDamage(att,def,b.base,b.dtype,calc,"Ataque básico");
  if(!r.miss) log.push({side:att.id,text:`${att.name} causa ${r.dmg} de dano (${r.crit?"crit":"hit"})`});
  else log.push({side:"neutral",text:`${att.name} erra o ataque`});
}

function doSkill(att:Unit,def:Unit,id:SkillId|undefined,log:Log[],calc:Calc[]){
  if(!id) return doBasic(att,def,log,calc);
  let base=0, mp=0, label="", dt:DmgType="melee";
  switch(id){
    case "golpe_poderoso": base=Math.floor(meleeAttack(att.attrs)*1.3); dt="melee"; mp=10; label="Golpe Poderoso"; att.nextIcon="💥"; break;
    case "explosao_arcana": base=Math.floor(magicAttack(att.attrs)*1.5); dt="magic"; mp=12; label="Explosão Arcana"; att.nextIcon="🪄"; break;
    case "tiro_preciso":    base=Math.floor(rangedAttack(att.attrs)*1.4); dt="ranged"; mp= 8; label="Tiro Preciso";   att.nextIcon="🎯"; break;
  }
  if(att.mp<mp){ calc.push({side:att.id,text:`${label}: MP insuficiente (${att.mp}/${mp})`}); return doBasic(att,def,log,calc); }
  att.mp-=mp;
  const r=applyDamage(att,def,base,dt,calc,label);
  if(!r.miss) log.push({side:att.id,text:`${att.name} usa ${label} e causa ${r.dmg} de dano (${r.crit?"crit":"hit"})`});
  else log.push({side:"neutral",text:`${att.name} erra ${label}`});
}

function doBuff(att:Unit,_def:Unit,id:BuffId|undefined,log:Log[],calc:Calc[]){
  switch(id){
    case "foco":       att.buffs.accBonus=20;     att.buffs.turns=2; att.nextIcon="🎯"; log.push({side:"neutral",text:`${att.name} usa Foco (+20% acerto por 2 turnos)`}); calc.push({side:att.id,text:`buff: +20% acc`}); break;
    case "fortalecer": att.buffs.dmgBonus=15;     att.buffs.turns=2; att.nextIcon="🗡️"; log.push({side:"neutral",text:`${att.name} usa Fortalecer (+15% dano por 2 turnos)`});   calc.push({side:att.id,text:`buff: +15% dano`}); break;
    case "enfraquecer": att.buffs.enemyResDown=15; att.buffs.turns=2; att.nextIcon="🪓"; log.push({side:"neutral",text:`${att.name} lança Enfraquecer (-15% resist do alvo por 2 turnos)`}); calc.push({side:att.id,text:`debuff alvo: -15% resist`}); break;
    default: log.push({side:"neutral",text:`${att.name} prepara-se`});
  }
}

function fullAction(att:Unit,def:Unit,log:Log[],calc:Calc[],cmd?:ClientCmd){
  if(cmd?.kind==="skill") doSkill(att,def,cmd.id,log,calc); else doBasic(att,def,log,calc);
  att.usedFull=true;
}
function bonusAction(att:Unit,def:Unit,log:Log[],calc:Calc[],cmd?:ClientCmd){
  if(cmd?.kind==="buff"){ doBuff(att,def,cmd.id,log,calc); att.usedBonus=true; }
}

const speed=(u:Unit)=>0.4+attackSpeed(u.attrs)*0.08;
const gain =(u:Unit)=>{ u.atb=clamp(u.atb+speed(u),0,120); };
const spend=(u:Unit)=>{ u.atb=clamp(u.atb-100,0,120); u.usedFull=false; u.usedBonus=false; applyBuffDecay(u); };

function chooseAI(att:Unit,def:Unit):ClientCmd{
  const canStrong=att.mp>=10 && meleeAttack(att.attrs)>=magicAttack(att.attrs);
  const canArc  =att.mp>=12 && magicAttack(att.attrs)>meleeAttack(att.attrs);
  if((canStrong||canArc) && Math.random()<0.7) return {kind:"skill",id: canArc?"explosao_arcana":"golpe_poderoso"};
  if(!att.usedBonus && Math.random()<0.35) return {kind:"buff",id:["foco","fortalecer","enfraquecer"][rnd(3)] as any};
  return {kind:"basic"};
}

/* ===== API ===== */
export function startCombat():PublicSnapshot{
  const player=buildUnit("player","Você",1,{str:12,dex:10,intt:10,wis:10,con:12,cha:10,luck:10});
  const enemy =buildUnit("enemy","Satyr Camp",6,{str:12,dex:9,intt:8,wis:7,con:7,cha:7,luck:6});
  const srv:ServerState={player,enemy,log:[],calc:[]};
  return { player:copyPub(player), enemy:copyPub(enemy), log:[], calc:[], srv };
}

export function stepCombat(prev:ServerState, cmd?:ClientCmd):PublicSnapshot{
  const s:ServerState=JSON.parse(JSON.stringify(prev));
  const {player,enemy,log,calc}=s;
  let acted=false;

  for(let guard=0; guard<999; guard++){
    if(player.hp<=0||enemy.hp<=0) break;

    if(player.atb>=100 || enemy.atb>=100){
      const order:[Unit,Unit]=[player,enemy].sort((a,b)=>b.atb-a.atb || (a.id==="player"?-1:1)) as any;
      for(const me of order){
        if(me.hp<=0 || me.atb<100) continue;
        const foe = me.id==="player"? enemy: player;
        const op  = me.id==="player"? cmd   : chooseAI(me,foe);
        if(!me.usedBonus && op?.kind==="buff") bonusAction(me,foe,log,calc,op);
        if(!me.usedFull) fullAction(me,foe,log,calc,op);
        spend(me); acted=true;
        if(player.hp<=0||enemy.hp<=0) break;
      }
      if(acted) break;
    }
    gain(player); gain(enemy);
  }

  return { player:copyPub(player), enemy:copyPub(enemy), log, calc, srv:s };
}
