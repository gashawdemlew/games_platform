function DrawnNumbers({ numbers }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h3>Drawn Numbers</h3>
        <span>{numbers.length}/75</span>
      </div>
      <div className="drawn-numbers">
        {numbers.length === 0 ? (
          <p className="empty-state">Waiting for the first draw...</p>
        ) : (
          numbers
            .slice()
            .reverse()
            .map((number) => (
              <span key={number} className="draw-chip">
                {number}
              </span>
            ))
        )}
      </div>
    </section>
  );
}

export default DrawnNumbers;

