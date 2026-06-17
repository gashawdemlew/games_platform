import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { adminLogin } from "../services/api";

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.redirectTo || "/";
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await adminLogin(username.trim(), password);
      navigate(redirectTo, { replace: true });
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
          <p className="eyebrow">Admin Access</p>
          <h1>Sign In</h1>
          <p className="hero-text">
            Log in before creating games, registering players, or opening the revenue dashboard.
          </p>
        </div>

        <div className="home-grid">
          <form className="panel home-card" onSubmit={handleSubmit}>
            <h2>Admin Login</h2>
            <label>
              Username
              <input value={username} onChange={(event) => setUsername(event.target.value)} />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? "Signing In..." : "Login"}
            </button>
          </form>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </main>
  );
}

export default Login;
