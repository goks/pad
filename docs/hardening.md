# Hardening this pad

Three jobs, in the order they should be done. Each step says what to do and why
it is that step and not another one. Nothing here needs the Firebase CLI; it is
all console clicks, `curl` and one cron script.

Do them in this order. Step 4 breaks the app if it is done before step 4.3, and
step 5 is only needed once pads get long.

---

## 3. Restrict the API key

**Why at all:** the key in `js/auth.js` is public, and it always will be - a
browser app cannot keep a secret. What it can do is stop *other websites* from
borrowing this Firebase project's quota and its database.

### 3.1 Find the key

console.cloud.google.com -> project **web-pad-5213c** -> **APIs & Services** ->
**Credentials**. The browser key is the one starting `AIza` that matches the
`apiKey` in `js/auth.js`. (Firebase projects are GCP projects; the same key
appears in both consoles.)

*Reason:* there may be several keys on the project. Restricting the wrong one
does nothing, and the value must match the file or you have edited a stranger's
key.

### 3.2 Restrict where it may be used from

**Application restrictions** -> *HTTP referrers (web sites)* -> add:

    https://goks.github.io/*
    http://localhost:*        (only if you test the page locally)

*Reason:* this is enforced by the browser, which sends the `Referer` header. It
is the only restriction an anonymous app can carry that does not break it.

### 3.3 Restrict what it may be used for

**API restrictions** -> *Restrict key* -> tick **Firebase Realtime Database API**.

*Reason:* the key should not be usable against other Google APIs on this project
if it leaks. The 2016 SDK reaches the database without any key at all, so this
line cannot break reading or writing.

### 3.4 Test it

Load https://goks.github.io/pad/, type one character, and check the op arrives
(Firebase console -> Realtime Database -> the pad -> `ops`). Reload the page and
confirm the text is still there.

*Reason:* a bad restriction fails silently in the app - the toast says "Not
saved" and the note keeps taking typing. Two minutes of testing now is the
difference between a restricted key and an offline pad.

### What this does not do

`curl -H 'Referer: https://goks.github.io/'` walks straight past a referrer rule.
This stops other sites and casual scraping; it does not stop a person. That is
step 4.

---

## 4. App Check (do not skip 4.3 before 4.5)

**Why:** rules cannot help - with no login in the app, the rules *must* allow
anonymous write, so anyone with `curl` can write to any pad. App Check is the
only control that says "this write came from a real browser on my site". Until
it is enforced, the database is as open as it was in 2016.

**The order matters:** the page still loads the 2016 `firebase-app.js`, which
cannot send an App Check token. Switching enforcement on first makes every read
and write fail for every user. Upgrade the client (4.3), watch it work (4.4),
then enforce (4.5).

### 4.1 Get a reCAPTCHA v3 site key

google.com/recaptcha/admin/create -> type **v3** -> domains `goks.github.io` and
`localhost` -> copy the **site key** (public) and note the **secret** stays with
Google/Firebase.

*Reason:* App Check on the web has no built-in attestation - reCAPTCHA v3 is the
provider. The domain list is what decides which sites may mint tokens for this
key.

### 4.2 Register the app in App Check

Firebase console -> **App Check** -> *Register app* -> Web -> reCAPTCHA v3 ->
paste the site key.

*Reason:* this binds the provider to the app so the Realtime Database can be set
to enforce *this* app's tokens and nothing else.

### 4.3 Upgrade the client to the modular SDK, with App Check initialised

The 2016 build cannot do this. `index.html`'s tags become one module script:

```html
<script type="module">
  import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
  import { getDatabase, ref, child, push, onChildAdded, onDisconnect,
           serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';
  import { initializeAppCheck, ReCaptchaV3Provider }
    from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app-check.js';

  const app = initializeApp(config);
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('YOUR_SITE_KEY'),
    isTokenAutoRefreshEnabled: true
  });
  const db = getDatabase(app);
</script>
```

and `js/auth.js` becomes a module too (`<script type="module" src="js/auth.js">`)
- a module cannot use another module's imports, so the whole file moves or none
of it does. The call-by-call mapping:

| 2016 build | modular SDK |
|---|---|
| `firebase.database()` | `getDatabase(app)` |
| `database.ref(key)` | `ref(db, key)` |
| `padRef.child('ops')` | `child(padRef, 'ops')` |
| `ref.on('child_added', cb)` | `onChildAdded(ref, cb)` |
| `opsRef.push(op)` | `push(opsRef, op)` |
| `firebase.database.ServerValue.TIMESTAMP` | `serverTimestamp()` |
| `presenceRef.onDisconnect().remove()` | `onDisconnect(presenceRef).remove()` |
| `snap.exists()` / `.val()` / `.numChildren()` | unchanged |

*Reason:* the modern build is the only one that can attach an App Check token,
and it is the only one that still gets security fixes. Cost: first load goes
from 48 KB to 80 KB gzipped (app 23 + database 49 + app-check 8) plus
reCAPTCHA's own scripts, cached afterwards.

*Testing locally:* the module refuses to run its check on plain http unless the
page is on `localhost`. Register a debug token (App Check -> the app -> *Manage
debug tokens*) and set `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` before init,
or your local edits will be rejected.

### 4.4 Watch it work, do not enforce yet

Load the site, type, and open the browser console. Then Firebase console ->
App Check -> the Realtime Database -> the request graph should show *verified*
requests, and **denied** should stay at zero.

*Reason:* this is the last moment where a mistake is a console message instead of
an outage.

### 4.5 Enforce

App Check -> Realtime Database -> **Enforce**. Keep the graph open for a day.

*Reason:* enforcement is the switch that actually blocks unverified clients.
Flowing traffic plus zero denials is the signal that it is safe; anything else,
switch it back off and read 4.3 again.

### What this does not do

It does not make notes private from someone who has (or guesses) a pad's name in
a real browser - reads stay open by design. That is what the lock button is for:
an encrypted pad's content is unreadable without the key in the link.

---

## 5. Compact the op log

**Why:** every pause in typing appends one op, forever. A pad open for years
downloads its whole history on every visit - the Realtime Database bills
downloaded bytes, and the page replays each op to rebuild the text. Folding the
log back into a single delta keeps pads opening instantly.

**Safety rule:** only touch a pad nobody is using. That is what makes the write
safe: a live client that already applied ops 1-5 would apply a composing op a
second time and double its text.

### 5.1 The script (run from cron, once a night)

Roughly this - `npm i quill-delta`, and the database is readable with plain
`curl`, so no service account is needed:

1. `curl "$DB/.json?shallow=true"` -> the pad names.
   *Reason:* there is no listing API in the app; `shallow` returns names without
   reading every note.
2. For each pad, read `/Content` and `/ops`; **skip the pad if the newest `at` is
   under two hours old, or if there are fewer than ~50 ops.**
   *Reason:* idle and long are exactly the pads where compaction is safe and
   worth the request. A pad with 12 ops costs nothing to replay.
3. Compose: start from `Content` (the old-format snapshot, if the pad has one),
   then each op in push-id order, with `quill-delta`'s `compose()`.
   *Reason:* composing deltas by hand is the part that goes wrong quietly -
   positions shift as text is inserted. The library the app already uses does it
   correctly.
4. Write the result to `/Content`, then delete `/ops`.
   *Reason:* `/Content` is the format the app already loads as the base state
   before replaying ops, so a compacted pad needs no client change at all. One
   writer order is enough here only because the pad is idle.
5. Optionally record `meta.updated` (the newest `at` you deleted) and teach the
   page to read it, so "edited 19:41" survives the compaction. Three lines in
   `readMessage()`.

### 5.2 Watch it work

Run it against one pad first (`--only <name>`), then open that pad in the
browser: the text must be identical and `ops` must be empty or tiny.

*Reason:* the failure mode is doubled or reordered text, which only shows when a
real client replays the log.

### What this does not do

It does not change the size of an encrypted pad's ops in any useful way beyond
the count (each op is its own ciphertext), and it cannot merge two writers'
work - that is the CRDT problem, still open by design
(`shortcut:` in `js/auth.js`).
