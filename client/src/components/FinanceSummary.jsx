function formatMoney(value, currency = "ETB") {
  return `${currency} ${Number(value || 0).toFixed(2)}`;
}

function FinanceSummary({ finance, winnerCount }) {
  if (!finance) {
    return null;
  }

  return (
    <section className="panel finance-panel">
      <div className="panel-heading">
        <h3>Game Finance</h3>
        <span>{finance.commission_percent}% commission</span>
      </div>
      <div className="metric-grid">
        <div className="metric-card">
          <span>Entry</span>
          <strong>{formatMoney(finance.contribution_amount, finance.currency)}</strong>
          <p>Per player</p>
        </div>
        <div className="metric-card">
          <span>Collected</span>
          <strong>{formatMoney(finance.total_collected, finance.currency)}</strong>
          <p>All players</p>
        </div>
        <div className="metric-card">
          <span>Commission</span>
          <strong>{formatMoney(finance.commission_amount, finance.currency)}</strong>
          <p>Service revenue</p>
        </div>
        <div className="metric-card">
          <span>Prize Pool</span>
          <strong>{formatMoney(finance.prize_pool_amount, finance.currency)}</strong>
          <p>{winnerCount ? `${winnerCount} winner(s)` : "Waiting for winner"}</p>
        </div>
      </div>
      <div className="payout-callout">
        <span>Payout per winner</span>
        <strong>{formatMoney(finance.payout_per_winner, finance.currency)}</strong>
      </div>
    </section>
  );
}

export default FinanceSummary;
