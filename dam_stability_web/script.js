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

const fmt = (n) => (Number.isFinite(n) ? n.toFixed(3) : "-");

function val(id) {
  return Number(document.getElementById(id).value || 0);
}

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

  // 4 計算表（提示画像の行構成と式に一致させる）
  const rows = [
    ["D1", "n×h²×1/2×ω", n * h * h * 0.5 * omega, (2 / 3) * n * h],
    ["D2", "b×h×ω", b * h * omega, n * h + b / 2],
    ["D3", "m×h²×1/2×ω", m * h * h * 0.5 * omega, n * h + b + (m * h) / 3],
    ["W1", "b×h'×γ", b * hp * gamma, n * h + b / 2],

    ["W2", "m×h1×h'×γ", m * h1 * hp * gamma, n * h + b + (m * h1) / 2],
    ["W3", "m×h2²×1/2×γ", m * h2 * h2 * 0.5 * gamma, n * h + b + (2 / 3) * m * h2],
    ["W4", "m×h1×h2×γ", m * h1 * h2 * gamma, n * h + b + m * h2 + (m * h1) / 2],
    ["E1", "m×h1²×1/2×s", m * h1 * h1 * 0.5 * s, n * h + b + m * h2 + (2 / 3) * m * h1],

    ["W5", "h'×h2×γ", hp * h2 * gamma, h1 + h2 / 2],
    ["W6", "h2²×1/2×γ", h2 * h2 * 0.5 * gamma, h1 + h2 / 3],
    ["E2", "(h'+h2)×γ×(1/s)×h1×s×c", (hp + h2) * gamma * h1 * c, h1 / 2],
    ["E3", "h2²×1/2×s×c", h2 * h2 * 0.5 * s * c, h1 / 3],
  ];

  tbody.innerHTML = "";
  let sumV = 0;
  let sumH = 0;
  let Mv = 0;
  let Mh = 0;

  rows.forEach(([name, expr, force, arm]) => {
    const moment = force * arm;
    const isHorizontal = ["W5", "W6", "E2", "E3"].includes(name);

    if (isHorizontal) {
      sumH += force;
      Mh += moment;
    } else {
      sumV += force;
      Mv += moment;
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${name}</td><td>${expr}</td><td>${fmt(force)}</td><td>${fmt(arm)}</td><td>${fmt(moment)}</td>`;
    tbody.appendChild(tr);
  });

  const d = (Mv - Mh) / Math.max(sumV, 1e-9);
  const e = B / 2 - d;

  const sigmaAvg = sumV / Math.max(B, 1e-9);
  const sigma1 = sigmaAvg * (1 + (6 * e) / Math.max(B, 1e-9));
  const sigma2 = sigmaAvg * (1 - (6 * e) / Math.max(B, 1e-9));

  // サンプルでは ΣH/ΣV を活動係数として評価
  const activity = sumH / Math.max(sumV, 1e-9);

  const checks = [
    ["転倒に対する安定", Mv > Mh],
    ["滑動に対する安定", f > activity],
    ["地耐力に対する安定", sigma1 <= Qa && sigma2 >= 0],
    ["内部応力に対する安定", sigma1 <= sigmaAllow],
  ];

  const Ka = Math.pow(Math.tan((45 - phi / 2) * Math.PI / 180), 2);

  resultRoot.innerHTML = "";
  const kpis = [
    ["底幅 B (m)", B],
    ["h1 (m)", h1],
    ["h2 (m)", h2],
    ["Ka(参考) (=tan²(45-φ/2))", Ka],
    ["ΣV (kN)", sumV],
    ["ΣH (kN)", sumH],
    ["抵抗モーメント Mv (kN・m)", Mv],
    ["転倒モーメント Mh (kN・m)", Mh],
    ["合力作用位置 d (m)", d],
    ["偏心距離 e (m)", e],
    ["σ1 (kN/m²)", sigma1],
    ["σ2 (kN/m²)", sigma2],
    ["活動係数 ΣH/ΣV", activity],
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
