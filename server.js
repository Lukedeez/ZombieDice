const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "http://192.168.1.111:88", // Your web server's URL
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'] // Enable both WebSocket and polling
});

const lobbies = {};

app.use(cors());

app.get('/', (req, res) => {
    res.send('Welcome to the Dice Game!');
});


function initializeGameState() {
    return {
        players: [],
        turnOrder: [],
        currentPlayerIndex: 0,
        currentPlayerId: null,
        hostId: null,
        gameState: 'waiting',
        gameOver: false,
        spectators: [], // ✅ Initialize spectators array
        dicePool: [
            'green', 'green', 'green', 'green', 'green', 'green',
            'yellow', 'yellow', 'yellow', 'yellow',
            'red', 'red', 'red'
        ], // The 13 dice in play
        usedDice: [], // Holds used dice when the pool runs out
        diceHistory: {}, // ✅ Ensure dice history is always initialized
        playerStats: {}, // ✅ Ensure player stats are always initialized
        savedBrains: {}  // ✅ Ensure saved brain scores exist
    };
}




function getRandomDice(lobbyCode, num) {
    let lobby = lobbies[lobbyCode];

    if (!lobby) {
        console.error("❌ Lobby not found for getRandomDice.");
        return [];
    }

    // ✅ Ensure dicePool exists
    if (!lobby.dicePool) {
        console.warn("⚠️ dicePool was missing! Reinitializing.");
        lobby.dicePool = [
            'green', 'green', 'green', 'green', 'green', 'green',
            'yellow', 'yellow', 'yellow', 'yellow',
            'red', 'red', 'red'
        ];
    }

    // ♻️ If dicePool is too low, reshuffle usedDice back in
    if (lobby.dicePool.length < num) {
        console.log("♻️ Out of dice! Reshuffling used dice back into the cup.");
        lobby.dicePool = [...lobby.dicePool, ...lobby.usedDice];
        lobby.usedDice = [];
    }

    // 🎲 Draw dice
    const drawnDice = [];
    for (let i = 0; i < num; i++) {
        const randomIndex = Math.floor(Math.random() * lobby.dicePool.length);
        drawnDice.push(lobby.dicePool.splice(randomIndex, 1)[0]); // Remove from pool
    }

    return drawnDice;
}




function rollDiceForPlayer(lobbyCode, playerId) {
    if (!lobbies[lobbyCode]) {
        console.error("❌ Lobby not found:", lobbyCode);
        return;
    }

    const lobby = lobbies[lobbyCode];

    if (lobby.currentPlayerId !== playerId) {
        console.warn("⛔ Not their turn! Rejecting roll request.");
        return;
    }

    // ✅ Ensure playerStats exists
    if (!lobby.playerStats) {
        lobby.playerStats = {};
    }
    if (!lobby.playerStats[playerId]) {
        console.log(`⚠️ Initializing player stats for ${playerId}`);
        lobby.playerStats[playerId] = { brains: 0, shotguns: 0, footsteps: 0 };
    }

    // ✅ Ensure diceHistory exists
    if (!lobby.diceHistory) {
        lobby.diceHistory = {};
    }
    if (!lobby.diceHistory[playerId]) {
        lobby.diceHistory[playerId] = [];
    }
    
    let diceToRoll;
 
    const existingFootsteps = lobby.diceHistory[playerId]
                                .filter(d => d.outcome === 'footsteps')
                                .map(d => d.color);
    const newDiceNeeded = 3 - existingFootsteps.length;
    
    

    if (newDiceNeeded > 0) {
        const newDice = getRandomDice(lobbyCode, newDiceNeeded);
        diceToRoll = [...existingFootsteps, ...newDice];
    } else {
        diceToRoll = getRandomDice(lobbyCode, 3);
    }

    const { rollResult, newDice: rolledDice } = rollDice(diceToRoll);

    rolledDice.forEach(die => {
        if (die.outcome === 'brain' || die.outcome === 'shotgun') {
            lobby.usedDice.push(die.color);
        }
    });

    lobby.playerStats[playerId].brains += rollResult.brain;
    lobby.playerStats[playerId].shotguns += rollResult.shotgun;
    lobby.playerStats[playerId].footsteps = rollResult.footsteps;

    lobby.diceHistory[playerId] = rolledDice;

    console.log(`🎲 Player ${playerId} rolled:`, rollResult);

    let allBrains = lobby.playerStats[playerId].brains + lobby.savedBrains[playerId];
    if (allBrains >= 13) {
        //lobby.savedBrains[playerId] = allBrains;
    }

    io.in(lobbyCode).emit('diceRolled', { rollResult, rolledDice, playerId, playerStats: lobby.playerStats[playerId], savedBrains: lobby.savedBrains[playerId] });

    // 🚨 If player gets 3 shotguns, they lose all brains collected this round and turn ends
    if (lobby.playerStats[playerId].shotguns >= 3) {
        console.log("💀 Player got 3 shotguns! Ending turn...");
        io.to(playerId).emit('youLost', { rollResult, rolledDice, message: "💀 You got 3 shotguns! You lose this round!" });
        endTurn(lobbyCode, playerId, false);
        return;
    }

    if (allBrains >= 13) {
        console.log("Player got 13 brains! Ending game.");
        endTurn(lobbyCode, playerId, true);
        return;
    }

}






function rollDice(diceToRoll) {
    const outcomes = { brain: 0, shotgun: 0, footsteps: 0 };
    const newDice = [];

    diceToRoll.forEach(die => {
        const roll = Math.floor(Math.random() * 6);
        let outcome;

        if (die === 'green') {
            outcome = roll < 3 ? 'brain' : roll < 4 ? 'shotgun' : 'footsteps';
        } else if (die === 'yellow') {
            outcome = roll < 2 ? 'brain' : roll < 4 ? 'shotgun' : 'footsteps';
        } else {
            outcome = roll < 1 ? 'brain' : roll < 4 ? 'shotgun' : 'footsteps';
        }

        outcomes[outcome]++;
        
        // Store the dice outcome for potential re-rolls
        newDice.push({ color: die, outcome });
    });

    return { rollResult: outcomes, newDice };
}


function reshuffleDice(lobby) {
    console.log("♻️ Reshuffling dice for the next player...");

    // Refill the dice pool with the original 13 dice
    lobby.dicePool = [
        'green', 'green', 'green', 'green', 'green', 'green',
        'yellow', 'yellow', 'yellow', 'yellow',
        'red', 'red', 'red'
    ];

    // Clear out used dice
    lobby.usedDice = [];

    console.log("🎲 Dice pool has been reset!");
}



function endTurn(lobbyCode, playerId, saveBrains = false) {
    let message = '';

    if (!lobbies[lobbyCode] || !lobbies[lobbyCode].turnOrder.length) {
        console.error("❌ Error: Cannot end turn, turn order is empty.");
        return;
    }

    const lobby = lobbies[lobbyCode];
    const previousPlayerId = lobby.currentPlayerId;

    if (!lobby.playerStats[previousPlayerId]) {
        console.error("❌ Player stats not found for:", previousPlayerId);
        return;
    }

    // ✅ Get the next player's name
    const previousPlayer = lobby.players.find(p => p.id === previousPlayerId);
    const previousPlayerName = previousPlayer ? previousPlayer.name : "Unknown Player";

    // 🧠 Save brains only if player ended turn voluntarily
    if (saveBrains) {
        console.log(`🧠 Player ${previousPlayerId} saved ${lobby.playerStats[previousPlayerId].brains} brains!`);
        message = `${previousPlayerName} saved ${lobby.playerStats[previousPlayerId].brains} brains!`;

        if (!lobby.savedBrains) {
            lobby.savedBrains = {};
        }
        if (!lobby.savedBrains[previousPlayerId]) {
            lobby.savedBrains[previousPlayerId] = 0;
        }

        // update after check because it gets added if greater than 13
        lobby.savedBrains[previousPlayerId] += lobby.playerStats[previousPlayerId].brains;

        console.log("endTurn: "+lobby.savedBrains[previousPlayerId]);

        // check to see if winner
        if( lobby.savedBrains[previousPlayerId] >= 13) {
            lobby.gameOver = true;
            const winner = lobby.players.find(p => p.id === previousPlayerId);
            const winnerName = winner ? winner.name : "Unknown Player";
            
            // ✅ Send the winner's name instead of just the ID
            //io.in(lobbyCode).emit('gameOver', { winner: winnerName, host: lobby.hostId, players: lobby.players });
            io.in(lobbyCode).emit('gameOver', {
                currentPlayerId: lobby.currentPlayerId,
                winner: winnerName,
                host: lobby.hostId,
                players: lobby.players.map(p => ({
                    name: p.name,
                    brains: lobby.savedBrains[p.id] || 0 // ✅ Ensure brains exist
                }))
            });

            console.log(`🏆 Game Over! Winner: ${winnerName} (${previousPlayerId})`);

            // ✅ Reset the game while keeping players in the lobby
            resetLobbyForNewGame(lobbyCode);

            return;
        }

        // Send updated scores
        //io.in(lobbyCode).emit('updateScores', { savedBrains: lobby.savedBrains });
        io.in(lobbyCode).emit('updateScores', {
            currentPlayerId: lobby.currentPlayerId,
            savedBrains: lobby.savedBrains,
            players: lobby.players.map(p => ({
                id: p.id,
                name: p.name,
                brains: lobby.savedBrains[p.id] || 0 // Ensure 0 if not set
            }))
        });

    } else {
        console.log(`💀 Player ${previousPlayerId} lost all brains this round due to 3 shotguns!`);
        message = `${previousPlayerName} lost all brains!`;
    }

    // Reset temporary stats (Shotguns, Footsteps)
    lobby.playerStats[previousPlayerId].shotguns = 0;
    lobby.playerStats[previousPlayerId].footsteps = 0;
    lobby.playerStats[previousPlayerId].brains = 0; // 🚨 Reset brains if they lost

    // Move to next player
    lobby.currentPlayerIndex = (lobby.currentPlayerIndex + 1) % lobby.turnOrder.length;
    const nextPlayerId = lobby.turnOrder[lobby.currentPlayerIndex];

    // ✅ Get the next player's name
    const nextPlayer = lobby.players.find(p => p.id === nextPlayerId);
    const nextPlayerName = nextPlayer ? nextPlayer.name : "Unknown Player";

    // Update the current player
    lobby.currentPlayerId = nextPlayerId;

    console.log(`✅ Turn ended for ${previousPlayerId}. Next player: ${nextPlayerName}`);

    // Notify all players
    io.in(lobbyCode).emit('turnEnded', { previousPlayerId });
    io.in(lobbyCode).emit('turnStarted', { 
                            message: message,
                            currentPlayerId: nextPlayerId,
                            lobbyCode: lobbyCode,
                            players: lobby.players.map(p => ({
                                id: p.id,
                                name: p.name,
                                brains: lobby.savedBrains[p.id] || 0 // Ensure 0 if not set
                            })),
                            name: nextPlayerName
                        }); 
}


function resetLobbyForNewGame(lobbyCode) {
    if (!lobbies[lobbyCode]) return;

    const lobby = lobbies[lobbyCode];

    console.log(`🔄 Resetting lobby ${lobbyCode} for a new game...`);

    lobby.gameState = 'waiting';

    // ✅ Reset game state but keep players
    lobby.gameOver = false;
    lobby.currentPlayerIndex = 0;
    lobby.turnOrder = [...lobby.players.map(p => p.id)]; // ✅ Ensure correct player order
    lobby.currentPlayerId = lobby.turnOrder[0]; // ✅ Start with the first player

    // ✅ Reset player stats
    lobby.players.forEach(player => {
        lobby.playerStats[player.id] = {
            brains: 0,
            shotguns: 0,
            footsteps: 0
        };
        lobby.savedBrains[player.id] = 0;
    });

    // ✅ Move spectators to players for the new game
    lobby.spectators.forEach(spectatorId => {
        console.log("---- spectators: "+spectatorId.name+" "+spectatorId.id);
        //lobby.players.push({ id: spectatorId, name: spectatorId.name });
        lobby.players.push(spectatorId);
        lobby.turnOrder.push(spectatorId);
        lobby.playerStats[spectatorId] = { brains: 0, shotguns: 0, footsteps: 0 };
    });
    lobby.spectators = []; // ✅ Clear spectators

    // update specator count
    io.in(lobbyCode).emit('updateSpectators', { count: lobby.spectators.length });

    // ✅ Inform players the game has been reset
    io.in(lobbyCode).emit('gameReset', { 
        host: lobby.hostId, 
        currentPlayerId: lobby.currentPlayerId,
        players: lobby.players.map(p => ({
            id: p.id,
            name: p.name,
            brains: 0
        }))
    });

    console.log(`✅ Game reset complete! First player: ${lobby.currentPlayerId}`);
}








io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);

    socket.onAny((event, ...args) => {
        console.log(`Event received: ${event}`, args);
    });

    socket.on('createLobby', ({ playerName }) => {
        const lobbyCode = Math.random().toString(36).substr(2, 5).toUpperCase();
        lobbies[lobbyCode] = initializeGameState();
        lobbies[lobbyCode].players.push({ id: socket.id, name: playerName }); // Ensure the host is added as a player
        lobbies[lobbyCode].turnOrder.push(socket.id); // Host also needs to be in the turn order
        lobbies[lobbyCode].currentPlayerIndex = 0;
        lobbies[lobbyCode].currentPlayerId = socket.id;
        lobbies[lobbyCode].code = lobbyCode;
        lobbies[lobbyCode].hostId = socket.id;

        socket.join(lobbyCode);
        socket.emit('lobbyCreated', { lobbyCode, hostId: socket.id });
    });


    socket.on('joinLobby', ( { lobbyCode, playerName } ) => {
        console.log("joinLobby: "+playerName);

        if (lobbies[lobbyCode]) {
            const lobby = lobbies[lobbyCode]; // ✅ Define lobby before using it

            playerName = sanitizeName(playerName);
            // ✅ Generate a unique name if there's a duplicate
            playerName = generateUniqueName(lobby, playerName);

            // ✅ Prevent duplicate names
            if (lobby.players.find(p => p.name === playerName)) {
                socket.emit("errorMessage", { message: "Name already taken. Choose another one." });
                return;
            }

            // ✅ Ensure spectators array exists
            if (!lobby.spectators) {
                lobby.spectators = [];
            }

            // ✅ If the game is in progress, add as a spectator
            if (lobby.gameState === 'playing') {
                console.log(`👀 Player ${socket.id} joined as a spectator in lobby ${lobbyCode}`);
                lobby.spectators.push({ id: socket.id, name: playerName }); // ✅ Add them as a spectator

                socket.join(lobbyCode);
                socket.emit('spectatorJoined', { 
                    players: lobby.players.map(p => ({
                        id: p.id,
                        name: p.name,
                        brains: lobby.savedBrains[p.id] || 0
                    })),
                    currentPlayerId: lobby.currentPlayerId
                });
                // ✅ Notify all players that a spectator joined
                io.in(lobbyCode).emit('updateSpectators', { count: lobby.spectators.length });
                return;
            }

            // ✅ Otherwise, allow them to join as a player
            if (!lobby.players.some(p => p.id === socket.id)) {
                lobby.players.push({ id: socket.id, name: playerName });
                lobby.turnOrder.push(socket.id);
                
                // Ensure player stats exist
                if (!lobby.playerStats) {
                    lobby.playerStats = {};
                }
                lobby.playerStats[socket.id] = { brains: 0, shotguns: 0, footsteps: 0 };
            }

            socket.join(lobbyCode);
            console.log(`🔹 Player joined lobby ${lobbyCode}: ${playerName}`);

            // ✅ Now `lobby` is properly defined before using it
            io.in(lobbyCode).emit('playerJoined', {
                currentPlayerId: lobby.currentPlayerId,
                players: lobby.players.map(p => ({
                    name: p.name,
                    brains: lobby.playerStats[p.id] ? lobby.playerStats[p.id].brains : 0 // ✅ Ensure brains exist
                }))
            });
        } else {
            socket.emit('lobbyNotFound');
        }
    });


    function sanitizeName(name) {
        return name.replace(/[^a-zA-Z0-9 _-]/g, "").trim().substring(0, 15);
    }

    function generateUniqueName(lobby, baseName) {
        let uniqueName = baseName;
        let counter = 1;

        // ✅ Keep adding numbers until the name is unique
        while (lobby.players.find(p => p.name === uniqueName)) {
            uniqueName = `${baseName} ${counter}`;
            counter++;
        }

        return uniqueName;
    }



    socket.on('saveBrainsAndEndTurn', ({ lobbyCode }) => {
        console.log(`🛑 Player ${socket.id} chose to save brains and end their turn.`);
        
        if (!lobbies[lobbyCode]) {
            console.error("❌ Lobby not found:", lobbyCode);
            return;
        }

        //endTurn(lobbyCode, socket.id, true); // ✅ Save brains because the player ended turn voluntarily
    });



    socket.on('startGame', (lobbyCode) => {
        if (!lobbies[lobbyCode]) {
            console.error(`❌ Lobby ${lobbyCode} does not exist.`);
            return;
        }

        const lobby = lobbies[lobbyCode];

        if (lobby.players.length < 2) {
            socket.emit('errorMessage', { message: "Not enough players to start the game." });
            return;
        }

        console.log(`🎲 Host started a new game in lobby ${lobbyCode}`);

        lobby.gameState = 'playing';

        // ✅ Reset turn order and start the first turn
        lobby.turnOrder = [...lobby.players.map(p => p.id)];
        lobby.currentPlayerIndex = 0;
        lobby.currentPlayerId = lobby.turnOrder[0]; // ✅ Make sure first player is set

        // ✅ Get the next player's name
        const currentPlayer = lobby.players.find(p => p.id === lobby.currentPlayerId);
        const currentPlayerName = currentPlayer ? currentPlayer.name : "Unknown Player";


        // ✅ Send game start event
        io.in(lobbyCode).emit('gameStarted', { 
            turnOrder: lobby.turnOrder,
            currentPlayerId: lobby.currentPlayerId,
            players: lobby.players.map(p => ({
                name: p.name,
                brains: lobby.playerStats[p.id] ? lobby.playerStats[p.id].brains : 0 // ✅ Ensure brains exist
            }))
        });

        io.in(lobbyCode).emit('turnStarted', { players: lobby.players, currentPlayerId: lobby.currentPlayerId, lobbyCode: lobbyCode, name: currentPlayerName });

        console.log(`✅ Game restarted! First player: ${lobby.currentPlayerId}`);
    });


    
    socket.on('rollDice', ({ lobbyCode }) => {
        console.log(`🎲 Player ${socket.id} is rolling dice in lobby ${lobbyCode}`);
        rollDiceForPlayer(lobbyCode, socket.id);
    });




    socket.on('disconnect', () => {
        console.log(`❌ Player disconnected: ${socket.id}`);

        // Find the lobby the player was in
        let playerLobbyCode = null;
        for (const code in lobbies) {
            if (lobbies[code].players.find(p => p.id === socket.id)) {
                playerLobbyCode = code;
                break;
            }
        }

        if (!playerLobbyCode) return; // Player was not in any lobby

        const lobby = lobbies[playerLobbyCode];

        // Remove the player from the lobby
        lobby.players = lobby.players.filter(p => p.id !== socket.id);
        delete lobby.playerStats[socket.id];
        delete lobby.savedBrains[socket.id];

        // ✅ Remove player from turnOrder
        const removedIndex = lobby.turnOrder.indexOf(socket.id);
        if (removedIndex !== -1) {
            lobby.turnOrder.splice(removedIndex, 1);
        }

        console.log(`🔹 Updated players in lobby ${playerLobbyCode}:`, lobby.players);
        console.log(`🔄 Updated turn order:`, lobby.turnOrder);

        // Check if the disconnected player was the current player
        if (lobby.currentPlayerId === socket.id) {
            console.log(`🔄 Player ${socket.id} was the current player. Switching turns...`);

            // Move to the next player
            if (lobby.players.length > 0) {
                lobby.currentPlayerIndex = (lobby.currentPlayerIndex) % lobby.players.length;
                lobby.currentPlayerId = lobby.players[lobby.currentPlayerIndex].id;
                let currentPlayerName = lobby.players[lobby.currentPlayerIndex].name;

                io.in(playerLobbyCode).emit('turnStarted', { 
                    currentPlayerId: lobby.currentPlayerId, 
                    lobbyCode: playerLobbyCode,
                    players: lobby.players.map(p => ({
                        id: p.id,
                        name: p.name,
                        brains: lobby.savedBrains[p.id] || 0
                    })),
                    name: currentPlayerName
                });
            } else {
                console.log("🏁 No players left in the game. Ending lobby.");
                delete lobbies[playerLobbyCode];
                return;
            }
        }

        // ✅ If the host leaves, assign a new host
        if (socket.id === lobby.hostId) {
            if (lobby.players.length > 0) {
                lobby.hostId = lobby.players[0].id;
                console.log(`👑 New host assigned: ${lobby.hostId}`);
            } else {
                console.log("🏁 No players left. Deleting lobby.");
                delete lobbies[playerLobbyCode];
                return;
            }
        }


        // ✅ Notify all players that someone disconnected
        io.in(playerLobbyCode).emit('playerDisconnected', { 
            playerId: socket.id, 
            players: lobby.players.map(p => ({
                id: p.id,
                name: p.name,
                brains: lobby.savedBrains[p.id] || 0
            })),
            host: lobby.hostId
        });
    });



    socket.on('nextTurn', ({ playerId, lobbyCode, saveBrains }) => {
        if (!lobbies[lobbyCode]) {
            console.error("Lobby not found:", lobbyCode);
            return;
        }

        const currentPlayerId = lobbies[lobbyCode].currentPlayerId;
        
        // Only allow the current player to end their turn
        if (playerId !== currentPlayerId) {
            console.warn(`⛔ Player ${playerId} tried to switch turns, but it's not their turn.`);
            return;
        }

        console.log(`🔄 Player ${playerId} is ending their turn...`);
        endTurn(lobbyCode, playerId, saveBrains); // Call existing function to switch turns
    });






});

server.listen(3000, () => {
    console.log('Server is running on port 3000');
});
