// SolatTime - dashboard, activity planner, and analytics.
// Prayer times use Waktu Solat Malaysia. Islamic event dates are calculated locally.
'use strict';

const $ = id => document.getElementById(id);
const TIMEZONE = 'Asia/Kuala_Lumpur';
const LOCATION_KEY = 'solattime:zone';
const ACTIVITY_KEY = 'solattime:activities';
const MONTH_CACHE_KEY = 'solattime:month:';
const ZONES_CACHE_KEY = 'solattime:zones';
const EVENTS_CACHE_KEY = 'solattime:events:';
const DAY_MS = 86400000;
const HOURS_24 = { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
const PRAYERS = [
  { name: 'Subuh', key: 'fajr' },
  { name: 'Zohor', key: 'dhuhr' },
  { name: 'Asar', key: 'asr' },
  { name: 'Maghrib', key: 'maghrib' },
  { name: 'Isyak', key: 'isha' }
];

function malaysiaDate(date = new Date()) {
  const entries = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const item = kind => entries.find(part => part.type === kind).value;
  return `${item('year')}-${item('month')}-${item('day')}`;
}
function dateAfter(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function stampSeconds(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1000000000 && n <= 5000000000 ? n : null;
}
function timeText(seconds) {
  const n = stampSeconds(seconds);
  return n === null ? '--:--' : new Date(n * 1000).toLocaleTimeString('en-GB', HOURS_24);
}
function setText(id, content) { if ($(id)) $(id).textContent = String(content); }
function status(id, content, error = false) {
  const element = $(id);
  if (!element) return;
  element.textContent = content;
  element.style.color = error ? '#b02e2e' : '#507565';
}
function getJSON(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function storeJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function savedActivities() {
  const value = getJSON(ACTIVITY_KEY, null) ?? getJSON('solat_activities', []);
  return Array.isArray(value) ? value : [];
}
function saveActivities(records) { storeJSON(ACTIVITY_KEY, records); }
function isDone(record) { return Boolean(record.done || record.completed); }
function savedZone() {
  const current = localStorage.getItem(LOCATION_KEY) ||
    localStorage.getItem('solat_zone') || localStorage.getItem('solattime_location');
  return /^[A-Z]{3}\d{2}$/.test(current || '') && current !== 'WLY03' ? current : 'WLY01';
}
function updateClock() {
  setText('clock', new Date().toLocaleTimeString('en-GB', {
    timeZone: TIMEZONE, hour12: false
  }));
}

// Recognize zone JSON returned by the official API, without hardcoding states.
function normalizeZones(response) {
  const list = Array.isArray(response) ? response :
    Array.isArray(response?.data) ? response.data :
    Array.isArray(response?.zones) ? response.zones : [];
  return list.map(item => ({
    code: String(item.jakimCode || item.zone || item.code || '').toUpperCase(),
    state: String(item.negeri || item.state || '').trim(),
    area: String(item.daerah || item.district || item.area || item.name || '').trim()
  })).filter(z => /^[A-Z]{3}\d{2}$/.test(z.code) && z.state && z.area);
}
async function getZones() {
  const cached = getJSON(ZONES_CACHE_KEY);
  if (Array.isArray(cached?.value) && cached.value.length >= 20 &&
      Date.now() - cached.at < 7 * DAY_MS) return cached.value;
  try {
    const zones = normalizeZones(await window.solatAPI.zones());
    if (zones.length < 20) throw new Error('Incomplete location list');
    storeJSON(ZONES_CACHE_KEY, { at: Date.now(), value: zones });
    return zones;
  } catch (error) {
    if (Array.isArray(cached?.value) && cached.value.length) return cached.value;
    throw error;
  }
}

// Return a specific day's API record, matched against the Subuh Unix timestamp.
function findDay(data, dateISO) {
  if (!Array.isArray(data?.prayers)) throw new Error('Invalid prayer-time data');
  return data.prayers.find(row => {
    const epoch = stampSeconds(row?.fajr);
    return epoch !== null && malaysiaDate(new Date(epoch * 1000)) === dateISO;
  }) || null;
}
async function loadMonth(zone, dateISO) {
  const [year, month] = dateISO.split('-').map(Number);
  const key = `${MONTH_CACHE_KEY}${zone}:${year}:${month}`;
  const cached = getJSON(key);
  if (Array.isArray(cached?.data?.prayers) && Date.now() - cached.at < DAY_MS) {
    return cached.data;
  }
  try {
    if (!window.solatAPI || typeof window.solatAPI.prayers !== 'function') {
      throw new Error('Electron API connection missing');
    }
    const response = await window.solatAPI.prayers(zone, year, month);
    if (!Array.isArray(response?.prayers) || !response.prayers.length) {
      throw new Error('No prayer times returned');
    }
    storeJSON(key, { at: Date.now(), data: response });
    return response;
  } catch (error) {
    if (Array.isArray(cached?.data?.prayers)) return cached.data;
    throw error;
  }
}
async function loadPrayerPair(zone, dateISO = malaysiaDate()) {
  const data = await loadMonth(zone, dateISO);
  const today = findDay(data, dateISO);
  if (!today) throw new Error(`Prayer times unavailable for ${dateISO}`);
  const tomorrowISO = dateAfter(dateISO, 1);
  let tomorrow = findDay(data, tomorrowISO);
  if (!tomorrow && tomorrowISO.slice(0, 7) !== dateISO.slice(0, 7)) {
    try { tomorrow = findDay(await loadMonth(zone, tomorrowISO), tomorrowISO); }
    catch (error) { console.warn('Tomorrow:', error.message); }
  }
  return { today, tomorrow, dateISO };
}
function getNextPrayer(pair) {
  if (!pair) return null;
  for (const prayer of PRAYERS) {
    const t = stampSeconds(pair.today?.[prayer.key]);
    if (t !== null && t * 1000 > Date.now()) {
      return { name: prayer.name, time: t * 1000 };
    }
  }
  const t = stampSeconds(pair.tomorrow?.fajr);
  return t !== null && t * 1000 > Date.now()
    ? { name: 'Subuh (Tomorrow)', time: t * 1000 }
    : null;
}
function remainingClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const pad = n => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total % 3600 / 60))}:${pad(total % 60)}`;
}
function button(label, action, className = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  b.addEventListener('click', action);
  return b;
}

// Dashboard
async function dashboardPage() {
  let pair = null;
  let zones = [];
  let activeRequest = 0;
  let displayedDate = malaysiaDate();
  const tips = [
    ['Solat Dhuha', 'Pray two or more rakaat after sunrise, once the sun has risen sufficiently, before Zohor.'],
    ['Solat Tahajjud', 'After sleeping, wake at night and pray two rakaat at a time before Subuh.'],
    ['Solat Witir', 'An odd-numbered sunnah prayer after Isyak and before Subuh.'],
    ['Morning Zikir', 'Recite morning supplications and spend a few minutes in remembrance after Subuh.'],
    ['Friday', 'Read Surah Al-Kahf and send selawat upon the Prophet on Friday.']
  ];
  let tip = 0;
  function showTip() {
    setText('tipTitle', tips[tip][0]);
    setText('tipText', tips[tip][1]);
  }
  $('nextTip').addEventListener('click', () => { tip = (tip + 1) % tips.length; showTip(); });
  showTip();

  function populateAreas(state, preferred) {
    const items = zones.filter(z => z.state === state);
    $('zone').replaceChildren();
    for (const item of items) {
      const option = new Option(`${item.area} (${item.code})`, item.code);
      $('zone').append(option);
    }
    if (items.some(z => z.code === preferred)) $('zone').value = preferred;
  }
  function clearTimes() {
    ['fajr','syuruk','dhuhr','asr','maghrib','isha'].forEach(k => setText(`t-${k}`, '--:--'));
    setText('nextName', '--');
    setText('remaining', '--:--:--');
    setText('suggestion', '');
  }
  function updateCountdown() {
    if (!pair) return;
    const next = getNextPrayer(pair);
    if (!next) {
      setText('nextName', 'Next prayer unavailable');
      setText('remaining', '--:--:--');
      setText('suggestion', '');
      return;
    }
    setText('nextName', next.name);
    setText('remaining', remainingClock(next.time - Date.now()));
    const mins = Math.max(0, Math.floor((next.time - Date.now()) / 60000));
    let suggestion = 'Read the Quran or spend some time in Zikir.';
    if (mins <= 15) suggestion = `Prepare for ${next.name}.`;
    else if (next.name === 'Zohor' && mins >= 30) suggestion = 'Consider Solat Dhuha before Zohor.';
    else if (next.name === 'Maghrib') suggestion = 'Evening Zikir is a good activity before Maghrib.';
    else if (next.name === 'Subuh (Tomorrow)') suggestion = 'You can prepare for Tahajjud and Subuh.';
    setText('suggestion', suggestion);
    localStorage.setItem('solattime:suggestion', suggestion);
  }
  async function refresh() {
    const request = ++activeRequest;
    const zone = $('zone').value;
    if (!zone) return;
    localStorage.setItem(LOCATION_KEY, zone);
    displayedDate = malaysiaDate();
    pair = null;
    clearTimes();
    status('status', 'Loading prayer times...');
    try {
      const result = await loadPrayerPair(zone, displayedDate);
      if (request !== activeRequest) return;
      pair = result;
      for (const key of ['fajr','syuruk','dhuhr','asr','maghrib','isha']) {
        setText(`t-${key}`, timeText(result.today[key]));
      }
      status('status', 'Updated');
      updateCountdown();
    } catch (error) {
      if (request !== activeRequest) return;
      status('status', `Prayer times unavailable: ${error.message}`, true);
      setText('nextName', 'Unavailable');
    }
  }

  updateClock();
  try {
    zones = await getZones();
  } catch (error) {
    // The fallback is only for selecting WLY01; prayer times are still API-only.
    zones = [{ code: 'WLY01', state: 'Wilayah Persekutuan', area: 'Kuala Lumpur / Putrajaya' }];
    status('status', 'Could not load other locations. Kuala Lumpur is available.', true);
  }
  const choice = zones.find(z => z.code === savedZone()) ||
    zones.find(z => z.code === 'WLY01') || zones[0];
  const stateNames = [...new Set(zones.map(z => z.state))].sort((a, b) => a.localeCompare(b));
  for (const state of stateNames) $('state').append(new Option(state, state));
  $('state').value = choice.state;
  populateAreas(choice.state, choice.code);

  $('state').addEventListener('change', () => {
    populateAreas($('state').value);
    refresh();
  });
  $('zone').addEventListener('change', refresh);
  $('refresh').addEventListener('click', refresh);
  await refresh();
  setInterval(() => {
    updateClock();
    if (displayedDate !== malaysiaDate()) refresh();
    else updateCountdown();
  }, 1000);
}


// Islamic events: calculated immediately using the built-in Umm al-Qura calendar.
// The 2027 public-holiday dates below use published Malaysian tentative dates.
// These are all estimates until officially confirmed by Malaysian authorities.
const EVENT_DEFINITIONS = {
  '1-1': ['Awal Muharram', 'muharram'],
  '1-10': ['Day of Ashura', 'ashura'],
  '3-12': ['Maulidur Rasul', 'maulidur'],
  '7-27': ["Isra' and Mi'raj", 'isra'],
  '8-15': ["Nisfu Sya'ban", 'nisfu'],
  '9-1': ['Ramadan Begins', 'ramadan'],
  '9-17': ['Nuzul Al-Quran', 'nuzul'],
  '10-1': ['Hari Raya Aidilfitri', 'aidilfitri'],
  '12-9': ['Day of Arafah', 'arafah'],
  '12-10': ['Hari Raya Aidiladha', 'aidiladha']
};
const MALAYSIA_TENTATIVE_2027 = {
  'aidilfitri:2027-03-09': '2027-03-10',
  'aidiladha:2027-05-16': '2027-05-17',
  'muharram:2027-06-06': '2027-06-07'
};
const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC', day:'numeric', month:'short', year:'numeric'
});
const HIJRI_FORMAT = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
  timeZone:'UTC', day:'numeric', month:'numeric', year:'numeric'
});
function midnight(iso) { return Date.parse(`${iso}T00:00:00Z`); }
function daysBetween(a,b) { return Math.round((midnight(b)-midnight(a))/DAY_MS); }
function prettyDate(iso) { return DATE_FORMAT.format(new Date(midnight(iso))); }
function upcomingIslamicEvents() {
  const start = malaysiaDate();
  const events = [];
  for (let i = 0; i < 470; i++) {
    const dateISO = dateAfter(start,i);
    const parts = HIJRI_FORMAT.formatToParts(new Date(midnight(dateISO)));
    const value = kind => Number(parts.find(p=>p.type===kind)?.value);
    const key = `${value('month')}-${value('day')}`;
    const definition = EVENT_DEFINITIONS[key];
    if (!definition) continue;
    const estimatedDate = MALAYSIA_TENTATIVE_2027[`${definition[1]}:${dateISO}`] || dateISO;
    if (estimatedDate < start) continue;
    events.push({id:`${definition[1]}:${estimatedDate}`, type:definition[1],
      name: definition[0], date:estimatedDate, hijriYear:value('year')});
  }
  events.sort((a,b)=>a.date.localeCompare(b.date));
  return events;
}
function eventLine(record,onPlan) {
  const line=document.createElement('div');line.className='list-row';
  const text=document.createElement('div');
  const heading=document.createElement('strong');heading.textContent=record.name;
  const meta=document.createElement('small');
  const days=daysBetween(malaysiaDate(),record.date);
  meta.textContent=`${prettyDate(record.date)} · ${days===0?'Today':`${days} days remaining`}`;
  text.append(heading,meta);line.append(text);
  if(onPlan) line.append(button('Plan',()=>onPlan(record)));
  return line;
}

// Activity Planner: full CRUD, persisted to Local Storage.
function plannerPage() {
  let editId = null;
  const form=$('activityForm'), list=$('activityList');
  const events=upcomingIslamicEvents();
  $('activityDate').value=malaysiaDate();
  function reset() {
    editId=null;form.reset();
    $('activityDate').value=malaysiaDate();
    $('saveButton').textContent='Add activity';
    setText('formHeading','Add Activity');
  }
  function render() {
    list.replaceChildren();
    const rows=savedActivities().slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    if(!rows.length){list.textContent='No activities yet.';return;}
    for(const item of rows){
      const row=document.createElement('div');row.className='list-row';
      const details=document.createElement('div');
      const name=document.createElement('strong');name.textContent=`${isDone(item)?'✓ ':''}${item.title}`;
      const meta=document.createElement('small');meta.textContent=`${item.date} · ${item.minutes} min · ${item.category||'Other'}`;
      details.append(name,meta);
      const actions=document.createElement('div');actions.className='actions';
      actions.append(
        button(isDone(item)?'Undo':'Done',()=>{
          const data=savedActivities();const current=data.find(a=>a.id===item.id);
          if(current){current.done=!isDone(current);current.completed=current.done;}
          saveActivities(data);render();status('plannerStatus','Activity updated');
        }),
        button('Edit',()=>{
          editId=item.id;
          $('activityTitle').value=item.title;
          $('activityDate').value=item.date;
          $('activityMinutes').value=item.minutes;
          $('activityCategory').value=item.category||'Other';
          $('saveButton').textContent='Save changes';
          setText('formHeading','Edit Activity');
          $('activityTitle').focus();
        }),
        button('Delete',()=>{
          if(!window.confirm(`Delete ${item.title}?`))return;
          saveActivities(savedActivities().filter(a=>a.id!==item.id));
          if(editId===item.id)reset();
          render();status('plannerStatus','Activity deleted');
        },'danger')
      );
      row.append(details,actions);list.append(row);
    }
  }
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const title=$('activityTitle').value.trim();
    const date=$('activityDate').value;
    const minutes=Number($('activityMinutes').value);
    if(!title||title.length>80||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||
       !Number.isInteger(minutes)||minutes<5||minutes>180){
       status('plannerStatus','Enter a valid activity name, date and duration (5–180 minutes).',true);
       return;
    }
    const data=savedActivities();
    if(editId!==null){
      const current=data.find(a=>a.id===editId);
      if(current)Object.assign(current,{title,date,minutes,category:$('activityCategory').value});
    }else{
      data.push({id:`${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title,date,minutes,category:$('activityCategory').value,done:false,completed:false});
    }
    saveActivities(data);reset();render();status('plannerStatus','Activity saved');
  });
  $('cancelButton').addEventListener('click',()=>{reset();status('plannerStatus','');});
  render();
  function planEvent(event){
    reset();$('activityTitle').value=event.name;
    $('activityDate').value=event.date;
    $('activityMinutes').value='30';
    $('activityCategory').value='Other';
    status('plannerStatus','Event selected. Click Add activity to save.');
    form.scrollIntoView({behavior:'smooth',block:'center'});
  }
  const eventList=$('eventList');
  eventList.replaceChildren(...events.slice(0,12).map(e=>eventLine(e,planEvent)));
  status('eventStatus',`${events.length} upcoming dates calculated`);
}

// Analytics: time until Islamic events, days between two events,
// and a genuine API-derived interval between prayer times.
async function analyticsPage() {
  const events=upcomingIslamicEvents();
  const byId=id=>events.find(e=>e.id===id);
  let pair=null;
  let loadedDate=malaysiaDate();
  const eidAdha=events.find(e=>e.type==='aidiladha');
  const ramadan=events.find(e=>e.type==='ramadan');
  const eidFitr=events.find(e=>e.type==='aidilfitri');
  function fill(id,preferred){
    const select=$(id);select.replaceChildren();
    for(const e of events){select.append(new Option(`${e.name} — ${prettyDate(e.date)}`,e.id));}
    select.disabled=events.length===0;
    if(preferred)select.value=preferred;
  }
  fill('targetEvent',eidAdha?.id||events[0]?.id);
  fill('eventFrom',ramadan?.id||events[0]?.id);
  fill('eventTo',eidFitr?.id||events[1]?.id||events[0]?.id);
  $('analyticsEventList').replaceChildren(...events.slice(0,14).map(e=>eventLine(e)));
  function calculateEvents(){
    const target=byId($('targetEvent').value),from=byId($('eventFrom').value),to=byId($('eventTo').value);
    if(target){
      const days=daysBetween(malaysiaDate(),target.date);
      setText('daysRemaining',`${days} days`);
      setText('weeksRemaining',`${Math.floor(days/7)} weeks ${days%7} days`);
      setText('targetDate',prettyDate(target.date));
    }
    if(from&&to)setText('intervalDays',`${Math.abs(daysBetween(from.date,to.date))} days`);
    if(events.length)setText('nextEvent',`${events[0].name} (${daysBetween(malaysiaDate(),events[0].date)}d)`);
  }
  for(const key of ['targetEvent','eventFrom','eventTo'])$(key).addEventListener('change',calculateEvents);
  calculateEvents();
  function calculatePrayers(){
    if(!pair)return;
    const from=stampSeconds(pair.today[$('prayerFrom').value]);
    const to=stampSeconds(pair.today[$('prayerTo').value]);
    if(from!==null&&to!==null){
      const diff=Math.abs(to-from);
      const min=Math.round(diff/60);
      setText('prayerInterval',`${Math.floor(min/60)}h ${min%60}m`);
    }else setText('prayerInterval','Unavailable');
    const next=getNextPrayer(pair);
    setText('nextPrayerLabel',next?next.name:'Unavailable');
    if(next){
      const total=Math.max(0,Math.ceil((next.time-Date.now())/60000));
      setText('untilNextPrayer',`${Math.floor(total/60)}h ${total%60}m`);
    }else setText('untilNextPrayer','--');
  }
  $('prayerFrom').addEventListener('change',calculatePrayers);
  $('prayerTo').addEventListener('change',calculatePrayers);
  async function refreshPrayers(){
    status('analyticsStatus','Loading prayer times...');
    try{
      pair=await loadPrayerPair(savedZone());
      loadedDate=malaysiaDate();
      calculatePrayers();status('analyticsStatus','Prayer-time data updated');
    }catch(error){
      status('analyticsStatus',`Prayer-time API unavailable: ${error.message}`,true);
      setText('prayerInterval','Unavailable');
      setText('untilNextPrayer','--');
      setText('nextPrayerLabel','--');
    }
  }
  refreshPrayers();
  setInterval(()=>{
    if(loadedDate!==malaysiaDate())window.location.reload();
    else {calculateEvents();calculatePrayers();}
  },30000);
}

const page=document.body.dataset.page;
if(page==='dashboard')dashboardPage();
else if(page==='planner')plannerPage();
else if(page==='analytics')analyticsPage();