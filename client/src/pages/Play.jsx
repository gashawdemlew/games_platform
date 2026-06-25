import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import BingoCard from "../components/BingoCard";
import {
  establishPlayerSession,
  getMyGameRegistration,
  getOpenLobby,
  getPlayerProfile,
  getPlayerToken,
  selfRegisterForGame,
  setPlayerSession,
  updatePlayerProfile,
} from "../services/api";

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Play() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryGameId = searchParams.get("gameId") || "";

  const savedProfile = getPlayerProfile();
  const [profile, setProfile] = useState(savedProfile);
  const [fullName, setFullName] = useState(savedProfile?.full_name || "");
  const [phoneNumber, setPhoneNumber] = useState(savedProfile?.phone_number || "");
  const [gameId, setGameId] = useState(queryGameId);
  const [lobby, setLobby] = useState(null);
  const [registration, setRegistration] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [receiptFile, setReceiptFile] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingProfile, setEditingProfile] = useState(!savedProfile);

  const gameInfo = lobby?.game;
  const isOpen = lobby?.open && gameInfo?.status === "waiting";

  useEffect(() => {
    async function loadLobby() {
      try {
        setLoading(true);
        const response = await getOpenLobby();
        setLobby(response);
        if (!queryGameId && response.open) {
          setGameId(response.game.game_id);
        }
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    }
    loadLobby();
  }, [queryGameId]);

  useEffect(() => {
    async function loadRegistration() {
      if (!profile || !gameId) {
        setRegistration(null);
        return;
      }
      try {
        const response = await getMyGameRegistration(gameId);
        setRegistration(response);
      } catch (requestError) {
        setError(requestError.message);
      }
    }
    loadRegistration();
    const intervalId = window.setInterval(loadRegistration, 4000);
    return () => window.clearInterval(intervalId);
  }, [profile, gameId]);

  const approvedCard = useMemo(() => {
    if (registration?.registration_status === "approved" && registration.card) {
      return registration.card;
    }
    return null;
  }, [registration]);

  async function handleSaveProfile(event) {
    event.preventDefault();
    try {
      setError("");
      setSubmitting(true);
      if (profile) {
        const updated = await updatePlayerProfile(fullName.trim(), phoneNumber.trim());
        setProfile(updated);
        setPlayerSession(getPlayerToken(), updated);
      } else {
        const response = await establishPlayerSession(fullName.trim(), phoneNumber.trim());
        setProfile(response.profile);
      }
      setEditingProfile(false);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegisterForGame(event) {
    event.preventDefault();
    if (!profile || !gameId) {
      return;
    }
    try {
      setError("");
      setSubmitting(true);
      let receiptData = null;
      if (receiptFile) {
        receiptData = await readFileAsDataUrl(receiptFile);
      }
      const response = await selfRegisterForGame(gameId, paymentMethod, receiptData);
      setRegistration({
        registered: true,
        game_id: gameId,
        status: response.status,
        player_id: response.player_id,
        player_name: response.player_name,
        phone_number: response.phone_number,
        registration_status: response.registration_status,
        payment_method: response.payment_method,
        card: response.card,
      });
      setReceiptFile(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="game-shell">
      <div className="top-bar">
        <Link className="ghost-button" to="/login">
          Admin Login
        </Link>
        <span className="socket-pill">Player Registration</span>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <section className="panel">
        <div className="panel-heading">
          <h2>Player Profile</h2>
          <span>{profile ? "Saved on this device" : "Create once, reuse every game"}</span>
        </div>

        {editingProfile || !profile ? (
          <form className="admin-form-grid" onSubmit={handleSaveProfile}>
            <label>
              Full name
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
            </label>
            <label>
              Phone number
              <input value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} required />
            </label>
            <button className="primary-button" type="submit" disabled={submitting}>
              {profile ? "Update Profile" : "Save Profile"}
            </button>
          </form>
        ) : (
          <div className="metric-grid">
            <div className="metric-card">
              <span>Name</span>
              <strong>{profile.full_name}</strong>
            </div>
            <div className="metric-card">
              <span>Phone</span>
              <strong>{profile.phone_number}</strong>
            </div>
            <button className="ghost-button" onClick={() => setEditingProfile(true)}>
              Edit Profile
            </button>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Current Game</h2>
          <span>{loading ? "Loading..." : isOpen ? "Registration open" : "No open lobby"}</span>
        </div>

        {!isOpen ? (
          <p className="empty-state">
            There is no game accepting registrations right now. Check back when the admin opens a new lobby.
          </p>
        ) : (
          <>
            <div className="metric-grid">
              <div className="metric-card">
                <span>Game</span>
                <strong>{gameInfo.game_id}</strong>
              </div>
              <div className="metric-card">
                <span>Entry fee</span>
                <strong>
                  {gameInfo.finance.currency} {gameInfo.finance.contribution_amount}
                </strong>
              </div>
              <div className="metric-card">
                <span>Approved players</span>
                <strong>{gameInfo.approved_count ?? gameInfo.player_count}</strong>
              </div>
            </div>

            {!profile ? (
              <p className="mini-meta">Save your profile above before registering for this game.</p>
            ) : null}

            {profile && !registration?.registered ? (
              <form className="admin-form-grid" onSubmit={handleRegisterForGame}>
                <label>
                  Payment method
                  <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                    <option value="cash">Cash (paid at desk)</option>
                    <option value="transfer">Bank transfer / mobile money</option>
                  </select>
                </label>
                <label>
                  Payment receipt (optional)
                  <input type="file" accept="image/*,.pdf" onChange={(event) => setReceiptFile(event.target.files?.[0] || null)} />
                </label>
                <button className="primary-button" type="submit" disabled={submitting}>
                  {submitting ? "Submitting..." : "Register for Game"}
                </button>
                <p className="mini-meta">
                  Your unique bingo card is generated when you register. Admin will approve after checking payment.
                </p>
              </form>
            ) : null}

            {registration?.registered ? (
              <div className="panel">
                <p className="meta-line">
                  Status: <strong>{registration.registration_status}</strong> • Payment: {registration.payment_method}
                </p>
                {registration.registration_status === "pending" ? (
                  <p className="mini-meta">Waiting for admin to verify your payment and approve your card.</p>
                ) : null}
                {registration.registration_status === "rejected" ? (
                  <p className="error-text">Your registration was not approved. Contact the game admin.</p>
                ) : null}
                {registration.registration_status === "approved" ? (
                  <>
                    <p className="mini-meta">You are approved. Open your live card when the draw starts.</p>
                    <button
                      className="primary-button"
                      onClick={() => navigate(`/game/${gameId}?playerId=${registration.player_id}`)}
                    >
                      Open My Card
                    </button>
                  </>
                ) : null}
                {approvedCard ? (
                  <div className="card-preview-wrap">
                    <BingoCard card={approvedCard} />
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </section>

      {gameInfo?.status === "finished" ? (
        <section className="panel">
          <p className="empty-state">
            The last game has ended. Stay on this page — when the admin opens the next lobby, you can register again with
            the same profile.
          </p>
        </section>
      ) : null}
    </main>
  );
}

export default Play;
