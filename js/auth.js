//



  // Initialize Firebase
  var config = {
    apiKey: "AIzaSyD0e1eXWMamdUXFCmifJqAUOq3pk63bLeA",
    authDomain: "web-pad-5213c.firebaseapp.com",
    databaseURL: "https://web-pad-5213c.firebaseio.com",
    storageBucket: "web-pad-5213c.appspot.com",
  };
  firebase.initializeApp(config);

  var key = window.location.href;
  key = key.split('/');
  key=key[key.length-1];
  key = key.split('.');
  key = key[0];
  var textContent = document.getElementById("textValue");

  // Get a reference to the database service
  var database = firebase.database();

  function sendMessage(content) {
    firebase.database().ref(key).set({
        Content: content
    });
  }
  
  function readMessage() {
    return firebase.database().ref(key).once('value').then(function(content) {
      if(content)
      {
        //alert(content.val());
        textContent.innerHTML = content.val().Content;
      }
    });
  }

  function saveText(content){
    sendMessage(content);
  }
  document.addEventListener('load',readMessage());
  

