/*
    Zombie dice, with multiplayer using sockets
*/


const socket = io('http://192.168.1.111:3000', { 
                transports: ['websocket', 'polling'], // Try enforcing WebSocket
                reconnectionAttempts: 3, // Limit reconnection attempts
                timeout: 10000, // Set a reasonable timeout 
            });
let lobbyCode = '';
let isHost = false;
let currentPlayerId = '';
let currentLobbyCode = null; // ✅ Define globally
let turnTimer = null; // Timer reference
const TURN_TIME_LIMIT = 30000; // 30 seconds per turn
let gameEnded = false;
let diceRollCnt = 0;    // rolls of the dice, per turn
let isMuted = false; // ✅ Track mute state

// EVENTS //

    // **Handle Turn End Button Click**
    document.getElementById('end-turn-btn').addEventListener('click', () => {
        console.log("Player ended their turn manually.");
        if (gameEnded) {
            console.warn("🚫 The game is already over! No more turns.");
            return;
        }
        switchToNextPlayer(true);
    });

    let playerName = document.getElementById("player-name-input").value.trim();
    const lobbySection = document.getElementById("lobby-section");
    document.getElementById("player-name-input").addEventListener("input", function() {
        playerName = this.value.trim();

        if (playerName.length > 1) {
            lobbySection.style.display = "grid"; // ✅ Show lobby if name is valid
        } else {
            lobbySection.style.display = "none"; // ✅ Hide lobby if name is too short
         }
    });
    if (playerName.length > 1) {
        lobbySection.style.display = "grid"; // ✅ Show lobby if name is valid
    } else {
        lobbySection.style.display = "none"; // ✅ Hide lobby if name is too short
    }


    document.getElementById("lobby-code-input").addEventListener("input", function() {
        const lobbyName = this.value.trim();
        const joinLobby = document.getElementById("join-lobby-btn");
        const createLobby = document.getElementById("create-lobby-btn");

        if (lobbyName.length > 4) {
            joinLobby.style.display = "block"; // ✅ Show lobby if name is valid
            createLobby.style.display = "none";
        } else {
            joinLobby.style.display = "none"; // ✅ Hide lobby if name is too short
            createLobby.style.display = "block";
        }
    });


    // WORK in PROGRESS //
    // copy the lobby code to clipboard
    //if (navigator.clipboard && navigator.clipboard.writeText) {
    // Your code to use the Clipboard API
    if (navigator.clipboard) {

        const copyLobbyCode = document.getElementById("lobby-code");
        copyLobbyCode.addEventListener("click", () => {
            //alert(copyLobbyCode.textContent);
            navigator.clipboard.writeText(copyLobbyCode.textContent)
              .then(() => {
                alert("Text copied to clipboard! "+textElement.textContent);
              })
              .catch(err => {
              console.error("Failed to copy text: ", err);
             });
         });

        // paste lobby code from clipboard
        const pasteLobbyCode = document.getElementById("lobby-code-input");
        pasteLobbyCode.addEventListener("click", () => {
            //alert(pasteLobbyCode.textContent);
            navigator.clipboard.readText()
              .then( text => {
                alert("Text pasted from clipboard! "+text);
                pasteLobbyCode.value = text;
              })
              .catch(err => {
                console.error("Failed to paste text: ", err);
             });
         });
    } else {
        // Handle the case where the API is not available
        console.error("Clipboard API is not supported in this environment.");
    }


    // ✅ Function to toggle mute
    function toggleMute() {
        isMuted = !isMuted;

        // ✅ Update button text/icon
        const muteBtn = document.getElementById('mute-btn');
        muteBtn.textContent = isMuted ? "🔇 Sound Off" : "🔊 Sound On";

        // ✅ Mute/unmute all sounds
        document.querySelectorAll("audio").forEach(audio => {
            audio.muted = isMuted;
        });

        // ✅ Save mute state (optional)
        localStorage.setItem("muteState", isMuted);
    }

    // ✅ Event Listener for Mute Button
    document.getElementById("mute-btn").addEventListener("click", toggleMute);

    // ✅ Load mute state from localStorage (if available)
    if (localStorage.getItem("muteState") === "true") {
        isMuted = true;
        document.getElementById("mute-btn").textContent = "🔇 Sound Off";
        document.querySelectorAll("audio").forEach(audio => {
            audio.muted = true;
        });
    }
    



// SOCKET MESSAGES //

    socket.on('connect', () => {
        console.log('Connected to server');
        //document.getElementById('lobby-section').style.display = 'block';
        document.getElementById('player-name-input').value = socket.id;     // fill in player name with socket id
    });


    socket.on('lobbyCreated', (data) => {
        console.log("🏠 Lobby created! Code:", data.lobbyCode);
        console.log("🏠 host id set! :", data.hostId);
        currentLobbyCode = data.lobbyCode; // ✅ Store lobby code
        currentPlayerId = data.hostId;
        document.getElementById('lobby-code').textContent = currentLobbyCode;
        document.getElementById('start-container').style.display = 'none';
        document.getElementById('lobby-section').style.display = 'none';
        document.getElementById('game-section').style.display = 'grid';
        document.getElementById('start-game-btn').style.display = 'block';
        document.getElementById('game-status').textContent = 'Waiting for players...';
        
    });


    // When a player joins a lobby
    socket.on('playerJoined', (data) => {
        console.log("👥 Player joined! Current players:", data.players);

        // ✅ Find my name from the list (in case it was changed from duplicate)
        const myPlayer = data.players.find(p => p.id === socket.id);
        if (myPlayer) {
            document.getElementById("player-name-input").value = myPlayer.name; // ✅ Show updated name
        }

        // Make sure the game section becomes visible
        const startContainer = document.getElementById('start-container');
        const gameSection = document.getElementById('game-section');
        const lobbySection = document.getElementById('lobby-section');
        if (gameSection) {
            startContainer.style.display = 'none';
            gameSection.style.display = 'grid'; // Show the game area
            lobbySection.style.display = 'none'; // hide the lobby area
        } else {
            console.error("❌ game-section element not found!");
        }

        if (!currentLobbyCode) {
            currentLobbyCode = data.lobbyCode; // ✅ Store lobby code for guests
        }
        updatePlayersList(data.players, data.currentPlayerId);
    });


    socket.on('gameStarted', (data) => {
        updatePlayersList(data.players, data.currentPlayerId);
        isHost = data.hostId === socket.id; // Compare socket.id with hostId
        console.log("Am I the host?", isHost);
        document.getElementById('start-game-btn').style.display = 'none';
        document.getElementById('roll-dice-btn').style.display = 'block';
        //document.getElementById('end-turn-btn').style.display = 'block';
        document.getElementById('game-status').textContent = isHost ? 'Game started! It\'s your turn.' : '';
        startTurnTimer(); // Start the turn timer when game starts
    });


    socket.on('spectatorJoined', (data) => {
        console.log("👀 You joined as a spectator.");

        // ✅ Update the player list
        updatePlayersList(data.players, data.currentPlayerId);

        // ✅ Hide game action buttons (spectators cannot play)
        document.getElementById('start-container').style.display = 'none';
        document.getElementById('roll-dice-btn').style.display = 'none';
        document.getElementById('end-turn-btn').style.display = 'none';
        document.getElementById('start-game-btn').style.display = 'none';

        document.getElementById('game-status').textContent = `It's ${data.currentPlayerId} turn.`;
        document.getElementById('player-status').textContent = "👀 You are spectating the game.";
        document.getElementById('spectator-message').textContent = "Game in progress. You will join when it is over.";
    });


    socket.on('updateSpectators', (data) => {
        document.getElementById('spectator-count').textContent = (data.count != 0) ? `👀 Spectators: ${data.count}` : '';
    });




    socket.on('diceRolled', (data) => {
        console.log("🎲 Received dice roll:", data);

        document.getElementById('game-status').innerHTML = '';

        const diceContainer = document.getElementById('dice-container');
        diceContainer.innerHTML = '';

        let shotgunCount = 0;
        let footstepCount = 0;
        let tempRoll = diceRollCnt;
/*
        // ✅ Loop through each rolled die to display images
        data.rolledDice.forEach(die => {
            const diceElement = document.createElement('div');
            diceElement.classList.add('dice');

            // Determine the correct image based on dice color & outcome
            let imageSrc = `images/dice/${die.color}_${die.outcome}.png`;

            const diceImage = document.createElement('img');
            diceImage.src = imageSrc;
            diceImage.alt = `${die.color} dice - ${die.outcome}`;
            diceImage.classList.add('dice-image');

            diceElement.appendChild(diceImage);
            diceContainer.appendChild(diceElement);
        });
*/

        let diceElements = []; // Store dice elements for animation

        // ✅ Step 2: Start rolling sound
        let rollingSound = document.getElementById('rolling-sound');
        if (!isMuted) rollingSound.play();

        // ✅ Step 1: Create dice placeholders that will animate
        data.rolledDice.forEach( (die, index) => {
            const diceElement = document.createElement('div');
            diceElement.classList.add('dice');

            const diceImage = document.createElement('img');
            diceImage.classList.add('dice-image', 'spin'); // ✅ Start with spinning effect

            // Set initial random dice image (before final result)
            let randomFace = ["brain", "shotgun", "footsteps"][Math.floor(Math.random() * 3)];
            diceImage.src = `images/dice/${die.color}_${randomFace}.png`;
            diceImage.alt = "Rolling...";

            diceElement.appendChild(diceImage);
            diceContainer.appendChild(diceElement);
            diceElements.push({ element: diceImage, color: die.color, finalOutcome: die.outcome });
        });

        // ✅ Step 2: Create rolling effect using setInterval()
        let spinInterval = setInterval(() => {
            diceElements.forEach(die => {
                let randomFace = ["brain", "shotgun", "footsteps"][Math.floor(Math.random() * 3)];
                die.element.src = `images/dice/${die.color}_${randomFace}.png`;
            });
        }, 100); // Change every 100ms for a fast spin effect

        // ✅ Step 3: Stop spinning after 2 seconds, then apply bouncing & flipping
        setTimeout(() => {
            clearInterval(spinInterval); // Stop spinning

            diceElements.forEach( (die, index) => {
                die.element.classList.remove('spin'); // Remove spinning
                die.element.classList.add('flip'); // Add flipping effect

                setTimeout(() => {
                    die.element.classList.remove('flip'); // Remove flip
                    die.element.classList.add('bounce'); // Add bounce effect
                    die.element.src = `images/dice/${die.color}_${die.finalOutcome}.png`; // Show actual result
                    die.element.alt = die.finalOutcome;
                    // ✅ Update game status
                    //if (shotgunCount < 3) {
                        document.getElementById('dice-status').innerHTML = 
                            `Roll: ${tempRoll} | <img class='dice-small' src='images/dice/green_brain.png'> ${data.playerStats.brains} | <img class='dice-small' src='images/dice/red_shotgun.png'> ${data.playerStats.shotguns} | <img class='dice-small' src='images/dice/yellow_footsteps.png'> ${data.playerStats.footsteps}`;
                    //}

                    // ✅ Step 6: Stop rolling sound and play dice land sound
                    if (index === data.rolledDice.length - 1) { // Ensure it plays only once
                        rollingSound.pause();
                        rollingSound.currentTime = 0;                      
                        if (!isMuted) document.getElementById('land-sound').play();
                    }

                }, 800); // Flip effect lasts 0.8s before bouncing
            });

        }, 1800); // Stop spin after 2 seconds

        // ✅ Show "End Turn" button now that the player has rolled
        //if (socket.id === currentPlayerId) {
        //    document.getElementById('end-turn-btn').style.display = 'block';
        //}

        diceRollCnt++;
        tempRoll = diceRollCnt;

        // ✅ Check for 3 shotguns (force end turn)
        shotgunCount = data.playerStats.shotguns;
        if (shotgunCount >= 3) {
            rollingSound.pause();
            document.getElementById('land-sound').pause();
            if (!isMuted) document.getElementById('shotgun-sound').play();
            console.log("💀 Player eliminated! Switching turns.");
            switchToNextPlayer(false);
            return;
        }

        // ✅ Check if player won
        if (data.saveBrains >= 13) {
            console.log("🏆 Player won! Ending game.");
            gameEnded = true;
            return;
        }

        // ✅ Show "Roll Dice" and "End Turn" only for the current player
        document.getElementById('roll-dice-btn').style.display = (socket.id === currentPlayerId) ? 'block' : 'none';
        if (data.playerStats.brains >= 1) {
            document.getElementById('end-turn-btn').style.display = (socket.id === currentPlayerId) ? 'block' : 'none';
        }
        
        

    });




    // Listen for turn updates
    socket.on('turnStarted', (data) => {
        
        document.getElementById('dice-container').innerHTML = '';
        document.getElementById('dice-status').innerHTML = "";
        console.log("🎲 [Update] Turn started for:", data.currentPlayerId);
        
        // ✅ Ensure lobby code is set when turn starts
        if (data.lobbyCode) {
            currentLobbyCode = data.lobbyCode;
        }

        // ✅ Ensure current player ID is updated
        currentPlayerId = data.currentPlayerId;

        // ✅ Update player list to highlight the current player
        updatePlayersList(data.players, data.currentPlayerId);

        // Check if it's my turn
        const isMyTurn = (socket.id === currentPlayerId);
        
        // ✅ Show buttons only for the current player
        document.getElementById('roll-dice-btn').style.display = isMyTurn ? 'block' : 'none';
        //document.getElementById('end-turn-btn').style.display = isMyTurn ? 'block' : 'none';

        document.getElementById('end-turn-btn').style.display = 'none';

        // ✅ Update game status message
        document.getElementById('player-status').innerHTML = 
            isMyTurn ? "<b>It's your turn! Roll the dice.</b>" 
                     : `<b>Waiting for ${data.name} to roll...</b>`;  // ${currentPlayerId}

        //if (isMyTurn) {
        //    document.getElementById('dice-status').innerHTML = "";
        //}    

        document.getElementById('game-status').textContent = data.message;

        console.log(isMyTurn ? "✅ It's MY turn!" : "⏳ Waiting for another player...");

        diceRollCnt = 0;
    });




    socket.on('turnEnded', (data) => {
        if (data.previousPlayerId === socket.id) {
            //document.getElementById('game-status').textContent = "Your turn has ended.";
        }
    });


    socket.on('errorMessage', (data) => {
        alert(data.message);  // Show the error message to the user
    });


    // Listen for updated player scores
    socket.on('updateScores', (data) => {
        console.log("📊 Updating player scores:", data);
        updatePlayersList(data.players, data.currentPlayerId);

        console.log("✅ UI updated with scores:", data.players);
    });

    // Notify player if they lost from 3 shotguns
    socket.on('youLost', (data) => {
        document.getElementById('game-status').innerHTML = data.message;
        const diceContainer = document.getElementById('dice-container');
        diceContainer.innerHTML = '';
        // ✅ Loop through each rolled die to display images
        data.rolledDice.forEach(die => {
            const diceElement = document.createElement('div');
            diceElement.classList.add('dice');

            // Determine the correct image based on dice color & outcome
            let imageSrc = `images/dice/${die.color}_${die.outcome}.png`;

            const diceImage = document.createElement('img');
            diceImage.src = imageSrc;
            diceImage.alt = `${die.color} dice - ${die.outcome}`;
            diceImage.classList.add('dice-image');

            diceElement.appendChild(diceImage);
            diceContainer.appendChild(diceElement);
        });
        //alert(data.message);
    });


    socket.on('gameOver', (data) => {
        updatePlayersList(data.players, data.currentPlayerId);
        document.getElementById('spectator-message').textContent = "";
        document.getElementById('dice-container').innerHTML = '';
        document.getElementById('player-status').textContent = `🏆 ${data.winner} wins the game!`;
        document.getElementById('roll-dice-btn').style.display = 'none';
        document.getElementById('end-turn-btn').style.display = 'none';
        const isMyTurn = (socket.id === data.host);
        
        // ✅ Show buttons only for the current player
        document.getElementById('start-game-btn').style.display = isMyTurn ? 'block' : 'none';
        // ✅ Set a flag to prevent further actions
        gameEnded = true;
    });


    socket.on('gameReset', (data) => {
        console.log("🔄 Game has been reset!");

        document.getElementById('spectator-message').textContent = "";
        document.getElementById('dice-status').innerHTML = "";

        // ✅ Reset game status message
        document.getElementById('game-status').textContent = "Game over! Waiting for host to restart...";

        // ✅ Clear dice container
        document.getElementById('dice-container').innerHTML = '';

        // ✅ Hide action buttons (until game starts)
        document.getElementById('roll-dice-btn').style.display = 'none';
        document.getElementById('end-turn-btn').style.display = 'none';

        // ✅ Reset global variables
        gameEnded = false;
        currentPlayerId = data.currentPlayerId; // ✅ Set first player correctly

        // ✅ Allow host to start a new game
        const isHost = (socket.id === data.host);
        document.getElementById('start-game-btn').style.display = isHost ? 'block' : 'none';
    });


    socket.on('playerDisconnected', (data) => {
        console.log(`❌ Player ${data.playerId} disconnected. Updating player list.`);

        document.getElementById('game-status').innerHTML = "Player "+data.playerId+" disconnected.";

        // ✅ Update the player list
        updatePlayersList(data.players, currentPlayerId);

        // ✅ Show a message if it's now your turn
        if (socket.id === currentPlayerId) {
            document.getElementById('game-status').textContent = "🎲 It's your turn!";
        }

        // ✅ If the host changed, check if you're the new host
        //const isHost = (socket.id === data.host);
        //document.getElementById('start-game-btn').style.display = isHost ? 'block' : 'none';
    });




// FUNCTIONS //

    function createLobby() {
        const playerName = sanitizeName(document.getElementById('player-name-input').value);

        if (!playerName) {
            alert("Please enter a name before creating a lobby.");
            return;
        }

        document.getElementById("start-container").display = 'none';
        document.getElementById("lobby-section").display = 'none';
        document.getElementById("game-section").display = 'grid';
        
        socket.emit('createLobby', { playerName });
        isHost = true;
    }

    function joinLobby() {
        const playerName = sanitizeName(document.getElementById('player-name-input').value);
        const lobbyCode = sanitizeCode(document.getElementById('lobby-code-input').value);
        if (!playerName) {
            alert("Please enter a name before joining a lobby.");
            return;
        }
        if (!lobbyCode) {
            alert("Please enter a lobby code.");
            return;
        }

        socket.emit('joinLobby', { lobbyCode, playerName });
        document.getElementById('start-container').style.display = 'none';
        document.getElementById('game-section').style.display = 'grid';
        document.getElementById('lobby-section').style.display = 'none';
        document.getElementById('game-status').textContent = 'Waiting for host to start...';
    }

    function sanitizeName(name) {
        return name.replace(/[^a-zA-Z0-9 _-]/g, "").trim().substring(0, 20);
    }
    function sanitizeCode(code) {
        return code.replace(/[^a-zA-Z0-9]/g, "").trim().substring(0, 5);
    }

    function updatePlayersList(players, currentPlayerId) {
        let playerList = "<table><tr><th>Player</th><th><img class='dice-small' src='images/dice/green_brain.png'></th></tr>";

        const playersListDiv = document.getElementById("players-list");
        //playersListDiv.innerHTML = "<h3>Players:</h3>"; // ✅ Update to show final scores

        if (players.length === 0) {
            playersListDiv.innerHTML += "<p>No players remaining.</p>";
            return;
        }

        players.forEach(player => {
            //const playerItem = document.createElement("div");
            //alert(player.brains);
            if (player.id === currentPlayerId) {
                playerList += `<tr class='current-player'><td>${player.name}</td><td>${player.brains ? player.brains : "0"}</td></tr>`;
                //playerItem.innerHTML = `<strong>⭐ ${player.name} ${player.brains ? "<img class='dice-small' src='images/dice/green_brain.png'> "+player.brains : ""}</strong>`;
                //playerItem.style.color = "gold"; // ✅ Change color to highlight current player
                //playerItem.classList.add("current-player");
            } else {
                const isCurrentPlayer = (player.id === socket.id);
                playerList += `<tr><td>${player.name}</td><td>${player.brains ? player.brains : "0"}</td></tr>`;
                //playerItem.innerHTML = `${isCurrentPlayer ? "⭐ " : ""} ${player.name} ${player.brains ? "<img class='dice-small' src='images/dice/green_brain.png'> "+player.brains : ""} `;
                //playerItem.innerHTML = `${player.name} ${player.brains ? "<img class='dice-small' src='images/dice/green_brain.png'> "+player.brains : ""}`;
            }
            
            //playersListDiv.appendChild(playerItem);
        });

        playerList += "</table>";
        playersListDiv.innerHTML = playerList;
        console.log("✅ UI updated with final player scores:", players);
    }



    function startGame() {
        console.log("Starting the game...");
        gameEnded = false;
        socket.emit('startGame', currentLobbyCode);
    }

    function rollDice() {
        if(diceRollCnt == 0) {
            document.getElementById('dice-status').innerHTML = "";
        }
        // ✅ Step 1: Play click sound when roll starts
        if (!isMuted) document.getElementById('click-sound').play();

        console.log("My ID:", socket.id, "Current Player ID:", currentPlayerId); // Debugging log
        //if (socket.id !== currentPlayerId || document.getElementById('roll-dice-btn').disabled) {
        if (!currentLobbyCode) {
            console.error("🚨 Error: No lobby code found!");
            document.getElementById('game-status').textContent = "⚠ Lobby code missing!";
            return;
        }
        if (socket.id !== currentPlayerId ) {    
            console.warn("🚫 You can't roll dice, it's not your turn!");
            document.getElementById('game-status').textContent = "It's not your turn!";
            return;
        }
        if (gameEnded) {
            console.warn("🚫 The game is over! No more rolling.");
            return;
        }

        console.log("🎲 Rolling dice in lobby:", currentLobbyCode);
        socket.emit('rollDice', { lobbyCode: currentLobbyCode });
    }

    // **Function to switch to the next player**
    function switchToNextPlayer(saveBrains) {

        if (saveBrains) {
            saveBrainsAndEndTurn();
        }

        //clearTimeout(turnTimer); // Clear any existing turn timer
        console.log("Switching to next player...");

        // Notify the server that it's time to switch players
        socket.emit('nextTurn', { playerId: currentPlayerId, lobbyCode: currentLobbyCode, saveBrains: saveBrains });

        document.getElementById('dice-container').innerHTML = '';
        document.getElementById('dice-status').innerHTML = "";

        // Disable buttons to prevent actions while waiting
        document.getElementById('roll-dice-btn').style.display = 'none';
        document.getElementById('end-turn-btn').style.display = 'none';
        //document.getElementById('game-status').textContent = "Waiting for next player...";
    }


    function saveBrainsAndEndTurn() {
        console.log("🛑 Ending turn and saving brains...");

        if (!currentLobbyCode) {
            console.error("🚨 No lobby code found!");
            return;
        }

        if (gameEnded) {
            console.warn("🚫 The game is over! You cannot end your turn.");
            return;
        }

        if (!isMuted) document.getElementById('brain-sound').play();
        socket.emit('saveBrainsAndEndTurn', { lobbyCode: currentLobbyCode });
    }



    function endTurn(lobbyCode) {
        if (!lobbies[lobbyCode] || !lobbies[lobbyCode].turnOrder.length) {
            console.error("❌ Error: Cannot end turn, turn order is empty.");
            return;
        }

        const lobby = lobbies[lobbyCode];
        const previousPlayerId = lobby.currentPlayerId;

        // Move to the next player in turn order
        lobby.currentPlayerIndex = (lobby.currentPlayerIndex + 1) % lobby.turnOrder.length;
        const nextPlayerId = lobby.turnOrder[lobby.currentPlayerIndex];

        // Update the current player
        lobby.currentPlayerId = nextPlayerId;

        console.log(`✅ Turn ended for ${previousPlayerId}. Next player: ${nextPlayerId}`);

        // Notify all players about the new turn
        io.in(lobbyCode).emit('turnStarted', { currentPlayerId: nextPlayerId });
    }



    // **Start Turn Timer**
    function startTurnTimer() {
        clearTimeout(turnTimer); // Reset timer
    /*
        let timeLeft = 30; // 30 seconds for each turn
        document.getElementById('timer').textContent = `Time left: ${timeLeft} seconds`;

        turnTimer = setInterval(() => {
            timeLeft--;
            document.getElementById('timer').textContent = `Time left: ${timeLeft} seconds`;

            if (timeLeft <= 0) {
                clearInterval(turnTimer);
                endTurn(); // End turn if timer runs out
            }
        }, 1000);

        turnTimer = setTimeout(() => {
            console.log("Turn timed out. Switching players...");
            switchToNextPlayer();
        }, TURN_TIME_LIMIT);
    */            
    }
