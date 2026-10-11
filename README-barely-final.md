# barely. — Broke But Functional

**Make a ₹10,000 budget last 30 days.** barely. is a local-first budgeting and financial-decision dashboard designed to help a user understand available cash, recorded spending, unpaid commitments, protected savings, daily spending allowance, and an indicative month-end outlook.

- **Live app:** https://barely-broke-but.hatchable.site/
- **Browser regression harness:** https://barely-broke-but.hatchable.site/hardening-tests.html
- **Source repository:** https://github.com/Mohamedmusthakeem/barely-broke-but-functional
- **Architecture:** React + React DOM + HTM with plain JavaScript; hosted by Hatchable without a project-specific build step.

## Features

- **Overview:** Current cash balance, starting budget, recorded spending, safe daily allowance, planning days remaining, estimated month-end position, recent transactions, category spending and upcoming commitments.
- **Transactions:** Add, edit, delete, search, filter by transaction type/category/date, sort by date or amount, paginate, use Quick Add, and export CSV.
- **Decision Lab:** Preview expense, income, savings-allocation and bill-adjustment scenarios using the shared financial engine. Applying a scenario asks for confirmation; cancelling a scenario does not modify saved records.
- **Budget Planner:** Adjust the starting budget, planning duration and start date, and restore the challenge assumptions.
- **Bills & Subscriptions:** Track due dates, essentials, recurring commitments, payment state, pause/resume and cancellation actions. A recorded payment creates a linked expense; reversing payment restores the prior recurring due date and reverses the linked expense.
- **Savings Goals:** Create/edit/delete goals, contribute and withdraw allocations, and prevent withdrawal beyond the saved amount. Goal allocations are not treated as consumption expenses.
- **Financial Health:** Rule-based indicators calculated from the user's entered records; the score is a heuristic, not a validated financial or predictive model.
- **Money Coach:** Rule-based suggestions grounded in recorded transactions, bills and current calculations. It is not an external AI integration and does not know about unrecorded purchases.
- **Settings:** English, Tamil, Hindi, Telugu, Malayalam and Bengali interface labels; system/light/dark appearance; CSV export and a confirmed reset action.

## Calculation model

The financial engine in `public/finance-engine.js` is the shared calculation source for the dashboard and Decision Lab.

- Starting budget plus posted income minus posted expenses gives the recorded cash balance.
- Future/pending outflows and unpaid commitments are reserved for spendability/forecast calculations; they are not posted cash expenses.
- Savings goals represent protected allocations, not consumption spending. Contributions reallocate available funds and do not create income.
- Active recurring bills inform monthly commitment estimates. Paying a bill records a linked expense once for that cycle; marking it unpaid reverses that linked transaction.
- Safe daily spending is based on spendable funds over the remaining planning days. Month-end projections are estimates based on recorded history, remaining days and commitments; sparse or incomplete history makes them less reliable.
- Monetary inputs are rounded to two decimal places; displayed rupee values are formatted for readability. The regression harness exercises paise summation and known balance invariants.

These calculations are a budgeting aid, not financial advice or a guarantee about future cash flow.

## Architecture and storage

- `public/index.html` loads the vendored React, React DOM, HTM and Lucide scripts first, then `finance-engine.js`, `storage-layer.js`, the optional Binary Orbits hero effect and `app.js`.
- `public/app.js` owns page/navigation state and user interactions.
- `public/finance-engine.js` validates state and calculates financial metrics.
- `public/storage-layer.js` uses IndexedDB for transaction records, indexed by date, type and category; small preferences and metadata remain in localStorage.
- `public/style.css` contains the active design system and responsive styling. `public/theme.css` is present in the project but is not loaded by the current `index.html`.
- The app is local-first. It does not connect to a bank and does not upload financial records to a project API. Browser-local data is device/browser-specific.

The initial migration keeps the `barely-state-v1` snapshot while importing and verifying records. Clearing site data can remove local financial history. The app does not currently encrypt records at rest; use a trusted device and avoid storing sensitive notes on shared devices.

## Run / deploy

1. Open the live app above; the deployed application starts directly at the dashboard.
2. To run your own copy, import this repository/folder into Hatchable and deploy it there. Keep the `public/` structure and `public/vendor/` files intact.
3. For local static testing, serve the contents of `public/` as the web root over HTTP. Do not open `index.html` as a `file://` URL because IndexedDB and browser storage behavior can vary in file contexts.
4. Run the browser regression suite by opening `https://barely-broke-but.hatchable.site/hardening-tests.html` and pressing **Run isolated tests**. It generates synthetic data in memory and does not write those generated records into the app's saved transaction history.

## Verification record

Last verified against the live Hatchable deployment, **Version 27**:

- Deployment dry-run: **0 errors, 0 warnings**.
- Isolated financial/scale harness: **25 assertions passed, 0 failed**.
- Anonymous browser smoke test: dashboard mounted; all nine section labels present; required scripts/styles returned without observed HTTP failures; no console errors or unhandled page errors in the exercised flows.
- Browser-tested journeys: transaction create/edit/delete and refresh persistence; bill create/pay/unpay and recurring due-date restoration; savings goal creation, contribution and over-withdrawal rejection; Decision Lab cancellation and confirmed application; search/type/date filters; CSV export with commas/quotes; language/theme persistence; Escape-to-close dialog.
- CSV security: cells beginning with `=`, `+`, `-` or `@` are prefixed as text, in addition to quote escaping. The isolated harness checks formula-prefix handling and ordinary special-character escaping.
- Synthetic in-memory 100,000-record benchmark (one browser run): validation 197.0 ms; calculation 177.9 ms; substring search 17.3 ms; sort-and-take-50 47.1 ms; CSV string/chunk construction 347.7 ms. These are indicative one-run measurements, not guaranteed limits or full UI/IndexedDB throughput measurements.

## Known limitations

- The 100,000-record measurements use disposable in-memory synthetic data. Full end-to-end UI performance, persistence, and export at 100,000 saved transactions have not been completely verified across browsers/devices.
- Every possible visible control and every edge case has not undergone exhaustive end-to-end testing. Responsive layouts at every requested viewport size and formal screen-reader testing remain to be completed.
- Browser-local records are not cloud-synced and are not encrypted at rest.
- The precise cause of the earlier external FAIE/FQE score cannot be proven without the evaluator's detailed trace/logs. The live app mounts and works in an anonymous browser. Before the final Version 27 repair, `public/index.html` and `public/app.js` on `main` matched the deployed Version 26; Version 27 contains additional CSV formula-injection protection and save-error handling, so GitHub `main` is now behind the live deployment.
- This README is a prepared replacement for the existing repository README. The connected GitHub identity has read-only (`pull: true`, `push: false`) permission, so neither this README nor the Version 27 delta could be committed to `main` from the available connection. To sync GitHub, connect an account with repository write access and commit the latest Hatchable `public/app.js` plus this README.
- FAIE scores and leaderboard placement are not guaranteed.
