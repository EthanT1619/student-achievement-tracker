(function (SAT) {
  const { formatPercent } = SAT;

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

  function renderFallbackBars(labels, values, major) {
    return `
      <div class="fallback-chart" role="table" aria-label="대분류별 정답률">
        ${labels.map((label, i) => {
          const bucket = major[label];
          return `
            <div class="fallback-row">
              <span class="fallback-label">${label}</span>
              <div class="progress-bar" role="progressbar" aria-valuenow="${values[i]}" aria-valuemin="0" aria-valuemax="100">
                <div class="progress-bar__fill" style="width:${values[i]}%"></div>
              </div>
              <span class="fallback-value">${formatPercent(bucket.correct / bucket.total)} · ${bucket.correct}/${bucket.total}</span>
            </div>`;
        }).join('')}
      </div>`;
  }

  function renderFallbackTrend(trendData) {
    return `
      <table class="data-table fallback-table">
        <thead><tr><th>시험</th><th>날짜</th><th>점수</th></tr></thead>
        <tbody>
          ${trendData.map((d) => `<tr>
            <td>${d.title}</td><td>${d.date}</td>
            <td>${Math.round(d.percentage * 100)}% (${d.earnedPoints}/${d.totalPoints})</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }

  SAT.renderMajorCategoryChart = function renderMajorCategoryChart(container, categoryStats, chartKey) {
    if (!container) return;
    destroyChart(chartKey);
    const major = categoryStats?.major || {};
    const labels = Object.keys(major).filter((k) => major[k].total > 0);
    const values = labels.map((k) => Math.round((major[k].correct / major[k].total) * 100));
    if (!labels.length) {
      container.innerHTML = '<p class="empty-hint">데이터 없음</p>';
      return;
    }
    if (SAT.isChartJsAvailable()) {
      container.innerHTML = `<canvas id="canvas-${chartKey}" role="img" aria-label="대분류별 정답률"></canvas>`;
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
    container.innerHTML = renderFallbackBars(labels, values, major);
  };

  SAT.renderTrendChart = function renderTrendChart(container, trendData, chartKey) {
    if (!container) return;
    destroyChart(chartKey);
    if (!trendData.length) {
      container.innerHTML = '<p class="empty-hint">시험 기록이 없습니다.</p>';
      return;
    }
    const labels = trendData.map((d) => d.title);
    const values = trendData.map((d) => Math.round(d.percentage * 100));
    if (SAT.isChartJsAvailable()) {
      container.innerHTML = `<canvas id="canvas-${chartKey}" role="img" aria-label="시험별 점수 추이"></canvas>`;
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
    container.innerHTML = renderFallbackTrend(trendData);
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

  if (!window._satPrintHooks) {
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
      .map(([cat, b]) => `<tr><td>${cat}</td><td>${Math.round((b.correct / b.total) * 100)}%</td><td>${b.correct}/${b.total}</td></tr>`)
      .join('');
    const middleRows = Object.entries(middle)
      .filter(([, b]) => b.total > 0)
      .map(([, b]) => `<tr><td>${SAT.getMiddleStatText(b)}</td><td>${Math.round((b.correct / b.total) * 100)}%</td><td>${b.correct}/${b.total}</td></tr>`)
      .join('');
    const trendRows = trendData
      .map((d) => `<tr><td>${d.title}</td><td>${d.date}</td><td>${Math.round(d.percentage * 100)}%</td></tr>`)
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
