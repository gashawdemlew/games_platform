import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearAdminSession, createGame, getAdminProfile } from "../services/api";

function Home() {
  const navigate = useNavigate();
  const adminProfile = getAdminProfile();
  const [adminName, setAdminName] = useState("Floor Manager");
  const [contributionAmount, setContributionAmount] = useState(100);
  const [commissionPercent, setCommissionPercent] = useState(15);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreateGame() {
    setLoading(true);
    setError("");
    try {
      const response = await createGame(
        adminName.trim() || "Floor Manager",
        contributionAmount,
        commissionPercent,
        "ETB"
      );
      navigate(`/game/${response.game_id}?adminId=${response.admin_id}`, {
        state: response,
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="home-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">75-Ball Virtual Bingo</p>
          <h1>Bingo Royale</h1>
          <p className="hero-text">
            Create a multiplayer room, register every player from the admin desk,
            deal unique cards, then launch the live draw when the lobby is ready.
          </p>
          {adminProfile ? (
            <p className="hero-text">Signed in as {adminProfile.display_name}.</p>
          ) : null}
        </div>

        <div className="home-grid">
          <div className="panel home-card">
            <h2>Create Admin Lobby</h2>
            <label>
              Admin name
              <input value={adminName} onChange={(event) => setAdminName(event.target.value)} />
            </label>
            <label>
              Entry per player (Birr)
              <input
                type="number"
                min="0"
                value={contributionAmount}
                onChange={(event) => setContributionAmount(event.target.value)}
              />
            </label>
            <label>
              Commission percent
              <input
                type="number"
                min="0"
                max="100"
                value={commissionPercent}
                onChange={(event) => setCommissionPercent(event.target.value)}
              />
            </label>
            <button className="primary-button" onClick={handleCreateGame} disabled={loading}>
              {loading ? "Creating..." : "Open Lobby"}
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={() => {
                clearAdminSession();
                navigate("/login");
              }}
            >
              Log Out
            </button>
          </div>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </main>
  );
}

export default Home;
