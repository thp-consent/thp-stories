/* THP Stories (v1.0) – impact stories from the field.
 * Each story is one document kept on the device (works offline) and synced to Google:
 * story.json + recordings + photos in its own Drive folder, a row in the Stories / Quotes / Facts sheets,
 * an interview appointment in Google Calendar, and on request a "Story file" Google Doc.
 * Recordings are saved to the device every few seconds while recording, so a crash or flat battery
 * loses at most a few seconds – the app recovers the recording next time it opens.
 */
(() => {
  'use strict';
  const APP_VERSION = '1.1.0';
  const Q = window.THPQuestions;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ============================================================ helpers */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad2 = (n) => String(n).padStart(2, '0');
  const ymd = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const clock = (sec) => { sec = Math.max(0, Math.floor(sec || 0)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`; };
  const niceDate = (s) => (s ? new Date(s.slice(0, 10) + 'T12:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
  function newId(prefix, n = 6) { const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; const r = new Uint8Array(n); crypto.getRandomValues(r); return `${prefix}-${ymd().replace(/-/g, '')}-${Array.from(r, (b) => abc[b % abc.length]).join('')}`; }
  let toastT; const toast = (m, ms = 2800) => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), ms); };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const blobToDataURL = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });

  /* ============================================================ settings */
  const settings = Object.assign({ url: '', key: '', name: '', projects: '' }, JSON.parse(localStorage.getItem('stories-settings') || '{}'));
  const saveSettings = () => localStorage.setItem('stories-settings', JSON.stringify(settings));

  /* ============================================================ IndexedDB */
  const DB = {
    _db: null,
    open() {
      if (this._db) return Promise.resolve(this._db);
      return new Promise((res, rej) => {
        const r = indexedDB.open('thp-stories', 1);
        r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('stories', { keyPath: 'id' }); d.createObjectStore('media'); d.createObjectStore('chunks'); d.createObjectStore('recmeta'); d.createObjectStore('cache'); };
        r.onsuccess = () => { this._db = r.result; res(this._db); }; r.onerror = () => rej(r.error);
      });
    },
    async tx(st, mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction(st, mode); const o = fn(t.objectStore(st)); t.oncomplete = () => res(o && o.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); },
    get: (st, k) => DB.tx(st, 'readonly', (s) => s.get(k)),
    put: (st, v, k) => DB.tx(st, 'readwrite', (s) => (k === undefined ? s.put(v) : s.put(v, k))),
    del: (st, k) => DB.tx(st, 'readwrite', (s) => s.delete(k)),
    all: (st) => DB.tx(st, 'readonly', (s) => s.getAll()),
    keys: (st) => DB.tx(st, 'readonly', (s) => s.getAllKeys()),
    range: (st, prefix) => DB.tx(st, 'readonly', (s) => s.getAll(IDBKeyRange.bound(prefix, prefix + '￿'))),
    delRange: (st, prefix) => DB.tx(st, 'readwrite', (s) => s.delete(IDBKeyRange.bound(prefix, prefix + '￿'))),
  };
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  /* ============================================================ data */
  let stories = []; // full story objects on this device
  let consents = [];
  let S = null; // the story being worked on
  async function loadLocal() {
    stories = (await DB.all('stories')) || [];
    consents = (await DB.get('cache', 'consents')) || [];
    fillLists();
  }
  function fillLists() {
    const opts = (a) => [...new Set(a.filter(Boolean))].map((v) => `<option value="${esc(v)}">`).join('');
    $('#communityList').innerHTML = opts([...stories.map((s) => s.community), ...consents.map((c) => c.community)]);
    $('#projectList').innerHTML = opts([...settings.projects.split(',').map((x) => x.trim()), ...stories.map((s) => s.project)]);
  }
  function blankStory() {
    const me = { id: newId('PE', 4), name: '', preferred: '', role: 'Storyteller', consentId: '', consentStatus: '', consentSource: '' };
    return {
      id: newId('SR'), type: 'journey', focus: '', focusOther: '', title: '', status: 'Planned', date: '', time: '', community: '', project: (settings.projects.split(',')[0] || '').trim(), interviewer: settings.name,
      languages: ['English'], langOther: '', themes: [], people: [me], answers: {}, media: [], quotes: [], facts: [],
      prep: {}, shots: Q.SHOTS.map((t) => ({ text: t, done: false })), reflections: '', followups: '', docUrl: '', folderUrl: '', folderId: '', eventId: '',
      archived: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), appVersion: APP_VERSION,
    };
  }
  let saveT;
  function touch(soon = true) {
    if (!S) return;
    S.updatedAt = new Date().toISOString(); S._dirty = true;
    clearTimeout(saveT);
    const st = S;
    const doSave = async () => { pendingSave = null; await DB.put('stories', st); const i = stories.findIndex((x) => x.id === st.id); if (i >= 0) stories[i] = st; else stories.push(st); syncSoon(); };
    pendingSave = doSave;
    if (soon) saveT = setTimeout(doSave, 500); else return doSave();
  }
  let pendingSave = null;
  const flushSave = () => { clearTimeout(saveT); return pendingSave ? pendingSave() : Promise.resolve(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
  window.addEventListener('pagehide', flushSave);
  const typeOf = (s = S) => Q.typeOf(s.type);
  const typeLabel = (s = S) => { const t = typeOf(s); const f = s.focus === 'Other' ? s.focusOther : s.focus; return t.title + (t.focus && f ? ' – ' + f : ''); };
  const teller = (s = S) => (s.people || []).find((p) => p.role === 'Storyteller') || (s.people || [])[0] || {};
  const personName = (pid, s = S) => { const p = (s.people || []).find((x) => x.id === pid); return p ? (p.preferred || p.name || p.role) : ''; };

  /* ============================================================ sync */
  let syncing = false, syncTimer, lastSync = '', syncErr = '', uploadNote = '';
  const syncSoon = () => { clearTimeout(syncTimer); syncTimer = setTimeout(syncAll, 3000); };
  async function post(body) {
    const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 300000);
    try {
      const res = await fetch(settings.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ key: settings.key, ...body }), signal: ctrl.signal, redirect: 'follow' });
      const t = await res.text(); let j; try { j = JSON.parse(t); } catch { throw new Error('Unexpected reply from Google – check the upload link'); }
      if (!j.ok) throw Object.assign(new Error(j.error || 'Refused'), { fatal: true });
      return j;
    } finally { clearTimeout(tm); }
  }
  async function getJ(params) {
    const u = new URL(settings.url); Object.entries({ key: settings.key, ...params }).forEach(([k, v]) => u.searchParams.set(k, v));
    const j = await (await fetch(u, { redirect: 'follow' })).json(); if (!j.ok) throw new Error(j.error || 'Google refused'); return j;
  }
  const wire = (s) => { const c = clone(s); delete c._dirty; (c.media || []).forEach((m) => delete m.thumb); return c; };
  async function upload(m, folderId) {
    const rec = await DB.get('media', m.mid); if (!rec) return null;
    try {
      const st = await post({ kind: 'startUpload', name: m.name, mime: m.mime, size: rec.size, folderId, origin: location.origin });
      const CH = 4 * 1024 * 1024; let off = 0, last = null;
      while (off < rec.size) {
        const end = Math.min(off + CH, rec.size);
        uploadNote = `Uploading ${m.kind === 'audio' ? 'recording' : m.kind} ${fmtSize(end)} / ${fmtSize(rec.size)}`; setNet();
        const r = await fetch(st.uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes ${off}-${end - 1}/${rec.size}` }, body: rec.blob.slice(off, end) });
        if (r.status === 308 || r.ok) { off = end; last = r; } else throw new Error('Upload failed (' + r.status + ')');
      }
      const j = await last.json(); return { fileId: j.id, url: `https://drive.google.com/file/d/${j.id}/view` };
    } catch (e) {
      if (rec.size > 30 * 1048576) throw e;
      const j = await post({ kind: 'uploadSmall', name: m.name, mime: m.mime, folderId, data: await blobToDataURL(rec.blob) });
      return { fileId: j.fileId, url: j.url };
    } finally { uploadNote = ''; }
  }
  async function syncAll() {
    if (syncing || !settings.url || !settings.key) { setNet(); return; }
    if (!navigator.onLine) { setNet(); return; }
    syncing = true; syncErr = ''; setNet(); $('#btnSync').classList.add('spin');
    try {
      for (const s0 of stories.filter((s) => s._dirty)) {
        const startedAt = s0.updatedAt;
        let s = s0;
        const r1 = await post({ kind: 'saveStory', story: wire(s) });
        s.folderId = r1.folderId || s.folderId; s.folderUrl = r1.folderUrl || s.folderUrl; s.eventId = r1.eventId ?? s.eventId;
        let changed = false;
        for (const m of s.media.filter((x) => !x.fileId)) {
          const up = await upload(m, s.folderId);
          if (up) { m.fileId = up.fileId; m.url = up.url; changed = true; }
          await DB.put('stories', s);
        }
        if (changed) await post({ kind: 'saveStory', story: wire(s) });
        if (s.updatedAt === startedAt) s._dirty = false;
        await DB.put('stories', s);
      }
      // bring down stories changed on another device
      const j = await getJ({ action: 'list' });
      consents = j.consents || []; await DB.put('cache', consents, 'consents');
      for (const r of j.stories || []) {
        const local = stories.find((s) => s.id === r.id);
        if (local && (local._dirty || String(local.updatedAt) >= String(r.updatedAt))) { if (r.docUrl && !local.docUrl) { local.docUrl = r.docUrl; await DB.put('stories', local); } continue; }
        if (local && new Date(local.updatedAt) >= new Date(r.updatedAt)) continue;
        try {
          const full = (await getJ({ action: 'story', id: r.id })).story; if (!full) continue;
          if (local) full.media.forEach((m) => { const lm = local.media.find((x) => x.mid === m.mid); if (lm && lm.thumb) m.thumb = lm.thumb; });
          await DB.put('stories', full);
          const i = stories.findIndex((s) => s.id === full.id); if (i >= 0) stories[i] = full; else stories.push(full);
          if (S && S.id === full.id && !S._dirty) { S = full; renderStory(); }
        } catch (e) { console.warn(e); }
      }
      lastSync = new Date().toISOString();
    } catch (e) { syncErr = e.name === 'AbortError' ? 'Timed out – will retry' : e.message; }
    finally { syncing = false; $('#btnSync').classList.remove('spin'); setNet(); fillLists(); if (!S) renderStories(); }
  }
  function setNet() {
    const n = $('#netStatus'); const dirty = stories.filter((s) => s._dirty).length;
    n.className = 'net ' + (navigator.onLine ? 'on' : 'off');
    n.textContent = Rec.active ? `Recording ${clock(Rec.elapsed())}` : !navigator.onLine ? `Offline${dirty ? ` · ${dirty} to sync` : ''}` : syncing ? (uploadNote || 'Syncing…') : syncErr ? '⚠ ' + syncErr : dirty ? `${dirty} story(ies) waiting` : !settings.url ? 'Not connected – see Settings' : 'All saved to Google';
    $('#syncInfo').innerHTML = `${lastSync ? 'Last synced ' + new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '. ' : ''}${dirty ? dirty + ' story(ies) with changes not yet in Google.' : 'Everything is in Google.'}${syncErr ? '<br><b>' + esc(syncErr) + '</b>' : ''}`;
  }
  window.addEventListener('online', syncAll); window.addEventListener('offline', setNet);
  setInterval(() => { if (navigator.onLine && document.visibilityState === 'visible' && !Rec.active) syncAll(); }, 90000);
  $('#btnSync').addEventListener('click', syncAll);

  /* ============================================================ recorder (crash-safe) */
  const Rec = {
    active: false, paused: false, mr: null, stream: null, recId: '', seq: 0, t0: 0, pausedMs: 0, pauseAt: 0, meta: null, wake: null, raf: 0, onUpdate: null,
    elapsed() { if (!this.active) return 0; const now = Date.now(); return (now - this.t0 - this.pausedMs - (this.paused ? now - this.pauseAt : 0)) / 1000; },
    async start(meta) {
      if (this.active) { toast('A recording is already running'); return false; }
      if (!navigator.mediaDevices || !window.MediaRecorder) { toast('Recording is not supported in this browser'); return false; }
      try { this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
      catch { toast('Allow microphone access to record'); return false; }
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
      this.mr = new MediaRecorder(this.stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
      this.recId = newId('RC'); this.seq = 0; this.t0 = Date.now(); this.pausedMs = 0; this.paused = false; this.active = true;
      this.meta = { recId: this.recId, mime: this.mr.mimeType || mime || 'audio/webm', startedAt: new Date().toISOString(), notes: [], ...meta };
      await DB.put('recmeta', this.meta, this.recId);
      this.mr.ondataavailable = (e) => { if (e.data && e.data.size) { DB.put('chunks', e.data, `${this.recId}:${String(this.seq++).padStart(6, '0')}`); this.meta.duration = this.elapsed(); DB.put('recmeta', this.meta, this.recId); } };
      this.mr.start(4000); // a chunk is saved to the device every 4 seconds
      try { if ('wakeLock' in navigator) this.wake = await navigator.wakeLock.request('screen'); } catch (_) {}
      this.meter();
      return true;
    },
    meter() {
      try {
        const ac = new (window.AudioContext || window.webkitAudioContext)(); const src = ac.createMediaStreamSource(this.stream); const an = ac.createAnalyser(); an.fftSize = 512; src.connect(an);
        const d = new Uint8Array(an.fftSize); this.ac = ac;
        const tick = () => { if (!this.active) return; an.getByteTimeDomainData(d); let pk = 0; for (const v of d) pk = Math.max(pk, Math.abs(v - 128)); this.onUpdate && this.onUpdate(pk / 128); this.raf = requestAnimationFrame(tick); };
        tick();
      } catch (_) {}
    },
    pause() { if (!this.active) return; if (this.paused) { this.mr.resume(); this.pausedMs += Date.now() - this.pauseAt; this.paused = false; } else { this.mr.pause(); this.pauseAt = Date.now(); this.paused = true; } },
    async note(n) { if (!this.active) return null; const note = { id: newId('NT', 4), t: Math.round(this.elapsed() * 10) / 10, ...n }; this.meta.notes.push(note); await DB.put('recmeta', this.meta, this.recId); return note; },
    stop() {
      return new Promise((resolve) => {
        if (!this.active) return resolve(null);
        const dur = this.elapsed();
        this.mr.onstop = async () => {
          this.stream.getTracks().forEach((t) => t.stop()); cancelAnimationFrame(this.raf); try { this.ac && this.ac.close(); } catch (_) {}
          try { this.wake && this.wake.release(); } catch (_) {} this.wake = null;
          await new Promise((r) => setTimeout(r, 150)); // let the last chunk land
          const item = await assemble(this.recId, this.meta, dur);
          this.active = false; this.paused = false; setNet();
          resolve(item);
        };
        this.mr.stop();
      });
    },
  };
  async function assemble(recId, meta, dur) {
    const parts = await DB.range('chunks', recId + ':');
    if (!parts.length) { await DB.del('recmeta', recId); return null; }
    const blob = new Blob(parts, { type: (meta.mime || 'audio/webm').split(';')[0] });
    const ext = /mp4/.test(blob.type) ? 'm4a' : /ogg/.test(blob.type) ? 'ogg' : 'webm';
    const mid = newId('MD');
    const when = new Date(meta.startedAt);
    const name = `${meta.kind === 'clip' ? 'Answer' : 'Interview'} ${ymd(when)} ${pad2(when.getHours())}${pad2(when.getMinutes())}${meta.recovered ? ' (recovered)' : ''}.${ext}`;
    await DB.put('media', { blob, size: blob.size }, mid);
    await DB.delRange('chunks', recId + ':'); await DB.del('recmeta', recId);
    return { mid, kind: 'audio', name, mime: blob.type, size: blob.size, createdAt: meta.startedAt, personId: meta.personId || '', qid: meta.qid || '', duration: Math.round(dur || meta.duration || 0), notes: meta.notes || [], transcript: '', storyId: meta.storyId };
  }
  async function recoverRecordings() {
    const keys = await DB.keys('recmeta'); let n = 0;
    for (const k of keys) {
      if (Rec.active && k === Rec.recId) continue;
      const meta = await DB.get('recmeta', k); meta.recovered = true;
      const parts = await DB.range('chunks', k + ':');
      const est = Math.max(meta.duration || 0, meta.notes && meta.notes.length ? meta.notes[meta.notes.length - 1].t : 0, parts.length * 4);
      const item = await assemble(k, meta, est);
      if (!item) continue;
      const s = stories.find((x) => x.id === meta.storyId);
      if (s) { s.media.push(item); if (meta.qid && meta.personId) { const a = ((s.answers[meta.personId] = s.answers[meta.personId] || {})[meta.qid] = s.answers[meta.personId][meta.qid] || { text: '', status: '', clips: [] }); a.clips.push(item.mid); } s.updatedAt = new Date().toISOString(); s._dirty = true; await DB.put('stories', s); n++; }
    }
    if (n) toast(`Recovered ${n} recording${n > 1 ? 's' : ''} that was interrupted ✓`, 5000);
  }
  window.addEventListener('beforeunload', (e) => { if (Rec.active) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Rec.active) {
      if (!Rec.wake && 'wakeLock' in navigator) navigator.wakeLock.request('screen').then((w) => (Rec.wake = w)).catch(() => {});
      toast('Still recording ● – keep the app open', 2500);
    }
  });

  /* ============================================================ navigation */
  let tab = 'stories', stab = 'overview';
  function showTab(t) {
    tab = t; S = null; document.body.classList.remove('in-story'); $('#storyTabs').hidden = true; $('#btnBack').hidden = true;
    $$('.screen').forEach((x) => (x.hidden = x.id !== 'screen-' + t));
    $$('#tabbar [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    $('#topTitle').textContent = { stories: 'THP Stories', bank: 'Quote & fact bank', settings: 'Settings' }[t];
    if (t === 'stories') renderStories(); if (t === 'bank') renderBank(); if (t === 'settings') loadSettingsForm();
    window.scrollTo(0, 0);
  }
  $$('#tabbar [data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  async function openStory(id) {
    S = stories.find((s) => s.id === id); if (!S) return;
    document.body.classList.add('in-story'); $('#storyTabs').hidden = false; $('#btnBack').hidden = false;
    localStorage.setItem('stories-open', id);
    history.pushState({ story: id }, '');
    showSt(localStorage.getItem('stories-stab') || 'overview');
  }
  function closeStory() {
    if (Rec.active && !confirm('A recording is running. Leave the story? (It keeps recording.)')) return;
    localStorage.removeItem('stories-open'); flushSave(); showTab('stories');
  }
  $('#btnBack').addEventListener('click', () => history.back());
  window.addEventListener('popstate', () => { if (S) closeStory(); });
  function showSt(t) {
    stab = t; localStorage.setItem('stories-stab', t);
    $$('.screen').forEach((x) => (x.hidden = x.id !== 'st-' + t));
    $$('#storyTabs [data-st]').forEach((b) => b.classList.toggle('on', b.dataset.st === t));
    $('#storyTabs [data-st="record"]').classList.toggle('recording', Rec.active);
    renderStory(); window.scrollTo(0, 0);
  }
  $('#storyTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-st]'); if (b) showSt(b.dataset.st); });
  function renderStory() {
    if (!S) return;
    $('#topTitle').textContent = S.title || (teller().preferred || teller().name) || 'New story';
    ({ overview: renderOverview, interview: renderInterview, record: renderRecord, media: renderMedia, transcribe: renderTranscribe, quotes: renderQuotes, wrap: renderWrap })[stab]();
  }

  /* ============================================================ stories list */
  let statusFilter = 'active';
  function renderStories() {
    const counts = {}; stories.forEach((s) => { if (!s.archived) counts[s.status] = (counts[s.status] || 0) + 1; });
    $('#statusFilters').innerHTML = [['active', 'All active'], ...Q.STATUSES.map((s) => [s, s]), ['archived', 'Archived']]
      .map(([k, l]) => `<button data-f="${k}" class="${k === statusFilter ? 'on' : ''}">${esc(l)}${counts[k] ? ' · ' + counts[k] : ''}</button>`).join('');
    const q = $('#search').value.trim().toLowerCase();
    let list = stories.filter((s) => (statusFilter === 'archived' ? s.archived : !s.archived && (statusFilter === 'active' || s.status === statusFilter)));
    if (q) list = list.filter((s) => [s.title, s.community, s.project, s.status, typeLabel(s), ...(s.themes || []), ...(s.languages || []), ...(s.people || []).map((p) => p.name + ' ' + p.preferred)].join(' ').toLowerCase().includes(q));
    list.sort((a, b) => String(b.date || b.updatedAt).localeCompare(String(a.date || a.updatedAt)));
    $('#storyList').innerHTML = list.map((s) => {
      const t = teller(s); const recs = s.media.filter((m) => m.kind === 'audio').length, pics = s.media.length - recs;
      const answered = Object.values(s.answers || {}).reduce((n, a) => n + Object.values(a).filter((x) => x.text).length, 0);
      const consentBad = (s.people || []).some((p) => p.consentStatus === 'Withdrawn');
      return `<div class="story-card" data-open="${s.id}"><div class="top"><div><b>${esc(s.title || t.preferred || t.name || 'Untitled story')}</b>
        <small>${esc([t.preferred || t.name, s.community, s.project].filter(Boolean).join(' · '))}</small></div><span class="status st-${s.status}">${esc(s.status)}</span></div>
        <div class="meta">${s.date ? `<span>📅 ${niceDate(s.date)}</span>` : ''}<span>✍️ ${answered}</span><span>🎙 ${recs}</span><span>📷 ${pics}</span><span>⭐ ${(s.quotes || []).length}</span>${s._dirty ? '<span>⏳ not synced</span>' : ''}${consentBad ? '<span style="color:var(--danger)">⛔ consent withdrawn</span>' : ''}</div>
        <div class="tags"><span class="tag type">${typeOf(s).icon} ${esc(typeLabel(s))}</span>${(s.themes || []).slice(0, 3).map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div></div>`;
    }).join('') || `<p class="empty-note">${stories.length ? 'No stories match.' : 'No stories yet – tap + to start your first one.'}</p>`;
  }
  $('#statusFilters').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) { statusFilter = b.dataset.f; renderStories(); } });
  $('#search').addEventListener('input', renderStories);
  $('#storyList').addEventListener('click', (e) => { const c = e.target.closest('[data-open]'); if (c) openStory(c.dataset.open); });
  $('#btnNew').addEventListener('click', async () => {
    S = blankStory(); stories.push(S); await touch(false); localStorage.setItem('stories-stab', 'overview'); openStory(S.id);
    setTimeout(() => editPerson(S.people[0].id), 200);
  });

  /* ============================================================ dialog helper */
  function dialog(html, onOk, opts = {}) {
    const d = $('#dlg'), f = $('#dlgForm');
    f.innerHTML = html + `<div class="row2" style="margin-top:14px"><button class="btn" value="cancel" type="button" data-x>Cancel</button><button class="btn primary" value="ok" type="submit">${esc(opts.ok || 'Save')}</button></div>`;
    f.onsubmit = async (e) => { e.preventDefault(); const r = await onOk(f); if (r !== false) d.close(); };
    $('[data-x]', f).onclick = () => d.close();
    d.showModal(); opts.onOpen && opts.onOpen(f);
    setTimeout(() => { const i = f.querySelector('input,textarea,select'); i && i.focus(); }, 50);
  }

  /* ============================================================ OVERVIEW */
  function chipsHtml(list, sel, multi) { return list.map((v) => `<button type="button" data-v="${esc(v)}" class="${(multi ? sel.includes(v) : sel === v) ? 'on' : ''}">${esc(v)}</button>`).join(''); }
  function renderOverview() {
    $$('#st-overview [data-f]').forEach((el) => { el.value = S[el.dataset.f] ?? ''; });
    const ty = typeOf();
    $('#typeCards').innerHTML = Q.TYPES.map((t) => `<button type="button" class="type-card ${t.id === ty.id ? 'on' : ''}" data-type="${t.id}"><span class="ti">${t.icon}</span><b>${esc(t.title)}</b><small>${esc(t.desc)}</small></button>`).join('');
    $('#focusWrap').hidden = !ty.focus;
    if (ty.focus) { $('#focusLabel').textContent = ty.focus.label; $('#focusChips').innerHTML = chipsHtml(ty.focus.options, S.focus, false); }
    $('[data-f="focusOther"]').hidden = !(ty.focus && S.focus === 'Other');
    $('#statusChips').innerHTML = chipsHtml(Q.STATUSES, S.status, false);
    $('#langChips').innerHTML = chipsHtml(Q.LANGS, S.languages, true);
    $('[data-f="langOther"]').hidden = !S.languages.includes('Other');
    $('#themeChips').innerHTML = chipsHtml(Q.THEMES, S.themes, true);
    $('#peopleList').innerHTML = S.people.map((p) => {
      const b = p.consentStatus === 'Withdrawn' ? '<span class="cbadge no">⛔ Withdrawn</span>' : /Active|Modified/.test(p.consentStatus) ? `<span class="cbadge ok">✓ ${esc(p.consentStatus)}</span>` : p.consentSource === 'manual' ? '<span class="cbadge wait">ID not checked</span>' : '<span class="cbadge wait">No consent linked</span>';
      return `<div class="person" data-person="${p.id}"><div class="main"><b>${esc(p.preferred || p.name || '(name)')}</b><small>${esc(p.role)}${p.preferred && p.name && p.preferred !== p.name ? ' · ' + esc(p.name) : ''}${p.consentId ? ' · ' + esc(p.consentId) : ''}</small></div>${b}</div>`;
    }).join('');
    $('#prepList').innerHTML = Q.PREP.map((t, i) => `<div class="ck ${S.prep[i] ? 'done' : ''}" data-prep="${i}"><span class="box">${S.prep[i] ? '✓' : ''}</span><span class="txt">${esc(t)}</span></div>`).join('');
  }
  $('#main').addEventListener('input', (e) => {
    const f = e.target.dataset.f; if (!f || !S) return;
    S[f] = e.target.value; touch();
    if (f === 'title') $('#topTitle').textContent = S.title || 'New story';
  });
  $('#typeCards').addEventListener('click', (e) => {
    const b = e.target.closest('[data-type]'); if (!b || b.dataset.type === S.type) return;
    S.type = b.dataset.type; S.focus = ''; touch(); renderOverview();
    toast(`${typeOf().title}: ${typeOf().sections.filter((x) => !x.forOthers).reduce((n, x) => n + x.qs.length, 0)} guided questions, plus questions for other voices`);
  });
  $('#focusChips').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; S.focus = S.focus === b.dataset.v ? '' : b.dataset.v; touch(); renderOverview(); });
  $('#statusChips').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; S.status = b.dataset.v; touch(); renderOverview(); });
  $('#langChips').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; const v = b.dataset.v; S.languages = S.languages.includes(v) ? S.languages.filter((x) => x !== v) : [...S.languages, v]; touch(); renderOverview(); });
  $('#themeChips').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; const v = b.dataset.v; S.themes = S.themes.includes(v) ? S.themes.filter((x) => x !== v) : [...S.themes, v]; touch(); renderOverview(); });
  $('#prepList').addEventListener('click', (e) => { const c = e.target.closest('[data-prep]'); if (!c) return; const i = c.dataset.prep; S.prep[i] = !S.prep[i]; touch(); renderOverview(); });
  $('#peopleList').addEventListener('click', (e) => { const p = e.target.closest('[data-person]'); if (p) editPerson(p.dataset.person); });
  $('#btnAddPerson').addEventListener('click', () => { const p = { id: newId('PE', 4), name: '', preferred: '', role: S.people.length ? 'Family member' : 'Storyteller', consentId: '', consentStatus: '', consentSource: '' }; S.people.push(p); editPerson(p.id, true); });

  function editPerson(pid, isNew) {
    const p = S.people.find((x) => x.id === pid); if (!p) return;
    let pick = { consentId: p.consentId, consentStatus: p.consentStatus, consentSource: p.consentSource };
    dialog(`<h2>${isNew ? 'Add person' : 'Person'}</h2>
      <div class="field"><span class="label">Find their consent form</span>
        <input type="search" id="cSearch" placeholder="Search name, community or consent ID" autocomplete="off">
        <ul class="picker-results" id="cRes" hidden></ul>
        <p class="hint" id="cPicked"></p>
        <div class="row2"><button type="button" class="btn small" id="cManual">Enter consent ID</button><button type="button" class="btn small" id="cNone">No consent form yet</button></div>
        <small class="hint">${consents.length ? consents.length + ' consent records on this device' : 'Consent list not downloaded yet – sync once while online, or enter the ID.'}</small></div>
      <label class="field">Full name<input name="name" value="${esc(p.name)}" autocapitalize="words"></label>
      <label class="field">Name to use in the story<input name="preferred" value="${esc(p.preferred)}" autocapitalize="words"></label>
      <label class="field">Role<select name="role">${Q.ROLES.map((r) => `<option ${r === p.role ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
      ${!isNew && S.people.length > 1 ? '<button type="button" class="link-btn" id="pDel" style="color:var(--danger)">Remove this person</button>' : ''}`, (f) => {
      if (pick.consentStatus === 'Withdrawn' && !confirm('This person has WITHDRAWN consent. Their story must not be used. Keep them in the story anyway?')) return false;
      p.name = f.elements.name.value.trim(); p.preferred = f.elements.preferred.value.trim() || p.name.split(' ')[0]; p.role = f.elements.role.value; Object.assign(p, pick);
      touch(); renderStory();
    }, {
      onOpen: (f) => {
        const showPick = () => { $('#cPicked', f).innerHTML = pick.consentSource === 'list' ? `✓ Linked to <b>${esc(pick.consentId)}</b> – ${esc(pick.consentStatus)}` : pick.consentSource === 'manual' ? `Consent ID ${esc(pick.consentId)} (not checked)` : pick.consentSource === 'none' ? '⚠ No consent form yet – fill one in the Consent app before publishing.' : ''; };
        showPick();
        $('#cSearch', f).addEventListener('input', (e) => {
          const q = e.target.value.trim().toLowerCase(); const out = $('#cRes', f);
          if (q.length < 2) { out.hidden = true; return; }
          const hits = consents.filter((c) => `${c.name} ${c.preferred} ${c.community} ${c.id}`.toLowerCase().includes(q)).slice(0, 12);
          out.hidden = false;
          out.innerHTML = hits.map((c) => `<li data-c="${esc(c.id)}"><b>${esc(c.name)}</b>${c.preferred ? ' (“' + esc(c.preferred) + '”)' : ''} ${c.status === 'Withdrawn' ? '<span class="cbadge no">Withdrawn</span>' : ''}<br><small>${esc(c.community)} · ${esc(c.date)} · ${esc(c.id)}${c.minor ? ' · under 18' : ''}</small></li>`).join('') || '<li><small>No match</small></li>';
        });
        $('#cRes', f).addEventListener('click', (e) => {
          const li = e.target.closest('[data-c]'); if (!li) return; const c = consents.find((x) => x.id === li.dataset.c);
          pick = { consentId: c.id, consentStatus: c.status || 'Active', consentSource: 'list' };
          f.elements.name.value = c.name || ''; f.elements.preferred.value = c.preferred || ''; if (!S.community) { S.community = c.community; }
          $('#cRes', f).hidden = true; showPick();
        });
        $('#cManual', f).onclick = () => { const id = (prompt('Consent ID (e.g. THP-20261116-QP8KM):') || '').trim().toUpperCase(); if (id) { pick = { consentId: id, consentStatus: 'Not checked', consentSource: 'manual' }; showPick(); } };
        $('#cNone', f).onclick = () => { pick = { consentId: '', consentStatus: 'No consent form', consentSource: 'none' }; showPick(); };
        const del = $('#pDel', f); if (del) del.onclick = () => { if (!confirm('Remove this person and their answers?')) return; S.people = S.people.filter((x) => x.id !== pid); delete S.answers[pid]; touch(); $('#dlg').close(); renderStory(); };
      },
    });
    $('#dlg').addEventListener('close', () => { if (isNew && !p.name) { S.people = S.people.filter((x) => x.id !== pid); renderStory(); } }, { once: true });
  }

  /* ============================================================ INTERVIEW */
  let ivPerson = '';
  function personOptions(sel, current) { sel.innerHTML = S.people.map((p) => `<option value="${p.id}" ${p.id === current ? 'selected' : ''}>${esc(p.preferred || p.name || p.role)} – ${esc(p.role)}</option>`).join(''); }
  function renderInterview() {
    if (!S.people.find((p) => p.id === ivPerson)) ivPerson = teller().id;
    personOptions($('#personSel'), ivPerson);
    const p = S.people.find((x) => x.id === ivPerson) || {}; const isTeller = p.role === 'Storyteller';
    const ans = (S.answers[ivPerson] = S.answers[ivPerson] || {});
    const TS = typeOf().sections; const othersSec = TS.find((s) => s.forOthers);
    const secs = isTeller || !othersSec ? TS.filter((s) => !s.forOthers) : [othersSec, ...TS.filter((s) => !s.forOthers)];
    const typeIds = new Set(TS.flatMap((s) => s.qs.map((q) => q.id)));
    const total = TS.filter((s) => !s.forOthers).reduce((n, s) => n + s.qs.length, 0);
    const doneIds = Object.entries(ans).filter(([qid, a]) => typeIds.has(qid) && (a.text || a.status === 'asked' || (a.clips || []).length)).map(([qid]) => qid);
    const denomIds = isTeller || !othersSec ? null : new Set(othersSec.qs.map((q) => q.id));
    const denom = denomIds ? denomIds.size : total; const done = denomIds ? doneIds.filter((i) => denomIds.has(i)).length : doneIds.filter((i) => !(othersSec && othersSec.qs.some((q) => q.id === i))).length;
    $('#ivBar').style.width = Math.min(100, Math.round((done / Math.max(1, denom)) * 100)) + '%';
    $('#ivProgress').textContent = `${typeOf().icon} ${typeLabel()} · ${done} of ${denom} questions covered for ${p.preferred || p.name || 'this person'}${denomIds ? ' (their questions come first; the main ones are below if useful)' : ''}`;
    const openState = JSON.parse(localStorage.getItem('stories-open-secs') || '{}');
    let n = 0;
    $('#sections').innerHTML = secs.map((sec, si) => {
      const covered = sec.qs.filter((q) => ans[q.id] && (ans[q.id].text || ans[q.id].status === 'asked' || (ans[q.id].clips || []).length)).length;
      const open = openState[sec.id] ?? (si === 0);
      return `<details class="sec" data-sec="${sec.id}" ${open ? 'open' : ''}><summary><span class="ic">${sec.icon}</span><span class="t">${esc(sec.title)}</span><span class="n">${covered}/${sec.qs.length}</span></summary>
        <p class="sec-intro">${esc(sec.intro)}</p>
        ${sec.qs.map((q) => { n++; const a = ans[q.id] || {}; const cls = a.status === 'skipped' ? 'skipped' : (a.text || a.status === 'asked' || (a.clips || []).length) ? 'done' : '';
          return `<div class="q ${cls}" data-q="${q.id}"><div class="qt"><span class="num">${n}</span><span>${esc(q.q)}</span></div>${q.tip ? `<p class="tip">💡 ${esc(q.tip)}</p>` : ''}
            <textarea data-ans="${q.id}" placeholder="Key points / what they said…">${esc(a.text || '')}</textarea>
            <div class="clips">${(a.clips || []).map((mid) => `<div data-clip="${mid}"></div>`).join('')}</div>
            <div class="qa"><button type="button" data-act="asked" class="${a.status === 'asked' ? 'on' : ''}">✓ Asked</button><button type="button" data-act="skipped" class="${a.status === 'skipped' ? 'on' : ''}">Skip</button>
            <button type="button" data-act="clip">🎤 Record answer</button><button type="button" data-act="quote">⭐ Quote</button>${q.fact ? '<button type="button" data-act="fact">📊 Fact</button>' : ''}</div></div>`; }).join('')}</details>`;
    }).join('');
    // audio players for answer recordings
    $$('#sections [data-clip]').forEach(async (el) => { const m = S.media.find((x) => x.mid === el.dataset.clip); if (!m) return; el.innerHTML = await audioHtml(m); fixAudio($('audio', el), m); });
  }
  $('#personSel').addEventListener('change', (e) => { ivPerson = e.target.value; renderInterview(); });
  $('#sections').addEventListener('toggle', (e) => { const d = e.target.closest('details[data-sec]'); if (!d) return; const st = JSON.parse(localStorage.getItem('stories-open-secs') || '{}'); st[d.dataset.sec] = d.open; localStorage.setItem('stories-open-secs', JSON.stringify(st)); }, true);
  $('#sections').addEventListener('input', (e) => {
    const qid = e.target.dataset.ans; if (!qid) return;
    const a = (S.answers[ivPerson][qid] = S.answers[ivPerson][qid] || { text: '', status: '', clips: [] });
    a.text = e.target.value; touch();
    const qd = e.target.closest('.q'); if (a.text) qd.classList.add('done');
  });
  $('#sections').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const qid = b.closest('[data-q]').dataset.q; const ta = $(`[data-ans="${qid}"]`);
    const a = (S.answers[ivPerson][qid] = S.answers[ivPerson][qid] || { text: '', status: '', clips: [] });
    const act = b.dataset.act;
    if (act === 'asked' || act === 'skipped') { a.status = a.status === act ? '' : act; touch(); renderInterview(); }
    if (act === 'quote') { const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd).trim(); quoteDialog({ text: sel || ta.value.trim(), personId: ivPerson }); }
    if (act === 'fact') factDialog({ what: ta.value.trim().slice(0, 140), source: personName(ivPerson) + ' (interview)' });
    if (act === 'clip') clipDialog(qid);
  });
  function clipDialog(qid) {
    if (Rec.active) { toast('Stop the interview recording first – or add a timed note in the Record tab'); return; }
    const q = Q.byId(qid);
    dialog(`<h2>🎤 Record answer</h2><p class="hint">${esc(q.q)}</p><div class="recorder" style="margin:0"><div class="rec-time" id="cTime">0:00</div><div class="level"><div id="cLevel"></div></div><p class="hint" id="cMsg">Recording…</p></div>`, async () => {
      const item = await Rec.stop(); if (!item) return;
      item.personId = ivPerson; item.qid = qid; S.media.push(item);
      const a = (S.answers[ivPerson][qid] = S.answers[ivPerson][qid] || { text: '', status: '', clips: [] }); a.clips.push(item.mid); if (!a.status) a.status = 'asked';
      await touch(false); renderInterview(); toast('Answer recording saved');
    }, { ok: '⏹ Stop & save', onOpen: async () => {
      const ok = await Rec.start({ storyId: S.id, personId: ivPerson, kind: 'clip', qid });
      if (!ok) { $('#dlg').close(); return; }
      Rec.onUpdate = (lv) => { const t = $('#cTime'); if (t) { t.textContent = clock(Rec.elapsed()); $('#cLevel').style.width = Math.round(lv * 100) + '%'; } };
    } });
    $('#dlg').addEventListener('close', async () => { if (Rec.active && Rec.meta && Rec.meta.kind === 'clip') { const item = await Rec.stop(); if (item) { await DB.del('media', item.mid); toast('Recording discarded'); } } }, { once: true });
  }

  /* ============================================================ audio helpers */
  const urls = {};
  async function srcFor(m) {
    if (urls[m.mid]) return urls[m.mid];
    const rec = await DB.get('media', m.mid);
    if (rec && rec.blob) return (urls[m.mid] = URL.createObjectURL(rec.blob));
    return '';
  }
  async function audioHtml(m) {
    const src = await srcFor(m);
    return src ? `<audio controls preload="metadata" src="${src}" data-mid="${m.mid}"></audio>` : (m.url ? `<a href="${esc(m.url)}" target="_blank" rel="noopener">▶ Listen in Google Drive</a>` : '<small>Recording not on this device</small>');
  }
  // recorded WebM files often report an unknown length; nudge the browser to work it out so seeking works
  function fixAudio(a, m) {
    if (!a) return;
    a.addEventListener('loadedmetadata', () => {
      if (a.duration === Infinity || isNaN(a.duration)) {
        const back = () => { a.removeEventListener('timeupdate', back); a.currentTime = 0; };
        a.addEventListener('timeupdate', back); a.currentTime = 1e7;
      }
    }, { once: true });
  }

  /* ============================================================ RECORD */
  let listenTarget = ''; // recording being played back (notes attach to it when not recording)
  function renderRecord() {
    personOptions($('#recPerson'), (Rec.active && Rec.meta && Rec.meta.personId) || teller().id);
    $('#recPerson').disabled = Rec.active;
    $('#markers').innerHTML = Q.MARKERS.map((m) => `<button type="button" data-mk="${m.k}">${m.icon} ${m.label}</button>`).join('');
    recUI();
    renderLiveNotes();
    renderRecList();
  }
  function recUI() {
    const live = Rec.active;
    $('#recBox').classList.toggle('live', live);
    $('#recBtn').hidden = live; $('#recCtl').hidden = !live;
    $('#recPause').textContent = Rec.paused ? '▶ Resume' : '⏸ Pause';
    $('#recMsg').textContent = live ? (Rec.paused ? 'Paused' : '● Recording – keep this app open and the screen on. Saved every few seconds.') : 'Tap to record the interview. Keep this app open while recording.';
    $('#storyTabs [data-st="record"]').classList.toggle('recording', live);
  }
  function renderLiveNotes() {
    const notes = Rec.active ? Rec.meta.notes : listenTarget ? (S.media.find((m) => m.mid === listenTarget) || {}).notes || [] : [];
    const head = Rec.active ? '' : listenTarget ? `<li><small>Adding notes to <b>${esc((S.media.find((m) => m.mid === listenTarget) || {}).name)}</b> at the playback time.</small></li>` : '<li><small>Start recording – or play a recording below – to add timed notes.</small></li>';
    $('#liveNotes').innerHTML = head + notes.slice().reverse().map((n) => `<li><span class="tm">${clock(n.t)}</span><span class="tx">${n.icon ? n.icon + ' ' : ''}${esc(n.text || '')}</span></li>`).join('');
  }
  async function renderRecList() {
    const recs = S.media.filter((m) => m.kind === 'audio');
    if (!recs.length) { $('#recList').innerHTML = '<p class="empty-note">No recordings yet.</p>'; return; }
    const parts = [];
    for (const m of recs.slice().reverse()) {
      parts.push(`<div class="rec-item" data-rec="${m.mid}"><div class="head"><div><b>${esc(m.name)}</b><br><small>${esc(personName(m.personId))}${m.qid ? ' · answer to Q' + esc(m.qid.slice(1)) : ''} · ${clock(m.duration)} · ${fmtSize(m.size || 0)} · ${m.fileId ? '✓ in Drive' : '⏳ not uploaded yet'}</small></div>
        <button class="link-btn inline" data-recdel="${m.mid}">Delete</button></div>${await audioHtml(m)}
        <ul class="notes">${(m.notes || []).map((n) => `<li><button class="tm" data-seek="${n.t}">${clock(n.t)}</button><span class="tx">${n.icon ? n.icon + ' ' : ''}${esc(n.text || '')}</span>${n.k === 'quote' || /⭐/.test(n.icon || '') ? `<button class="link-btn inline act" data-mkquote="${n.id}">→ quote</button>` : ''}</li>`).join('')}</ul></div>`);
    }
    $('#recList').innerHTML = parts.join('');
    $$('#recList audio').forEach((a) => { const m = S.media.find((x) => x.mid === a.dataset.mid); fixAudio(a, m); a.addEventListener('play', () => { listenTarget = m.mid; renderLiveNotes(); }); });
  }
  $('#recBtn').addEventListener('click', async () => {
    const ok = await Rec.start({ storyId: S.id, personId: $('#recPerson').value, kind: 'interview' });
    if (!ok) return;
    Rec.onUpdate = (lv) => { $('#recTime').textContent = clock(Rec.elapsed()); $('#recLevel').style.width = Math.round(Math.min(1, lv * 1.4) * 100) + '%'; };
    if (S.status === 'Planned') { S.status = 'Interviewed'; touch(); }
    recUI(); renderLiveNotes(); setNet();
    netTick = setInterval(setNet, 1000);
  });
  let netTick = 0;
  $('#recPause').addEventListener('click', () => { Rec.pause(); recUI(); });
  $('#recStop').addEventListener('click', async () => {
    const item = await Rec.stop(); clearInterval(netTick);
    if (item) { S.media.push(item); await touch(false); toast(`Recording saved (${clock(item.duration)}) ✓`); listenTarget = item.mid; }
    $('#recTime').textContent = '0:00'; $('#recLevel').style.width = '0';
    renderRecord();
  });
  async function addNote(n) {
    if (Rec.active) { await Rec.note(n); renderLiveNotes(); return; }
    const m = S.media.find((x) => x.mid === listenTarget);
    const a = m && $(`#recList audio[data-mid="${m.mid}"]`);
    if (!m || !a) { toast('Start recording – or play a recording – first'); return; }
    m.notes = m.notes || []; m.notes.push({ id: newId('NT', 4), t: Math.round(a.currentTime * 10) / 10, ...n }); m.notes.sort((x, y) => x.t - y.t);
    touch(); renderLiveNotes(); renderRecList();
  }
  $('#markers').addEventListener('click', (e) => { const b = e.target.closest('[data-mk]'); if (!b) return; const mk = Q.MARKERS.find((x) => x.k === b.dataset.mk); addNote({ k: mk.k, icon: mk.icon, text: $('#noteText').value.trim() || mk.label }); $('#noteText').value = ''; });
  let noteStartT = null; // time when you started typing a note
  $('#noteText').addEventListener('input', () => { if (noteStartT === null && Rec.active) noteStartT = Rec.elapsed(); });
  async function submitNote() {
    const text = $('#noteText').value.trim(); if (!text) return;
    if (Rec.active && noteStartT !== null) { const note = { id: newId('NT', 4), t: Math.round(noteStartT * 10) / 10, text }; Rec.meta.notes.push(note); await DB.put('recmeta', Rec.meta, Rec.recId); renderLiveNotes(); }
    else await addNote({ text });
    $('#noteText').value = ''; noteStartT = null;
  }
  $('#noteAdd').addEventListener('click', submitNote);
  $('#noteText').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitNote(); } });
  $('#recList').addEventListener('click', async (e) => {
    const sk = e.target.closest('[data-seek]');
    if (sk) { const a = $('audio', sk.closest('.rec-item')); if (a) { a.currentTime = +sk.dataset.seek; a.play(); } return; }
    const mq = e.target.closest('[data-mkquote]');
    if (mq) { const m = S.media.find((x) => x.mid === mq.closest('[data-rec]').dataset.rec); const n = m.notes.find((x) => x.id === mq.dataset.mkquote); quoteDialog({ text: n.text && n.text !== 'Great quote' ? n.text : '', personId: m.personId, mid: m.mid, t: n.t }); return; }
    const del = e.target.closest('[data-recdel]');
    if (del) {
      const m = S.media.find((x) => x.mid === del.dataset.recdel);
      if (!confirm(`Delete “${m.name}” from this story?${m.fileId ? ' The copy in Google Drive stays in the story folder.' : ' It has NOT been uploaded – it will be gone for good.'}`)) return;
      S.media = S.media.filter((x) => x.mid !== m.mid); Object.values(S.answers).forEach((a) => Object.values(a).forEach((x) => { x.clips = (x.clips || []).filter((c) => c !== m.mid); }));
      await DB.del('media', m.mid); touch(); renderRecList();
    }
  });

  /* ============================================================ PHOTOS & VIDEO */
  async function shrink(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const s = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
      const t = document.createElement('canvas'); const ts = 220 / Math.max(c.width, c.height); t.width = c.width * ts; t.height = c.height * ts; t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
      return { blob, thumb: t.toDataURL('image/jpeg', 0.7) };
    } finally { URL.revokeObjectURL(url); }
  }
  function videoThumb(blob) {
    return new Promise((res) => {
      const u = URL.createObjectURL(blob); const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.src = u;
      const done = (x) => { URL.revokeObjectURL(u); res(x); }; const tm = setTimeout(() => done(''), 6000);
      v.onloadeddata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 3); };
      v.onseeked = () => { clearTimeout(tm); try { const c = document.createElement('canvas'); const s = 220 / Math.max(v.videoWidth, v.videoHeight); c.width = v.videoWidth * s; c.height = v.videoHeight * s; c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); done(c.toDataURL('image/jpeg', 0.7)); } catch { done(''); } };
      v.onerror = () => { clearTimeout(tm); done(''); };
    });
  }
  document.addEventListener('change', async (e) => {
    const inp = e.target.closest('[data-media]'); if (!inp || !S) return;
    const files = Array.from(inp.files || []); inp.value = '';
    for (const f of files) {
      const isVideo = f.type.startsWith('video');
      if (isVideo && f.size > 800 * 1048576) { toast(`${f.name} is over 800 MB – trim it first`); continue; }
      const mid = newId('MD');
      let blob = f, thumb = '';
      if (isVideo) thumb = await videoThumb(f); else ({ blob, thumb } = await shrink(f));
      await DB.put('media', { blob, size: blob.size }, mid);
      S.media.push({ mid, kind: isVideo ? 'video' : 'image', name: (f.name || mid).replace(/\.\w+$/, '') + (isVideo ? f.name.match(/\.\w+$/)?.[0] || '.mp4' : '.jpg'), mime: blob.type || f.type, size: blob.size, createdAt: new Date().toISOString(), caption: '', consentOk: false, thumb });
    }
    await touch(false); renderMedia(); toast(`${files.length} added – uploads to Drive on sync`);
  });
  function renderMedia() {
    const items = S.media.filter((m) => m.kind !== 'audio');
    $('#mediaList').innerHTML = items.map((m) => `<div class="media-card" data-m="${m.mid}">${m.thumb ? `<img src="${m.thumb}" alt="">` : '<img alt="">'}
      <div><input type="text" data-cap value="${esc(m.caption || '')}" placeholder="Caption – who / what / where (2 personal details max)">
      <div class="row"><label class="check toggle" style="padding:6px 8px;font-size:13.5px"><input type="checkbox" data-consent ${m.consentOk ? 'checked' : ''}><span>Everyone shown has consented</span></label></div>
      <div class="row"><small>${m.kind === 'video' ? '🎥 video · ' : ''}${fmtSize(m.size || 0)} · ${m.fileId ? `<a href="${esc(m.url)}" target="_blank" rel="noopener">in Drive</a>` : '⏳ not uploaded'}</small><button class="link-btn inline" data-mdel>Delete</button></div></div></div>`).join('') || '<p class="empty-note">No photos or videos yet.</p>';
    $('#shotList').innerHTML = S.shots.map((s, i) => `<div class="ck ${s.done ? 'done' : ''}" data-shot="${i}"><span class="box">${s.done ? '✓' : ''}</span><span class="txt">${esc(s.text)}</span></div>`).join('');
  }
  $('#mediaList').addEventListener('input', (e) => { if (!e.target.hasAttribute('data-cap')) return; const m = S.media.find((x) => x.mid === e.target.closest('[data-m]').dataset.m); m.caption = e.target.value; touch(); });
  $('#mediaList').addEventListener('change', (e) => { if (!e.target.hasAttribute('data-consent')) return; const m = S.media.find((x) => x.mid === e.target.closest('[data-m]').dataset.m); m.consentOk = e.target.checked; touch(); });
  $('#mediaList').addEventListener('click', async (e) => {
    const card = e.target.closest('[data-m]'); if (!card) return; const m = S.media.find((x) => x.mid === card.dataset.m);
    if (e.target.closest('[data-mdel]')) {
      if (!confirm(`Delete this ${m.kind}?${m.fileId ? ' The copy in Google Drive stays.' : ' It is not uploaded yet – it will be gone for good.'}`)) return;
      S.media = S.media.filter((x) => x !== m); await DB.del('media', m.mid); touch(); renderMedia(); return;
    }
    if (e.target.tagName === 'IMG') { const src = await srcFor(m); if (src) window.open(src, '_blank'); else if (m.url) window.open(m.url, '_blank'); }
  });
  $('#shotList').addEventListener('click', (e) => { const c = e.target.closest('[data-shot]'); if (!c) return; const s = S.shots[+c.dataset.shot]; s.done = !s.done; touch(); renderMedia(); });

  /* ============================================================ TRANSCRIBE */
  let trMid = '';
  async function renderTranscribe() {
    const recs = S.media.filter((m) => m.kind === 'audio');
    if (!recs.find((m) => m.mid === trMid)) trMid = (recs.find((m) => m.kind === 'audio' && !m.qid) || recs[0] || {}).mid || '';
    $('#trRec').innerHTML = recs.map((m) => `<option value="${m.mid}" ${m.mid === trMid ? 'selected' : ''}>${esc(m.name)} (${clock(m.duration)})${m.transcript ? ' ✓' : ''}</option>`).join('') || '<option>No recordings yet</option>';
    const m = recs.find((x) => x.mid === trMid);
    $('#trPlayer').style.opacity = m ? 1 : 0.5;
    const a = $('#trAudio');
    if (m) {
      const src = await srcFor(m);
      if (a.dataset.mid !== m.mid) { a.src = src; a.dataset.mid = m.mid; fixAudio(a, m); if (!src) toast(m.url ? 'This recording is only in Google Drive – download it to transcribe on this device' : 'Recording not on this device', 4000); }
      $('#trText').value = m.transcript || '';
      $('#trNotes').innerHTML = (m.notes || []).map((n) => `<button data-seek="${n.t}">${clock(n.t)} ${n.icon || ''} ${esc((n.text || '').slice(0, 24))}</button>`).join('');
      $('#trDur').textContent = clock(m.duration);
    } else { $('#trText').value = ''; $('#trNotes').innerHTML = ''; }
  }
  const trA = $('#trAudio');
  const trDuration = () => (isFinite(trA.duration) && trA.duration > 0 ? trA.duration : ((S && S.media.find((x) => x.mid === trMid)) || {}).duration || 0);
  trA.addEventListener('timeupdate', () => { $('#trNow').textContent = clock(trA.currentTime); const d = trDuration(); if (d) $('#trSeek').value = (trA.currentTime / d) * 100; });
  trA.addEventListener('play', () => ($('#trPlay').textContent = '⏸ Pause'));
  trA.addEventListener('pause', () => ($('#trPlay').textContent = '▶ Play'));
  $('#trSeek').addEventListener('input', (e) => { const d = trDuration(); if (d) trA.currentTime = (e.target.value / 100) * d; });
  const trToggle = () => { if (!trA.src) return; if (trA.paused) { if ($('#trAutoBack').checked) trA.currentTime = Math.max(0, trA.currentTime - 2); trA.play(); } else trA.pause(); };
  const trJump = (s) => { trA.currentTime = Math.max(0, trA.currentTime + s); };
  $('#trPlay').addEventListener('click', trToggle);
  $('#trBack').addEventListener('click', () => trJump(-5));
  $('#trFwd').addEventListener('click', () => trJump(5));
  $('#trSpeeds').addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (!b) return; trA.playbackRate = +b.dataset.r; $$('#trSpeeds button').forEach((x) => x.classList.toggle('on', x === b)); });
  $('#trRec').addEventListener('change', (e) => { trMid = e.target.value; trA.pause(); renderTranscribe(); });
  $('#trNotes').addEventListener('click', (e) => { const b = e.target.closest('[data-seek]'); if (b) { trA.currentTime = +b.dataset.seek; trA.play(); } });
  function stamp() { const ta = $('#trText'); const s = `[${clock(trA.currentTime)}] `; const p = ta.selectionStart; ta.value = ta.value.slice(0, p) + s + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = p + s.length; ta.focus(); saveTranscript(); }
  $('#trStamp').addEventListener('click', stamp);
  let trT;
  function saveTranscript() { const m = S && S.media.find((x) => x.mid === trMid); if (!m) return; m.transcript = $('#trText').value; clearTimeout(trT); trT = setTimeout(() => { if (m.transcript && S.status === 'Interviewed') S.status = 'Transcribed'; touch(); }, 600); }
  $('#trText').addEventListener('input', saveTranscript);
  document.addEventListener('keydown', (e) => {
    if (!S || stab !== 'transcribe') return;
    if (e.key === 'Escape') { e.preventDefault(); trToggle(); }
    if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); trJump(-5); }
    if ((e.ctrlKey || e.metaKey) && e.key === '.') { e.preventDefault(); trJump(5); }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'j' || e.key === 'J')) { e.preventDefault(); stamp(); }
  });

  /* ============================================================ QUOTES & FACTS */
  function quoteDialog(init = {}) {
    const q = { id: '', text: '', translation: '', language: (S.languages[0] || 'English'), personId: teller().id, mid: '', t: null, ...init };
    const recs = S.media.filter((m) => m.kind === 'audio');
    dialog(`<h2>⭐ ${q.id ? 'Edit' : 'Add'} quote</h2>
      <label class="field">In their own words<textarea name="text" rows="3">${esc(q.text)}</textarea></label>
      <label class="field">Language<select name="language">${Q.LANGS.filter((l) => l !== 'Other').concat(S.langOther ? [S.langOther] : []).map((l) => `<option ${l === q.language ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <label class="field">English translation <small>(if not in English)</small><textarea name="translation" rows="2">${esc(q.translation)}</textarea></label>
      <label class="field">Said by<select name="personId">${S.people.map((p) => `<option value="${p.id}" ${p.id === q.personId ? 'selected' : ''}>${esc(p.preferred || p.name)}</option>`).join('')}</select></label>
      <div class="row2"><label class="field">Recording<select name="mid"><option value="">—</option>${recs.map((m) => `<option value="${m.mid}" ${m.mid === q.mid ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
      <label class="field">At (mm:ss)<input name="t" value="${q.t != null ? clock(q.t) : ''}" placeholder="12:43"></label></div>`, (f) => {
      const text = f.elements.text.value.trim(); if (!text) { toast('Type the quote'); return false; }
      const tv = f.elements.t.value.trim(); const parts = tv.split(':').map(Number); const t = tv && parts.every((x) => !isNaN(x)) ? parts.reduce((a, x) => a * 60 + x, 0) : null;
      const item = { id: q.id || newId('QT', 4), text, translation: f.elements.translation.value.trim(), language: f.elements.language.value, personId: f.elements.personId.value, mid: f.elements.mid.value, t };
      const i = S.quotes.findIndex((x) => x.id === item.id); if (i >= 0) S.quotes[i] = item; else S.quotes.push(item);
      touch(); toast('Quote saved ⭐'); if (stab === 'quotes') renderQuotes();
    });
  }
  function factDialog(init = {}) {
    const f0 = { id: '', figure: '', what: '', source: '', checkedBy: '', ...init };
    dialog(`<h2>📊 ${f0.id ? 'Edit' : 'Add'} fact</h2>
      <label class="field">Figure<input name="figure" value="${esc(f0.figure)}" placeholder="e.g. 150 · GHS 4,200 · 3 groups"></label>
      <label class="field">What it means<input name="what" value="${esc(f0.what)}" placeholder="e.g. women in the savings group"></label>
      <label class="field">Source<input name="source" value="${esc(f0.source)}" placeholder="e.g. storyteller · programme records"></label>
      <label class="field">Checked by<input name="checkedBy" value="${esc(f0.checkedBy)}" placeholder="who confirmed it (leave empty if not yet)"></label>`, (f) => {
      const item = { id: f0.id || newId('FC', 4), figure: f.elements.figure.value.trim(), what: f.elements.what.value.trim(), source: f.elements.source.value.trim(), checkedBy: f.elements.checkedBy.value.trim() };
      if (!item.figure) { toast('Add the figure'); return false; }
      const i = S.facts.findIndex((x) => x.id === item.id); if (i >= 0) S.facts[i] = item; else S.facts.push(item);
      touch(); toast('Fact saved 📊'); if (stab === 'quotes') renderQuotes();
    });
  }
  function renderQuotes() {
    $('#quoteList').innerHTML = S.quotes.map((q) => `<div class="quote-card" data-qt="${q.id}"><p>“${esc(q.text)}”</p>${q.translation ? `<p class="tr">“${esc(q.translation)}”</p>` : ''}
      <small>— ${esc(personName(q.personId))} · ${esc(q.language)}${q.t != null ? ' · at ' + clock(q.t) : ''}</small>
      <div class="acts">${q.mid && q.t != null ? '<button class="link-btn inline" data-qplay>▶ Play</button>' : ''}<button class="link-btn inline" data-qedit>Edit</button><button class="link-btn inline" data-qdel>Delete</button></div></div>`).join('') || '<p class="empty-note">No quotes yet – tap ⭐ in the interview, or a ⭐ note in Record.</p>';
    $('#factList').innerHTML = S.facts.map((f) => `<div class="fact-card" data-fc="${f.id}"><b>${esc(f.figure)}</b><div style="flex:1"><div>${esc(f.what)}</div><small>${esc(f.source)}${f.checkedBy ? ' · ✓ checked by ' + esc(f.checkedBy) : ' · not checked yet'}</small></div><button class="link-btn inline" data-fedit>Edit</button></div>`).join('') || '<p class="empty-note">No facts yet.</p>';
  }
  $('#btnAddQuote').addEventListener('click', () => quoteDialog());
  $('#btnAddFact').addEventListener('click', () => factDialog());
  $('#quoteList').addEventListener('click', async (e) => {
    const c = e.target.closest('[data-qt]'); if (!c) return; const q = S.quotes.find((x) => x.id === c.dataset.qt);
    if (e.target.closest('[data-qedit]')) quoteDialog(q);
    if (e.target.closest('[data-qdel]') && confirm('Delete this quote?')) { S.quotes = S.quotes.filter((x) => x !== q); touch(); renderQuotes(); }
    if (e.target.closest('[data-qplay]')) { const m = S.media.find((x) => x.mid === q.mid); const src = m && await srcFor(m); if (!src) { toast('Recording not on this device'); return; } const a = new Audio(src); a.currentTime = Math.max(0, q.t - 2); a.play(); toast('Playing from ' + clock(q.t)); }
  });
  $('#factList').addEventListener('click', (e) => { const c = e.target.closest('[data-fc]'); if (c && e.target.closest('[data-fedit]')) factDialog(S.facts.find((x) => x.id === c.dataset.fc)); });

  /* ============================================================ WRAP UP + GOOGLE DOC */
  function renderWrap() {
    $$('#st-wrap [data-f]').forEach((el) => { el.value = S[el.dataset.f] ?? ''; });
    const answered = Object.values(S.answers || {}).reduce((n, a) => n + Object.values(a).filter((x) => x.text).length, 0);
    const recs = S.media.filter((m) => m.kind === 'audio'); const trans = recs.filter((m) => m.transcript).length;
    const pics = S.media.filter((m) => m.kind !== 'audio'); const noConsentPics = pics.filter((m) => !m.consentOk).length;
    const bad = S.people.filter((p) => !/Active|Modified/.test(p.consentStatus || ''));
    $('#wrapSummary').innerHTML = `<h2>Story so far</h2><dl class="review">${[
      ['Type', typeLabel()], ['People', S.people.map((p) => p.preferred || p.name).join(', ')], ['Answers written', answered], ['Recordings', `${recs.length} (${trans} transcribed)`],
      ['Photos & videos', `${pics.length}${noConsentPics ? ` – ⚠ ${noConsentPics} without consent tick` : ''}`], ['Quotes', S.quotes.length], ['Facts', `${S.facts.length} (${S.facts.filter((f) => f.checkedBy).length} checked)`],
      ['Consent', bad.length ? '⚠ check: ' + bad.map((p) => (p.preferred || p.name) + ' – ' + (p.consentStatus || 'not linked')).join(', ') : '✓ all linked'],
      ['Synced', S._dirty ? '⏳ changes waiting' : '✓ in Google'],
    ].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
    $('#lnkDoc').hidden = !S.docUrl; if (S.docUrl) $('#lnkDoc').href = S.docUrl;
    $('#lnkFolder').hidden = !S.folderUrl; if (S.folderUrl) $('#lnkFolder').href = S.folderUrl;
    $('#btnArchive').textContent = S.archived ? 'Restore story' : 'Archive story';
  }
  $('#btnDoc').addEventListener('click', async () => {
    if (!settings.url) { toast('Connect to Google in Settings first'); return; }
    if (!navigator.onLine) { toast('You need internet to create the Google Doc'); return; }
    const b = $('#btnDoc'); b.disabled = true; b.textContent = 'Syncing story…';
    try {
      await flushSave(); await syncAll();
      if (S._dirty) throw new Error(syncErr || 'Story not synced yet – try again');
      b.textContent = 'Creating the story file… (up to a minute)';
      const secs = typeOf().sections.slice(); const inType = new Set(secs.flatMap((x) => x.qs.map((q) => q.id)));
      const extra = [...new Set(Object.values(S.answers || {}).flatMap((a) => Object.keys(a).filter((qid) => !inType.has(qid) && (a[qid].text || (a[qid].clips || []).length))))].map(Q.byId).filter(Boolean);
      if (extra.length) secs.push({ id: 'extra', title: 'Other answers (from another question set)', qs: extra });
      const j = await post({ kind: 'makeDoc', id: S.id, sections: secs, outline: typeOf().outline, typeLabel: typeLabel() });
      S.docUrl = j.docUrl; await DB.put('stories', S);
      renderWrap(); toast('Story file ready in Google Docs ✓'); window.open(j.docUrl, '_blank');
    } catch (e) { toast('Could not create the doc: ' + e.message, 5000); }
    finally { b.disabled = false; b.textContent = '📄 Create story file in Google Docs'; }
  });
  $('#btnArchive').addEventListener('click', async () => {
    if (!S.archived && !confirm('Archive this story? It moves to “Archived” (nothing is deleted).')) return;
    S.archived = !S.archived; await touch(false); toast(S.archived ? 'Archived' : 'Restored'); history.back();
  });

  /* ============================================================ QUOTE & FACT BANK */
  let bankSeg = 'quotes';
  function renderBank() {
    $$('#bankSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === bankSeg));
    const q = $('#bankSearch').value.trim().toLowerCase();
    const live = stories.filter((s) => !s.archived);
    if (bankSeg === 'quotes') {
      let list = live.flatMap((s) => s.quotes.map((x) => ({ ...x, s })));
      if (q) list = list.filter((x) => [x.text, x.translation, personName(x.personId, x.s), x.s.community, x.s.project, ...(x.s.themes || [])].join(' ').toLowerCase().includes(q));
      $('#bankList').innerHTML = list.map((x) => `<div class="quote-card" data-open="${x.s.id}"><p>“${esc(x.text)}”</p>${x.translation ? `<p class="tr">“${esc(x.translation)}”</p>` : ''}
        <small>— ${esc(personName(x.personId, x.s))}, ${esc(x.s.community)} · ${esc(x.language)}</small>
        <div class="tags" style="margin-top:6px">${(x.s.themes || []).slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
        <div class="acts"><button class="link-btn inline" data-copy="${esc(x.text)}">Copy</button><button class="link-btn inline">Open story</button></div></div>`).join('') || '<p class="empty-note">No quotes yet.</p>';
    } else {
      let list = live.flatMap((s) => s.facts.map((x) => ({ ...x, s })));
      if (q) list = list.filter((x) => [x.figure, x.what, x.source, x.s.community, x.s.project].join(' ').toLowerCase().includes(q));
      $('#bankList').innerHTML = list.map((x) => `<div class="fact-card" data-open="${x.s.id}"><b>${esc(x.figure)}</b><div style="flex:1"><div>${esc(x.what)}</div><small>${esc(x.s.community)} · ${esc(x.source)}${x.checkedBy ? ' · ✓ ' + esc(x.checkedBy) : ' · not checked'}</small></div></div>`).join('') || '<p class="empty-note">No facts yet.</p>';
    }
  }
  $('#bankSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { bankSeg = b.dataset.v; renderBank(); } });
  $('#bankSearch').addEventListener('input', renderBank);
  $('#bankList').addEventListener('click', async (e) => {
    const cp = e.target.closest('[data-copy]'); if (cp) { e.stopPropagation(); try { await navigator.clipboard.writeText(cp.dataset.copy); toast('Quote copied'); } catch { toast('Could not copy'); } return; }
    const c = e.target.closest('[data-open]'); if (c) { localStorage.setItem('stories-stab', 'quotes'); openStory(c.dataset.open); }
  });

  /* ============================================================ SETTINGS */
  function loadSettingsForm() { $('#setUrl').value = settings.url; $('#setKey').value = settings.key; $('#setName').value = settings.name; $('#setProjects').value = settings.projects; $('#testMsg').textContent = ''; setNet(); }
  const readSettings = () => { settings.url = $('#setUrl').value.trim(); settings.key = $('#setKey').value.trim(); settings.name = $('#setName').value.trim(); settings.projects = $('#setProjects').value.trim(); };
  $('#btnSaveSettings').addEventListener('click', () => { readSettings(); saveSettings(); fillLists(); toast('Settings saved'); showTab('stories'); syncAll(); });
  $('#btnTest').addEventListener('click', async () => {
    readSettings(); const m = $('#testMsg'); m.textContent = 'Testing…';
    try {
      const u = new URL(settings.url); u.searchParams.set('action', 'ping'); u.searchParams.set('key', settings.key);
      const j = await (await fetch(u, { redirect: 'follow' })).json();
      m.textContent = !j.ok ? '✗ ' + j.error : !j.keyValid ? '✗ Connected, but the key is wrong.' : j.consent ? '✓ Connected – consent register linked.' : '✓ Connected. (Consent register not linked yet – see SETUP.md.)';
    } catch { m.textContent = '✗ Could not reach the upload link.'; }
  });

  /* ============================================================ BOOT */
  history.replaceState({ home: 1 }, '');
  (async () => {
    await loadLocal();
    await recoverRecordings(); stories = await DB.all('stories');
    const open = localStorage.getItem('stories-open');
    showTab('stories');
    if (open && stories.find((s) => s.id === open)) openStory(open);
    setNet();
    if (!settings.url) toast('Open Settings to connect to Google', 4000);
    syncAll();
  })();
  if ('serviceWorker' in navigator && location.hostname !== 'localhost') navigator.serviceWorker.register('sw.js').then((r) => r.update()).catch(() => {});
})();
