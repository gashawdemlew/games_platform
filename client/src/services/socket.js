function buildSocketUrl(gameId, playerId) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(`${protocol}//${window.location.host}/ws/game/${gameId}`);
  url.searchParams.set("player_id", playerId);
  return url.toString();
}

export function connectToGameSocket({ gameId, playerId, onMessage, onOpen, onClose }) {
  const socket = new WebSocket(buildSocketUrl(gameId, playerId));

  socket.onopen = () => {
    if (onOpen) {
      onOpen();
    }
  };

  socket.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    onMessage(payload);
  };

  socket.onclose = () => {
    if (onClose) {
      onClose();
    }
  };

  return socket;
}

