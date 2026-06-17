import ShareActions from "./ShareActions";

function PlayerRoster({ gameId, players, origin, onStart, onOpenCard, canStart, starting, shareEnabled }) {
  return (
    <section className="panel roster-panel">
      <div className="panel-heading">
        <h3>Registered Players</h3>
        <span>{players.length}</span>
      </div>
      <div className="roster-list">
        {players.length === 0 ? (
          <p className="empty-state">Add players to deal their cards.</p>
        ) : (
          players.map((player) => (
            <div key={player.player_id} className="roster-item">
              <div>
                <strong>{player.player_name}</strong>
                <p className="mini-meta">{player.phone_number}</p>
                <p className="mini-meta">ID: {player.player_id}</p>
              </div>
              <div className="roster-actions">
                <button className="ghost-button" onClick={() => onOpenCard(player.player_id)}>
                  Open Card
                </button>
                <ShareActions
                  playerName={player.player_name}
                  phoneNumber={player.phone_number}
                  playerUrl={`${origin}/game/${gameId}?playerId=${player.player_id}`}
                  disabled={!shareEnabled}
                />
              </div>
            </div>
          ))
        )}
      </div>
      <button className="primary-button full-width-button" onClick={onStart} disabled={!canStart || starting}>
        {starting ? "Starting..." : "Start Draw"}
      </button>
      <p className="mini-meta">
        {shareEnabled
          ? "Private sharing works well through WhatsApp, copied links, and QR scan from the desk."
          : "Player links are expired after game completion."}
      </p>
    </section>
  );
}

export default PlayerRoster;
