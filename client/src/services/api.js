const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const ADMIN_TOKEN_KEY = "bingo_admin_token";
const ADMIN_PROFILE_KEY = "bingo_admin_profile";
const PLAYER_TOKEN_KEY = "bingo_player_token";
const PLAYER_PROFILE_KEY = "bingo_player_profile";

export function getAdminToken() {
  return window.localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function getAdminProfile() {
  const raw = window.localStorage.getItem(ADMIN_PROFILE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setAdminSession(token, admin) {
  window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
  window.localStorage.setItem(ADMIN_PROFILE_KEY, JSON.stringify(admin));
}

export function clearAdminSession() {
  window.localStorage.removeItem(ADMIN_TOKEN_KEY);
  window.localStorage.removeItem(ADMIN_PROFILE_KEY);
}

export function getPlayerToken() {
  return window.localStorage.getItem(PLAYER_TOKEN_KEY);
}

export function getPlayerProfile() {
  const raw = window.localStorage.getItem(PLAYER_PROFILE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setPlayerSession(token, profile) {
  window.localStorage.setItem(PLAYER_TOKEN_KEY, token);
  window.localStorage.setItem(PLAYER_PROFILE_KEY, JSON.stringify(profile));
}

export function clearPlayerSession() {
  window.localStorage.removeItem(PLAYER_TOKEN_KEY);
  window.localStorage.removeItem(PLAYER_PROFILE_KEY);
}

async function request(path, options = {}) {
  const token = getAdminToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || "Request failed");
  }

  return response.json();
}

async function playerRequest(path, options = {}) {
  const token = getPlayerToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || "Request failed");
  }

  return response.json();
}

export async function adminLogin(username, password) {
  const response = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  setAdminSession(response.token, response.admin);
  return response;
}

export async function getAdminMe() {
  return request("/auth/me");
}

export async function createGame(adminName, contributionAmount, commissionPercent, currency = "ETB") {
  return request("/create-game", {
    method: "POST",
    body: JSON.stringify({
      admin_name: adminName,
      contribution_amount: Number(contributionAmount),
      commission_percent: Number(commissionPercent),
      currency,
    }),
  });
}

export async function startGame(gameId, adminId) {
  return request(`/game/${gameId}/start`, {
    method: "POST",
    body: JSON.stringify({ admin_id: adminId }),
  });
}

export async function getGame(gameId) {
  return request(`/game/${gameId}`);
}

export async function getPlayerSnapshot(gameId, playerId) {
  return request(`/game/${gameId}/player/${playerId}`);
}

export async function updateGameSettings(gameId, payload) {
  return request(`/game/${gameId}/settings`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function getAdminAnalytics() {
  return request("/admin/analytics");
}

export async function getAdminUsers() {
  return request("/auth/admin-users");
}

export async function createAdminUser(payload) {
  return request("/auth/admin-users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAdminUser(adminUserId, payload) {
  return request(`/auth/admin-users/${adminUserId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function establishPlayerSession(fullName, phoneNumber) {
  const response = await fetch(`${API_BASE_URL}/players/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ full_name: fullName, phone_number: phoneNumber }),
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || "Request failed");
  }
  const data = await response.json();
  setPlayerSession(data.token, data.profile);
  return data;
}

export async function updatePlayerProfile(fullName, phoneNumber) {
  return playerRequest("/players/me", {
    method: "PUT",
    body: JSON.stringify({ full_name: fullName, phone_number: phoneNumber }),
  });
}

export async function getOpenLobby() {
  return fetch(`${API_BASE_URL}/lobby/open`).then(async (response) => {
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.detail || "Request failed");
    }
    return response.json();
  });
}

export async function getMyGameRegistration(gameId) {
  return playerRequest(`/game/${gameId}/registration`);
}

export async function selfRegisterForGame(gameId, paymentMethod, receiptData = null) {
  return playerRequest(`/game/${gameId}/self-register`, {
    method: "POST",
    body: JSON.stringify({ payment_method: paymentMethod, receipt_data: receiptData }),
  });
}

export async function approveRegistration(gameId, playerId, adminId) {
  return request(`/game/${gameId}/registrations/${playerId}/approve`, {
    method: "POST",
    body: JSON.stringify({ admin_id: adminId }),
  });
}

export async function rejectRegistration(gameId, playerId, adminId) {
  return request(`/game/${gameId}/registrations/${playerId}/reject`, {
    method: "POST",
    body: JSON.stringify({ admin_id: adminId }),
  });
}

export { API_BASE_URL };
