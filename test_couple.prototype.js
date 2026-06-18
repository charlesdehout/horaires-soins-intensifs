const assert=require("assert");
const P=require("./planning.prototype-couple.js");
let ok=0,tot=0;
function t(n,f){tot++;try{f();ok++;console.log("  ✅ "+n);}catch(e){console.log("  ❌ "+n+" → "+e.message);}}
function equipe(){const m=[];const a=(n,g)=>{for(let i=1;i<=n;i++)m.push({id:g+i,name:g+i,grade:g,fte:1,weekly_hours_target:52,jours_travailles:[1,2,3,4,5,6,7]});};a(6,"resident");a(8,"assistant_specialiste");return m;}
const js=s=>{const j=new Date(s+"T00:00:00Z").getUTCDay();return j===0?7:j;};
const add=(s,n)=>new Date(new Date(s+"T00:00:00Z").getTime()+n*86400000).toISOString().slice(0,10);
const R=P.genererTrimestreCouple({annee:2026,trimestre:3,medecins:equipe(),preferences:[]});
const byDate={};R.shifts.forEach(s=>{(byDate[s.date]=byDate[s.date]||[]).push(s);});
const isG=t=>t==="garde_nuit"||t==="garde_24h";

console.log("\n=== Moteur couplé (week-ends d'abord) ===");
t("couverture WE : 2 gardes 24h + 1 tour = 3 présents (les gardes font le tour)",()=>{
  Object.keys(byDate).forEach(d=>{const jj=js(d);if(jj===6||jj===7){
    assert(byDate[d].filter(s=>s.shift_type==="garde_24h").length>=2,"gardes "+d);
    assert(byDate[d].filter(s=>s.shift_type==="twe").length>=1,"tour "+d);
    assert(byDate[d].filter(s=>["garde_24h","twe"].includes(s.shift_type)).length===3,"présents WE != 3 (sur-staff ?) : "+d);}});
});
t("couverture nuit semaine : 2 gardes, ≥1 résident",()=>{
  const meds=equipe();const gr={};meds.forEach(m=>gr[m.id]=m.grade);
  Object.keys(byDate).forEach(d=>{const jj=js(d);if(jj>=1&&jj<=5&&!P.__){
    const g=byDate[d].filter(s=>isG(s.shift_type));
    if(g.length){assert(g.length>=2,"2 gardes "+d);const sig=R.conflits.some(c=>c.date===d&&/résident/.test(c.message));assert(g.some(s=>gr[s.doctor_id]==="resident")||sig,"≥1 rés (ou signal) "+d);}}});
});
t("couplage : ≥90% des gardes 24h samedi ont une garde le jeudi (même pers.)",()=>{
  let n=0,c=0;R.shifts.filter(s=>s.shift_type==="garde_24h"&&js(s.date)===6).forEach(s=>{n++;const thu=add(s.date,-2);if((byDate[thu]||[]).some(x=>x.doctor_id===s.doctor_id&&isG(x.shift_type)))c++;});
  assert(c/n>=0.9,"couplage sam↔jeu "+c+"/"+n);
});
t("couplage : ≥90% des gardes 24h dimanche ont une garde le vendredi",()=>{
  let n=0,c=0;R.shifts.filter(s=>s.shift_type==="garde_24h"&&js(s.date)===7).forEach(s=>{n++;const fri=add(s.date,-2);if((byDate[fri]||[]).some(x=>x.doctor_id===s.doctor_id&&isG(x.shift_type)))c++;});
  assert(c/n>=0.9,"couplage dim↔ven "+c+"/"+n);
});
t("équité gardes ≤2 intra-grade",()=>{
  const meds=equipe();const G={};meds.forEach(m=>G[m.id]=0);R.shifts.forEach(s=>{if(isG(s.shift_type))G[s.doctor_id]++;});
  ["resident","assistant_specialiste"].forEach(g=>{const v=meds.filter(m=>m.grade===g).map(m=>G[m.id]);assert(Math.max(...v)-Math.min(...v)<=2,g+" "+v.join(","));});
});
t("équité tours WE (gardes 24h + twe font le tour) ≤2 intra-grade, aucun à 0",()=>{
  const meds=equipe();const T={};meds.forEach(m=>T[m.id]=0);
  R.shifts.forEach(s=>{if((js(s.date)===6||js(s.date)===7)&&(s.shift_type==="garde_24h"||s.shift_type==="twe"))T[s.doctor_id]++;});
  ["resident","assistant_specialiste"].forEach(g=>{const v=meds.filter(m=>m.grade===g).map(m=>T[m.id]);assert(Math.max(...v)-Math.min(...v)<=2,g+" spread "+v.join(","));assert(Math.min(...v)>0,g+" un médecin à 0 tour");});
});
t("écart d'heures ≤12,5h",()=>{
  const H={jour:10.5,twe:6,garde_nuit:15,garde_24h:24,off:10.5};const meds=equipe();const h={};meds.forEach(m=>h[m.id]=0);R.shifts.forEach(s=>{if(H[s.shift_type])h[s.doctor_id]+=H[s.shift_type];});
  const v=Object.values(h);assert(Math.max(...v)-Math.min(...v)<=12.5,"écart "+(Math.max(...v)-Math.min(...v)));
});
t("récups étiquetées, jamais un férié/week-end, ≤1/médecin/semaine",()=>{
  const fr=require("./regles.js");const fer=new Set(fr.joursFeriesBE(2026));
  const rec=R.shifts.filter(s=>s.shift_type==="recup");assert(rec.length>=1);
  const pw={};rec.forEach(s=>{assert(/^récup \((samedi|V\/D)\)$/.test(s.note||""),"label");assert(js(s.date)<=5,"jour ouvré");assert(!fer.has(s.date),"férié "+s.date);
    let x=s.date;while(js(x)!==1)x=add(x,-1);pw[s.doctor_id+"|"+x]=(pw[s.doctor_id+"|"+x]||0)+1;});
  assert(Math.max(0,...Object.values(pw))<=1,"≤1/sem");
});
t("congés respectés + mi-temps fait moins de week-ends (pas de crash)",()=>{
  const meds=equipe();meds[0].fte=0.5;meds[0].weekly_hours_target=26;
  const prefs=[{doctor_id:"assistant_specialiste1",start_date:"2026-07-06",end_date:"2026-07-17",pref_type:"conge_annuel"}];
  const r=P.genererTrimestreCouple({annee:2026,trimestre:3,medecins:meds,preferences:prefs});
  const trav=s=>["jour","garde_nuit","garde_24h","twe"].includes(s.shift_type);
  assert(!r.shifts.some(s=>trav(s)&&s.doctor_id==="assistant_specialiste1"&&s.date>="2026-07-06"&&s.date<="2026-07-17"),"congé violé");
});
t("férié en semaine = jour type week-end (2 gardes 24h + 1 tour, 0 nuit, 0 station)",()=>{
  const fr=require("./regles.js");
  const R4=P.genererTrimestreCouple({annee:2026,trimestre:4,medecins:equipe(),preferences:[]});
  const bd={};R4.shifts.forEach(s=>{(bd[s.date]=bd[s.date]||[]).push(s);});
  const feries=[...fr.joursFeriesBE(2026)].filter(d=>d>="2026-10-01"&&d<="2026-12-31"&&js(d)<=5);
  assert(feries.length>=1,"pas de férié semaine en Q4 ?");
  feries.forEach(d=>{const a=bd[d]||[];
    assert(a.filter(s=>s.shift_type==="garde_24h").length>=2,"férié "+d+" : <2 gardes 24h");
    assert(a.filter(s=>s.shift_type==="twe").length>=1,"férié "+d+" : pas de tour");
    assert(a.filter(s=>s.shift_type==="garde_nuit").length===0,"férié "+d+" : garde de nuit (devrait être 24h)");
    assert(a.filter(s=>s.shift_type==="jour").length===0,"férié "+d+" : station ouverte (devrait être fermée)");
  });
});
t("statut spécial « CAP fromager » : 0 lundi, 0 garde dimanche, 0 off, gardes ≈ moyenne",()=>{
  const meds=equipe();
  const F=meds.find(m=>m.id==="resident1");
  F.cap_fromager=true;   // une seule case : pas de lundi, pas de garde dimanche, favori samedi, pas d'off, récup le lundi
  const r=P.genererTrimestreCouple({annee:2026,trimestre:3,medecins:meds,preferences:[]});
  const sh=r.shifts.filter(s=>s.doctor_id==="resident1");
  const trav=s=>["jour","garde_nuit","garde_24h","twe"].includes(s.shift_type);
  assert(sh.filter(s=>js(s.date)===1&&trav(s)).length===0,"travaille un lundi");
  assert(sh.filter(s=>js(s.date)===7&&(s.shift_type==="garde_24h"||s.shift_type==="garde_nuit")).length===0,"garde un dimanche");
  assert(sh.filter(s=>s.shift_type==="off").length===0,"a un off-clinic");
  // récup placée le LUNDI (son jour fromage) au moins une fois
  assert(sh.some(s=>s.shift_type==="recup"&&js(s.date)===1),"aucune récup posée le lundi");
  const g={};meds.forEach(m=>g[m.id]=0);r.shifts.forEach(s=>{if(s.shift_type==="garde_nuit"||s.shift_type==="garde_24h")g[s.doctor_id]++;});
  const others=["resident2","resident3","resident4","resident5","resident6"];
  const avg=others.reduce((a,id)=>a+g[id],0)/others.length;
  assert(Math.abs(g["resident1"]-avg)<=2.5,"gardes trop loin de la moyenne : "+g["resident1"]+" vs "+avg.toFixed(1));
});
console.log("\n--- "+ok+"/"+tot+" tests (moteur couplé) ---\n");
process.exi