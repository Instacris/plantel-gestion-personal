/* ============================================================
   PLANTEL · Lógica de la aplicación
   ============================================================ */

let state = { contratos: [], trabajadores: [] }; // se carga desde la API al iniciar sesión
const ui = { view: "dashboard", fContrato: "all", fEstado: "all", search: "", selected: new Set() };

/* ---------- Utilidades ---------- */
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

const CLP = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const fmt = (n) => CLP.format(Math.round(n || 0));

const getContrato = (id) => state.contratos.find((c) => c.id === id);
const initials = (name) => {
  const p = (name || "").trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "?";
};

const TURNO_STYLE = {
  "Mañana":   { bg: "#e0f2fe", fg: "#0369a1", bd: "#0ea5e9" },
  "Tarde":    { bg: "#fef3c7", fg: "#b45309", bd: "#f59e0b" },
  "Noche":    { bg: "#ede9fe", fg: "#6d28d9", bd: "#8b5cf6" },
  "Rotativo": { bg: "#ccfbf1", fg: "#0f766e", bd: "#14b8a6" },
  "Flexible": { bg: "#d1fae5", fg: "#047857", bd: "#10b981" }
};
const TURNO_HORAS = {
  "Mañana": ["08:00", "17:00"], "Tarde": ["14:00", "22:00"], "Noche": ["22:00", "06:00"],
  "Rotativo": ["09:00", "18:00"], "Flexible": ["10:00", "16:00"]
};
const ATTEND_LABEL = { trabajo: "Trabajó", falta: "Faltó", libre: "Libre", feriado: "Feriado" };
const ATTEND_ORDER = ["trabajo", "falta", "libre", "feriado"];

const estadoBadge = (e) => {
  const map = { Activo: "emerald", Inactivo: "rose", Vacaciones: "sky", Licencia: "amber" };
  return `<span class="badge badge--${map[e] || "gray"}"><i class="dot"></i>${e}</span>`;
};
const rolBadge = (r) => {
  const map = { Administrador: "violet", Supervisor: "sky", Empleado: "gray" };
  return `<span class="badge badge--${map[r] || "gray"}">${r}</span>`;
};
function turnoBadge(t) {
  const s = TURNO_STYLE[t] || TURNO_STYLE["Flexible"];
  return `<span class="badge" style="background:${s.bg};color:${s.fg}">${t}</span>`;
}

/* ---------- Cálculo de horas / nómina ---------- */
function dayHours(inStr, outStr) {
  if (!inStr || !outStr) return 0;
  const [ih, im] = inStr.split(":").map(Number);
  const [oh, om] = outStr.split(":").map(Number);
  let diff = (oh * 60 + om) - (ih * 60 + im);
  if (diff <= 0) diff += 24 * 60; // turno nocturno
  return diff / 60;
}
function weekHours(t) {
  let h = 0;
  for (let d = 1; d <= 7; d++) if (t.horario[d]?.on) h += dayHours(t.horario[d].in, t.horario[d].out);
  return h;
}
function activeDays(t) {
  const a = [];
  for (let d = 1; d <= 7; d++) if (t.horario[d]?.on) a.push(d);
  return a;
}
function horarioResumen(t) {
  const a = activeDays(t);
  if (!a.length) return { dias: 0, txt: "Sin turnos" };
  const set = new Set(a.map((d) => `${t.horario[d].in}–${t.horario[d].out}`));
  return { dias: a.length, txt: set.size === 1 ? [...set][0] : "Horario variable" };
}
function calcNomina(t) {
  const montoExtras = (t.valorHoraExtra || 0) * (t.horasExtrasMes || 0);
  return { valorHoraExtra: t.valorHoraExtra || 0, horas: t.horasExtrasMes || 0, montoExtras, total: (t.sueldoBase || 0) + montoExtras };
}

/* ---------- Asistencia ---------- */
function ensureAsistencia(t) {
  const { y, m } = PERIODO, dim = daysInMonth(y, m);
  t.asistencia = t.asistencia || {};
  for (let d = 1; d <= dim; d++) {
    const k = dateKey(y, m, d);
    if (FERIADOS.includes(k)) { if (!t.asistencia[k]) t.asistencia[k] = "feriado"; continue; }
    if (!(k in t.asistencia)) t.asistencia[k] = t.horario[weekdayOf(y, m, d)]?.on ? "trabajo" : "libre";
  }
  return t.asistencia;
}
function asistStats(att) {
  const { y, m } = PERIODO, dim = daysInMonth(y, m);
  const s = { trabajo: 0, falta: 0, libre: 0, feriado: 0 };
  for (let d = 1; d <= dim; d++) s[att[dateKey(y, m, d)] || "libre"]++;
  return s;
}

/* Guardado en el servidor con debounce: agrupa cambios rápidos en una sola petición */
let saveTimer = null, savePending = false;
async function pushState() {
  savePending = false;
  try { await API.saveState(state.contratos, state.trabajadores); }
  catch (e) { toast("No se pudieron guardar los cambios: " + e.message, "warn"); }
}
const save = () => {
  savePending = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(pushState, 600);
};
const flushSave = () => { if (savePending) { clearTimeout(saveTimer); pushState(); } };
window.addEventListener("beforeunload", flushSave);

/* ---------- Toast ---------- */
function toast(msg, type = "ok") {
  const icons = {
    ok: '<path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>',
    info: '<path d="M11 9h2V7h-2m1 13c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8m0-18A10 10 0 0 0 2 12a10 10 0 0 0 10 10 10 10 0 0 0 10-10A10 10 0 0 0 12 2m-1 15h2v-6h-2z"/>',
    warn: '<path d="M1 21h22L12 2 1 21m12-3h-2v-2h2m0-2h-2v-4h2z"/>'
  };
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.innerHTML = `<div class="toast__ic"><svg viewBox="0 0 24 24">${icons[type]}</svg></div><div>${msg}</div>`;
  $("#toastWrap").appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 300); }, 2800);
}

/* ============================================================
   CHARTS
   ============================================================ */
function barChart(data) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return `<div class="chart-bars">${data.map((d) => `
    <div class="bar-col"><div class="bar" style="height:${(d.value / max) * 100}%" data-val="${d.value}"></div><div class="bar-lbl">${d.label}</div></div>`).join("")}</div>`;
}
function donutChart(data, size = 150, stroke = 20) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let off = 0;
  const segs = data.filter((d) => d.value > 0).map((d) => {
    const len = c * (d.value / total);
    const s = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${d.color}" stroke-width="${stroke}" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
    off += len; return s;
  }).join("");
  return `<svg class="donut" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${stroke}"/>${segs}
    <text x="50%" y="47%" text-anchor="middle" font-size="28" font-weight="800" fill="var(--ink)" font-family="Plus Jakarta Sans">${total}</text>
    <text x="50%" y="63%" text-anchor="middle" font-size="11" fill="var(--muted)">total</text></svg>`;
}

/* ============================================================
   VISTAS
   ============================================================ */
const VIEWS = {
  dashboard: { title: "Panel", sub: "Resumen general de tu empresa", render: renderDashboard },
  trabajadores: { title: "Trabajadores", sub: "Administra el personal, cargos y horarios", render: renderTrabajadores },
  horarios: { title: "Horarios", sub: "Planificación semanal de turnos", render: renderHorarios },
  asistencia: { title: "Asistencia", sub: "Asistencia y nómina del mes", render: renderAsistencia },
  nomina: { title: "Nómina", sub: "Cálculo de remuneraciones del mes", render: renderNomina },
  contratos: { title: "Contratos", sub: "Tipos de contrato y empresas proveedoras", render: renderContratos },
  reportes: { title: "Reportes", sub: "Indicadores y exportación de datos", render: renderReportes }
};

function navigate(view) {
  ui.view = view;
  ui.selected.clear();
  $$(".nav__item").forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));
  $("#viewTitle").textContent = VIEWS[view].title;
  $("#viewSubtitle").textContent = VIEWS[view].sub;
  $("#content").innerHTML = `<div class="view">${VIEWS[view].render()}</div>`;
  $("#sidebar").classList.remove("is-open");
  $("#sidebarScrim").classList.remove("is-open");
  window.scrollTo(0, 0);
}

/* ---------- Calendario del mes (panel) ---------- */
function monthCalendar() {
  const { y, m } = PERIODO, dim = daysInMonth(y, m), firstWd = weekdayOf(y, m, 1);
  const isThisMonth = NOW.getFullYear() === y && NOW.getMonth() === m;
  let cells = "";
  for (let i = 1; i < firstWd; i++) cells += `<div class="cal-cell is-blank"></div>`;
  for (let d = 1; d <= dim; d++) {
    const wd = weekdayOf(y, m, d), k = dateKey(y, m, d);
    const cov = state.trabajadores.filter((t) => t.estado === "Activo" && t.horario[wd]?.on).length;
    const today = isThisMonth && NOW.getDate() === d;
    const feriado = FERIADOS.includes(k);
    const wknd = wd >= 6;
    cells += `<div class="cal-cell ${today ? "is-today" : ""} ${wknd ? "is-wknd" : ""} ${feriado ? "is-feriado" : ""}" title="${DIAS_LARGOS[wd - 1]} ${d}${feriado ? " · Feriado" : ` · ${cov} en turno`}">
      <span class="cal-num">${d}</span>
      ${feriado ? `<span class="cal-tag">Feriado</span>` : cov ? `<span class="cal-cov">${cov}</span>` : ""}
    </div>`;
  }
  return `<div class="cal">
    <div class="cal-week">${DIAS_SEMANA.map((x) => `<div class="cal-wd">${x}</div>`).join("")}</div>
    <div class="cal-grid">${cells}</div>
    <div class="cal-legend">
      <span><i class="lg-today"></i> Hoy</span>
      <span><i class="lg-feriado"></i> Feriado</span>
      <span><i class="lg-cov"></i> N° en turno</span>
    </div>
  </div>`;
}

/* ---------- DASHBOARD ---------- */
function renderDashboard() {
  const activos = state.trabajadores.filter((t) => t.estado === "Activo");
  const totalExtras = state.trabajadores.reduce((s, t) => s + (t.horasExtrasMes || 0), 0);
  const costo = state.trabajadores.reduce((s, t) => s + calcNomina(t).total, 0);
  let aSum = 0, aN = 0;
  state.trabajadores.forEach((t) => { const s = asistStats(ensureAsistencia(t)); const den = s.trabajo + s.falta; if (den) { aSum += s.trabajo / den; aN++; } });
  const asistProm = aN ? Math.round(aSum / aN * 100) : 100;

  const cobertura = DIAS_SEMANA.map((d, i) => ({ label: d, value: activos.filter((t) => t.horario[i + 1]?.on).length }));
  const porContrato = state.contratos.map((c) => ({ label: c.nombre, color: c.color, value: state.trabajadores.filter((t) => t.contratoId === c.id).length }));
  const topExtras = [...state.trabajadores].filter((t) => t.horasExtrasMes > 0).sort((a, b) => b.horasExtrasMes - a.horasExtrasMes).slice(0, 5);
  const hoyIdx = weekdayOf(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
  const hoy = activos.filter((t) => t.horario[hoyIdx]?.on);

  const kpi = (cls, ic, val, label, trend, up) => `
    <div class="kpi ${cls}">
      <div class="kpi__top"><div class="kpi__ic"><svg viewBox="0 0 24 24">${ic}</svg></div>
        ${trend ? `<span class="kpi__trend ${up ? "up" : "down"}"><svg viewBox="0 0 24 24"><path d="${up ? "M7 14l5-5 5 5z" : "M7 10l5 5 5-5z"}"/></svg>${trend}</span>` : ""}</div>
      <div class="kpi__val">${val}</div><div class="kpi__label">${label}</div></div>`;

  return `
    <div class="kpis">
      ${kpi("k-indigo", '<path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3m-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3m0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13m8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5"/>', activos.length, "Trabajadores activos", "+2", true)}
      ${kpi("k-amber", '<path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2M12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8m.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>', totalExtras + "h", "Horas extras del mes", "+12", true)}
      ${kpi("k-emerald", '<path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>', asistProm + "%", "Asistencia promedio", "+3%", true)}
      ${kpi("k-violet", '<path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4"/>', fmt(costo), "Costo nómina estimado", "+5%", false)}
    </div>

    <div class="grid section-gap" style="grid-template-columns:1fr 1fr;">
      <div class="card">
        <div class="card__head"><div><h3>Horas extras del mes</h3><p>Total acumulado: ${totalExtras}h · ${fmt(state.trabajadores.reduce((s, t) => s + calcNomina(t).montoExtras, 0))}</p></div></div>
        <div class="card__body">
          ${topExtras.length ? `<div class="hbar">${topExtras.map((t) => { const n = calcNomina(t); const mx = Math.max(...topExtras.map((x) => x.horasExtrasMes)); return `
            <div class="hbar-row" style="grid-template-columns:130px 1fr 96px">
              <span class="nm">${t.nombre}</span>
              <div class="track"><i style="width:${(t.horasExtrasMes / mx) * 100}%"></i></div>
              <span class="vl">${t.horasExtrasMes}h · ${fmt(n.montoExtras)}</span></div>`; }).join("")}</div>` : `<div class="empty"><h3>Sin horas extras</h3></div>`}
        </div>
      </div>
      <div class="card">
        <div class="card__head"><div><h3>Asistiendo hoy</h3><p>${hoy.length} trabajadores activos en turno · ${DIAS_LARGOS[hoyIdx - 1]}</p></div></div>
        <div class="card__body"><div class="today-list">
          ${hoy.length ? hoy.map((t) => `<div class="today-item">
            <div class="avatar" style="background:${t.color}">${initials(t.nombre)}</div>
            <div class="meta"><strong>${t.nombre}</strong><span>${t.cargo}</span></div>
            ${turnoBadge(t.turno)}<span class="badge badge--gray">${t.horario[hoyIdx].in}–${t.horario[hoyIdx].out}</span></div>`).join("") : `<div class="empty"><h3>Nadie en turno hoy</h3></div>`}
        </div></div>
      </div>
    </div>

    <div class="grid section-gap" style="grid-template-columns:1.5fr 1fr;">
      <div class="card">
        <div class="card__head"><div><h3>${MESES[PERIODO.m]} ${PERIODO.y}</h3><p>Calendario del mes y cobertura por día</p></div></div>
        <div class="card__body">${monthCalendar()}</div>
      </div>
      <div class="card">
        <div class="card__head"><div><h3>Distribución por contrato</h3></div></div>
        <div class="card__body"><div class="donut-wrap">${donutChart(porContrato)}
          <div class="donut-legend">${porContrato.map((d) => `<div class="dl"><i style="background:${d.color}"></i><span>${d.label}</span><b>${d.value}</b></div>`).join("")}</div></div></div>
      </div>
    </div>

    <div class="card section-gap">
      <div class="card__head"><div><h3>Cobertura semanal</h3><p>Trabajadores activos por día</p></div></div>
      <div class="card__body">${barChart(cobertura)}</div>
    </div>`;
}

/* ---------- TRABAJADORES ---------- */
function contratoChips() {
  return [["all", "Todos"], ...state.contratos.map((c) => [c.id, c.nombre.split(" (")[0]])]
    .map(([id, lbl]) => `<button class="chip ${ui.fContrato === id ? "is-active" : ""}" data-contrato="${id}">${lbl}</button>`).join("");
}
function filteredWorkers() {
  return state.trabajadores.filter((t) => {
    if (ui.fContrato !== "all" && t.contratoId !== ui.fContrato) return false;
    if (ui.fEstado !== "all" && t.estado !== ui.fEstado) return false;
    if (ui.search) {
      const q = ui.search.toLowerCase();
      if (!(t.nombre.toLowerCase().includes(q) || t.cargo.toLowerCase().includes(q) || (t.rut || "").toLowerCase().includes(q))) return false;
    }
    return true;
  });
}
function renderTrabajadores() {
  const list = filteredWorkers();
  return `
    <div class="toolbar">
      <div class="chip-group" id="chipsContrato">${contratoChips()}</div>
      <select class="select" id="filterEstado">
        <option value="all">Todos los estados</option>
        ${ESTADOS.map((e) => `<option value="${e}" ${ui.fEstado === e ? "selected" : ""}>${e}</option>`).join("")}
      </select>
      <div class="spacer"></div>
      <span class="stat-pill"><svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3m-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3"/></svg><b>${list.length}</b> trabajadores</span>
      <button class="btn btn--primary" data-action="new-worker"><svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/></svg><span>Nuevo</span></button>
    </div>

    <div class="bulk-bar" id="bulkBar" hidden>
      <svg viewBox="0 0 24 24"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
      <span><b id="bulkCount">0</b> seleccionados</span>
      <div class="spacer"></div>
      <button class="btn btn--soft btn--sm" data-action="bulk-clear">Limpiar selección</button>
      <button class="btn btn--danger btn--sm" data-action="bulk-delete"><svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"/></svg>Eliminar seleccionados</button>
    </div>

    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr>
          <th class="chk-col"><label class="cbox"><input type="checkbox" id="selAll"><span></span></label></th>
          <th>Trabajador</th><th>Cargo / Rol</th><th>Contrato</th><th>Turno</th>
          <th>Horario</th><th class="num">Sueldo base</th><th class="center">Estado</th><th></th>
        </tr></thead>
        <tbody>
          ${list.length ? list.map(rowWorker).join("") : `<tr><td colspan="9"><div class="empty"><svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3m-8 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13"/></svg><h3>Sin resultados</h3><p>Ajusta los filtros o agrega un trabajador.</p></div></td></tr>`}
        </tbody>
      </table></div>
    </div>`;
}
function rowWorker(t) {
  const ct = getContrato(t.contratoId), hr = horarioResumen(t);
  return `<tr data-row="${t.id}">
    <td class="chk-col"><label class="cbox"><input type="checkbox" data-sel="${t.id}"><span></span></label></td>
    <td><div class="cell-person"><div class="avatar" style="background:${t.color}">${initials(t.nombre)}</div>
      <div class="cell-person__txt"><strong>${t.nombre}</strong><span>${t.rut || ""}</span></div></div></td>
    <td><div style="display:flex;flex-direction:column;gap:4px"><span style="color:var(--ink);font-weight:600">${t.cargo}</span>${rolBadge(t.rol)}</div></td>
    <td><span class="contract-tag"><span class="swatch" style="background:${ct?.color || "#999"}"></span>${ct ? ct.nombre.split(" (")[0] : "—"}</span></td>
    <td>${turnoBadge(t.turno)}</td>
    <td><div style="display:flex;flex-direction:column;gap:3px"><span style="color:var(--ink-2);font-weight:600">${hr.txt}</span><span style="font-size:11.5px;color:var(--muted)">${hr.dias} días · ${weekHours(t)}h/sem</span></div></td>
    <td class="num" style="font-weight:700;color:var(--ink)">${fmt(t.sueldoBase)}</td>
    <td class="center">${estadoBadge(t.estado)}</td>
    <td><div class="row-actions">
      <button data-edit="${t.id}" title="Editar"><svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z"/></svg></button>
      <button class="del" data-del="${t.id}" title="Eliminar"><svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"/></svg></button>
    </div></td>
  </tr>`;
}

/* ---------- HORARIOS ---------- */
function renderHorarios() {
  const list = filteredWorkers().filter((t) => t.estado !== "Inactivo");
  return `
    <div class="toolbar">
      <div class="chip-group" id="chipsContrato">${contratoChips()}</div>
      <div class="spacer"></div>
      <div class="legend">${Object.entries(TURNO_STYLE).map(([k, v]) => `<span><i style="background:${v.bd}"></i>${k}</span>`).join("")}</div>
    </div>
    <div class="card">
      <div class="card__head"><div><h3>Planificación semanal</h3><p>Haz clic en una fila para editar el horario por día</p></div></div>
      <div class="schedule"><div class="sched-grid">
        <div class="sched-row sched-head"><div class="sched-cell">Trabajador</div>${DIAS_SEMANA.map((d) => `<div class="sched-cell">${d}</div>`).join("")}</div>
        ${list.map((t) => {
          const s = TURNO_STYLE[t.turno] || TURNO_STYLE["Flexible"];
          return `<div class="sched-row" data-edit="${t.id}" style="cursor:pointer">
            <div class="sched-cell sched-name"><div class="avatar" style="background:${t.color};width:32px;height:32px;font-size:12px">${initials(t.nombre)}</div>
              <div class="cell-person__txt"><strong>${t.nombre}</strong><span>${t.cargo}</span></div></div>
            ${DIAS_SEMANA.map((_, i) => { const hd = t.horario[i + 1]; return hd?.on
              ? `<div class="sched-cell"><div class="shift" style="background:${s.bg};color:${s.fg};border-left-color:${s.bd}">${t.turno}<small>${hd.in}–${hd.out}</small></div></div>`
              : `<div class="sched-cell"><div class="shift shift--off">Libre</div></div>`; }).join("")}
          </div>`;
        }).join("")}
      </div></div>
    </div>`;
}

/* ---------- ASISTENCIA ---------- */
function renderAsistencia() {
  const list = filteredWorkers();
  return `
    <div class="toolbar">
      <div class="chip-group" id="chipsContrato">${contratoChips()}</div>
      <div class="spacer"></div>
      <span class="stat-pill"><svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m0 16H5V10h14z"/></svg>Periodo: <b>${MESES[PERIODO.m]} ${PERIODO.y}</b></span>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Trabajador</th><th>Contrato</th><th>Resumen del mes</th><th class="num">Total estimado</th><th class="center">Nómina</th></tr></thead>
      <tbody>
        ${list.map((t) => {
          const s = asistStats(ensureAsistencia(t)), n = calcNomina(t);
          return `<tr>
            <td><div class="cell-person"><div class="avatar" style="background:${t.color}">${initials(t.nombre)}</div><div class="cell-person__txt"><strong>${t.nombre}</strong><span>${t.cargo}</span></div></div></td>
            <td><span class="contract-tag"><span class="swatch" style="background:${getContrato(t.contratoId)?.color}"></span>${getContrato(t.contratoId)?.nombre.split(" (")[0]}</span></td>
            <td><div class="att-mini">
              <span class="att-pill att-trabajo" title="Días trabajados">${s.trabajo} trab.</span>
              <span class="att-pill att-falta" title="Faltas">${s.falta} faltas</span>
              <span class="att-pill att-libre" title="Días libres">${s.libre} libres</span>
              ${s.feriado ? `<span class="att-pill att-feriado" title="Feriados">${s.feriado} fer.</span>` : ""}
            </div></td>
            <td class="num" style="font-weight:700;color:var(--ink)">${fmt(n.total)}</td>
            <td class="center"><button class="btn btn--soft btn--sm" data-attend="${t.id}"><svg viewBox="0 0 24 24" style="width:15px"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5M12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10m0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6"/></svg>Ver nómina del mes</button></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table></div></div>`;
}

/* ---------- NÓMINA ---------- */
function renderNomina() {
  const list = filteredWorkers();
  const tot = list.reduce((a, t) => { const n = calcNomina(t); a.base += t.sueldoBase; a.extras += n.montoExtras; a.total += n.total; return a; }, { base: 0, extras: 0, total: 0 });
  return `
    <div class="toolbar">
      <div class="chip-group" id="chipsContrato">${contratoChips()}</div>
      <div class="spacer"></div>
      <button class="btn btn--ghost" data-action="export"><svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7zM5 18v2h14v-2z"/></svg>Exportar CSV</button>
    </div>
    <div class="kpis" style="grid-template-columns:repeat(4,1fr);margin-bottom:18px">
      <div class="kpi k-indigo"><div class="kpi__label">Trabajadores</div><div class="kpi__val" style="font-size:24px">${list.length}</div></div>
      <div class="kpi k-violet"><div class="kpi__label">Sueldos base</div><div class="kpi__val" style="font-size:22px">${fmt(tot.base)}</div></div>
      <div class="kpi k-amber"><div class="kpi__label">Horas extras</div><div class="kpi__val" style="font-size:22px">${fmt(tot.extras)}</div></div>
      <div class="kpi k-emerald"><div class="kpi__label">Total a pagar</div><div class="kpi__val" style="font-size:22px">${fmt(tot.total)}</div></div>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Trabajador</th><th>Contrato</th><th class="num">Sueldo base</th><th class="num">Valor hora extra</th><th class="num">Horas extras</th><th class="num">Total a pagar</th></tr></thead>
      <tbody>
        ${list.map((t) => { const n = calcNomina(t); return `<tr>
          <td><div class="cell-person"><div class="avatar" style="background:${t.color}">${initials(t.nombre)}</div><div class="cell-person__txt"><strong>${t.nombre}</strong><span>${t.cargo}</span></div></div></td>
          <td><span class="contract-tag"><span class="swatch" style="background:${getContrato(t.contratoId)?.color}"></span>${getContrato(t.contratoId)?.nombre.split(" (")[0]}</span></td>
          <td class="num">${fmt(t.sueldoBase)}</td>
          <td class="num">${n.valorHoraExtra ? fmt(n.valorHoraExtra) : "—"}</td>
          <td class="num">${n.horas ? `${n.horas}h · <b style="color:var(--amber)">${fmt(n.montoExtras)}</b>` : "—"}</td>
          <td class="num" style="font-weight:800;color:var(--primary-600)">${fmt(n.total)}</td></tr>`; }).join("")}
      </tbody>
    </table></div></div>`;
}

/* ---------- CONTRATOS ---------- */
function renderContratos() {
  return `
    <div class="section-title"><div><h2>Tipos de contrato y empresas</h2><p>Define los valores por defecto que se aplican al asignar un trabajador</p></div>
      <button class="btn btn--primary" data-action="new-contract"><svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/></svg><span>Nuevo contrato</span></button></div>
    <div class="contract-cards">
      ${state.contratos.map((c) => { const n = state.trabajadores.filter((t) => t.contratoId === c.id).length; return `
        <div class="ctr-card"><div class="ctr-card__bar" style="background:${c.color}"></div>
          <div class="ctr-card__top"><div style="display:flex;gap:12px;align-items:center">
            <div class="ctr-card__ic" style="background:${c.color}">${initials(c.nombre)}</div>
            <div><h3>${c.nombre}</h3><span class="type">${c.tipo}</span></div></div>
            <div class="row-actions">
              <button data-edit-contract="${c.id}" title="Editar"><svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z"/></svg></button>
              <button class="del" data-del-contract="${c.id}" title="Eliminar"><svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"/></svg></button></div></div>
          <p style="font-size:12.5px;color:var(--muted);min-height:34px">${c.descripcion}</p>
          <div class="ctr-card__stats">
            <div class="ctr-stat"><span>Sueldo base ref.</span><strong>${fmt(c.sueldoBase)}</strong></div>
            <div class="ctr-stat"><span>Jornada</span><strong>${c.jornadaSemanal}h / sem</strong></div>
            <div class="ctr-stat"><span>Factor extra</span><strong>×${c.factorExtra}</strong></div>
            <div class="ctr-stat"><span>Turno defecto</span><strong>${c.turnoDefecto}</strong></div></div>
          <div class="ctr-card__foot"><span class="ctr-card__count">${n} ${n === 1 ? "trabajador" : "trabajadores"}</span>
            <button class="btn btn--soft btn--sm" data-edit-contract="${c.id}">Configurar</button></div>
        </div>`; }).join("")}
    </div>`;
}

/* ---------- REPORTES ---------- */
function renderReportes() {
  const porRol = ROLES.map((r) => ({ label: r, value: state.trabajadores.filter((t) => t.rol === r).length }));
  const porEstado = ESTADOS.map((e) => ({ label: e, value: state.trabajadores.filter((t) => t.estado === e).length })).filter((d) => d.value);
  const cc = ["#10b981", "#f43f5e", "#0ea5e9", "#f59e0b"];
  const costoContrato = state.contratos.map((c) => ({ nombre: c.nombre, color: c.color, costo: state.trabajadores.filter((t) => t.contratoId === c.id).reduce((s, t) => s + calcNomina(t).total, 0) })).sort((a, b) => b.costo - a.costo);
  const maxCosto = Math.max(...costoContrato.map((c) => c.costo), 1);
  return `
    <div class="grid" style="grid-template-columns:1fr 1fr;">
      <div class="card"><div class="card__head"><div><h3>Dotación por rol</h3></div></div><div class="card__body">${barChart(porRol)}</div></div>
      <div class="card"><div class="card__head"><div><h3>Distribución por estado</h3></div></div>
        <div class="card__body"><div class="donut-wrap">${donutChart(porEstado.map((d, i) => ({ ...d, color: cc[i] })))}
          <div class="donut-legend">${porEstado.map((d, i) => `<div class="dl"><i style="background:${cc[i]}"></i><span>${d.label}</span><b>${d.value}</b></div>`).join("")}</div></div></div></div>
    </div>
    <div class="card section-gap"><div class="card__head"><div><h3>Costo por empresa / contrato</h3><p>Gasto mensual estimado por proveedor</p></div></div>
      <div class="card__body"><div class="hbar">${costoContrato.map((c) => `
        <div class="hbar-row" style="grid-template-columns:190px 1fr 120px"><span class="nm">${c.nombre}</span>
          <div class="track"><i style="width:${(c.costo / maxCosto) * 100}%;background:${c.color}"></i></div>
          <span class="vl">${fmt(c.costo)}</span></div>`).join("")}</div></div></div>
    <div class="card section-gap"><div class="card__head"><div><h3>Datos y mantenimiento</h3><p>Importa, exporta o restablece la información</p></div></div>
      <div class="card__body" style="display:flex;gap:12px;flex-wrap:wrap">
        <button class="btn btn--ghost" data-action="import"><svg viewBox="0 0 24 24"><path d="M5 20h14v-2H5zM5 10h4v6h6v-6h4l-7-7z"/></svg>Importar desde Excel</button>
        <button class="btn btn--ghost" data-action="export"><svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7zM5 18v2h14v-2z"/></svg>Exportar nómina (CSV)</button>
        <button class="btn btn--danger" data-action="reset"><svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8"/></svg>Restablecer datos de ejemplo</button>
      </div></div>`;
}

/* ============================================================
   MODALES
   ============================================================ */
const modal = $("#modal");
function openModal(title, body, foot) {
  $("#modalTitle").textContent = title;
  $("#modalBody").innerHTML = body;
  $("#modalFoot").innerHTML = foot;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}
function closeModal() { modal.classList.remove("is-open"); modal.setAttribute("aria-hidden", "true"); }

/* ---- Modal trabajador ---- */
function defaultHorario() {
  const h = {};
  for (let d = 1; d <= 7; d++) h[d] = d <= 5 ? { on: true, in: "08:00", out: "17:00" } : { on: false, in: "", out: "" };
  return h;
}
function openWorkerModal(id) {
  const editing = !!id;
  const c0 = state.contratos[0];
  const t = editing ? { ...state.trabajadores.find((x) => x.id === id) }
    : { id: "t" + Date.now(), nombre: "", rut: "", cargo: "Cajero", rol: "Empleado", contratoId: c0?.id, turno: c0?.turnoDefecto || "Mañana", estado: "Activo", color: pickColor(), ingreso: new Date().toISOString().slice(0, 10), sueldoBase: c0?.sueldoBase || 600000, valorHoraExtra: Math.round((c0?.sueldoBase || 600000) / 180 * (c0?.factorExtra || 1.5) / 100) * 100, horasExtrasMes: 0, horario: defaultHorario(), asistencia: {} };

  const opt = (arr, val) => arr.map((o) => `<option value="${o}" ${o === val ? "selected" : ""}>${o}</option>`).join("");
  const body = `
    <form id="workerForm" class="form-grid">
      <div class="field col-2"><label>Nombre completo</label><input name="nombre" value="${t.nombre}" placeholder="Ej: María González" required></div>
      <div class="field"><label>RUT</label><input name="rut" value="${t.rut}" placeholder="12.345.678-9"></div>
      <div class="field"><label>Fecha de ingreso</label><input type="date" name="ingreso" value="${t.ingreso || ""}"></div>
      <div class="field"><label>Cargo</label><select name="cargo">${opt(CARGOS, t.cargo)}</select></div>
      <div class="field"><label>Rol / Jerarquía</label><select name="rol">${opt(ROLES, t.rol)}</select></div>
      <div class="field col-2"><label>Tipo de contrato / Empresa</label>
        <select name="contratoId" id="ctrSelect">${state.contratos.map((c) => `<option value="${c.id}" ${c.id === t.contratoId ? "selected" : ""}>${c.nombre}</option>`).join("")}</select>
        <span class="hint" id="ctrHint"></span></div>
      <div class="field"><label>Turno (etiqueta/color)</label><select name="turno" id="turnoSelect">${opt(TURNOS, t.turno)}</select></div>
      <div class="field"><label>Estado</label><select name="estado">${opt(ESTADOS, t.estado)}</select></div>

      <div class="field col-2"><label>Horario semanal por día</label>
        <div class="day-sched" id="daySched">
          ${[1, 2, 3, 4, 5, 6, 7].map((d) => { const hd = t.horario[d] || { on: false, in: "08:00", out: "17:00" }; return `
            <div class="day-row ${hd.on ? "" : "is-off"}" data-day="${d}">
              <span class="day-name">${DIAS_LARGOS[d - 1]}</span>
              <label class="switch"><input type="checkbox" class="day-on" ${hd.on ? "checked" : ""}><span class="switch__t"></span></label>
              <div class="day-times">
                <input type="time" class="day-in" value="${hd.in || "08:00"}" ${hd.on ? "" : "disabled"}>
                <span class="sep">a</span>
                <input type="time" class="day-out" value="${hd.out || "17:00"}" ${hd.on ? "" : "disabled"}>
              </div>
              <span class="day-hours"></span>
            </div>`; }).join("")}
        </div>
        <span class="hint" id="weekTotal"></span></div>

      <div class="field col-2"><label>Sueldo base (mensual)</label><input type="number" name="sueldoBase" id="sueldoInput" value="${t.sueldoBase}" min="0" step="1000"></div>

      <div class="field col-2"><div class="ot-box">
        <div class="ot-box__head"><svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2M12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8m.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg> Horas extras del mes</div>
        <div class="ot-box__grid">
          <div class="field"><label>Valor por hora extra</label><input type="number" id="vheInput" name="valorHoraExtra" value="${t.valorHoraExtra}" min="0" step="100"></div>
          <div class="field"><label>Horas extras realizadas</label><input type="number" id="heInput" name="horasExtrasMes" value="${t.horasExtrasMes}" min="0"></div>
        </div>
        <div class="ot-box__total" id="otTotal"></div>
      </div></div>

      <div class="field col-2"><label>Resumen de remuneración</label><div class="calc-box" id="calcBox"></div></div>
    </form>`;
  const foot = `<button class="btn btn--soft" data-close>Cancelar</button><button class="btn btn--primary" id="saveWorker">${editing ? "Guardar cambios" : "Crear trabajador"}</button>`;
  openModal(editing ? "Editar trabajador" : "Nuevo trabajador", body, foot);

  const recalc = () => {
    const base = +$("#sueldoInput").value || 0, vhe = +$("#vheInput").value || 0, he = +$("#heInput").value || 0;
    const ot = vhe * he;
    $("#otTotal").innerHTML = `Total horas extras: <b>${fmt(ot)}</b> · se suma al sueldo base`;
    $("#calcBox").innerHTML = `
      <div class="calc-row"><span>Sueldo base del mes</span><span>${fmt(base)}</span></div>
      <div class="calc-row"><span>Horas extras (${he}h × ${fmt(vhe)})</span><span style="color:var(--amber)">+${fmt(ot)}</span></div>
      <div class="calc-row total"><span>Total a pagar</span><b>${fmt(base + ot)}</b></div>`;
  };
  const refreshDay = (row) => {
    const on = row.querySelector(".day-on").checked;
    row.classList.toggle("is-off", !on);
    row.querySelector(".day-in").disabled = !on;
    row.querySelector(".day-out").disabled = !on;
    const h = on ? dayHours(row.querySelector(".day-in").value, row.querySelector(".day-out").value) : 0;
    row.querySelector(".day-hours").textContent = on ? `${h}h` : "Libre";
  };
  const refreshWeek = () => { let tot = 0; $$("#daySched .day-row").forEach((r) => { if (r.querySelector(".day-on").checked) tot += dayHours(r.querySelector(".day-in").value, r.querySelector(".day-out").value); }); $("#weekTotal").innerHTML = `Total semanal: <b>${tot}h</b>. Activa cada día y define su horario (ej: lunes 08:00–17:00, viernes 08:00–16:00).`; };
  const showHint = () => { const c = getContrato($("#ctrSelect").value); $("#ctrHint").textContent = c ? `Por defecto: ${fmt(c.sueldoBase)} · jornada ${c.jornadaSemanal}h · factor extra ×${c.factorExtra} · turno ${c.turnoDefecto}` : ""; };

  $$("#daySched .day-row").forEach(refreshDay);
  refreshWeek(); showHint(); recalc();

  $("#daySched").addEventListener("change", (e) => { const row = e.target.closest(".day-row"); if (row) { refreshDay(row); refreshWeek(); } });
  $("#daySched").addEventListener("input", (e) => { if (e.target.matches(".day-in,.day-out")) { const row = e.target.closest(".day-row"); refreshDay(row); refreshWeek(); } });

  $("#ctrSelect").addEventListener("change", (e) => {
    const c = getContrato(e.target.value);
    if (c) {
      $("#sueldoInput").value = c.sueldoBase;
      $("#turnoSelect").value = c.turnoDefecto;
      $("#vheInput").value = Math.round(c.sueldoBase / 180 * c.factorExtra / 100) * 100;
      applyTurno(c.turnoDefecto);
      toast("Valores del contrato aplicados (editables)", "info");
    }
    showHint(); recalc();
  });
  function applyTurno(turno) {
    const h = TURNO_HORAS[turno]; if (!h) return;
    $$("#daySched .day-row").forEach((row) => { if (row.querySelector(".day-on").checked) { row.querySelector(".day-in").value = h[0]; row.querySelector(".day-out").value = h[1]; refreshDay(row); } });
    refreshWeek();
  }
  $("#turnoSelect").addEventListener("change", (e) => applyTurno(e.target.value));
  ["#sueldoInput", "#vheInput", "#heInput"].forEach((s) => $(s).addEventListener("input", recalc));

  $("#saveWorker").addEventListener("click", () => {
    const fd = new FormData($("#workerForm"));
    if (!fd.get("nombre").trim()) { toast("El nombre es obligatorio", "warn"); return; }
    const horario = {};
    $$("#daySched .day-row").forEach((row) => {
      const d = +row.dataset.day, on = row.querySelector(".day-on").checked;
      horario[d] = on ? { on: true, in: row.querySelector(".day-in").value || "08:00", out: row.querySelector(".day-out").value || "17:00" } : { on: false, in: "", out: "" };
    });
    const obj = { ...t, nombre: fd.get("nombre").trim(), rut: fd.get("rut").trim(), cargo: fd.get("cargo"), rol: fd.get("rol"), contratoId: fd.get("contratoId"), turno: fd.get("turno"), estado: fd.get("estado"), ingreso: fd.get("ingreso"), sueldoBase: +fd.get("sueldoBase") || 0, valorHoraExtra: +fd.get("valorHoraExtra") || 0, horasExtrasMes: +fd.get("horasExtrasMes") || 0, horario };
    const idx = state.trabajadores.findIndex((x) => x.id === t.id);
    if (idx >= 0) state.trabajadores[idx] = obj; else state.trabajadores.push(obj);
    save(); closeModal(); navigate(ui.view);
    toast(editing ? "Trabajador actualizado" : "Trabajador creado", "ok");
  });
}

/* ---- Modal contrato ---- */
function openContractModal(id) {
  const editing = !!id;
  const c = editing ? { ...state.contratos.find((x) => x.id === id) }
    : { id: "ct-" + Date.now(), nombre: "", tipo: "Suministro de personal", color: pickColor(), sueldoBase: 600000, factorExtra: 1.5, jornadaSemanal: 45, turnoDefecto: "Mañana", descripcion: "" };
  const palette = ["#6366f1", "#0ea5e9", "#f59e0b", "#14b8a6", "#f43f5e", "#8b5cf6", "#10b981", "#ec4899"];
  const body = `
    <form id="contractForm" class="form-grid">
      <div class="field col-2"><label>Nombre del contrato / empresa</label><input name="nombre" value="${c.nombre}" placeholder="Ej: Manpower, SOS Externa…" required></div>
      <div class="field col-2"><label>Tipo</label><select name="tipo">${["Contrato indefinido", "Contrato a plazo fijo", "Suministro de personal", "Servicio externalizado", "Prestación de servicios", "Honorarios"].map((o) => `<option ${o === c.tipo ? "selected" : ""}>${o}</option>`).join("")}</select></div>
      <div class="field"><label>Sueldo base referencial</label><input type="number" name="sueldoBase" value="${c.sueldoBase}" min="0" step="1000"></div>
      <div class="field"><label>Jornada semanal (h)</label><input type="number" name="jornadaSemanal" value="${c.jornadaSemanal}" min="1" max="45"></div>
      <div class="field"><label>Factor hora extra</label><input type="number" name="factorExtra" value="${c.factorExtra}" min="1" step="0.1"></div>
      <div class="field"><label>Turno por defecto</label><select name="turnoDefecto">${TURNOS.map((o) => `<option ${o === c.turnoDefecto ? "selected" : ""}>${o}</option>`).join("")}</select></div>
      <div class="field col-2"><label>Descripción</label><textarea name="descripcion" placeholder="Detalle del contrato o proveedor…">${c.descripcion}</textarea></div>
      <div class="field col-2"><label>Color identificador</label><div class="field-row" id="colorPicker" style="flex-wrap:wrap;gap:8px">
        ${palette.map((p) => `<button type="button" data-color="${p}" style="width:30px;height:30px;border-radius:9px;background:${p};${p === c.color ? "box-shadow:0 0 0 3px var(--surface),0 0 0 5px " + p : ""}"></button>`).join("")}</div></div>
    </form>`;
  const foot = `<button class="btn btn--soft" data-close>Cancelar</button><button class="btn btn--primary" id="saveContract">${editing ? "Guardar cambios" : "Crear contrato"}</button>`;
  openModal(editing ? "Editar contrato" : "Nuevo contrato", body, foot);

  let chosen = c.color;
  $("#colorPicker").addEventListener("click", (e) => { const b = e.target.closest("[data-color]"); if (!b) return; chosen = b.dataset.color; $$("#colorPicker [data-color]").forEach((x) => x.style.boxShadow = "none"); b.style.boxShadow = `0 0 0 3px var(--surface),0 0 0 5px ${chosen}`; });
  $("#saveContract").addEventListener("click", () => {
    const fd = new FormData($("#contractForm"));
    if (!fd.get("nombre").trim()) { toast("El nombre es obligatorio", "warn"); return; }
    const obj = { ...c, nombre: fd.get("nombre").trim(), tipo: fd.get("tipo"), color: chosen, sueldoBase: +fd.get("sueldoBase") || 0, jornadaSemanal: +fd.get("jornadaSemanal") || 45, factorExtra: +fd.get("factorExtra") || 1.5, turnoDefecto: fd.get("turnoDefecto"), descripcion: fd.get("descripcion").trim() };
    const idx = state.contratos.findIndex((x) => x.id === c.id);
    if (idx >= 0) state.contratos[idx] = obj; else state.contratos.push(obj);
    save(); closeModal(); navigate(ui.view);
    toast(editing ? "Contrato actualizado" : "Contrato creado", "ok");
  });
}

/* ---- Modal asistencia + nómina del mes ---- */
function openAttendanceModal(id) {
  const w = state.trabajadores.find((x) => x.id === id);
  ensureAsistencia(w);
  const att = JSON.parse(JSON.stringify(w.asistencia));
  let vhe = w.valorHoraExtra || 0, he = w.horasExtrasMes || 0;
  const ct = getContrato(w.contratoId);

  const body = `
    <div class="att-modal">
      <div class="att-head">
        <div class="avatar" style="background:${w.color};width:48px;height:48px;font-size:16px">${initials(w.nombre)}</div>
        <div><strong style="font-size:16px;color:var(--ink)">${w.nombre}</strong><div style="font-size:12.5px;color:var(--muted)">${w.cargo} · ${ct ? ct.nombre.split(" (")[0] : ""}</div></div>
      </div>
      <div class="att-legend">
        <span><i class="att-trabajo"></i> Trabajó</span>
        <span><i class="att-falta"></i> Faltó</span>
        <span><i class="att-libre"></i> Libre</span>
        <span><i class="att-feriado"></i> Feriado</span>
        <span class="att-hint">Haz clic en un día para cambiar su estado</span>
      </div>
      <div id="attCalWrap"></div>
      <div class="att-counts" id="attCounts"></div>
      <div class="ot-box" style="margin-top:16px">
        <div class="ot-box__head"><svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2M12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg> Horas extras del mes</div>
        <div class="ot-box__grid">
          <div class="field"><label>Valor por hora extra</label><input type="number" id="attVhe" value="${vhe}" min="0" step="100"></div>
          <div class="field"><label>Horas extras realizadas</label><input type="number" id="attHe" value="${he}" min="0"></div>
        </div>
      </div>
      <div class="calc-box" id="attPay" style="margin-top:14px"></div>
    </div>`;
  const foot = `<button class="btn btn--soft" data-close>Cerrar</button><button class="btn btn--primary" id="saveAtt">Guardar cambios</button>`;
  openModal(`Nómina y asistencia · ${MESES[PERIODO.m]} ${PERIODO.y}`, body, foot);

  const renderCal = () => { $("#attCalWrap").innerHTML = attendanceCalendar(att); };
  const renderStats = () => {
    const s = asistStats(att), ot = vhe * he;
    $("#attCounts").innerHTML = `
      <span class="att-pill att-trabajo">${s.trabajo} trabajados</span>
      <span class="att-pill att-falta">${s.falta} faltas</span>
      <span class="att-pill att-libre">${s.libre} libres</span>
      <span class="att-pill att-feriado">${s.feriado} feriados</span>`;
    $("#attPay").innerHTML = `
      <div class="calc-row"><span>Sueldo base del mes</span><span>${fmt(w.sueldoBase)}</span></div>
      <div class="calc-row"><span>Horas extras (${he}h × ${fmt(vhe)})</span><span style="color:var(--amber)">+${fmt(ot)}</span></div>
      <div class="calc-row total"><span>Total a pagar</span><b>${fmt(w.sueldoBase + ot)}</b></div>`;
  };
  renderCal(); renderStats();

  $("#attCalWrap").addEventListener("click", (e) => {
    const cell = e.target.closest(".acal-cell[data-day]"); if (!cell) return;
    const d = +cell.dataset.day, k = dateKey(PERIODO.y, PERIODO.m, d);
    const cur = att[k] || "libre";
    att[k] = ATTEND_ORDER[(ATTEND_ORDER.indexOf(cur) + 1) % ATTEND_ORDER.length];
    renderCal(); renderStats();
  });
  $("#attVhe").addEventListener("input", (e) => { vhe = +e.target.value || 0; renderStats(); });
  $("#attHe").addEventListener("input", (e) => { he = +e.target.value || 0; renderStats(); });
  $("#saveAtt").addEventListener("click", () => {
    w.asistencia = att; w.valorHoraExtra = vhe; w.horasExtrasMes = he;
    save(); closeModal(); navigate(ui.view); toast("Asistencia y nómina guardadas", "ok");
  });
}
function attendanceCalendar(att) {
  const { y, m } = PERIODO, dim = daysInMonth(y, m), firstWd = weekdayOf(y, m, 1);
  const isThisMonth = NOW.getFullYear() === y && NOW.getMonth() === m;
  let cells = "";
  for (let i = 1; i < firstWd; i++) cells += `<div class="acal-cell is-blank"></div>`;
  for (let d = 1; d <= dim; d++) {
    const k = dateKey(y, m, d), st = att[k] || "libre", today = isThisMonth && NOW.getDate() === d;
    cells += `<div class="acal-cell att-${st} ${today ? "is-today" : ""}" data-day="${d}" title="${DIAS_LARGOS[weekdayOf(y, m, d) - 1]} ${d} · ${ATTEND_LABEL[st]}">${d}</div>`;
  }
  return `<div class="acal"><div class="acal-head">${DIAS_SEMANA.map((x) => `<div>${x}</div>`).join("")}</div><div class="acal-grid">${cells}</div></div>`;
}

/* ---- Modal importar Excel (Asistente) ---- */
const IMPORT_COLS = [
  ["Nombre", "Texto · obligatorio", "María González"],
  ["RUT", "Texto", "18.452.114-2"],
  ["Cargo", "Texto", "Cajero"],
  ["Rol", "Administrador / Supervisor / Empleado", "Empleado"],
  ["Empresa", "Nombre del contrato", "Manpower"],
  ["Turno", "Mañana / Tarde / Noche / Rotativo / Flexible", "Mañana"],
  ["Estado", "Activo / Inactivo / Vacaciones / Licencia", "Activo"],
  ["Sueldo base", "Número", "560000"],
  ["Valor hora extra", "Número", "4700"],
  ["Horas extras", "Número", "8"]
];
function openImportModal() {
  const body = `
    <div class="import">
      <div class="import__intro">
        <svg class="claude-ic" viewBox="0 0 100 100"><g stroke="#D97757" stroke-width="8.5" stroke-linecap="round"><line x1="50" y1="36" x2="50" y2="7"/><line x1="57" y1="37.9" x2="72" y2="11.9"/><line x1="62.1" y1="43" x2="88.1" y2="28"/><line x1="64" y1="50" x2="93" y2="50"/><line x1="62.1" y1="57" x2="88.1" y2="72"/><line x1="57" y1="62.1" x2="72" y2="88.1"/><line x1="50" y1="64" x2="50" y2="93"/><line x1="43" y1="62.1" x2="28" y2="88.1"/><line x1="37.9" y1="57" x2="11.9" y2="72"/><line x1="36" y1="50" x2="7" y2="50"/><line x1="37.9" y1="43" x2="11.9" y2="28"/><line x1="43" y1="37.9" x2="28" y2="11.9"/></g></svg>
        <div><strong>Asistente de importación</strong><p>Sube una planilla Excel (.xlsx) o CSV. Detectaré los trabajadores y <b>agregaré los nuevos</b> o <b>actualizaré</b> los que ya existan (los identifico por RUT, o por nombre si no hay RUT).</p></div>
      </div>
      <div class="import__guide">
        <div class="import__guide-head">Tu Excel debe tener esta primera fila (encabezados):</div>
        <div class="table-wrap"><table class="mini-table"><thead><tr><th>Columna</th><th>Formato</th><th>Ejemplo</th></tr></thead><tbody>
          ${IMPORT_COLS.map(([c, f, e]) => `<tr><td><b>${c}</b></td><td style="color:var(--muted)">${f}</td><td><code>${e}</code></td></tr>`).join("")}
        </tbody></table></div>
        <p class="hint" style="margin-top:8px">Solo <b>Nombre</b> es obligatorio. Las columnas que falten conservan su valor actual (o usan el del contrato).</p>
      </div>
      <button class="btn btn--soft btn--block" id="tplBtn"><svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7zM5 18v2h14v-2z"/></svg>Descargar plantilla de ejemplo (.xlsx)</button>
      <label class="dropzone" id="dropzone">
        <svg viewBox="0 0 24 24"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96M14 13v4h-4v-4H7l5-5 5 5z"/></svg>
        <strong>Haz clic o arrastra tu archivo aquí</strong>
        <span>Formatos aceptados: .xlsx, .xls, .csv</span>
        <input type="file" id="importFile" accept=".xlsx,.xls,.csv" hidden>
      </label>
      <div id="importResult"></div>
    </div>`;
  openModal("Importar desde Excel", body, `<button class="btn btn--soft" data-close>Cerrar</button>`);

  $("#tplBtn").addEventListener("click", downloadTemplate);
  const dz = $("#dropzone"), fileInput = $("#importFile");
  fileInput.addEventListener("change", (e) => { if (e.target.files[0]) handleImportFile(e.target.files[0]); });
  ["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("is-over"); }));
  dz.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) handleImportFile(f); });
}
function downloadTemplate() {
  if (!window.XLSX) { toast("Librería Excel no disponible", "warn"); return; }
  const headers = IMPORT_COLS.map((c) => c[0]);
  const ejemplo = [
    ["Ana Pérez", "17.111.222-3", "Cajera", "Empleado", "Manpower", "Mañana", "Activo", 560000, 4700, 6],
    ["Luis Rojas", "16.555.444-2", "Guardia de Seguridad", "Empleado", "SOS Seguridad", "Noche", "Activo", 640000, 5700, 12]
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...ejemplo]);
  ws["!cols"] = headers.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Trabajadores");
  XLSX.writeFile(wb, "plantilla_trabajadores.xlsx");
  toast("Plantilla descargada", "ok");
}
async function handleImportFile(file) {
  try {
    let rows = [];
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext === "csv") {
      rows = parseCSV(await file.text());
    } else {
      if (!window.XLSX) { toast("No se pudo leer el Excel. Usa CSV.", "warn"); return; }
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    }
    if (!rows.length) { toast("El archivo no tiene filas", "warn"); return; }
    previewImport(rows.map(mapRow).filter((r) => r.nombre));
  } catch (err) { toast("Error al leer el archivo", "warn"); console.error(err); }
}
function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const delim = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ";" : ",";
  const splitLine = (line) => {
    const out = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === delim && !q) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur); return out;
  };
  const headers = splitLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((l) => { const cells = splitLine(l); const o = {}; headers.forEach((h, i) => o[h] = (cells[i] || "").trim()); return o; });
}
const normKey = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const COLMAP = {
  nombre: ["nombre", "nombre completo", "trabajador", "name"],
  rut: ["rut", "run", "id", "identificacion"],
  cargo: ["cargo", "puesto"],
  rol: ["rol", "jerarquia", "rol/jerarquia"],
  empresa: ["empresa", "contrato", "tipo de contrato", "proveedor"],
  turno: ["turno", "jornada"],
  estado: ["estado", "status"],
  sueldoBase: ["sueldo base", "sueldo", "sueldobase", "salario", "sueldo base mensual"],
  valorHoraExtra: ["valor hora extra", "valorhoraextra", "precio hora extra", "valor he"],
  horasExtrasMes: ["horas extras", "horas extra", "horasextras", "horas extras mes", "he"]
};
function mapRow(obj) {
  const lk = {}; Object.keys(obj).forEach((k) => lk[normKey(k)] = obj[k]);
  const pick = (field) => { for (const syn of COLMAP[field]) if (lk[syn] !== undefined && lk[syn] !== "") return lk[syn]; return ""; };
  const numv = (v) => { const n = parseInt(String(v).replace(/[^\d]/g, ""), 10); return isNaN(n) ? null : n; };
  return {
    nombre: String(pick("nombre")).trim(), rut: String(pick("rut")).trim(), cargo: String(pick("cargo")).trim(),
    rol: String(pick("rol")).trim(), empresa: String(pick("empresa")).trim(), turno: String(pick("turno")).trim(),
    estado: String(pick("estado")).trim(), sueldoBase: numv(pick("sueldoBase")), valorHoraExtra: numv(pick("valorHoraExtra")), horasExtrasMes: numv(pick("horasExtrasMes"))
  };
}
function matchContrato(empresa) {
  if (!empresa) return null;
  const e = normKey(empresa);
  return state.contratos.find((c) => { const n = normKey(c.nombre); return n.includes(e) || e.includes(n.split(" (")[0]); }) || null;
}
function previewImport(rows) {
  let nuevos = 0, actual = 0;
  rows.forEach((r) => { if (findWorker(r)) actual++; else nuevos++; });
  const res = $("#importResult");
  res.innerHTML = `
    <div class="import__summary">
      <div class="imp-stat imp-new"><b>${nuevos}</b><span>nuevos</span></div>
      <div class="imp-stat imp-upd"><b>${actual}</b><span>a actualizar</span></div>
      <div class="imp-stat"><b>${rows.length}</b><span>filas leídas</span></div>
    </div>
    <div class="table-wrap" style="margin-top:12px;max-height:180px;overflow:auto"><table class="mini-table"><thead><tr><th>Nombre</th><th>Cargo</th><th>Empresa</th><th>Sueldo</th><th></th></tr></thead><tbody>
      ${rows.slice(0, 8).map((r) => `<tr><td><b>${r.nombre}</b></td><td>${r.cargo || "—"}</td><td>${r.empresa || "—"}</td><td>${r.sueldoBase ? fmt(r.sueldoBase) : "—"}</td><td>${findWorker(r) ? '<span class="badge badge--sky">actualizar</span>' : '<span class="badge badge--emerald">nuevo</span>'}</td></tr>`).join("")}
      ${rows.length > 8 ? `<tr><td colspan="5" style="text-align:center;color:var(--muted)">+ ${rows.length - 8} más…</td></tr>` : ""}
    </tbody></table></div>`;
  $("#modalFoot").innerHTML = `<button class="btn btn--soft" data-close>Cancelar</button><button class="btn btn--primary" id="applyImport"><svg viewBox="0 0 24 24"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>Aplicar (${rows.length})</button>`;
  $("#applyImport").addEventListener("click", () => applyImport(rows));
}
function findWorker(r) {
  if (r.rut) { const w = state.trabajadores.find((x) => normKey(x.rut) === normKey(r.rut) && x.rut); if (w) return w; }
  return state.trabajadores.find((x) => normKey(x.nombre) === normKey(r.nombre)) || null;
}
function applyImport(rows) {
  let nuevos = 0, actual = 0;
  rows.forEach((r) => {
    const ct = matchContrato(r.empresa);
    const existing = findWorker(r);
    if (existing) {
      if (r.rut) existing.rut = r.rut;
      if (r.cargo) existing.cargo = r.cargo;
      if (r.rol && ROLES.includes(r.rol)) existing.rol = r.rol;
      if (ct) existing.contratoId = ct.id;
      if (r.turno && TURNOS.includes(r.turno)) existing.turno = r.turno;
      if (r.estado && ESTADOS.includes(r.estado)) existing.estado = r.estado;
      if (r.sueldoBase != null) existing.sueldoBase = r.sueldoBase;
      if (r.valorHoraExtra != null) existing.valorHoraExtra = r.valorHoraExtra;
      if (r.horasExtrasMes != null) existing.horasExtrasMes = r.horasExtrasMes;
      actual++;
    } else {
      const c = ct || state.contratos[0];
      const w = normalizeWorker({
        id: "t" + Date.now() + Math.floor(Math.random() * 999),
        nombre: r.nombre, rut: r.rut, cargo: r.cargo || "Empleado", rol: ROLES.includes(r.rol) ? r.rol : "Empleado",
        contratoId: c?.id, turno: TURNOS.includes(r.turno) ? r.turno : (c?.turnoDefecto || "Mañana"),
        estado: ESTADOS.includes(r.estado) ? r.estado : "Activo", color: pickColor(), ingreso: new Date().toISOString().slice(0, 10),
        sueldoBase: r.sueldoBase != null ? r.sueldoBase : (c?.sueldoBase || 600000),
        valorHoraExtra: r.valorHoraExtra != null ? r.valorHoraExtra : Math.round((c?.sueldoBase || 600000) / 180 * (c?.factorExtra || 1.5) / 100) * 100,
        horasExtrasMes: r.horasExtrasMes != null ? r.horasExtrasMes : 0,
        horario: defaultHorario(), asistencia: {}
      });
      state.trabajadores.push(w);
      nuevos++;
    }
  });
  save(); closeModal(); navigate("trabajadores");
  toast(`Importación lista: ${nuevos} nuevos, ${actual} actualizados`, "ok");
}

/* ---- Confirmación ---- */
function confirmModal(title, msg, onYes, danger = true) {
  openModal(title, `<p style="color:var(--ink-2);font-size:14.5px;line-height:1.6">${msg}</p>`,
    `<button class="btn btn--soft" data-close>Cancelar</button><button class="btn ${danger ? "btn--danger" : "btn--primary"}" id="confirmYes">Confirmar</button>`);
  $("#confirmYes").addEventListener("click", () => { onYes(); closeModal(); });
}

/* ---------- Utilidades varias ---------- */
function pickColor() {
  const p = ["#6366f1", "#0ea5e9", "#f59e0b", "#14b8a6", "#f43f5e", "#8b5cf6", "#10b981", "#ec4899", "#a855f7", "#0d9488"];
  return p[Math.floor(Math.random() * p.length)];
}
function exportCSV() {
  const head = ["Nombre", "RUT", "Cargo", "Rol", "Empresa", "Turno", "Sueldo base", "Valor hora extra", "Horas extras", "Dias trabajados", "Faltas", "Total a pagar"];
  const rows = state.trabajadores.map((t) => { const n = calcNomina(t), s = asistStats(ensureAsistencia(t)); return [t.nombre, t.rut, t.cargo, t.rol, getContrato(t.contratoId)?.nombre || "", t.turno, t.sueldoBase, t.valorHoraExtra, t.horasExtrasMes, s.trabajo, s.falta, Math.round(n.total)]; });
  const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `nomina_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  toast("Nómina exportada", "ok");
}

/* ---------- Selección masiva ---------- */
function updateBulkBar() {
  const bar = $("#bulkBar"); if (!bar) return;
  const n = ui.selected.size;
  bar.hidden = n === 0;
  $("#bulkCount").textContent = n;
  const all = $("#selAll");
  if (all) { const total = filteredWorkers().length; all.checked = n > 0 && n === total; all.indeterminate = n > 0 && n < total; }
}

/* ============================================================
   EVENTOS
   ============================================================ */
$("#content").addEventListener("click", (e) => {
  const t = e.target;
  const chip = t.closest("[data-contrato]"); if (chip) { ui.fContrato = chip.dataset.contrato; navigate(ui.view); return; }
  const act = t.closest("[data-action]");
  if (act) {
    const a = act.dataset.action;
    if (a === "new-worker") openWorkerModal();
    if (a === "new-contract") openContractModal();
    if (a === "import") openImportModal();
    if (a === "export") exportCSV();
    if (a === "reset") confirmModal("Restablecer datos", "Se borrarán todos los cambios y se restaurarán los datos de ejemplo. ¿Continuar?", async () => {
      try {
        const r = await API.reset();
        state = { contratos: r.contratos, trabajadores: r.trabajadores.map(normalizeWorker) };
        navigate("dashboard"); toast("Datos restablecidos", "ok");
      } catch (err) { toast("No se pudo restablecer: " + err.message, "warn"); }
    });
    if (a === "bulk-clear") { ui.selected.clear(); $$('#content [data-sel]').forEach((c) => c.checked = false); $$('#content tr[data-row]').forEach((r) => r.classList.remove("is-selected")); updateBulkBar(); }
    if (a === "bulk-delete") {
      const n = ui.selected.size; if (!n) return;
      confirmModal("Eliminar trabajadores", `¿Eliminar <b>${n}</b> trabajador(es) seleccionado(s)? Esta acción no se puede deshacer.`, () => {
        state.trabajadores = state.trabajadores.filter((x) => !ui.selected.has(x.id));
        ui.selected.clear(); save(); navigate("trabajadores"); toast(`${n} trabajador(es) eliminados`, "ok");
      });
    }
    return;
  }
  const at = t.closest("[data-attend]"); if (at) { openAttendanceModal(at.dataset.attend); return; }
  const ed = t.closest("[data-edit]"); if (ed) { openWorkerModal(ed.dataset.edit); return; }
  const del = t.closest("[data-del]"); if (del) {
    const w = state.trabajadores.find((x) => x.id === del.dataset.del);
    confirmModal("Eliminar trabajador", `¿Eliminar a <b>${w.nombre}</b>? Esta acción no se puede deshacer.`, () => { state.trabajadores = state.trabajadores.filter((x) => x.id !== del.dataset.del); save(); navigate(ui.view); toast("Trabajador eliminado", "ok"); });
    return;
  }
  const ec = t.closest("[data-edit-contract]"); if (ec) { openContractModal(ec.dataset.editContract); return; }
  const dc = t.closest("[data-del-contract]"); if (dc) {
    const usados = state.trabajadores.filter((x) => x.contratoId === dc.dataset.delContract).length;
    if (usados > 0) { toast(`No se puede eliminar: ${usados} trabajador(es) lo usan`, "warn"); return; }
    confirmModal("Eliminar contrato", "¿Eliminar este tipo de contrato?", () => { state.contratos = state.contratos.filter((x) => x.id !== dc.dataset.delContract); save(); navigate(ui.view); toast("Contrato eliminado", "ok"); });
    return;
  }
});

$("#content").addEventListener("change", (e) => {
  if (e.target.id === "filterEstado") { ui.fEstado = e.target.value; navigate(ui.view); return; }
  if (e.target.id === "selAll") {
    const on = e.target.checked; const list = filteredWorkers();
    ui.selected.clear(); if (on) list.forEach((w) => ui.selected.add(w.id));
    $$('#content [data-sel]').forEach((c) => c.checked = on);
    $$('#content tr[data-row]').forEach((r) => r.classList.toggle("is-selected", on));
    updateBulkBar(); return;
  }
  const sel = e.target.closest("[data-sel]");
  if (sel) {
    const id = sel.dataset.sel;
    if (sel.checked) ui.selected.add(id); else ui.selected.delete(id);
    sel.closest("tr").classList.toggle("is-selected", sel.checked);
    updateBulkBar();
  }
});

/* ---- Topbar / sidebar ---- */
$("#nav").addEventListener("click", (e) => { const b = e.target.closest(".nav__item"); if (b) navigate(b.dataset.view); });
$("#quickAddBtn").addEventListener("click", () => openWorkerModal());
$("#importBtn").addEventListener("click", () => openImportModal());
$("#menuBtn").addEventListener("click", () => { $("#sidebar").classList.toggle("is-open"); $("#sidebarScrim").classList.toggle("is-open"); });
$("#sidebarScrim").addEventListener("click", () => { $("#sidebar").classList.remove("is-open"); $("#sidebarScrim").classList.remove("is-open"); });

let searchT;
$("#globalSearch").addEventListener("input", (e) => { ui.search = e.target.value; clearTimeout(searchT); searchT = setTimeout(() => navigate("trabajadores"), 200); });

$("#themeBtn").addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("plantel_theme", next);
});
if (localStorage.getItem("plantel_theme") === "dark") document.documentElement.setAttribute("data-theme", "dark");

modal.addEventListener("click", (e) => { if (e.target.closest("[data-close]") || e.target.classList.contains("modal__backdrop")) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

/* ============================================================
   AUTENTICACIÓN
   ============================================================ */
function setSidebarUser(u) { $("#userName").textContent = u.nombre; $("#userAv").textContent = initials(u.nombre); }
function enterApp(u) { setSidebarUser(u); $("#authScreen").classList.add("is-hidden"); }
function showAuth() { $("#authScreen").classList.remove("is-hidden"); $("#authContainer").classList.remove("right-panel-active"); }

function applyRemoteState(r) {
  state = { contratos: r.contratos || [], trabajadores: (r.trabajadores || []).map(normalizeWorker) };
}

/* Al abrir la app: si hay un token guardado, recupera la sesión y los datos desde el servidor */
(async function initAuth() {
  if (API.hasSession) {
    try {
      const r = await API.loadState();
      applyRemoteState(r);
      enterApp(r.user);
      navigate("dashboard");
      return;
    } catch (e) {
      if (e.status === 401) API.setToken(null);
      else toast(e.message, "warn");
    }
  }
  showAuth();
})();

const slideTo = (cls) => $("#authContainer").classList[cls === "signup" ? "add" : "remove"]("right-panel-active");
$("#toSignup").addEventListener("click", () => slideTo("signup"));
$("#toSignin").addEventListener("click", () => slideTo("signin"));
$("#toSignupM").addEventListener("click", () => slideTo("signup"));
$("#toSigninM").addEventListener("click", () => slideTo("signin"));

async function withSubmitLock(form, fn) {
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true;
  try { await fn(); } finally { btn.disabled = false; }
}

$("#signinForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const email = fd.get("email").trim().toLowerCase(), pass = fd.get("pass");
  withSubmitLock(e.target, async () => {
    try {
      const r = await API.signin(email, pass);
      API.setToken(r.token);
      applyRemoteState(await API.loadState());
      enterApp(r.user); navigate("dashboard");
      toast(`Bienvenido, ${r.user.nombre.split(" ")[0]}`, "ok");
    } catch (err) { toast(err.message, "warn"); }
  });
});
$("#signupForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const nombre = fd.get("nombre").trim(), email = fd.get("email").trim().toLowerCase(), pass = fd.get("pass");
  if (!nombre || !email || !pass) { toast("Completa todos los campos", "warn"); return; }
  withSubmitLock(e.target, async () => {
    try {
      const r = await API.signup(nombre, email, pass);
      API.setToken(r.token);
      applyRemoteState(await API.loadState());
      enterApp(r.user); navigate("dashboard");
      toast("Cuenta creada. ¡Bienvenido!", "ok");
    } catch (err) { toast(err.message, "warn"); }
  });
});
$("#logoutBtn").addEventListener("click", () => {
  flushSave();
  API.setToken(null);
  state = { contratos: [], trabajadores: [] };
  showAuth(); toast("Sesión cerrada", "info");
});
