function formatMoney(value, currency = "ETB") {
  return `${currency} ${Number(value || 0).toFixed(2)}`;
}

function maxCommission(trend = []) {
  return trend.reduce((max, item) => Math.max(max, Number(item.commission_amount || 0)), 0);
}

function buildLinePoints(trend = [], width = 520, height = 180, padding = 20) {
  if (!trend.length) {
    return "";
  }
  const maxValue = maxCommission(trend) || 1;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  return trend
    .map((bucket, index) => {
      const x = padding + (trend.length === 1 ? innerWidth / 2 : (index / (trend.length - 1)) * innerWidth);
      const y = padding + (1 - Number(bucket.commission_amount || 0) / maxValue) * innerHeight;
      return `${x},${y}`;
    })
    .join(" ");
}

function AnalyticsPanel({ analytics, currency = "ETB" }) {
  if (!analytics) {
    return null;
  }

  const weeklyPoints = buildLinePoints(analytics.weekly_trend);
  const monthlyMax = maxCommission(analytics.monthly_trend);

  return (
    <section className="panel analytics-panel">
      <div className="panel-heading">
        <h3>Performance Trends</h3>
        <span>Daily, weekly, and monthly view</span>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <span>Today Collected</span>
          <strong>{formatMoney(analytics.daily_commission, currency)}</strong>
          <p>{analytics.daily_games} game(s)</p>
        </div>
        <div className="metric-card">
          <span>Weekly Collected</span>
          <strong>{formatMoney(analytics.weekly_commission, currency)}</strong>
          <p>{analytics.weekly_games} game(s)</p>
        </div>
        <div className="metric-card">
          <span>Monthly Collected</span>
          <strong>{formatMoney(analytics.monthly_commission, currency)}</strong>
          <p>{analytics.monthly_games} game(s)</p>
        </div>
      </div>

      <div className="trend-grid">
        <div className="trend-panel">
          <h4>Weekly Time Series</h4>
          <div className="chart-shell">
            <svg viewBox="0 0 520 180" className="timeseries-chart" role="img" aria-label="Weekly commission trend">
              <line x1="20" y1="160" x2="500" y2="160" className="chart-axis" />
              <line x1="20" y1="20" x2="20" y2="160" className="chart-axis" />
              <polyline points={weeklyPoints} className="line-series" />
              {analytics.weekly_trend.map((bucket, index) => {
                const x = 20 + (analytics.weekly_trend.length === 1 ? 240 : (index / (analytics.weekly_trend.length - 1)) * 480);
                const y =
                  20 +
                  (1 - Number(bucket.commission_amount || 0) / (maxCommission(analytics.weekly_trend) || 1)) *
                    140;
                return <circle key={bucket.label} cx={x} cy={y} r="4" className="line-dot" />;
              })}
            </svg>
          </div>
          <div className="trend-list">
            {analytics.weekly_trend.map((bucket) => (
              <div key={bucket.label} className="trend-item">
                <span>{bucket.label}</span>
                <strong>{formatMoney(bucket.commission_amount, currency)}</strong>
                <em>{bucket.game_count} game(s)</em>
              </div>
            ))}
          </div>
        </div>
        <div className="trend-panel">
          <h4>Monthly Bar Chart</h4>
          <div className="bar-chart-grid">
            {analytics.monthly_trend.map((bucket) => (
              <div key={bucket.label} className="bar-item">
                <div className="bar-shell">
                  <div
                    className="bar-fill"
                    style={{
                      height: `${monthlyMax ? (Number(bucket.commission_amount) / monthlyMax) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="bar-label">{bucket.label}</span>
              </div>
            ))}
          </div>
          <div className="trend-list">
            {analytics.monthly_trend.map((bucket) => (
              <div key={bucket.label} className="trend-item">
                <span>{bucket.label}</span>
                <strong>{formatMoney(bucket.commission_amount, currency)}</strong>
                <em>{bucket.game_count} game(s)</em>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default AnalyticsPanel;
