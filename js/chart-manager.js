(function (SAT) {

  const { formatPercent, escapeHtml, clampPercent, percentFromRatio, formatDate, safeCount } = SAT;



  let chartJsAvailable = null;

  const activeCharts = new Map();



  SAT.isChartJsAvailable = function isChartJsAvailable() {

    if (chartJsAvailable !== null) return chartJsAvailable;

    chartJsAvailable = typeof window.Chart !== 'undefined';

    return chartJsAvailable;

  };



  function destroyChart(key) {

    const chart = activeCharts.get(key);

    if (chart) {

      chart.destroy();

      activeCharts.delete(key);

    }

  }



  SAT.destroyAllCharts = function destroyAllCharts() {

    activeCharts.forEach((chart) => chart.destroy());

    activeCharts.clear();

  };



  function safeChartDomId(chartKey) {

    return String(chartKey ?? 'chart').replace(/[^a-zA-Z0-9_-]/g, '');

  }



  function bucketScoreText(bucket) {

    const correct = safeCount(bucket?.correct);

    const total = safeCount(bucket?.total);

    if (total === 0) return formatPercent(0);

    return `${formatPercent(correct / total)} · ${correct}/${total}`;

  }



  function trendScoreText(d) {

    const pct = clampPercent(Math.round(Number(d?.percentage) * 100 || 0));

    const earned = safeCount(d?.earnedPoints);

    const total = safeCount(d?.totalPoints);

    return `${pct}% (${earned}/${total})`;

  }



  SAT.buildFallbackBarsHtml = function buildFallbackBarsHtml(labels, values, major) {

    return `

      <div class="fallback-chart" role="table" aria-label="대분류별 정답률">

        ${labels.map((label, i) => {

          const bucket = major[label];

          const width = clampPercent(values[i]);

          return `

            <div class="fallback-row">

              <span class="fallback-label">${escapeHtml(label)}</span>

              <div class="progress-bar" role="progressbar" aria-valuenow="${width}" aria-valuemin="0" aria-valuemax="100">

                <div class="progress-bar__fill" style="width:${width}%"></div>

              </div>

              <span class="fallback-value">${bucketScoreText(bucket)}</span>

            </div>`;

        }).join('')}

      </div>`;

  };



  SAT.buildFallbackTrendHtml = function buildFallbackTrendHtml(trendData) {

    return `

      <table class="data-table fallback-table">

        <thead><tr><th>시험</th><th>날짜</th><th>점수</th></tr></thead>

        <tbody>

          ${trendData.map((d) => `<tr>

            <td>${escapeHtml(d.title)}</td><td>${formatDate(d.date)}</td>

            <td>${trendScoreText(d)}</td>

          </tr>`).join('')}

        </tbody>

      </table>`;

  };



  SAT.renderMajorCategoryChart = function renderMajorCategoryChart(container, categoryStats, chartKey) {

    if (!container) return;

    destroyChart(chartKey);

    const major = categoryStats?.major || {};

    const labels = Object.keys(major).filter((k) => major[k].total > 0);

    const values = labels.map((k) => percentFromRatio(major[k].correct, major[k].total));

    if (!labels.length) {

      container.innerHTML = '<p class="empty-hint">데이터 없음</p>';

      return;

    }

    if (SAT.isChartJsAvailable()) {

      const domId = safeChartDomId(chartKey);

      container.innerHTML = `<canvas id="canvas-${domId}" role="img" aria-label="대분류별 정답률"></canvas>`;

      const chart = new window.Chart(container.querySelector('canvas'), {

        type: 'bar',

        data: {

          labels,

          datasets: [{

            label: '정답률 (%)',

            data: values,

            backgroundColor: ['#8b5cf6', '#0ea5e9', '#f59e0b', '#34a853', '#64748b'].slice(0, labels.length),

            borderRadius: 6,

          }],

        },

        options: {

          responsive: true,

          maintainAspectRatio: false,

          plugins: { legend: { display: false } },

          scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%` } } },

        },

      });

      activeCharts.set(chartKey, chart);

      container.classList.add('chart-container');

      return;

    }

    container.innerHTML = SAT.buildFallbackBarsHtml(labels, values, major);

  };



  SAT.renderTrendChart = function renderTrendChart(container, trendData, chartKey) {

    if (!container) return;

    destroyChart(chartKey);

    if (!trendData.length) {

      container.innerHTML = '<p class="empty-hint">시험 기록이 없습니다.</p>';

      return;

    }

    const labels = trendData.map((d) => d.title);

    const values = trendData.map((d) => clampPercent(Math.round(Number(d.percentage) * 100 || 0)));

    if (SAT.isChartJsAvailable()) {

      const domId = safeChartDomId(chartKey);

      container.innerHTML = `<canvas id="canvas-${domId}" role="img" aria-label="시험별 점수 추이"></canvas>`;

      const chart = new window.Chart(container.querySelector('canvas'), {

        type: 'line',

        data: {

          labels,

          datasets: [{

            label: '점수 (%)',

            data: values,

            borderColor: '#1a73e8',

            backgroundColor: 'rgba(26, 115, 232, 0.1)',

            fill: true,

            tension: 0.3,

            pointRadius: 5,

          }],

        },

        options: {

          responsive: true,

          maintainAspectRatio: false,

          plugins: { legend: { display: false } },

          scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%` } } },

        },

      });

      activeCharts.set(chartKey, chart);

      container.classList.add('chart-container');

      return;

    }

    container.innerHTML = SAT.buildFallbackTrendHtml(trendData);

  };



  SAT.prepareChartsForPrint = function prepareChartsForPrint() {

    let prepared = 0;

    document.querySelectorAll('.chart-wrapper').forEach((wrapper) => {

      const canvas = wrapper.querySelector('canvas');

      if (!canvas) return;

      let img = wrapper.querySelector('.chart-print-img');

      if (!img) {

        img = document.createElement('img');

        img.className = 'chart-print-img';

        img.alt = canvas.getAttribute('aria-label') || 'Chart';

        wrapper.appendChild(img);

      }

      try {

        img.src = canvas.toDataURL('image/png');

        img.width = canvas.width;

        img.height = canvas.height;

        prepared += 1;

      } catch (err) {

        console.warn('Chart print export failed', err);

      }

    });

    const detail = document.querySelector('.result-detail');

    if (prepared > 0 && detail) detail.classList.add('charts-print-ready');

    return prepared;

  };



  SAT.cleanupChartsAfterPrint = function cleanupChartsAfterPrint() {

    document.querySelector('.result-detail')?.classList.remove('charts-print-ready');

  };



  SAT.ensureChartsReadyForPrint = function ensureChartsReadyForPrint() {

    return new Promise((resolve) => {

      const finalize = () => {

        activeCharts.forEach((chart) => {

          chart.stop();

          chart.update('none');

        });

        requestAnimationFrame(() => requestAnimationFrame(resolve));

      };

      if (activeCharts.size === 0) {

        requestAnimationFrame(() => requestAnimationFrame(finalize));

        return;

      }

      finalize();

    });

  };



  SAT.printStudentResults = async function printStudentResults() {

    await SAT.runPrintWithCharts();

  };



  SAT.printExamOverview = async function printExamOverview() {

    await SAT.runPrintWithCharts();

  };



  SAT.runPrintWithCharts = async function runPrintWithCharts() {

    await SAT.ensureChartsReadyForPrint();

    SAT.prepareChartsForPrint();

    const imgs = [...document.querySelectorAll('.chart-print-img[src]')];

    await Promise.all(

      imgs.map(

        (img) =>

          img.complete

            ? Promise.resolve()

            : new Promise((resolve) => {

                img.onload = resolve;

                img.onerror = resolve;

              })

      )

    );

    window.print();

  };



  if (!window._satPrintHooks && typeof window.addEventListener === 'function') {

    window._satPrintHooks = true;

    window.addEventListener('beforeprint', () => {

      activeCharts.forEach((chart) => {

        chart.stop();

        chart.update('none');

      });

      SAT.prepareChartsForPrint();

    });

    window.addEventListener('afterprint', () => SAT.cleanupChartsAfterPrint());

  }



  SAT.renderPrintChartTables = function renderPrintChartTables(majorStats, trendData) {

    const major = majorStats?.major || {};

    const middle = majorStats?.middle || {};

    const majorRows = Object.entries(major)

      .filter(([, b]) => b.total > 0)

      .map(([cat, b]) => {

        const pct = percentFromRatio(b.correct, b.total);

        const correct = safeCount(b.correct);

        const total = safeCount(b.total);

        return `<tr><td>${escapeHtml(cat)}</td><td>${pct}%</td><td>${correct}/${total}</td></tr>`;

      })

      .join('');

    const middleRows = Object.entries(middle)

      .filter(([, b]) => b.total > 0)

      .map(([, b]) => {

        const pct = percentFromRatio(b.correct, b.total);

        const correct = safeCount(b.correct);

        const total = safeCount(b.total);

        return `<tr><td>${escapeHtml(SAT.getMiddleStatText(b))}</td><td>${pct}%</td><td>${correct}/${total}</td></tr>`;

      })

      .join('');

    const trendRows = (trendData || [])

      .map((d) => {

        const pct = clampPercent(Math.round(Number(d.percentage) * 100 || 0));

        return `<tr><td>${escapeHtml(d.title)}</td><td>${formatDate(d.date)}</td><td>${pct}%</td></tr>`;

      })

      .join('');

    return `

      <div class="print-only print-chart-tables">

        <h3>대분류별 정답률</h3>

        <table class="data-table"><thead><tr><th>영역</th><th>정답률</th><th>문항</th></tr></thead>

        <tbody>${majorRows || '<tr><td colspan="3">데이터 없음</td></tr>'}</tbody></table>

        <h3>중분류별 정답률</h3>

        <table class="data-table"><thead><tr><th>영역</th><th>정답률</th><th>문항</th></tr></thead>

        <tbody>${middleRows || '<tr><td colspan="3">데이터 없음</td></tr>'}</tbody></table>

        <h3>시험별 점수 추이</h3>

        <table class="data-table"><thead><tr><th>시험</th><th>날짜</th><th>점수</th></tr></thead>

        <tbody>${trendRows || '<tr><td colspan="3">데이터 없음</td></tr>'}</tbody></table>

      </div>`;

  };

})(window.SAT = window.SAT || {});

