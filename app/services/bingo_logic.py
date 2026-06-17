from __future__ import annotations

import random
import os, sys

cur_dir = os.getcwd()
parent_dir = os.path.realpath(os.path.join(os.path.dirname(cur_dir)))
if parent_dir not in sys.path:
    sys.path.append(parent_dir)
    sys.path.append(cur_dir)
sys.path.insert(1, ".")

from app.models.schemas import BingoCard, CardCell, WinCheckResponse


COLUMN_RANGES = {
    "B": range(1, 16),
    "I": range(16, 31),
    "N": range(31, 46),
    "G": range(46, 61),
    "O": range(61, 76),
}


def generate_bingo_card() -> BingoCard:
    columns: list[list[CardCell]] = []
    for letter, number_range in COLUMN_RANGES.items():
        picks = random.sample(list(number_range), 5)
        column = [
            CardCell(letter=letter, value=value, is_free=False, marked=False)
            for value in sorted(picks)
        ]
        columns.append(column)

    columns[2][2] = CardCell(letter="N", value=None, is_free=True, marked=True)
    grid = [[columns[col_idx][row_idx] for col_idx in range(5)] for row_idx in range(5)]
    return BingoCard(grid=grid)


def generate_draw_sequence() -> list[int]:
    numbers = list(range(1, 76))
    random.shuffle(numbers)
    return numbers


def mark_card(card: BingoCard, drawn_number: int) -> BingoCard:
    for row in card.grid:
        for cell in row:
            if cell.value == drawn_number:
                cell.marked = True
    return card


def check_win(
    card: BingoCard,
    winning_line_target: int = 1,
    allowed_line_patterns: list[str] | None = None,
    allow_full_house: bool = True,
) -> WinCheckResponse:
    grid = card.grid
    line_target = max(1, int(winning_line_target))
    allowed = set(allowed_line_patterns or ["horizontal", "vertical", "diagonal"])

    if allow_full_house and all(cell.marked for row in grid for cell in row):
        return WinCheckResponse(winner=True, pattern="full_house")

    horizontal_lines = 0
    vertical_lines = 0
    diagonal_lines = 0

    if "horizontal" in allowed:
        for row in grid:
            if all(cell.marked for cell in row):
                horizontal_lines += 1

    if "vertical" in allowed:
        for column_index in range(5):
            if all(grid[row_index][column_index].marked for row_index in range(5)):
                vertical_lines += 1

    if "diagonal" in allowed:
        if all(grid[index][index].marked for index in range(5)):
            diagonal_lines += 1

        if all(grid[index][4 - index].marked for index in range(5)):
            diagonal_lines += 1

    total_lines = horizontal_lines + vertical_lines + diagonal_lines
    if total_lines < line_target:
        return WinCheckResponse(winner=False, pattern=None)

    if horizontal_lines >= line_target:
        return WinCheckResponse(winner=True, pattern="horizontal")
    if vertical_lines >= line_target:
        return WinCheckResponse(winner=True, pattern="vertical")
    if diagonal_lines >= line_target:
        return WinCheckResponse(winner=True, pattern="diagonal")

    return WinCheckResponse(winner=True, pattern=f"{line_target}_line_combo")
