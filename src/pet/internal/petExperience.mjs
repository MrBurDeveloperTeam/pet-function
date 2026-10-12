// XP is the remainder towards the next cat level, not lifetime XP.
export function requiredPetXP(level) {
 const n = Math.max(1, Math.floor(Number(level) || 1)) - 1;
 return 100 + 20*n + 2*n*n;
}
export function advancePetXP(level, xp, amount) {
 let nextLevel = Math.max(1,Math.floor(Number(level)||1));
 let remaining = Math.max(0,Math.floor(Number(xp)||0)) + Math.max(0,Math.floor(Number(amount)||0));
 let levelsGained = 0;
 while(remaining >= requiredPetXP(nextLevel)) {
  remaining -= requiredPetXP(nextLevel); nextLevel++; levelsGained++;
 }
 return {level:nextLevel,xp:remaining,levelsGained};
}
