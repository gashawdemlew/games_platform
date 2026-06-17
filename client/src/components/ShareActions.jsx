import { useEffect, useState } from "react";
import QRCode from "qrcode";

function normalizePhone(phoneNumber) {
  return phoneNumber.replace(/[^\d]/g, "");
}

function ShareActions({ playerName, phoneNumber, playerUrl, disabled = false }) {
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    let active = true;

    async function buildQr() {
      if (!showQr) {
        return;
      }
      const code = await QRCode.toDataURL(playerUrl, {
        width: 220,
        margin: 1,
        color: {
          dark: "#102033",
          light: "#F8EFE5",
        },
      });
      if (active) {
        setQrDataUrl(code);
      }
    }

    buildQr();

    return () => {
      active = false;
    };
  }, [playerUrl, showQr]);

  async function handleCopyLink() {
    if (disabled) {
      return;
    }
    await navigator.clipboard.writeText(playerUrl);
  }

  const whatsappUrl = `https://wa.me/${normalizePhone(phoneNumber)}?text=${encodeURIComponent(
    `Hello ${playerName}, here is your private Bingo card: ${playerUrl}`
  )}`;

  return (
    <div className="share-actions">
      <div className="share-button-row">
        <button
          className="ghost-button"
          onClick={() => window.open(whatsappUrl, "_blank", "noopener,noreferrer")}
          disabled={disabled}
        >
          WhatsApp
        </button>
        <button className="ghost-button" onClick={handleCopyLink} disabled={disabled}>
          Copy Link
        </button>
        <button className="ghost-button" onClick={() => setShowQr((value) => !value)} disabled={disabled}>
          {showQr ? "Hide QR" : "Show QR"}
        </button>
      </div>
      {disabled ? (
        <p className="mini-meta">Player link expired because the game is finished.</p>
      ) : null}
      {showQr && !disabled ? (
        <div className="qr-panel">
          {qrDataUrl ? <img src={qrDataUrl} alt={`QR for ${playerName}`} className="qr-image" /> : null}
          <p className="mini-meta">Scan privately from the admin screen to open the player card.</p>
        </div>
      ) : null}
    </div>
  );
}

export default ShareActions;
