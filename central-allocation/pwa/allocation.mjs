export function eligible(snapshot,symbol,now=Date.now()){
 if(snapshot?.schemaVersion!==1||snapshot.ruleVersion!=='industry-breadth-ema12-26-v1'||snapshot.status!=='ready'||!(Date.parse(snapshot.expiresAt)>now))return false;
 const id=Object.hasOwn(snapshot.symbols||{},symbol)?snapshot.symbols[symbol]:null;
 const group=id&&Object.hasOwn(snapshot.groups||{},id)?snapshot.groups[id]:null;
 return Date.parse(group?.asOf+'T17:00:00+07:00')<=now&&group?.status==='ready'&&group.eligible===true&&Number.isFinite(Date.parse(group.asOf+'T17:00:00+07:00'))&&now-Date.parse(group.asOf+'T17:00:00+07:00')<=96*3600000;
}
export function candidates(universe,held,snapshot,now=Date.now()){
 return [...new Set([...universe.filter(s=>eligible(snapshot,s,now)),...held])];
}
