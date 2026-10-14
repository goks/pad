// Initialize Firebase
var config = {
  apiKey: "AIzaSyD0e1eXWMamdUXFCmifJqAUOq3pk63bLeA",
  authDomain: "web-pad-5213c.firebaseapp.com",
  databaseURL: "https://web-pad-5213c.firebaseio.com",
  storageBucket: "web-pad-5213c.appspot.com",
};
firebase.initializeApp(config);

var initialTrigger = true
var connectedRef = firebase.database().ref(".info/connected");
connectedRef.on("value", function (snap) {
  if (snap.val() === true) {
    // console.log("connection estalished");
    quill.enable(true);
    M.toast({ html: 'Connected' })
  } else {
    // console.log("connection disconnected");
    quill.enable(false);
    if(!initialTrigger) { M.toast({ html: 'Disconnected. Please check internet connection.' }) }
    initialTrigger = false;
  }
});

// The pad is the last path segment of the URL. Firebase keys cannot contain
// . # [ ] $ / : a '#' or a bracket used to make every read and write throw, a
// path '/' silently created a nested node, and the old split('.') made
// /pad/notes.v2 and /pad/notes the same pad. Normalise instead of guessing.
var key = "";
if (window.location.pathname.split('/').filter(Boolean).length > 1) {
  key = window.location.pathname.replace(/\/+$/, '').split('/').pop();
}
try {
  key = decodeURIComponent(key);
} catch (e) {
  key = "";
}
key = key.replace(/[.#\[\]$\/\s]/g, '-');
if (key == "")
key = newSlug();
console.log('key=' + key);

// A pad is its URL. A note that just got a name shows it in the address bar,
// ready to copy, and a name nobody can guess is what keeps a new note out of
// reach of someone trying the obvious ones.
function newSlug() {
  var random = (window.crypto && crypto.randomUUID) ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2, 10);
  return random.slice(0, 8);
}

// Where the app is served from, read off this script's own URL, so the same
// code works at goks.github.io/pad/ and at the root of a domain.
var BASE = document.currentScript ? document.currentScript.src.replace(/(js\/)?auth\.js.*$/, '') : window.location.pathname;
if (window.location.pathname.indexOf(key) === -1 && window.location.hash.slice(1) !== key) {
  history.replaceState(null, null, BASE + key);
}

// Get a reference to the database service
var database = firebase.database();
var padRef = database.ref(key);
var opsRef = padRef.child('ops');
var clientId = Math.random().toString(36).slice(2, 10);
var pendingDelta = null;
var saveTimer = null;
var SAVE_DELAY_MS = 500;

// A pad is the empty document with every op applied in order, so two people
// typing at once cost each other only what they both replaced, and nobody is
// re-sending the document they did not change.
// shortcut: ops are not transformed against each other, so simultaneous edits
// inside the same paragraph can land a few characters off; a CRDT (Yjs) is
// the upgrade when that matters.
function readMessage() {
  // A pad created before the op log holds one whole-document snapshot. It is
  // the state the first op was written against, so load it first and old
  // links keep working.
  return padRef.child('Content').once('value').then(function (snapshot) {
    if (snapshot.exists()) quill.setContents(snapshot.val());
  }).catch(function (err) {
    console.error('load failed', err);
  }).then(function () {
    // child_added fires for everything already there, in order, and then for
    // each new op, so one listener loads the pad and keeps it live.
    opsRef.on('child_added', applyOp, function (errorObject) {
      console.log('The read failed: ' + errorObject.code);
    });
    document.getElementById('spinner').style.visibility = 'hidden';
  });
}

function applyOp(child) {
  var op = child.val();
  if (!op) return;
  if (op.at) lastEdited = op.at;
  if (op.by === clientId) {                // our own op, already applied as it was typed
    renderStatus();
    return;
  }
  flushSave();                             // send ours before the document moves under us
  quill.updateContents(op.ops, 'api');     // updateContents carries the caret along
  statusMessage = '';
  renderStatus();
}

function flushSave() {
  clearTimeout(saveTimer);
  if (!pendingDelta) return;
  var delta = pendingDelta;
  pendingDelta = null;
  statusMessage = 'Saving ...';
  renderStatus();
  // The server's clock goes into the op, so every client agrees on when the
  // document last changed no matter what its own clock says.
  opsRef.push({ ops: delta.ops, by: clientId, at: firebase.database.ServerValue.TIMESTAMP }).then(function () {
    statusMessage = 'Saved';
    renderStatus();
  }).catch(function (err) {
    // Firebase rejects a write over 1 MB and the free tier stops at its quota;
    // without this the note keeps taking edits and quietly stops saving.
    console.error('save failed', err);
    statusMessage = 'Not saved - check your connection';
    M.toast({ html: statusMessage });
    renderStatus();
  });
}

var statusMessage = '';
var lastEdited = null;
var here = 1;

function renderStatus() {
  var parts = [];
  if (statusMessage) parts.push(statusMessage);
  if (lastEdited) parts.push('edited ' + new Date(lastEdited).toLocaleTimeString());
  if (here > 1) parts.push(here + ' people here');
  document.getElementById('padStatus').textContent = parts.join(' · ') || 'Saved as you type.';
}

// Who else is in this pad. onDisconnect() is the point: a tab that closes, or
// loses its network, drops its own flag without anyone having to clean up.
function watchPresence() {
  var myPresence = padRef.child('presence').child(clientId);
  database.ref('.info/connected').on('value', function (snap) {
    if (snap.val() !== true) return;
    myPresence.onDisconnect().remove();
    myPresence.set(true);
  });
  padRef.child('presence').on('value', function (snap) {
    here = snap.numChildren();
    renderStatus();
  });
}

function getTextChange() {
  return quill.on('text-change', function (delta, oldDelta, source) {
    if (source !== 'user') return;   // the initial load, or somebody else's op
    // Consecutive local edits compose into one op, so a burst of typing is a
    // single small push rather than a write of the whole document.
    pendingDelta = pendingDelta ? pendingDelta.compose(delta) : delta;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, SAVE_DELAY_MS);
  });
}

function newNote() {
  window.location.href = BASE + newSlug();
}

function copyLink() {
  var url = window.location.href;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function () {
      M.toast({ html: 'Link copied' });
    }, function () {
      window.prompt('Copy this link', url);
    });
  } else {
    window.prompt('Copy this link', url);
  }
}

function doThese() {
  renderStatus();
  readMessage();
  getTextChange();
  watchPresence();
  document.getElementById('newNote').onclick = newNote;
  document.getElementById('copyLink').onclick = copyLink;
}

document.addEventListener("DOMContentLoaded", doThese());

