const geom = {
  h: [3.0, "堤高 h (m)"],
  b: [0.3, "天端厚 b (m)"],
  n: [0.30, "表のり n"],
  m: [0.20, "山側法 1:m（逆のりは負値）"],
  Tb: [0.30, "床掘余幅 Tb (m)"],
  Ts: [0.60, "床掘法 Ts"],
  beta: [30.0, "地表面傾斜 β (°)"],
};

const cond = {
  omega: [22.1, "壁体単位体積重量 ω (kN/m³)"],
  s: [17.7, "背面土単位重量 s (kN/m³)"],
  phi: [35.0, "背面土内部摩擦角 φ (°)"],
  f: [0.7, "基礎地盤摩擦係数 f"],
  Qa: [300.0, "許容地耐力 Qa (kN/m²)"],
  sigmaAllow: [4500.0, "許容圧縮応力度 (kN/m²)"],
  Ta: [1.5, "転倒安全率基準 Ta"],
  Fa: [1.5, "滑動安全率基準 Fa"],
  dtheta: [0.2, "θx刻み (°)"],
};

const gRoot = document.getElementById("geom-fields");
const cRoot = document.getElementById("cond-fields");
const wedgeBody = document.querySelector("#wedge-table tbody");
const earthRoot = document.getElementById("earth-kpis");
const forceBody = document.querySelector("#force-table tbody");
const resultRoot = document.getElementById("result-kpis");
const calcBtn = document.getElementById("calc-btn");
const logRoot = document.getElementById("calc-log");

function addFields(root, obj, prefix) {
  Object.entries(obj).forEach(([k, [v, label]]) => {
    const id = `${prefix}-${k}`;
    const l = document.createElement("label");
    l.htmlFor = id;
    l.textContent = label;

    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.id = id;
    input.value = v;

    root.append(l, input);
  });
}

addFields(gRoot, geom, "g");
addFields(cRoot, cond, "c");

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const fmt = (n, d = 3) => (Number.isFinite(n) ? n.toFixed(d) : "-");
const val = (id) => Number(document.getElementById(id).value || 0);

function pushKpi(root, title, value, cls = "") {
  const div = document.createElement("div");
  div.className = "kpi";
  div.innerHTML = `<h3>${title}</h3><div class="v ${cls}">${value}</div>`;
  root.appendChild(div);
}

function calculateEarthPressure(input) {
  const alpha = input.m === 0 ? 90 : deg(Math.atan(1 / Math.abs(input.m)));
  const delta = (2 / 3) * input.phi;
  const a1 = deg(Math.atan(1 / Math.max(input.Ts, 1e-9)));

  const L = ((input.Tb + input.m * input.h) * Math.tan(rad(input.beta)) + input.h)
    / Math.max(Math.tan(rad(a1)) - Math.tan(rad(input.beta)), 1e-9);

  const a0 = deg(Math.atan((L * Math.tan(rad(a1))) / Math.max(L + input.Tb, 1e-9)));

  const K = Math.sqrt(
    Math.max(
      (Math.sin(rad(alpha - delta)) * Math.sin(rad(input.phi - input.beta))) /
      Math.max(Math.sin(rad(input.phi + delta)) * Math.sin(rad(alpha + input.beta)), 1e-9),
      0
    )
  );

  const theta = deg(Math.atan(
    (Math.sin(rad(input.phi)) + K * Math.sin(rad(alpha))) /
    Math.max(Math.cos(rad(input.phi)) - K * Math.cos(rad(alpha)), 1e-9)
  ));

  const c = (
    Math.pow(Math.cos(rad(input.phi - alpha)), 2) /
    Math.max(
      Math.pow(Math.cos(rad(alpha)), 2) * Math.cos(rad(alpha + delta)) *
      Math.pow(1 + Math.sqrt(
        Math.max(
          (Math.sin(rad(input.phi + delta)) * Math.sin(rad(input.phi - input.beta))) /
          Math.max(Math.sin(rad(alpha + delta)) * Math.sin(rad(alpha - input.beta)), 1e-9),
          0
        )
      ), 2),
      1e-9
    )
  );

  if (a0 <= theta) {
    const E = 0.5 * input.s * input.h * input.h * c;
    return { alpha, delta, a1, L, a0, theta, c, E, mode: "coulomb", rows: [], maxRow: null };
  }

  const start = theta;
  const end = a0;
  const dtheta = Math.max(input.dtheta, 0.05);
  const rows = [];
  let maxRow = null;

  for (let tx = start; tx <= end + 1e-9; tx += dtheta) {
    const l = (input.Tb * Math.tan(rad(tx))) / Math.max(Math.tan(rad(a1)) - Math.tan(rad(tx)), 1e-9);

    let h1, h2, S1, S2;

    if (input.m >= 0) {
      h1 = input.h * (1 + input.m * Math.tan(rad(tx)));
      h2 = input.h + (l + input.Tb + input.m * input.h) * Math.tan(rad(input.beta)) - l * Math.tan(rad(a1));
      S1 = ((h1 + h2) * (l + input.Tb) + h1 * input.m * input.h) * input.s * 0.5;
      S2 = h2 * Math.max(L - l, 0) * input.s * 0.5;
    } else {
      const l2 = -input.m * input.h - (l + input.Tb);
      h1 = (input.Tb + l) / Math.max(-input.m, 1e-9) - l * Math.tan(rad(a1));
      h2 = input.h - (l + l2) * Math.tan(rad(a1));
      S1 = (input.Tb + l) * h1 * input.s * 0.5;
      S2 = ((h1 + h2) * l2 + h2 * (L + input.Tb + input.m * input.h)) * input.s * 0.5;
    }

    const a2 = deg(Math.atan(
      (S1 * Math.cos(rad(tx - input.phi)) + S2 * Math.cos(rad(a1 - input.phi))) /
      Math.max(S1 * Math.sin(rad(tx - input.phi)) + S2 * Math.sin(rad(a1 - input.phi)), 1e-9)
    ));
    const a3 = 90 + delta - alpha;

    const E = (S1 + S2) / Math.max((Math.tan(rad(a2)) + Math.tan(rad(a3))) * Math.cos(rad(a3)), 1e-9);

    const row = { tx, l, h1, h2, S1, S2, a2, a3, E };
    rows.push(row);
    if (!maxRow || row.E > maxRow.E) maxRow = row;
  }

  return {
    alpha,
    delta,
    a1,
    L,
    a0,
    theta,
    c,
    E: maxRow ? maxRow.E : 0,
    mode: "trial",
    rows,
    maxRow,
  };
}

function calculate() {
  const input = {
    h: val("g-h"), b: val("g-b"), n: val("g-n"), m: val("g-m"), Tb: val("g-Tb"), Ts: val("g-Ts"), beta: val("g-beta"),
    omega: val("c-omega"), s: val("c-s"), phi: val("c-phi"), f: val("c-f"), Qa: val("c-Qa"),
    sigmaAllow: val("c-sigmaAllow"), Ta: val("c-Ta"), Fa: val("c-Fa"), dtheta: val("c-dtheta"),
  };

  const B = (input.n + input.m) * input.h + input.b;
  const earth = calculateEarthPressure(input);
  const Ev = earth.E * Math.sin(rad(earth.delta + earth.alpha));
  const Eh = earth.E * Math.cos(rad(earth.delta + earth.alpha));

  earthRoot.innerHTML = "";
  pushKpi(earthRoot, "算定法", earth.mode === "trial" ? "試行クサビ法（最大E採用）" : "クーロン式");
  pushKpi(earthRoot, "L (m)", fmt(earth.L));
  pushKpi(earthRoot, "α0 (°)", fmt(earth.a0));
  pushKpi(earthRoot, "θ (°)", fmt(earth.theta));
  pushKpi(earthRoot, "α (°)", fmt(earth.alpha));
  pushKpi(earthRoot, "δ (°)", fmt(earth.delta));
  pushKpi(earthRoot, "土圧 E (kN/m)", fmt(earth.E));
  pushKpi(earthRoot, "Ev = E×sin(δ+α)", fmt(Ev));
  pushKpi(earthRoot, "Eh = E×cos(δ+α)", fmt(Eh));

  wedgeBody.innerHTML = "";
  earth.rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${fmt(r.tx, 2)}</td><td>${fmt(r.S1)}</td><td>${fmt(r.S2)}</td><td>${fmt(r.a2, 2)}</td><td>${fmt(r.a3, 2)}</td><td>${fmt(r.E)}</td>`;
    wedgeBody.appendChild(tr);
  });

  const armD1 = (2 / 3) * input.n * input.h;
  const armD2 = input.n * input.h + input.b / 2;
  const armD3 = input.n * input.h + input.b + (1 / 3) * input.m * input.h;
  const armEv = input.n * input.h + input.b + (2 / 3) * input.m * input.h;
  const armEh = input.h / 3;

  const rows = [
    ["D1", "n×h²×1/2×ω", input.n * input.h * input.h * 0.5 * input.omega, armD1, "V"],
    ["D2", "b×h×ω", input.b * input.h * input.omega, armD2, "V"],
    ["D3", "m×h²×1/2×ω", input.m * input.h * input.h * 0.5 * input.omega, armD3, "V"],
    ["Ev", "E×sin(δ+α)", Ev, armEv, "V"],
    ["Eh", "E×cos(δ+α)", Eh, armEh, "H"],
  ];

  let sumV = 0;
  let sumH = 0;
  let Mv = 0;
  let Mh = 0;
  forceBody.innerHTML = "";

  rows.forEach(([name, expr, force, arm, dir]) => {
    const moment = force * arm;
    if (dir === "V") {
      sumV += force;
      Mv += moment;
    } else {
      sumH += force;
      Mh += moment;
    }
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${name}</td><td>${expr}</td><td>${fmt(force)}</td><td>${fmt(arm)}</td><td>${fmt(moment)}</td>`;
    forceBody.appendChild(tr);
  });

  const d = (Mv - Mh) / Math.max(sumV, 1e-9);
  const e = B / 2 - d;

  const p1 = (sumV / Math.max(B, 1e-9)) * (1 + (6 * e) / Math.max(B, 1e-9));
  const p2 = (sumV / Math.max(B, 1e-9)) * (1 - (6 * e) / Math.max(B, 1e-9));

  const safetyOverturn = Mv / Math.max(Mh, 1e-9);
  const safetySlide = input.f * (sumV / Math.max(sumH, 1e-9));

  const checks = [
    ["転倒に対する安定", safetyOverturn >= input.Ta],
    ["滑動に対する安定", safetySlide >= input.Fa],
    ["地耐力に対する安定", p1 <= input.Qa && p2 >= 0],
    ["内部応力に対する安定", p1 <= input.sigmaAllow],
  ];

  resultRoot.innerHTML = "";
  [
    ["底幅 B (m)", B],
    ["ΣV (kN)", sumV],
    ["ΣH (kN)", sumH],
    ["Mv (kN・m)", Mv],
    ["Mh (kN・m)", Mh],
    ["合力作用位置 d (m)", d],
    ["偏心距離 e (m)", e],
    ["P1 (kN/m²)", p1],
    ["P2 (kN/m²)", p2],
    ["転倒安全率 Mv/Mh", safetyOverturn],
    ["滑動安全率 f×ΣV/ΣH", safetySlide],
  ].forEach(([label, value]) => pushKpi(resultRoot, label, fmt(value)));

  checks.forEach(([label, ok]) => pushKpi(resultRoot, label, ok ? "安定" : "要検討", ok ? "pass" : "fail"));

  const maxInfo = earth.maxRow
    ? `最大土圧時: θx=${fmt(earth.maxRow.tx, 2)}°, S1=${fmt(earth.maxRow.S1)}, S2=${fmt(earth.maxRow.S2)}, a2=${fmt(earth.maxRow.a2, 2)}°, Emax=${fmt(earth.maxRow.E)} kN/m`
    : "クーロン式採用のため試行クサビ反復は未実施";

  logRoot.textContent = [
    "【土圧計算過程】",
    `a1 = tan^-1(1/Ts) = ${fmt(earth.a1, 3)}°`,
    `α = tan^-1(1/|m|) = ${fmt(earth.alpha, 3)}°`,
    `δ = 2/3 φ = ${fmt(earth.delta, 3)}°`,
    `L = ((Tb + m·h)tanβ + h)/(tan a1 - tanβ) = ${fmt(earth.L)} m`,
    `a0 = tan^-1((L tan a1)/(L+Tb)) = ${fmt(earth.a0, 3)}°`,
    `θ = tan^-1((sinφ + K sinα)/(cosφ - K cosα)) = ${fmt(earth.theta, 3)}°`,
    earth.mode === "trial" ? "判定: a0 > θ なので試行クサビ法でEmaxを採用" : "判定: a0 ≤ θ なのでクーロン式で算定",
    maxInfo,
    `Ev = E·sin(δ+α) = ${fmt(Ev)} kN`,
    `Eh = E·cos(δ+α) = ${fmt(Eh)} kN`,
    "",
    "【モーメント計算過程（計算書形式）】",
    `D1アーム=2/3·n·h=${fmt(armD1)} , D2アーム=n·h+b/2=${fmt(armD2)}`,
    `D3アーム=n·h+b+1/3·m·h=${fmt(armD3)} , Evアーム=n·h+b+2/3·m·h=${fmt(armEv)}`,
    `Ehアーム=h/3=${fmt(armEh)}`,
    `Mv=Σ(V荷重×アーム)=${fmt(Mv)} kN·m`,
    `Mh=Eh×h/3=${fmt(Mh)} kN·m`,
    `d=(Mv-Mh)/ΣV=${fmt(d)} m , e=B/2-d=${fmt(e)} m`,
    `P1=ΣV/B(1+6e/B)=${fmt(p1)} , P2=ΣV/B(1-6e/B)=${fmt(p2)} kN/m²`,
    `転倒安全率=Mv/Mh=${fmt(safetyOverturn)} , 滑動安全率=f·ΣV/ΣH=${fmt(safetySlide)}`,
  ].join("\n");
}

calcBtn.addEventListener("click", calculate);
calculate();
