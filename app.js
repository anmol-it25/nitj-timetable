// NITJ IT timetable — static frontend. All data comes from data/timetable.json (see README).
const TZ = "Asia/Kolkata", DATA_URL = "data/timetable.json", POLL_MS = 60000;
const WEEKDAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday"];
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let data = null, group = localStorage.getItem("nitj-group"), stale = false, failed = false, showWeek = false, lastText = "";

const mins = t => +t.slice(0,2) * 60 + +t.slice(3,5);
const t12 = t => { const h = +t.slice(0,2); return `${h % 12 || 12}:${t.slice(3)} ${h < 12 ? "AM" : "PM"}`; };
const span = s => `${t12(s.start)} – ${t12(s.end)}`;

// Current IST date parts, from the browser clock.
function now() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {timeZone: TZ, year:"numeric", month:"2-digit", day:"2-digit",
    weekday:"long", hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23"}).formatToParts(new Date()).map(x => [x.type, x.value]));
  return {date:`${p.year}-${p.month}-${p.day}`, day:p.weekday, min:+p.hour*60 + +p.minute, clock:`${p.hour}:${p.minute}:${p.second}`};
}
function addDays(date, n) { // pure calendar arithmetic, no timezone issues
  const d = new Date(date + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
  return {date: d.toISOString().slice(0,10), day: d.toLocaleDateString("en-GB", {weekday:"long", timeZone:"UTC"})};
}

// Build the day's slots for a group: weekly schedule + temporary overrides for that date.
function slotsFor(g, date, day) {
  const tt = data.groups[g]; if (!tt) return null;
  const rows = tt.schedule[day] || {};
  return data.periods.map(p => {
    if (p.type === "lunch") return {...p, entries: []};
    let entries = (rows[p.id] || []).map(e => ({...e})), start = p.start, end = p.end;
    for (const o of data.overrides || []) {
      if (o.date !== date || o.group !== g || o.period !== p.id) continue;
      const hit = e => !o.subject || e.subject === o.subject;
      if (o.action === "cancel") entries = entries.filter(e => !hit(e));
      else if (o.action === "room_change") entries.forEach(e => { if (hit(e)) { e.room = o.room; e.changed = true; } });
      else if (o.action === "time_change") { start = o.start; end = o.end; }
      else if (o.action === "add" && o.entry) entries.push({...o.entry, changed: true});
    }
    return {...p, start, end, entries};
  });
}

function item(e) {
  const s = data.subjects[e.subject] || {name: e.name || e.subject, color: ""};
  return `<div class="item c-${esc(s.color)}${e.changed ? " changed" : ""}"><strong>${esc(e.subject)}</strong>
    <small>${esc(s.name)}</small><small>${esc(e.room)}${e.changed ? " · changed today" : ""}</small></div>`;
}
const items = es => es.map(item).join("");

function nextAfter(n, slots) {
  const s = slots.find(s => s.entries.length && mins(s.start) > n.min);
  if (s) return {label: "NEXT", slot: s};
  for (let i = 1; i <= 7; i++) { // look ahead to the next day with classes
    const d = addDays(n.date, i), sl = slotsFor(group, d.date, d.day), f = sl && sl.find(s => s.entries.length);
    if (f) return {label: i === 1 ? "TOMORROW" : d.day.toUpperCase(), slot: f};
  }
  return null;
}

function render() {
  const n = now();
  $("#clock").textContent = n.clock.slice(0,2) % 12 === 0 && false ? "" : t12(n.clock.slice(0,5)).replace(" ", `:${n.clock.slice(6)} `);
  $("#date").textContent = `${n.day}, ${new Date(n.date + "T00:00:00Z").toLocaleDateString("en-GB", {day:"numeric", month:"long", year:"numeric", timeZone:"UTC"})}`;
  $("#banner").hidden = !(failed || stale);
  $("#banner").textContent = failed && !data ? "Unable to load the latest timetable." : failed || stale ? "Unable to load the latest timetable. Showing last saved timetable." : "";
  if (!data) { $("#home").innerHTML = failed ? "" : '<p class="muted">Loading…</p>'; return; }
  const m = data.meta; $("#dept").textContent = m.department; $("#sub").textContent = `${m.program} · ${m.session}`;
  const gs = Object.keys(data.groups), first = !group || !data.groups.hasOwnProperty(group);
  $("#groups").className = "groups" + (first ? " first" : "");
  $("#groups").innerHTML = (first ? '<p class="muted" style="grid-column:1/-1;text-align:center;font-weight:700">Select your group</p>' : "") +
    gs.map(g => `<button data-g="${esc(g)}" aria-pressed="${g === group}" aria-label="${esc(g)}">G${g.replace(/\D/g,"")}</button>`).join("");
  if (first) { $("#home").innerHTML = ""; $("#week").hidden = true; return; }
  const slots = slotsFor(group, n.date, n.day);
  if (!slots) { $("#home").innerHTML = `<p class="card">Timetable not configured yet for ${esc(group)}.</p>`; $("#week").hidden = true; return; }
  const cur = slots.find(s => s.entries.length && mins(s.start) <= n.min && n.min < mins(s.end));
  const nx = nextAfter(n, slots), any = slots.some(s => s.entries.length), weekend = !WEEKDAYS.includes(n.day);
  const nowCard = `<div class="card${cur ? " now" : ""}"><div class="tag">${cur ? '<span class="dot"></span>NOW' : "NOW"}</div>${
    cur ? `<p class="muted">${span(cur)}</p>${items(cur.entries)}` : `<p class="muted">${weekend && !any ? "No regular classes today." : "No class right now."}</p>`}</div>`;
  const nxCard = `<div class="card"><div class="tag">${nx ? nx.label : "NEXT"}</div>${nx ? `<p class="muted">${span(nx.slot)}</p>${items(nx.slot.entries)}` :
    '<p class="muted">No more classes today</p>'}</div>`;
  const list = (weekend && !any) ? "" : `<h2>Today's schedule</h2>` + slots.map(s => `<div class="row${s === cur ? " now" : ""}"><div class="t">${s === cur ? '<span class="dot"></span>' : ""}${t12(s.start)}</div>
    <div class="b">${s.type === "lunch" ? '<span class="free">Lunch</span>' : s.entries.length ? items(s.entries) : '<span class="free">Free</span>'}</div></div>`).join("");
  $("#home").innerHTML = `
  <div class="cards">${nowCard}${nxCard}</div>
  ${list}
  ${!showWeek ? `

    <button class="btn" id="wk" aria-expanded="false">
      View Full Timetable
    </button>
    <button class="btn pdf-home-btn" id="pdfBtn">
     Download PDF
    </button>

  ` : ""}
`;

$("#week").hidden = !showWeek;

if (showWeek) {
  renderGrid(n, cur);
}
}

function renderGrid(n, cur) {
  const ps = data.periods;
  let h = `<table><caption class="muted" style="text-align:left">${esc(group)}</caption><thead><tr><th></th>${ps.map(p => `<th scope="col">${esc(p.label)}<br>${t12(p.start)}–${t12(p.end)}</th>`).join("")}</tr></thead><tbody>`;
  for (const d of WEEKDAYS) {
    h += `<tr><th class="d" scope="row">${d}</th>`;
    const sl = slotsFor(group, d === n.day ? n.date : "", d);
    sl.forEach(s => { const isCur = d === n.day && cur && s.id === cur.id;
      h += s.type === "lunch" ? '<td class="lunch">Lunch</td>' : `<td class="${isCur ? "cur" : ""}">${s.entries.length ? items(s.entries) : '<span class="free">Free</span>'}</td>`; });
    h += "</tr>";
  }
  $("#grid").innerHTML = h + "</tbody></table>";

  $("#week-actions")?.remove();

  

$("#week").insertAdjacentHTML("afterbegin", `
  <div id="week-actions">
    <button class="btn" id="wk" aria-expanded="true">
      Hide Full Timetable
    </button>

    <button class="btn pdf-home-btn" id="pdfBtn">
      Download PDF
    </button>
  </div>

  `);
}

async function load() {
  try {
    const r = await fetch(DATA_URL, {cache: "no-store"}); if (!r.ok) throw 0;
    const text = await r.text(); failed = stale = false;
    if (text !== lastText) { lastText = text; data = JSON.parse(text); localStorage.setItem("nitj-data", text); }
  } catch {
    failed = true; const c = localStorage.getItem("nitj-data");
    if (!data && c) { try { data = JSON.parse(c); stale = true; } catch {} } else if (data) stale = true;
  }
  render();
}
function downloadPDF() {
  if (!data || !group) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4"
  });

  const meta = data.meta;

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("NITJ IT TIMETABLE", 148.5, 15, { align: "center" });

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${meta.program} · ${meta.session}`,
    148.5,
    22,
    { align: "center" }
  );

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(`Group ${group.replace(/\D/g, "")}`, 148.5, 30, {
    align: "center"
  });

  // Table header
  const periods = data.periods;

  const head = [
    [
      "Day",
      ...periods.map(p =>
        p.type === "lunch"
          ? "Lunch"
          : `${p.label}\n${t12(p.start)} – ${t12(p.end)}`
      )
    ]
  ];

  // Table body
  const body = WEEKDAYS.map(day => {
    const slots = slotsFor(group, "", day);

    return [
      day,
      ...slots.map(slot => {
        if (slot.type === "lunch") {
          return "Lunch";
        }

        if (!slot.entries.length) {
          return "";
        }

        return slot.entries.map(e => {
          return `${e.subject}\n${e.room}`;
        }).join("\n\n");
      })
    ];
  });

  doc.autoTable({
    head,
    body,
    startY: 36,
    theme: "grid",

    styles: {
      fontSize: 7,
      cellPadding: 2,
      valign: "middle",
      halign: "center",
      lineColor: [210, 218, 230],
      lineWidth: 0.2
    },

    headStyles: {
      fillColor: [11, 36, 71],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7
    },

    columnStyles: {
      0: {
        cellWidth: 22,
        fontStyle: "bold"
      }
    },

    didParseCell: function(data) {
    // Day column
    if (data.column.index === 0 && data.section === "body") {
      data.cell.styles.fillColor = [238, 243, 249];
    }

    // Lunch
    if (
      data.section === "body" &&
      data.column.index > 0 &&
      data.cell.text.join("").trim() === "Lunch"
    ) {
      data.cell.styles.fillColor = [236, 239, 244];
      data.cell.styles.textColor = [91, 107, 133];
      data.cell.styles.fontStyle = "bold";
    }

    // Subject cells:
    // Hide the normal AutoTable text because we will draw
    // subject and room separately in didDrawCell.
    if (
      data.section === "body" &&
      data.column.index > 0 &&
      data.cell.text.join("").trim() &&
      data.cell.text.join("").trim() !== "Lunch"
    ) {
      data.cell.styles.textColor = [255, 255, 255];
    }
},

didDrawCell: function(data) {
  if (
    data.section !== "body" ||
    data.column.index === 0
  ) return;

  const text = data.cell.raw;

  if (
    typeof text !== "string" ||
    !text.trim() ||
    text.trim() === "Lunch"
  ) return;

  const entries = text.split("\n\n");

  const subjectSize = 7;
  const roomSize = 6.2;
  const subjectHeight = 3.2;
  const roomHeight = 3;
  const entryGap = 2;

  const totalHeight =
    entries.length * (subjectHeight + roomHeight) +
    (entries.length - 1) * entryGap;

  let y = data.cell.y + (data.cell.height - totalHeight) / 2 + subjectHeight;

  entries.forEach(entry => {
    const [subject, room] = entry.split("\n");

    // Subject
    doc.setFont("helvetica", "bold");
    doc.setFontSize(subjectSize);
    doc.setTextColor(20, 33, 61);

    doc.text(
      subject,
      data.cell.x + data.cell.width / 2,
      y,
      { align: "center" }
    );

    // Room
    doc.setFont("helvetica", "normal");
    doc.setFontSize(roomSize);
    doc.setTextColor(91, 107, 133);

    doc.text(
      room,
      data.cell.x + data.cell.width / 2,
      y + roomHeight,
      { align: "center" }
    );

    y += subjectHeight + roomHeight + entryGap;
  });
}
  });

  // Footer
  const pageHeight = doc.internal.pageSize.height;

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 110, 125);

  doc.text(
    "Convenience view only — the official college timetable is the authoritative source.",
    148.5,
    pageHeight - 8,
    { align: "center" }
  );

  doc.save(`NITJ-IT-Timetable-G${group.replace(/\D/g, "")}.pdf`);
}
document.addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;

  if (b.dataset.g) {
    group = b.dataset.g;
    localStorage.setItem("nitj-group", group);
    render();
  }

  else if (b.id === "wk") {
    showWeek = !showWeek;
    render();
  }

  else if (b.id === "pdfBtn") {
    downloadPDF();
  }
});
load(); setInterval(load, POLL_MS); setInterval(render, 1000);
document.addEventListener("visibilitychange", () => !document.hidden && load());
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
