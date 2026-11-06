fetch('covid-19.json')
  .then(r => r.json())
  .then(data => {
    console.log("JSON loaded:", data);
    console.log("Total records:", data.length);
    console.log("Loaded countries:", [...new Set(data.map(d => d.country))]);
  });
const COLORS = ['#3978f6', '#f05d5e', '#19a88a', '#9b6de0', '#e5a13b', '#36a6c8'];
const numberFormat = new Intl.NumberFormat('en-US');
const chartInstances = {};
let covidData = null;

const elements = {
  source: document.getElementById('sourceStatus'),
  filter: document.getElementById('countryFilter'),
  confirmed: document.getElementById('confirmedMetric'),
  deaths: document.getElementById('deathsMetric'),
  recovered: document.getElementById('recoveredMetric'),
  countries: document.getElementById('countriesMetric'),
  table: document.getElementById('snapshotTable')
};

function formatNumber(value) {
  return numberFormat.format(value ?? 0);
}

function validateData(json) {
  if (!json || !Array.isArray(json.countries)) {
    throw new Error('The JSON file must contain a "countries" array.');
  }
  json.countries.forEach(country => {
    if (!country.country || !Array.isArray(country.data)) {
      throw new Error('Each country must have a name and a data array.');
    }
    country.data.forEach(point => {
      if (!point.date || !Number.isFinite(point.confirmed) ||
          !Number.isFinite(point.deaths) || !Number.isFinite(point.recovered)) {
        throw new Error(`Invalid data point found for ${country.country}.`);
      }
    });
  });
  return json;
}

function latestRecord(country) {
  return [...country.data].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
}

function destroyCharts() {
  Object.values(chartInstances).forEach(chart => chart.destroy());
  Object.keys(chartInstances).forEach(key => delete chartInstances[key]);
}

function chartOptions(yTitle) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 7, padding: 16, font: { size: 10 } } },
      tooltip: { callbacks: { label: context => `${context.dataset.label}: ${formatNumber(context.parsed.y)}` } }
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8, font: { size: 9 } } },
      y: { beginAtZero: true, title: { display: true, text: yTitle, font: { size: 10 } },
        ticks: { callback: value => numberFormat.format(value), font: { size: 9 } },
        grid: { color: '#edf1f6' } }
    }
  };
}

function createTrendChart(canvasId, metric, title) {
  const selected = elements.filter.value;
  const countries = covidData.countries.filter(c => selected === 'all' || c.code === selected);
  const labels = [...new Set(countries.flatMap(c => c.data.map(d => d.date)))].sort();
  const datasets = countries.map((country, index) => {
    const values = new Map(country.data.map(point => [point.date, point[metric]]));
    return {
      label: country.country,
      data: labels.map(date => values.has(date) ? values.get(date) : null),
      borderColor: COLORS[index % COLORS.length],
      backgroundColor: COLORS[index % COLORS.length],
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5,
      tension: 0.25,
      spanGaps: false
    };
  });
  chartInstances[canvasId] = new Chart(document.getElementById(canvasId), {
    type: 'line', data: { labels, datasets }, options: chartOptions(title)
  });
}

function renderCountryBar() {
  const countries = covidData.countries;
  const latest = countries.map(latestRecord);
  chartInstances.countryChart = new Chart(document.getElementById('countryChart'), {
    type: 'bar',
    data: {
      labels: countries.map(c => c.country),
      datasets: [{ label: 'Confirmed cases', data: latest.map(d => d.confirmed),
        backgroundColor: countries.map((_, i) => COLORS[i % COLORS.length]), borderRadius: 6, maxBarThickness: 54 }]
    },
    options: { ...chartOptions('Confirmed cases'), plugins: { legend: { display: false },
      tooltip: { callbacks: { label: context => formatNumber(context.parsed.y) } } } }
  });
}

function renderOutcomes() {
  const latest = covidData.countries.map(latestRecord);
  const deaths = latest.reduce((sum, d) => sum + d.deaths, 0);
  const recovered = latest.reduce((sum, d) => sum + d.recovered, 0);
  chartInstances.outcomeChart = new Chart(document.getElementById('outcomeChart'), {
    type: 'doughnut',
    data: { labels: ['Deaths', 'Recovered'], datasets: [{ data: [deaths, recovered],
      backgroundColor: ['#f05d5e', '#19a88a'], borderWidth: 0, hoverOffset: 5 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 18, font: { size: 10 } } },
        tooltip: { callbacks: { label: context => `${context.label}: ${formatNumber(context.parsed)}` } } } }
  });
}

function renderMetricsAndTable() {
  const latest = covidData.countries.map(latestRecord);
  const total = key => latest.reduce((sum, row) => sum + row[key], 0);
  elements.confirmed.textContent = formatNumber(total('confirmed'));
  elements.deaths.textContent = formatNumber(total('deaths'));
  elements.recovered.textContent = formatNumber(total('recovered'));
  elements.countries.textContent = formatNumber(covidData.countries.length);
  elements.table.innerHTML = latest.map((row, index) => `
    <tr>
      <td>${escapeHtml(covidData.countries[index].country)}</td>
      <td>${row.date}</td><td>${formatNumber(row.confirmed)}</td>
      <td>${formatNumber(row.deaths)}</td><td>${formatNumber(row.recovered)}</td>
    </tr>`).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function renderDashboard() {
  destroyCharts();
  renderMetricsAndTable();
  createTrendChart('confirmedChart', 'confirmed', 'Confirmed cases');
  createTrendChart('deathsChart', 'deaths', 'Deaths');
  createTrendChart('recoveredChart', 'recovered', 'Recoveries');
  renderCountryBar();
  renderOutcomes();
}

function loadData(json, label) {
  covidData = validateData(json);
  elements.source.textContent = `${label} • ${covidData.countries.length} countries`;
  elements.filter.innerHTML = '<option value="all">All countries</option>' +
    covidData.countries.map(c => `<option value="${escapeHtml(c.code || c.country)}">${escapeHtml(c.country)}</option>`).join('');
  // Use the country code when available; otherwise use its country name.
  elements.filter.querySelectorAll('option').forEach((option, index) => {
    if (index > 0 && !covidData.countries[index - 1].code) {
      option.value = covidData.countries[index - 1].country;
    }
  });
  elements.filter.disabled = false;
  renderDashboard();
}

elements.filter.addEventListener('change', renderDashboard);

document.getElementById('fileInput').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    loadData(JSON.parse(await file.text()), file.name);
  } catch (error) {
    elements.source.textContent = `Could not load file: ${error.message}`;
  }
});

// First try loading the JSON beside index.html. If opening via file:// blocks fetch,
// use the "Load JSON file" button or start a local development server.
fetch('./covid-19.json')
  .then(response => {
    if (!response.ok) throw new Error('Automatic file loading was blocked.');
    return response.json();
  })
  .then(json => loadData(json, 'covid-19.json'))
  .catch(() => {
    elements.source.textContent = 'Select covid-19.json using the Load JSON file button.';
  });
