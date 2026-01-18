# Implementation Plan - Strict Reference Adherence

## Objective
Create a 52-card deck that strictly adheres to the provided visual references, ensuring no "creative liberties" are taken.

## The Two Design Models

### 1. Number Cards (Template: '2 of Spades' Reference)
*   **Source**: User providing `uploaded_image_1768653471455.jpg` (2 of Spades).
*   **Layout Rule**:
    *   **Index (Top-Left)**: Bold Rank stacked vertically above a small Suit Pip.
    *   **Body**: A **Single Massive Suit Symbol** (Big Pip) centered horizontally and weighted towards the bottom.
    *   **No Other Elements**: No center numerals (like 5, 7). Only the Pip.
    *   **Colors**: 4-Color System (Black, Red, Blue, Green).
*   **Application**: Applies to ranks A, 2, 3, 4, 5, 6, 7, 8, 9, 10.

### 2. Face Cards (Template: J, Q, K Images)
*   **Source**: User provided J, Q, K images (Spades).
*   **Layout Rule**:
    *   **Image**: Displays the exact J/Q/K portrait image provided.
    *   **Suit Variation**: 
        *   The existing Top-Left Index (Spade) will be **covered** by a new, chemically pure Index match for Hearts (Red), Diamonds (Blue), and Clubs (Green).
        *   This ensures the "Same Character" is used, but the "Different Suit/Color" requirement is met.

## Execution Steps

1.  **Refine CSS for Number Cards**: 
    *   Adjust the "Fresh Start V2" code to ensure the "Big Pip" is positioned *exactly* as it appears in the 2 of Spades reference.
    *   Verify the font weight matches the reference (Arial Bold/Black).

2.  **Refine CSS for Face Cards**:
    *   Create a "Corner Patch" style that perfectly covers the existing Spade index on the source images.
    *   Render the correct Rank/Suit in that patch using the exact same typography as the Number Cards.

3.  **Production Deployment**:
    *   Update `PlayingCard` component in `pages/hub/training/play/[gameId].js`.
    *   Remove all old "Grid" based layouts.
    *   Implement this new strict 2-variant system.
