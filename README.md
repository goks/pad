# Web-Pad
Online text sharing utility

### Usage
Visit goks.github.io/pad/< any extension > to create your online note.

###### Implemented using [Firebase](https://firebase.google.com/)

Click [HERE](http://goks.github.io/pad/new).

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
