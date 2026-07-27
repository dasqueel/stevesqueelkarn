# Going live on stevesqueelkarn.com

The code is built, tested and pushed to
[github.com/dasqueel/stevesqueelkarn](https://github.com/dasqueel/stevesqueelkarn).
Everything below needs your card or your login, so it's yours to do — about
fifteen minutes end to end.

`stevesqueelkarn.com` was unregistered as of this writing.

---

## 1. Buy the domain (~$11/yr)

1. Sign in or sign up at **[dash.cloudflare.com](https://dash.cloudflare.com)**.
2. Left sidebar → **Domain Registration** → **Register Domain**.
3. Search `stevesqueelkarn` and buy the `.com`.

Cloudflare sells at wholesale with no markup and no renewal price hikes, and
because the domain lives in the same account as the site, DNS wires itself up in
step 3 with no records to copy by hand.

> Leave **auto-renew on**. A lapsed domain mid-season is a bad day.

---

## 2. Connect the site

1. Left sidebar → **Workers & Pages** → **Create** → **Pages** tab →
   **Connect to Git**.
2. Authorize GitHub, then pick **`dasqueel/stevesqueelkarn`**.
3. Set the build config exactly:

   | Field | Value |
   |---|---|
   | Framework preset | `Vite` |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Production branch | `main` |

4. **Save and Deploy.**

The first build takes a minute or two and ends on a `stevesqueelkarn.pages.dev`
URL. Open it — you should see the countdown to kickoff and all 132 picks.

> Cloudflare needs **no database credentials**. It only bundles the app and
> copies the already-committed `records.json`. It never opens a connection.

---

## 3. Point the domain at it

1. In that Pages project → **Custom domains** → **Set up a custom domain**.
2. Enter `stevesqueelkarn.com` → **Activate domain**.
3. Repeat for `www.stevesqueelkarn.com` if you want it.

Cloudflare creates the DNS record itself. HTTPS is automatic. Propagation is
usually a minute or two, occasionally up to an hour.

At this point the site is live — it just won't update itself yet.

---

## 4. Give the updater database access

The daily job reads your MongoDB, so it needs the connection string as a repo
secret. Run this yourself so the value never passes through anything else:

```bash
gh secret set MONGO_URL --repo dasqueel/stevesqueelkarn --body "$battlesqueelMongoUrl"
```

Or paste it in the browser: repo → **Settings** → **Secrets and variables** →
**Actions** → **New repository secret**, named `MONGO_URL`.

The secret is safe in a public repo: it's encrypted, and this workflow has no
`pull_request` trigger, so a fork's PR can never run with it in scope.

---

## 5. Let GitHub's runners reach Atlas

**This is the step most likely to fail.** GitHub's runners don't have fixed IPs,
so if your cluster restricts access by IP the job can't connect.

Atlas → **Network Access** → allow `0.0.0.0/0`.

If you'd rather not open the cluster that wide, skip the automation entirely and
update by hand — see *Manual mode* below. The site behaves identically.

---

## 6. Prove it works

Repo → **Actions** → **Update records** → **Run workflow**.

It should go green in about a minute. Expect `no change in records` — the data
is already current, and the job deliberately does nothing when nothing moved.
A red run here means step 4 or 5 isn't right.

---

## After that, it runs itself

Every morning at 6am ET, August through December:

```
MongoDB ──► GitHub Action ──► commit records.json ──► Cloudflare ──► live site
```

If results changed, it commits and the site redeploys within a couple of
minutes. If nothing changed, it stops silently. No empty commits, no wasted
builds, nothing for you to do.

**Standings are only as fresh as the collection.** Whatever populates
`cfbData26.games` sets the real pace — if that loader runs weekly, the site
updates weekly no matter how often this job checks.

### Things that need no attention

- **Conference championships** get stripped automatically when your pipeline
  adds them in December — they're matched by their `notes` headline.
- **Bowls and the playoff** are never read; the query asks only for
  `seasonType: "regular"`.
- **The 8 teams with 11 scheduled games** resolve themselves once their
  non-conference slates are announced. Until then their picks are held pending
  rather than clinching early.
- **Season's end** needs no switch. Once every game is played, all 132 picks
  resolve and the board shows final standings.

---

## Manual mode

If you skip steps 4–6, or Atlas access is a problem, update from your machine:

```bash
npm run data:records
git add public/data/records.json && git commit -m "Week 5" && git push
```

Cloudflare redeploys on the push. About fifteen seconds, no secret anywhere.

---

## Costs

| | |
|---|---|
| Domain | ~$11/yr |
| Cloudflare Pages | Free |
| GitHub Actions | Free (public repo) |

---

## Fixing a wrong pick

`scripts/draft.mjs` is the source of truth. Edit it, then:

```bash
npm run data:teams     # re-resolve names to team ids; fails loudly on ambiguity
npm run data:records   # rebuild records
npm test
git add -A && git commit -m "Fix draft" && git push
```

Worth a once-over before kickoff: every line and side in `scripts/draft.mjs`
came from the text you sent, and a transcription slip there would quietly cost
someone a point in November.

---

## Next season (2027)

Three things will need a hand — none of them mid-season:

1. **The collection is hardcoded to `cfbData26`.** Point the job at next year's
   data with a repo variable `CFB_DB`, or change the default in
   `scripts/fetch-records.mjs`.
2. **Re-draft.** Replace the picks in `scripts/draft.mjs` and run
   `npm run data:teams`.
3. **Re-enable the schedule.** GitHub disables cron workflows after 60 days of
   repository inactivity. With no commits between January and August, the
   schedule will be off by the time next season starts — GitHub emails you, and
   one click in the Actions tab turns it back on.
