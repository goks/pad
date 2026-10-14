# Web-Pad
Online text sharing utility

### Usage
Visit goks.github.io/pad/ for a new note with a name nobody can guess, or
goks.github.io/pad/<any name you choose> to open the note with that name.
Everyone who opens the same address edits the same note, live.

###### Implemented using [Firebase](https://firebase.google.com/)

Click [HERE](https://goks.github.io/pad/) for a new note. The link button in
the page copies the address of the note you are looking at.

## Security

The database is public by design: anyone holding a link can read and write that
note, and no one has to log in. What the rules in `database.rules.json` do is
stop the cheap destructive cases:

- no writes at the database root, so nobody can wipe or restructure everything
  in a single request
- a pad node may not be emptied, so a pad cannot be deleted through the API
- everything else under a pad key stays writable, as the app needs

Deploy them from the Firebase console (Realtime Database -> Rules -> paste ->
Publish) or with `firebase deploy --only database`.

Two things still to do by hand, both in the Google Cloud / Firebase console:

1. Restrict the API key to the Firebase APIs and to the referrer
   `goks.github.io/*` (APIs & Services -> Credentials).
2. Turn on App Check for Realtime Database. The page still loads the 2016
   `firebase-app.js` / `firebase-database.js` build, which cannot send an App
   Check token, so this needs the SDK upgraded first:
   `firebase-app-compat.js` + `firebase-database-compat.js` v9 or newer.

Until then, treat every pad as world readable and world writable.

`tools/backup-pad.sh` dumps the whole database to `$PAD_BACKUP_DIR` once a day
and keeps 30 days. Cron example:

    17 3 * * * PAD_BACKUP_DIR=/srv/pad-backups /path/to/tools/backup-pad.sh

### Private notes

The lock button makes a note whose key lives in the link and nowhere else:
`goks.github.io/pad/#name,key`. The text is encrypted in your browser before
it is written (AES-GCM) and the key is never sent to a server - everything
after the `#` stays in the browser. Only someone holding the link can read
the note.

Two things to know. Lose the link and the note is gone: nothing can recover
it. And the database still shows that a pad with that name exists, how large
it is, when it changed, and which client wrote each part of it.
