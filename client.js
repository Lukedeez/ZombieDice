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



// SOCKET MESSAGES //

    socket.on('connect', () => {
        console.log('Connected to server');
        document.getElementById('lobby-section').style.display = 'block';
        document.getElementById('player-name-input').value = socket.id;     // fill in player name with socket id
    });


    socket.on('lobbyCreated', (data) => {
        console.log("🏠 Lobby created! Code:", data.lobbyCode);
        console.log("🏠 host id set! :", data.hostId);
        currentLobbyCode = data.lobbyCode; // ✅ Store lobby code
        currentPlayerId = data.hostId;
        document.getElementById('lobby-code').textContent = currentLobbyCode;
        document.getElementById('lobby-section').style.display = 'none';
        document.getElementById('game-section').style.display = 'block';
        document.getElementById('start-game-btn').style.display = 'block';
        document.getElementById('game-status').textContent = 'Waiting...';
    });


    // When a player joins a lobby
    socket.on('playerJoined', (data) => {
        console.log("👥 Player joined! Current players:", data.players);

        // Make sure the game section becomes visible
        const gameSection = document.getElementById('game-section');
        const lobbySection = document.getElementById('lobby-section');
        if (gameSection) {
            gameSection.style.display = 'block'; // Show the game area
            lobbySection.style.display = 'none'; // hide the lobby area
        } else {
            console.error("❌ game-section element not found!");
        }

        if (!currentLobbyCode) {
            currentLobbyCode = data.lobbyCode; // ✅ Store lobby code for guests
        }
        updatePlayersList(data.players);
    });


    socket.on('gameStarted', (data) => {
        isHost = data.hostId === socket.id; // Compare socket.id with hostId
        console.log("Am I the host?", isHost);
        document.getElementById('start-game-btn').style.display = 'none';
        document.getElementById('roll-dice-btn').style.display = 'block';
        document.getElementById('end-turn-btn').style.display = 'block';
        document.getElementById('game-status').textContent = 'Game started! It\'s your turn.';
        startTurnTimer(); // Start the turn timer when game starts
    });


    socket.on('diceRolled', (data) => {
        console.log("🎲 Received dice roll:", data);

        const diceContainer = document.getElementById('dice-container');
        diceContainer.innerHTML = '';

        let shotgunCount = 0;
        let footstepCount = 0;

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

        // ✅ Update game status
        document.getElementById('game-status').textContent = 
            `🧠 Brains: ${data.playerStats.brains} | 💥 Shotguns: ${data.playerStats.shotguns} | 👣 Footsteps: ${data.playerStats.footsteps}`;

        // ✅ Check for 3 shotguns (force end turn)
        shotgunCount = data.playerStats.shotguns;
        if (shotgunCount >= 3) {
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
        document.getElementById('end-turn-btn').style.display = (socket.id === currentPlayerId) ? 'block' : 'none';
    });






    // Listen for turn updates
    socket.on('turnStarted', (data) => {
        document.getElementById('dice-container').innerHTML = '';
        console.log("🎲 [Update] Turn started for:", data.currentPlayerId);
        
        // ✅ Ensure lobby code is set when turn starts
        if (data.lobbyCode) {
            currentLobbyCode = data.lobbyCode;
        }

        // ✅ Ensure current player ID is updated
        currentPlayerId = data.currentPlayerId;

        // Check if it's my turn
        const isMyTurn = (socket.id === currentPlayerId);
        
        // ✅ Show buttons only for the current player
        document.getElementById('roll-dice-btn').style.display = isMyTurn ? 'block' : 'none';
        document.getElementById('end-turn-btn').style.display = isMyTurn ? 'block' : 'none';

        // ✅ Update game status message
        document.getElementById('game-status').textContent = 
            isMyTurn ? "🎲 It's your turn! Roll the dice." 
                     : `⏳ Waiting for Player: ${currentPlayerId}`;

        if (isMyTurn) {
            document.getElementById('player-status').innerHTML = '';
        }

        console.log(isMyTurn ? "✅ It's MY turn!" : "⏳ Waiting for another player...");
    });




    socket.on('turnEnded', (data) => {
        if (data.currentPlayerId === socket.id) {
            document.getElementById('game-status').textContent = "Your turn has ended.";
        }
    });


    socket.on('errorMessage', (data) => {
        alert(data.message);  // Show the error message to the user
    });


    // Listen for updated player scores
    socket.on('updateScores', (data) => {
        console.log("📊 Updating player scores:", data);

        const playersListDiv = document.getElementById("players-list");
        playersListDiv.innerHTML = "<h3>Players & Brains:</h3>"; 

        data.players.forEach(player => {
            const playerItem = document.createElement("div");

            // Highlight current player
            const isCurrentPlayer = (player.id === socket.id);
            playerItem.innerHTML = `${isCurrentPlayer ? "⭐ " : ""} ${player.name}: <img src='images/dice/green_brain.png'> ${player.brains} Brains`;

            playersListDiv.appendChild(playerItem);
        });

        console.log("✅ UI updated with scores:", data.players);
    });

    // Notify player if they lost from 3 shotguns
    socket.on('youLost', (data) => {
        document.getElementById('player-status').innerHTML = data.message;
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
        updatePlayersList(data.players);
        document.getElementById('dice-container').innerHTML = '';
        document.getElementById('game-status').textContent = `🏆 ${data.winner} wins the game!`;
        document.getElementById('roll-dice-btn').style.display = 'none';
        document.getElementById('end-turn-btn').style.display = 'none';
        const isMyTurn = (socket.id === data.host);
        
        // ✅ Show buttons only for the current player
        document.getElementById('start-game-btn').style.display = isMyTurn ? 'block' : 'none';
        // ✅ Set a flag to prevent further actions
        gameEnded = true;
    });



// FUNCTIONS //

    function createLobby() {
        const playerName = document.getElementById('player-name-input').value.trim();
        if (!playerName) {
            alert("Please enter a name before creating a lobby.");
            return;
        }
        socket.emit('createLobby', { playerName });
        isHost = true;
    }

    function joinLobby() {
        const playerName = document.getElementById('player-name-input').value.trim();
        const lobbyCode = document.getElementById('lobby-code-input').value;
        if (!playerName) {
            alert("Please enter a name before joining a lobby.");
            return;
        }
        if (!lobbyCode) {
            alert("Please enter a lobby code.");
            return;
        }
        socket.emit('joinLobby', { lobbyCode, playerName });
        document.getElementById('game-section').style.display = 'block';
        document.getElementById('lobby-section').style.display = 'none';
        document.getElementById('game-status').textContent = 'Waiting to start...';
    }

    function updatePlayersList(players) {
        const playersListDiv = document.getElementById("players-list");
        playersListDiv.innerHTML = "<h3>Player Scores:</h3>"; // ✅ Update to show final scores

        players.forEach(player => {
            const playerItem = document.createElement("div");
            playerItem.innerHTML = `${player.name}: <img src='images/dice/green_brain.png'> ${player.brains} Brains`;
            playersListDiv.appendChild(playerItem);
        });

        console.log("✅ UI updated with final player scores:", players);
    }



    function startGame() {
        console.log("Starting the game...");
        socket.emit('startGame', currentLobbyCode);
    }

    function rollDice() {
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
        socket.emit('nextTurn', { playerId: currentPlayerId, lobbyCode: currentLobbyCode });

        document.getElementById('dice-container').innerHTML = '';

        // Disable buttons to prevent actions while waiting
        document.getElementById('roll-dice-btn').style.display = 'none';
        document.getElementById('end-turn-btn').style.display = 'none';
        document.getElementById('game-status').textContent = "Waiting for next player...";
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
