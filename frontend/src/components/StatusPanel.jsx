function StatusPanel({
  gameId,
  playerName,
  adminName,
  playerCount,
  status,
  countdown,
  lastNumber,
  winner,
  mode = "player",
  finance,
}) {
  const statusLabel =
    status === "countdown"
      ? `Starting in ${countdown}s`
      : status === "active"
        ? "Live draw in progress"
        : status === "finished"
          ? "Game finished"
          : "Waiting for players";

  return (
    <section className="panel status-panel">
      <div>
        <p className="eyebrow">Session</p>
        <h2>{gameId}</h2>
        <p className="meta-line">
          {mode === "admin" ? `Admin ${adminName}` : playerName} • {playerCount} player{playerCount === 1 ? "" : "s"}
        </p>
      </div>
      <div className="status-main">
        <div className="callout-number">
          <span>Last Number</span>
          <strong>{lastNumber ?? "--"}</strong>
        </div>
        <div className="winner-badge">
          {winner
            ? mode === "admin"
              ? `BINGO! ${winner.pattern.replace("_", " ")} • ${finance?.currency || "ETB"} ${Number(winner.payout_amount || 0).toFixed(2)}`
              : `BINGO! ${winner.pattern.replace("_", " ")}`
            : statusLabel}
        </div>
      </div>
    </section>
  );
}

export default StatusPanel;
