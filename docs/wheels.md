# Wheels & prizes

Edit wheels in the dock (**Wheels** tab) or in `data/config.json` while the server is stopped.

## Slice effects

| Field          | Meaning                                                                   |
| -------------- | ------------------------------------------------------------------------- |
| `cash`         | Added to the running total.                                               |
| `multiplier`   | Applied after adding `cash`: `2` doubles the total, `0.5` loses half.     |
| `extraSpins`   | Bonus spins on the same wheel.                                            |
| `bust`         | Bankrupt: the total drops to zero and the game ends.                      |
| `chainWheelId` | Continue on another wheel (its default spin count), keeping the total.    |
| `weight`       | Relative odds. With `sizing: "weight"` the slice size matches the odds.   |
| `stock`        | Remaining quantity (`null` = unlimited). Sold-out prizes leave the wheel. |
| `tier`         | `common`, `rare`, `epic`, `legendary`, `jackpot`: colour and celebration. |

Money slices print their amount on the wheel automatically (`$10`, `×2 TOTAL`, `+1 FREE SPIN`), computed
from these fields so the display always matches the payout.
