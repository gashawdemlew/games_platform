import Cell from "./Cell";

const HEADERS = ["B", "I", "N", "G", "O"];

function BingoCard({ card }) {
  if (!card) {
    return null;
  }

  return (
    <section className="card-panel">
      <div className="card-header-row">
        {HEADERS.map((header) => (
          <div key={header} className="card-header-cell">
            {header}
          </div>
        ))}
      </div>
      <div className="card-grid">
        {card.grid.flat().map((cell, index) => (
          <Cell key={`${cell.letter}-${cell.value ?? "free"}-${index}`} cell={cell} />
        ))}
      </div>
    </section>
  );
}

export default BingoCard;

