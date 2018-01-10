var instantScore = 0;
var playerTotal1 = 0;
var playerTotal2 = 0;

document.querySelector('.fa-plus-circle').addEventListener('click', resetALL);
document.querySelector('.newgame').addEventListener('click', resetALL);

function resetALL() {
  document.querySelector(".total-score1").innerHTML = '0';
  document.querySelector(".total-score2").innerHTML = '0';
  document.querySelector(".score-1").innerHTML = '0';
  document.querySelector(".score-2").innerHTML = '0';
  document.querySelector('.inactivee').style.visibility = 'hidden';
  document.querySelector('.activee').style.visibility = 'visible';
  document.getElementById("dice").src = "";
  document.getElementById('ball').classList.add('ball');
  document.getElementById('ulala1').classList.remove('ulala');
  document.getElementById('ulala2').classList.remove('ulala');
  instantScore = 0;
  playerTotal1 = 0;
  playerTotal2 = 0;
}

document.querySelector('.fa-refresh').addEventListener('click', rollDice);
document.querySelector('.Roll-dice').addEventListener('click', rollDice);

function rollDice() {

  var ran = Math.floor(Math.random() * 6) + 1;
  instantScore += ran;

  if (ran === 1) {
      document.getElementById("dice").src = "../Image/Dice11.png";
    instantScore = 0;

    var elm = document.getElementById('ball');

    if (elm.className === 'ball') {
      //alert("Player 2's Turn!");
      //  document.querySelector('.activee').classList.add('lol');
      document.querySelector('.activee').style.visibility = 'hidden';
      document.querySelector('.inactivee').style.visibility = 'visible';
      document.getElementById('ball').classList.remove('ball');
      document.querySelector('.active').innerHTML = 0;
      return;
    } else {
      //alert("Player 1's Turn!");
      //document.querySelector('.activee').classList.remove('lol');
      document.querySelector('.activee').style.visibility = 'visible';
      document.querySelector('.inactivee').style.visibility = 'hidden';
      document.getElementById('ball').classList.add('ball');
      document.querySelector('.inactive').innerHTML = 0;
      return;
    }

  } else if (ran === 2) {
    document.getElementById("dice").src = "../Image/Dice2.jpg";
  } else if (ran === 3) {
    document.getElementById("dice").src = "../Image/Dice3.jpg";
  } else if (ran === 4) {
    document.getElementById("dice").src = "../Image/Dice4.jpg";
  } else if (ran === 5) {
    document.getElementById("dice").src = "../Image/Dice5.jpg";
  } else if (ran === 6) {
    document.getElementById("dice").src = "../Image/Dice6.jpg";
  }

  var elm = document.getElementById('ball');
  if (elm.className === 'ball') {
    document.querySelector(".active").innerHTML = instantScore;
  } else {
    document.querySelector(".inactive").innerHTML = instantScore;
  }

}

document.querySelector('.fa-upload').addEventListener('click', HoldOn);
document.querySelector('.hold').addEventListener('click', HoldOn);

function HoldOn() {

  document.getElementById("dice").src = "../Image/done1.jpg";
  var elm = document.getElementById('ball');
  if (elm.className === 'ball') {
    playerTotal1 += instantScore;
    if (playerTotal1 >= 100) {
      document.querySelector(".total-score1").innerHTML = "Won !!";
      document.getElementById('ulala1').classList.add('ulala');
      document.querySelector(".total-score2").innerHTML = 'Lost !!' ;
        document.getElementById('ulala2').classList.add('ulala');
      document.querySelector('.active').innerHTML = 0;

        //

        // document.getElementById('fa-refresh').classList.remove('fa-refresh');
        // document.getElementById('Roll-dice').classList.remove('Roll-dice');
        // document.getElementById('fa-upload').classList.remove('fa-upload');
        // document.getElementById('hold').classList.remove('hold');

      return;
    }
    document.querySelector(".total-score1").innerHTML = playerTotal1;
    instantScore = 0;
    document.querySelector('.activee').style.visibility = 'hidden';
    document.querySelector('.inactivee').style.visibility = 'visible';
    document.getElementById('ball').classList.remove('ball');
    document.querySelector('.active').innerHTML = 0;
    return;
  } else {
    playerTotal2 += instantScore;
    if (playerTotal2 >= 100) {
      document.querySelector(".total-score2").innerHTML = "Won !!";
      document.getElementById('ulala2').classList.add('ulala');
      document.querySelector(".total-score1").innerHTML = 'Lost !!' ;
        document.getElementById('ulala1').classList.add('ulala');
      document.querySelector('.inactive').innerHTML = 0;
      return;
    }
    document.querySelector(".total-score2").innerHTML = playerTotal2;
    instantScore = 0;
    document.querySelector('.activee').style.visibility = 'visible';
    document.querySelector('.inactivee').style.visibility = 'hidden';
    document.getElementById('ball').classList.add('ball');
    document.querySelector('.inactive').innerHTML = 0;
    return;
  }
}
