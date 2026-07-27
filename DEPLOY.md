# Going live on stevesqueelkarn.com

The code is built, tested and pushed to
[github.com/dasqueel/stevesqueelkarn](https://github.com/dasqueel/stevesqueelkarn).
These last steps need your card and your login, so they're yours to do — about
ten minutes total.

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

The first build takes a minute or two and ends on a
`stevesqueelkarn.pages.dev` URL. Open it — you should see the countdown to
kickoff and all 132 picks.

---

## 3. Point the domain at it

1. In that Pages project → **Custom domains** → **Set up a custom domain**.
2. Enter `stevesqueelkarn.com` → **Activate domain**.
3. Repeat for `www.stevesqueelkarn.com` if you want it.

Cloudflare creates the DNS record itself. HTTPS is automatic. Propagation is
usually a minute or two, occasionally up to an hour.

---

---

## 4. Give the updater database access

The weekly job reads your MongoDB, so it needs the connection string as a repo
secret. Run this yourself so the value never passes through anything else:

```bash
gh secret set MONGO_URL --repo dasqueel/stevesqueelkarn --body "$battlesqueelMongoUrl"
```

Or paste it in the browser: repo → **Settings** → **Secrets and variables** →
**Actions** → **New repository secret**, named `MONGO_URL`.

> **Check your Atlas network access.** GitHub's runners don't have fixed IPs, so
> if your cluster restricts access by IP the job will fail to connect. Atlas →
> **Network Access** → allow `0.0.0.0/0`, or the job needs to run somewhere with
> a stable IP instead.

The secret is safe in a public repo: it's encrypted, and this workflow has no
`pull_request` trigger, so a fork's PR can never run with it in scope.

---

## That's it — it now runs itself

A GitHub Action re-reads your MongoDB every morning at 6am ET from August
through December. When results actually change it commits the new data, and that
push triggers a Cloudflare redeploy. Nobody has to touch anything all season.

Standings are only as fresh as the collection — whatever populates `cfbData26.games`
sets the pace. If that job runs weekly, the site updates weekly.

### If you ever want to force an update

Repo → **Actions** → **Update records** → **Run workflow**.

Or locally:

```bash
npm run data:records
git add public/data/records.json && git commit -m "Update records" && git push
```

### Costs

| | |
|---|---|
| Domain | ~$11/yr |
| Cloudflare Pages | Free |
| GitHub Actions | Free (public repo) |

---

## Fixing a wrong pick

If I mis-transcribed a line or a team, edit `scripts/draft.mjs`, then:

```bash
npm run data:teams     # re-resolves names to ESPN ids, fails loudly on ambiguity
npm run data:records   # re-pulls records
npm test
git add -A && git commit -m "Fix draft" && git push
```

Worth a once-over before the season: every line and side in `scripts/draft.mjs`
came from the text you sent, and a transcription slip there would quietly cost
someone a point in November.
