import type { BingoCard, CardCell, LinePattern } from "../types.js";

const COLUMN_RANGES: Record<string, number[]> = {
  B: Array.from({ length: 15 }, (_, i) => i + 1),
  I: Array.from({ length: 15 }, (_, i) => i + 16),
  N: Array.from({ length: 15 }, (_, i) => i + 31),
  G: Array.from({ length: 15 }, (_, i) => i + 46),
  O: Array.from({ length: 15 }, (_, i) => i + 61),
};

function sample<T>(items: T[], count: number): T[] {
  const copy = [...items];
  const picks: T[] = [];
  for (let i = 0; i < count; i += 1) {
    const index = Math.floor(Math.random() * copy.length);
    picks.push(copy[index]!);
    copy.splice(index, 1);
  }
  return picks;
}

export function generateBingoCard(): BingoCard {
  const columns: CardCell[][] = [];
  for (const [letter, numberRange] of Object.entries(COLUMN_RANGES)) {
    const picks = sample(numberRange, 5).sort((a, b) => a - b);
    columns.push(
      picks.map((value) => ({
        letter,
        value,
        is_free: false,
        marked: false,
      })),
    );
  }

  columns[2]![2] = { letter: "N", value: null, is_free: true, marked: true };
  const grid = Array.from({ length: 5 }, (_, rowIdx) =>
    Array.from({ length: 5 }, (_, colIdx) => columns[colIdx]![rowIdx]!),
  );
  return { grid };
}

export function generateDrawSequence(): number[] {
  const numbers = Array.from({ length: 75 }, (_, i) => i + 1);
  for (let i = numbers.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [numbers[i], numbers[j]] = [numbers[j]!, numbers[i]!];
  }
  return numbers;
}

export function markCard(card: BingoCard, drawnNumber: number): BingoCard {
  for (const row of card.grid) {
    for (const cell of row) {
      if (cell.value === drawnNumber) {
        cell.marked = true;
      }
    }
  }
  return card;
}

export function checkWin(
  card: BingoCard,
  winningLineTarget = 1,
  allowedLinePatterns: LinePattern[] | null = null,
  allowFullHouse = true,
): { winner: boolean; pattern: string | null } {
  const grid = card.grid;
  const lineTarget = Math.max(1, winningLineTarget);
  const allowed = new Set(allowedLinePatterns ?? ["horizontal", "vertical", "diagonal"]);

  if (allowFullHouse && grid.every((row) => row.every((cell) => cell.marked))) {
    return { winner: true, pattern: "full_house" };
  }

  let horizontalLines = 0;
  let verticalLines = 0;
  let diagonalLines = 0;

  if (allowed.has("horizontal")) {
    for (const row of grid) {
      if (row.every((cell) => cell.marked)) horizontalLines += 1;
    }
  }

  if (allowed.has("vertical")) {
    for (let col = 0; col < 5; col += 1) {
      if (grid.every((row) => row[col]!.marked)) verticalLines += 1;
    }
  }

  if (allowed.has("diagonal")) {
    if (grid.every((row, idx) => row[idx]!.marked)) diagonalLines += 1;
    if (grid.every((row, idx) => row[4 - idx]!.marked)) diagonalLines += 1;
  }

  const totalLines = horizontalLines + verticalLines + diagonalLines;
  if (totalLines < lineTarget) {
    return { winner: false, pattern: null };
  }
  if (horizontalLines >= lineTarget) return { winner: true, pattern: "horizontal" };
  if (verticalLines >= lineTarget) return { winner: true, pattern: "vertical" };
  if (diagonalLines >= lineTarget) return { winner: true, pattern: "diagonal" };
  return { winner: true, pattern: `${lineTarget}_line_combo` };
}
