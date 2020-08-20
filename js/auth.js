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

var key = window.location.href;
key = key.split('/');
key = key[key.length - 1];
key = key.split('.');
key = key[0];
if (key == "")
key = "default";
console.log('key=' + key);

var richTextContent = document.getElementById('#textAreaContainer')
var checkbox = document.getElementById("autoParent");
checkbox.checked = true;
// Get a reference to the database service
var database = firebase.database();
// var currentDelta = null;
var currentContents = null;

function sendMessage(content) {
  // console.log('writeMsg')
  // console.log(content)
  database.ref(key).set({
    Content: content,
    // Delta: delta
  });
  // readMessage()
}

function readMessage() {
  return database.ref(key).on('value', function (content) {
    document.getElementById('spinner').style.visibility = 'visible'
    if(!content.val()){
      console.log('first user')
      document.getElementById('spinner').style.visibility = 'hidden'
      return
    }
    content = content.val().Content
    if (!currentContents) {
      console.log("received promise -- readmsg  -- SET");
      currentDelta = quill.setContents(content)
      document.getElementById('spinner').style.visibility = 'hidden'
      return
    }
    if (content && JSON.stringify(content) != JSON.stringify(quill.getContents())) {
      console.log("received promise -- readmsg -- UPDATE");
      currentContents = content
      // console.log('SAVED', currentContents)
      quill.setContents(content)
      document.getElementById('spinner').style.visibility = 'hidden'
      return
    }
    document.getElementById('spinner').style.visibility = 'hidden'
    console.log("received promise -- readmsg  -- SKIP");
  }, function (errorObject) {
    console.log("The read failed: " + errorObject.code);
  }
  );
}

function checkcheck() {
  if (checkbox.checked) {
    checkbox.checked = false;
    return database.ref(key).on('value', function (content) {
      console.log("auto update set");
      if (content.val().Content) {
        // textContent.value = content.val().Content;
        // richTextContent.value = content.val().Content;
      }
    });
  }
  else {
    checkbox.checked = true;
    console.log("auto update unset");
    return database.ref(key).off();
  }
}

function saveData(content) {
  if (!currentContents) {
    currentContents = content
    console.log('SKIP WRITE! 1')
    return
  }
  if (JSON.stringify(currentContents) === JSON.stringify(content)) {
    console.log('SKIP WRITE! 2')
    return
  }
  // console.log('writing', JSON.stringify(currentContents), JSON.stringify(content))
  // currentDelta = delta;
  currentContents = content
  // console.log("SIZE: ",quill.getLength());
  sendMessage(content);
}

function getTextChange() {
  return quill.on('text-change', function (delta, oldDelta, source) {
    if (source == 'api') {
      // console.log("An API call triggered.", oldDelta, delta, source);
      // quill.setSelection(position);
      contents = quill.getContents();
      saveData(contents);
    } else if (source == 'user') {
      // console.log("A user action triggered.", oldDelta, delta, source);
      contents = quill.getContents();
      saveData(contents);
    }
  });
}

//checkbox.addEventListener('change',checkcheck());
// checkbox.onclick = checkAuto();

function doThese() {
  readMessage();
  getTextChange();
}

document.addEventListener("DOMContentLoaded", doThese());

