import { useEffect, useState } from "react";
import QRCode from "qrcode";

function PublicJoinLink({ gameId, origin, disabled = false }) {
  const joinUrl = `${origin}/play?gameId=${gameId}`;
  const [showQr, setShowQr] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    let active = true;

    async function buildQr() {
      if (!showQr || disabled) {
        return;
      }
      const code = await QRCode.toDataURL(joinUrl, {
        width: 240,
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
  }, [joinUrl, showQr, disabled]);

  async function handleCopyLink() {
    if (disabled) {
      return;
    }
    await navigator.clipboard.writeText(joinUrl);
  }

  return (
    <section className="panel public-join-panel">
      <div className="panel-heading">
        <h3>Public Registration</h3>
        <span>Scan to register</span>
      </div>
      <p className="mini-meta">
        Players open this link once, save their profile, and register for this game.
      </p>
      <p className="public-link-line">
        <strong>{joinUrl}</strong>
      </p>
      <div className="share-button-row">
        <button className="ghost-button" onClick={handleCopyLink} disabled={disabled}>
          Copy Link
        </button>
        <button className="ghost-button" onClick={() => setShowQr((value) => !value)} disabled={disabled}>
          {showQr ? "Hide QR" : "Show QR"}
        </button>
      </div>
      {disabled ? (
        <p className="mini-meta">Registration is closed because this game is no longer in waiting status.</p>
      ) : null}
      {showQr && !disabled ? (
        <div className="qr-panel">
          {qrDataUrl ? <img src={qrDataUrl} alt="QR code for player registration" className="qr-image" /> : null}
          <p className="mini-meta">Scan to open the public registration page for this game.</p>
        </div>
      ) : null}
    </section>
  );
}

export default PublicJoinLink;
