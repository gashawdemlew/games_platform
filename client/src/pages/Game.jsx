import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import AnalyticsPanel from "../components/AnalyticsPanel";
import BingoCard from "../components/BingoCard";
import DrawnNumbers from "../components/DrawnNumbers";
import FinanceSummary from "../components/FinanceSummary";
import PlayerRoster from "../components/PlayerRoster";
import StatusPanel from "../components/StatusPanel";
import {
  clearAdminSession,
  createAdminUser,
  getAdminAnalytics,
  getAdminProfile,
  getAdminUsers,
  getGame,
  getPlayerSnapshot,
  registerPlayer,
  startGame,
  updateAdminUser,
  updateGameSettings,
} from "../services/api";
import { connectToGameSocket } from "../services/socket";

function applyDrawToCard(card, drawnNumbers) {
  if (!card) {
    return card;
  }

  const drawnSet = new Set(drawnNumbers);
  return {
    ...card,
    grid: card.grid.map((row) =>
      row.map((cell) => ({
        ...cell,
        marked: cell.is_free || (cell.value !== null && drawnSet.has(cell.value)),
      }))
    ),
  };
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : "--";
}

function formatMoney(value, currency = "ETB") {
  return `${currency} ${Number(value || 0).toFixed(2)}`;
}

function Game() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const socketRef = useRef(null);

  const bootstrapState = location.state || {};
  const playerId = searchParams.get("playerId") || bootstrapState.player_id || "";
  const adminId = searchParams.get("adminId") || bootstrapState.admin_id || "";
  const initialCard = bootstrapState.card || null;

  const [playerName, setPlayerName] = useState(bootstrapState.player_name || "Player");
  const [adminName, setAdminName] = useState(bootstrapState.admin_name || "Admin");
  const [card, setCard] = useState(initialCard);
  const [drawnNumbers, setDrawnNumbers] = useState([]);
  const [status, setStatus] = useState(bootstrapState.status || "waiting");
  const [countdown, setCountdown] = useState(bootstrapState.countdown || 0);
  const [lastNumber, setLastNumber] = useState(null);
  const [winner, setWinner] = useState(null);
  const [playerCount, setPlayerCount] = useState(0);
  const [players, setPlayers] = useState([]);
  const [startedAt, setStartedAt] = useState(null);
  const [finishedAt, setFinishedAt] = useState(null);
  const [finance, setFinance] = useState(
    bootstrapState.finance || {
      currency: "ETB",
      contribution_amount: 100,
      commission_percent: 15,
      total_collected: 0,
      commission_amount: 0,
      prize_pool_amount: 0,
      payout_per_winner: 0,
    }
  );
  const [analytics, setAnalytics] = useState(null);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerPhone, setNewPlayerPhone] = useState("");
  const [contributionAmount, setContributionAmount] = useState(finance.contribution_amount);
  const [commissionPercent, setCommissionPercent] = useState(finance.commission_percent);
  const [winningLineTarget, setWinningLineTarget] = useState(1);
  const [allowedPatterns, setAllowedPatterns] = useState(["horizontal", "vertical", "diagonal"]);
  const [allowFullHouse, setAllowFullHouse] = useState(true);
  const [setupDirty, setSetupDirty] = useState(false);
  const [starting, setStarting] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [connectionState, setConnectionState] = useState("Connecting...");
  const [error, setError] = useState("");
  const [linkExpired, setLinkExpired] = useState(false);
  const [adminView, setAdminView] = useState("dashboard");
  const [adminUsers, setAdminUsers] = useState([]);
  const [creatingAdminUser, setCreatingAdminUser] = useState(false);
  const [savingAdminUserId, setSavingAdminUserId] = useState("");
  const [newAdminUsername, setNewAdminUsername] = useState("");
  const [newAdminDisplayName, setNewAdminDisplayName] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [newAdminActive, setNewAdminActive] = useState(true);
  const isAdmin = Boolean(adminId);
  const origin = window.location.origin;
  const adminProfile = getAdminProfile();
  const winnerCount = useMemo(() => players.filter((item) => item.winner).length || (winner ? 1 : 0), [players, winner]);

  useEffect(() => {
    if (!gameId || (!playerId && !adminId)) {
      navigate("/");
    }
  }, [adminId, gameId, navigate, playerId]);

  useEffect(() => {
    if (isAdmin && !adminProfile) {
      navigate("/login", { replace: true, state: { redirectTo: `/game/${gameId}?adminId=${adminId}` } });
    }
  }, [adminId, adminProfile, gameId, isAdmin, navigate]);

  useEffect(() => {
    let isMounted = true;

    async function loadGame() {
      try {
        const response = await getGame(gameId);
        if (!isMounted) {
          return;
        }
        setStatus(response.status);
        setCountdown(response.countdown);
        setDrawnNumbers(response.drawn_numbers);
        setLastNumber(response.drawn_numbers.at(-1) ?? null);
        setPlayerCount(response.player_count);
        setPlayers(response.players);
        setAdminName(response.admin_name);
        setFinance(response.finance);
        if (!setupDirty) {
          setContributionAmount(response.finance.contribution_amount);
          setCommissionPercent(response.finance.commission_percent);
          setWinningLineTarget(response.winning_line_target || 1);
          setAllowedPatterns(response.allowed_line_patterns || ["horizontal", "vertical", "diagonal"]);
          setAllowFullHouse(response.allow_full_house ?? true);
        }
        setStartedAt(response.started_at || null);
        setFinishedAt(response.finished_at || null);
        setCard((currentCard) => applyDrawToCard(currentCard, response.drawn_numbers));
        const matchedWinner = response.winners.find((item) => item.player_id === playerId);
        if (matchedWinner) {
          setWinner(matchedWinner);
        }
      } catch (requestError) {
        setError(requestError.message);
      }
    }

    if (gameId) {
      loadGame();
    }

    return () => {
      isMounted = false;
    };
  }, [gameId, playerId, setupDirty]);

  useEffect(() => {
    if (!isAdmin || !gameId) {
      return undefined;
    }

    const intervalId = window.setInterval(async () => {
      try {
        const [gameResponse, analyticsResponse] = await Promise.all([getGame(gameId), getAdminAnalytics()]);
        setStatus(gameResponse.status);
        setCountdown(gameResponse.countdown);
        setDrawnNumbers(gameResponse.drawn_numbers);
        setLastNumber(gameResponse.drawn_numbers.at(-1) ?? null);
        setPlayerCount(gameResponse.player_count);
        setPlayers(gameResponse.players);
        setAdminName(gameResponse.admin_name);
        setFinance(gameResponse.finance);
        if (!setupDirty) {
          setContributionAmount(gameResponse.finance.contribution_amount);
          setCommissionPercent(gameResponse.finance.commission_percent);
          setWinningLineTarget(gameResponse.winning_line_target || 1);
          setAllowedPatterns(gameResponse.allowed_line_patterns || ["horizontal", "vertical", "diagonal"]);
          setAllowFullHouse(gameResponse.allow_full_house ?? true);
        }
        setStartedAt(gameResponse.started_at || null);
        setFinishedAt(gameResponse.finished_at || null);
        setAnalytics(analyticsResponse);
      } catch (requestError) {
        setError(requestError.message);
      }
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [gameId, isAdmin, setupDirty]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    async function loadAdminData() {
      try {
        const [analyticsResponse, usersResponse] = await Promise.all([getAdminAnalytics(), getAdminUsers()]);
        setAnalytics(analyticsResponse);
        setAdminUsers(usersResponse);
      } catch (requestError) {
        setError(requestError.message);
      }
    }

    loadAdminData();
  }, [isAdmin]);

  useEffect(() => {
    let isMounted = true;

    async function loadPlayerSnapshot() {
      if (!gameId || !playerId || card || isAdmin || linkExpired) {
        return;
      }

      try {
        const response = await getPlayerSnapshot(gameId, playerId);
        if (!isMounted) {
          return;
        }
        setPlayerName(response.player.player_name);
        setAdminName(response.admin_name);
        setWinner(response.winners.find((item) => item.player_id === playerId) || null);
        setCard(applyDrawToCard(response.player.card, response.drawn_numbers));
      } catch (requestError) {
        if (requestError.message.toLowerCase().includes("expired")) {
          setLinkExpired(true);
          return;
        }
        setError(requestError.message);
      }
    }

    loadPlayerSnapshot();

    return () => {
      isMounted = false;
    };
  }, [card, gameId, isAdmin, linkExpired, playerId]);

  useEffect(() => {
    if (!gameId || !playerId || isAdmin || linkExpired) {
      return undefined;
    }

    socketRef.current = connectToGameSocket({
      gameId,
      playerId,
      onOpen: () => setConnectionState("Connected"),
      onClose: () => setConnectionState("Disconnected"),
      onMessage: (payload) => {
        if (payload.type === "snapshot") {
          if (payload.card) {
            setCard((currentCard) => applyDrawToCard(currentCard || payload.card, payload.drawn_numbers));
          }
          setAdminName(payload.admin_name);
          setPlayerName(payload.player_name);
          setStatus(payload.status);
          setCountdown(payload.countdown);
          setDrawnNumbers(payload.drawn_numbers);
          setLastNumber(payload.drawn_numbers.at(-1) ?? null);
          setPlayerCount(payload.player_count);
          const matchedWinner = payload.winners.find((item) => item.player_id === playerId);
          if (matchedWinner) {
            setWinner(matchedWinner);
          }
          return;
        }

        if (payload.type === "countdown") {
          setStatus("countdown");
          setCountdown(payload.countdown);
          setPlayerCount(payload.player_count);
          return;
        }

        if (payload.type === "game_started") {
          setStatus("active");
          setCountdown(0);
          setPlayerCount(payload.player_count);
          return;
        }

        if (payload.type === "draw") {
          setStatus("active");
          setDrawnNumbers(payload.drawn_numbers);
          setLastNumber(payload.last_number);
          setPlayerCount(payload.player_count);
          setCard((currentCard) => applyDrawToCard(currentCard, payload.drawn_numbers));
          const matchedWinner = payload.winners.find((item) => item.player_id === playerId);
          if (matchedWinner) {
            setWinner(matchedWinner);
          }
          return;
        }

        if (payload.type === "winner") {
          const matchedWinner = payload.winners.find((item) => item.player_id === playerId);
          if (matchedWinner) {
            setWinner(matchedWinner);
          }
          return;
        }

        if (payload.type === "game_over") {
          setStatus("finished");
          setDrawnNumbers(payload.drawn_numbers);
          if (payload.finance) {
            setFinance(payload.finance);
          }
        }
      },
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [gameId, isAdmin, linkExpired, playerId]);

  async function handleRegisterPlayer() {
    if (!newPlayerName.trim() || !newPlayerPhone.trim()) {
      setError("Enter both player name and phone number before registering.");
      return;
    }

    try {
      setError("");
      const response = await registerPlayer(gameId, newPlayerName.trim(), newPlayerPhone.trim());
      setPlayers((currentPlayers) => [
        ...currentPlayers,
        {
          player_id: response.player_id,
          player_name: response.player_name,
          phone_number: response.phone_number,
          winner: false,
          pattern: null,
        },
      ]);
      setPlayerCount((count) => count + 1);
      setFinance((currentFinance) => ({
        ...currentFinance,
        total_collected: (playerCount + 1) * Number(currentFinance.contribution_amount),
      }));
      setNewPlayerName("");
      setNewPlayerPhone("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleSaveSettings() {
    try {
      setSavingSettings(true);
      setError("");
      const response = await updateGameSettings(gameId, {
        admin_id: adminId,
        contribution_amount: Number(contributionAmount),
        commission_percent: Number(commissionPercent),
        currency: "ETB",
        winning_line_target: Number(winningLineTarget),
        allowed_line_patterns: allowedPatterns,
        allow_full_house: allowFullHouse,
      });
      setFinance(response.finance);
      setPlayers(response.players);
      setPlayerCount(response.player_count);
      setStatus(response.status);
      setWinningLineTarget(response.winning_line_target || 1);
      setAllowedPatterns(response.allowed_line_patterns || ["horizontal", "vertical", "diagonal"]);
      setAllowFullHouse(response.allow_full_house ?? true);
      setSetupDirty(false);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleStartGame() {
    try {
      setStarting(true);
      setError("");
      const response = await startGame(gameId, adminId);
      setStatus(response.status);
      setCountdown(response.countdown);
      setPlayers(response.players);
      setPlayerCount(response.player_count);
      setFinance(response.finance);
      setStartedAt(response.started_at || null);
      setFinishedAt(response.finished_at || null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setStarting(false);
    }
  }

  async function handleCreateAdminUser() {
    try {
      setCreatingAdminUser(true);
      setError("");
      await createAdminUser({
        username: newAdminUsername.trim(),
        display_name: newAdminDisplayName.trim() || "Admin",
        password: newAdminPassword,
        is_active: newAdminActive,
      });
      const refreshedUsers = await getAdminUsers();
      setAdminUsers(refreshedUsers);
      setNewAdminUsername("");
      setNewAdminDisplayName("");
      setNewAdminPassword("");
      setNewAdminActive(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setCreatingAdminUser(false);
    }
  }

  async function handleUpdateAdmin(item, payload) {
    try {
      setSavingAdminUserId(item.id);
      setError("");
      await updateAdminUser(item.id, payload);
      const refreshedUsers = await getAdminUsers();
      setAdminUsers(refreshedUsers);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingAdminUserId("");
    }
  }

  function handleOpenCard(targetPlayerId) {
    window.open(`/game/${gameId}?playerId=${targetPlayerId}`, "_blank", "noopener,noreferrer");
  }

  function togglePattern(pattern) {
    setSetupDirty(true);
    setAllowedPatterns((current) => {
      if (current.includes(pattern)) {
        return current.length === 1 ? current : current.filter((item) => item !== pattern);
      }
      return [...current, pattern];
    });
  }

  if (linkExpired && !isAdmin) {
    return (
      <main className="game-shell">
        <section className="panel status-panel">
          <div>
            <p className="eyebrow">Player Link Expired</p>
            <h2>Game {gameId}</h2>
            <p className="meta-line">This shared card link is inactive because the game has already ended.</p>
          </div>
          <div className="status-main">
            <button className="ghost-button" onClick={() => navigate("/")}>
              Back to Home
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="game-shell">
      <div className="top-bar">
        <button className="ghost-button" onClick={() => navigate("/")}>
          New Lobby
        </button>
        <div className="top-bar-actions">
          {isAdmin ? (
            <button
              className="ghost-button"
              onClick={() => {
                clearAdminSession();
                navigate("/login", { replace: true });
              }}
            >
              Log Out
            </button>
          ) : null}
          <span className="socket-pill">{isAdmin ? "Admin Console" : connectionState}</span>
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <StatusPanel
        gameId={gameId}
        playerName={playerName}
        adminName={adminName}
        playerCount={playerCount}
        status={status}
        countdown={countdown}
        lastNumber={lastNumber}
        winner={winner}
        mode={isAdmin ? "admin" : "player"}
        finance={finance}
      />

      <section className="game-layout">
        {isAdmin ? (
          <section className="admin-stack">
            <section className="panel admin-menu-panel">
              <div className="admin-menu-grid">
                <button
                  className={adminView === "dashboard" ? "primary-button" : "ghost-button"}
                  onClick={() => setAdminView("dashboard")}
                >
                  Dashboard
                </button>
                <button
                  className={adminView === "trends" ? "primary-button" : "ghost-button"}
                  onClick={() => setAdminView("trends")}
                >
                  Trends
                </button>
                <button
                  className={adminView === "setup" ? "primary-button" : "ghost-button"}
                  onClick={() => setAdminView("setup")}
                >
                  Setup
                </button>
                <button
                  className={adminView === "users" ? "primary-button" : "ghost-button"}
                  onClick={() => setAdminView("users")}
                >
                  Admin Users
                </button>
              </div>
            </section>

            {adminView === "dashboard" ? (
              <>
                <section className="panel admin-panel">
                  <div className="panel-heading">
                    <h3>Live Game Status</h3>
                    <span>{status === "waiting" ? "Waiting" : status === "finished" ? "Finished" : "In Progress"}</span>
                  </div>
                  <div className="metric-grid">
                    <div className="metric-card">
                      <span>Started</span>
                      <strong>{formatDateTime(startedAt)}</strong>
                    </div>
                    <div className="metric-card">
                      <span>Ended</span>
                      <strong>{formatDateTime(finishedAt)}</strong>
                    </div>
                    <div className="metric-card">
                      <span>Winners</span>
                      <strong>{winnerCount}</strong>
                      <p>Total winners in this game</p>
                    </div>
                    <div className="metric-card">
                      <span>Winning Amount</span>
                      <strong>{formatMoney(finance.payout_per_winner, finance.currency)}</strong>
                      <p>Per winner payout</p>
                    </div>
                    <div className="metric-card">
                      <span>Service Commission</span>
                      <strong>{formatMoney(finance.commission_amount, finance.currency)}</strong>
                      <p>{finance.commission_percent}% commission</p>
                    </div>
                  </div>
                  <div className="trend-list">
                    {(winner ? [winner] : players.filter((item) => item.winner)).map((item) => (
                      <div key={item.player_id} className="trend-item">
                        <span>{item.player_name}</span>
                        <strong>{String(item.pattern || "winner").replace(/_/g, " ")}</strong>
                        <em>{item.phone_number}</em>
                      </div>
                    ))}
                    {winnerCount === 0 ? <p className="empty-state">Winner details will appear when bingo is hit.</p> : null}
                  </div>
                </section>

                <FinanceSummary finance={finance} winnerCount={winnerCount} />

                <PlayerRoster
                  gameId={gameId}
                  players={players}
                  origin={origin}
                  onStart={handleStartGame}
                  onOpenCard={handleOpenCard}
                  canStart={status === "waiting" && players.length > 0}
                  starting={starting}
                  shareEnabled={status !== "finished"}
                />
              </>
            ) : null}

            {adminView === "trends" ? (
              <>
                <AnalyticsPanel analytics={analytics} currency={finance.currency} />
                <section className="panel">
                  <div className="panel-heading">
                    <h3>Recent Finished Games</h3>
                    <span>Winners and service commission</span>
                  </div>
                  <div className="trend-list">
                    {analytics?.recent_finished_games?.map((item) => (
                      <div key={item.game_id} className="trend-item">
                        <span>{item.game_id}</span>
                        <strong>
                          {formatDateTime(item.started_at)} - {formatDateTime(item.finished_at)}
                        </strong>
                        <em>
                          Winners: {item.winner_count} • Commission:{" "}
                          {formatMoney(item.finance.commission_amount, item.finance.currency)}
                        </em>
                      </div>
                    ))}
                    {!analytics?.recent_finished_games?.length ? (
                      <p className="empty-state">No finished games available yet.</p>
                    ) : null}
                  </div>
                </section>
              </>
            ) : null}

            {adminView === "setup" ? (
              <section className="panel admin-panel">
                <div className="panel-heading">
                  <h3>Game Setup</h3>
                  <span>Winner pattern controls</span>
                </div>
                <div className="admin-form-grid">
                  <label>
                    Entry per player (Birr)
                    <input
                      type="number"
                      min="0"
                      value={contributionAmount}
                      onChange={(event) => {
                        setSetupDirty(true);
                        setContributionAmount(event.target.value);
                      }}
                      disabled={status !== "waiting"}
                    />
                  </label>
                  <label>
                    Commission percent
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={commissionPercent}
                      onChange={(event) => {
                        setSetupDirty(true);
                        setCommissionPercent(event.target.value);
                      }}
                      disabled={status !== "waiting"}
                    />
                  </label>
                </div>
                <div className="admin-form-grid">
                  <label>
                    Required completed lines
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={winningLineTarget}
                      onChange={(event) => {
                        setSetupDirty(true);
                        const rawValue = Number(event.target.value);
                        const safeValue = Number.isFinite(rawValue) ? Math.min(5, Math.max(1, Math.floor(rawValue))) : 1;
                        setWinningLineTarget(safeValue);
                      }}
                      disabled={status !== "waiting"}
                    />
                  </label>
                  <label className="checkbox-label">
                    Include full house
                    <input
                      type="checkbox"
                      checked={allowFullHouse}
                      onChange={(event) => {
                        setSetupDirty(true);
                        setAllowFullHouse(event.target.checked);
                      }}
                      disabled={status !== "waiting"}
                    />
                  </label>
                </div>
                <div className="setup-patterns">
                  <button
                    type="button"
                    className={allowedPatterns.includes("horizontal") ? "secondary-button" : "ghost-button"}
                    disabled={status !== "waiting"}
                    onClick={() => togglePattern("horizontal")}
                  >
                    Horizontal
                  </button>
                  <button
                    type="button"
                    className={allowedPatterns.includes("vertical") ? "secondary-button" : "ghost-button"}
                    disabled={status !== "waiting"}
                    onClick={() => togglePattern("vertical")}
                  >
                    Vertical
                  </button>
                  <button
                    type="button"
                    className={allowedPatterns.includes("diagonal") ? "secondary-button" : "ghost-button"}
                    disabled={status !== "waiting"}
                    onClick={() => togglePattern("diagonal")}
                  >
                    Diagonal
                  </button>
                </div>
                <button
                  className="secondary-button"
                  onClick={handleSaveSettings}
                  disabled={status !== "waiting" || savingSettings}
                >
                  {savingSettings ? "Saving..." : "Save Game Settings"}
                </button>
                <div className="admin-form-grid">
                  <label>
                    Player name
                    <input
                      value={newPlayerName}
                      onChange={(event) => setNewPlayerName(event.target.value)}
                      placeholder="Player name"
                      disabled={status !== "waiting"}
                    />
                  </label>
                  <label>
                    Phone number
                    <input
                      value={newPlayerPhone}
                      onChange={(event) => setNewPlayerPhone(event.target.value)}
                      placeholder="09..., +251..."
                      disabled={status !== "waiting"}
                    />
                  </label>
                </div>
                <button
                  className="secondary-button"
                  onClick={handleRegisterPlayer}
                  disabled={status !== "waiting"}
                >
                  Register Player and Deal Card
                </button>
              </section>
            ) : null}

            {adminView === "users" ? (
              <section className="panel admin-panel">
                <div className="panel-heading">
                  <h3>Admin Accounts</h3>
                  <span>Add and edit admin users</span>
                </div>
                <div className="admin-form-grid">
                  <label>
                    Username
                    <input value={newAdminUsername} onChange={(event) => setNewAdminUsername(event.target.value)} />
                  </label>
                  <label>
                    Display name
                    <input
                      value={newAdminDisplayName}
                      onChange={(event) => setNewAdminDisplayName(event.target.value)}
                    />
                  </label>
                </div>
                <div className="admin-form-grid">
                  <label>
                    Password
                    <input
                      type="password"
                      value={newAdminPassword}
                      onChange={(event) => setNewAdminPassword(event.target.value)}
                    />
                  </label>
                  <label className="checkbox-label">
                    Active
                    <input
                      type="checkbox"
                      checked={newAdminActive}
                      onChange={(event) => setNewAdminActive(event.target.checked)}
                    />
                  </label>
                </div>
                <button
                  className="secondary-button"
                  onClick={handleCreateAdminUser}
                  disabled={!newAdminUsername.trim() || !newAdminPassword.trim() || creatingAdminUser}
                >
                  {creatingAdminUser ? "Creating..." : "Add Admin User"}
                </button>

                <div className="trend-list">
                  {adminUsers.map((item) => (
                    <div key={item.id} className="trend-item">
                      <span>{item.username}</span>
                      <strong>{item.display_name}</strong>
                      <em>{item.is_active ? "Active" : "Disabled"}</em>
                      <div className="share-button-row">
                        <button
                          className="ghost-button"
                          disabled={savingAdminUserId === item.id}
                          onClick={() =>
                            handleUpdateAdmin(item, {
                              is_active: !item.is_active,
                            })
                          }
                        >
                          {item.is_active ? "Disable" : "Enable"}
                        </button>
                        <button
                          className="ghost-button"
                          disabled={savingAdminUserId === item.id}
                          onClick={() => {
                            const name = window.prompt("New display name", item.display_name);
                            if (name === null) {
                              return;
                            }
                            handleUpdateAdmin(item, { display_name: name.trim() || item.display_name });
                          }}
                        >
                          Edit Name
                        </button>
                        <button
                          className="ghost-button"
                          disabled={savingAdminUserId === item.id}
                          onClick={() => {
                            const password = window.prompt("New password (minimum 8 chars)");
                            if (!password) {
                              return;
                            }
                            handleUpdateAdmin(item, { password });
                          }}
                        >
                          Reset Password
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </section>
        ) : (
          <BingoCard card={card} />
        )}
        <DrawnNumbers numbers={drawnNumbers} />
      </section>
    </main>
  );
}

export default Game;
