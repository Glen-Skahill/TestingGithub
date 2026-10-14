/* Walk in Light — app logic. Vanilla JS, no build step, no server, no cost.
 * State is saved to localStorage; export/import JSON for backups. */
(function () {
  'use strict';
  const SEED = window.WIL_SEED;
  const KEY = 'wil.state.v1';
  const XP = { S: 10, M: 25, L: 50 };
  const $ = (s, el) => (el || document).querySelector(s);
  const uid = (p) => (p || 'x') + '-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  const today = () => new Date().toISOString().slice(0, 10);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ───────────── state ───────────── */
  let S = load();
  const UI = { tab: 'home', sub: {}, open: new Set(), timeFilter: null, bibleFilter: 'all', bibleQuery: '' };

  function fresh() {
    return {
      v: 1, seedVersion: SEED.version, created: today(),
      pillars: JSON.parse(JSON.stringify(SEED.pillars)).map((p) => ({ ...p, milestones: p.milestones.map((m) => ({ ...m, tasks: m.tasks.map(seedTask) })) })),
      items: JSON.parse(JSON.stringify(SEED.items)),
      bible: JSON.parse(JSON.stringify(SEED.bible)),
      inbox: [], focus: null, log: [],
      settings: { glow: 'on', fs: 20, wake: '' },
    };
  }
  function seedTask(t) { return { ...t, status: 'todo', notes: '', doneAt: null, seeded: true, edited: false }; }
  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (e) { console.warn('load failed', e); }
    return fresh();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('SAVE FAILED: STORAGE FULL?'); } }
  function commit() { save(); render(); }

  /* Merge a newer seed: add missing content, refresh guides on untouched seeded tasks, keep all progress. */
  function mergeSeed() {
    let added = 0, refreshed = 0;
    SEED.pillars.forEach((sp) => {
      let p = S.pillars.find((x) => x.id === sp.id);
      if (!p) { p = { ...sp, milestones: [] }; S.pillars.push(p); }
      ['name', 'short', 'color', 'icon', 'tagline', 'intro', 'pipeline'].forEach((k) => { if (sp[k] != null) p[k] = sp[k]; });
      sp.milestones.forEach((sm) => {
        let m = p.milestones.find((x) => x.id === sm.id);
        if (!m) { m = { id: sm.id, name: sm.name, tasks: [] }; p.milestones.push(m); }
        sm.tasks.forEach((st) => {
          const t = m.tasks.find((x) => x.id === st.id);
          if (!t) { m.tasks.push(seedTask(st)); added++; }
          else if (t.seeded && !t.edited) { t.title = st.title; t.guide = st.guide; t.size = st.size; refreshed++; }
        });
      });
    });
    SEED.items.forEach((si) => { if (!S.items.find((x) => x.id === si.id)) { S.items.push({ ...si }); added++; } });
    SEED.bible.forEach((sb) => { if (!S.bible.find((x) => x.id === sb.id)) { S.bible.push(JSON.parse(JSON.stringify(sb))); added++; } });
    S.seedVersion = SEED.version;
    commit();
    toast(`MERGED: +${added} NEW, ${refreshed} REFRESHED`);
  }

  /* ───────────── derived ───────────── */
  const allTasks = () => S.pillars.flatMap((p) => p.milestones.flatMap((m) => m.tasks.map((t) => ({ t, m, p }))));
  const findTask = (id) => allTasks().find((x) => x.t.id === id);
  const pillar = (id) => S.pillars.find((p) => p.id === id);
  const xp = () => allTasks().filter((x) => x.t.status === 'done').reduce((a, x) => a + (XP[x.t.size] || 10), 0);
  function level(x) { let l = 1, need = 100; while (x >= need) { x -= need; l++; need = Math.round(need * 1.3); } return { l, into: x, need }; }
  function streak() {
    const days = new Set(S.log.map((e) => e.at.slice(0, 10)));
    let n = 0; const d = new Date();
    if (!days.has(today())) d.setDate(d.getDate() - 1);
    while (days.has(d.toISOString().slice(0, 10))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  const pct = (list) => list.length ? Math.round(100 * list.filter((t) => t.status === 'done').length / list.length) : 0;
  const sizeOk = (t) => !UI.timeFilter || (UI.timeFilter === 15 ? t.size === 'S' : UI.timeFilter === 45 ? t.size !== 'L' : true);
  function nextUp(p) {
    const open = p.milestones.flatMap((m) => m.tasks.filter((t) => t.status !== 'done').map((t) => ({ t, m })));
    return open.find((x) => x.t.status === 'doing' && sizeOk(x.t)) || open.find((x) => sizeOk(x.t)) || null;
  }
  function verseOfDay() {
    const n = Math.floor(Date.now() / 86400000);
    return SEED.verses[n % SEED.verses.length];
  }
  const colorVar = (c) => ({ gold: 'var(--gold)', magenta: 'var(--mag)', cyan: 'var(--cyan)', violet: 'var(--violet)' }[c] || 'var(--cyan)');
  const colorClass = (c) => ({ gold: 'gold', magenta: 'mag', cyan: 'cyan', violet: 'violet' }[c] || 'cyan');

  /* ───────────── tiny markdown ───────────── */
  function md(src) {
    const lines = String(src || '').split('\n'); let out = '', list = null;
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/`(.+?)`/g, '<span class="kbd">$1</span>').replace(/(https?:\/\/[^\s)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    const close = () => { if (list) { out += `</${list}>`; list = null; } };
    lines.forEach((ln) => {
      let m;
      if ((m = ln.match(/^\s*[-•]\s+(.*)/))) { if (list !== 'ul') { close(); out += '<ul>'; list = 'ul'; } out += `<li>${inline(m[1])}</li>`; }
      else if ((m = ln.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); out += '<ol>'; list = 'ol'; } out += `<li>${inline(m[1])}</li>`; }
      else if (ln.trim() === '') { close(); }
      else { close(); out += `<p>${inline(ln)}</p>`; }
    });
    close(); return out;
  }

  /* ───────────── icons (pixel SVG) ───────────── */
  const ICON = {
    home: '<svg viewBox="0 0 12 12"><path fill="currentColor" d="M5 1h2v1h1v1h1v1h1v1h1v1h-1v5H7V8H5v3H2V6H1V5h1V4h1V3h1V2h1z"/></svg>',
    cross: '<svg viewBox="0 0 12 12"><path fill="currentColor" d="M5 0h2v3h3v2H7v7H5V5H2V3h3z"/></svg>',
    lamp: '<svg viewBox="0 0 12 12"><path fill="currentColor" d="M4 0h4v1h1v1h1v3H9v1H8v1H4V6H3V5H2V2h1V1h1zM4 8h4v1H4zM5 10h2v2H5z"/></svg>',
    play: '<svg viewBox="0 0 12 12"><path fill="currentColor" d="M1 1h7v1h1v1h1v1h1v4h-1v1H9v1H8v1H1zM3 3v6h1V8h1V7h1V6h1V5H6V4H5V3z"/></svg>',
    eye: '<svg viewBox="0 0 12 12"><path fill="currentColor" d="M3 3h6v1h1v1h1v2h-1v1H9v1H3V8H2V7H1V5h1V4h1zM5 5v2h2V5z"/></svg>',
  };
  const crossImg = '<svg class="cross" viewBox="0 0 12 12"><path fill="#ffd166" d="M5 0h2v3h3v2H7v7H5V5H2V3h3z"/></svg>';

  /* ───────────── render ───────────── */
  function render() {
    document.documentElement.dataset.glow = S.settings.glow === 'off' ? 'off' : 'on';
    document.documentElement.style.setProperty('--fs', (S.settings.fs || 20) + 'px');
    const app = $('#app');
    const view = UI.tab === 'home' ? renderHome() : renderPillar(pillar(UI.tab));
    app.innerHTML = renderTop() + view;
    $('#nav').innerHTML = ['home', 'story', 'teach', 'lens', 'base'].map((id) => {
      const p = id === 'home' ? { name: 'Home', icon: 'home', color: 'gold' } : pillar(id);
      return `<button data-action="tab" data-tab="${id}" class="${UI.tab === id ? 'on' : ''}" style="--c:${colorVar(p.color)}">${ICON[p.icon] || ICON.home}<span>${esc(p.short || p.name)}</span></button>`;
    }).join('');
    window.scrollTo(0, UI.scrollKeep || 0); UI.scrollKeep = 0;
  }
  function renderTop() {
    return `<header class="topbar">
      <img class="logo" src="icons/icon-192.png" alt="">
      <h1>Walk in Light<small>${UI.tab === 'home' ? 'PROGRESS CONSOLE' : esc(pillar(UI.tab).name)}</small></h1>
      <button class="iconbtn" data-action="playbook" title="Playbook">📖</button>
      <button class="iconbtn" data-action="settings" title="Settings">⚙</button>
    </header>`;
  }

  function renderHome() {
    const v = verseOfDay(); const x = xp(); const lv = level(x); const st = streak();
    const done = allTasks().filter((a) => a.t.status === 'done'); const total = allTasks().length;
    const focus = S.focus && findTask(S.focus);
    const recent = S.log.slice(-5).reverse().map((e) => findTask(e.taskId)).filter(Boolean);
    const installHint = !S.settings.hideInstall && !window.matchMedia('(display-mode: standalone)').matches && !navigator.standalone;
    return `
    <section class="verse"><div class="text">${crossImg}${esc(v.text)}</div><div class="ref">${esc(v.ref)}</div></section>
    ${installHint ? `<section class="panel install"><div class="row between"><h2 class="c-cyan">Install on iPhone (free)</h2><button class="btn ghost" data-action="hide-install" style="padding:4px 8px">✕</button></div><div class="small">In Safari tap <b>Share</b> → <b>Add to Home Screen</b>. It runs offline, full screen, no App Store, no cost. Your data stays on this phone; export a backup monthly in Settings.</div></section>` : ''}
    <section class="panel gold">
      <div class="xp"><span class="level">LV ${lv.l}</span><div class="bar"><i style="--c:var(--gold);width:${Math.round(100 * lv.into / lv.need)}%"></i></div><span class="tiny c-gold">${lv.into}/${lv.need}</span></div>
      <div class="row between mt small"><span>LIGHT: <b class="c-gold">${x} XP</b></span><span>STREAK: <b class="c-cyan">${st} day${st === 1 ? '' : 's'}</b></span><span>${done.length}/${total} DONE</span></div>
    </section>
    <section class="panel">
      <div class="row between"><h2>I have…</h2><span class="tiny dim">${UI.timeFilter ? UI.timeFilter + ' MIN' : 'ANY TIME'}</span></div>
      <div class="chips">${[[15, '15 MIN'], [45, '45 MIN'], [120, 'A DEEP BLOCK']].map(([n, l]) => `<button class="chip ${UI.timeFilter === n ? 'on' : ''}" data-action="time" data-n="${n}">${l}</button>`).join('')}</div>
    </section>
    ${focus ? `<section class="panel mag"><h2 class="c-mag">★ This week's focus</h2>${taskRow(focus.t, focus.p, true)}</section>` : ''}
    <section class="panel cyan">
      <h2 class="c-cyan">Next up, one per pillar</h2>
      ${S.pillars.map((p) => { const n = nextUp(p); return `<div class="mt"><h3 style="color:${colorVar(p.color)}">${esc(p.name)}</h3>${n ? taskRow(n.t, p, true) : `<div class="dim small">Nothing ${UI.timeFilter ? 'this size' : 'left'} here. ${UI.timeFilter ? 'Try a longer slot.' : 'Add tasks or celebrate.'}</div>`}</div>`; }).join('')}
    </section>
    <section class="panel">
      <h2>Inbox: capture an idea</h2>
      <form data-action="inbox-add" class="row"><input type="text" name="text" placeholder="Idea, line, scene, title…" autocomplete="off"><button class="btn gold" type="submit">+</button></form>
      ${S.inbox.length ? S.inbox.map((i) => `<div class="inbox-item"><span class="grow">${esc(i.text)}</span><select data-action="inbox-move" data-id="${i.id}" style="width:auto"><option value="">→ task</option>${S.pillars.map((p) => `<option value="${p.id}">${esc(p.short)}</option>`).join('')}<option value="bible">BIBLE</option></select><button class="btn ghost" data-action="inbox-del" data-id="${i.id}">✕</button></div>`).join('') : '<div class="dim small mt">Empty. Ideas go here in five seconds; decide on them in the weekly review.</div>'}
    </section>
    <section class="panel">
      <h2>Pillars</h2>
      ${S.pillars.map((p) => { const ts = p.milestones.flatMap((m) => m.tasks); return `<button class="task" style="width:100%;background:none;border:0;border-bottom:1px dashed var(--line);color:inherit" data-action="tab" data-tab="${p.id}"><span class="box" style="border-color:${colorVar(p.color)};color:${colorVar(p.color)}">${pct(ts)}</span><span class="title"><b>${esc(p.name)}</b><span class="meta">${esc(p.tagline)}</span><span class="bar mt" style="height:8px"><i style="--c:${colorVar(p.color)};width:${pct(ts)}%"></i></span></span></button>`; }).join('')}
    </section>
    ${recent.length ? `<section class="panel"><h2 class="c-cyan">Recent wins</h2>${recent.map((r) => `<div class="small">✓ ${esc(r.t.title)} <span class="dim">· ${esc(r.p.short)}</span></div>`).join('')}</section>` : ''}
    <div class="dim small" style="text-align:center">Walk as children of light. · v${S.v}.${SEED.version}</div>`;
  }

  function taskRow(t, p, showPillar) {
    const mark = t.status === 'done' ? '✓' : t.status === 'doing' ? '…' : '';
    return `<div class="task ${t.status}">
      <button class="box" data-action="cycle" data-id="${t.id}" aria-label="status">${mark}</button>
      <button class="title" data-action="open-task" data-id="${t.id}">${esc(t.title)}${showPillar ? `<span class="meta">${esc(p.short)} · ${esc(findTask(t.id).m.name)}${t.notes ? ' · 📝' : ''}</span>` : (t.notes ? '<span class="meta">📝 notes</span>' : '')}</button>
      ${S.focus === t.id ? '<span class="pin">★</span>' : ''}<span class="size ${t.size}">${t.size}</span>
    </div>`;
  }

  function renderPillar(p) {
    const subs = [['steps', 'STEPS']]; if (p.pipeline) subs.push(['pipe', SEED.pipelines[p.pipeline].label.toUpperCase()]); if (p.id === 'story') subs.push(['bible', 'BIBLE']);
    const sub = UI.sub[p.id] || 'steps'; const ts = p.milestones.flatMap((m) => m.tasks); const cc = colorClass(p.color);
    let body = '';
    if (sub === 'steps') body = renderSteps(p);
    else if (sub === 'pipe') body = renderPipeline(p);
    else body = renderBible();
    return `<section class="panel ${cc}"><div class="skyline"></div><h2 style="color:${colorVar(p.color)}">${esc(p.name)}</h2><div class="small">${esc(p.tagline)}</div><div class="bar mt"><i style="--c:${colorVar(p.color)};width:${pct(ts)}%"></i></div><div class="row between small mt"><span>${ts.filter((t) => t.status === 'done').length}/${ts.length} steps</span><span>${pct(ts)}%</span></div></section>
    ${subs.length > 1 ? `<div class="subtabs" style="--c:${colorVar(p.color)}">${subs.map(([k, l]) => `<button class="${sub === k ? 'on' : ''}" data-action="sub" data-p="${p.id}" data-sub="${k}">${l}</button>`).join('')}</div>` : ''}
    ${body}`;
  }

  function renderSteps(p) {
    return `<section class="panel"><div class="guide" style="margin:0">${md(p.intro)}</div></section>
    ${p.milestones.map((m, i) => { const d = m.tasks.filter((t) => t.status === 'done').length; const open = UI.open.has(m.id) || (!UI.open.size && m.tasks.some((t) => t.status !== 'done') && p.milestones.findIndex((mm) => mm.tasks.some((t) => t.status !== 'done')) === i);
      return `<details class="ms panel ${d === m.tasks.length && m.tasks.length ? 'complete' : ''}" ${open ? 'open' : ''} data-ms="${m.id}"><summary><span class="name">${esc(m.name)}</span><span class="count">${d}/${m.tasks.length}</span><button class="btn ghost" data-action="edit-ms" data-id="${m.id}" style="padding:4px 6px">✎</button></summary>
      ${m.tasks.map((t) => taskRow(t, p, false)).join('')}
      <form class="row mt" data-action="task-add" data-ms="${m.id}"><input type="text" name="title" placeholder="Add a step…" autocomplete="off"><select name="size" style="width:auto"><option>S</option><option selected>M</option><option>L</option></select><button class="btn" type="submit">+</button></form></details>`; }).join('')}
    <form class="panel row" data-action="ms-add" data-p="${p.id}"><input type="text" name="name" placeholder="New milestone…" autocomplete="off"><button class="btn gold" type="submit">+ MILESTONE</button></form>`;
  }

  function renderPipeline(p) {
    const pl = SEED.pipelines[p.pipeline]; const items = S.items.filter((i) => i.pillar === p.id); const c = colorVar(p.color);
    return `<section class="panel"><div class="small dim">Each ${esc(pl.itemNoun)} moves through: ${pl.stages.join(' → ')}. Tap a card to edit, use ◂ ▸ to move it.</div></section>
    <div class="board" style="--c:${c}">${items.length ? items.map((it) => { const last = it.stage >= pl.stages.length - 1; return `<div class="pitem ${last ? 'done' : ''}"><div class="row between"><button class="title grow" style="background:none;border:0;text-align:left;color:inherit;padding:0;font-size:21px" data-action="open-item" data-id="${it.id}">${esc(it.title)}</button><button class="btn ghost" data-action="stage" data-id="${it.id}" data-d="-1">◂</button><button class="btn ${last ? 'ghost' : ''}" data-action="stage" data-id="${it.id}" data-d="1">▸</button></div><div class="stages">${pl.stages.map((s, i) => `<i class="${i <= it.stage ? 'on' : ''}" title="${esc(s)}"></i>`).join('')}</div><div class="stage">${esc(pl.stages[it.stage])}${it.notes ? ` <span class="dim">· 📝</span>` : ''}</div></div>`; }).join('') : `<div class="empty">No ${esc(pl.itemNoun)}s yet.</div>`}</div>
    <form class="panel row mt" data-action="item-add" data-p="${p.id}"><input type="text" name="title" placeholder="New ${esc(pl.itemNoun)}…" autocomplete="off"><button class="btn gold" type="submit">+</button></form>`;
  }

  function renderBible() {
    const types = SEED.bibleTypes; const q = UI.bibleQuery.toLowerCase();
    const list = S.bible.filter((b) => (UI.bibleFilter === 'all' || b.type === UI.bibleFilter) && (!q || b.name.toLowerCase().includes(q) || Object.values(b.fields || {}).join(' ').toLowerCase().includes(q)));
    return `<section class="panel"><div class="small dim mb">The story bible: characters, places, rules, events. Quick capture here; deep bible in Obsidian (see Organizing the planning).</div>
    <input type="text" placeholder="Search the bible…" value="${esc(UI.bibleQuery)}" data-action="bible-q" autocomplete="off">
    <div class="chips mt"><button class="chip ${UI.bibleFilter === 'all' ? 'on' : ''}" data-action="bible-f" data-t="all">ALL</button>${types.map((t) => `<button class="chip ${UI.bibleFilter === t.id ? 'on' : ''}" data-action="bible-f" data-t="${t.id}">${esc(t.label.toUpperCase())}</button>`).join('')}</div>
    <div class="btnrow"><button class="btn gold" data-action="bible-new">+ NEW ENTRY</button></div></section>
    ${list.length ? list.map((b) => { const ty = types.find((t) => t.id === b.type) || types[0]; const snip = Object.values(b.fields || {}).find(Boolean) || ''; return `<button class="bcard" data-action="open-bible" data-id="${b.id}"><div class="type">${esc(ty.label)}</div><div class="name">${esc(b.name)}</div><div class="snip">${esc(snip)}</div></button>`; }).join('') : '<div class="empty">Nothing here yet.</div>'}`;
  }

  /* ───────────── sheets ───────────── */
  function openSheet(html) { $('#sheet').innerHTML = `<button class="sheet-close iconbtn" data-action="close" aria-label="Close">✕</button><div class="handle" data-action="close"></div>${html}`; $('#sheet').classList.add('open'); $('#sheet-bg').classList.add('open'); }
  function closeSheet() { $('#sheet').classList.remove('open'); $('#sheet-bg').classList.remove('open'); }

  function taskSheet(id) {
    const f = findTask(id); if (!f) return; const { t, m, p } = f;
    openSheet(`<form data-action="task-save" data-id="${t.id}">
      <div class="row between"><h3 style="color:${colorVar(p.color)}">${esc(p.name)} · ${esc(m.name)}</h3><span class="size ${t.size}">${t.size}</span></div>
      <label class="lbl">Step</label><input type="text" name="title" value="${esc(t.title)}">
      <div class="row mt"><label class="lbl" style="margin:0">Size</label><select name="size" style="width:auto"><option ${t.size === 'S' ? 'selected' : ''}>S</option><option ${t.size === 'M' ? 'selected' : ''}>M</option><option ${t.size === 'L' ? 'selected' : ''}>L</option></select><span class="small dim">S 15 min · M 45 · L 90+</span></div>
      ${t.guide ? `<label class="lbl">How to do it</label><div class="guide">${md(t.guide)}</div>` : ''}
      <label class="lbl">Your notes</label><textarea name="notes" placeholder="Decisions, links, what you learned…">${esc(t.notes)}</textarea>
      <div class="btnrow"><button class="btn fill gold" type="submit">SAVE</button><button class="btn" type="button" data-action="cycle" data-id="${t.id}" data-close="1">${t.status === 'done' ? 'MARK TODO' : t.status === 'doing' ? 'MARK DONE' : 'START'}</button><button class="btn mag" type="button" data-action="focus" data-id="${t.id}">${S.focus === t.id ? 'UNPIN' : '★ FOCUS'}</button><button class="btn danger" type="button" data-action="task-del" data-id="${t.id}">DELETE</button></div>
    </form>`);
  }
  function itemSheet(id) {
    const it = S.items.find((i) => i.id === id); if (!it) return; const pl = SEED.pipelines[pillar(it.pillar).pipeline];
    openSheet(`<form data-action="item-save" data-id="${it.id}"><h3>${esc(pl.label)}</h3>
      <label class="lbl">Title</label><input type="text" name="title" value="${esc(it.title)}">
      <label class="lbl">Stage</label><select name="stage">${pl.stages.map((s, i) => `<option value="${i}" ${i === it.stage ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <label class="lbl">Notes</label><textarea name="notes">${esc(it.notes)}</textarea>
      <div class="btnrow"><button class="btn fill gold" type="submit">SAVE</button><button class="btn danger" type="button" data-action="item-del" data-id="${it.id}">DELETE</button></div></form>`);
  }
  function bibleSheet(id, typeId) {
    const b = id ? S.bible.find((x) => x.id === id) : { id: '', type: typeId || 'character', name: '', fields: {} }; if (!b) return;
    const ty = SEED.bibleTypes.find((t) => t.id === b.type) || SEED.bibleTypes[0];
    openSheet(`<form data-action="bible-save" data-id="${b.id}"><h3 class="c-mag">Story bible</h3>
      <label class="lbl">Type</label><select name="type" data-action="bible-type">${SEED.bibleTypes.map((t) => `<option value="${t.id}" ${t.id === b.type ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select>
      <label class="lbl">Name</label><input type="text" name="name" value="${esc(b.name)}" placeholder="Name">
      ${ty.fields.map((f) => `<label class="lbl">${esc(f)}</label><textarea name="f:${esc(f)}" style="min-height:60px">${esc(b.fields[f] || '')}</textarea>`).join('')}
      <div class="btnrow"><button class="btn fill gold" type="submit">SAVE</button>${b.id ? `<button class="btn danger" type="button" data-action="bible-del" data-id="${b.id}">DELETE</button>` : ''}</div></form>`);
  }
  function msSheet(id) {
    const p = S.pillars.find((pp) => pp.milestones.some((m) => m.id === id)); const m = p.milestones.find((x) => x.id === id); const i = p.milestones.indexOf(m);
    openSheet(`<form data-action="ms-save" data-id="${m.id}"><h3>Milestone</h3><label class="lbl">Name</label><input type="text" name="name" value="${esc(m.name)}">
      <div class="btnrow"><button class="btn fill gold" type="submit">SAVE</button><button class="btn" type="button" data-action="ms-move" data-id="${m.id}" data-d="-1" ${i === 0 ? 'disabled' : ''}>▲ UP</button><button class="btn" type="button" data-action="ms-move" data-id="${m.id}" data-d="1" ${i === p.milestones.length - 1 ? 'disabled' : ''}>▼ DOWN</button><button class="btn danger" type="button" data-action="ms-del" data-id="${m.id}">DELETE</button></div></form>`);
  }
  function playbookSheet() {
    openSheet(`<h3 class="c-gold">Playbook: solo creator best practices</h3><div class="small dim mb">Read one of these when you feel behind.</div>${SEED.playbook.map((p) => `<details class="ms"><summary><span class="name">${esc(p.title)}</span></summary><div class="guide">${md(p.body)}</div></details>`).join('')}`);
  }
  function settingsSheet() {
    const canShare = !!(navigator.share);
    openSheet(`<h3 class="c-cyan">Settings</h3>
      <label class="lbl">Neon glow</label><div class="chips"><button class="chip ${S.settings.glow !== 'off' ? 'on' : ''}" data-action="set-glow" data-v="on">FULL NEON</button><button class="chip ${S.settings.glow === 'off' ? 'on' : ''}" data-action="set-glow" data-v="off">CALM</button></div>
      <label class="lbl">Text size</label><div class="chips">${[18, 20, 22, 24].map((n) => `<button class="chip ${S.settings.fs === n ? 'on' : ''}" data-action="set-fs" data-v="${n}">${n}</button>`).join('')}</div>
      <hr class="px"><h3>Reminders</h3>
      <div class="small mt">iPhone web apps cannot schedule their own notifications without a server, so reminders live in the Calendar app. Pick a time; this creates a daily event with an alert that opens Walk in Light.</div>
      <div class="row mt"><input type="text" name="wake" id="wake" value="${esc(S.settings.wake || '19:00')}" placeholder="19:00" style="width:110px" inputmode="numeric"><button class="btn gold" data-action="ics">ADD DAILY REMINDER</button></div>
      <div class="small dim mt">Or in the iOS Reminders app: New Reminder → "Walk in Light: one small step" → Repeat daily. Keep the app on your first home screen page; the icon is the reminder.</div>
      <hr class="px"><h3>Backup</h3>
      <div class="btnrow"><button class="btn fill" data-action="export">${canShare ? 'EXPORT (SHARE)' : 'EXPORT JSON'}</button><label class="btn"><input type="file" accept="application/json,.json" data-action="import" style="display:none">IMPORT JSON</label></div>
      <div class="small dim mt">Export monthly into Drive. Import replaces everything on this phone with the file.</div>
      <hr class="px"><h3>Content</h3>
      <div class="small mt">Seed content v${SEED.version}; your copy is from v${S.seedVersion}. Merging adds new steps and refreshes guides on steps you have not edited. Progress is kept.</div>
      <div class="btnrow"><button class="btn" data-action="merge">MERGE LATEST CONTENT</button><button class="btn danger" data-action="reset">RESET EVERYTHING</button></div>
      <div class="small dim mt">Walk in Light · personal progress console · data lives only on this device.</div>`);
  }

  /* ───────────── actions ───────────── */
  function cycle(id) {
    const f = findTask(id); if (!f) return; const t = f.t;
    const next = { todo: 'doing', doing: 'done', done: 'todo' }[t.status] || 'todo';
    t.status = next;
    if (next === 'done') { t.doneAt = new Date().toISOString(); S.log.push({ taskId: t.id, at: t.doneAt }); if (S.focus === t.id) S.focus = null; toast(`+${XP[t.size] || 10} LIGHT · ${['WELL DONE', 'SMALL THINGS', 'KEEP WALKING', 'SHINE ON', 'ONE MORE STONE'][Math.floor(Math.random() * 5)]}`); }
    else if (t.status === 'todo') { t.doneAt = null; S.log = S.log.filter((e) => e.taskId !== t.id); }
    UI.scrollKeep = window.scrollY; commit();
  }
  let toastTimer; function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2200); }
  function exportJson() {
    const data = JSON.stringify(S, null, 1); const name = `walk-in-light-${today()}.json`;
    const file = new File([data], name, { type: 'application/json' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: 'Walk in Light backup' }).catch(() => {}); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  function importJson(file) {
    const r = new FileReader(); r.onload = () => { try { const d = JSON.parse(r.result); if (!d.pillars) throw 0; S = d; commit(); closeSheet(); toast('IMPORTED'); } catch (e) { toast('NOT A WALK IN LIGHT FILE'); } }; r.readAsText(file);
  }
  function ics() {
    const hhmm = ($('#wake').value || '19:00').replace(/[^0-9]/g, '').padStart(4, '0').slice(0, 4); S.settings.wake = hhmm.slice(0, 2) + ':' + hhmm.slice(2); save();
    const d = new Date(); const stamp = d.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'; const start = d.toISOString().slice(0, 10).replace(/-/g, '') + 'T' + hhmm + '00';
    const url = location.href.split('#')[0];
    const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Walk in Light//EN', 'BEGIN:VEVENT', `UID:wil-daily-${Date.now()}@walkinlight`, `DTSTAMP:${stamp}`, `DTSTART:${start}`, 'DURATION:PT15M', 'RRULE:FREQ=DAILY', 'SUMMARY:Walk in Light: one small step', `DESCRIPTION:Open the console and do one S task. ${url}`, `URL:${url}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT0M', 'DESCRIPTION:Walk in Light', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const file = new File([body], 'walk-in-light-reminder.ics', { type: 'text/calendar' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: 'Walk in Light reminder' }).catch(() => {}); return; }
    const a = document.createElement('a'); a.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(body); a.download = 'walk-in-light-reminder.ics'; document.body.appendChild(a); a.click(); a.remove();
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]'); if (!el) return; const a = el.dataset.action; const id = el.dataset.id;
    if (el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'FORM') return;
    switch (a) {
      case 'tab': UI.tab = el.dataset.tab; UI.open = new Set(); render(); break;
      case 'sub': UI.sub[el.dataset.p] = el.dataset.sub; render(); break;
      case 'time': UI.timeFilter = UI.timeFilter === +el.dataset.n ? null : +el.dataset.n; render(); break;
      case 'cycle': cycle(id); if (el.dataset.close) closeSheet(); break;
      case 'open-task': taskSheet(id); break;
      case 'open-item': itemSheet(id); break;
      case 'open-bible': bibleSheet(id); break;
      case 'bible-new': bibleSheet(null, UI.bibleFilter === 'all' ? 'character' : UI.bibleFilter); break;
      case 'bible-f': UI.bibleFilter = el.dataset.t; render(); break;
      case 'edit-ms': e.preventDefault(); msSheet(id); break;
      case 'focus': { S.focus = S.focus === id ? null : id; commit(); closeSheet(); toast(S.focus ? 'PINNED AS FOCUS' : 'UNPINNED'); break; }
      case 'task-del': if (confirm('Delete this step?')) { S.pillars.forEach((p) => p.milestones.forEach((m) => { m.tasks = m.tasks.filter((t) => t.id !== id); })); if (S.focus === id) S.focus = null; commit(); closeSheet(); } break;
      case 'item-del': if (confirm('Delete this item?')) { S.items = S.items.filter((i) => i.id !== id); commit(); closeSheet(); } break;
      case 'bible-del': if (confirm('Delete this entry?')) { S.bible = S.bible.filter((b) => b.id !== id); commit(); closeSheet(); } break;
      case 'ms-del': if (confirm('Delete this milestone and all its steps?')) { S.pillars.forEach((p) => { p.milestones = p.milestones.filter((m) => m.id !== id); }); commit(); closeSheet(); } break;
      case 'ms-move': { const p = S.pillars.find((pp) => pp.milestones.some((m) => m.id === id)); const i = p.milestones.findIndex((m) => m.id === id); const j = i + (+el.dataset.d); if (j >= 0 && j < p.milestones.length) { [p.milestones[i], p.milestones[j]] = [p.milestones[j], p.milestones[i]]; commit(); closeSheet(); } break; }
      case 'stage': { const it = S.items.find((i) => i.id === id); const n = SEED.pipelines[pillar(it.pillar).pipeline].stages.length; it.stage = Math.max(0, Math.min(n - 1, it.stage + (+el.dataset.d))); if (it.stage === n - 1 && +el.dataset.d > 0) toast('SHIPPED. WELL DONE.'); UI.scrollKeep = window.scrollY; commit(); break; }
      case 'inbox-del': S.inbox = S.inbox.filter((i) => i.id !== id); commit(); break;
      case 'playbook': playbookSheet(); break;
      case 'settings': settingsSheet(); break;
      case 'set-glow': S.settings.glow = el.dataset.v; commit(); settingsSheet(); break;
      case 'set-fs': S.settings.fs = +el.dataset.v; commit(); settingsSheet(); break;
      case 'export': exportJson(); break;
      case 'ics': ics(); break;
      case 'merge': mergeSeed(); settingsSheet(); break;
      case 'reset': if (confirm('Erase ALL progress and notes on this phone and start from the seed content?')) { S = fresh(); commit(); closeSheet(); } break;
      case 'hide-install': S.settings.hideInstall = true; commit(); break;
      case 'close': closeSheet(); break;
    }
  });
  document.addEventListener('submit', (e) => {
    const f = e.target; const a = f.dataset.action; if (!a) return; e.preventDefault(); const fd = new FormData(f); const id = f.dataset.id;
    switch (a) {
      case 'inbox-add': { const text = (fd.get('text') || '').trim(); if (text) { S.inbox.push({ id: uid('in'), text, at: new Date().toISOString() }); commit(); } break; }
      case 'task-add': { const title = (fd.get('title') || '').trim(); if (!title) return; const m = S.pillars.flatMap((p) => p.milestones).find((mm) => mm.id === f.dataset.ms); m.tasks.push({ id: uid('t'), title, size: fd.get('size') || 'M', guide: '', status: 'todo', notes: '', doneAt: null, seeded: false, edited: true }); UI.open.add(m.id); UI.scrollKeep = window.scrollY; commit(); break; }
      case 'ms-add': { const name = (fd.get('name') || '').trim(); if (!name) return; pillar(f.dataset.p).milestones.push({ id: uid('m'), name, tasks: [] }); commit(); break; }
      case 'item-add': { const title = (fd.get('title') || '').trim(); if (!title) return; S.items.push({ id: uid('it'), pillar: f.dataset.p, title, stage: 0, notes: '' }); commit(); break; }
      case 'task-save': { const t = findTask(id).t; const title = (fd.get('title') || '').trim() || t.title; if (title !== t.title || fd.get('size') !== t.size) t.edited = true; t.title = title; t.size = fd.get('size'); t.notes = fd.get('notes') || ''; UI.scrollKeep = window.scrollY; commit(); closeSheet(); toast('SAVED'); break; }
      case 'item-save': { const it = S.items.find((i) => i.id === id); it.title = (fd.get('title') || '').trim() || it.title; it.stage = +fd.get('stage'); it.notes = fd.get('notes') || ''; commit(); closeSheet(); break; }
      case 'ms-save': { const m = S.pillars.flatMap((p) => p.milestones).find((mm) => mm.id === id); m.name = (fd.get('name') || '').trim() || m.name; commit(); closeSheet(); break; }
      case 'bible-save': { const fields = {}; for (const [k, v] of fd.entries()) if (k.startsWith('f:')) fields[k.slice(2)] = v; const name = (fd.get('name') || '').trim() || 'Untitled'; if (id) { const b = S.bible.find((x) => x.id === id); b.type = fd.get('type'); b.name = name; b.fields = fields; } else S.bible.push({ id: uid('b'), type: fd.get('type'), name, fields }); UI.sub.story = 'bible'; commit(); closeSheet(); toast('SAVED'); break; }
    }
  });
  document.addEventListener('change', (e) => {
    const el = e.target; const a = el.dataset.action; if (!a) return;
    if (a === 'inbox-move') { const i = S.inbox.find((x) => x.id === el.dataset.id); const v = el.value; if (!v) return;
      if (v === 'bible') { S.inbox = S.inbox.filter((x) => x !== i); save(); bibleSheet(null, 'lore'); setTimeout(() => { const n = $('#sheet input[name=name]'); if (n) n.value = i.text; }, 0); render(); return; }
      const p = pillar(v); let m = p.milestones.find((mm) => mm.id === v + '-inbox'); if (!m) { m = { id: v + '-inbox', name: 'From the inbox', tasks: [] }; p.milestones.push(m); }
      m.tasks.push({ id: uid('t'), title: i.text, size: 'M', guide: '', status: 'todo', notes: '', doneAt: null, seeded: false, edited: true }); S.inbox = S.inbox.filter((x) => x !== i); commit(); toast('MOVED TO ' + p.short); }
    if (a === 'import' && el.files[0]) importJson(el.files[0]);
    if (a === 'bible-type') { const form = el.closest('form'); const id = form.dataset.id; const name = form.querySelector('[name=name]').value; if (id) { const b = S.bible.find((x) => x.id === id); b.type = el.value; b.name = name; bibleSheet(id); } else { bibleSheet(null, el.value); $('#sheet [name=name]').value = name; } }
  });
  document.addEventListener('input', (e) => { if (e.target.dataset.action === 'bible-q') { UI.bibleQuery = e.target.value; const pos = e.target.selectionStart; render(); const el = $('[data-action=bible-q]'); el.focus(); el.setSelectionRange(pos, pos); } });
  document.addEventListener('toggle', (e) => { const d = e.target; if (d.dataset && d.dataset.ms) { if (d.open) UI.open.add(d.dataset.ms); else UI.open.delete(d.dataset.ms); } }, true);
  $('#sheet-bg').addEventListener('click', closeSheet);

  /* ───────────── boot ───────────── */
  if (S.seedVersion < SEED.version) setTimeout(() => toast('NEW CONTENT AVAILABLE: SETTINGS → MERGE'), 800);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  render();
})();
