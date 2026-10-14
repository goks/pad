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

// The pad is the name at the end of the address. A new note puts it in the
// hash, /pad/#name; links handed out before that put it in the path,
// /pad/name, and still work. The hash never travels to a server, so the page
// itself answers 200 - a path that is not a real file is served by 404.html
// with a 404 status, which mail clients and link previews treat as broken.
//
// Firebase keys cannot contain . # [ ] $ / : a '#' or a bracket used to make
// every read and write throw, a path '/' silently created a nested node, and
// the old split('.') made /pad/notes.v2 and /pad/notes the same pad.
// A path that names a real file is not a pad: /pad/logo.png is the picture and
// /pad/index.html is this page. Those addresses are the app's own assets, and
// a note could never be read there.
var RESERVED = { 'index.html': 1, '404.html': 1, 'logo.png': 1, 'logo1.png': 1, 'logo2.png': 1, 'css': 1, 'js': 1, 'font': 1, 'fonts': 1, 'readme.md': 1, 'tools': 1, 'database.rules.json': 1 };

var hashParts = window.location.hash.slice(1).split(',');
var linkKey = hashParts[1] || '';          // set on a pad whose text is encrypted
var key = hashParts[0] || pathSlug();

function pathSlug() {
  var segments = window.location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  var last = segments.length > 1 ? segments[segments.length - 1] : '';
  return RESERVED[last.toLowerCase()] ? '' : last;
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
var linkHash = key + (linkKey ? ',' + linkKey : '');
if (window.location.hash.slice(1) !== linkHash) {
  history.replaceState(null, null, BASE + '#' + linkHash);
}

// A private pad carries a key in its link: /pad/#name,key. Everything written
// to the database is encrypted with it (AES-GCM), and the key travels in the
// hash, which the browser never sends anywhere - not in a request, not in a
// log. Whoever holds the link can read the note and nobody else can, including
// whoever runs the database. The database still shows that a pad with that
// name exists, how big it is and when it changed, and the client id in each op.
var CRYPTO_KEY = null;
var ready = linkKey ? loadKey(linkKey) : Promise.resolve();
var applyChain = ready;

function newKey() {
  return bytesToB64url(crypto.getRandomValues(new Uint8Array(32)));
}

function bytesToB64url(bytes) {
  var binary = '';
  for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(text) {
  var binary = window.atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function loadKey(encoded) {
  if (!(window.crypto && crypto.subtle)) {
    statusMessage = 'This browser cannot open an encrypted pad';
    renderStatus();
    return Promise.reject(new Error('no WebCrypto'));
  }
  return crypto.subtle.importKey('raw', b64urlToBytes(encoded), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']).then(function (imported) {
    CRYPTO_KEY = imported;
  }, function () {
    statusMessage = 'This link is missing part of its key';
    renderStatus();
  });
}

function sealOp(ops) {
  var iv = crypto.getRandomValues(new Uint8Array(12));
  return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, CRYPTO_KEY, new TextEncoder().encode(JSON.stringify(ops))).then(function (sealed) {
    var bytes = new Uint8Array(iv.length + sealed.byteLength);
    bytes.set(iv, 0);
    bytes.set(new Uint8Array(sealed), iv.length);
    return bytesToB64url(bytes);
  });
}

function openOp(encoded) {
  var bytes = b64urlToBytes(encoded);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, CRYPTO_KEY, bytes.slice(12)).then(function (plain) {
    return JSON.parse(new TextDecoder().decode(plain));
  });
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
  // A pad created before the op log holds one whole-document snapshot, and it
  // is the state the first op was written against, so load it first and old
  // links keep working. A pad with a key in its link has no such snapshot.
  var snapshot = CRYPTO_KEY ? Promise.resolve() : padRef.child('Content').once('value').then(function (loaded) {
    if (loaded.exists()) quill.setContents(loaded.val());
  });
  return snapshot.catch(function (err) {
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
  // Decrypting an op takes a tick, so ops queue: they have to reach the editor
  // in the order the server put them in, or the positions they carry mean
  // nothing.
  applyChain = applyChain.then(function () {
    flushSave();                           // send ours before the document moves under us
    if (!op.enc) {
      quill.updateContents(op.ops, 'api'); // updateContents carries the caret along
      return;
    }
    return openOp(op.enc).then(function (ops) {
      quill.updateContents(ops, 'api');
    });
  }).catch(function (err) {
    console.error('could not apply an op', err);
  });
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
  // Waiting for `ready` first means a keystroke made in the milliseconds before
  // the key finished loading is still encrypted with it.
  var op = { by: clientId, at: firebase.database.ServerValue.TIMESTAMP };
  ready.then(function () {
    return CRYPTO_KEY ? sealOp(delta.ops).then(function (sealed) { op.enc = sealed; }) : (op.ops = delta.ops);
  }).then(function () {
    // The server's clock goes into the op, so every client agrees on when the
    // document last changed no matter what its own clock says.
    return opsRef.push(op);
  }).then(function () {
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
  window.location.hash = newSlug();
}

// A pad whose key is in the link and nowhere else. Lose the link and the note
// is gone: there is nothing to recover it from.
function newPrivateNote() {
  window.location.hash = newSlug() + ',' + newKey();
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
  document.getElementById('newNote').onclick = newNote;
  document.getElementById('newPrivateNote').onclick = newPrivateNote;
  document.getElementById('copyLink').onclick = copyLink;
  // With a key in the link, nothing may be read or written before it is loaded.
  ready.then(function () {
    readMessage();
    getTextChange();
    watchPresence();
  }).catch(function (err) {
    console.error('pad not opened', err);
  });
}

document.addEventListener("DOMContentLoaded", doThese());

// A link to another note only changes the hash, and a hash change does not
// reload the page by itself: without this, following such a link, pasting one
// into the address bar, or pressing the new note button leaves the old pad on
// screen under the new address.
window.addEventListener('hashchange', function () {
  window.location.reload();
});

