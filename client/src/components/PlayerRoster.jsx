import ShareActions from "./ShareActions";

function statusLabel(status) {
  if (status === "pending") return "Pending approval";
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return status;
}

function PlayerRoster({
  gameId,
  players,
  origin,
  onStart,
  onOpenCard,
  onApprove,
  onReject,
  onViewReceipt,
  canStart,
  starting,
  shareEnabled,
  adminId,
  approvingId,
  rejectingId,
}) {
  const approvedCount = players.filter((player) => player.registration_status === "approved").length;
  const pendingCount = players.filter((player) => player.registration_status === "pending").length;

  return (
    <section className="panel roster-panel">
      <div className="panel-heading">
        <h3>Registrations</h3>
        <span>
          {approvedCount} approved • {pendingCount} pending
        </span>
      </div>
      <div className="roster-list">
        {players.length === 0 ? (
          <p className="empty-state">Players register themselves using the public link.</p>
        ) : (
          players.map((player) => (
            <div key={player.player_id} className="roster-item">
              <div>
                <strong>{player.player_name}</strong>
                <p className="mini-meta">{player.phone_number}</p>
                <p className="mini-meta">
                  {statusLabel(player.registration_status)} • {player.payment_method}
                  {player.has_receipt ? " • receipt uploaded" : ""}
                </p>
              </div>
              <div className="roster-actions">
                {player.registration_status === "pending" ? (
                  <>
                    {player.has_receipt ? (
                      <button className="ghost-button" onClick={() => onViewReceipt(player.player_id)}>
                        View Receipt
                      </button>
                    ) : null}
                    <button
                      className="secondary-button"
                      disabled={approvingId === player.player_id}
                      onClick={() => onApprove(player.player_id)}
                    >
                      {approvingId === player.player_id ? "Approving..." : "Approve"}
                    </button>
                    <button
                      className="ghost-button"
                      disabled={rejectingId === player.player_id}
                      onClick={() => onReject(player.player_id)}
                    >
                      {rejectingId === player.player_id ? "Rejecting..." : "Reject"}
                    </button>
                  </>
                ) : null}
                {player.registration_status === "approved" ? (
                  <>
                    <button className="ghost-button" onClick={() => onOpenCard(player.player_id)}>
                      Open Card
                    </button>
                    <ShareActions
                      playerName={player.player_name}
                      phoneNumber={player.phone_number}
                      playerUrl={`${origin}/game/${gameId}?playerId=${player.player_id}`}
                      disabled={!shareEnabled}
                    />
                  </>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
      <button className="primary-button full-width-button" onClick={onStart} disabled={!canStart || starting}>
        {starting ? "Starting..." : "Start Draw"}
      </button>
      <p className="mini-meta">
        Approve paid registrations before starting. Only approved players join the draw.
      </p>
    </section>
  );
}

export default PlayerRoster;
