// Best surf conditions in Spain — ranks spots by current wave + wind.
// Wave/swell: Open-Meteo marine API. Wind: Open-Meteo forecast API. Both free, no key.
// https://open-meteo.com/

const SPOTS = [
  { name: "Mundaka",      region: "Basque Country", lat: 43.4076, lon: -2.6984 },
  { name: "Zarautz",      region: "Basque Country", lat: 43.2842, lon: -2.1736 },
  { name: "Zurriola",     region: "Basque Country", lat: 43.3240, lon: -1.9810 },
  { name: "Sopelana",     region: "Basque Country", lat: 43.3844, lon: -2.9825 },
  { name: "Bakio",        region: "Basque Country", lat: 43.4167, lon: -2.8000 },
  { name: "Somo",         region: "Cantabria",      lat: 43.4500, lon: -3.7333 },
  { name: "Rodiles",      region: "Asturias",       lat: 43.5364, lon: -5.3808 },
  { name: "Salinas",      region: "Asturias",       lat: 43.5833, lon: -5.9667 },
  { name: "Pantín",       region: "Galicia",        lat: 43.6360, lon: -8.1700 },
  { name: "Doniños",      region: "Galicia",        lat: 43.5000, lon: -8.3167 },
  { name: "El Quemao",    region: "Canary Islands", lat: 29.2250, lon: -13.5030 },
  { name: "Las Américas", region: "Canary Islands", lat: 28.0600, lon: -16.7330 },
];

const MARINE_API = "https://marine-api.open-meteo.com/v1/marine";
const FORECAST_API = "https://api.open-meteo.com/v1/forecast";
const MARINE_VARS = "wave_height,wave_direction,wave_period";
const WIND_VARS = "wind_speed_10m,wind_direction_10m";

let lastResults = [];

function marineUrl(spot) {
  const q = new URLSearchParams({
    latitude: String(spot.lat),
    longitude: String(spot.lon),
    current: MARINE_VARS,
    timezone: "auto",
  });
  return MARINE_API + "?" + q.toString();
}

function windUrl(spot) {
  const q = new URLSearchParams({
    latitude: String(spot.lat),
    longitude: String(spot.lon),
    current: WIND_VARS,
    timezone: "auto",
  });
  return FORECAST_API + "?" + q.toString();
}

function fmt(v, digits) {
  return v == null ? "—" : v.toFixed(digits);
}

function compass(deg) {
  if (deg == null) return "—";
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

// Derive a filename-friendly slug: "Las Américas" -> "las-americas".
function slug(name) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Simple heuristic — NOT a professional surf model.
function scoreConditions(c) {
  const wave = c.wave_height ?? 0;     // metres
  const wind = c.wind_speed_10m;       // km/h (may be null if wind fetch failed)
  const period = c.wave_period ?? 0;   // seconds

  let waveScore;
  if (wave < 0.5) waveScore = 20;
  else if (wave < 1.5) waveScore = 60 + (wave - 0.5) * 30;
  else if (wave <= 3) waveScore = 90 + (wave - 1.5) * (10 / 1.5);
  else if (wave <= 4.5) waveScore = 100 - (wave - 3) * (60 / 1.5);
  else waveScore = 10;

  let windScore;
  if (wind == null) windScore = 70;   // unknown wind → neutral
  else if (wind < 8) windScore = 100;
  else if (wind < 15) windScore = 80;
  else if (wind < 25) windScore = 55;
  else if (wind < 35) windScore = 30;
  else windScore = 10;

  let periodScore;
  if (period >= 10 && period <= 15) periodScore = 100;
  else if (period >= 8) periodScore = 70;
  else if (period >= 6) periodScore = 50;
  else periodScore = 30;

  return Math.round(waveScore * 0.5 + windScore * 0.3 + periodScore * 0.2);
}

function labelFor(score) {
  if (score >= 80) return "Great";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Poor";
}

async function fetchSpot(spot) {
  try {
    const [waveRes, windRes] = await Promise.all([
      fetch(marineUrl(spot)),
      fetch(windUrl(spot)),
    ]);
    if (!waveRes.ok) throw new Error("marine HTTP " + waveRes.status);
    const waveData = await waveRes.json();
    const wave = waveData.current;
    if (!wave) throw new Error("no wave data");

    let wind = {};
    if (windRes.ok) {
      const windData = await windRes.json();
      if (windData.current) wind = windData.current;
    }

    const c = { ...wave, ...wind };
    const score = scoreConditions(c);
    return { ...spot, score, label: labelFor(score), c };
  } catch {
    return { ...spot, error: true };
  }
}

function card(spot, rank) {
  const li = document.createElement("li");
  li.className = "spot";

  if (spot.error) {
    li.innerHTML = `
      <span class="rank">${rank}</span>
      <div class="body"><div class="head"><strong>${spot.name}</strong><span class="region">${spot.region}</span></div></div>
      <span class="error">unavailable</span>`;
    return li;
  }

  const c = spot.c;
  li.innerHTML = `
    <div class="thumb"><span class="thumb-emoji">🌊</span><img src="images/${slug(spot.name)}.jpg" alt="" onerror="this.remove()"></div>
    <span class="rank">${rank}</span>
    <div class="body">
      <div class="head"><strong>${spot.name}</strong><span class="region">${spot.region}</span></div>
      <div class="metrics">
        <span>🌊 ${fmt(c.wave_height, 1)} m · ${compass(c.wave_direction)}</span>
        <span>⏱ ${fmt(c.wave_period, 0)} s</span>
        <span>💨 ${fmt(c.wind_speed_10m, 0)} km/h · ${compass(c.wind_direction_10m)}</span>
      </div>
    </div>
    <div class="score ${spot.label.toLowerCase()}">
      <strong>${spot.score}</strong><small>${spot.label}</small>
    </div>`;
  return li;
}

function render() {
  const region = document.getElementById("region").value;
  const list = document.getElementById("spots");
  const status = document.getElementById("status");
  list.innerHTML = "";

  const unavailable = lastResults.filter((s) => s.error).length;
  const filtered = lastResults
    .filter((s) => !s.error && (region === "all" || s.region === region))
    .sort((a, b) => b.score - a.score);

  status.textContent = unavailable > 0
    ? "Updated " + new Date().toLocaleTimeString() + " · " + unavailable + " spot(s) unavailable"
    : "Updated " + new Date().toLocaleTimeString();

  filtered.forEach((s, i) => list.appendChild(card(s, i + 1)));
}

async function load() {
  const status = document.getElementById("status");
  const btn = document.getElementById("refresh");
  status.textContent = "Loading…";
  btn.disabled = true;
  lastResults = await Promise.all(SPOTS.map(fetchSpot));
  render();
  btn.disabled = false;
}

document.getElementById("region").addEventListener("change", render);
document.getElementById("refresh").addEventListener("click", load);
load();
