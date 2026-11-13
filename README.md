# RSI + Pivot + EMA Backtest Filter

A **standalone, unit-tested** signal confirmation module for the user's Vercel Stock Scanner. This repository does **not** yet contain the full source of the deployed Vite application; do not deploy it as a replacement for the production app.

## Rules

- RSI14 > 50, RSI14 above its 14-value SMA, recent bullish crossover (default 3 signal candles).
- Close above POC and at/above the historically determined 2/8 BUY level.
- Close > EMA9 > EMA21; both EMAs rising.
- Volume above the previous 20 completed daily candles' average.
- All checks must pass for `BUY`; otherwise `WAIT` or `AVOID`.

This module uses completed candles up through signal bar `index` only. An execution must occur **no earlier than the next bar**, and the pivots must be computed from the previous completed reference period to prevent look-ahead bias.

## Verify

```sh
node --test backtest/confirmedBuyFilter.test.mjs
```

## Integrate in the existing app

Copy `backtest/confirmedBuyFilter.mjs` into the application's server-side backtest library, import it into the execution path, call it with `{bars,index,pivot:{poc,buy}}`, and exclude setups unless `buy === true`. Preserve all current pivot calculations, entry/exit logic, slippage, transaction costs, and other app features. Integrate filter toggles on the existing backtest UI only after recovering the complete project source.

**Status:** GitHub module committed and synthetic unit tests pass. Not yet integrated into the Vercel production app.