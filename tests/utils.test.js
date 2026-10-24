// Testy čisté logiky z utils.js (výběr slov, vyhodnocení odpovědí, levely, streak)
import assert from "node:assert/strict";
import { it } from "vitest";
import * as U from "../src/utils.js";
const t = (name, fn) => it(name, fn);

t("pickRound: 10 nových → 10 unikátních", () => {
  const w = Array.from({length:10},(_,i)=>({id:"w"+i,vmLastReview:null,vmNextReview:null}));
  const r = U.pickRound(w); assert.equal(r.length,10); assert.equal(new Set(r.map(x=>x.id)).size,10);
});
t("pickRound: undefined vmNextReview i mix due/fresh/future bez duplicit, max 15", () => {
  const now=Date.now();
  const w=[...Array.from({length:8},(_,i)=>({id:"d"+i,vmLastReview:1,vmNextReview:now-1000})),
           ...Array.from({length:8},(_,i)=>({id:"f"+i})),
           ...Array.from({length:8},(_,i)=>({id:"u"+i,vmLastReview:1,vmNextReview:now+(i+1)*1e6}))];
  const r=U.pickRound(w); assert.equal(r.length,15); assert.equal(new Set(r.map(x=>x.id)).size,15);
  assert.ok(r.slice(0,8).every(x=>x.id.startsWith("d")), "splatná první");
  assert.ok(r.slice(8,15).every(x=>x.id.startsWith("f")), "pak nová");
});
t("localMatch: 'to work' / 'work'", () => { assert.ok(U.localMatch("work","to work")); assert.ok(U.localMatch("to work","work")); });
t("localMatch: závorky", () => assert.ok(U.localMatch("pracovat","pracovat (na čem)")));
t("localMatch: car ≠ cat, ale překlep u delšího slova projde", () => { assert.ok(!U.localMatch("car","cat")); assert.ok(U.localMatch("hous","house")); assert.ok(!U.localMatch("hose","houses")); });
t("localMatch: conversation ≠ conservation", () => assert.ok(!U.localMatch("conservation","conversation")));
t("localMatch: věta s čárkou celá", () => assert.ok(U.localMatch("Podal bys mi cukr, prosím?","Podal bys mi cukr, prosím?")));
t("localMatch: věta bez interpunkce/diakritiky", () => assert.ok(U.localMatch("podal bys mi cukr prosim","Podal bys mi cukr, prosím?")));
t("localMatch: část věty za čárkou NEprojde", () => assert.ok(!U.localMatch("prosím","Podal bys mi cukr, prosím?")));
t("localMatch: varianty / a ;", () => { assert.ok(U.localMatch("kamarád","přítel / kamarád")); assert.ok(U.localMatch("kamarád","přítel; kamarád")); });
t("localMatch: synonyma s čárkou", () => { assert.ok(U.localMatch("large","big","large, huge")); assert.ok(U.localMatch("huge","big","large; huge")); });
t("localMatch: prázdné/žádný překlep u 'to'", () => { assert.ok(!U.localMatch("","x")); assert.ok(U.localMatch("to","to")); });
t("parseSyn: / a ; ano, čárka ne", () => { assert.deepEqual(U.parseSyn("a / b; c"),["a","b","c"]); assert.deepEqual(U.parseSyn("Nemyslím si to, ne"),["Nemyslím si to, ne"]); });
t("getLevel: pct + name, hranice", () => {
  assert.deepEqual([U.getLevel(0).level,U.getLevel(49).level,U.getLevel(50).level,U.getLevel(5000).level],[1,1,2,11]);
  const l=U.getLevel(100); assert.equal(l.pct,50); assert.equal(l.name,"Učeň");
  const m=U.getLevel(999999); assert.equal(m.next,null); assert.equal(m.pct,100); assert.ok(m.name);
});
t("isMastered: krabička ≥ 4", () => { assert.ok(!U.isMastered({vmBox:3})); assert.ok(U.isMastered({vmBox:4})); assert.ok(!U.isMastered({})); });
t("checkStreak: lokální datum, včera +1, jinak 1, dnes beze změny", () => {
  const today=U.localDateStr(); const y=new Date(); y.setDate(y.getDate()-1);
  assert.equal(U.checkStreak({dailyStreak:5,lastStudyDate:U.localDateStr(y)}).dailyStreak,6);
  assert.equal(U.checkStreak({dailyStreak:5,lastStudyDate:"2000-01-01"}).dailyStreak,1);
  const g={dailyStreak:5,lastStudyDate:today}; assert.equal(U.checkStreak(g),g);
});
t("localDateStr: 23:30 CET = stejný den (ne UTC)", () => {
  assert.equal(U.localDateStr(new Date(2026,9,23,0,30)),"2026-10-23");
});
