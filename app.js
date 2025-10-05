/* Palliative Referral Mini App – v1.3
 * เพิ่ม Calculator CSCI/IV + Morphine→Fentanyl patch conversion
 * ทำงานร่วมกับโครง index.html เดิมของคุณ
 */

const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));
const snack=(m,t="info")=>{const e=$("#snack"); if(!e) return; e.textContent=m; e.className=t; e.style.opacity=1; setTimeout(()=>e.style.opacity=0,2500);};
const todayISO=()=>new Date().toISOString().slice(0,10);

// Debounce utility for performance optimization
const debounce = (func, delay) => {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
};

// XSS Protection - Escape HTML entities to prevent script injection
const escapeHTML = (str) => {
  if(!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// Input Validation for Medical Fields - Prevents data entry errors
const VALIDATORS = {
  pAge: (v) => {
    const age = Number(v);
    if(age < 0 || age > 150) return 'อายุต้องอยู่ระหว่าง 0-150 ปี';
    return null;
  },
  pps: (v) => {
    const pps = Number(v);
    if(pps < 10 || pps > 100) return 'PPS ต้องอยู่ระหว่าง 10-100%';
    if(pps % 10 !== 0) return 'PPS ต้องเป็นทวีคูณของ 10';
    return null;
  },
  gfr: (v) => {
    const gfr = Number(v);
    if(gfr < 0 || gfr > 200) return 'GFR ต้องอยู่ระหว่าง 0-200 mL/min/1.73m²';
    return null;
  },
  hct: (v) => {
    const hct = Number(v);
    if(hct < 0 || hct > 100) return 'Hct ต้องอยู่ระหว่าง 0-100%';
    return null;
  },
  alb: (v) => {
    const alb = Number(v);
    if(alb < 0 || alb > 10) return 'Albumin ต้องอยู่ระหว่าง 0-10 g/dL';
    return null;
  },
  painScore: (v) => {
    const score = Number(v);
    if(score < 0 || score > 10) return 'Pain Score ต้องอยู่ระหว่าง 0-10';
    return null;
  },
  dyspneaScore: (v) => {
    const score = Number(v);
    if(score < 0 || score > 10) return 'Dyspnea Score ต้องอยู่ระหว่าง 0-10';
    return null;
  },
  spo2: (v) => {
    const spo2 = Number(v);
    if(spo2 < 0 || spo2 > 100) return 'SpO2 ต้องอยู่ระหว่าง 0-100%';
    return null;
  },
  hr: (v) => {
    const hr = Number(v);
    if(hr < 20 || hr > 250) return 'HR ต้องอยู่ระหว่าง 20-250 ครั้ง/นาที';
    return null;
  },
  vsRR: (v) => {
    const rr = Number(v);
    if(rr < 5 || rr > 60) return 'RR ต้องอยู่ระหว่าง 5-60 ครั้ง/นาที';
    return null;
  }
};

function validateInput(fieldId, value){
  if(!value || value === '') return null; // Empty is OK
  const validator = VALIDATORS[fieldId];
  if(!validator) return null; // No validator = OK
  return validator(value);
}

const STORAGE_KEY="palliative-referral-v1.3";
const DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/1B2ZrpYjFTve6aypQRXjr4l5Ge2F2j0Wf?usp=share_link";
let state={}, meds=[];
let caregivers=[]; // array of {name, relation, tel}
let mixRows=[]; // in-UI rows for multidrug infusion
let mixEditIndex=null; // currently editing infusion index, or null

// ---------- Fields ----------
const FIELD_IDS=[
  "fromFacility","refDate",
  "toFacilityPrimary","toFacilitySecondary","toFacilityTertiary",
  "pName","pAge","pHN","pCID","pAddress",
  "informedBy","living","concerns","perceptionPatient","perceptionFamily","conspiracy",
  "dx","pps","gfr","hct","alb",
  "painSite","painScore","dyspneaScore","spo2","gcs","others",
  "bp","hr","vsRR","rr",
  "fuDate","fuSite","fuTel"
];

// ---------- Drug dictionary ----------
const DRUGS=[
  {name:"MST 10 mg/tab", form:"tab", strength:"10 mg", defaultUse:"1 tab oral q12h"},
  {name:"MST 30 mg/tab", form:"tab", strength:"30 mg", defaultUse:"1 tab oral q12h"},
  {name:"Kapanol 20 mg", form:"cap", strength:"20 mg", defaultUse:"1 cap oral q12h"},
  {name:"Methadone", form:"tab", strength:"5–10 mg", defaultUse:"2.5–5 mg oral q8–12h"},
  {name:"Morphine injection 10 mg/mL (1 amp)", form:"inj", strength:"10 mg/mL", defaultUse:"3 mg IV/SC PRN q4h pain/dyspnea"},
  {name:"Fentanyl patch 25 mcg/hr", form:"patch", strength:"25 mcg/hr", defaultUse:"Apply 1 patch q72h"},
  {name:"Fentanyl injection 100 mcg/2 mL (1 amp)", form:"inj", strength:"100 mcg/2 mL", defaultUse:"25–50 mcg IV PRN"},
  {name:"Haloperidol", form:"inj", strength:"5 mg/mL", defaultUse:"0.5–1 mg SC q4–6h PRN"},
  {name:"Midazolam", form:"inj", strength:"5 mg/mL", defaultUse:"1–2 mg SC q1h PRN"},
  {name:"Senna", form:"tab", strength:"", defaultUse:"2 tab oral qHS"},
  {name:"Lactulose", form:"syrup", strength:"", defaultUse:"15–30 mL oral q12h PRN"},
];

// A lightweight formulary for single-line order UI (name + unit + route)
const FORMULARY=[
  {name:"MST 10 mg/tab", unit:"tab", route:"PO"},
  {name:"MST 30 mg/tab", unit:"tab", route:"PO"},
  {name:"Kapanol 20 mg", unit:"cap", route:"PO"},
  {name:"Methadone", unit:"mg", route:"PO"},
  {name:"Morphine IR 10 mg/tab", unit:"tab", route:"SL"},
  {name:"Morphine injection 10 mg/mL (1 amp)", unit:"mg", route:"IV/SC"},
  {name:"Fentanyl patch 25 mcg/hr", unit:"patch", route:"patch"},
  {name:"Fentanyl injection 100 mcg/2 mL (1 amp)", unit:"mcg", route:"IV"},
  {name:"Midazolam", unit:"mg", route:"SC"},
  {name:"Haloperidol", unit:"mg", route:"SC"},
  {name:"Senna", unit:"tab", route:"PO"},
  {name:"Lactulose", unit:"mL", route:"PO"},
  {name:"Atropine 1% eye drops", unit:"หยด", route:"SL"},
  {name:"Lorazepam 1 mg", unit:"mg", route:"SL"},
  {name:"Hyoscine butylbromide (Buscopan) injection 20 mg/mL (1 amp)", unit:"mg", route:"IV/SC"},
];

// ---------- Safety: Drug Interactions ----------
const DRUG_INTERACTIONS = {
  'Morphine+Midazolam': {
    severity: 'moderate',
    warning: 'เสี่ยงหยุดหายใจ - ระวังขนาดยา monitor RR'
  },
  'Morphine+Haloperidol': {
    severity: 'moderate',
    warning: 'เสี่ยง sedation เพิ่ม - ระวัง CNS depression'
  },
  'Methadone+Haloperidol': {
    severity: 'high',
    warning: '⚠️ เสี่ยง QT prolongation - พิจารณาตรวจ EKG'
  },
  'Midazolam+Haloperidol': {
    severity: 'moderate',
    warning: 'เสี่ยง over-sedation - ปรับขนาดยาอย่างระมัดระวัง'
  },
  'Fentanyl+Midazolam': {
    severity: 'moderate',
    warning: 'เสี่ยงหยุดหายใจ - monitor vital signs'
  }
};

function checkDrugInteractions(){
  if(!meds || meds.length < 2) return;

  const drugNames = meds.map(m => shortDrugName(m.name));
  const interactions = [];

  for(let i=0; i<drugNames.length; i++){
    for(let j=i+1; j<drugNames.length; j++){
      const pair1 = `${drugNames[i]}+${drugNames[j]}`;
      const pair2 = `${drugNames[j]}+${drugNames[i]}`;
      const interaction = DRUG_INTERACTIONS[pair1] || DRUG_INTERACTIONS[pair2];

      if(interaction){
        interactions.push({
          drugs: `${drugNames[i]} + ${drugNames[j]}`,
          ...interaction
        });
      }
    }
  }

  if(interactions.length > 0){
    interactions.forEach(int => {
      const severity = int.severity === 'high' ? 'danger' : 'warn';
      snack(`💊 ${int.drugs}: ${int.warning}`, severity);
    });
  }
}

function safetyChecks(){
  if(!meds || meds.length === 0) return;

  // Check 1: Opioid without laxative
  const opioid=/\b(morphine|mst|kapanol|methadone|fentanyl)\b/i;
  const hasOpioid=meds.some(m=>m.name && opioid.test(m.name));
  const hasLax=meds.some(m=>/senna|lactulose|bisacodyl|sodium picosulfate/.test((m.name+" "+(m.use||"")+ (m.doseText||"")).toLowerCase()));
  if(hasOpioid && !hasLax){
    snack("⚠️ พบ opioid แต่ยังไม่มี laxative — แนะนำ Senna/Lactulose", "warn");
  }

  // Check 2: Drug interactions
  checkDrugInteractions();
}

// ---------- Name shortener for compact display ----------
function shortDrugName(name){
  const n=(name||'').toLowerCase();
  const map=[
    [/hyoscine\s+butylbromide|buscopan/, 'Buscopan'],
    [/morphine/, 'Morphine'],
    [/fentanyl\s*patch/, 'Fentanyl patch'],
    [/fentanyl/, 'Fentanyl'],
    [/midazolam/, 'Midazolam'],
    [/haloperidol/, 'Haloperidol'],
    [/methadone/, 'Methadone'],
    [/kapanol/, 'Kapanol'],
    [/\bmst\b/, 'MST'],
    [/lorazepam/, 'Lorazepam'],
    [/atropine/, 'Atropine'],
  ];
  for(const [re,label] of map){ if(re.test(n)) return label; }
  // fallback: drop parentheses, dosage forms/units and numbers
  let s=(name||'');
  s=s.replace(/\([^)]*\)/g,' ');
  s=s.replace(/\b(injection|inj|tab|cap|capsule|tablet|syrup|eye drops|patch)\b/gi,' ');
  s=s.replace(/\b\d+(?:\.\d+)?\s*(mg|mcg|mL|ml|%)\b/gi,' ');
  s=s.replace(/\s{2,}/g,' ').trim();
  const parts=s.split(/\s+/).filter(Boolean);
  return parts.length? parts[0].charAt(0).toUpperCase()+parts[0].slice(1) : (name||'');
}

// ---------- Undo/Redo Stack ----------
let undoStack = [];
const MAX_UNDO = 20;

function pushUndo(action, data){
  undoStack.push({action, data, timestamp: Date.now()});
  if(undoStack.length > MAX_UNDO) undoStack.shift();
}

function performUndo(){
  if(undoStack.length === 0){
    snack('ไม่มีอะไรให้ undo', 'warn');
    return;
  }

  const lastAction = undoStack.pop();

  if(lastAction.action === 'deleteMed'){
    // Restore deleted medication
    const {med, index} = lastAction.data;
    meds.splice(index, 0, med);
    renderMeds();
    saveAll();
    snack('กู้คืนยาแล้ว', 'ok');
  }
}

// Global keyboard shortcut for undo
document.addEventListener('keydown', (e)=>{
  if((e.ctrlKey || e.metaKey) && e.key === 'z'){
    e.preventDefault();
    performUndo();
  }
});

// ---------- Storage with Error Handling ----------
let saveStatusTimeout = null;

function showSaveStatus(status){
  const saveStatusEl = document.getElementById('saveStatus');
  if(!saveStatusEl) return;

  saveStatusEl.classList.remove('saved', 'saving');
  saveStatusEl.classList.add('show', status);

  if(status === 'saved'){
    saveStatusEl.textContent = '✓ บันทึกแล้ว';
  } else if(status === 'saving'){
    saveStatusEl.textContent = 'กำลังบันทึก...';
  }

  // Clear previous timeout
  if(saveStatusTimeout) clearTimeout(saveStatusTimeout);

  // Hide after 2 seconds
  saveStatusTimeout = setTimeout(() => {
    saveStatusEl.classList.remove('show');
  }, 2000);
}

function saveAll(){
  showSaveStatus('saving');
  try{
    const data = JSON.stringify({state,meds,caregivers,ts:Date.now()});
    localStorage.setItem(STORAGE_KEY, data);
    showSaveStatus('saved');
  }catch(err){
    console.error('Failed to save data:', err);
    snack('⚠️ ไม่สามารถบันทึกข้อมูลได้ - localStorage อาจเต็ม', 'danger');
  }
}

function loadAll(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw) return false;

    const d=JSON.parse(raw)||{};

    // Validate data structure
    if(typeof d !== 'object'){
      throw new Error('Invalid data format');
    }

    state=d.state||{};
    meds=Array.isArray(d.meds)? d.meds: [];
    caregivers=Array.isArray(d.caregivers)? d.caregivers: [];

    return true;
  }catch(err){
    console.error('Failed to load data:', err);
    snack('⚠️ ไม่สามารถโหลดข้อมูลได้ - ข้อมูลอาจเสียหาย', 'danger');
    return false;
  }
}

// ---------- Format helpers ----------
function formatThaiCID(cid){
  const d=(cid||'').replace(/\D/g,'');
  if(d.length!==13) return cid||'';
  return `${d[0]}-${d.slice(1,5)}-${d.slice(5,10)}-${d.slice(10,12)}-${d[12]}`;
}
function formatPhone(t){
  const d=(t||'').replace(/\D/g,'');
  if(d.length===10) return `${d.slice(0,3)}-${d.slice(3)}`;
  if(d.length===9) return `${d.slice(0,3)}-${d.slice(3)}`;
  if(d.length===8) return `${d.slice(0,3)}-${d.slice(3)}`;
  return t||'';
}

// ---------- Bind for PDF ----------
function bindSpans(){
  $$("#pdfArea [data-bind]").forEach(sp=>{
    const k=sp.getAttribute("data-bind");
    // map RR: ใช้ vsRR ถ้ามี ไม่งั้น fallback rr
    if(k==="vsRR") { sp.textContent=(state.vsRR??state.rr??"").toString(); return; }
    if(k==="pCID") { sp.textContent = formatThaiCID(state.pCID||""); return; }
    if(k==="careTel" || k==="fuTel") { sp.textContent = formatPhone(state[k]||""); return; }
    sp.textContent=(state[k]??"").toString();
  });
  updatePdfToList();
  updatePdfVisibility();
}

// ---------- Caregivers ----------
function syncCarePrimaryToState(){
  const c = caregivers && caregivers[0] ? caregivers[0] : {name:"", relation:"", tel:""};
  state.careName = c.name || "";
  state.careRelation = c.relation || "";
  state.careTel = c.tel || "";
}
function renderCaregivers(){
  const host = document.getElementById('caregiversList');
  if(!host) return;
  host.innerHTML = '';
  caregivers.forEach((c, i)=>{
    const row = document.createElement('div');
    row.className = 'row cg-row';
    row.innerHTML = `
      <span class="cg-tag" title="คนแรกเป็นผู้ดูแลหลักเสมอ">${i===0? 'หลัก': 'รอง'}</span>
      <input class="grow" placeholder="ชื่อผู้ดูแล" value="${escapeHTML(c.name||'')}" data-i="${i}" data-field="name" />
      <input placeholder="ความสัมพันธ์" value="${escapeHTML(c.relation||'')}" data-i="${i}" data-field="relation" style="max-width:160px" />
      <input placeholder="โทรศัพท์" value="${escapeHTML(c.tel||'')}" data-i="${i}" data-field="tel" style="max-width:160px" />
      <button type="button" class="small" data-act="up" data-i="${i}">↑</button>
      <button type="button" class="small" data-act="down" data-i="${i}">↓</button>
      <button type="button" class="small danger" data-act="del" data-i="${i}">ลบ</button>
    `;
    host.appendChild(row);
  });
  // Empty state → show one blank row for convenience
  if(caregivers.length===0){ caregivers=[{name:'', relation:'', tel:''}]; renderCaregivers(); return; }
  // Wire events
  host.querySelectorAll('input[data-field]').forEach(inp=>{
    inp.addEventListener('input', (e)=>{
      const i = +e.target.getAttribute('data-i');
      const f = e.target.getAttribute('data-field');
      if(!caregivers[i]) return;

      // Auto-format phone numbers
      if(f === 'tel'){
        const formatted = formatThaiPhone(e.target.value);
        e.target.value = formatted;
        caregivers[i][f] = formatted;
      } else {
        caregivers[i][f] = e.target.value;
      }

      syncCarePrimaryToState();
      renderPrintDoc();
      saveAll();
    });
  });
  host.querySelectorAll('button[data-act]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const i = +btn.getAttribute('data-i');
      const act = btn.getAttribute('data-act');
      if(act==='del'){
        caregivers.splice(i,1);
      }else if(act==='up' && i>0){
        const t = caregivers[i-1]; caregivers[i-1]=caregivers[i]; caregivers[i]=t;
      }else if(act==='down' && i<caregivers.length-1){
        const t = caregivers[i+1]; caregivers[i+1]=caregivers[i]; caregivers[i]=t;
      }
      syncCarePrimaryToState();
      renderCaregivers();
      renderPrintDoc();
      saveAll();
    });
  });
}
function initCaregiversUI(){
  const addBtn = document.getElementById('addCaregiver');
  if(addBtn){
    addBtn.addEventListener('click', ()=>{
      caregivers.push({name:'', relation:'', tel:''});
      renderCaregivers();
      syncCarePrimaryToState();
      renderPrintDoc();
      saveAll();
    });
  }
  // Migration: if no caregivers but legacy single fields exist → seed array
  if((!caregivers || caregivers.length===0) && (state.careName||state.careRelation||state.careTel)){
    caregivers = [{name: state.careName||'', relation: state.careRelation||'', tel: state.careTel||''}];
  }
  // Ensure array exists
  if(!Array.isArray(caregivers)) caregivers=[];
  renderCaregivers();
  syncCarePrimaryToState();
}

function isEmpty(v){ return (v==null || String(v).trim()===""); }
function updatePdfVisibility(){
  // Dx line: hide if nothing meaningful (ignore default PPS=40)
  const dx=(state.dx||'').trim();
  const pps=(state.pps||'').trim();
  const gfr=(state.gfr||'').trim();
  const hct=(state.hct||'').trim();
  const alb=(state.alb||'').trim();
  const hasDx = !!dx;
  const hasLabs = !!(gfr||hct||alb);
  const hasPps = (!!pps && pps!=="40");
  const showDx = hasDx || hasLabs || hasPps;
  const dxEl=$("#pdfLineDx"); if(dxEl) dxEl.style.display = showDx? '':'none';

  // Symptoms line: any of fields present
  const painSite=(state.painSite||'').trim();
  const painScore=(state.painScore||'').trim();
  const dysp=(state.dyspneaScore||'').trim();
  const spo2=(state.spo2||'').trim();
  const rr=(state.vsRR||state.rr||'').trim();
  const nausea=(state.nausea||'').trim();
  const gcs=(state.gcs||'').trim();
  const others=(state.others||'').trim();
  const showSym = !!(painSite||painScore||dysp||spo2||rr||nausea||gcs||others);
  const symEl=$("#pdfLineSymptoms"); if(symEl) symEl.style.display = showSym? '':'none';

  // V/S line
  const bps=(state.bpSys||'').trim();
  const bpd=(state.bpDia||'').trim();
  const hr=(state.hr||'').trim();
  const showVS = !!(bps||bpd||hr);
  const vsEl=$("#pdfLineVS"); if(vsEl) vsEl.style.display = showVS? '':'none';

  // Perception lines (separate patient/family)
  const hasPerP = !!(state.perceptionPatient||'').trim();
  const hasPerF = !!(state.perceptionFamily||'').trim();
  const perP=$("#pdfLinePerPatient"); if(perP) perP.style.display = hasPerP? '':'none';
  const perF=$("#pdfLinePerFamily"); if(perF) perF.style.display = hasPerF? '':'none';
  // Conspiracy line
  const showCon = !!( (state.conspiracy||'').trim() );
  const conEl=$("#pdfLineConspiracy"); if(conEl) conEl.style.display = showCon? '':'none';
}

function updatePdfToList(){
  const ul = document.querySelector('#pdfToList'); if(!ul) return;
  ul.innerHTML = '';
  const entries = [];
  if((state.toFacilityPrimary||'').trim()) entries.push({k:'Primary', v:state.toFacilityPrimary.trim()});
  if((state.toFacilitySecondary||'').trim()) entries.push({k:'Secondary', v:state.toFacilitySecondary.trim()});
  if((state.toFacilityTertiary||'').trim()) entries.push({k:'Tertiary', v:state.toFacilityTertiary.trim()});
  entries.forEach(e=>{
    const li=document.createElement('li'); li.textContent = `${e.k}: ${e.v}`; ul.appendChild(li);
  });
}

// ---------- State I/O ----------
function readInputsToState(){
  FIELD_IDS.forEach(id=>{ const el=$("#"+id); if(el) state[id]=(el.value||"").trim(); });
  // Parse BP from combined field
  const bpRaw = (state.bp||"").trim();
  const bpMatch = bpRaw.match(/^(\d+)\s*\/\s*(\d+)$/);
  if(bpMatch){ state.bpSys = bpMatch[1]; state.bpDia = bpMatch[2]; }
  else{ state.bpSys = ""; state.bpDia = ""; }
  // Read nausea from radio buttons
  const nauseaEl = document.querySelector('input[name="nausea"]:checked');
  state.nausea = nauseaEl ? nauseaEl.value : "";
  // aggregate multi-destination into one line for PDF/HIS
  const items=[];
  if(state.toFacilityPrimary) items.push(`Primary: ${state.toFacilityPrimary}`);
  if(state.toFacilitySecondary) items.push(`Secondary: ${state.toFacilitySecondary}`);
  if(state.toFacilityTertiary) items.push(`Tertiary: ${state.toFacilityTertiary}`);
  state.toFacilities = items.join(" • ");
  const bars=[];
  if(state.toFacilityPrimary) bars.push(`| Primary: ${state.toFacilityPrimary}`);
  if(state.toFacilitySecondary) bars.push(`| • Secondary: ${state.toFacilitySecondary}`);
  if(state.toFacilityTertiary) bars.push(`| • Tertiary: ${state.toFacilityTertiary}`);
  state.toFacilitiesLine = bars.join(' ');
  state.purposeList = $$("#purposeChips input:checked").map(x=>x.value).join(" • ");
  state.acpList     = $$("#acpChips input:checked").map(x=>x.value).join(" • ");
  state.metastasisList = $$("#metastasisChips input:checked").map(x=>x.value).join(", ");
  state.treatmentList = $$("#treatmentChips input:checked").map(x=>x.value).join(", ");
  // Sync primary caregiver fields (for PDF/HIS)
  syncCarePrimaryToState();
}
function renderStateToInputs(){
  FIELD_IDS.forEach(id=>{ const el=$("#"+id); if(el && state[id]!=null) el.value=state[id]; });
  // Restore nausea radio selection
  if(state.nausea){ const nauseaEl = document.querySelector(`input[name="nausea"][value="${state.nausea}"]`); if(nauseaEl) nauseaEl.checked = true; }
  $$("#purposeChips input").forEach(ch=>ch.checked=(state.purposeList||"").includes(ch.value));
  $$("#acpChips input").forEach(ch=>ch.checked=(state.acpList||"").includes(ch.value));
  $$("#metastasisChips input").forEach(ch=>ch.checked=(state.metastasisList||"").includes(ch.value));
  $$("#treatmentChips input").forEach(ch=>ch.checked=(state.treatmentList||"").includes(ch.value));
  // Caregivers UI
  renderCaregivers();
}

// ---------- Meds UI ----------
function medLine(m){
  const name = m.name || "";
  const use  = (m.use || m.doseText || "").trim();
  const qtyPart = (m.qty!=null && m.qty!=="") ? ` ( # ${m.qty} )` : "";

  // Infusions — no category label, with device/site notes per device
  if(m.orderType==="infusion"){
    // Helpers
    const viaCSCI = /CSCI/i.test(m.route||"") || /SC infusion/i.test(m.route||"");
    const via = viaCSCI ? "CSCI" : /IV/i.test(m.route||"") ? "IV" : (m.route||"");
    const diluent = m.diluent || "";
    const vol = m.finalVol != null ? m.finalVol : "";
    const rateComputed = m.rate != null ? Number(m.rate).toFixed(2) : "";
    const rateDisplay = (m.device==="elastomeric") ? "2.00" : rateComputed;
    // Device parts inside parentheses before site
    const deviceParts = [];
    if(m.device==="pump") deviceParts.push("infusion pump");
    else if(m.device==="syringe"){
      if(m.mmPerHr) deviceParts.push(`set ${m.mmPerHr} mm/h`);
      if(m.syringeDia) deviceParts.push(`Ø ${m.syringeDia} mm`);
      deviceParts.push("Thalapump-20");
    }else if(m.device==="elastomeric") deviceParts.push("Surefuser CBI-M100");
    const siteStr = m.site ? `site: ${m.site}` : "";
    const paren = (deviceParts.length && siteStr)
      ? ` (${deviceParts.join(', ')}; ${siteStr})`
      : (deviceParts.length ? ` (${deviceParts.join(', ')})` : (siteStr? ` (${siteStr})` : ''));

    // Components (multidrug) vs single-drug total mg
    if(Array.isArray(m.components) && m.components.length){
      const compStr = m.components.map(c=>`${shortDrugName(c.name)} ${c.dose} ${c.unit||'mg'}`).join(' + ');
      return `${compStr} + ${diluent} up to ${vol} mL via ${via} @ ${rateDisplay} mL/h${paren}${qtyPart}`;
    }
    const total = m.total || (use.match(/(\d+(?:\.\d+)?)\s*mg\b/i)?.[1]) || "";
    const nameShort = shortDrugName(name);
    return `${nameShort} ${total} mg + ${diluent} up to ${vol} mL via ${via} @ ${rateDisplay} mL/h${paren}${qtyPart}`;
  }

  // Patch — no category label
  if(/patch/i.test(m.route||"") || /patch/i.test(name)){
    const rateMatch = name.match(/(\d+\s*mcg\/hr)/i);
    const rateTxt = rateMatch ? rateMatch[1] : "";
    const nameBase = rateTxt ? name.replace(rateMatch[0], "").trim().replace(/\s{2,}/g,' ') : name;
    const applyMatch = use.match(/Apply\s+(\d+)\s+patch/i);
    const n = applyMatch ? applyMatch[1] : "1";
    const site = (use.match(/to\s+([^,]+)\s*,/i)?.[1]) || (use.match(/to\s+([^,]+)$/i)?.[1]) || "chest/upper arm";
    const q = (use.match(/change\s+q?([\d–-]+)h/i)?.[1]) || "72";
    return `${nameBase} ${rateTxt} — Apply ${n} patch to ${site}, change q${q}h${qtyPart}`;
  }

  // PO/SL/Inject — no category label
  const dose = (use.match(/^(\d+(?:\.\d+)?(?:\s*[–-]\s*\d+(?:\.\d+)?)?)\s*(mg|mcg|mL|ml|tab|cap|หยด)\b/i)?.[0]) || "";
  const routeTxt = (use.match(/\b(PO|SL|IV\/SC|IV|SC)\b/i)?.[0] || (m.route||""));
  const isPRN = /\bPRN\b/i.test(use) || /prn/i.test((m.orderType||""));
  const q = (use.match(/\bq\s*([\d–-]+)h\b/i)?.[1]) || "";
  const indication = (use.match(/\bfor\s+(.+)$/i)?.[1]) || "";

  if(/\b(PO|SL)\b/i.test(routeTxt)){
    return `${name} — ${dose} ${routeTxt.toUpperCase()}${isPRN?" PRN":""}${q?` q${q}h`:""}${indication?` for ${indication}`:""}${qtyPart}`;
  }
  if(/\b(IV|SC|IV\/SC)\b/i.test(routeTxt)){
    return `${name} — ${dose} ${routeTxt.toUpperCase()}${isPRN?" PRN":""}${q?` q${q}h`:""}${indication?` for ${indication}`:""}${qtyPart}`;
  }
  return `${name} — ${use}${qtyPart}`;
}
// ---------- TDD (per 24h) ----------
function number(val){ const n=+val; return isFinite(n)? n: 0; }
function mgFromUnit(val, unit){ unit=(unit||'mg').toLowerCase(); const v=number(val); if(unit==='mcg') return v/1000; return v; }
function parseFirstNumber(s){ const m=String(s||'').match(/(\d+(?:\.\d+)?)/); return m? +m[1]: 0; }
function mgPerDoseFromUseOrName(m){
  const use=m.use||m.doseText||'';
  // try explicit mg in use
  let mg = 0;
  const mgMatch = use.match(/(\d+(?:\.\d+)?)\s*mg\b/i);
  if(mgMatch){ mg = +mgMatch[1]; return mg; }
  // explicit mcg in use → convert to mg
  const mcgMatch = use.match(/(\d+(?:\.\d+)?)\s*(?:mcg|µg|ug)\b/i);
  if(mcgMatch){ mg = (+mcgMatch[1]) / 1000; return mg; }
  // try count x mg-per-unit from name
  const countMatch = use.match(/(\d+(?:\.\d+)?)\s*(tab|cap|patch)\b/i);
  const perUnitMatch = (m.name||'').match(/(\d+(?:\.\d+)?)\s*mg\b/i);
  if(countMatch && perUnitMatch){ mg = (+countMatch[1]) * (+perUnitMatch[1]); return mg; }
  return 0;
}
function dosesPerDayFromUse(m){
  const use=m.use||m.doseText||'';
  if(/\bqHS\b/i.test(use)) return 1;
  const qMatch = use.match(/q\s*(\d+)/i);
  if(qMatch){ const h=+qMatch[1]; if(h>0) return 24/h; }
  return 0; // unknown
}
function fentanylPatchMgPerDay(m){
  const name=m.name||''; const use=m.use||m.doseText||'';
  // Accept 12.5, 25, 50 etc; mcg/hr or mcg/h; also µg or ug
  const rateMatch = name.match(/(\d+(?:\.\d+)?)\s*(?:mcg|µg|ug)\s*\/?\s*(?:h|hr)\b/i);
  if(!rateMatch) return 0;
  // Count number of patches applied concurrently: "Apply 2 patch(es)" or Thai "2 แผ่น"
  const nMatch = use.match(/Apply\s+(\d+(?:\.\d+)?)\s*(?:patch(?:es)?|แผ่น)\b/i) || use.match(/(\d+(?:\.\d+)?)\s*(?:patch(?:es)?|แผ่น)\b/i);
  const n = nMatch? +nMatch[1]: 1;
  const mcgHr = (+rateMatch[1]) * n;
  return (mcgHr * 24) / 1000; // mg/day
}
function shortKey(name){ return shortDrugName(name||''); }
function computeTDDMap(){
  const map={};
  meds.forEach(m=>{
    if(m.orderType==="infusion"){
      const dur = number(m.duration)||24; const factor = dur>0? 24/dur : 1;
      if(Array.isArray(m.components) && m.components.length){
        m.components.forEach(c=>{
          const doseMg = mgFromUnit(c.dose, c.unit);
          const add = doseMg * factor;
          const k = shortKey(c.name);
          map[k]=(map[k]||0)+add;
        });
      }else{
        const totalMg = number(m.total);
        if(totalMg>0){ const k=shortKey(m.name); map[k]=(map[k]||0)+ totalMg * factor; }
      }
    }else{
      // Patch (fentanyl)
      if(/patch/i.test(m.route||'') || /patch/i.test(m.name||'')){
        const mgd = fentanylPatchMgPerDay(m); if(mgd>0){ const k=shortKey(m.name); map[k]=(map[k]||0)+mgd; }
        return;
      }
      // Skip PRN for TDD to avoid overestimation
      if(/\bPRN\b/i.test(m.use||'') || /prn/i.test(m.orderType||'')) return;
      const mgPerDose = mgPerDoseFromUseOrName(m);
      const dosesPerDay = dosesPerDayFromUse(m);
      if(mgPerDose>0 && dosesPerDay>0){ const k=shortKey(m.name); map[k]=(map[k]||0)+ mgPerDose * dosesPerDay; }
    }
  });
  return map;
}
// ---------- OME (Morphine-equivalent per 24h) ----------
function routeOf(m){
  const s = `${m.route||''} ${(m.use||m.doseText||'')}`.toUpperCase();
  if(/PATCH/.test(s)) return 'PATCH';
  if(/IV\/?SC|IV\/SC/.test(s)) return 'IV/SC';
  if(/\bIV\b/.test(s)) return 'IV';
  if(/\bSC\b/.test(s)) return 'SC';
  if(/\bSL\b/.test(s)) return 'SL';
  return 'PO';
}
function isPRN(m){ return (/\bPRN\b/i.test(m.use||'') || /prn/i.test(m.orderType||'')); }
function fentanylPatchMcgPerHr(m){
  const name=m.name||''; const use=m.use||m.doseText||'';
  const rateMatch = name.match(/(\d+(?:\.\d+)?)\s*(?:mcg|µg|ug)\s*\/?\s*(?:h|hr)\b/i);
  if(!rateMatch) return 0;
  const nMatch = use.match(/Apply\s+(\d+(?:\.\d+)?)\s*(?:patch(?:es)?|แผ่น)\b/i) || use.match(/(\d+(?:\.\d+)?)\s*(?:patch(?:es)?|แผ่น)\b/i);
  const n = nMatch? +nMatch[1]: 1;
  return (+rateMatch[1]) * n;
}
function omeFromNameAndRoute(drugName, route){
  const n=(drugName||'').toLowerCase();
  // return per mg of that drug (unless fentanyl patch handled elsewhere)
  if(/morphine|\bmst\b|kapanol/.test(n)){
    if(route==='IV' || route==='SC' || route==='IV/SC') return 3; // 1 mg IV/SC ≈ 3 mg OME
    return 1; // PO/SL
  }
  if(/oxycodone|oxycontin|oxy/.test(n)){
    return 1.5; // PO
  }
  if(/hydromorphone|dilaudid/.test(n)){
    if(route==='IV' || route==='SC' || route==='IV/SC') return 20; // 1 mg IV ≈ 20 mg OME
    return 4; // PO
  }
  if(/codeine/.test(n)) return 0.15; // PO
  if(/tramadol/.test(n)) return 0.1; // PO
  // Methadone: highly variable; exclude from OME auto‑calc to avoid risk
  if(/methadone/.test(n)) return 0; // skip
  // Fentanyl inj (non‑patch): avoid auto OME unless necessary → skip by default
  if(/fentanyl/.test(n) && route!=='PATCH') return 0;
  return 0; // unknown opioid → not counted
}
function computeOMEMap(){
  const map={};
  // Infusions
  meds.forEach(m=>{
    if(m.orderType==="infusion"){
      const r = routeOf(m);
      const dur = number(m.duration)||24; const factor = dur>0? 24/dur : 1;
      if(Array.isArray(m.components)){
        m.components.forEach(c=>{
          const perMg = omeFromNameAndRoute(c.name, r);
          if(perMg<=0) return;
          const mgDay = mgFromUnit(c.dose, c.unit) * factor;
          const add = mgDay * perMg;
          const k=shortKey(c.name);
          map[k]=(map[k]||0)+add;
        });
      }
      return;
    }
    // Skip PRN
    if(isPRN(m)) return;
    const r=routeOf(m);
    // Fentanyl patch → special handling
    if((/fentanyl/i.test(m.name||'')||/fentanyl/i.test(m.route||'')) && r==='PATCH'){
      const mcgHr = fentanylPatchMcgPerHr(m);
      if(mcgHr>0){
        const ome = mcgHr * 2.4; // 1 mcg/h ≈ 2.4 mg OME/24h
        const k='Fentanyl patch';
        map[k]=(map[k]||0)+ome;
      }
      return;
    }
    // Other opioids
    const perMg = omeFromNameAndRoute(m.name||'', r);
    if(perMg<=0) return;
    const mgPerDose = mgPerDoseFromUseOrName(m);
    const dPerDay = dosesPerDayFromUse(m);
    const mgDay = mgPerDose * dPerDay;
    if(mgDay>0){ const k=shortKey(m.name); map[k]=(map[k]||0)+ mgDay * perMg; }
  });
  return map;
}
function tddSummaryText(){
  const map=computeOMEMap();
  const keys=Object.keys(map).sort();
  if(!keys.length) return '';
  const total = keys.reduce((s,k)=>s+map[k],0);
  const detail = keys.map(k=>`${k} ${map[k].toFixed(map[k]<1?2:0)} mg`).join('; ');
  return `OME (per 24 h) — Background: ${total.toFixed(total<1?2:0)} mg (${detail})`;
}
function updateTDDViews(){
  const ui=$("#tddSummary"); if(ui) ui.textContent=tddSummaryText();
  const pdf=$("#pdfTdd"); if(pdf) pdf.textContent=tddSummaryText();
}

function buildPrintHTML(){
  const get = k => (state[k]||'').toString().trim();
  const has = k => !!get(k);
  const e = s => s; // no escaping needed in offline context
  const printedAt = new Date().toLocaleString('th-TH', { dateStyle:'medium', timeStyle:'short' });
  function formatThaiDate(s){
    if(!s) return '';
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m) return s;
    const y = +m[1] + 543; const mo = +m[2]; const d = +m[3];
    const th = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    return `${d} ${th[mo-1]} ${y}`;
  }
  const toList = [];
  if(has('toFacilityPrimary')) toList.push(`<li>Primary: ${e(get('toFacilityPrimary'))}</li>`);
  if(has('toFacilitySecondary')) toList.push(`<li>Secondary: ${e(get('toFacilitySecondary'))}</li>`);
  if(has('toFacilityTertiary')) toList.push(`<li>Tertiary: ${e(get('toFacilityTertiary'))}</li>`);

  const lines = [];
  const dx=get('dx'), pps=get('pps'), gfr=get('gfr'), hct=get('hct'), alb=get('alb');
  const mets=get('metastasisList'), tx=get('treatmentList');
  const showDx = !!(dx || gfr || hct || alb || (pps && pps!=="40") || mets || tx);
  if(showDx){
    lines.push(`<p>Dx: ${e(dx||'-')} | PPS: ${e(pps||'-')}% | GFR: ${e(gfr||'-')} | Hct: ${e(hct||'-')}% | Alb: ${e(alb||'-')} g/dL</p>`);
    if(mets) lines.push(`<p>Metastasis: ${e(mets)}</p>`);
    if(tx) lines.push(`<p>การรักษาที่ผ่านมา: ${e(tx)}</p>`);
  }
  const pain=get('painSite'), ps=get('painScore'), dy=get('dyspneaScore'), spo2=get('spo2'), rr=(get('vsRR')||get('rr')), nau=get('nausea'), gcs=get('gcs'), oth=get('others');
  if(pain||ps||dy||spo2||rr||nau||gcs||oth){ lines.push(`<p>อาการ: ปวดบริเวณ ${e(pain||'-')} (PS ${e(ps||'-')}/10); Dyspnea ${e(dy||'-')}/10${spo2?` (SpO2 ${e(spo2)}%)`:''}${rr?` (RR ${e(rr)}/min)`:''}; คลื่นไส้/อาเจียน: ${e(nau)}${gcs?`; GCS ${e(gcs)}`:''}; อื่นๆ: ${e(oth)}</p>`); }
  const bps=get('bpSys'), bpd=get('bpDia'), hr=get('hr');
  if(bps||bpd||hr) lines.push(`<p>V/S: BP ${e(bps||'-')}/${e(bpd||'-')} mmHg; HR ${e(hr||'-')}/min${rr?`; RR ${e(rr)}/min`:''}</p>`);

  // Sort meds for print (no headers, just logical order)
  const sortedMeds = sortMedsByPriority(meds);
  const medsHtml = sortedMeds.map(m=>`<li>${e(medLine(m))}</li>`).join('');
  const tddLine = tddSummaryText();

  // Single-column layout
  // Build caregiver secondary list (if any beyond primary)
  const others = (Array.isArray(caregivers)? caregivers.slice(1): []).filter(c=> (c.name||'').trim());
  const othersStr = others.map(c=>`${e(c.name)} (${e(c.relation||'-')}, โทร: ${e(formatPhone(c.tel||''))})`).join('; ');

  return `
    <div class="print-header">
      <img src="logo.png" class="logo" alt="logo" />
      <div class="heading"><h2>ใบส่งตัวผู้ป่วย Palliative Care</h2></div>
    </div>
    <div class="pdf-meta">
      <div class="kv">
        <div class="k">หน่วยงานต้นทาง</div><div class="v">${e(get('fromFacility'))}</div>
        <div class="k">ปลายทาง</div><div class="v"><ul class="ul-compact">${toList.join('')}</ul></div>
        <div class="k">วันที่ส่งต่อ</div><div class="v">${e(formatThaiDate(get('refDate')))}</div>
      </div>
    </div>
    <div class="pdf-section">
      <h3>ข้อมูลผู้ป่วย</h3>
      <div class="kv">
        <div class="k">ชื่อ-สกุล</div><div class="v">${e(get('pName'))}</div>
        <div class="k">อายุ</div><div class="v">${e(get('pAge'))} ปี</div>
        <div class="k">HN</div><div class="v">${e(get('pHN'))}</div>
        <div class="k">เลขบัตร</div><div class="v">${e(formatThaiCID(get('pCID')))}</div>
        <div class="k">ที่อยู่</div><div class="v">${e(get('pAddress'))}</div>
        <div class="k">ผู้ดูแลหลัก</div><div class="v">${e(get('careName'))} (ความสัมพันธ์: ${e(get('careRelation'))}, โทร: ${e(formatPhone(get('careTel')))})</div>
        ${ othersStr ? `<div class="k">ผู้ดูแลรอง</div><div class="v">${othersStr}</div>` : '' }
      </div>
    </div>
    <div class="pdf-section">
      <h3>วัตถุประสงค์ & ACP</h3>
      <p>วัตถุประสงค์: ${e(get('purposeList'))}</p>
      <p>ACP: ${e(get('acpList'))}</p>
    </div>
    <div class="pdf-section">
      <h3>จิตสังคม–จิตวิญญาณ</h3>
      <p>ผู้รับทราบ: ${e(get('informedBy'))} | การอยู่อาศัย: ${e(get('living'))}</p>
      <p>ความต้องการ/ห่วงกังวล: ${e(get('concerns'))}</p>
      ${ get('perceptionPatient') ? `<p>Perception (ผู้ป่วย): ${e(get('perceptionPatient'))}</p>` : '' }
      ${ get('perceptionFamily') ? `<p>Perception (ญาติ): ${e(get('perceptionFamily'))}</p>` : '' }
      ${ get('conspiracy') ? `<p>Conspiracy of silence: ${e(get('conspiracy'))}</p>` : '' }
    </div>
    <div class="pdf-section">
      <h3>ข้อมูลทางการแพทย์</h3>
      ${lines.join('')}
    </div>
    <div class="pdf-section">
      <h3>แผนยา</h3>
      <ul>${medsHtml}</ul>
      ${ tddLine ? `<p class="muted">${e(tddLine)}</p>`: '' }
    </div>
    <div class="pdf-section">
      <h3>ติดตาม</h3>
      <p>${e(formatThaiDate(get('fuDate')))} — ${e(get('fuSite'))} (โทร ${e(formatPhone(get('fuTel')))})</p>
    </div>
    <div class="pdf-footer sign"><p class="label">ผู้บันทึก:</p><span class="line"></span><p class="label">วันที่:</p><span class="line"></span></div>
  `;
}

function renderPrintDoc(){
  const el=document.getElementById('printDoc'); if(!el) return;
  syncCarePrimaryToState();

  // Preserve page estimate div
  const pageEstDiv = el.querySelector('#pageEstimate');

  el.innerHTML = buildPrintHTML();

  // Re-insert page estimate at the top
  if(pageEstDiv){
    const firstChild = el.firstChild;
    if(firstChild){
      el.insertBefore(pageEstDiv, firstChild);
    } else {
      el.appendChild(pageEstDiv);
    }
  }

  // footer content
  const pf = document.querySelector('#printFooter .printed');
  if(pf) pf.textContent = 'Printed on ' + new Date().toLocaleString('th-TH', { dateStyle:'medium', timeStyle:'short' });

  // Calculate and update page estimate (debounced)
  debouncedUpdatePageEstimate();
}

// Debounced version of updatePageEstimate for better performance
const debouncedUpdatePageEstimate = debounce(updatePageEstimate, 200);

function updatePageEstimate(){
  const el = document.getElementById('printDoc');
  const estDiv = document.getElementById('pageEstimate');
  if(!el || !estDiv) return;

  // Remove existing page break line
  const existingLine = el.querySelector('.page-break-line');
  if(existingLine) existingLine.remove();

  // Wait for render to complete
  setTimeout(()=>{
    const contentHeight = el.scrollHeight; // px
    const mmPerInch = 25.4;
    const pxPerInch = 96; // CSS px
    const pxPerMM = pxPerInch / mmPerInch;
    const contentHeightMM = contentHeight / pxPerMM;

    // Get dimensions from CSS variables
    const rootStyles = getComputedStyle(document.documentElement);
    const pageHeightMM = parseFloat(rootStyles.getPropertyValue('--page-h')) || 297;
    const padTopMM = parseFloat(rootStyles.getPropertyValue('--pdf-pad-top')) || 6;
    const padBottomMM = parseFloat(rootStyles.getPropertyValue('--pdf-pad-bottom')) || 10;

    // Calculate printable area (A4 297mm - top 6mm - bottom 10mm = 281mm content area)
    // But @page margins are 15mm top + 12mm bottom = 27mm, leaving ~270mm
    const printableHeightPerPage = pageHeightMM - 15 - 12; // Use @page margins
    const estimatedPages = Math.ceil(contentHeightMM / printableHeightPerPage);

    let className = 'ok';
    let message = `📄 ประมาณการ: ${estimatedPages} หน้า`;

    if(estimatedPages === 1){
      className = 'ok';
      message = `✓ พอดี 1 หน้า (${contentHeightMM.toFixed(0)}mm / ${printableHeightPerPage}mm)`;
    } else if(estimatedPages === 2){
      className = 'warn';
      const overflow = contentHeightMM - printableHeightPerPage;
      message = `⚠️ เกิน 2 หน้า — หน้า 2 มี ${overflow.toFixed(0)}mm (เหลือพื้นที่ ${(printableHeightPerPage - overflow).toFixed(0)}mm)`;
    } else {
      className = 'danger';
      message = `⚠️ ประมาณ ${estimatedPages} หน้า (${contentHeightMM.toFixed(0)}mm) — ควรลดเนื้อหา`;
    }

    estDiv.textContent = message;
    estDiv.className = `page-estimate ${className}`;

    // Draw page break line if more than 1 page
    if(estimatedPages > 1){
      const pageBreakLine = document.createElement('div');
      pageBreakLine.className = 'page-break-line';

      // Position at 270mm from top (accounting for padding)
      const pageBreakPx = printableHeightPerPage * pxPerMM;
      const padTop = parseFloat(getComputedStyle(el).paddingTop) || 0;
      pageBreakLine.style.top = `${pageBreakPx + padTop}px`;

      el.appendChild(pageBreakLine);
    }
  }, 100);
}

// ---------- Multidrug (IV/CSCI) UI ----------
function fillFormularyIvSc(){
  const dl=$("#formularyIvSc"); if(!dl) return;
  dl.innerHTML="";
  const ivsc = FORMULARY.filter(f=>/IV|SC/i.test(f.route||""));
  ivsc.forEach(d=>{ const o=document.createElement("option"); o.value=d.name; dl.appendChild(o); });
}
function inferUnitForMix(name){
  const f=FORMULARY.find(x=>x.name.toLowerCase()===String(name||"").toLowerCase());
  // default to mg for injections if unknown
  return f? f.unit : 'mg';
}
function renderMixRows(){
  const host=$("#mixRows"); if(!host) return;
  host.innerHTML='';
  mixRows.forEach((row,idx)=>{
    const wrap=document.createElement('div');
    wrap.className='row';
    wrap.innerHTML = `
      <input class="grow" placeholder="ชื่อยา (IV/SC เท่านั้น)" list="formularyIvSc" data-i="${idx}" data-k="name" value="${escapeHTML(row.name||'')}" />
      <input type="number" min="0" step="0.5" placeholder="ขนาด${row.unit?` (${escapeHTML(row.unit)})`:''}" class="dose-input" data-i="${idx}" data-k="dose" value="${row.dose??''}" />
      <span class="muted" id="mixUnit-${idx}">${escapeHTML(row.unit||'')}</span>
      ${idx>0?`<button class="small danger" data-remove="${idx}">ลบ</button>`:''}
    `;
    host.appendChild(wrap);
  });
  // Add-row button (show only when first row has name)
  const canAdd = (mixRows[0]?.name||'').trim().length>0;
  const addBar=document.createElement('div');
  addBar.className='row';
  addBar.innerHTML = `<button id="mixAddRow" class="small" ${canAdd?'':'disabled'}>+ เพิ่มยา</button>`;
  host.appendChild(addBar);

  // Wire events
  host.querySelectorAll('input[data-i]').forEach(inp=>{
    inp.addEventListener('input', (e)=>{
      const i=+e.target.getAttribute('data-i');
      const k=e.target.getAttribute('data-k');
      if(k==='name'){
        mixRows[i].name=e.target.value;
        mixRows[i].unit=inferUnitForMix(e.target.value);
        const u=$(`#mixUnit-${i}`); if(u) u.textContent=mixRows[i].unit||'';
        const doseEl=host.querySelector(`input[data-i="${i}"][data-k="dose"]`);
        if(doseEl){ doseEl.placeholder = `ขนาด${mixRows[i].unit?` (${mixRows[i].unit})`:''}`; }
      }else if(k==='dose'){
        mixRows[i].dose = e.target.value? Number(e.target.value): '';
      }
      const addBtnEl = $("#mixAddRow"); if(addBtnEl) addBtnEl.disabled = !((mixRows[0]?.name||'').trim().length>0);
    });
    inp.addEventListener('keydown', (e)=>{
      const i=+e.target.getAttribute('data-i');
      const k=e.target.getAttribute('data-k');
      if(e.key==='Enter'){
        e.preventDefault();
        if(k==='name'){
          const next=host.querySelector(`input[data-i="${i}"][data-k="dose"]`);
          next?.focus();
        }else if(k==='dose'){
          if(((mixRows[0]?.name||'').trim().length>0)){
            mixRows.push({name:'', dose:'', unit:''});
            renderMixRows();
            const newIndex=mixRows.length-1;
            const nameEl=document.querySelector(`input[data-i="${newIndex}"][data-k="name"]`);
            nameEl?.focus();
          }
        }
      }
    });
  });
  host.querySelectorAll('button[data-remove]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const i=+e.target.getAttribute('data-remove');
      mixRows.splice(i,1);
      renderMixRows();
    });
  });
  const addBtn=$("#mixAddRow");
  addBtn?.addEventListener('click', ()=>{
    const dynCanAdd = ((mixRows[0]?.name||'').trim().length>0);
    if(!dynCanAdd) return;
    mixRows.push({name:'', dose:'', unit:''});
    renderMixRows();
  });
}
function refreshMixDevices(){
  const route=$("#mixRoute")?.value||'CSCI';
  const devSel=$("#mixDevice"); if(!devSel) return;
  const keep=devSel.value;
  devSel.innerHTML='';
  if(route==='IV'){
    devSel.innerHTML = `<option value="pump">Infusion pump</option>`;
  }else{
    devSel.innerHTML = `<option value="syringe">Thalapump-20 (syringe driver)</option><option value="elastomeric">Surefuser CBI-M100 (elastomeric)</option>`;
  }
  if(keep && Array.from(devSel.options).some(o=>o.value===keep)) devSel.value=keep;
  toggleMixSyringeFields();
  // Practical defaults for volume by route if empty
  const volEl=$("#mixFinalVol");
  const volVal = +(volEl?.value||0);
  if(volEl && (!volVal || volVal<=0)){
    volEl.value = (route==='IV'? 100 : 20);
  }
}
function toggleMixSyringeFields(fromDeviceChange=false){
  const curDev=$("#mixDevice")?.value;
  const route=$("#mixRoute")?.value;
  const mmW=$("#mixMmWrap"), diaW=$("#mixDiaWrap");
  const rateW=$("#mixRateWrap");
  const showSyr = (curDev==='syringe');
  mmW?.classList.toggle('hidden', !showSyr);
  diaW?.classList.toggle('hidden', !showSyr);
  rateW?.classList.toggle('hidden', !(curDev==='pump' && route==='IV'));
  // Provide practical defaults when switching to syringe
  if(showSyr){
    const mmEl=$("#mixMmPerHr"); if(mmEl && !mmEl.value) mmEl.value = 3;
    const volEl=$("#mixFinalVol"); if(volEl && !volEl.value) volEl.value = 22;
    const durEl=$("#mixDuration"); if(durEl && !durEl.value) durEl.value = 24;
  }
  if(curDev==='elastomeric'){
    const durEl=$("#mixDuration"); if(durEl && !durEl.value) durEl.value = 50;
    const volEl=$("#mixFinalVol");
    if(volEl){ if(fromDeviceChange) volEl.value = 100; else if(!volEl.value) volEl.value = 100; }
  }
  if(curDev==='syringe' && route==='CSCI'){
    const volEl=$("#mixFinalVol"); if(volEl){ if(fromDeviceChange) volEl.value = 22; else if(!volEl.value) volEl.value = 22; }
  }
  if(curDev==='pump' && route==='IV'){
    const volEl=$("#mixFinalVol");
    if(volEl){
      // Force to 100 mL on selecting pump; user may edit afterward
      if(fromDeviceChange) volEl.value = 100;
      // If not from device change, keep user's value; route-level defaults handled elsewhere
    }
  }
}
function calcMixRate(){
  const vol = +($("#mixFinalVol")?.value||0);
  const dur = +($("#mixDuration")?.value||0);
  if(vol>0 && dur>0) return vol/dur;
  return 0;
}
function buildMixMed(){
  const route=$("#mixRoute")?.value||'CSCI';
  const device=$("#mixDevice")?.value|| (route==='IV'?'pump':'syringe');
  const diluent=$("#mixDiluent")?.value||'NSS';
  const finalVol=+($("#mixFinalVol")?.value||0);
  const duration=+($("#mixDuration")?.value||0);
  const site=$("#mixSite")?.value||'';
  const qty = +($("#mixQty")?.value||'');
  const mm = +($("#mixMmPerHr")?.value||'');
  const dia = +($("#mixDia")?.value||'');
  const rateIn = +($("#mixRate")?.value||'');
  const comps = mixRows
    .filter(r=> (r.name||'').trim() && Number(r.dose)>0)
    .map(r=>({name:r.name.trim(), dose:+r.dose, unit:r.unit||inferUnitForMix(r.name)}));
  if(!comps.length) return {err:'ใส่ชื่อยาและขนาดอย่างน้อย 1 รายการ'};
  if(!(finalVol>0)) return {err:'กรอก Final volume (mL)'};
  if(!(duration>0)) return {err:'กรอก Duration (h)'};
  let rate = (finalVol>0 && duration>0)? +(finalVol/duration).toFixed(2) : 0;
  if(device==='pump' && route==='IV' && rateIn>0){ rate = +rateIn.toFixed(2); }
  if(device==='elastomeric') rate = 2.00; // fixed display rate per device spec
  const obj={orderType:'infusion', route, device, diluent, finalVol, duration, rate, site, components:comps, qty: (qty||undefined)};
  if(device==='syringe'){
    if(mm) obj.mmPerHr = mm;
    if(dia) obj.syringeDia = dia;
  }
  return obj;
}
function initMixUI(){
  if(!$("#mixRows")) return;
  fillFormularyIvSc();
  // defaults
  $("#mixRoute").value='CSCI';
  refreshMixDevices();
  $("#mixDiluent").value='NSS';
  $("#mixDuration").value=24;
  // start 1 row
  mixRows=[{name:'', dose:'', unit:''}];
  renderMixRows();

  $("#mixRoute")?.addEventListener('change', ()=>{
    refreshMixDevices();
    toggleMixSyringeFields(true); // force device-specific defaults on route-triggered device selection
    renderMixRows();
  });
  $("#mixDevice")?.addEventListener('change', ()=>toggleMixSyringeFields(true));
  $("#mixAdd")?.addEventListener('click', ()=>{
    const m = buildMixMed();
    if(m.err){ snack(m.err,'warn'); return; }
    if(mixEditIndex!=null){
      meds[mixEditIndex]=m; mixEditIndex=null; $("#mixAdd").textContent='Add to Med List';
      renderMeds(); saveAll(); snack('แก้ไขยาผสมแล้ว','ok');
    }else{
      addMed(m);
    }
    // reset rows
    mixRows=[{name:'', dose:'', unit:''}]; renderMixRows();
  });
  // Presets
  const applyPreset = (names=[])=>{
    const infRadio = document.querySelector('input[name="orderType"][value="inf"]');
    if(infRadio){ infRadio.checked = true; infRadio.dispatchEvent(new Event('change')); }
    $("#mixRoute").value='CSCI';
    refreshMixDevices();
    $("#mixDevice").value='syringe';
    toggleMixSyringeFields();
    $("#mixDiluent").value = 'NSS';
    // Build rows with empty dose for quick entry
    mixRows = names.map(n=>({ name:n, dose:'', unit: inferUnitForMix(n) }));
    if(mixRows.length===0){ mixRows=[{name:'', dose:'', unit:''}]; }
    renderMixRows();
    $("#infusionOrder")?.scrollIntoView({behavior:'smooth', block:'center'});
  };
  $("#presetCSCI1")?.addEventListener('click', ()=>{
    applyPreset(["Morphine injection 10 mg/mL (1 amp)"]);
    toggleMixSyringeFields(true);
  });
  $("#presetCSCI2")?.addEventListener('click', ()=>{
    applyPreset(["Morphine injection 10 mg/mL (1 amp)", "Midazolam"]);
    toggleMixSyringeFields(true);
  });
  $("#presetCSCI3")?.addEventListener('click', ()=>{
    applyPreset(["Morphine injection 10 mg/mL (1 amp)", "Midazolam", "Hyoscine butylbromide (Buscopan) injection 20 mg/mL (1 amp)"]);
    toggleMixSyringeFields(true);
  });
}
function initOrderTypeSwitcher(){
  const radios = $$('input[name="orderType"]'); if(!radios.length) return;
  const single = $("#singleOrder"), inf = $("#infusionOrder");
  const apply = ()=>{
    const checked = document.querySelector('input[name="orderType"]:checked');
    const v = checked ? checked.value : 'po';
    const isInf = (v === 'inf');
    single?.classList.toggle('hidden', isInf);
    inf?.classList.toggle('hidden', !isInf);
  };
  radios.forEach(r => r.addEventListener('change', apply));
  apply();
}

// Smart drug sorting for clinical workflow (no visual grouping, just logical order)
function sortMedsByPriority(medsList){
  return [...medsList].sort((a, b) => {
    // Priority 1: Infusion always first
    const aInf = a.orderType === 'infusion';
    const bInf = b.orderType === 'infusion';
    if(aInf !== bInf) return aInf ? -1 : 1;

    // Priority 2: Scheduled before PRN
    const aPrn = /prn/i.test(a.use || '');
    const bPrn = /prn/i.test(b.use || '');
    if(aPrn !== bPrn) return aPrn ? 1 : -1;

    // Priority 3: Opioids first (within same group)
    const aOpioid = /morphine|fentanyl|methadone|kapanol|mst/i.test(a.name || '');
    const bOpioid = /morphine|fentanyl|methadone|kapanol|mst/i.test(b.name || '');
    if(aOpioid !== bOpioid) return aOpioid ? -1 : 1;

    // Priority 4: Laxatives after opioids
    const aLax = /senna|lactulose/i.test(a.name || '');
    const bLax = /senna|lactulose/i.test(b.name || '');
    if(aLax !== bLax) return aLax ? 1 : -1;

    // Priority 5: Alphabetical (fallback)
    return (a.name || '').localeCompare(b.name || '', 'th');
  });
}

// Group meds for Input UI display (with headers)
function groupMedsForUI(medsList){
  const sorted = sortMedsByPriority(medsList);
  return {
    infusion: sorted.filter(m => m.orderType === 'infusion'),
    scheduled: sorted.filter(m => m.orderType !== 'infusion' && !/prn/i.test(m.use || '')),
    prn: sorted.filter(m => m.orderType !== 'infusion' && /prn/i.test(m.use || ''))
  };
}

function renderMeds(){
  const host=$("#medList"); if(!host) return;
  host.innerHTML="";

  // Group by route for better UX in input UI
  const groups = groupMedsForUI(meds);

  // Helper to render group
  const renderGroup = (title, items, startIdx) => {
    if(items.length === 0) return startIdx;

    const header = document.createElement("h4");
    header.style.cssText = "margin:16px 0 8px 0; font-size:16px; color:#0c4a6e; font-weight:600;";
    header.textContent = title;
    host.appendChild(header);

    items.forEach((m) => {
      const actualIndex = meds.indexOf(m);
      const row=document.createElement("div");
      row.className="med-row";
      row.innerHTML=`
        <div class="use">${escapeHTML(medLine(m))}</div>
        <div class="act">
          <button type="button" class="small" data-edit="${actualIndex}">แก้ไข</button>
          <button type="button" class="small danger" data-i="${actualIndex}">ลบ</button>
        </div>`;
      host.appendChild(row);
    });

    return startIdx + items.length;
  };

  // Render groups with headers (Input UI only)
  let idx = 0;
  idx = renderGroup("💉 Continuous Infusion", groups.infusion, idx);
  idx = renderGroup("📅 Scheduled", groups.scheduled, idx);
  idx = renderGroup("🆘 PRN (As Needed)", groups.prn, idx);

  // If no meds, show empty state
  if(meds.length === 0){
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.style.padding = "20px";
    empty.textContent = "ยังไม่มีรายการยา";
    host.appendChild(empty);
  }

  updateTDDViews();
  renderPrintDoc();
}
function addMed(m){ meds.push(m); renderMeds(); safetyChecks(); saveAll(); snack("เพิ่มรายการแล้ว","ok"); }

// ---------- Presets ----------
function applyPreset1(){
  $$("#acpChips input").forEach(ch=>{ if(ch.value==="No CPR") ch.checked=true; });
  state.acpList=$$("#acpChips input:checked").map(x=>x.value).join(" • ");
  addMed({name:"MST 30 mg/tab",route:"oral",orderType:"standing",form:"tab",strength:"30 mg",doseText:"1 tab q12h"});
  addMed({name:"Morphine IR 10 mg/tab",route:"oral",orderType:"prn",form:"tab",strength:"10 mg",doseText:"1 tab PRN q2–4h pain/dyspnea"});
  addMed({name:"Senna",route:"oral",orderType:"standing",form:"tab",doseText:"2 tab qHS"});
}
function applyPreset2(){
  addMed({name:"Morphine injection 10 mg/mL (1 amp)",route:"SC",orderType:"prn",form:"inj",strength:"10 mg/mL",doseText:"3 mg q4h PRN pain/dyspnea"});
  addMed({name:"Haloperidol",route:"SC",orderType:"prn",form:"inj",strength:"5 mg/mL",doseText:"0.5–1 mg q4–6h PRN"});
  addMed({name:"Midazolam",route:"SC",orderType:"prn",form:"inj",strength:"5 mg/mL",doseText:"1–2 mg q1h PRN"});
  addMed({name:"Senna",route:"oral",orderType:"standing",form:"tab",doseText:"2 tab qHS"});
}

// ---------- HIS Note ----------
function buildHisNote(){
  readInputsToState();
  const L=[];
  L.push(`Referral (Palliative) — ${state.refDate||todayISO()}`);
  L.push(`From: ${state.fromFacility||"คลินิกเบาใจ รพ.กาฬสินธุ์"} → To: ${state.toFacilities||"-"}`);
  L.push(`Patient: ${state.pName||"-"} (${state.pAge||"-"} yr) HN: ${state.pHN||"-"} CID: ${formatThaiCID(state.pCID||"-")}`);
  L.push(`Caregiver: ${state.careName||"-"} (${state.careRelation||"-"}) Tel: ${formatPhone(state.careTel||"-")}`);
  const rrVal = state.vsRR ?? state.rr ?? "-";
  const dx=(state.dx||'').trim();
  const pps=(state.pps||'').trim();
  const gfr=(state.gfr||'').trim();
  const hct=(state.hct||'').trim();
  const alb=(state.alb||'').trim();
  const mets=(state.metastasisList||'').trim();
  const tx=(state.treatmentList||'').trim();
  const showDx = !!(dx || gfr || hct || alb || (pps && pps!=="40") || mets || tx);
  if(showDx){
    L.push(`Dx: ${dx||"-"}  PPS: ${pps||"-"}%  GFR: ${gfr||"-"}  Hct: ${hct||"-"}%  Alb: ${alb||"-"} g/dL`);
    if(mets) L.push(`Metastasis: ${mets}`);
    if(tx) L.push(`การรักษาที่ผ่านมา: ${tx}`);
  }
  const painSite=(state.painSite||'').trim();
  const painScore=(state.painScore||'').trim();
  const dysp=(state.dyspneaScore||'').trim();
  const spo2=(state.spo2||'').trim();
  const rr=(state.vsRR||state.rr||'').trim();
  const nausea=(state.nausea||'').trim();
  const gcs=(state.gcs||'').trim();
  const others=(state.others||'').trim();
  if( painSite||painScore||dysp||spo2||rr||nausea||gcs||others ){
    L.push(`Symptoms: pain ${painSite||"-"} (PS ${painScore||"-"}/10); Dyspnea ${dysp||"-"}/10${spo2?` (SpO2 ${spo2}%)`:''}`);
    if(rr) L.push(`RR ${rr}/min`);
    if(gcs) L.push(`GCS ${gcs}`);
  }
  const bps=(state.bpSys||'').trim();
  const bpd=(state.bpDia||'').trim();
  const hr=(state.hr||'').trim();
  if(bps||bpd||hr||rr) L.push(`V/S: BP ${bps||"-"}/${bpd||"-"} mmHg; HR ${hr||"-"}/min${rr?`; RR ${rr}/min`:''}`);
  L.push(`Purpose: ${state.purposeList||"-"}`);
  L.push(`ACP: ${state.acpList||"-"}`);
  L.push(`Perception (Pt): ${state.perceptionPatient||"-"}; Perception (Family): ${state.perceptionFamily||"-"}`);
  L.push(`Conspiracy of silence: ${state.conspiracy||"-"}`);
  L.push(`Plan meds/Devices:`); meds.forEach(m=>L.push(`  - ${medLine(m)}`));
  const fuDate = (state.fuDate||'').trim();
  const fuSite = (state.fuSite||'').trim();
  const fuTel  = (state.fuTel||'').trim();
  if(fuDate || fuSite || fuTel){
    L.push(`Follow-up: ${fuDate||"-"} — ${fuSite||"-"} (Tel ${formatPhone(fuTel||"-")})`);
  }
  return L.join("\n");
}

// ---------- Dropdown & Inputs ----------
// ---------- Order UI (single-line + prediction + edit) ----------
function fillFormulary(){
  const dl=$("#formulary"); if(!dl) return;
  dl.innerHTML="";
  FORMULARY.forEach(d=>{ const o=document.createElement("option"); o.value=d.name; dl.appendChild(o); });
}
function inferUnitFromName(name){
  const f=FORMULARY.find(x=>x.name.toLowerCase()===String(name||"").toLowerCase());
  return f? f.unit: "";
}
function inferRouteFromName(name){
  const f=FORMULARY.find(x=>x.name.toLowerCase()===String(name||"").toLowerCase());
  return f? f.route: "";
}
function predictFromUnitCount(drugName, count){
  const dn=(drugName||"").toLowerCase();
  const c=Number(count||0);
  if(/mst/.test(dn) || /kapanol/.test(dn)){
    if(c<=1) return ["1 tab PO q12h"]; return ["1–2 tab PO q12h"];
  }
  if(/senna/.test(dn)){
    if(c<=1) return ["1 tab PO qHS"]; return ["2 tab PO qHS"];
  }
  if(/fentanyl.*patch/.test(dn)){
    const n=c>0? c:1; return [`Apply ${n} patch to chest/upper arm, change q72h`];
  }
  return null;
}
function predictFreq(drugName, doseNum){
  const dn=(drugName||"").toLowerCase();
  const d=Number(doseNum||0);
  if(/morphine ir|morphine\s+ir/.test(dn)){
    if(d<=5) return ["1/2–1 tab SL PRN q2–4h for breakthrough pain"]; return ["1 tab SL PRN q2–4h for breakthrough pain"]; }
  if(/mst/.test(dn)){ if(d<30) return ["1 tab PO q12h"]; return ["1 tab PO q12h","1 tab PO q8–12h"]; }
  if(/kapanol/.test(dn)) return ["1 cap PO q12h"];
  if(/methadone/.test(dn)){
    if(d<=2.5) return ["2.5 mg PO q8–12h"]; if(d<=5) return ["5 mg PO q8–12h"]; return ["2.5–5 mg PO q8–12h"]; }
  if(/morphine.*(inj|injection)/.test(dn)){
    if(d<=2) return ["2 mg IV/SC PRN q4h for dyspnea"]; if(d<=3) return ["3 mg IV/SC PRN q4h for pain/dyspnea"]; return [`${d} mg IV/SC PRN q4h for pain/dyspnea`]; }
  if(/fentanyl.*patch/.test(dn)){ const n=d && d!==25 ? Math.round(d/25):1; return [`Apply ${n} patch to chest/upper arm, change q72h`]; }
  if(/fentanyl.*(inj|injection)/.test(dn)){ if(d<=25) return ["25 mcg IV PRN"]; if(d<=50) return ["25–50 mcg IV PRN"]; return [`${d} mcg IV PRN`]; }
  if(/midazolam/.test(dn)){ if(d<=1) return ["1 mg SC q1h PRN for agitation"]; if(d<=2) return ["1–2 mg SC q1h PRN for agitation/dyspnea"]; return [`${d} mg SC q1h PRN for agitation`]; }
  if(/haloperidol/.test(dn)){ if(d<=0.5) return ["0.5 mg SC q4–6h PRN for nausea"]; return ["0.5–1 mg SC q4–6h PRN for nausea/agitation"]; }
  if(/senna/.test(dn)){ if(d<=1) return ["1 tab PO qHS"]; return ["2 tab PO qHS"]; }
  if(/lactulose/.test(dn)){ if(d<=15) return ["15 mL PO q12h PRN"]; return ["15–30 mL PO q12h PRN"]; }
  if(/atropine.*1%/.test(dn)){ return ["1–2 หยด SL q4–6h PRN for death rattle"]; }
  if(/lorazepam/.test(dn)){ if(d<1) return ["0.5–1 mg SL q2h PRN for agitation"]; return ["1 mg SL q2h PRN for agitation"]; }
  return ["1 tab PO q12h"]; // default
}
function updateFrequencyPlaceholder(){
  const name=$("#drugName")?.value?.trim()||"";
  const dose=$("#dose")?.value?.trim()||"";
  const list=$("#freqList"); if(!list) return;
  let preds=predictFromUnitCount(name, dose);
  if(!preds) preds=predictFreq(name, dose);
  const freq=$("#freq"); if(freq){ freq.placeholder=preds[0]||""; }
  list.innerHTML="";
  preds.forEach(p=>{ const o=document.createElement("option"); o.value=p; list.appendChild(o); });
  if(freq) freq.setAttribute("list","freqList");
}
function parseDoseFromUse(useText){
  const t=(useText||"").toLowerCase();
  const m=t.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|ml|mL|tab|cap|หยด)/i);
  return m? m[1]: "";
}
function initOrderUI(){
  if(!$("#drugName")) return; // skip if section not present
  fillFormulary();
  let editIndex=null;

  const onAddOrEdit=()=>{
    const name=($("#drugName").value||"").trim(); if(!name){ snack("พิมพ์ชื่อยา","warn"); return; }
    const qtyStr=($("#qty").value||"").trim();

    // Validate quantity for medications (not infusions)
    if(!qtyStr || qtyStr==="0"){
      snack("กรุณาระบุจำนวนยา","warn");
      $("#qty").focus();
      return;
    }

    let freq=($("#freq").value||"").trim();
    if(!freq) freq=$("#freq").placeholder||"";
    const unit=inferUnitFromName(name);
    const route=inferRouteFromName(name);
    const modeEl = document.querySelector('input[name="orderType"]:checked');
    const mode = modeEl ? modeEl.value : 'po';
    const forcedPrn = (mode==='po_prn' || mode==='inj_prn');
    const orderType = (forcedPrn || /\bPRN\b/i.test(freq))?"prn":"standing";
    const qty = qtyStr? Number(qtyStr): undefined;
    if(editIndex!=null){
      const m=meds[editIndex]; if(!m) return;
      m.name=name; m.route=route; m.unit=unit; m.qty=qty; m.use=freq; m.orderType=orderType;
      renderMeds(); safetyChecks(); saveAll(); snack("แก้ไขแล้ว","ok");
      editIndex=null; $("#addOne").textContent="+ เพิ่ม";
    }else{
      addMed({name,route,unit,qty,use:freq,orderType});
    }
    $("#freq").value=""; $("#dose").value=""; $("#qty").value=""; $("#drugName").value=""; $("#drugName").focus();
  };

  $("#dose")?.addEventListener("input", updateFrequencyPlaceholder);
  $("#drugName")?.addEventListener("change", updateFrequencyPlaceholder);
  $("#drugName")?.addEventListener("input", ()=>{ if(!$("#dose").value) updateFrequencyPlaceholder(); });
  $("#addOne")?.addEventListener("click", onAddOrEdit);
  $("#clearOne")?.addEventListener("click", ()=>{
    editIndex=null; $("#addOne").textContent="+ เพิ่ม";
    $("#drugName").value=""; $("#dose").value=""; $("#freq").value=""; $("#freq").placeholder=""; $("#freqList").innerHTML=""; $("#qty").value=""; $("#drugName").focus();
  });
  $("#freq")?.addEventListener("keydown", (e)=>{ if(e.key==="Enter"){ e.preventDefault(); onAddOrEdit(); } });

  // Keyboard shortcuts for medication form
  const medInputs = ["#drugName", "#dose", "#freq", "#qty"];
  medInputs.forEach(sel => {
    $(sel)?.addEventListener("keydown", (e)=>{
      // Ctrl+Enter or Cmd+Enter to add medication
      if((e.ctrlKey || e.metaKey) && e.key==="Enter"){
        e.preventDefault();
        onAddOrEdit();
      }
    });
  });

  $("#medList")?.addEventListener("click", (e)=>{
    const del=e.target.closest("button[data-i]");
    if(del){
      const i=+del.getAttribute("data-i");
      const medToDelete = meds[i];

      // Confirmation before delete
      const medName = medToDelete.name || 'ยานี้';
      if(confirm(`ต้องการลบ "${medName}" หรือไม่?\n\n(กด Ctrl+Z เพื่อ undo ได้ภายหลัง)`)){
        // Push to undo stack before deleting
        pushUndo('deleteMed', {med: {...medToDelete}, index: i});

        meds.splice(i,1);
        renderMeds();
        saveAll();
        snack('ลบยาแล้ว (กด Ctrl+Z เพื่อ undo)', 'ok');
      }
      return;
    }
    const ed=e.target.closest("button[data-edit]");
    if(ed){ const i=+ed.getAttribute("data-edit"); const m=meds[i]; if(!m) return;
      if(m.orderType==="infusion"){ // populate mix UI
        mixEditIndex=i;
        $("#mixRoute").value = /IV/i.test(m.route||'')? 'IV':'CSCI';
        refreshMixDevices();
        $("#mixDevice").value = m.device||($("#mixRoute").value==='IV'?'pump':'syringe');
        toggleMixSyringeFields();
        $("#mixDiluent").value = m.diluent||'NSS';
        $("#mixFinalVol").value = m.finalVol||'';
        $("#mixDuration").value = m.duration||24;
        $("#mixSite").value = m.site||'';
        $("#mixQty").value = m.qty!=null? m.qty:'';
        $("#mixMmPerHr").value = m.mmPerHr!=null? m.mmPerHr:'';
        $("#mixDia").value = m.syringeDia!=null? m.syringeDia:'';
        // components
        if(Array.isArray(m.components)&&m.components.length){
          mixRows = m.components.map(c=>({name:c.name, dose:c.dose, unit:c.unit||inferUnitForMix(c.name)}));
        }else{
          // fallback single-drug infusion to one row
          const total = m.total || 0; const nm = m.name||'';
          mixRows=[{name:nm, dose: total, unit: inferUnitForMix(nm)}];
        }
        renderMixRows();
        $("#mixAdd").textContent='บันทึกการแก้ไข (ยาผสม)';
        $("#infusionOrder")?.scrollIntoView({behavior:'smooth', block:'center'});
      }else{
        // populate single-line order UI
        $("#drugName").value=m.name||""; $("#freq").value=m.use||""; $("#qty").value=(m.qty!=null? m.qty:"");
        const dose=parseDoseFromUse(m.use||""); $("#dose").value=dose; updateFrequencyPlaceholder();
        editIndex=i; $("#addOne").textContent="บันทึกการแก้ไข"; $("#drugName").focus();
      }
    }
  });
}
function initInputs(){
  if($("#fromFacility") && !$("#fromFacility").value) $("#fromFacility").value="คลินิกเบาใจ รพ.กาฬสินธุ์ โทร. 043-811020 ต่อ 1352";
  if($("#refDate") && !$("#refDate").value) $("#refDate").value=todayISO();

  FIELD_IDS.forEach(id=>{ const el=$("#"+id); if(!el) return;
    el.addEventListener("input",()=>{
      state[id]=el.value;
      if(id.startsWith('toFacility')){ readInputsToState(); }
      renderPrintDoc();
      saveAll();
    });
    // Add validation on blur for numeric medical fields
    if(VALIDATORS[id]){
      el.addEventListener("blur", ()=>{
        const error = validateInput(id, el.value);
        if(error){
          snack(error, 'warn');
          el.style.borderColor = '#f59e0b'; // Orange warning
          setTimeout(() => { el.style.borderColor = ''; }, 3000);
        }
      });
    }
  });
  // Listen to nausea radio buttons
  $$('input[name="nausea"]').forEach(radio=>radio.addEventListener("change",()=>{ readInputsToState(); renderPrintDoc(); saveAll(); }));
  $$("#purposeChips input, #acpChips input, #metastasisChips input, #treatmentChips input").forEach(ch=>ch.addEventListener("change",()=>{
    state.purposeList=$$("#purposeChips input:checked").map(x=>x.value).join(" • ");
    state.acpList=$$("#acpChips input:checked").map(x=>x.value).join(" • ");
    state.metastasisList=$$("#metastasisChips input:checked").map(x=>x.value).join(", ");
    state.treatmentList=$$("#treatmentChips input:checked").map(x=>x.value).join(", ");
    renderPrintDoc(); saveAll();
  }));
  initPrintPrefsUI();
}

// ---------- Print preferences ----------
function applyPrintPrefs(){
  const stacks={
    'TH SarabunPSK': "'TH SarabunPSK','TH Sarabun New','Sarabun','Noto Sans Thai',Tahoma,Arial,sans-serif",
    'TH Sarabun New': "'TH Sarabun New','TH SarabunPSK','Sarabun','Noto Sans Thai',Tahoma,Arial,sans-serif",
    'Sarabun': "'Sarabun','Noto Sans Thai',Tahoma,Arial,sans-serif",
    'Noto Sans Thai': "'Noto Sans Thai',Tahoma,Arial,sans-serif",
    'Tahoma': "Tahoma,Arial,Helvetica,sans-serif",
    'Arial': "Arial,Helvetica,sans-serif",
    'System': "system-ui,-apple-system,'Segoe UI',Roboto,Arial,'Noto Sans Thai','Sarabun','TH Sarabun New',sans-serif"
  };
  const fam = state.printFont || 'TH SarabunPSK';
  const size = state.printSize || 16;
  const lh = state.printLineHeight || 1.35;
  const width = state.printWidth || 190; // mm
  document.documentElement.style.setProperty('--pdf-font-family', stacks[fam]||stacks['TH SarabunPSK']);
  document.documentElement.style.setProperty('--pdf-font-size', size + 'pt');
  document.documentElement.style.setProperty('--pdf-line-height', lh);
  document.documentElement.style.setProperty('--pdf-width', width + 'mm');
  const doc = document.getElementById('printDoc');
  // ราชการ: ให้ Word-like เป็นค่าเริ่มต้น (เว้นแต่ผู้ใช้ปิดไว้)
  if(doc){ doc.classList.toggle('wordlike', state.printWordLike!==false); }
  // footer toggles
  const pf = document.querySelector('#printFooter .printed');
  const pgn = document.querySelector('#printFooter .pgn');
  if(pf) pf.style.display = state.printShowPrinted===false ? 'none' : '';
  if(pgn) pgn.style.display = state.printShowPgn ? '' : 'none';
}

function initPrintPrefsUI(){
  const fontSel=$("#printFont"), sizeInp=$("#printSize"), lhInp=$("#printLineHeight");
  const wordLike=$("#printWordLike"), wInp=$("#printWidth");
  const showPrinted=$("#printShowPrinted"), showPgn=$("#printShowPgn");
  if(fontSel){ fontSel.value = state.printFont || 'TH SarabunPSK'; fontSel.addEventListener('change',()=>{ state.printFont=fontSel.value; applyPrintPrefs(); saveAll(); }); }
  if(sizeInp){ sizeInp.value = state.printSize || 16; sizeInp.addEventListener('input',()=>{ const v=+sizeInp.value||16; state.printSize=v; applyPrintPrefs(); saveAll(); }); }
  if(lhInp){ lhInp.value = state.printLineHeight || 1.35; lhInp.addEventListener('input',()=>{ const v=+lhInp.value||1.35; state.printLineHeight=v; applyPrintPrefs(); saveAll(); }); }
  if(wordLike){ wordLike.checked = state.printWordLike!==false; wordLike.addEventListener('change',()=>{ state.printWordLike=wordLike.checked; applyPrintPrefs(); saveAll(); }); }
  if(wInp){ wInp.value = state.printWidth || 190; wInp.addEventListener('input',()=>{ const v=+wInp.value||190; state.printWidth=v; applyPrintPrefs(); saveAll(); }); }
  if(showPrinted){ showPrinted.checked = state.printShowPrinted!==false; showPrinted.addEventListener('change',()=>{ state.printShowPrinted=showPrinted.checked; applyPrintPrefs(); saveAll(); }); }
  if(showPgn){ showPgn.checked = !!state.printShowPgn; showPgn.addEventListener('change',()=>{ state.printShowPgn=showPgn.checked; applyPrintPrefs(); saveAll(); }); }
  applyPrintPrefs();
}
// legacy med actions removed; handled in initOrderUI
function initButtons(){
  $("#copyHis")?.addEventListener("click", ()=>{ const txt=buildHisNote(); $("#hisText").textContent=txt; navigator.clipboard.writeText(txt).then(()=>snack("คัดลอก HIS Note แล้ว","ok")); });
  $("#previewBtn")?.addEventListener("click", ()=>{ readInputsToState(); renderPrintDoc(); document.getElementById('printDoc')?.scrollIntoView({behavior:'smooth',block:'center'}); snack('แสดงตัวอย่าง PDF (print layout)','info'); });
  $("#exportPdf")?.addEventListener("click", ()=>{
    // Print in-place using the current page (no popup)
    readInputsToState(); renderPrintDoc();
    // Apply fit-one-page class to body for consistent CSS-based scaling
    const fit = document.getElementById('fitOnePage')?.checked;
    if(fit){
      document.body.classList.add('fit-one-page');
    } else {
      document.body.classList.remove('fit-one-page');
    }
    const cleanup = ()=>{ document.body.classList.remove('fit-one-page'); };
    if('onafterprint' in window){ window.addEventListener('afterprint', cleanup, { once:true }); }
    setTimeout(cleanup, 2000);
    window.print();
  });
  // Export/Import JSON data
  $("#exportData")?.addEventListener("click", ()=>{
    readInputsToState();
    const payload = { version:"1.1", ts:Date.now(), state, meds, caregivers };
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
    const hn = (state.pHN||'').trim() || 'NOHN';
    const nm = (state.pName||'').trim() || 'NONAME';
    const fnameRaw = `${hn} - ${nm}`;
    const fname = (fnameRaw)
      .replace(/[\\/:*?"<>|]/g,'_')
      .replace(/\s{2,}/g,' ')
      .trim() + '.json';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 500);
    snack(`Export: ${fname}`,'ok');
  });
  // Export medication list as Excel (CSV format)
  $("#exportExcel")?.addEventListener("click", ()=>{
    if(meds.length === 0){
      snack('ไม่มีรายการยา', 'warn');
      return;
    }

    // Create CSV content
    let csv = 'ลำดับ,ชื่อยา,วิธีใช้,จำนวน,หมายเหตุ\n';
    meds.forEach((m, i) => {
      const name = (m.name || '').replace(/"/g, '""'); // Escape quotes
      const use = (m.use || m.doseText || '').replace(/"/g, '""');
      const qty = m.qty || '';
      const type = m.orderType === 'prn' ? 'PRN' : '';

      csv += `${i+1},"${name}","${use}","${qty}","${type}"\n`;
    });

    // Add UTF-8 BOM for Excel to recognize Thai characters
    const bom = '\uFEFF';
    const blob = new Blob([bom + csv], {type:'text/csv;charset=utf-8'});

    const hn = (state.pHN||'').trim() || 'NOHN';
    const nm = (state.pName||'').trim() || 'NONAME';
    const fname = `รายการยา_${hn}_${nm}.csv`
      .replace(/[\\/:*?"<>|]/g,'_')
      .replace(/\s{2,}/g,' ')
      .trim();

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 500);
    snack(`Export Excel: ${fname}`,'ok');
  });

  $("#importData")?.addEventListener("click", ()=>{ $("#importFile")?.click(); });
  $("#importFile")?.addEventListener("change", (e)=>{
    const f = e.target.files && e.target.files[0];
    if(!f) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const d = JSON.parse(String(reader.result||'{}'));
        if(!d || typeof d!== 'object') throw new Error('bad json');
        const ns = d.state||{}; const nm = Array.isArray(d.meds)? d.meds: [];
        state = {...state, ...ns};
        meds = nm;
        caregivers = Array.isArray(d.caregivers)? d.caregivers: ( (ns.careName||ns.careRelation||ns.careTel) ? [{name:ns.careName||'', relation:ns.careRelation||'', tel:ns.careTel||''}] : (caregivers||[]) );
        renderStateToInputs(); renderMeds(); renderCaregivers(); syncCarePrimaryToState(); bindSpans(); saveAll();
        snack('Import สำเร็จ','ok');
      }catch(err){ console.error(err); snack('Import ล้มเหลว: ไฟล์ไม่ถูกต้อง','danger'); }
    };
    reader.readAsText(f);
    e.target.value='';
  });
  $("#openDrive")?.addEventListener("click", ()=>{ window.open(DRIVE_FOLDER_URL, '_blank'); });
  $("#clearAll")?.addEventListener("click", ()=>{
    if(!confirm("ยืนยันล้างข้อมูลทั้งหมด? (มี Undo)")) return;
    const backup=localStorage.getItem(STORAGE_KEY); localStorage.setItem(STORAGE_KEY+"_backup", backup||"");
    localStorage.removeItem(STORAGE_KEY); location.reload();
  });
  const backup=localStorage.getItem(STORAGE_KEY+"_backup");
  if(backup){ const btn=document.createElement("button"); btn.textContent="Undo ล้างข้อมูล"; btn.className="undo";
    btn.onclick=()=>{ localStorage.setItem(STORAGE_KEY,backup); localStorage.removeItem(STORAGE_KEY+"_backup"); location.reload(); };
    $(".actions")?.appendChild(btn);
  }
}

// ---------- Calculator: CSCI/IV ----------
function calcCSCI(){
  const drug=$("#calcDrug")?.value||"Morphine";
  const route=$("#calcRoute")?.value||"CSCI";
  const total=+($("#calcTotalMg24")?.value||0); // mg/24h
  const diluent=$("#calcDiluent")?.value||"NSS";
  const device=$("#calcDevice")?.value||"syringe";
  const container=+($("#calcContainer")?.value||20); // mL (fallback when no conc/vol)
  let finalVol=+($("#calcFinalVol")?.value||0);
  const duration=+($("#calcDuration")?.value||24); // h
  const site=$("#calcSite")?.value||"";
  const rateIn = +($("#calcRate")?.value||0);
  const concIn = +($("#calcConc")?.value||0);

  if(total<=0) return {err:"กรอกขนาดรวม mg/24h ก่อน"};
  // 1) If concentration given, compute final volume from total/conc
  if(concIn>0){
    finalVol = +(total/concIn).toFixed(2);
  }
  // 2) Else for pump IV, if rate provided compute finalVol from rate*duration
  else if(device==="pump" && /IV/i.test(route) && rateIn>0 && duration>0){
    finalVol = +(rateIn*duration).toFixed(2);
  }
  // 3) Else fallback to entered finalVol or container size
  if(finalVol<=0) finalVol=container;

  const conc = total / finalVol;        // mg/mL (always show actual concentration)
  const rate = (device==="pump" && /IV/i.test(route) && rateIn>0)? rateIn : (finalVol / (duration||1));     // mL/h

  const line = `${drug} ${total} mg + ${diluent} up to ${finalVol} mL via ${route} @ ${rate.toFixed(2)} mL/h (${device==="syringe"?"Thalapump-20":"Infusion pump"})${site?` (site: ${site})`:""}`;
  return {drug,route,total,diluent,device,container,finalVol,duration,conc,rate,line,site,rateIn,concIn};
}
function initCalcCSCI(){
  const render = ()=>{
    const r=calcCSCI();
    const el=$("#calcResult"); if(!el) return;
    if(r.err) { el.innerHTML=`<p class="warn">${r.err}</p>`; return; }
    const rateDetail = (r.device==="pump" && /IV/i.test(r.route) && r.rateIn>0)
      ? `Rate = <strong>${r.rate.toFixed(2)} mL/h</strong> (user input)`
      : `Rate = FinalVol / Duration = ${r.finalVol} / ${r.duration} = <strong>${r.rate.toFixed(2)} mL/h</strong>`;
    const concDetail = r.concIn>0
      ? `Concentration (input) = <strong>${r.concIn.toFixed(2)} mg/mL</strong>`
      : `Concentration = Total / FinalVol = ${r.total} / ${r.finalVol} = <strong>${r.conc.toFixed(2)} mg/mL</strong>`;
    el.innerHTML = `
      <p><strong>ผลคำนวณ</strong></p>
      <p>${concDetail}</p>
      <p>${rateDetail}</p>
      <p>Order: <code>${r.line}</code></p>`;
  };
  $("#calcPreview")?.addEventListener("click", render);
  $("#calcAdd")?.addEventListener("click", ()=>{
    const r=calcCSCI(); if(r.err){ snack(r.err,"warn"); return; }
    addMed({
      name: r.drug, route: r.route, orderType:"infusion",
      form:"inj", strength:"", doseText:`${r.total} mg over ${r.duration}h`, total:r.total, duration:r.duration,
      diluent:r.diluent, finalVol:r.finalVol, rate:+r.rate.toFixed(2),
      device:r.device, site:r.site
    });
  });
  // Show/hide pump rate and set helpful defaults
  const toggleRate=()=>{
    const dev=$("#calcDevice")?.value||'syringe';
    const route=$("#calcRoute")?.value||'CSCI';
    const wrap=$("#calcRateWrap"); if(wrap) wrap.style.display = (dev==='pump' && /IV/i.test(route))? 'block':'none';
    // Default volume for pump IV if empty
    const volEl=$("#calcFinalVol"); if(dev==='pump' && /IV/i.test(route) && volEl && !volEl.value){ volEl.value=100; }
  };
  $("#calcDevice")?.addEventListener('change', ()=>{ toggleRate(); render(); });
  $("#calcRoute")?.addEventListener('change', ()=>{ toggleRate(); render(); });
  ["#calcDrug","#calcTotalMg24","#calcDiluent","#calcFinalVol","#calcDuration","#calcRate","#calcSite","#calcConc"].forEach(sel=>{
    $(sel)?.addEventListener('input', render);
  });
  // Initial
  toggleRate(); render();
}

// ---------- Conversion: Oral Morphine → Fentanyl patch ----------
function morphineToPatch(morphine24){
  // ตารางช่วง (mg oral morphine / 24h) → patch mcg/h (แนวปฏิบัติทั่วไป)
  const table=[
    {min:60, max:134, patch:25},
    {min:135, max:224, patch:50},
    {min:225, max:314, patch:75},
    {min:315, max:404, patch:100},
    {min:405, max:494, patch:125},
    {min:495, max:584, patch:150},
    {min:585, max:674, patch:175},
    {min:675, max:764, patch:200},
  ];
  for(const r of table){ if(morphine24>=r.min && morphine24<=r.max) return r.patch; }
  if(morphine24<60) return 0; // ต่ำกว่าเกณฑ์ — ไม่เสนอ patch
  if(morphine24>764) return 200; // บอกช่วงสูงสุดในตารางนี้
  return 0;
}
function initFentanylConv(){
  $("#convSuggest")?.addEventListener("click", ()=>{
    const m = +($("#oralMorphine24")?.value||0);
    const naive = ($("#isNaiveForPatch")?.value||"No")==="Yes";
    const out=$("#convResult"); if(!out) return;
    if(m<=0){ out.innerHTML=`<p class="warn">กรอก Oral Morphine (mg/24h) ก่อน</p>`; snack("กรอก Oral Morphine ก่อน","warn"); return; }
    if(naive){ out.innerHTML=`<p class="warn">⚠️ ผู้ป่วย opioid-naïve: ไม่ควรเริ่มจาก Fentanyl patch</p>`; snack("ห้ามเริ่ม patch ใน opioid-naïve","warn"); return; }
    const patch=morphineToPatch(m);
    if(patch===0){
      out.innerHTML=`<p>ขนาดต่ำ (<60 mg/24h) — ยังไม่เสนอใช้ patch; ให้ uptitrate oral/SC ก่อน</p>`;
      return;
    }
    out.innerHTML=`<p>เทียบเคียง: <strong>${m} mg/24h</strong> ≈ <strong>Fentanyl patch ${patch} mcg/h</strong> (เปลี่ยน q72h) + rescue IR</p>`;
  });
}

// ---------- Auto-format Input Helpers ----------
// Format Thai National ID: X-XXXX-XXXXX-XX-X
function formatThaiID(value){
  const cleaned = value.replace(/[^0-9]/g, '');
  if(cleaned.length === 0) return '';
  if(cleaned.length <= 1) return cleaned;
  if(cleaned.length <= 5) return cleaned.slice(0,1) + '-' + cleaned.slice(1);
  if(cleaned.length <= 10) return cleaned.slice(0,1) + '-' + cleaned.slice(1,5) + '-' + cleaned.slice(5);
  if(cleaned.length <= 12) return cleaned.slice(0,1) + '-' + cleaned.slice(1,5) + '-' + cleaned.slice(5,10) + '-' + cleaned.slice(10);
  return cleaned.slice(0,1) + '-' + cleaned.slice(1,5) + '-' + cleaned.slice(5,10) + '-' + cleaned.slice(10,12) + '-' + cleaned.slice(12,13);
}

// Format Thai phone: 0XX-XXXXXXX
function formatThaiPhone(value){
  const cleaned = value.replace(/[^0-9]/g, '');
  if(cleaned.length === 0) return '';
  if(cleaned.length <= 3) return cleaned;
  return cleaned.slice(0,3) + '-' + cleaned.slice(3,10);
}

function initAutoFormat(){
  // Thai National ID formatting
  const cidInput = document.getElementById('pCID');
  if(cidInput){
    cidInput.addEventListener('input', function(e){
      const cursorPos = e.target.selectionStart;
      const oldValue = e.target.value;
      const formatted = formatThaiID(oldValue);
      e.target.value = formatted;
      // Adjust cursor position
      if(formatted.length > oldValue.length && cursorPos === oldValue.length){
        e.target.setSelectionRange(formatted.length, formatted.length);
      }
    });
  }

  // Follow-up phone formatting
  const fuTelInput = document.getElementById('fuTel');
  if(fuTelInput){
    fuTelInput.addEventListener('input', function(e){
      const formatted = formatThaiPhone(e.target.value);
      e.target.value = formatted;
    });
  }
}

// ---------- Hydrate / Boot ----------
function hydrate(){
  if(loadAll()){ renderStateToInputs(); renderMeds(); }
  else{
    state={ refDate: todayISO(), fromFacility: "คลินิกเบาใจ รพ.กาฬสินธุ์ โทร. 043-811020 ต่อ 1352", pps:"40" };
    meds=[];
  }
  readInputsToState();
  renderPrintDoc();
  saveAll();
}
window.addEventListener("DOMContentLoaded", ()=>{
  hydrate(); initInputs(); initCaregiversUI(); initButtons();
  initOrderTypeSwitcher();
  initOrderUI();
  initMixUI();
  initAutoFormat();
  // Calculator removed
  initFentanylConv();
  safetyChecks();
});
