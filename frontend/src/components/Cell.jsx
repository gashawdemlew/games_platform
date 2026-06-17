function Cell({ cell }) {
  const classNames = [
    "bingo-cell",
    cell.marked ? "is-marked" : "",
    cell.is_free ? "is-free" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classNames}>
      <span>{cell.is_free ? "FREE" : cell.value}</span>
    </div>
  );
}

export default Cell;

