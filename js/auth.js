
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
  if(key=="")
      key="default";
  console.log('key='+key);

  var textContent = document.getElementById("textValue");
  var checkbox = document.getElementById("autoParent");
  checkbox.checked = true;
  // Get a reference to the database service
  var database = firebase.database();

  function sendMessage(content) {
    database.ref(key).set({
        Content: content
    });
    readMessage()
  }
  
  function readMessage() {
      return firebase.database().ref(key).on('value', function(content) {
      console.log("received promise -- readmsg");
      // console.log(content.val().Content);
      if(content.val().Content)
      {
        textContent.value = content.val().Content;
      }
      else
        console.log("First user");
    }, function (errorObject) {
      console.log("The read failed: " + errorObject.code);    
      }
    );
  }  

  function checkcheck(){
    if(checkbox.checked)
     {
     checkbox.checked=false;
     return database.ref(key).on('value',function(content) {
      console.log("auto update set");
        if(content.val().Content)
        {
          textContent.value = content.val().Content;
        }
      });
     }
    else
    {
      checkbox.checked=true;
      console.log("auto update unset");
      return database.ref(key).off();
    }
  }

  function saveText(content){
    sendMessage(content);
  }

   //checkbox.addEventListener('change',checkcheck());
  // checkbox.onclick = checkAuto();

  document.addEventListener("DOMContentLoaded",readMessage());
  
