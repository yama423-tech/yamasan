const dims = {
  h: [5.0, "堤高 h (m)"],
  hp: [0.5, "越流水深 h' (m)"],
  b: [1.5, "天端幅 b (m)"],
  n: [0.30, "下流のり n"],
  m: [0.00, "上流のり m"],
};

const conds = {
  omega: [22.1, "単位体積重量 ω (kN/m³)"],
  gamma: [9.8, "水の単位重量 γ (kN/m³)"],
  s: [17.7, "単位堆砂量 s (kN/m³)"],
  phi: [30, "堆砂の内部摩擦角 φ (°)"],
  f: [0.7, "基礎地盤摩擦係数 f"],
  c: [0.333, "土圧係数 c (初期値)"],
  Qa: [600, "許容地耐力 Qa (kN/m²)"],
  sigmaAllow: [3000, "コンクリート許容圧縮応力 (kN/m²)"],
};

const dimRoot = document.getElementById("dim-fields");
const condRoot = document.getElementById("cond-fields");
const tbody = document.querySelector("#force-table tbody");
const resultRoot = document.getElementById("results");

function addFields(root, obj, prefix) {
  Object.entries(obj).forEach(([k, [v, label]]) => {
    const id = `${prefix}-${k}`;
    const l = document.createElement("label");
    l.htmlFor = id;
    l.textContent = label;
    const i = document.createElement("input");
    i.type = "number";
    i.step = "any";
    i.value = v;
    i.id = id;
    i.addEventListener("input", calc);
    root.append(l, i);
  });
}

addFields(dimRoot, dims, "d");
addFields(condRoot, conds, "c");

function val(id) {
  return Number(document.getElementById(id).value || 0);
}

const fmt = (n) => Number.isFinite(n) ? n.toFixed(3) : "-";

function calc() {
  const h = val("d-h");
  const hp = val("d-hp");
  const b = val("d-b");
  const n = val("d-n");
  const m = val("d-m");

  const omega = val("c-omega");
  const gamma = val("c-gamma");
  const s = val("c-s");
  const phi = val("c-phi");
  const f = val("c-f");
  const c = val("c-c");
  const Qa = val("c-Qa");
  const sigmaAllow = val("c-sigmaAllow");

  const h1 = h / 2;
  const h2 = h / 2;
  const B = (n + m) * h + b;

  const D1 = n * h * h1 * omega;
  const D2 = 0.5 * h * h2 * omega;
  const D3 = m * h * h2 * omega;
  const D4 = b * h * omega;

  const forces = [
    ["D1", "n×h×h1×ω", D1, n * h / 3 + b / 3],
    ["D2", "1/2×h×h2×ω", D2, n * h + b / 2],
    ["D3", "m×h×h2×ω", D3, n * h + b + (m * h) / 3],
    ["D4", "b×h×ω", D4, n * h + b / 2],
  ];

  const area = ((b + B) * h) / 2;
  const W = area * omega;

  const Ka = Math.pow(Math.tan((45 - phi / 2) * Math.PI / 180), 2);
  const KaUsed = c > 0 ? c : Ka;

  const depth = h / 2 + hp;
  const Pw = 0.5 * gamma * depth * depth;
  const Pe = 0.5 * s * KaUsed * (h / 2) * (h / 2);
  const U = 0.5 * gamma * depth * B;

  const A_down = 0.5 * m * h * h;
  const x_down = (m * h) / 3;
  const A_rect = b * h;
  const x_rect = m * h + b / 2;
  const A_up = 0.5 * n * h * h;
  const x_up = m * h + b + (n * h) / 3;
  const xg = (A_down * x_down + A_rect * x_rect + A_up * x_up) / Math.max(area, 1e-9);

  const V = W - U;
  const H = Pw + Pe;
  const Mv = W * xg;
  const Mh = Pw * (depth / 3) + Pe * (h / 6);

  const d = (Mv - Mh) / Math.max(V, 1e-9);
  const e = B / 2 - d;
  const sigmaAvg = V / Math.max(B, 1e-9);
  const sigma1 = sigmaAvg * (1 + (6 * e) / Math.max(B, 1e-9));
  const sigma2 = sigmaAvg * (1 - (6 * e) / Math.max(B, 1e-9));

  const fsSlide = (f * V + c * B) / Math.max(H, 1e-9);

  tbody.innerHTML = "";
  let Msum = 0;
  for (const [name, expr, F, arm] of forces) {
    const mnt = F * arm;
    Msum += mnt;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${name}</td><td>${expr}</td><td>${fmt(F)}</td><td>${fmt(arm)}</td><td>${fmt(mnt)}</td>`;
    tbody.appendChild(tr);
  }

  const checks = [
    ["転倒に対する安定", Mv > Mh],
    ["滑動に対する安定", fsSlide >= 1.0],
    ["地耐力に対する安定", sigma1 <= Qa * 0.7 && sigma2 >= 0],
    ["内部応力に対する安定", sigma1 <= sigmaAllow],
  ];

  resultRoot.innerHTML = "";
  const kpis = [
    ["底幅 B (m)", B], ["断面積 A (m²)", area], ["ΣV (kN)", V], ["ΣH (kN)", H],
    ["抵抗Mv (kN・m)", Mv], ["転倒Mh (kN・m)", Mh], ["作用位置 d (m)", d], ["偏心 e (m)", e],
    ["σ1 (kN/m²)", sigma1], ["σ2 (kN/m²)", sigma2], ["滑動安全率", fsSlide]
  ];

  kpis.forEach(([label, value]) => {
    const div = document.createElement("div");
    div.className = "kpi";
    div.innerHTML = `<h3>${label}</h3><div class="v">${fmt(value)}</div>`;
    resultRoot.appendChild(div);
  });

  checks.forEach(([label, ok]) => {
    const div = document.createElement("div");
    div.className = "kpi";
    div.innerHTML = `<h3>${label}</h3><div class="v ${ok ? "pass" : "fail"}">${ok ? "安定" : "要検討"}</div>`;
    resultRoot.appendChild(div);
  });
}

calc();
