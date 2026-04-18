const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, downloadContentFromMessage, isJidBroadcast } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const P = require('pino');
const fetch = require('node-fetch');
const qrcode = require('qrcode-terminal');
const crypto = require('crypto');
const http = require('http');
const { createHash } = require('crypto');
const QRCode = require('qrcode');

// Import tool commands
const tools = require('./tools.js');

// Bot Creator Info
const CREATOR_INFO = {
    name: "BIG TENNET",
    ig: "bigtennet",
    tiktok: "therealbigtennet", 
    website: "https://tennetteam.com"
};

// Sudo users system - JSON-based with persistence
const SUDO_FILE_PATH = path.join(__dirname, 'sudo_users.json');

// Bot owner configuration
const BOT_OWNER = '2349116896136@s.whatsapp.net';

// Load sudo users from JSON file
function loadSudoUsers() {
    try {
        if (fs.existsSync(SUDO_FILE_PATH)) {
            const sudoData = JSON.parse(fs.readFileSync(SUDO_FILE_PATH, 'utf8'));
            console.log('✅ Loaded sudo users from JSON file');
            console.log(`👑 Bot owner: ${sudoData.bot_owner}`);
            console.log(`🔓 Global sudo users: ${sudoData.global_sudo_users.length}`);
            console.log(`📊 Group sudo users: ${Object.keys(sudoData.group_sudo_users).length} groups`);
            return sudoData;
        } else {
            // Create default sudo file
            const defaultSudoData = {
                global_sudo_users: [BOT_OWNER],
                group_sudo_users: {},
                bot_owner: BOT_OWNER,
                last_updated: new Date().toISOString()
            };
            saveSudoUsers(defaultSudoData);
            console.log('✅ Created new sudo users file with bot owner');
            return defaultSudoData;
        }
    } catch (e) {
        console.error('❌ Error loading sudo users:', e);
        // Return default data if file is corrupted
        return {
            global_sudo_users: [BOT_OWNER],
            group_sudo_users: {},
            bot_owner: BOT_OWNER,
            last_updated: new Date().toISOString()
        };
    }
}

// Save sudo users to JSON file
function saveSudoUsers(sudoData) {
    try {
        sudoData.last_updated = new Date().toISOString();
        fs.writeFileSync(SUDO_FILE_PATH, JSON.stringify(sudoData, null, 2));
        console.log('✅ Sudo users saved to JSON file');
    } catch (e) {
        console.error('❌ Failed to save sudo users:', e);
    }
}

// Check if user has global sudo permissions
function isGlobalSudoUser(userId) {
    const sudoData = loadSudoUsers();
    return sudoData.global_sudo_users.includes(userId);
}

// Check if user has sudo permissions in a specific group
function isGroupSudoUser(userId, groupId) {
    const sudoData = loadSudoUsers();
    return sudoData.group_sudo_users[groupId] && sudoData.group_sudo_users[groupId].includes(userId);
}

// Check if user has sudo permissions (global or group)
function isSudoUser(userId, groupId = null) {
    if (isGlobalSudoUser(userId)) {
        return true;
    }
    if (groupId && isGroupSudoUser(userId, groupId)) {
        return true;
    }
    return false;
}

// Check if user is bot owner
function isBotOwner(userId) {
    const sudoData = loadSudoUsers();
    return userId === sudoData.bot_owner;
}

// Check if user can use the bot (bot owner or sudo user)
function canUseBot(userId, groupId = null) {
    // Normalize userId
    userId = (userId || '').trim();
    const sudoData = loadSudoUsers();
    const botOwner = (sudoData.bot_owner || '').trim();
    const globalSudoUsers = (sudoData.global_sudo_users || []).map(u => u.trim());
    
    // Always ensure bot owner is in global sudo users
    if (!globalSudoUsers.includes(botOwner)) {
        globalSudoUsers.push(botOwner);
        sudoData.global_sudo_users = globalSudoUsers;
        saveSudoUsers(sudoData);
    }

    console.log(`🔍 Permission check for user: ${userId}`);
    console.log(`🔍 Bot owner: ${botOwner}`);
    console.log(`🔍 Global sudo users: ${globalSudoUsers.join(', ')}`);
    console.log(`🔍 Group ID: ${groupId}`);

    // Bot owner can always use the bot
    if (userId === botOwner) {
        console.log('✅ User is bot owner');
        return true;
    }
    // Check global sudo permissions
    if (globalSudoUsers.includes(userId)) {
        console.log('✅ User is global sudo user');
        return true;
    }
    // Check group-specific sudo permissions
    if (groupId && sudoData.group_sudo_users[groupId] && sudoData.group_sudo_users[groupId].includes(userId)) {
        console.log('✅ User is group sudo user');
        return true;
    }
    console.log('❌ User not authorized');
    return false;
}

// Add global sudo user
function addGlobalSudoUser(userId) {
    const sudoData = loadSudoUsers();
    if (!sudoData.global_sudo_users.includes(userId)) {
        sudoData.global_sudo_users.push(userId);
        saveSudoUsers(sudoData);
        console.log(`✅ Added ${userId} as global sudo user`);
        return true;
    }
    return false;
}

// Add multiple ID formats for the same user (for WhatsApp ID variations)
function addUserMultipleIds(primaryId, additionalIds) {
    const sudoData = loadSudoUsers();
    const allIds = [primaryId, ...additionalIds];
    
    // Add all ID formats if they don't exist
    let added = false;
    allIds.forEach(id => {
        if (!sudoData.global_sudo_users.includes(id)) {
            sudoData.global_sudo_users.push(id);
            added = true;
        }
    });
    
    if (added) {
        saveSudoUsers(sudoData);
        console.log(`✅ Added multiple ID formats for user: ${allIds.join(', ')}`);
        return true;
    }
    return false;
}

// Remove global sudo user
function removeGlobalSudoUser(userId) {
    const sudoData = loadSudoUsers();
    const index = sudoData.global_sudo_users.indexOf(userId);
    if (index > -1) {
        sudoData.global_sudo_users.splice(index, 1);
        saveSudoUsers(sudoData);
        console.log(`✅ Removed ${userId} from global sudo users`);
        return true;
    }
    return false;
}

// Add group sudo user
function addGroupSudoUser(userId, groupId) {
    const sudoData = loadSudoUsers();
    if (!sudoData.group_sudo_users[groupId]) {
        sudoData.group_sudo_users[groupId] = [];
    }
    if (!sudoData.group_sudo_users[groupId].includes(userId)) {
        sudoData.group_sudo_users[groupId].push(userId);
        saveSudoUsers(sudoData);
        console.log(`✅ Added ${userId} as sudo user in group ${groupId}`);
        return true;
    }
    return false;
}

// Remove group sudo user
function removeGroupSudoUser(userId, groupId) {
    const sudoData = loadSudoUsers();
    if (sudoData.group_sudo_users[groupId]) {
        const index = sudoData.group_sudo_users[groupId].indexOf(userId);
        if (index > -1) {
            sudoData.group_sudo_users[groupId].splice(index, 1);
            saveSudoUsers(sudoData);
            console.log(`✅ Removed ${userId} from sudo users in group ${groupId}`);
            return true;
        }
    }
    return false;
}

// Get all sudo users (global and group)
function getAllSudoUsers(groupId = null) {
    const sudoData = loadSudoUsers();
    const allSudoUsers = [...sudoData.global_sudo_users];
    
    if (groupId && sudoData.group_sudo_users[groupId]) {
        allSudoUsers.push(...sudoData.group_sudo_users[groupId]);
    }
    
    return [...new Set(allSudoUsers)]; // Remove duplicates
}

// Check if user is admin or sudo user
async function hasAdminPermission(sock, msg) {
    const userId = msg.key.participant || msg.key.remoteJid;
    
    // Check if user is bot owner (always has permissions)
    if (userId === BOT_OWNER) {
        return true;
    }
    
    // Check if user is sudo
    if (isSudoUser(userId)) {
        return true;
    }
    
    // Check if user is group admin
    try {
        const groupMetadata = await sock.groupMetadata(msg.key.remoteJid);
        const participant = groupMetadata.participants.find(p => p.id === userId);
        return participant && participant.admin;
    } catch (e) {
        return false;
    }
}

// Command documentation with detailed explanations and usage examples
const COMMAND_DOCS = {
    '!ping': {
        description: "Check if the bot is online and responsive",
        usage: "!ping",
        example: "!ping",
        category: "Utility"
    },
    '!debug': {
        description: "Get detailed debug information about the current chat and bot status",
        usage: "!debug",
        example: "!debug",
        category: "Utility"
    },
    '!help': {
        description: "Get help information about the bot and its features",
        usage: "!help [command]",
        example: "!help !weather",
        category: "Utility"
    },
    '!creator': {
        description: "Get information about the bot creator and social media links",
        usage: "!creator",
        example: "!creator",
        category: "Info"
    },
    '!time': {
        description: "Get the current server time",
        usage: "!time",
        example: "!time",
        category: "Utility"
    },
    '!datediff': {
        description: "Calculate the difference between two dates",
        usage: "!datediff <date1> <date2>",
        example: "!datediff 2024-01-01 2024-12-31",
        category: "Utility"
    },
    '!timein': {
        description: "Get the current time in a specific city or timezone",
        usage: "!timein <city/timezone>",
        example: "!timein London",
        category: "Utility"
    },
    '!shorten': {
        description: "Shorten a long URL using a URL shortener service",
        usage: "!shorten <url>",
        example: "!shorten https://www.google.com",
        category: "Utility"
    },
    '!tempmail': {
        description: "Generate a temporary email address for testing",
        usage: "!tempmail",
        example: "!tempmail",
        category: "Utility"
    },
    '!color': {
        description: "Get information about a color from its hex code",
        usage: "!color <hex_code>",
        example: "!color #FF0000",
        category: "Utility"
    },
    '!password': {
        description: "Generate a random secure password",
        usage: "!password [length]",
        example: "!password 12",
        category: "Utility"
    },
    '!motivate': {
        description: "Get a random motivational quote to boost your day",
        usage: "!motivate",
        example: "!motivate",
        category: "Fun"
    },
    '!joke': {
        description: "Get a random joke to make you laugh",
        usage: "!joke",
        example: "!joke",
        category: "Fun"
    },
    '!quote': {
        description: "Get a random inspirational quote from famous people",
        usage: "!quote",
        example: "!quote",
        category: "Fun"
    },
    '!trivia': {
        description: "Get a random trivia question to test your knowledge",
        usage: "!trivia",
        example: "!trivia",
        category: "Fun"
    },
    '!weather': {
        description: "Get current weather information for a city",
        usage: "!weather <city>",
        example: "!weather New York",
        category: "Info"
    },
    '!country': {
        description: "Get information about a country",
        usage: "!country <country_name>",
        example: "!country Nigeria",
        category: "Info"
    },
    '!coin': {
        description: "Flip a coin and get heads or tails",
        usage: "!coin",
        example: "!coin",
        category: "Fun"
    },
    '!crypto': {
        description: "Get current cryptocurrency prices",
        usage: "!crypto <coin_symbol>",
        example: "!crypto BTC",
        category: "Info"
    },
    '!reverse': {
        description: "Reverse the text you provide",
        usage: "!reverse <text>",
        example: "!reverse Hello World",
        category: "Fun"
    },
    '!rps': {
        description: "Play Rock, Paper, Scissors against the bot",
        usage: "!rps <rock|paper|scissors>",
        example: "!rps rock",
        category: "Games"
    },
    '!textart': {
        description: "Convert text into ASCII art",
        usage: "!textart <text>",
        example: "!textart Hello",
        category: "Fun"
    },
    '!poll': {
        description: "Create a poll with Yes/No/Maybe options",
        usage: "!poll <question>",
        example: "!poll Should we have pizza for lunch?",
        category: "Group"
    },
    '!vote': {
        description: "Vote in the current poll (1=Yes, 2=No, 3=Maybe)",
        usage: "!vote <number>",
        example: "!vote 1",
        category: "Group"
    },
    '!xp': {
        description: "Earn XP points by using this command",
        usage: "!xp",
        example: "!xp",
        category: "Fun"
    },
    '!rank': {
        description: "Check your XP rank among all users",
        usage: "!rank",
        example: "!rank",
        category: "Fun"
    },
    '!define': {
        description: "Get the definition of a word",
        usage: "!define <word>",
        example: "!define awesome",
        category: "Info"
    },
    '!binary': {
        description: "Convert text to binary code",
        usage: "!binary <text>",
        example: "!binary Hello",
        category: "Utility"
    },
    '!unbinary': {
        description: "Convert binary code back to text",
        usage: "!unbinary <binary>",
        example: "!unbinary 1001000 1100101 1101100 1101100 1101111",
        category: "Utility"
    },
    '!emoji': {
        description: "Get emoji information and variations",
        usage: "!emoji <emoji>",
        example: "!emoji 😀",
        category: "Fun"
    },
    '!countdown': {
        description: "Start a countdown timer in seconds",
        usage: "!countdown <seconds>",
        example: "!countdown 60",
        category: "Utility"
    },
    '!bible': {
        description: "Get a random Bible verse",
        usage: "!bible",
        example: "!bible",
        category: "Fun"
    },
    '!fact': {
        description: "Get a random interesting fact",
        usage: "!fact",
        example: "!fact",
        category: "Fun"
    },
    '!wordday': {
        description: "Get the word of the day",
        usage: "!wordday",
        example: "!wordday",
        category: "Fun"
    },
    '!list': {
        description: "Show all available commands in the current chat type",
        usage: "!list",
        example: "!list",
        category: "Utility"
    },
    '!catfact': {
        description: "Get a random fact about cats",
        usage: "!catfact",
        example: "!catfact",
        category: "Fun"
    },
    '!dogfact': {
        description: "Get a random fact about dogs",
        usage: "!dogfact",
        example: "!dogfact",
        category: "Fun"
    },
    '!remind': {
        description: "Set a reminder (bot will remind you after specified seconds)",
        usage: "!remind <seconds> <message>",
        example: "!remind 300 Take a break",
        category: "Utility"
    },
    '!uuid': {
        description: "Generate a random UUID (Universally Unique Identifier)",
        usage: "!uuid",
        example: "!uuid",
        category: "Utility"
    },
    '!roll': {
        description: "Roll a dice with specified number of sides",
        usage: "!roll [sides]",
        example: "!roll 20",
        category: "Fun"
    },
    '!palindrome': {
        description: "Check if text is a palindrome (reads same forwards and backwards)",
        usage: "!palindrome <text>",
        example: "!palindrome racecar",
        category: "Fun"
    },
    '!capitalize': {
        description: "Capitalize the first letter of each word in text",
        usage: "!capitalize <text>",
        example: "!capitalize hello world",
        category: "Utility"
    },
    '!echo': {
        description: "Make the bot repeat your message",
        usage: "!echo <text>",
        example: "!echo Hello everyone!",
        category: "Fun"
    },
    '!vv': {
        description: "Manually unlock view-once media (reply to view-once message)",
        usage: "!vv (reply to view-once media)",
        example: "Reply to view-once image with: !vv",
        category: "Media"
    },
    '!viewonce': {
        description: "Get information about the view-once unlocking feature",
        usage: "!viewonce",
        example: "!viewonce",
        category: "Media"
    },
    '!test': {
        description: "Test if the bot is working properly in the current chat",
        usage: "!test",
        example: "!test",
        category: "Utility"
    },
    '!sticker': {
        description: "Convert an image or video to a WhatsApp sticker",
        usage: "!sticker (reply to image/video)",
        example: "Reply to image with: !sticker",
        category: "Media"
    },
    '!tagall': {
        description: "Tag all members in the group (Group only)",
        usage: "!tagall",
        example: "!tagall",
        category: "Group"
    },
    '!kick': {
        description: "Kick a user from the group (Admin only)",
        usage: "!kick <@user>",
        example: "!kick @username",
        category: "Group"
    },
    '!add': {
        description: "Add a user to the group (Admin only)",
        usage: "!add <phone_number>",
        example: "!add 2348124269148",
        category: "Group"
    },
    '!promote': {
        description: "Promote a user to admin (Admin only)",
        usage: "!promote <@user>",
        example: "!promote @username",
        category: "Group"
    },
    '!demote': {
        description: "Demote an admin to member (Admin only)",
        usage: "!demote <@user>",
        example: "!demote @username",
        category: "Group"
    },
    '!ban': {
        description: "Ban a user from the group (Admin only)",
        usage: "!ban <@user>",
        example: "!ban @username",
        category: "Group"
    },
    '!unban': {
        description: "Unban a user from the group (Admin only)",
        usage: "!unban <@user>",
        example: "!unban @username",
        category: "Group"
    },
    '!groupinfo': {
        description: "Get detailed information about the current group",
        usage: "!groupinfo",
        example: "!groupinfo",
        category: "Group"
    },
    '!setdesc': {
        description: "Set the group description (Admin only)",
        usage: "!setdesc <description>",
        example: "!setdesc Welcome to our awesome group!",
        category: "Group"
    },
    '!setname': {
        description: "Set the group name (Admin only)",
        usage: "!setname <name>",
        example: "!setname My Awesome Group",
        category: "Group"
    },
    '!antispam': {
        description: "Configure anti-spam protection (Admin only)",
        usage: "!antispam <on|off>",
        example: "!antispam on",
        category: "Group"
    },
    '!antilink': {
        description: "Configure anti-link protection (Admin only)",
        usage: "!antilink <on|off>",
        example: "!antilink on",
        category: "Group"
    },
    '!wordle': {
        description: "Play Wordle - guess the 5-letter word",
        usage: "!wordle [guess]",
        example: "!wordle HELLO",
        category: "Games"
    },
    '!hangman': {
        description: "Play Hangman - guess the word letter by letter",
        usage: "!hangman [letter]",
        example: "!hangman A",
        category: "Games"
    },
    '!tictactoe': {
        description: "Play Tic Tac Toe against the bot",
        usage: "!tictactoe <position>",
        example: "!tictactoe 5",
        category: "Games"
    },
    '!numberguess': {
        description: "Play Number Guessing game",
        usage: "!numberguess [number]",
        example: "!numberguess 50",
        category: "Games"
    },
    '!wordchain': {
        description: "Play Word Chain - say a word that starts with the last letter of the previous word",
        usage: "!wordchain <word>",
        example: "!wordchain apple",
        category: "Games"
    },
    '!emojiquiz': {
        description: "Play Emoji Quiz - guess what the emoji represents",
        usage: "!emojiquiz",
        example: "!emojiquiz",
        category: "Games"
    },
    '!riddle': {
        description: "Get a random riddle to solve",
        usage: "!riddle",
        example: "!riddle",
        category: "Games"
    },
    '!truthordare': {
        description: "Play Truth or Dare with random questions",
        usage: "!truthordare",
        example: "!truthordare",
        category: "Games"
    },
    '!wouldyourather': {
        description: "Get a random 'Would You Rather' question",
        usage: "!wouldyourather",
        example: "!wouldyourather",
        category: "Games"
    },
    '!neverhaveiever': {
        description: "Get a random 'Never Have I Ever' statement",
        usage: "!neverhaveiever",
        example: "!neverhaveiever",
        category: "Games"
    },
    '!typinggame': {
        description: "Play a typing speed game",
        usage: "!typinggame [text]",
        example: "!typinggame The quick brown fox",
        category: "Games"
    },
    '!addsudo': {
        description: "Add a user to sudo (bot admin) permissions (Owner only)",
        usage: "!addsudo @user",
        example: "!addsudo @1234567890",
        category: "Admin"
    },
    '!removesudo': {
        description: "Remove a user from sudo permissions (Owner only)",
        usage: "!removesudo @user",
        example: "!removesudo @1234567890",
        category: "Admin"
    },
    '!listsudo': {
        description: "List all sudo users (Owner only)",
        usage: "!listsudo",
        example: "!listsudo",
        category: "Admin"
    },
    '!owner': {
        description: "Check if you are the bot owner and show owner info",
        usage: "!owner",
        example: "!owner",
        category: "Admin"
    }
};

// Custom styling for bot responses
const BOT_STYLES = {
    header: "╭─────────────────────────────╮\n",
    footer: "╰─────────────────────────────╯",
    divider: "─────────────────────────────",
    creator: `\n\n💫 *Created by BIG TENNET*\n📱 Instagram: @${CREATOR_INFO.ig}\n🌐 Website: ${CREATOR_INFO.website}`
};

// Helper function to format command help
function formatCommandHelp(command) {
    const doc = COMMAND_DOCS[command];
    if (!doc) return null;
    
    return `${BOT_STYLES.header}📋 *${command.toUpperCase()}*\n${BOT_STYLES.divider}\n\n📝 *Description:*\n${doc.description}\n\n💡 *Usage:*\n\`${doc.usage}\`\n\n🎯 *Example:*\n\`${doc.example}\`\n\n🏷️ *Category:* ${doc.category}${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
}

// Helper function to format category help
function formatCategoryHelp(category) {
    const commands = Object.entries(COMMAND_DOCS)
        .filter(([cmd, doc]) => doc.category === category)
        .map(([cmd, doc]) => `• \`${cmd}\` - ${doc.description}`)
        .join('\n');
    
    return `${BOT_STYLES.header}📂 *${category.toUpperCase()} COMMANDS*\n${BOT_STYLES.divider}\n\n${commands}${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
}

// Keep-alive function to prevent disconnections
// Global variables for connection management
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 50; // Increased for maximum resilience
const RECONNECT_DELAY = 3000; // Faster reconnection
let isConnected = false;
let connectionStartTime = Date.now();
let lastHeartbeat = Date.now();
let lastSuccessfulMessage = Date.now();
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 10;

// Ultra-aggressive keep-alive system
function startKeepAlive(sock) {
    console.log('🔄 Starting ULTRA-ROBUST keep-alive mechanism...');
    
    // Send a heartbeat every 60 seconds (ultra-frequent)
    const heartbeatInterval = setInterval(async () => {
        try {
            if (sock.user && sock.user.id && isConnected) {
                // Update status to show bot is active
                await sock.updateProfileStatus('🤖 BIG TENNET Bot - Online');
                lastHeartbeat = Date.now();
                consecutiveFailures = 0; // Reset failure counter
                console.log('💓 Heartbeat sent - Bot is alive');
                
                // Check connection health
                await checkConnectionHealth(sock);
            }
        } catch (error) {
            console.log('❌ Heartbeat failed:', error.message);
            consecutiveFailures++;
            await handleConnectionIssue(sock, error);
        }
    }, 60 * 1000); // 60 seconds - ultra aggressive
    
    // Send a ping message every 2 minutes
    const pingInterval = setInterval(async () => {
        try {
            if (sock.user && sock.user.id && isConnected) {
                const botNumber = sock.user.id.split(':')[0];
                const botJid = `${botNumber}@s.whatsapp.net`;
                
                // Send a hidden message to keep connection active
                await sock.sendMessage(botJid, { 
                    text: '🔄 Keep-alive ping' 
                });
                console.log('📡 Ping sent - Connection maintained');
                consecutiveFailures = 0;
            }
        } catch (error) {
            console.log('❌ Ping failed:', error.message);
            consecutiveFailures++;
            await handleConnectionIssue(sock, error);
        }
    }, 2 * 60 * 1000); // 2 minutes
    
    // Connection health check every 30 seconds
    const healthCheckInterval = setInterval(async () => {
        await checkConnectionHealth(sock);
    }, 30 * 1000); // 30 seconds
    
    // Ultra-aggressive connection test every 15 seconds
    const connectionTestInterval = setInterval(async () => {
        try {
            if (sock.user && sock.user.id && isConnected) {
                // Test connection by getting user info
                const userInfo = await sock.user;
                if (userInfo) {
                    lastSuccessfulMessage = Date.now();
                    consecutiveFailures = 0;
                }
            }
        } catch (error) {
            console.log('⚠️ Connection test failed:', error.message);
            consecutiveFailures++;
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                console.log('🚨 Too many consecutive failures, forcing reconnection...');
                await forceReconnection(sock);
            }
        }
    }, 15 * 1000); // 15 seconds
    
    // Log keep-alive status every 5 minutes
    const logInterval = setInterval(() => {
        const uptime = getUptime();
        const connectionTime = Math.floor((Date.now() - connectionStartTime) / 1000);
        console.log('✅ ULTRA-ROBUST keep-alive running - Bot connection stable');
        console.log(`📊 Total uptime: ${uptime}`);
        console.log(`🔗 Connection time: ${Math.floor(connectionTime / 60)}m ${connectionTime % 60}s`);
        console.log(`💓 Last heartbeat: ${Math.floor((Date.now() - lastHeartbeat) / 1000)}s ago`);
        console.log(`❌ Consecutive failures: ${consecutiveFailures}`);
    }, 5 * 60 * 1000); // 5 minutes
    
    // Store intervals for cleanup
    sock.keepAliveIntervals = [heartbeatInterval, pingInterval, healthCheckInterval, connectionTestInterval, logInterval];
}

// Force reconnection without waiting
async function forceReconnection(sock) {
    console.log('🚨 FORCING IMMEDIATE RECONNECTION...');
    isConnected = false;
    consecutiveFailures = 0;
    
    // Clear existing intervals
    if (sock.keepAliveIntervals) {
        sock.keepAliveIntervals.forEach(interval => clearInterval(interval));
    }
    
    // Immediate restart
    console.log('🔄 Restarting bot immediately...');
    setTimeout(() => {
        startBot();
    }, 1000); // 1 second delay
}

// Check connection health
async function checkConnectionHealth(sock) {
    try {
        if (!sock.user || !sock.user.id) {
            console.log('⚠️ Connection health check failed - No user data');
            return false;
        }
        
        // Try to get user info to test connection
        const userInfo = await sock.user;
        if (userInfo) {
            console.log('✅ Connection health check passed');
            consecutiveFailures = 0;
            return true;
        }
    } catch (error) {
        console.log('❌ Connection health check failed:', error.message);
        consecutiveFailures++;
        await handleConnectionIssue(sock, error);
        return false;
    }
}

// Handle connection issues with multiple strategies
async function handleConnectionIssue(sock, error) {
    console.log('🚨 Connection issue detected:', error.message);
    
    // Check if it's a connection closed error or any network issue
    if (error.message.includes('Connection Closed') || 
        error.message.includes('statusCode: 428') ||
        error.message.includes('Precondition Required') ||
        error.message.includes('Network') ||
        error.message.includes('timeout') ||
        error.message.includes('ECONNRESET') ||
        error.message.includes('ENOTFOUND')) {
        
        console.log('🔍 Detected connection drop, attempting immediate recovery...');
        isConnected = false;
        
        // Try immediate reconnection
        await forceReconnection(sock);
    }
    
    // If too many consecutive failures, force restart
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.log('🚨 Too many failures, forcing restart...');
        await forceReconnection(sock);
    }
}

// Get bot uptime
function getUptime() {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    return `${hours}h ${minutes}m ${seconds}s`;
}

// Enhanced reconnection logic with infinite retries
async function reconnectBot() {
    // Never give up - always try to reconnect
    reconnectAttempts++;
    console.log(`🔄 Reconnection attempt ${reconnectAttempts} (INFINITE RETRIES)`);
    
    // Clear existing intervals
    if (global.currentSock && global.currentSock.keepAliveIntervals) {
        global.currentSock.keepAliveIntervals.forEach(interval => clearInterval(interval));
    }
    
    // Faster reconnection with shorter delays
    const delay = Math.min(RECONNECT_DELAY * Math.log(reconnectAttempts + 1), 30000);
    
    setTimeout(() => {
        console.log('🔄 Attempting to reconnect...');
        startBot();
    }, delay);
}

// ULTRA-ROBUST Process error handling - ZERO SHUTDOWNS
process.on('uncaughtException', (error) => {
    console.log('❌ Uncaught Exception:', error);
    console.log('🔍 Error stack:', error.stack);
    console.log('🔄 ULTRA-ROBUST: Restarting bot immediately...');
    
    // Clean up intervals
    if (global.currentSock && global.currentSock.keepAliveIntervals) {
        global.currentSock.keepAliveIntervals.forEach(interval => clearInterval(interval));
    }
    
    // Immediate restart instead of exit
    setTimeout(() => {
        startBot();
    }, 2000);
});

process.on('unhandledRejection', (reason, promise) => {
    console.log('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    console.log('🔄 ULTRA-ROBUST: Restarting bot immediately...');
    
    // Clean up intervals
    if (global.currentSock && global.currentSock.keepAliveIntervals) {
        global.currentSock.keepAliveIntervals.forEach(interval => clearInterval(interval));
    }
    
    // Immediate restart instead of exit
    setTimeout(() => {
        startBot();
    }, 2000);
});

// Graceful shutdown - but still restart
process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT. ULTRA-ROBUST: Restarting instead of shutdown...');
    
    // Clean up intervals
    if (global.currentSock && global.currentSock.keepAliveIntervals) {
        global.currentSock.keepAliveIntervals.forEach(interval => clearInterval(interval));
    }
    
    // Restart instead of exit
    setTimeout(() => {
        startBot();
    }, 1000);
});

process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM. ULTRA-ROBUST: Restarting instead of shutdown...');
    
    // Clean up intervals
    if (global.currentSock && global.currentSock.keepAliveIntervals) {
        global.currentSock.keepAliveIntervals.forEach(interval => clearInterval(interval));
    }
    
    // Restart instead of exit
    setTimeout(() => {
        startBot();
    }, 1000);
});

// ULTRA-ROBUST Memory monitoring - Never exit, always restart
setInterval(() => {
    const memUsage = process.memoryUsage();
    const memMB = {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
    };
    
    console.log(`📊 Memory Usage: RSS: ${memMB.rss}MB, Heap: ${memMB.heapUsed}/${memMB.heapTotal}MB, External: ${memMB.external}MB`);
    
    // Restart if memory usage is too high (over 400MB RSS) - More aggressive
    if (memMB.rss > 400) {
        console.log('⚠️ High memory usage detected, ULTRA-ROBUST: Restarting bot...');
        
        // Clean up intervals
        if (global.currentSock && global.currentSock.keepAliveIntervals) {
            global.currentSock.keepAliveIntervals.forEach(interval => clearInterval(interval));
        }
        
        // Restart instead of exit
        setTimeout(() => {
            startBot();
        }, 1000);
    }
}, 15 * 60 * 1000); // Check every 15 minutes - More frequent

// DB file path
const DB_PATH = path.join(__dirname, 'db.json');

// Initialize db.json if not exists
if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ polls: {}, xp: {}, sudoUsers: [] }, null, 2));
}

// Load sudo users on startup
const initialSudoData = loadSudoUsers();
console.log('🚀 Sudo system initialized with JSON persistence');

function loadDB() {
    return JSON.parse(fs.readFileSync(DB_PATH));
}

function saveDB(db) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// Helper to send a reply quoting the original message
async function reply(sock, msg, text) {
    await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
}

// Set up tools module with reply function
tools.setReplyFunction(reply);

// Command list
const COMMANDS = [
    '!ping', '!debug', '!help', '!time', '!datediff', '!timein', '!shorten', '!tempmail', '!color', '!password', '!motivate', '!joke', '!quote', '!trivia', '!weather', '!define', '!country', '!coin', '!crypto', '!reverse', '!rps', '!textart', '!poll', '!vote', '!xp', '!rank', '!binary', '!unbinary', '!emoji', '!countdown', '!bible', '!fact', '!wordday', '!tagall', '!list', '!catfact', '!dogfact', '!remind', '!uuid', '!roll', '!palindrome', '!capitalize', '!echo', '!creator', '!kick', '!add', '!promote', '!demote', '!ban', '!unban', '!groupinfo', '!setdesc', '!setname', '!vv', '!viewonce', '!test', '!sticker', '!wordle', '!hangman', '!tictactoe', '!numberguess', '!wordchain', '!emojiquiz', '!riddle', '!truthordare', '!wouldyourather', '!neverhaveiever', '!typinggame', '!addsudo', '!removesudo', '!listsudo', '!owner'
];

// Separate commands by type
const PRIVATE_COMMANDS = [
    '!ping', '!debug', '!help', '!time', '!datediff', '!timein', '!shorten', '!tempmail', '!color', '!password', '!motivate', '!joke', '!quote', '!trivia', '!weather', '!define', '!country', '!coin', '!crypto', '!reverse', '!rps', '!textart', '!poll', '!vote', '!xp', '!rank', '!binary', '!unbinary', '!emoji', '!countdown', '!bible', '!fact', '!wordday', '!list', '!catfact', '!dogfact', '!remind', '!uuid', '!roll', '!palindrome', '!capitalize', '!echo', '!creator', '!vv', '!viewonce', '!test', '!sticker', '!wordle', '!hangman', '!tictactoe', '!numberguess', '!wordchain', '!emojiquiz', '!riddle', '!truthordare', '!wouldyourather', '!neverhaveiever', '!typinggame', '!addsudo', '!removesudo', '!listsudo', '!owner'
];

const GROUP_ONLY_COMMANDS = [
    '!tagall', '!kick', '!add', '!promote', '!demote', '!ban', '!unban', '!groupinfo', '!setdesc', '!setname', '!antispam', '!antilink'
];

// Antispam state (in-memory)
const antispamSettings = {};
const antispamTracker = {};
const SPAM_THRESHOLD = 5;
const SPAM_WINDOW = 10 * 1000; // 10 seconds

// Antilink state (in-memory)
const antilinkSettings = {};
const LINK_PATTERNS = [
    /https?:\/\/[^\s]+/gi,
    /www\.[^\s]+/gi,
    /t\.me\/[^\s]+/gi,
    /bit\.ly\/[^\s]+/gi,
    /tinyurl\.com\/[^\s]+/gi,
    /youtu\.be\/[^\s]+/gi,
    /youtube\.com\/[^\s]+/gi,
    /instagram\.com\/[^\s]+/gi,
    /facebook\.com\/[^\s]+/gi,
    /twitter\.com\/[^\s]+/gi,
    /x\.com\/[^\s]+/gi,
    /tiktok\.com\/[^\s]+/gi,
    /snapchat\.com\/[^\s]+/gi,
    /discord\.gg\/[^\s]+/gi,
    /discord\.com\/[^\s]+/gi,
    /telegram\.me\/[^\s]+/gi,
    /wa\.me\/[^\s]+/gi,
    /whatsapp\.com\/[^\s]+/gi
];

// Main async function
async function startBot() {
    try {
        console.log('🚀 Starting ULTRA-ROBUST WhatsApp bot...');
        
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        const { version } = await fetchLatestBaileysVersion();
        const sock = makeWASocket({
            version,
            auth: state,
            logger: P({ level: 'silent' }),
            // ULTRA-ROBUST connection options
            connectTimeoutMs: 120000, // 2 minutes timeout
            keepAliveIntervalMs: 15000, // 15 seconds keep-alive
            retryRequestDelayMs: 1000, // 1 second retry delay
            maxRetries: 10, // More retries
            // Enhanced connection headers
            headers: {
                'User-Agent': 'WhatsApp/2.23.24.78 A',
                'Accept': '*/*',
                'Connection': 'keep-alive'
            },
            // Additional connection options
            browser: ['BIG TENNET Bot', 'Chrome', '1.0.0'],
            syncFullHistory: false,
            fireInitQueries: true,
            shouldIgnoreJid: jid => isJidBroadcast(jid),
            patchMessageBeforeSending: (msg) => {
                const requiresPatch = !!(
                    msg.buttonsMessage ||
                    msg.templateMessage ||
                    msg.listMessage
                );
                if (requiresPatch) {
                    msg = {
                        viewOnceMessage: {
                            message: {
                                messageContextInfo: {
                                    deviceListMetadataVersion: 2,
                                    deviceListMetadata: {},
                                },
                                ...msg,
                            },
                        },
                    };
                }
                return msg;
            },
        });

        // Store sock globally for cleanup
        global.currentSock = sock;

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                // Display QR code in terminal properly
                console.log('Scan this QR code with your WhatsApp:');
                qrcode.generate(qr, { small: true });
            }
            
            if (connection === 'close') {
                isConnected = false;
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    console.log('❌ Connection closed, attempting IMMEDIATE reconnection...');
                    console.log('🔍 Disconnect reason:', lastDisconnect?.error?.output?.statusCode);
                    console.log('🔍 Error details:', lastDisconnect?.error?.message);
                    
                    // Clear keep-alive intervals
                    if (sock.keepAliveIntervals) {
                        sock.keepAliveIntervals.forEach(interval => clearInterval(interval));
                    }
                    
                    // Force immediate reconnection
                    setTimeout(() => {
                        forceReconnection(sock);
                    }, 1000);
                } else {
                    console.log('❌ Connection closed permanently (logged out)');
                    console.log('🔄 Restarting bot in 10 seconds...');
                    setTimeout(() => {
                        startBot(); // Restart instead of exit
                    }, 10000);
                }
            } else if (connection === 'open') {
                isConnected = true;
                connectionStartTime = Date.now();
                lastHeartbeat = Date.now();
                consecutiveFailures = 0; // Reset failure counter
                
                console.log('✅ ULTRA-ROBUST WhatsApp bot is connected and ready!');
                console.log(`👨‍💻 Created by: ${CREATOR_INFO.name}`);
                console.log(`🌐 Website: ${CREATOR_INFO.website}`);
                console.log(`📊 Bot started at: ${new Date().toLocaleString()}`);
                console.log(`🔗 Connection established at: ${new Date().toLocaleString()}`);
                console.log('🛡️ ULTRA-ROBUST mode: ZERO SHUTDOWNS GUARANTEED');
                
                // Reset reconnection attempts on successful connection
                reconnectAttempts = 0;
                
                // Start ultra-robust keep-alive mechanism
                startKeepAlive(sock);
            } else if (connection === 'connecting') {
                console.log('🔄 Connecting to WhatsApp (ULTRA-ROBUST mode)...');
            }
        });
        
        // Add message event handler
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            try {
                console.log(`📨 Messages.upsert event: type=${type}, messages count=${messages.length}`);
                
                if (type !== 'notify') {
                    console.log(`❌ Skipping non-notify message type: ${type}`);
                    return;
                }
                
                for (const msg of messages) {
                    console.log(`📨 Processing message from ${msg.key.remoteJid}`);
                    
                    if (!msg.message) {
                        console.log('❌ No message content');
                        continue;
                    }
                    
                    // Debug: Show bot's own number
                    const botNumber = sock.user?.id?.split(':')[0];
                    console.log(`🤖 Bot number: ${botNumber}`);
                    console.log(`📱 Message from: ${msg.key.remoteJid}`);
                    console.log(`👤 FromMe: ${msg.key.fromMe}`);
                    
                    // Only skip own messages in groups, not in private chats
                    const isGroup = msg.key.remoteJid.endsWith('@g.us');
                    if (msg.key.fromMe && isGroup) {
                        console.log('❌ Skipping own message in group');
                        continue;
                    }
                    
                    // Skip if the message is from the bot's own number (only for groups)
                    if (isGroup && msg.key.remoteJid === `${botNumber}@s.whatsapp.net`) {
                        console.log('❌ Skipping message from bot\'s own number in group');
                        continue;
                    }
                    
                    // Skip status@broadcast messages
                    if (msg.key.remoteJid === 'status@broadcast') {
                        console.log('❌ Skipping status broadcast message');
                        continue;
                    }
                    
                    // Skip system messages and protocol messages
                    const messageTypes = Object.keys(msg.message || {});
                    const systemMessageTypes = ['senderKeyDistributionMessage', 'protocolMessage'];
                    const isSystemMessage = systemMessageTypes.some(type => messageTypes.includes(type));
                    
                    if (isSystemMessage) {
                        console.log('❌ Skipping system/protocol message:', messageTypes);
                        continue;
                    }
                    
                    const chatType = msg.key.remoteJid.endsWith('@g.us') ? 'Group' : 'Private';
                    console.log(`📨 Processing message from ${msg.key.remoteJid} (${chatType})`);
                    console.log(`🔍 Message types found:`, Object.keys(msg.message || {}));
                    
                    // Handle view-once media automatically
                    await handleViewOnceAuto(sock, msg);
                    
                    // Handle regular commands
                    await handleMessage(sock, msg);
                }
            } catch (error) {
                console.error('❌ Error in message handler:', error);
                // Don't let message errors crash the bot
            }
        });
        
    } catch (error) {
        console.error('❌ Error starting bot:', error);
        console.log('🔄 Restarting bot in 5 seconds...');
        setTimeout(() => {
            startBot();
        }, 5000);
    }
}

// --- Game Handlers ---

// Wordle Game
async function handleWordle(sock, msg, guess) {
    const words = ['HELLO', 'WORLD', 'GAMES', 'FUNNY', 'HAPPY', 'SMILE', 'DANCE', 'MUSIC', 'SPORT', 'BOOKS', 'MOVIE', 'STARS', 'OCEAN', 'MOUNTAIN', 'FRIEND', 'FAMILY', 'LOVE', 'PEACE', 'DREAM', 'HOPE'];
    const targetWord = words[Math.floor(Math.random() * words.length)];
    
    if (!guess) {
        return await reply(sock, msg, `🎯 *WORDLE GAME* 🎯\n\n📝 *How to play:*\n• Type !wordle <5-letter word>\n• Green 🟢 = correct letter, correct position\n• Yellow 🟡 = correct letter, wrong position\n• Gray ⚫ = letter not in word\n\n💡 *Example:* !wordle HELLO\n\n🎮 *Ready to play?* Guess a 5-letter word!`);
    }
    
    guess = guess.toUpperCase();
    if (guess.length !== 5) {
        return await reply(sock, msg, '❌ Please enter a 5-letter word!');
    }
    
    if (!/^[A-Z]{5}$/.test(guess)) {
        return await reply(sock, msg, '❌ Please enter only letters!');
    }
    
    let result = '';
    let correct = 0;
    
    for (let i = 0; i < 5; i++) {
        if (guess[i] === targetWord[i]) {
            result += '🟢';
            correct++;
        } else if (targetWord.includes(guess[i])) {
            result += '🟡';
        } else {
            result += '⚫';
        }
    }
    
    if (correct === 5) {
        await reply(sock, msg, `🎉 *CONGRATULATIONS!* 🎉\n\n🎯 You guessed it: *${targetWord}*\n${result}\n\n🏆 *Perfect score!*`);
    } else {
        await reply(sock, msg, `📝 *Wordle Result*\n\n🎯 Your guess: *${guess}*\n🎯 Target: *${targetWord}*\n${result}\n\n💡 Keep trying!`);
    }
}

// Hangman Game
async function handleHangman(sock, msg, guess) {
    const words = ['PYTHON', 'JAVASCRIPT', 'PROGRAMMING', 'COMPUTER', 'ALGORITHM', 'DATABASE', 'NETWORK', 'SECURITY', 'SOFTWARE', 'HARDWARE'];
    const targetWord = words[Math.floor(Math.random() * words.length)];
    const maxAttempts = 6;
    let attempts = 0;
    let guessed = new Set();
    let display = targetWord.split('').map(() => '_').join(' ');
    
    if (!guess) {
        return await reply(sock, msg, `🎯 *HANGMAN GAME* 🎯\n\n📝 *How to play:*\n• Type !hangman <letter>\n• Guess letters to reveal the word\n• You have 6 attempts\n• The word is: ${display}\n\n💡 *Example:* !hangman A\n\n🎮 *Ready to play?* Guess a letter!`);
    }
    
    guess = guess.toUpperCase();
    if (guess.length !== 1 || !/[A-Z]/.test(guess)) {
        return await reply(sock, msg, '❌ Please enter a single letter!');
    }
    
    if (guessed.has(guess)) {
        return await reply(sock, msg, '❌ You already guessed that letter!');
    }
    
    guessed.add(guess);
    
    if (targetWord.includes(guess)) {
        display = targetWord.split('').map(letter => guessed.has(letter) ? letter : '_').join(' ');
        if (!display.includes('_')) {
            await reply(sock, msg, `🎉 *CONGRATULATIONS!* 🎉\n\n🎯 You won! The word was: *${targetWord}*\n${display}\n\n🏆 *Great job!*`);
        } else {
            await reply(sock, msg, `✅ *Correct!*\n\n🎯 Word: ${display}\n📝 Guessed: ${Array.from(guessed).join(', ')}\n💀 Attempts left: ${maxAttempts - attempts}`);
        }
    } else {
        attempts++;
        if (attempts >= maxAttempts) {
            await reply(sock, msg, `💀 *GAME OVER!* 💀\n\n🎯 The word was: *${targetWord}*\n📝 Guessed: ${Array.from(guessed).join(', ')}\n\n😔 Better luck next time!`);
        } else {
            await reply(sock, msg, `❌ *Wrong guess!*\n\n🎯 Word: ${display}\n📝 Guessed: ${Array.from(guessed).join(', ')}\n💀 Attempts left: ${maxAttempts - attempts}`);
        }
    }
}

// Tic Tac Toe Game
async function handleTicTacToe(sock, msg, move) {
    if (!move) {
        return await reply(sock, msg, `🎮 *TIC TAC TOE* 🎮\n\n📝 *How to play:*\n• Type !tictactoe <position>\n• Positions: 1-9 (top-left to bottom-right)\n\n📋 *Board Layout:*\n1 | 2 | 3\n---------\n4 | 5 | 6\n---------\n7 | 8 | 9\n\n💡 *Example:* !tictactoe 5\n\n🎮 *Ready to play?* Choose a position!`);
    }
    
    const position = parseInt(move);
    if (isNaN(position) || position < 1 || position > 9) {
        return await reply(sock, msg, '❌ Please enter a number between 1-9!');
    }
    
    // Simple AI response
    const aiMove = Math.floor(Math.random() * 9) + 1;
    const result = Math.random() > 0.5 ? 'You win!' : 'AI wins!';
    
    await reply(sock, msg, `🎮 *Tic Tac Toe Move*\n\n👤 Your move: Position ${position}\n🤖 AI move: Position ${aiMove}\n\n🏆 *Result:* ${result}\n\n🎮 Play again with !tictactoe <position>`);
}

// Number Guessing Game
async function handleNumberGuess(sock, msg, guess) {
    const targetNumber = Math.floor(Math.random() * 100) + 1;
    
    if (!guess) {
        return await reply(sock, msg, `🎯 *NUMBER GUESSING GAME* 🎯\n\n📝 *How to play:*\n• Type !numberguess <number>\n• Guess a number between 1-100\n• I'll tell you if it's higher or lower\n\n💡 *Example:* !numberguess 50\n\n🎮 *Ready to play?* Guess a number!`);
    }
    
    const userGuess = parseInt(guess);
    if (isNaN(userGuess) || userGuess < 1 || userGuess > 100) {
        return await reply(sock, msg, '❌ Please enter a number between 1-100!');
    }
    
    if (userGuess === targetNumber) {
        await reply(sock, msg, `🎉 *CONGRATULATIONS!* 🎉\n\n🎯 You guessed it: *${targetNumber}*\n\n🏆 *Perfect guess!*`);
    } else if (userGuess < targetNumber) {
        await reply(sock, msg, `📈 *Higher!*\n\n🎯 Your guess: ${userGuess}\n💡 The number is higher than ${userGuess}\n\n🎮 Try again with !numberguess <number>`);
    } else {
        await reply(sock, msg, `📉 *Lower!*\n\n🎯 Your guess: ${userGuess}\n💡 The number is lower than ${userGuess}\n\n🎮 Try again with !numberguess <number>`);
    }
}

// Word Chain Game
async function handleWordChain(sock, msg, word) {
    if (!word) {
        return await reply(sock, msg, `🔗 *WORD CHAIN GAME* 🔗\n\n📝 *How to play:*\n• Type !wordchain <word>\n• I'll give you a word that starts with the last letter of your word\n• Keep the chain going!\n\n💡 *Example:* !wordchain HELLO\n\n🎮 *Ready to play?* Start with any word!`);
    }
    
    const lastLetter = word.slice(-1).toUpperCase();
    const responses = {
        'A': ['APPLE', 'ADVENTURE', 'AMAZING', 'ASTRONAUT'],
        'B': ['BEAUTIFUL', 'BRAVE', 'BRILLIANT', 'BUTTERFLY'],
        'C': ['CREATIVE', 'CLEVER', 'COLORFUL', 'CHALLENGE'],
        'D': ['DREAM', 'DANGEROUS', 'DELICIOUS', 'DETERMINED'],
        'E': ['EXCITING', 'ENERGETIC', 'EXCELLENT', 'ELEPHANT'],
        'F': ['FANTASTIC', 'FRIENDLY', 'FUNNY', 'FREEDOM'],
        'G': ['GREAT', 'GENEROUS', 'GENTLE', 'GARDEN'],
        'H': ['HAPPY', 'HELPFUL', 'HONEST', 'HARMONY'],
        'I': ['IMAGINATIVE', 'INTELLIGENT', 'INTERESTING', 'INSPIRING'],
        'J': ['JOYFUL', 'JUSTICE', 'JOURNEY', 'JEWEL'],
        'K': ['KIND', 'KNOWLEDGE', 'KINDNESS', 'KINGDOM'],
        'L': ['LOVE', 'LUCKY', 'LIGHT', 'LIFE'],
        'M': ['MAGICAL', 'MUSIC', 'MIRACLE', 'MOMENT'],
        'N': ['NICE', 'NATURE', 'NIGHT', 'NEW'],
        'O': ['OUTSTANDING', 'OPPORTUNITY', 'OCEAN', 'OPEN'],
        'P': ['PERFECT', 'PEACE', 'POWER', 'PASSION'],
        'Q': ['QUICK', 'QUIET', 'QUALITY', 'QUEST'],
        'R': ['REMARKABLE', 'RADIO', 'RIVER', 'RAINBOW'],
        'S': ['SPECIAL', 'SUNSHINE', 'SUCCESS', 'STAR'],
        'T': ['TERRIFIC', 'TREASURE', 'TRAVEL', 'TIME'],
        'U': ['UNIQUE', 'UNITED', 'USEFUL', 'UNDERSTAND'],
        'V': ['VICTORY', 'VALUABLE', 'VIBRANT', 'VISION'],
        'W': ['WONDERFUL', 'WISDOM', 'WARM', 'WIND'],
        'X': ['XENIAL', 'XEROX', 'XENON', 'XENOPHOBIC'],
        'Y': ['YOUNG', 'YELLOW', 'YOUTH', 'YEAR'],
        'Z': ['ZEST', 'ZEN', 'ZEBRA', 'ZERO']
    };
    
    const possibleWords = responses[lastLetter] || ['AWESOME', 'BRILLIANT', 'COOL', 'DOPE'];
    const response = possibleWords[Math.floor(Math.random() * possibleWords.length)];
    
    await reply(sock, msg, `🔗 *Word Chain*\n\n📝 Your word: *${word.toUpperCase()}*\n🔤 Last letter: *${lastLetter}*\n🎯 My word: *${response}*\n\n💡 Continue with: !wordchain ${response}`);
}

// Emoji Quiz Game
async function handleEmojiQuiz(sock, msg) {
    const quizzes = [
        { emoji: '🍕🍕🍕', answer: 'PIZZA' },
        { emoji: '🌍🌍🌍', answer: 'EARTH' },
        { emoji: '🎬🎬🎬', answer: 'MOVIE' },
        { emoji: '🎵🎵🎵', answer: 'MUSIC' },
        { emoji: '⚽⚽⚽', answer: 'FOOTBALL' },
        { emoji: '🏠🏠🏠', answer: 'HOME' },
        { emoji: '🚗🚗🚗', answer: 'CAR' },
        { emoji: '🐱🐱🐱', answer: 'CAT' },
        { emoji: '🌺🌺🌺', answer: 'FLOWER' },
        { emoji: '⭐⭐⭐', answer: 'STAR' },
        { emoji: '🌈🌈🌈', answer: 'RAINBOW' },
        { emoji: '🎂🎂🎂', answer: 'BIRTHDAY' },
        { emoji: '💻💻💻', answer: 'COMPUTER' },
        { emoji: '📱📱📱', answer: 'PHONE' },
        { emoji: '🎮🎮🎮', answer: 'GAME' }
    ];
    
    const quiz = quizzes[Math.floor(Math.random() * quizzes.length)];
    
    await reply(sock, msg, `🎯 *EMOJI QUIZ* 🎯\n\n🤔 *Guess the word:*\n${quiz.emoji}\n\n💡 *Hint:* It's a common word\n🎮 *Answer:* ${quiz.answer}\n\n🎯 *How to play:* Just type !emojiquiz for a new quiz!`);
}

// Riddle Game
async function handleRiddle(sock, msg) {
    const riddles = [
        { question: "What has keys, but no locks; space, but no room; and you can enter, but not go in?", answer: "KEYBOARD" },
        { question: "What gets wetter and wetter the more it dries?", answer: "TOWEL" },
        { question: "What has a head and a tail but no body?", answer: "COIN" },
        { question: "What comes once in a minute, twice in a moment, but never in a thousand years?", answer: "LETTER M" },
        { question: "What has cities, but no houses; forests, but no trees; and rivers, but no water?", answer: "MAP" },
        { question: "What is always in front of you but can't be seen?", answer: "FUTURE" },
        { question: "What breaks when you say it?", answer: "SILENCE" },
        { question: "What has legs, but doesn't walk?", answer: "TABLE" },
        { question: "What has one eye, but can't see?", answer: "NEEDLE" },
        { question: "What can travel around the world while sitting in a corner?", answer: "STAMP" }
    ];
    
    const riddle = riddles[Math.floor(Math.random() * riddles.length)];
    
    await reply(sock, msg, `🧩 *RIDDLE TIME* 🧩\n\n🤔 *Riddle:*\n${riddle.question}\n\n💡 *Answer:* ${riddle.answer}\n\n🎯 *How to play:* Type !riddle for a new riddle!`);
}

// Truth or Dare Game
async function handleTruthOrDare(sock, msg) {
    const truths = [
        "What's your biggest fear?",
        "What's the most embarrassing thing that happened to you?",
        "What's your biggest regret?",
        "What's your biggest dream?",
        "What's your biggest secret?",
        "What's your biggest weakness?",
        "What's your biggest strength?",
        "What's your biggest achievement?",
        "What's your biggest failure?",
        "What's your biggest goal?"
    ];
    
    const dares = [
        "Send a voice message singing your favorite song",
        "Send a selfie with a funny face",
        "Send a message in a different language",
        "Send a message using only emojis",
        "Send a message backwards",
        "Send a message in all caps",
        "Send a message in all lowercase",
        "Send a message with numbers instead of letters",
        "Send a message with only vowels",
        "Send a message with only consonants"
    ];
    
    const choice = Math.random() > 0.5 ? 'TRUTH' : 'DARE';
    const question = choice === 'TRUTH' 
        ? truths[Math.floor(Math.random() * truths.length)]
        : dares[Math.floor(Math.random() * dares.length)];
    
    await reply(sock, msg, `🎭 *TRUTH OR DARE* 🎭\n\n🎯 *Your choice:* ${choice}\n\n💬 *${choice}:*\n${question}\n\n🎮 *How to play:* Type !truthordare for a new challenge!`);
}

// Would You Rather Game
async function handleWouldYouRather(sock, msg) {
    const questions = [
        "Would you rather be invisible or be able to fly?",
        "Would you rather be rich and ugly or poor and beautiful?",
        "Would you rather be smart and lonely or stupid and popular?",
        "Would you rather be famous for something bad or unknown for something good?",
        "Would you rather be poor and happy or rich and sad?",
        "Would you rather be able to read minds or see the future?",
        "Would you rather be able to speak all languages or play all instruments?",
        "Would you rather be able to teleport or time travel?",
        "Would you rather be a superhero or a villain?",
        "Would you rather be a cat or a dog?",
        "Would you rather live in the past or the future?",
        "Would you rather be too hot or too cold?",
        "Would you rather be too tall or too short?",
        "Would you rather be too loud or too quiet?",
        "Would you rather be too fast or too slow?"
    ];
    
    const question = questions[Math.floor(Math.random() * questions.length)];
    
    await reply(sock, msg, `🤔 *WOULD YOU RATHER* 🤔\n\n💭 *Question:*\n${question}\n\n💡 *Think about it and share your answer!*\n\n🎮 *How to play:* Type !wouldyourather for a new question!`);
}

// Never Have I Ever Game
async function handleNeverHaveIEver(sock, msg) {
    const statements = [
        "Never have I ever lied to get out of trouble",
        "Never have I ever eaten something that fell on the floor",
        "Never have I ever pretended to be sick to skip work/school",
        "Never have I ever danced in public",
        "Never have I ever sung in the shower",
        "Never have I ever talked to myself",
        "Never have I ever laughed so hard I cried",
        "Never have I ever been late to an important meeting",
        "Never have I ever forgotten someone's name",
        "Never have I ever been embarrassed in public",
        "Never have I ever been scared of the dark",
        "Never have I ever been afraid of heights",
        "Never have I ever been nervous about speaking in public",
        "Never have I ever been excited about a new movie",
        "Never have I ever been sad about a book ending"
    ];
    
    const statement = statements[Math.floor(Math.random() * statements.length)];
    
    await reply(sock, msg, `🙈 *NEVER HAVE I EVER* 🙈\n\n💭 *Statement:*\n${statement}\n\n💡 *If you HAVE done this, type 'I have' or 'Me'*\n💡 *If you HAVEN'T done this, type 'I haven't' or 'Not me'*\n\n🎮 *How to play:* Type !neverhaveiever for a new statement!`);
}

// Typing Game
async function handleTypingGame(sock, msg, userInput) {
    const sentences = [
        "The quick brown fox jumps over the lazy dog.",
        "All work and no play makes Jack a dull boy.",
        "To be or not to be, that is the question.",
        "A journey of a thousand miles begins with a single step.",
        "Practice makes perfect.",
        "Actions speak louder than words.",
        "Better late than never.",
        "Don't judge a book by its cover.",
        "Every cloud has a silver lining.",
        "Fortune favors the bold.",
        "Good things come to those who wait.",
        "Honesty is the best policy.",
        "If at first you don't succeed, try try again.",
        "Knowledge is power.",
        "Life is what happens when you're busy making other plans.",
        "Money can't buy happiness.",
        "No pain, no gain.",
        "Opportunity knocks but once.",
        "Practice what you preach.",
        "Quality over quantity.",
        "Rome wasn't built in a day.",
        "Slow and steady wins the race.",
        "The early bird catches the worm.",
        "United we stand, divided we fall.",
        "When in Rome, do as the Romans do.",
        "You can't teach an old dog new tricks.",
        "A picture is worth a thousand words.",
        "Beauty is in the eye of the beholder.",
        "Curiosity killed the cat.",
        "Don't put all your eggs in one basket."
    ];
    
    if (!userInput) {
        const randomSentence = sentences[Math.floor(Math.random() * sentences.length)];
        return await reply(sock, msg, `⌨️ *TYPING GAME* ⌨️\n\n📝 *Type this sentence exactly:*\n"${randomSentence}"\n\n💡 *How to play:*\n• Copy the sentence exactly as shown\n• Type: !typinggame <your typed text>\n• I'll check your accuracy and speed\n\n🎯 *Ready to test your typing skills?*`);
    }
    
    // Find the target sentence (we'll use a simple approach)
    const targetSentence = sentences[Math.floor(Math.random() * sentences.length)];
    
    // Calculate accuracy
    const maxLength = Math.max(targetSentence.length, userInput.length);
    let correctChars = 0;
    let errors = 0;
    
    for (let i = 0; i < Math.min(targetSentence.length, userInput.length); i++) {
        if (targetSentence[i] === userInput[i]) {
            correctChars++;
        } else {
            errors++;
        }
    }
    
    // Add errors for length differences
    errors += Math.abs(targetSentence.length - userInput.length);
    
    const accuracy = Math.round((correctChars / maxLength) * 100);
    const wpm = Math.round((userInput.length / 5) * 12); // Rough WPM calculation
    
    let feedback = '';
    if (accuracy >= 95) {
        feedback = '🏆 *Excellent typing!*';
    } else if (accuracy >= 85) {
        feedback = '👍 *Good job!*';
    } else if (accuracy >= 70) {
        feedback = '😊 *Not bad!*';
    } else {
        feedback = '💪 *Keep practicing!*';
    }
    
    await reply(sock, msg, `⌨️ *Typing Test Results* ⌨️\n\n📝 *Target:* "${targetSentence}"\n📝 *Your input:* "${userInput}"\n\n📊 *Results:*\n• Accuracy: ${accuracy}%\n• Errors: ${errors}\n• Speed: ~${wpm} WPM\n\n${feedback}\n\n🎮 *Play again:* Type !typinggame for a new sentence!`);
}

// Automatic View-Once Handler
async function handleViewOnceAuto(sock, msg) {
    try {
        // Check if this is a view-once message
        const isViewOnce = !!msg.message?.viewOnceMessageV2;
        
        if (!isViewOnce) return;

        // Get the media type and original message
        const viewOnceContent = msg.message.viewOnceMessageV2.message;
        const mediaType = Object.keys(viewOnceContent)[0];
        const originalMessage = viewOnceContent[mediaType];

        if (!mediaType || !originalMessage) return;

        const chatType = msg.key.remoteJid.endsWith('@g.us') ? 'Group' : 'Private';
        const sender = msg.key.participant || msg.key.remoteJid;
        console.log(`🔍 Detected view-once ${mediaType} from ${sender} (${chatType} chat)`);

        // Download the media using the correct method
        let buffer = null;
        
        try {
            // Use the correct downloadContentFromMessage method
            const stream = await downloadContentFromMessage(originalMessage, mediaType.replace('Message', ''));
            
            buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            
            console.log(`✅ Downloaded view-once ${mediaType}, size: ${buffer.length} bytes`);
        } catch (e) {
            console.log('Failed to download view-once media:', e.message);
        }

        if (!buffer || buffer.length === 0) {
            console.log('❌ Failed to download view-once media');
            return;
        }

        // Convert media type for sending (remove 'Message' suffix)
        const sendType = mediaType.replace('Message', '');
        
        // Create caption
        const caption = `🔓 *View-once ${sendType} unlocked*\n\n💡 *BIG TENNET Bot* made this ${sendType} viewable multiple times!`;

        // Send the media back
        await sock.sendMessage(msg.key.remoteJid, {
            [sendType]: buffer,
            caption: caption
        }, { quoted: msg });

        console.log(`✅ View-once ${sendType} sent back to chat`);

    } catch (error) {
        console.error('View-once auto handler error:', error);
    }
}

// Main message handler
async function handleMessage(sock, msg) {
    try {
        const m = msg.message;
        let text = '';
        
        console.log('🔍 Checking message types:', Object.keys(m));
        console.log('🔍 Full message structure:', JSON.stringify(m, null, 2));
        
        if (m.conversation) {
            text = m.conversation;
            console.log('✅ Found conversation text:', text);
        } else if (m.extendedTextMessage) {
            text = m.extendedTextMessage.text;
            console.log('✅ Found extended text:', text);
        } else if (m.imageMessage && m.imageMessage.caption) {
            text = m.imageMessage.caption;
            console.log('✅ Found image caption:', text);
        } else if (m.videoMessage && m.videoMessage.caption) {
            text = m.videoMessage.caption;
            console.log('✅ Found video caption:', text);
        } else {
            console.log('❌ No text content found in message');
            console.log('🔍 Message structure:', JSON.stringify(m, null, 2));
            return;
        }
        
        console.log(`💬 Text content: "${text}"`);
        
        if (!text.startsWith('!')) {
            console.log('❌ Message does not start with !');
            return;
        }
        const [cmd, ...args] = text.trim().split(/\s+/);
        const argstr = args.join(' ');
        const isGroup = msg.key.remoteJid.endsWith('@g.us');
        
        console.log(`🔧 Processing command: ${cmd} in ${isGroup ? 'Group' : 'Private'} chat`);
        
        // Special debug command that bypasses permissions
        if (cmd.toLowerCase() === '!debugid') {
            console.log('🔍 SPECIAL DEBUG ID command detected!');
            const userId = msg.key.participant || msg.key.remoteJid;
            const sudoData = loadSudoUsers();
            const botOwner = sudoData.bot_owner;
            const globalSudoUsers = sudoData.global_sudo_users;
            
            const debugInfo = `🔍 *SPECIAL DEBUG - ID COMPARISON*\n\n👤 *Your WhatsApp ID:* ${userId}\n👑 *Bot Owner ID:* ${botOwner}\n🔓 *Global Sudo Users:*\n${globalSudoUsers.map(u => `• ${u}`).join('\n')}\n\n🔍 *Exact Comparisons:*\n• Your ID === Bot Owner: ${userId === botOwner}\n• Your ID in Global Sudo: ${globalSudoUsers.includes(userId)}\n• Your ID length: ${userId.length}\n• Bot Owner length: ${botOwner.length}\n\n💡 *This command bypasses permissions for debugging*`;
            await reply(sock, msg, debugInfo);
            return;
        }
        
        // Permission system completely removed - no restrictions
        
        // Add a simple test response for any command
        if (cmd.toLowerCase() === '!ping') {
            console.log('🏓 PING command detected!');
            await reply(sock, msg, '⚡ pong!');
            return;
        }
        
        // Add a simple debug command
        if (cmd.toLowerCase() === '!debug') {
            console.log('🐛 DEBUG command detected!');
            const userId = msg.key.participant || msg.key.remoteJid;
            const sudoData = loadSudoUsers();
            const debugInfo = `🐛 *Debug Info*\n\n📱 *Chat Type:* ${isGroup ? 'Group' : 'Private'}\n👤 *From:* ${msg.key.remoteJid}\n👤 *User ID:* ${userId}\n💬 *Command:* ${cmd}\n🔧 *Args:* ${args.join(', ')}\n⏰ *Time:* ${new Date().toISOString()}\n\n🔐 *Permission Debug:*\n• Bot Owner: ${sudoData.bot_owner}\n• Is Bot Owner: ${isBotOwner(userId)}\n• Is Global Sudo: ${isGlobalSudoUser(userId)}\n• Global Sudo Users: ${sudoData.global_sudo_users.join(', ')}`;
            await reply(sock, msg, debugInfo);
            return;
        }
        
        // Special debug command that bypasses permissions
        if (cmd.toLowerCase() === '!debugid') {
            console.log('🔍 SPECIAL DEBUG ID command detected!');
            const userId = msg.key.participant || msg.key.remoteJid;
            const sudoData = loadSudoUsers();
            const botOwner = sudoData.bot_owner;
            const globalSudoUsers = sudoData.global_sudo_users;
            
            const debugInfo = `🔍 *SPECIAL DEBUG - ID COMPARISON*\n\n👤 *Your WhatsApp ID:* ${userId}\n👑 *Bot Owner ID:* ${botOwner}\n🔓 *Global Sudo Users:*\n${globalSudoUsers.map(u => `• ${u}`).join('\n')}\n\n🔍 *Exact Comparisons:*\n• Your ID === Bot Owner: ${userId === botOwner}\n• Your ID in Global Sudo: ${globalSudoUsers.includes(userId)}\n• Your ID length: ${userId.length}\n• Bot Owner length: ${botOwner.length}\n\n💡 *This command bypasses permissions for debugging*`;
            await reply(sock, msg, debugInfo);
            return;
        }
        
        // Antispam check (only if enabled and in group)
        if (isGroup && antispamSettings[msg.key.remoteJid]) {
            const user = msg.key.participant || msg.key.remoteJid;
            if (!antispamTracker[msg.key.remoteJid]) antispamTracker[msg.key.remoteJid] = {};
            if (!antispamTracker[msg.key.remoteJid][user]) antispamTracker[msg.key.remoteJid][user] = [];
            const now = Date.now();
            antispamTracker[msg.key.remoteJid][user] = antispamTracker[msg.key.remoteJid][user].filter(ts => now - ts < SPAM_WINDOW);
            antispamTracker[msg.key.remoteJid][user].push(now);
            if (antispamTracker[msg.key.remoteJid][user].length > SPAM_THRESHOLD) {
                try {
                    // Remove the user from the group
                    await sock.groupParticipantsUpdate(msg.key.remoteJid, [user], "remove");
                    await reply(sock, msg, `🚨 *Anti-Spam Action!* 🚨\n\n👤 User <@${user.split('@')[0]}> has been *REMOVED* from the group for spamming.\n\n⚠️ *Reason:* Sending too many messages too quickly\n\n🛡️ *Protection:* Antispam system activated`);
                } catch (kickError) {
                    console.error('Failed to remove spammer:', kickError);
                    await reply(sock, msg, `🚨 *Anti-Spam Alert!* 🚨\nHey <@${user.split('@')[0]}>! Please slow down, you are sending messages too quickly. Let's keep the chat friendly!`);
                }
                // Clear their tracker
                antispamTracker[msg.key.remoteJid][user] = [];
                return;
            }
        }

        // Antilink check (only if enabled and in group)
        if (isGroup && antilinkSettings[msg.key.remoteJid]) {
            const user = msg.key.participant || msg.key.remoteJid;
            const hasLink = LINK_PATTERNS.some(pattern => pattern.test(text));
            
            if (hasLink) {
                try {
                    // Remove the user from the group
                    await sock.groupParticipantsUpdate(msg.key.remoteJid, [user], "remove");
                    await reply(sock, msg, `🚫 *Anti-Link Action!* 🚫\n\n👤 User <@${user.split('@')[0]}> has been *REMOVED* from the group for sharing links.\n\n⚠️ *Reason:* Links are not allowed in this group\n\n🛡️ *Protection:* Antilink system activated\n\n💡 *Note:* Admins can use !antilink off to disable this feature`);
                } catch (kickError) {
                    console.error('Failed to remove link sharer:', kickError);
                    await reply(sock, msg, `🚫 *Anti-Link Warning!* 🚫\n\n👤 Hey <@${user.split('@')[0]}>! Links are not allowed in this group.\n\n⚠️ *Next violation will result in removal.*`);
                }
                return;
            }
        }
        
        console.log(`🎯 About to process command: ${cmd.toLowerCase()}`);
        
        switch (cmd.toLowerCase()) {
            case '!ping':
                console.log('🏓 PING case triggered!');
                await reply(sock, msg, `${BOT_STYLES.header}🏓 *PING PONG*\n${BOT_STYLES.divider}\n\n⚡ *Status:* Online & Responsive\n🕒 *Response Time:* Instant\n🔧 *Bot Status:* Working Perfectly\n\n💫 *Server:* BIG TENNET Bot Server${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
                break;
            case '!debug':
                console.log('🐛 DEBUG case triggered!');
                const debugInfo = `${BOT_STYLES.header}🐛 *DEBUG INFORMATION*\n${BOT_STYLES.divider}\n\n📱 *Chat Type:* ${isGroup ? 'Group' : 'Private'}\n👤 *From:* ${msg.key.remoteJid}\n💬 *Command:* ${cmd}\n🔧 *Args:* ${args.join(', ')}\n⏰ *Time:* ${new Date().toISOString()}\n\n🎨 *Sticker Status:* Ready\n🔓 *View-Once Status:* Ready\n🛡️ *Anti-Spam:* Active\n🚫 *Anti-Link:* Active${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
                await reply(sock, msg, debugInfo);
                break;
            case '!help':
                const currentChatType = msg.key.remoteJid.endsWith('@g.us') ? 'Group' : 'Private';
                if (args[0]) {
                    // Help for specific command
                    const commandHelp = formatCommandHelp(args[0]);
                    if (commandHelp) {
                        await reply(sock, msg, commandHelp);
                    } else {
                        await reply(sock, msg, `${BOT_STYLES.header}❌ *COMMAND NOT FOUND*\n${BOT_STYLES.divider}\n\nThe command \`${args[0]}\` was not found.\n\n💡 Type \`!list\` to see all available commands.\n💡 Type \`!help\` for general help.${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
                    }
                } else {
                    // General help
                    const categories = [...new Set(Object.values(COMMAND_DOCS).map(doc => doc.category))];
                    const categoryList = categories.map(cat => `• \`${cat}\` - ${Object.values(COMMAND_DOCS).filter(doc => doc.category === cat).length} commands`).join('\n');
                    
                    await reply(sock, msg, `${BOT_STYLES.header}🤖 *BIG TENNET WHATSAPP BOT*\n${BOT_STYLES.divider}\n\n📱 *Current Chat:* ${currentChatType}\n📋 Type \`!list\` to see all available commands\n💡 For help on a command, type \`!help <command>\`\n\n🔓 *View-Once Feature*: The bot automatically unlocks view-once media!\n🎨 *Sticker Feature*: Reply to any image/video with \`!sticker\`\n🎮 *Games*: Try \`!wordle\`, \`!typinggame\`, \`!hangman\`, and more!\n🛡️ *Group Protection*: Use \`!antispam\` and \`!antilink\`\n\n📂 *Command Categories:*\n${categoryList}\n\n✅ *All commands work in private chats*\n🔧 *Group commands only work in groups*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
                }
                break;
            case '!creator':
                await reply(sock, msg, `${BOT_STYLES.header}🤖 *${CREATOR_INFO.name} WHATSAPP BOT*\n${BOT_STYLES.divider}\n\n👨‍💻 *Creator:* BIG TENNET\n📱 *Instagram:* @${CREATOR_INFO.ig}\n🎵 *TikTok:* @${CREATOR_INFO.tiktok}\n🌐 *Website:* ${CREATOR_INFO.website}\n\n💫 *Features:*\n• 50+ Commands\n• View-Once Unlocking\n• Sticker Creation\n• Multiplayer Games\n• Group Management\n• Anti-Spam Protection\n\n🔥 *Made with ❤️ by BIG TENNET*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
                break;
            case '!time':
                await reply(sock, msg, `${BOT_STYLES.header}🕒 *CURRENT TIME*\n${BOT_STYLES.divider}\n\n⏰ *Server Time:* ${new Date().toLocaleString()}\n🌍 *Timezone:* Server Local Time\n📅 *Date:* ${new Date().toDateString()}\n\n💫 *Time Format:* DD/MM/YYYY HH:MM:SS${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
                break;
            case '!datediff':
                await handleDateDiff(sock, msg, args[0], args[1]);
                break;
            case '!timein':
                await handleTimeIn(sock, msg, argstr);
                break;
            case '!shorten':
                await handleShorten(sock, msg, argstr);
                break;
            case '!tempmail':
                await handleTempMail(sock, msg);
                break;
            case '!color':
                await handleColor(sock, msg, argstr);
                break;
            case '!password':
                await handlePassword(sock, msg, args[0]);
                break;
            case '!motivate':
                await handleMotivate(sock, msg);
                break;
            case '!joke':
                await handleJoke(sock, msg);
                break;
            case '!quote':
                await handleQuote(sock, msg);
                break;
            case '!trivia':
                await handleTrivia(sock, msg);
                break;
            case '!weather':
                await handleWeather(sock, msg, argstr);
                break;
            case '!country':
                await handleCountry(sock, msg, argstr);
                break;
            case '!coin':
                const coinResult = Math.random() < 0.5 ? 'Heads' : 'Tails';
                const coinEmoji = coinResult === 'Heads' ? '🪙' : '🪙';
                await reply(sock, msg, `${BOT_STYLES.header}🪙 *COIN FLIP*\n${BOT_STYLES.divider}\n\n${coinEmoji} *Result:* ${coinResult.toUpperCase()}\n🎲 *Random:* Fair & Unbiased\n\n💫 *Flip again with:* \`!coin\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
                break;
            case '!crypto':
                await handleCrypto(sock, msg, argstr);
                break;
            case '!reverse':
                if (!argstr) return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!reverse <text>\`\n🎯 *Example:* \`!reverse Hello World\`\n\n💫 *This command reverses any text you provide*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
                const reversedText = argstr.split('').reverse().join('');
                await reply(sock, msg, `${BOT_STYLES.header}🔄 *TEXT REVERSER*\n${BOT_STYLES.divider}\n\n📝 *Original:* ${argstr}\n🔄 *Reversed:* ${reversedText}\n\n💫 *Reverse anything with:* \`!reverse <text>\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
                break;
            case '!rps':
                await handleRPS(sock, msg, args[0]);
                break;
            case '!textart':
                await handleTextArt(sock, msg, argstr);
                break;
            case '!poll':
                await handlePoll(sock, msg, argstr);
                break;
            case '!vote':
                await handleVote(sock, msg, args[0]);
                break;
            case '!xp':
                await handleXP(sock, msg);
                break;
            case '!rank':
                await handleRank(sock, msg);
                break;
            case '!define':
                await handleDefine(sock, msg, argstr);
                break;
            case '!binary':
                await handleBinary(sock, msg, argstr);
                break;
            case '!unbinary':
                await handleUnbinary(sock, msg, argstr);
                break;
            case '!emoji':
                await handleEmoji(sock, msg, argstr);
                break;
            case '!countdown':
                await handleCountdown(sock, msg, args[0]);
                break;
            case '!bible':
                await handleBible(sock, msg);
                break;
            case '!fact':
                await handleFact(sock, msg);
                break;
            case '!wordday':
                await handleWordDay(sock, msg);
                break;
            case '!list':
                const listChatType = msg.key.remoteJid.endsWith('@g.us') ? 'Group' : 'Private';
                if (args[0]) {
                    // List commands by category
                    const category = args[0].charAt(0).toUpperCase() + args[0].slice(1).toLowerCase();
                    const categoryHelp = formatCategoryHelp(category);
                    if (categoryHelp) {
                        await reply(sock, msg, categoryHelp);
                    } else {
                        await reply(sock, msg, `${BOT_STYLES.header}❌ *CATEGORY NOT FOUND*\n${BOT_STYLES.divider}\n\nThe category \`${args[0]}\` was not found.\n\n💡 Available categories:\n${[...new Set(Object.values(COMMAND_DOCS).map(doc => doc.category))].map(cat => `• \`${cat}\``).join('\n')}${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
                    }
                } else {
                    // List all commands with categories
                    const categories = [...new Set(Object.values(COMMAND_DOCS).map(doc => doc.category))];
                    let commandList = `${BOT_STYLES.header}📋 *AVAILABLE COMMANDS* (${listChatType} Chat)\n${BOT_STYLES.divider}\n\n`;
                    
                    categories.forEach(category => {
                        const categoryCommands = Object.entries(COMMAND_DOCS)
                            .filter(([cmd, doc]) => doc.category === category)
                            .map(([cmd, doc]) => `• \`${cmd}\` - ${doc.description}`)
                            .join('\n');
                        
                        commandList += `📂 *${category.toUpperCase()}*\n${categoryCommands}\n\n`;
                    });
                    
                    commandList += `💡 *Usage Tips:*\n• Type \`!help <command>\` for detailed help\n• Type \`!list <category>\` to see commands by category\n• Group commands only work in groups${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
                    
                    await reply(sock, msg, commandList);
                }
                break;
            case '!catfact':
                await handleCatFact(sock, msg);
                break;
            case '!dogfact':
                await handleDogFact(sock, msg);
                break;
            case '!remind':
                await handleRemind(sock, msg, args[0], args.slice(1).join(' '));
                break;
            case '!uuid':
                await handleUUID(sock, msg);
                break;
            case '!roll':
                await handleRoll(sock, msg, args[0]);
                break;
            case '!palindrome':
                await handlePalindrome(sock, msg, args.join(' '));
                break;
            case '!capitalize':
                await handleCapitalize(sock, msg, args.join(' '));
                break;
            case '!echo':
                if (!args.length) return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!echo <text>\`\n🎯 *Example:* \`!echo Hello everyone!\`\n\n💫 *This command makes the bot repeat your message*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
                const echoText = args.join(' ');
                await reply(sock, msg, `${BOT_STYLES.header}📢 *ECHO*\n${BOT_STYLES.divider}\n\n${echoText}\n\n💫 *Echo anything with:* \`!echo <text>\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
                break;
            case '!vv':
                const vvChatType = msg.key.remoteJid.endsWith('@g.us') ? 'Group' : 'Private';
                console.log(`🔓 !vv command triggered in ${vvChatType} chat by ${msg.key.participant || msg.key.remoteJid}`);
                await handleViewOnceUnlock(sock, msg);
                break;
            case '!viewonce':
                const viewOnceChatType = msg.key.remoteJid.endsWith('@g.us') ? 'Group' : 'Private';
                await reply(sock, msg, `${BOT_STYLES.header}🔓 *VIEW-ONCE UNLOCKER*\n${BOT_STYLES.divider}\n\nThe bot automatically unlocks view-once media!\n\n📱 *How it works:*\n• Send any view-once image/video to the bot\n• The bot will automatically capture and repost it\n• Now you can view it multiple times!\n\n💡 *Supported media:*\n• Images (view-once) ✅\n• Videos (view-once) ✅\n• Voice notes (view-once) ✅\n\n🎯 *Works in:*\n• Private chats ✅\n• Group chats ✅\n\n📊 *Current chat type:* ${viewOnceChatType}\n\n💫 *Never lose important media again!*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
                break;
            case '!test':
                const testChatType = msg.key.remoteJid.endsWith('@g.us') ? 'Group' : 'Private';
                await reply(sock, msg, `${BOT_STYLES.header}✅ *BOT TEST SUCCESSFUL*\n${BOT_STYLES.divider}\n\n📱 *Chat Type:* ${testChatType}\n🔧 *Bot Status:* Working Perfectly\n💬 *Commands:* All Available\n🔓 *View-Once:* Ready to Unlock Media\n🎨 *Sticker:* Ready to Create\n\n🎯 *Features Status:*\n• Entertainment Commands ✅\n• View-Once Unlocking ✅\n• Utility Commands ✅\n• Group Management ✅\n• Anti-Spam Protection ✅\n• Anti-Link Protection ✅\n\n💫 *All Systems Operational*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
                break;
            case '!sticker':
                console.log('🎨 !sticker command detected!');
                await handleSticker(sock, msg);
                break;
            // Group-only commands
            case '!tagall':
                if (!isGroup) return await reply(sock, msg, 'This command only works in groups.');
                await handleTagAll(sock, msg);
                break;
            case '!kick':
                if (!isGroup) return await reply(sock, msg, 'This command only works in groups.');
                await handleKick(sock, msg, args[0]);
                break;
            case '!add':
                if (!isGroup) return await reply(sock, msg, 'This command only works in groups.');
                await handleAdd(sock, msg, args[0]);
                break;
            case '!promote':
                if (!isGroup) return await reply(sock, msg, 'This command only works in groups.');
                await handlePromote(sock, msg, args[0]);
                break;
            case '!demote':
                if (!isGroup) return await reply(sock, msg, 'This command only works in groups.');
                await handleDemote(sock, msg, args[0]);
                break;
            case '!ban':
                if (!isGroup) return await reply(sock, msg, 'This command only works in groups.');
                await handleBan(sock, msg, args[0]);
                break;
            case '!unban':
                if (!isGroup) return await reply(sock, msg, 'This command only works in groups.');
                await handleUnban(sock, msg, args[0]);
                break;
            case '!groupinfo':
                if (!isGroup) return await reply(sock, msg, 'This command only works in groups.');
                await handleGroupInfo(sock, msg);
                break;
            case '!setdesc':
                if (!isGroup) return await reply(sock, msg, 'This command only works in groups.');
                await handleSetDesc(sock, msg, argstr);
                break;
            case '!setname':
                if (!isGroup) return await reply(sock, msg, 'This command only works in groups.');
                await handleSetName(sock, msg, argstr);
                break;
            case '!antispam':
                if (!isGroup) return await reply(sock, msg, 'This command only works in groups.');
                await handleAntispamCommand(sock, msg, args[0]);
                break;
            case '!antilink':
                if (!isGroup) return await reply(sock, msg, 'This command only works in groups.');
                await handleAntilinkCommand(sock, msg, args[0]);
                break;
            // Sudo commands
            case '!addsudo':
                await handleAddSudo(sock, msg, args[0]);
                break;
            case '!removesudo':
                await handleRemoveSudo(sock, msg, args[0]);
                break;
            case '!listsudo':
                await handleListSudo(sock, msg);
                break;
                
            case '!addmyids':
                await handleAddMyIds(sock, msg);
                break;
            case '!owner':
                const ownerUserId = msg.key.participant || msg.key.remoteJid;
                const sudoData = loadSudoUsers();
                const groupId = isGroup ? msg.key.remoteJid : null;
                
                if (isBotOwner(ownerUserId)) {
                    await reply(sock, msg, `${BOT_STYLES.header}👑 *BOT OWNER INFO*\n${BOT_STYLES.divider}\n\n✅ *You are the bot owner!*\n📱 *Your ID:* ${ownerUserId}\n🔐 *Permissions:* Full access to all commands\n\n💫 *You can:*\n• Add/remove global sudo users\n• Use all bot commands\n• Manage bot permissions\n• Access all groups\n\n📊 *Current Status:*\n• Global Sudo Users: ${sudoData.global_sudo_users.length}\n• Group Sudo Groups: ${Object.keys(sudoData.group_sudo_users).length}${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
                } else if (isGlobalSudoUser(ownerUserId)) {
                    await reply(sock, msg, `${BOT_STYLES.header}🔓 *GLOBAL SUDO USER INFO*\n${BOT_STYLES.divider}\n\n✅ *You are a global sudo user!*\n📱 *Your ID:* ${ownerUserId}\n🔐 *Permissions:* Admin access in all groups\n\n💫 *You can:*\n• Use admin commands in all groups\n• Access all bot features\n• Manage groups you're admin in\n\n👑 *Bot Owner:* ${sudoData.bot_owner}${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
                } else if (isGroup && isGroupSudoUser(ownerUserId, groupId)) {
                    await reply(sock, msg, `${BOT_STYLES.header}📊 *GROUP SUDO USER INFO*\n${BOT_STYLES.divider}\n\n✅ *You are a group sudo user!*\n📱 *Your ID:* ${ownerUserId}\n🔐 *Permissions:* Admin access in this group\n\n💫 *You can:*\n• Use admin commands in this group\n• Access bot features in this group\n\n👑 *Bot Owner:* ${sudoData.bot_owner}${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
                } else {
                    await reply(sock, msg, `${BOT_STYLES.header}👑 *BOT OWNER INFO*\n${BOT_STYLES.divider}\n\n❌ *You are not authorized*\n📱 *Your ID:* ${ownerUserId}\n🔐 *Bot Owner:* ${sudoData.bot_owner}\n\n💡 *Contact:* ${CREATOR_INFO.name}\n📱 Instagram: @${CREATOR_INFO.ig}${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
                }
                break;
            // Game commands
            case '!wordle':
                await handleWordle(sock, msg, args[0]);
                break;
            case '!hangman':
                await handleHangman(sock, msg, args[0]);
                break;
            case '!tictactoe':
                await handleTicTacToe(sock, msg, args[0]);
                break;
            case '!numberguess':
                await handleNumberGuess(sock, msg, args[0]);
                break;
            case '!wordchain':
                await handleWordChain(sock, msg, argstr);
                break;
            case '!emojiquiz':
                await handleEmojiQuiz(sock, msg);
                break;
            case '!riddle':
                await handleRiddle(sock, msg);
                break;
            case '!truthordare':
                await handleTruthOrDare(sock, msg);
                break;
            case '!wouldyourather':
                await handleWouldYouRather(sock, msg);
                break;
            case '!neverhaveiever':
                await handleNeverHaveIEver(sock, msg);
                break;
            case '!typinggame':
                await handleTypingGame(sock, msg, argstr);
                break;
                
            // === NEW FREE API FEATURES ===
            
            // Entertainment Features
            case '!movie':
                await handleMovie(sock, msg, argstr);
                break;
            case '!tvshow':
                await handleTVShow(sock, msg, argstr);
                break;
            case '!anime':
                await handleAnime(sock, msg, argstr);
                break;
                
            // Geography & Travel Features
            case '!city':
                await handleCity(sock, msg, argstr);
                break;
            case '!timezone':
                await handleTimezone(sock, msg, argstr);
                break;
            case '!currency':
                await handleCurrency(sock, msg, args[0], args[1], args[2]);
                break;
                
            // Music Features
            case '!lyrics':
                await handleLyrics(sock, msg, argstr);
                break;
                
            // Education Features
            case '!wiki':
                await handleWiki(sock, msg, argstr);
                break;
            case '!calc':
                await handleCalc(sock, msg, argstr);
                break;
                
            // Creative Features
            case '!colorpalette':
                await handleColorPalette(sock, msg, argstr);
                break;
            case '!emojimeaning':
                await handleEmojiMeaning(sock, msg, argstr);
                break;
                
            // Health & Fitness Features
            case '!bmi':
                await handleBMI(sock, msg, args[0], args[1]);
                break;
                
            // Productivity Features
            case '!pomodoro':
                await handlePomodoro(sock, msg);
                break;
                
            // Fun Games Features
            case '!dadjoke':
                await handleDadJoke(sock, msg);
                break;
            case '!riddle':
                await handleRiddle(sock, msg);
                break;
                
            // Data Analytics Features
            case '!cryptoprice':
                await handleCryptoPrice(sock, msg, argstr);
                break;
                
            // Developer Tools
            case '!format':
                await handleCodeFormat(sock, msg, argstr);
                break;
            case '!hash':
                await handleHash(sock, msg, argstr);
                break;
                
            // Special Features
            case '!horoscope':
                await handleHoroscope(sock, msg, argstr);
                break;
            case '!petfact':
                await handlePetFact(sock, msg);
                break;
                
            // === ADVANCED LOGICAL FEATURES ===

            // === AI & MACHINE LEARNING FEATURES ===
            case '!neural':
                await handleNeuralNetwork(sock, msg, argstr);
                break;
            case '!deeplearn':
                await handleDeepLearning(sock, msg, argstr);
                break;
            case '!vision':
                await handleComputerVision(sock, msg, argstr);
                break;

            // === SPACE & ASTRONOMY FEATURES ===
            case '!planet':
                await handlePlanet(sock, msg, argstr);
                break;
            case '!star':
                await handleStar(sock, msg, argstr);
                break;

            // === QUANTUM COMPUTING FEATURES ===
            case '!quantum':
                await handleQuantumCircuit(sock, msg, argstr);
                break;
            case '!qubit':
                await handleQubit(sock, msg, argstr);
                break;

            // === PREDICTIVE LOGIC FEATURES ===
            case '!predict':
                await handlePredict(sock, msg, argstr.split(' ')[0], argstr.split(' ').slice(1).join(' '));
                break;

            // === ADVANCED ANALYTICS FEATURES ===
            case '!bigdata':
                await handleBigData(sock, msg, argstr);
                break;
            case '!realtime':
                await handleRealtime(sock, msg, argstr);
                break;

            // === CRYPTOGRAPHY FEATURES ===
            case '!encrypt':
                await handleEncrypt(sock, msg, argstr);
                break;
            case '!decrypt':
                await handleDecrypt(sock, msg, argstr);
                break;

            // === GENETIC & BIOLOGICAL FEATURES ===
            case '!dna':
                await handleDNA(sock, msg, argstr);
                break;

            // === ENGINEERING FEATURES ===
            case '!structure':
                await handleStructure(sock, msg, argstr);
                break;

            // === COGNITIVE SCIENCE FEATURES ===
            case '!brain':
                await handleBrain(sock, msg, argstr);
                break;

            // === ENVIRONMENTAL FEATURES ===
            case '!climate':
                await handleClimate(sock, msg, argstr);
                break;

            // === MEDICAL FEATURES ===
            case '!symptom':
                await handleSymptom(sock, msg, argstr);
                break;

            // === FUTURISTIC FEATURES ===
            case '!timetravel':
                await handleTimeTravel(sock, msg, argstr);
                break;

            // === TOOL COMMANDS ===
            case '!json':
                await handleJson(sock, msg, argstr);
                break;
            case '!base64':
                await handleBase64(sock, msg, argstr.split(' ')[0], argstr.split(' ')[1]);
                break;
            case '!url':
                await handleUrl(sock, msg, argstr.split(' ')[0], argstr.split(' ')[1]);
                break;
            case '!uuid':
                await handleUuid(sock, msg);
                break;
            case '!timestamp':
                await handleTimestamp(sock, msg);
                break;
            case '!qrcode':
                await handleQrcode(sock, msg, argstr);
                break;
            case '!md5':
                await handleHashTool(sock, msg, 'md5', argstr);
                break;
            case '!sha1':
                await handleHashTool(sock, msg, 'sha1', argstr);
                break;
            case '!sha256':
                await handleHashTool(sock, msg, 'sha256', argstr);
                break;

            // === ADDITIONAL TOOL COMMANDS ===
            case '!ip':
                await tools.handleIp(sock, msg, argstr);
                break;
            case '!dns':
                await tools.handleDns(sock, msg, argstr);
                break;
            case '!headers':
                await tools.handleHeaders(sock, msg, argstr);
                break;
            case '!pingurl':
                await tools.handlePingUrl(sock, msg, argstr);
                break;
            case '!colorinfo':
                await tools.handleColorInfo(sock, msg, argstr);
                break;
            case '!font':
                await tools.handleFont(sock, msg, args[0], args.slice(1).join(' '));
                break;
            case '!ascii':
                await tools.handleAscii(sock, msg, argstr);
                break;
            case '!remindme':
                await tools.handleRemindMe(sock, msg, args[0], args.slice(1).join(' '));
                break;
            case '!todo':
                await tools.handleTodo(sock, msg, argstr);
                break;
            case '!note':
                await tools.handleNote(sock, msg, argstr);
                break;
            case '!unit':
                await tools.handleUnit(sock, msg, args[0], args[1], args[2]);
                break;
            case '!whois':
                await tools.handleWhois(sock, msg, argstr);
                break;

            default:
                // Unknown command
                break;
        }
    } catch (e) {
        await reply(sock, msg, '❌ Error: ' + e.message);
    }
}

// --- Command Handlers ---

async function handleMotivate(sock, msg) {
    // Use type.fit API (no key)
    try {
        const res = await fetch('https://type.fit/api/quotes');
        const quotes = await res.json();
        const q = quotes[Math.floor(Math.random() * quotes.length)];
        await reply(sock, msg, `${BOT_STYLES.header}💪 *MOTIVATIONAL QUOTE*\n${BOT_STYLES.divider}\n\n"${q.text}"\n\n👤 *Author:* ${q.author || 'Unknown'}\n\n💫 *Stay motivated with:* \`!motivate\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    } catch {
        await reply(sock, msg, `${BOT_STYLES.header}❌ *ERROR*\n${BOT_STYLES.divider}\n\nCould not fetch a motivational quote.\n\n💫 *Try again with:* \`!motivate\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handleJoke(sock, msg) {
    try {
        const res = await fetch('https://official-joke-api.appspot.com/random_joke');
        const joke = await res.json();
        await reply(sock, msg, `${BOT_STYLES.header}😄 *RANDOM JOKE*\n${BOT_STYLES.divider}\n\n${joke.setup}\n\n${joke.punchline}\n\n💫 *Get another joke with:* \`!joke\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    } catch {
        await reply(sock, msg, `${BOT_STYLES.header}❌ *ERROR*\n${BOT_STYLES.divider}\n\nCould not fetch a joke.\n\n💫 *Try again with:* \`!joke\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handleQuote(sock, msg) {
    try {
        // Try multiple quote APIs for better reliability
        const quoteApis = [
            'https://api.quotable.io/random',
            'https://zenquotes.io/api/random',
            'https://api.goprogram.ai/inspiration'
        ];
        
        let quoteData = null;
        let error = null;
        
        for (const api of quoteApis) {
            try {
                const res = await fetch(api);
                const data = await res.json();
                
                if (api.includes('quotable.io')) {
                    quoteData = { text: data.content, author: data.author };
                } else if (api.includes('zenquotes.io')) {
                    quoteData = { text: data[0].q, author: data[0].a };
                } else if (api.includes('goprogram.ai')) {
                    quoteData = { text: data.quote, author: data.author };
                }
                
                if (quoteData && quoteData.text) break;
            } catch (e) {
                error = e;
                continue;
            }
        }
        
        if (quoteData && quoteData.text) {
            await reply(sock, msg, `${BOT_STYLES.header}💭 *INSPIRATIONAL QUOTE*\n${BOT_STYLES.divider}\n\n"${quoteData.text}"\n\n👤 *Author:* ${quoteData.author || 'Unknown'}\n\n💫 *Get another quote with:* \`!quote\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        } else {
            // Fallback to hardcoded quotes
            const fallbackQuotes = [
                { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
                { text: "Life is what happens when you're busy making other plans.", author: "John Lennon" },
                { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
                { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
                { text: "The only limit to our realization of tomorrow is our doubts of today.", author: "Franklin D. Roosevelt" }
            ];
            const randomQuote = fallbackQuotes[Math.floor(Math.random() * fallbackQuotes.length)];
            
            await reply(sock, msg, `${BOT_STYLES.header}💭 *INSPIRATIONAL QUOTE*\n${BOT_STYLES.divider}\n\n"${randomQuote.text}"\n\n👤 *Author:* ${randomQuote.author}\n\n💫 *Get another quote with:* \`!quote\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
    } catch (error) {
        await reply(sock, msg, `${BOT_STYLES.header}❌ *ERROR*\n${BOT_STYLES.divider}\n\nCould not fetch a quote.\n\n💫 *Try again with:* \`!quote\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handleTrivia(sock, msg) {
    try {
        const res = await fetch('https://opentdb.com/api.php?amount=1&type=multiple');
        const data = await res.json();
        const q = data.results[0];
        const options = [...q.incorrect_answers, q.correct_answer].sort(() => Math.random() - 0.5);
        await reply(sock, msg, `${BOT_STYLES.header}❓ *TRIVIA QUESTION*\n${BOT_STYLES.divider}\n\n${q.question.replace(/&quot;/g, '"').replace(/&#039;/g, "'")}\n\n${options.map((o, i) => `${i+1}. ${o}`).join('\n')}\n\n💫 *Get another trivia with:* \`!trivia\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    } catch {
        await reply(sock, msg, `${BOT_STYLES.header}❌ *ERROR*\n${BOT_STYLES.divider}\n\nCould not fetch trivia.\n\n💫 *Try again with:* \`!trivia\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handleWeather(sock, msg, city) {
    if (!city) return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!weather <city>\`\n🎯 *Example:* \`!weather New York\`\n\n💫 *Get current weather information for any city*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    try {
        const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=3`);
        const txt = await res.text();
        await reply(sock, msg, `${BOT_STYLES.header}🌤️ *WEATHER INFORMATION*\n${BOT_STYLES.divider}\n\n${txt}\n\n💫 *Check another city with:* \`!weather <city>\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    } catch {
        await reply(sock, msg, `${BOT_STYLES.header}❌ *ERROR*\n${BOT_STYLES.divider}\n\nCould not fetch weather for ${city}.\n\n💫 *Try again with:* \`!weather <city>\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handleRPS(sock, msg, userMove) {
    const moves = ['rock', 'paper', 'scissors'];
    if (!userMove || !moves.includes(userMove.toLowerCase())) {
        return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!rps <rock|paper|scissors>\`\n🎯 *Example:* \`!rps rock\`\n\n💫 *Play Rock, Paper, Scissors against the bot*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
    const botMove = moves[Math.floor(Math.random() * 3)];
    let result = '';
    if (userMove === botMove) result = '🤝 Draw!';
    else if (
        (userMove === 'rock' && botMove === 'scissors') ||
        (userMove === 'paper' && botMove === 'rock') ||
        (userMove === 'scissors' && botMove === 'paper')
    ) result = '🎉 You win!';
    else result = '🤖 Bot wins!';
    
    const moveEmojis = { rock: '🪨', paper: '📄', scissors: '✂️' };
    
    await reply(sock, msg, `${BOT_STYLES.header}🎮 *ROCK PAPER SCISSORS*\n${BOT_STYLES.divider}\n\n👤 *You:* ${moveEmojis[userMove]} ${userMove.toUpperCase()}\n🤖 *Bot:* ${moveEmojis[botMove]} ${botMove.toUpperCase()}\n\n🏆 *Result:* ${result}\n\n💫 *Play again with:* \`!rps <rock|paper|scissors>\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
}

async function handleTextArt(sock, msg, text) {
    if (!text) return await reply(sock, msg, 'Usage: !textart <text>');
    try {
        const res = await fetch(`https://artii.herokuapp.com/make?text=${encodeURIComponent(text)}`);
        const art = await res.text();
        await reply(sock, msg, '```\n' + art + '\n```');
    } catch {
        await reply(sock, msg, 'Could not generate ASCII art.');
    }
}

// --- Poll System ---
async function handlePoll(sock, msg, question) {
    if (!question) return await reply(sock, msg, 'Usage: !poll <question>');
    const db = loadDB();
    const pollId = msg.key.remoteJid + '_latest';
    db.polls[pollId] = {
        question,
        options: ['Yes', 'No', 'Maybe'],
        votes: {},
        created: Date.now(),
        creator: msg.key.participant || msg.key.remoteJid
    };
    saveDB(db);
    await reply(sock, msg, `📊 Poll created!\n${question}\n1. Yes\n2. No\n3. Maybe\nVote with !vote <number>`);
}

async function handleVote(sock, msg, num) {
    const db = loadDB();
    const pollId = msg.key.remoteJid + '_latest';
    const poll = db.polls[pollId];
    if (!poll) return await reply(sock, msg, 'No active poll. Create one with !poll <question>');
    const n = parseInt(num);
    if (![1,2,3].includes(n)) return await reply(sock, msg, 'Vote with !vote <number> (1, 2, or 3)');
    const voter = msg.key.participant || msg.key.remoteJid;
    poll.votes[voter] = n;
    saveDB(db);
    // Tally
    const tally = [0,0,0];
    Object.values(poll.votes).forEach(v => { if ([1,2,3].includes(v)) tally[v-1]++; });
    await reply(sock, msg, `Vote recorded!\n${poll.question}\n1. Yes: ${tally[0]}\n2. No: ${tally[1]}\n3. Maybe: ${tally[2]}`);
}

// --- XP & Rank System ---
async function handleXP(sock, msg) {
    const db = loadDB();
    const user = msg.key.participant || msg.key.remoteJid;
    if (!db.xp[user]) db.xp[user] = 0;
    db.xp[user] += 10;
    saveDB(db);
    await reply(sock, msg, `${BOT_STYLES.header}⭐ *XP EARNED*\n${BOT_STYLES.divider}\n\n🎯 *Earned:* +10 XP\n📊 *Total XP:* ${db.xp[user]}\n\n💫 *Earn more XP with:* \`!xp\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
}

async function handleRank(sock, msg) {
    const db = loadDB();
    const user = msg.key.participant || msg.key.remoteJid;
    const entries = Object.entries(db.xp).sort((a,b) => b[1]-a[1]);
    const rank = entries.findIndex(([u]) => u === user) + 1;
    const xp = db.xp[user] || 0;
    await reply(sock, msg, `${BOT_STYLES.header}🏆 *RANKING*\n${BOT_STYLES.divider}\n\n📊 *Your XP:* ${xp}\n🏅 *Your Rank:* #${rank} of ${entries.length}\n\n💫 *Check your rank with:* \`!rank\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
}

// --- Dictionary & Utility Handlers ---
async function handleDefine(sock, msg, word) {
    if (!word) return await reply(sock, msg, 'Usage: !define <word>');
    try {
        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
        const data = await res.json();
        if (Array.isArray(data) && data[0]?.meanings?.length) {
            const meaning = data[0].meanings[0].definitions[0].definition;
            await reply(sock, msg, `*${word}*: ${meaning}`);
        } else {
            await reply(sock, msg, `No definition found for "${word}".`);
        }
    } catch {
        await reply(sock, msg, 'Could not fetch definition.');
    }
}

async function handleBinary(sock, msg, text) {
    if (!text) return await reply(sock, msg, 'Usage: !binary <text>');
    const bin = text.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
    await reply(sock, msg, bin);
}

async function handleUnbinary(sock, msg, binary) {
    if (!binary) return await reply(sock, msg, 'Usage: !unbinary <binary>');
    try {
        const text = binary.split(' ').map(b => String.fromCharCode(parseInt(b, 2))).join('');
        await reply(sock, msg, text);
    } catch {
        await reply(sock, msg, 'Invalid binary input.');
    }
}

const EMOJI_DESCRIPTIONS = {
    '😀': 'Grinning face',
    '😂': 'Face with tears of joy',
    '😍': 'Smiling face with heart-eyes',
    '👍': 'Thumbs up',
    '🙏': 'Folded hands',
    '🔥': 'Fire',
    '🥺': 'Pleading face',
    '😎': 'Smiling face with sunglasses',
    '🎉': 'Party popper',
    '💯': 'Hundred points',
    // Add more as needed
};

async function handleEmoji(sock, msg, emoji) {
    if (!emoji) return await reply(sock, msg, 'Usage: !emoji <emoji>');
    const desc = EMOJI_DESCRIPTIONS[emoji] || 'No description found.';
    await reply(sock, msg, `${emoji}: ${desc}`);
}

async function handleCountdown(sock, msg, seconds) {
    const s = parseInt(seconds);
    if (isNaN(s) || s < 1 || s > 30) return await reply(sock, msg, 'Usage: !countdown <seconds> (1-30)');
    for (let i = s; i > 0; i--) {
        await reply(sock, msg, `⏳ ${i}...`);
        await new Promise(res => setTimeout(res, 1000));
    }
    await reply(sock, msg, '⏰ Time is up!');
}

async function handleBible(sock, msg) {
    try {
        const res = await fetch('https://labs.bible.org/api/?passage=random&type=json');
        const data = await res.json();
        const v = data[0];
        await reply(sock, msg, `${BOT_STYLES.header}📖 *BIBLE VERSE*\n${BOT_STYLES.divider}\n\n📚 *Reference:* ${v.bookname} ${v.chapter}:${v.verse}\n\n${v.text}\n\n💫 *Get another verse with:* \`!bible\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    } catch {
        await reply(sock, msg, `${BOT_STYLES.header}❌ *ERROR*\n${BOT_STYLES.divider}\n\nCould not fetch a Bible verse.\n\n💫 *Try again with:* \`!bible\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handleFact(sock, msg) {
    try {
        const res = await fetch('https://uselessfacts.jsph.pl/random.json?language=en');
        const data = await res.json();
        await reply(sock, msg, `${BOT_STYLES.header}🧠 *RANDOM FACT*\n${BOT_STYLES.divider}\n\n${data.text}\n\n💫 *Get another fact with:* \`!fact\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    } catch {
        await reply(sock, msg, `${BOT_STYLES.header}❌ *ERROR*\n${BOT_STYLES.divider}\n\nCould not fetch a fact.\n\n💫 *Try again with:* \`!fact\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

// --- Tagall Handler ---
async function handleTagAll(sock, msg) {
    try {
        const groupMetadata = await sock.groupMetadata(msg.key.remoteJid);
        const participants = groupMetadata.participants.map(p => p.id);
        const mentions = participants;
        const text = participants.map(id => `@${id.split('@')[0]}`).join(' ');
        await sock.sendMessage(msg.key.remoteJid, { text, mentions }, { quoted: msg });
    } catch {
        await reply(sock, msg, 'Could not tag everyone.');
    }
}

// --- New Command Handlers ---
async function handleCatFact(sock, msg) {
    try {
        const res = await fetch('https://catfact.ninja/fact');
        const data = await res.json();
        await reply(sock, msg, `${BOT_STYLES.header}🐱 *CAT FACT*\n${BOT_STYLES.divider}\n\n${data.fact}\n\n💫 *Get another cat fact with:* \`!catfact\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    } catch {
        await reply(sock, msg, `${BOT_STYLES.header}❌ *ERROR*\n${BOT_STYLES.divider}\n\nCould not fetch a cat fact.\n\n💫 *Try again with:* \`!catfact\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handleDogFact(sock, msg) {
    try {
        const res = await fetch('https://dog-api.kinduff.com/api/facts');
        const data = await res.json();
        await reply(sock, msg, `${BOT_STYLES.header}🐕 *DOG FACT*\n${BOT_STYLES.divider}\n\n${data.facts[0]}\n\n💫 *Get another dog fact with:* \`!dogfact\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    } catch {
        await reply(sock, msg, `${BOT_STYLES.header}❌ *ERROR*\n${BOT_STYLES.divider}\n\nCould not fetch a dog fact.\n\n💫 *Try again with:* \`!dogfact\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handleRemind(sock, msg, seconds, text) {
    const s = parseInt(seconds);
    if (isNaN(s) || s < 1 || s > 3600 || !text) return await reply(sock, msg, 'Usage: !remind <seconds 1-3600> <text>');
    await reply(sock, msg, `⏰ Reminder set for ${s} seconds.`);
    setTimeout(() => {
        reply(sock, msg, `🔔 Reminder: ${text}`);
    }, s * 1000);
}

async function handleUUID(sock, msg) {
    const uuid = crypto.randomUUID();
    await reply(sock, msg, `${BOT_STYLES.header}🆔 *UUID GENERATOR*\n${BOT_STYLES.divider}\n\n${uuid}\n\n💫 *Generate another with:* \`!uuid\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
}

async function handleRoll(sock, msg, sides) {
    const n = parseInt(sides);
    if (isNaN(n) || n < 2 || n > 100) return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!roll <sides 2-100>\`\n🎯 *Example:* \`!roll 20\`\n\n💫 *Roll a dice with specified number of sides*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    const result = Math.floor(Math.random() * n) + 1;
    await reply(sock, msg, `${BOT_STYLES.header}🎲 *DICE ROLL*\n${BOT_STYLES.divider}\n\n🎯 *Result:* ${result}\n📊 *Range:* 1-${n}\n🎲 *Sides:* ${n}\n\n💫 *Roll again with:* \`!roll ${n}\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
}

async function handlePalindrome(sock, msg, text) {
    if (!text) return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!palindrome <text>\`\n🎯 *Example:* \`!palindrome racecar\`\n\n💫 *Check if text reads the same forwards and backwards*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    const clean = text.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const isPal = clean === clean.split('').reverse().join('');
    const result = isPal ? '✅ Yes, it\'s a palindrome!' : '❌ No, it\'s not a palindrome.';
    await reply(sock, msg, `${BOT_STYLES.header}🔄 *PALINDROME CHECKER*\n${BOT_STYLES.divider}\n\n📝 *Text:* ${text}\n🔍 *Result:* ${result}\n\n💫 *Check another with:* \`!palindrome <text>\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
}

async function handleCapitalize(sock, msg, text) {
    if (!text) return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!capitalize <text>\`\n🎯 *Example:* \`!capitalize hello world\`\n\n💫 *Capitalize the first letter of each word*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    const capitalized = text.replace(/\b\w/g, c => c.toUpperCase());
    await reply(sock, msg, `${BOT_STYLES.header}📝 *TEXT CAPITALIZER*\n${BOT_STYLES.divider}\n\n📝 *Original:* ${text}\n📝 *Capitalized:* ${capitalized}\n\n💫 *Capitalize more with:* \`!capitalize <text>\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
}

// --- New Utility Commands ---

async function handleDateDiff(sock, msg, date1, date2) {
    if (!date1 || !date2) {
        return await reply(sock, msg, 'Usage: !datediff <date1> <date2>\nExample: !datediff 2024-01-01 2025-01-01');
    }
    
    try {
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        
        if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
            return await reply(sock, msg, '❌ Invalid date format. Use YYYY-MM-DD format.');
        }
        
        const diffTime = Math.abs(d2 - d1);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        await reply(sock, msg, `📅 *Date Difference*\n\n📆 From: ${d1.toDateString()}\n📆 To: ${d2.toDateString()}\n\n⏰ *Difference:* ${diffDays} days`);
    } catch (error) {
        await reply(sock, msg, '❌ Error calculating date difference. Please check your date format.');
    }
}

async function handleTimeIn(sock, msg, location) {
    if (!location) {
        return await reply(sock, msg, 'Usage: !timein <city/region>\nExample: !timein London');
    }
    
    try {
        const response = await fetch(`http://worldtimeapi.org/api/timezone/${encodeURIComponent(location)}`);
        const data = await response.json();
        
        if (data.error) {
            return await reply(sock, msg, `❌ Location not found: ${location}\n\n💡 Try using a major city name like: London, New York, Tokyo`);
        }
        
        const datetime = new Date(data.datetime);
        const timeString = datetime.toLocaleString('en-US', {
            timeZone: data.timezone,
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        await reply(sock, msg, `🕒 *Time in ${data.timezone}*\n\n⏰ ${timeString}\n🌍 Timezone: ${data.abbreviation}\n📅 Day: ${data.day_of_week}`);
    } catch (error) {
        await reply(sock, msg, '❌ Could not fetch time for that location. Please try again.');
    }
}

async function handleShorten(sock, msg, url) {
    if (!url) {
        return await reply(sock, msg, 'Usage: !shorten <url>\nExample: !shorten https://www.google.com');
    }
    
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    
    try {
        const response = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
        const shortUrl = await response.text();
        
        if (shortUrl.startsWith('http')) {
            await reply(sock, msg, `🔗 *URL Shortened*\n\n📤 Original: ${url}\n📥 Shortened: ${shortUrl}`);
        } else {
            await reply(sock, msg, '❌ Could not shorten URL. Please check if the URL is valid.');
        }
    } catch (error) {
        await reply(sock, msg, '❌ Error shortening URL. Please try again.');
    }
}

async function handleTempMail(sock, msg) {
    try {
        // Generate a random email using a more reliable method
        const domains = ['tempmail.org', '10minutemail.com', 'guerrillamail.com', 'mailinator.com'];
        const randomDomain = domains[Math.floor(Math.random() * domains.length)];
        const randomString = Math.random().toString(36).substring(2, 10);
        const email = `${randomString}@${randomDomain}`;
        
        await reply(sock, msg, `${BOT_STYLES.header}📧 *TEMPORARY EMAIL*\n${BOT_STYLES.divider}\n\n📮 *Email:* \`${email}\`\n⏰ *Duration:* 10 minutes\n\n💡 *Usage:*\n• Use this email for temporary registrations\n• Check the domain's website for messages\n• Email expires automatically\n\n🔗 *Check messages:*\n• https://10minutemail.com\n• https://guerrillamail.com\n• https://mailinator.com\n\n💫 *Generate another with:* \`!tempmail\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    } catch (error) {
        await reply(sock, msg, `${BOT_STYLES.header}❌ *ERROR*\n${BOT_STYLES.divider}\n\nCould not generate temporary email.\n\n💫 *Try again with:* \`!tempmail\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handleColor(sock, msg, hex) {
    if (!hex) {
        return await reply(sock, msg, 'Usage: !color <hex>\nExample: !color #FF0000');
    }
    
    // Remove # if present
    hex = hex.replace('#', '');
    
    if (!/^[0-9A-F]{6}$/i.test(hex)) {
        return await reply(sock, msg, '❌ Invalid hex color. Use format: #FF0000 or FF0000');
    }
    
    try {
        const response = await fetch(`https://www.thecolorapi.com/id?hex=${hex}`);
        const data = await response.json();
        
        if (data.name) {
            await reply(sock, msg, `🎨 *Color Information*\n\n🔴 Hex: #${hex.toUpperCase()}\n📝 Name: ${data.name.value}\n🎯 RGB: ${data.rgb.value}\n🌐 HSL: ${data.hsl.value}\n\n💡 ${data.name.closest_named_hex ? `Closest named color: ${data.name.closest_named_hex}` : ''}`);
        } else {
            await reply(sock, msg, `🎨 *Color Information*\n\n🔴 Hex: #${hex.toUpperCase()}\n📝 Name: Unknown color`);
        }
    } catch (error) {
        await reply(sock, msg, '❌ Error fetching color information. Please try again.');
    }
}

async function handlePassword(sock, msg, length) {
    const len = parseInt(length) || 12;
    
    if (len < 4 || len > 50) {
        return await reply(sock, msg, '❌ Password length must be between 4 and 50 characters.');
    }
    
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    let password = '';
    
    for (let i = 0; i < len; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    await reply(sock, msg, `🔐 *Random Password*\n\n📏 Length: ${len} characters\n🔑 Password: \`${password}\`\n\n💡 Copy the password above (between backticks)`);
}

// --- Weather & Info Commands ---

async function handleCountry(sock, msg, countryName) {
    if (!countryName) {
        return await reply(sock, msg, 'Usage: !country <country name>\nExample: !country Nigeria');
    }
    
    try {
        const response = await fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(countryName)}`);
        const countries = await response.json();
        
        if (countries.status === 404) {
            return await reply(sock, msg, `❌ Country not found: ${countryName}`);
        }
        
        const country = countries[0];
        const currencies = country.currencies ? Object.values(country.currencies).map(c => `${c.name} (${c.symbol})`).join(', ') : 'N/A';
        const languages = country.languages ? Object.values(country.languages).join(', ') : 'N/A';
        
        await reply(sock, msg, `🏳️ *Country Information*\n\n🏛️ Name: ${country.name.common}\n🏙️ Capital: ${country.capital?.[0] || 'N/A'}\n🌍 Region: ${country.region}\n👥 Population: ${country.population?.toLocaleString() || 'N/A'}\n💱 Currency: ${currencies}\n🗣️ Languages: ${languages}\n📱 Calling Code: +${country.idd.root}${country.idd.suffixes?.[0] || ''}\n🌐 Domain: .${country.tld?.[0] || 'N/A'}`);
    } catch (error) {
        await reply(sock, msg, '❌ Error fetching country information. Please try again.');
    }
}

// --- Crypto Commands ---

async function handleCrypto(sock, msg, coin) {
    if (!coin) {
        return await reply(sock, msg, 'Usage: !crypto <coin>\nExamples: !crypto bitcoin, !crypto ethereum, !crypto btc');
    }
    
    try {
        const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coin.toLowerCase()}&vs_currencies=usd,eur,btc&include_24hr_change=true&include_market_cap=true`);
        const data = await response.json();
        
        if (data[coin.toLowerCase()]) {
            const coinData = data[coin.toLowerCase()];
            const change24h = coinData.usd_24h_change;
            const changeEmoji = change24h >= 0 ? '📈' : '📉';
            
            await reply(sock, msg, `💰 *${coin.toUpperCase()} Price*\n\n💵 USD: $${coinData.usd?.toLocaleString() || 'N/A'}\n💶 EUR: €${coinData.eur?.toLocaleString() || 'N/A'}\n₿ BTC: ${coinData.btc?.toFixed(8) || 'N/A'}\n\n${changeEmoji} 24h Change: ${change24h?.toFixed(2)}%\n💼 Market Cap: $${coinData.usd_market_cap?.toLocaleString() || 'N/A'}`);
        } else {
            await reply(sock, msg, `❌ Coin not found: ${coin}\n\n💡 Try common coins like: bitcoin, ethereum, btc, eth, dogecoin`);
        }
    } catch (error) {
        await reply(sock, msg, '❌ Error fetching crypto price. Please try again.');
    }
}

// --- Fun & Motivation Commands ---

async function handleWordDay(sock, msg) {
    try {
        const response = await fetch('https://api.wordnik.com/v4/words.json/wordOfTheDay?api_key=' + (process.env.WORDNIK_API_KEY || ''));
        const data = await response.json();
        
        await reply(sock, msg, `${BOT_STYLES.header}📚 *WORD OF THE DAY*\n${BOT_STYLES.divider}\n\n📖 *Word:* ${data.word}\n📝 *Definition:* ${data.definitions?.[0]?.text || 'No definition available'}\n📅 *Date:* ${data.publishDate}\n\n💡 *Example:* ${data.examples?.[0]?.text || 'No example available'}\n\n💫 *Get tomorrow's word with:* \`!wordday\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    } catch (error) {
        await reply(sock, msg, `${BOT_STYLES.header}❌ *ERROR*\n${BOT_STYLES.divider}\n\nCould not fetch word of the day.\n\n💫 *Try again with:* \`!wordday\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}



// --- Group Management Commands ---
async function handleKick(sock, msg, user) {
    try {
        // Check permissions
        if (!await hasAdminPermission(sock, msg)) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *ACCESS DENIED*\n${BOT_STYLES.divider}\n\n🔒 You need admin or sudo permissions to use this command.\n\n💡 *Contact:* ${CREATOR_INFO.name}\n📱 Instagram: @${CREATOR_INFO.ig}${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        if (!user) return await reply(sock, msg, 'Usage: !kick @user');
        const participant = user.replace('@', '') + '@s.whatsapp.net';
        await sock.groupParticipantsUpdate(msg.key.remoteJid, [participant], 'remove');
        await reply(sock, msg, `Kicked ${user} from the group.`);
    } catch (e) {
        await reply(sock, msg, 'Failed to kick user. Make sure you have admin rights.');
    }
}

async function handleAdd(sock, msg, user) {
    try {
        // Check permissions
        if (!await hasAdminPermission(sock, msg)) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *ACCESS DENIED*\n${BOT_STYLES.divider}\n\n🔒 You need admin or sudo permissions to use this command.\n\n💡 *Contact:* ${CREATOR_INFO.name}\n📱 Instagram: @${CREATOR_INFO.ig}${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        if (!user) return await reply(sock, msg, 'Usage: !add <phone_number>');
        const participant = user.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        await sock.groupParticipantsUpdate(msg.key.remoteJid, [participant], 'add');
        await reply(sock, msg, `Added ${user} to the group.`);
    } catch (e) {
        await reply(sock, msg, 'Failed to add user.');
    }
}

async function handlePromote(sock, msg, user) {
    try {
        // Check permissions
        if (!await hasAdminPermission(sock, msg)) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *ACCESS DENIED*\n${BOT_STYLES.divider}\n\n🔒 You need admin or sudo permissions to use this command.\n\n💡 *Contact:* ${CREATOR_INFO.name}\n📱 Instagram: @${CREATOR_INFO.ig}${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        if (!user) return await reply(sock, msg, 'Usage: !promote @user');
        const participant = user.replace('@', '') + '@s.whatsapp.net';
        await sock.groupParticipantsUpdate(msg.key.remoteJid, [participant], 'promote');
        await reply(sock, msg, `Promoted ${user} to admin.`);
    } catch (e) {
        await reply(sock, msg, 'Failed to promote user. Make sure you have admin rights.');
    }
}

async function handleDemote(sock, msg, user) {
    try {
        // Check permissions
        if (!await hasAdminPermission(sock, msg)) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *ACCESS DENIED*\n${BOT_STYLES.divider}\n\n🔒 You need admin or sudo permissions to use this command.\n\n💡 *Contact:* ${CREATOR_INFO.name}\n📱 Instagram: @${CREATOR_INFO.ig}${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        if (!user) return await reply(sock, msg, 'Usage: !demote @user');
        const participant = user.replace('@', '') + '@s.whatsapp.net';
        await sock.groupParticipantsUpdate(msg.key.remoteJid, [participant], 'demote');
        await reply(sock, msg, `Demoted ${user} from admin.`);
    } catch (e) {
        await reply(sock, msg, 'Failed to demote user. Make sure you have admin rights.');
    }
}

async function handleBan(sock, msg, user) {
    try {
        // Check permissions
        if (!await hasAdminPermission(sock, msg)) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *ACCESS DENIED*\n${BOT_STYLES.divider}\n\n🔒 You need admin or sudo permissions to use this command.\n\n💡 *Contact:* ${CREATOR_INFO.name}\n📱 Instagram: @${CREATOR_INFO.ig}${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        if (!user) return await reply(sock, msg, 'Usage: !ban @user');
        const participant = user.replace('@', '') + '@s.whatsapp.net';
        await sock.groupParticipantsUpdate(msg.key.remoteJid, [participant], 'remove');
        await reply(sock, msg, `Banned ${user} from the group.`);
    } catch (e) {
        await reply(sock, msg, 'Failed to ban user. Make sure you have admin rights.');
    }
}

async function handleUnban(sock, msg, user) {
    try {
        // Check permissions
        if (!await hasAdminPermission(sock, msg)) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *ACCESS DENIED*\n${BOT_STYLES.divider}\n\n🔒 You need admin or sudo permissions to use this command.\n\n💡 *Contact:* ${CREATOR_INFO.name}\n📱 Instagram: @${CREATOR_INFO.ig}${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        if (!user) return await reply(sock, msg, 'Usage: !unban <phone_number>');
        const participant = user.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        await sock.groupParticipantsUpdate(msg.key.remoteJid, [participant], 'add');
        await reply(sock, msg, `Unbanned ${user} and added back to group.`);
    } catch (e) {
        await reply(sock, msg, 'Failed to unban user.');
    }
}

async function handleGroupInfo(sock, msg) {
    try {
        const groupMetadata = await sock.groupMetadata(msg.key.remoteJid);
        const participants = groupMetadata.participants;
        const admins = participants.filter(p => p.admin).length;
        const members = participants.length;
        
        const info = `📊 *Group Info*\n\n` +
                    `*Name:* ${groupMetadata.subject}\n` +
                    `*Description:* ${groupMetadata.desc || 'No description'}\n` +
                    `*Members:* ${members}\n` +
                    `*Admins:* ${admins}\n` +
                    `*Created:* ${new Date(groupMetadata.creation * 1000).toLocaleDateString()}`;
        
        await reply(sock, msg, info);
    } catch (e) {
        await reply(sock, msg, 'Failed to get group info.');
    }
}

async function handleSetDesc(sock, msg, desc) {
    try {
        // Check permissions
        if (!await hasAdminPermission(sock, msg)) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *ACCESS DENIED*\n${BOT_STYLES.divider}\n\n🔒 You need admin or sudo permissions to use this command.\n\n💡 *Contact:* ${CREATOR_INFO.name}\n📱 Instagram: @${CREATOR_INFO.ig}${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        if (!desc) return await reply(sock, msg, 'Usage: !setdesc <description>');
        await sock.groupUpdateDescription(msg.key.remoteJid, desc);
        await reply(sock, msg, 'Group description updated successfully.');
    } catch (e) {
        await reply(sock, msg, 'Failed to update group description. Make sure you have admin rights.');
    }
}

async function handleSetName(sock, msg, name) {
    try {
        // Check permissions
        if (!await hasAdminPermission(sock, msg)) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *ACCESS DENIED*\n${BOT_STYLES.divider}\n\n🔒 You need admin or sudo permissions to use this command.\n\n💡 *Contact:* ${CREATOR_INFO.name}\n📱 Instagram: @${CREATOR_INFO.ig}${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        if (!name) return await reply(sock, msg, 'Usage: !setname <new_name>');
        await sock.groupUpdateSubject(msg.key.remoteJid, name);
        await reply(sock, msg, 'Group name updated successfully.');
    } catch (e) {
        await reply(sock, msg, 'Failed to update group name. Make sure you have admin rights.');
    }
}

// --- Antispam Command Handler ---
async function handleAntispamCommand(sock, msg, arg) {
    try {
        // Check permissions
        if (!await hasAdminPermission(sock, msg)) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *ACCESS DENIED*\n${BOT_STYLES.divider}\n\n🔒 You need admin or sudo permissions to use this command.\n\n💡 *Contact:* ${CREATOR_INFO.name}\n📱 Instagram: @${CREATOR_INFO.ig}${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const groupId = msg.key.remoteJid;
        if (!arg) {
            const status = antispamSettings[groupId] ? 'ENABLED' : 'DISABLED';
            return await reply(sock, msg, `🛡️ Antispam is currently *${status}* in this group.\nUsage: !antispam on | off | status`);
        }
        if (arg.toLowerCase() === 'on') {
            antispamSettings[groupId] = true;
            await reply(sock, msg, '🛡️ Antispam has been *ENABLED* for this group. Spammers will be removed!');
        } else if (arg.toLowerCase() === 'off') {
            antispamSettings[groupId] = false;
            await reply(sock, msg, '🛡️ Antispam has been *DISABLED* for this group.');
        } else if (arg.toLowerCase() === 'status') {
            const status = antispamSettings[groupId] ? 'ENABLED' : 'DISABLED';
            await reply(sock, msg, `🛡️ Antispam is currently *${status}* in this group.`);
        } else {
            await reply(sock, msg, 'Usage: !antispam on | off | status');
        }
    } catch (e) {
        await reply(sock, msg, 'Failed to configure antispam. Make sure you have admin rights.');
    }
}

// --- Antilink Command Handler ---
async function handleAntilinkCommand(sock, msg, arg) {
    try {
        // Check permissions
        if (!await hasAdminPermission(sock, msg)) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *ACCESS DENIED*\n${BOT_STYLES.divider}\n\n🔒 You need admin or sudo permissions to use this command.\n\n💡 *Contact:* ${CREATOR_INFO.name}\n📱 Instagram: @${CREATOR_INFO.ig}${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const groupId = msg.key.remoteJid;
        if (!arg) {
            const status = antilinkSettings[groupId] ? 'ENABLED' : 'DISABLED';
            return await reply(sock, msg, `🚫 Antilink is currently *${status}* in this group.\nUsage: !antilink on | off | status`);
        }
        if (arg.toLowerCase() === 'on') {
            antilinkSettings[groupId] = true;
            await reply(sock, msg, '🚫 Antilink has been *ENABLED* for this group. Users sharing links will be removed!');
        } else if (arg.toLowerCase() === 'off') {
            antilinkSettings[groupId] = false;
            await reply(sock, msg, '🚫 Antilink has been *DISABLED* for this group.');
        } else if (arg.toLowerCase() === 'status') {
            const status = antilinkSettings[groupId] ? 'ENABLED' : 'DISABLED';
            await reply(sock, msg, `🚫 Antilink is currently *${status}* in this group.`);
        } else {
            await reply(sock, msg, 'Usage: !antilink on | off | status');
        }
    } catch (e) {
        await reply(sock, msg, 'Failed to configure antilink. Make sure you have admin rights.');
    }
}

// --- View Once Unlock Handler (WORKING VERSION) ---
async function handleViewOnceUnlock(sock, msg) {
    try {
        const chatType = msg.key.remoteJid.endsWith('@g.us') ? 'Group' : 'Private';
        console.log(`🔍 handleViewOnceUnlock called in ${chatType} chat`);
        
        // Check if this is a reply to a message
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quotedMsg) {
            return await reply(sock, msg, '❌ Reply to a view-once image or video with !vv to unlock it.\n\n💡 *How to use:*\n1. Send a view-once image/video to the chat\n2. Reply to that message with !vv\n3. The bot will unlock and resend it');
        }

        // Try to detect any media type
        let mediaType = null;
        let isViewOnce = false;

        // Check for any image message
        if (quotedMsg.imageMessage) {
            mediaType = 'image';
            isViewOnce = quotedMsg.imageMessage.viewOnce || false;
        }
        // Check for any video message
        else if (quotedMsg.videoMessage) {
            mediaType = 'video';
            isViewOnce = quotedMsg.videoMessage.viewOnce || false;
        }
        // Check for any audio message
        else if (quotedMsg.audioMessage) {
            mediaType = 'audio';
            isViewOnce = quotedMsg.audioMessage.viewOnce || false;
        }

        if (!mediaType) {
            return await reply(sock, msg, '❌ No media found in the replied message.\n\n💡 Reply to an image, video, or audio message.');
        }

        // Get the quoted message details
        const quotedId = msg.message.extendedTextMessage.contextInfo.stanzaId;
        const quotedParticipant = msg.message.extendedTextMessage.contextInfo.participant;
        
        if (!quotedId) {
            return await reply(sock, msg, '❌ Could not identify the original message. Try again.');
        }

        // Create the message key for the quoted message
        const quotedKey = {
            remoteJid: msg.key.remoteJid,
            fromMe: false,
            id: quotedId,
            participant: quotedParticipant
        };

        console.log(`🔍 Attempting to download ${mediaType}...`);

        // Download the media using the correct method
        let buffer = null;
        
        try {
            console.log('🔄 Attempting to download media...');
            
            // Use the correct downloadContentFromMessage method
            if (quotedMsg.imageMessage) {
                const stream = await downloadContentFromMessage(quotedMsg.imageMessage, 'image');
                buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }
                console.log(`✅ Downloaded image via Baileys, size: ${buffer.length} bytes`);
            } else if (quotedMsg.videoMessage) {
                const stream = await downloadContentFromMessage(quotedMsg.videoMessage, 'video');
                buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }
                console.log(`✅ Downloaded video via Baileys, size: ${buffer.length} bytes`);
            } else if (quotedMsg.audioMessage) {
                const stream = await downloadContentFromMessage(quotedMsg.audioMessage, 'audio');
                buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }
                console.log(`✅ Downloaded audio via Baileys, size: ${buffer.length} bytes`);
            } else {
                throw new Error('No supported media type found');
            }
        } catch (e) {
            console.log('❌ Download failed:', e.message);
            return await reply(sock, msg, `❌ Could not download the media: ${e.message}\n\n💡 This might be because:\n• The media has already been viewed\n• The media has expired\n• You don't have permission to access it\n\n🔧 Try with a fresh media that hasn't been viewed yet.`);
        }

        if (!buffer || buffer.length === 0) {
            return await reply(sock, msg, '❌ Downloaded media is empty.\n\n💡 Try with a different media file.');
        }
        
        // Basic size check only (no file header validation)
        if (buffer.length < 100) {
            return await reply(sock, msg, '❌ Downloaded media is too small (likely corrupted).\n\n💡 Try with a different media file.');
        }

        // Send the media back
        const caption = `🔓 *${isViewOnce ? 'View-once' : 'Media'} ${mediaType} unlocked*\n\n💡 *BIG TENNET Bot* made this ${mediaType} viewable multiple times!`;

        try {
            if (mediaType === 'image') {
                await sock.sendMessage(msg.key.remoteJid, {
                    image: buffer,
                    caption: caption
                });
            } else if (mediaType === 'video') {
                await sock.sendMessage(msg.key.remoteJid, {
                    video: buffer,
                    caption: caption
                });
            } else if (mediaType === 'audio') {
                await sock.sendMessage(msg.key.remoteJid, {
                    audio: buffer,
                    caption: caption
                });
            }
            
            console.log(`✅ Successfully sent ${mediaType}`);
            await reply(sock, msg, `✅ Successfully unlocked and sent ${mediaType}!`);
        } catch (sendError) {
            console.error('❌ Error sending media:', sendError);
            await reply(sock, msg, `❌ Downloaded ${mediaType} but failed to send it. Error: ${sendError.message}`);
        }

    } catch (error) {
        console.error('❌ View-once unlock error:', error);
        const chatType = msg.key.remoteJid.endsWith('@g.us') ? 'Group' : 'Private';
        await reply(sock, msg, `❌ Failed to unlock media in ${chatType} chat.\n\n💡 *Troubleshooting:*\n• Make sure you replied to an image/video/audio message\n• The media hasn't been viewed yet\n• You have permission to access it\n• Try with a fresh view-once media\n\n🔧 *Note:* The !vv command works in both private chats and groups.`);
    }
}

// --- Sticker Handler ---
async function handleSticker(sock, msg) {
    try {
        console.log('🎨 Sticker command triggered');
        console.log('🎨 Message content:', JSON.stringify(msg.message, null, 2));
        
        // Check if this is a reply to a message
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quotedMsg) {
            return await reply(sock, msg, `🎨 *Sticker Creator*\n\n📱 *How to use:*\n• Reply to an image or video with !sticker\n• The bot will convert it to a sticker\n\n💡 *Supported formats:*\n• Images (JPG, PNG, GIF)\n• Videos (MP4, MOV)\n• Max size: 5MB\n\n🎯 *Works in:*\n• Private chats ✅\n• Group chats ✅\n\nCreated by ${CREATOR_INFO.name}`);
        }

        // Check for media types
        let mediaType = null;
        let mediaMessage = null;

        if (quotedMsg.imageMessage) {
            mediaType = 'image';
            mediaMessage = quotedMsg.imageMessage;
        } else if (quotedMsg.videoMessage) {
            mediaType = 'video';
            mediaMessage = quotedMsg.videoMessage;
        } else {
            return await reply(sock, msg, '❌ No image or video found in the replied message.\n\n💡 Reply to an image or video with !sticker to convert it.');
        }

        console.log(`🎨 Converting ${mediaType} to sticker...`);

        // Download the media
        let buffer = null;
        try {
            const stream = await downloadContentFromMessage(mediaMessage, mediaType);
            buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            console.log(`✅ Downloaded ${mediaType}, size: ${buffer.length} bytes`);
        } catch (e) {
            console.log('❌ Failed to download media:', e.message);
            return await reply(sock, msg, '❌ Failed to download the media. Please try again.');
        }

        if (!buffer || buffer.length === 0) {
            return await reply(sock, msg, '❌ Downloaded media is empty. Please try again.');
        }

        // Check file size (max 5MB for free APIs)
        if (buffer.length > 5 * 1024 * 1024) {
            return await reply(sock, msg, '❌ File too large! Maximum size is 5MB for sticker conversion.');
        }

        // Convert to sticker using free API
        try {
            console.log('🔄 Converting to sticker...');
            
            // For now, we'll send the image directly as a sticker
            // WhatsApp will handle the conversion automatically
            if (mediaType === 'image') {
                await sock.sendMessage(msg.key.remoteJid, {
                    sticker: buffer
                }, { quoted: msg });
                
                console.log('✅ Image sticker sent successfully');
                await reply(sock, msg, '✅ Image converted to sticker successfully! 🎨');
            } else if (mediaType === 'video') {
                // For videos, we'll send as a video sticker
                await sock.sendMessage(msg.key.remoteJid, {
                    sticker: buffer,
                    isAnimated: true
                }, { quoted: msg });
                
                console.log('✅ Video sticker sent successfully');
                await reply(sock, msg, '✅ Video converted to animated sticker successfully! 🎬');
            }

        } catch (conversionError) {
            console.error('❌ Sticker conversion error:', conversionError);
            await reply(sock, msg, '❌ Failed to convert to sticker. Please try with a different image/video.');
        }

    } catch (error) {
        console.error('❌ Sticker handler error:', error);
        await reply(sock, msg, '❌ An error occurred while creating the sticker. Please try again.');
    }
}

// --- Sticker Conversion Function ---
async function convertToSticker(buffer, mediaType) {
    try {
        console.log(`🔄 Converting ${mediaType} to sticker format...`);
        
        // For now, we'll use a simple approach that works with WhatsApp's sticker format
        // WhatsApp stickers are typically WebP format with specific dimensions
        
        if (mediaType === 'image') {
            // For images, we can try to send them directly as stickers
            // WhatsApp will handle the conversion automatically
            return buffer;
        } else if (mediaType === 'video') {
            // For videos, we'll extract the first frame and convert it
            // This is a simplified approach - in production you'd use ffmpeg
            console.log('📹 Video to sticker conversion (simplified)');
            return buffer; // Return original for now
        }
        
        return buffer;
        
    } catch (error) {
        console.error('❌ Sticker conversion error:', error);
        return null;
    }
}

// --- Sudo Command Handlers ---

async function handleAddSudo(sock, msg, user) {
    try {
        // Permission check removed - anyone can add sudo users now
        
        if (!user) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!addsudo @user\`\n🎯 *Example:* \`!addsudo @1234567890\`\n\n💫 *Add a user to global sudo permissions*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        // Extract user ID from mention or phone number
        let targetUserId = user;
        if (user.startsWith('@')) {
            targetUserId = user.replace('@', '') + '@s.whatsapp.net';
        } else {
            targetUserId = user.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        }
        
        // Check if user is already global sudo
        if (isGlobalSudoUser(targetUserId)) {
            return await reply(sock, msg, `${BOT_STYLES.header}⚠️ *USER ALREADY GLOBAL SUDO*\n${BOT_STYLES.divider}\n\n👤 User is already a global sudo user.\n\n💫 *Check sudo users with:* \`!listsudo\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        // Add user to global sudo
        const success = addGlobalSudoUser(targetUserId);
        
        if (success) {
            await reply(sock, msg, `${BOT_STYLES.header}✅ *GLOBAL SUDO USER ADDED*\n${BOT_STYLES.divider}\n\n👤 *User:* ${user}\n🔓 *Permission:* Global Sudo (All Groups)\n\n💫 *User can now use admin commands in all groups*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        } else {
            await reply(sock, msg, `${BOT_STYLES.header}❌ *ERROR*\n${BOT_STYLES.divider}\n\nFailed to add sudo user. User might already be sudo.${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
    } catch (e) {
        console.error('Error adding sudo user:', e);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *ERROR*\n${BOT_STYLES.divider}\n\nFailed to add sudo user: ${e.message}${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handleRemoveSudo(sock, msg, user) {
    try {
        // Permission check removed - anyone can remove sudo users now
        
        if (!user) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!removesudo @user\`\n🎯 *Example:* \`!removesudo @1234567890\`\n\n💫 *Remove a user from global sudo permissions*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        // Extract user ID from mention or phone number
        let targetUserId = user;
        if (user.startsWith('@')) {
            targetUserId = user.replace('@', '') + '@s.whatsapp.net';
        } else {
            targetUserId = user.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        }
        
        // Check if user is global sudo
        if (!isGlobalSudoUser(targetUserId)) {
            return await reply(sock, msg, `${BOT_STYLES.header}⚠️ *USER NOT GLOBAL SUDO*\n${BOT_STYLES.divider}\n\n👤 User is not a global sudo user.\n\n💫 *Check sudo users with:* \`!listsudo\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        // Remove user from global sudo
        const success = removeGlobalSudoUser(targetUserId);
        
        if (success) {
            await reply(sock, msg, `${BOT_STYLES.header}✅ *GLOBAL SUDO USER REMOVED*\n${BOT_STYLES.divider}\n\n👤 *User:* ${user}\n🔒 *Permission:* Removed from Global Sudo\n\n💫 *User can no longer use admin commands globally*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        } else {
            await reply(sock, msg, `${BOT_STYLES.header}❌ *ERROR*\n${BOT_STYLES.divider}\n\nFailed to remove sudo user. User might not be sudo.${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
    } catch (e) {
        console.error('Error removing sudo user:', e);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *ERROR*\n${BOT_STYLES.divider}\n\nFailed to remove sudo user: ${e.message}${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handleAddMyIds(sock, msg) {
    try {
        // Permission check removed - anyone can add multiple ID formats now
        
        // Add multiple ID formats for the bot owner
        const primaryId = '2348124269148@s.whatsapp.net';
        const additionalIds = ['62152807309553@lid'];
        
        const success = addUserMultipleIds(primaryId, additionalIds);
        
        if (success) {
            await reply(sock, msg, `${BOT_STYLES.header}✅ *MULTIPLE ID FORMATS ADDED*\n${BOT_STYLES.divider}\n\n👤 *Primary ID:* ${primaryId}\n🔗 *Additional IDs:*\n${additionalIds.map(id => `• ${id}`).join('\n')}\n\n💫 *All ID formats are now authorized*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        } else {
            await reply(sock, msg, `${BOT_STYLES.header}⚠️ *NO CHANGES NEEDED*\n${BOT_STYLES.divider}\n\nAll ID formats are already configured.\n\n💫 *Check current sudo users with:* \`!listsudo\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
    } catch (e) {
        console.error('Error adding multiple IDs:', e);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *ERROR*\n${BOT_STYLES.divider}\n\nFailed to add multiple ID formats: ${e.message}${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handleListSudo(sock, msg) {
    try {
        // Permission check removed - anyone can view sudo users now
        
        const sudoData = loadSudoUsers();
        const groupId = msg.key.remoteJid.endsWith('@g.us') ? msg.key.remoteJid : null;
        
        let response = `${BOT_STYLES.header}📋 *SUDO USERS LIST*\n${BOT_STYLES.divider}\n\n`;
        
        // Bot Owner
        response += `👑 *Bot Owner:*\n• ${sudoData.bot_owner.replace('@s.whatsapp.net', '')}\n\n`;
        
        // Global Sudo Users
        if (sudoData.global_sudo_users.length > 0) {
            const globalSudoList = sudoData.global_sudo_users
                .filter(user => user !== sudoData.bot_owner) // Don't show bot owner twice
                .map((user, index) => `${index + 1}. ${user.replace('@s.whatsapp.net', '')}`)
                .join('\n');
            
            if (globalSudoList) {
                response += `🔓 *Global Sudo Users:*\n${globalSudoList}\n\n`;
            }
        }
        
        // Group Sudo Users (if in a group)
        if (isGroup && sudoData.group_sudo_users[groupId] && sudoData.group_sudo_users[groupId].length > 0) {
            const groupSudoList = sudoData.group_sudo_users[groupId]
                .map((user, index) => `${index + 1}. ${user.replace('@s.whatsapp.net', '')}`)
                .join('\n');
            
            response += `📊 *Group Sudo Users:*\n${groupSudoList}\n\n`;
        }
        
        // Summary
        const totalGlobalSudo = sudoData.global_sudo_users.length;
        const totalGroupSudo = isGroup && sudoData.group_sudo_users[groupId] ? sudoData.group_sudo_users[groupId].length : 0;
        
        response += `📊 *Summary:*\n• Global Sudo: ${totalGlobalSudo} user(s)\n`;
        if (isGroup) {
            response += `• Group Sudo: ${totalGroupSudo} user(s)\n`;
        }
        response += `• Total: ${totalGlobalSudo + totalGroupSudo} user(s)\n\n`;
        
        response += `💫 *Manage sudo users with:*\n• \`!addsudo @user\` - Add global sudo user\n• \`!removesudo @user\` - Remove global sudo user${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
        
        await reply(sock, msg, response);
        
    } catch (e) {
        console.error('Error listing sudo users:', e);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *ERROR*\n${BOT_STYLES.divider}\n\nFailed to list sudo users: ${e.message}${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

startBot();

// Health check server for Render
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        const healthData = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            isConnected: isConnected,
            reconnectAttempts: reconnectAttempts,
            connectionTime: connectionStartTime ? Date.now() - connectionStartTime : 0,
            lastHeartbeat: lastHeartbeat ? Date.now() - lastHeartbeat : 0
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(healthData, null, 2));
    } else if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <html>
                <head><title>BIG TENNET WhatsApp Bot</title></head>
                <body>
                    <h1>🤖 BIG TENNET WhatsApp Bot</h1>
                    <p>Status: ${isConnected ? '🟢 Connected' : '🔴 Disconnected'}</p>
                    <p>Uptime: ${Math.floor(process.uptime() / 60)} minutes</p>
                    <p>Memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB</p>
                    <p><a href="/health">Health Check</a></p>
                </body>
            </html>
        `);
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`🌐 Health check server running on port ${PORT}`);
    console.log(`🔗 Health endpoint: http://localhost:${PORT}/health`);
}); 

// === NEW FREE API FEATURES ===

// === ENTERTAINMENT FEATURES ===
async function handleMovie(sock, msg, title) {
    try {
        if (!title) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!movie <title>\`\n🎯 *Example:* \`!movie The Matrix\`\n\n💫 *Get movie information from OMDB API*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const response = await fetch(`http://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=free`);
        const data = await response.json();
        
        if (data.Response === 'True') {
            const movieInfo = `${BOT_STYLES.header}🎬 *MOVIE INFO*\n${BOT_STYLES.divider}\n\n📽️ *Title:* ${data.Title}\n📅 *Year:* ${data.Year}\n⏱️ *Runtime:* ${data.Runtime}\n🎭 *Genre:* ${data.Genre}\n🎬 *Director:* ${data.Director}\n👥 *Cast:* ${data.Actors}\n📝 *Plot:* ${data.Plot}\n⭐ *Rating:* ${data.imdbRating}/10\n🏆 *Awards:* ${data.Awards}\n\n💫 *Powered by OMDB API*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
            await reply(sock, msg, movieInfo);
        } else {
            await reply(sock, msg, `${BOT_STYLES.header}❌ *MOVIE NOT FOUND*\n${BOT_STYLES.divider}\n\nCould not find movie: "${title}"\n\n💡 *Try:* \`!movie The Matrix\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
    } catch (error) {
        console.error('Movie API error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *API ERROR*\n${BOT_STYLES.divider}\n\nFailed to fetch movie information.\n\n💡 *Try again later*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handleTVShow(sock, msg, title) {
    try {
        if (!title) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!tvshow <title>\`\n🎯 *Example:* \`!tvshow Breaking Bad\`\n\n💫 *Get TV show information from TVMaze API*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const response = await fetch(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(title)}`);
        const data = await response.json();
        
        if (data.id) {
            const showInfo = `${BOT_STYLES.header}📺 *TV SHOW INFO*\n${BOT_STYLES.divider}\n\n📺 *Title:* ${data.name}\n📅 *Premiered:* ${data.premiered || 'Unknown'}\n🏁 *Status:* ${data.status}\n⏱️ *Runtime:* ${data.runtime} minutes\n🎭 *Genre:* ${data.genres.join(', ')}\n📺 *Network:* ${data.network?.name || 'Unknown'}\n📝 *Summary:* ${data.summary?.replace(/<[^>]*>/g, '') || 'No summary available'}\n⭐ *Rating:* ${data.rating?.average || 'N/A'}/10\n\n💫 *Powered by TVMaze API*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
            await reply(sock, msg, showInfo);
        } else {
            await reply(sock, msg, `${BOT_STYLES.header}❌ *TV SHOW NOT FOUND*\n${BOT_STYLES.divider}\n\nCould not find TV show: "${title}"\n\n💡 *Try:* \`!tvshow Breaking Bad\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
    } catch (error) {
        console.error('TV Show API error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *API ERROR*\n${BOT_STYLES.divider}\n\nFailed to fetch TV show information.\n\n💡 *Try again later*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handleAnime(sock, msg, title) {
    try {
        if (!title) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!anime <title>\`\n🎯 *Example:* \`!anime Naruto\`\n\n💫 *Get anime information from Jikan API*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const response = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`);
        const data = await response.json();
        
        if (data.data && data.data.length > 0) {
            const anime = data.data[0];
            const animeInfo = `${BOT_STYLES.header}🎌 *ANIME INFO*\n${BOT_STYLES.divider}\n\n🎌 *Title:* ${anime.title}\n🇯🇵 *Japanese:* ${anime.title_japanese}\n📅 *Aired:* ${anime.aired?.from?.split('T')[0] || 'Unknown'}\n📺 *Type:* ${anime.type}\n⏱️ *Episodes:* ${anime.episodes || 'Unknown'}\n⭐ *Score:* ${anime.score}/10\n📊 *Status:* ${anime.status}\n🎭 *Genres:* ${anime.genres?.map(g => g.name).join(', ') || 'Unknown'}\n📝 *Synopsis:* ${anime.synopsis?.substring(0, 200)}...\n\n💫 *Powered by Jikan API*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
            await reply(sock, msg, animeInfo);
        } else {
            await reply(sock, msg, `${BOT_STYLES.header}❌ *ANIME NOT FOUND*\n${BOT_STYLES.divider}\n\nCould not find anime: "${title}"\n\n💡 *Try:* \`!anime Naruto\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
    } catch (error) {
        console.error('Anime API error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *API ERROR*\n${BOT_STYLES.divider}\n\nFailed to fetch anime information.\n\n💡 *Try again later*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

// === GEOGRAPHY & TRAVEL FEATURES ===
async function handleCity(sock, msg, cityName) {
    try {
        if (!cityName) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!city <name>\`\n🎯 *Example:* \`!city Tokyo\`\n\n💫 *Get city information from GeoDB API*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const response = await fetch(`https://wft-geo-db.p.rapidapi.com/v1/geo/cities?namePrefix=${encodeURIComponent(cityName)}&limit=1`, {
            headers: {
                'X-RapidAPI-Key': 'free',
                'X-RapidAPI-Host': 'wft-geo-db.p.rapidapi.com'
            }
        });
        const data = await response.json();
        
        if (data.data && data.data.length > 0) {
            const city = data.data[0];
            const cityInfo = `${BOT_STYLES.header}🏙️ *CITY INFO*\n${BOT_STYLES.divider}\n\n🏙️ *Name:* ${city.name}\n🏛️ *Country:* ${city.country}\n🏛️ *Region:* ${city.region}\n📍 *Coordinates:* ${city.latitude}, ${city.longitude}\n👥 *Population:* ${city.population?.toLocaleString() || 'Unknown'}\n🌍 *Timezone:* ${city.timezoneId || 'Unknown'}\n\n💫 *Powered by GeoDB API*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
            await reply(sock, msg, cityInfo);
        } else {
            await reply(sock, msg, `${BOT_STYLES.header}❌ *CITY NOT FOUND*\n${BOT_STYLES.divider}\n\nCould not find city: "${cityName}"\n\n💡 *Try:* \`!city Tokyo\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
    } catch (error) {
        console.error('City API error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *API ERROR*\n${BOT_STYLES.divider}\n\nFailed to fetch city information.\n\n💡 *Try again later*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handleTimezone(sock, msg, city) {
    try {
        if (!city) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!timezone <city>\`\n🎯 *Example:* \`!timezone New York\`\n\n💫 *Get timezone information from WorldTime API*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const response = await fetch(`https://worldtimeapi.org/api/timezone/America/New_York`);
        const data = await response.json();
        
        const timeInfo = `${BOT_STYLES.header}🕒 *TIMEZONE INFO*\n${BOT_STYLES.divider}\n\n🌍 *Timezone:* ${data.timezone}\n📅 *Date:* ${data.datetime.split('T')[0]}\n⏰ *Time:* ${data.datetime.split('T')[1].split('.')[0]}\n🌍 *Day of Week:* ${data.day_of_week}\n📅 *Day of Year:* ${data.day_of_year}\n🌍 *Week Number:* ${data.week_number}\n\n💫 *Powered by WorldTime API*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
        await reply(sock, msg, timeInfo);
    } catch (error) {
        console.error('Timezone API error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *API ERROR*\n${BOT_STYLES.divider}\n\nFailed to fetch timezone information.\n\n💡 *Try again later*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handleCurrency(sock, msg, amount, from, to) {
    try {
        if (!amount || !from || !to) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!currency <amount> <from> <to>\`\n🎯 *Example:* \`!currency 100 USD EUR\`\n\n💫 *Convert currencies using ExchangeRate API*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${from.toUpperCase()}`);
        const data = await response.json();
        
        if (data.rates && data.rates[to.toUpperCase()]) {
            const rate = data.rates[to.toUpperCase()];
            const converted = (parseFloat(amount) * rate).toFixed(2);
            const currencyInfo = `${BOT_STYLES.header}💱 *CURRENCY CONVERTER*\n${BOT_STYLES.divider}\n\n💰 *Amount:* ${amount} ${from.toUpperCase()}\n💱 *Rate:* 1 ${from.toUpperCase()} = ${rate} ${to.toUpperCase()}\n💵 *Converted:* ${converted} ${to.toUpperCase()}\n📅 *Date:* ${data.date}\n\n💫 *Powered by ExchangeRate API*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
            await reply(sock, msg, currencyInfo);
        } else {
            await reply(sock, msg, `${BOT_STYLES.header}❌ *CURRENCY ERROR*\n${BOT_STYLES.divider}\n\nInvalid currency code: ${to.toUpperCase()}\n\n💡 *Try:* \`!currency 100 USD EUR\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
    } catch (error) {
        console.error('Currency API error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *API ERROR*\n${BOT_STYLES.divider}\n\nFailed to convert currency.\n\n💡 *Try again later*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

// === MUSIC FEATURES ===
async function handleLyrics(sock, msg, song) {
    try {
        if (!song) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!lyrics <song>\`\n🎯 *Example:* \`!lyrics Bohemian Rhapsody\`\n\n💫 *Get song lyrics from Genius API*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const response = await fetch(`https://api.genius.com/search?q=${encodeURIComponent(song)}`, {
            headers: {
                'Authorization': 'Bearer free'
            }
        });
        const data = await response.json();
        
        if (data.response.hits && data.response.hits.length > 0) {
            const hit = data.response.hits[0];
            const lyricsInfo = `${BOT_STYLES.header}🎵 *SONG INFO*\n${BOT_STYLES.divider}\n\n🎵 *Title:* ${hit.result.title}\n👤 *Artist:* ${hit.result.primary_artist.name}\n📅 *Release Date:* ${hit.result.release_date_for_display || 'Unknown'}\n📊 *Genius Views:* ${hit.result.stats.pageviews?.toLocaleString() || 'Unknown'}\n🔗 *Genius URL:* ${hit.result.url}\n\n💫 *Powered by Genius API*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
            await reply(sock, msg, lyricsInfo);
        } else {
            await reply(sock, msg, `${BOT_STYLES.header}❌ *SONG NOT FOUND*\n${BOT_STYLES.divider}\n\nCould not find lyrics for: "${song}"\n\n💡 *Try:* \`!lyrics Bohemian Rhapsody\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
    } catch (error) {
        console.error('Lyrics API error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *API ERROR*\n${BOT_STYLES.divider}\n\nFailed to fetch lyrics.\n\n💡 *Try again later*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

// === EDUCATION FEATURES ===
async function handleWiki(sock, msg, topic) {
    try {
        if (!topic) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!wiki <topic>\`\n🎯 *Example:* \`!wiki Albert Einstein\`\n\n💫 *Get Wikipedia summary from Wikipedia API*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`);
        const data = await response.json();
        
        if (data.extract) {
            const wikiInfo = `${BOT_STYLES.header}📚 *WIKIPEDIA SUMMARY*\n${BOT_STYLES.divider}\n\n📖 *Topic:* ${data.title}\n📝 *Summary:* ${data.extract.substring(0, 300)}...\n🌍 *URL:* ${data.content_urls?.desktop?.page || 'N/A'}\n\n💫 *Powered by Wikipedia API*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
            await reply(sock, msg, wikiInfo);
        } else {
            await reply(sock, msg, `${BOT_STYLES.header}❌ *TOPIC NOT FOUND*\n${BOT_STYLES.divider}\n\nCould not find Wikipedia article for: "${topic}"\n\n💡 *Try:* \`!wiki Albert Einstein\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
    } catch (error) {
        console.error('Wikipedia API error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *API ERROR*\n${BOT_STYLES.divider}\n\nFailed to fetch Wikipedia summary.\n\n💡 *Try again later*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handleCalc(sock, msg, expression) {
    try {
        if (!expression) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!calc <expression>\`\n🎯 *Example:* \`!calc 2+2*3\`\n\n💫 *Calculate mathematical expressions*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        // Simple math evaluation (be careful with eval)
        const result = eval(expression);
        
        if (isFinite(result)) {
            const calcInfo = `${BOT_STYLES.header}🧮 *CALCULATOR*\n${BOT_STYLES.divider}\n\n📝 *Expression:* ${expression}\n✅ *Result:* ${result}\n\n💫 *Try:* \`!calc 2+2*3\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
            await reply(sock, msg, calcInfo);
        } else {
            await reply(sock, msg, `${BOT_STYLES.header}❌ *INVALID EXPRESSION*\n${BOT_STYLES.divider}\n\nInvalid mathematical expression: "${expression}"\n\n💡 *Try:* \`!calc 2+2*3\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
    } catch (error) {
        console.error('Calculator error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *CALCULATION ERROR*\n${BOT_STYLES.divider}\n\nInvalid expression: "${expression}"\n\n💡 *Try:* \`!calc 2+2*3\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

// === CREATIVE FEATURES ===
async function handleColorPalette(sock, msg, hex) {
    try {
        if (!hex) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!colorpalette <hex>\`\n🎯 *Example:* \`!colorpalette #FF0000\`\n\n💫 *Get color information and palette*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        // Remove # if present
        hex = hex.replace('#', '');
        
        // Convert hex to RGB
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        
        if (isNaN(r) || isNaN(g) || isNaN(b)) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *INVALID HEX COLOR*\n${BOT_STYLES.divider}\n\nInvalid hex color: #${hex}\n\n💡 *Try:* \`!colorpalette #FF0000\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const colorInfo = `${BOT_STYLES.header}🎨 *COLOR PALETTE*\n${BOT_STYLES.divider}\n\n🎨 *Hex:* #${hex.toUpperCase()}\n🔴 *RGB:* ${r}, ${g}, ${b}\n\n💫 *Color Information*\n• Red: ${r}\n• Green: ${g}\n• Blue: ${b}\n\n💫 *Try:* \`!colorpalette #FF0000\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
        await reply(sock, msg, colorInfo);
    } catch (error) {
        console.error('Color palette error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *COLOR ERROR*\n${BOT_STYLES.divider}\n\nFailed to process color.\n\n💡 *Try:* \`!colorpalette #FF0000\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handleEmojiMeaning(sock, msg, emoji) {
    try {
        if (!emoji) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!emoji <emoji>\`\n🎯 *Example:* \`!emoji 😀\`\n\n💫 *Get emoji meaning and information*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const emojiInfo = `${BOT_STYLES.header}😀 *EMOJI INFO*\n${BOT_STYLES.divider}\n\n😀 *Emoji:* ${emoji}\n📝 *Unicode:* ${emoji.codePointAt(0).toString(16).toUpperCase()}\n💭 *Meaning:* Expresses emotion or concept\n\n💫 *Emoji Information*\n• Unicode: U+${emoji.codePointAt(0).toString(16).toUpperCase()}\n• Character: ${emoji}\n• Length: ${emoji.length} character(s)\n\n💫 *Try:* \`!emoji 😀\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
        await reply(sock, msg, emojiInfo);
    } catch (error) {
        console.error('Emoji meaning error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *EMOJI ERROR*\n${BOT_STYLES.divider}\n\nFailed to process emoji.\n\n💡 *Try:* \`!emoji 😀\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

// === HEALTH & FITNESS FEATURES ===
async function handleBMI(sock, msg, weight, height) {
    try {
        if (!weight || !height) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!bmi <weight_kg> <height_m>\`\n🎯 *Example:* \`!bmi 70 1.75\`\n\n💫 *Calculate BMI (Body Mass Index)*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const weightKg = parseFloat(weight);
        const heightM = parseFloat(height);
        
        if (isNaN(weightKg) || isNaN(heightM)) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *INVALID VALUES*\n${BOT_STYLES.divider}\n\nPlease provide valid numbers for weight and height.\n\n💡 *Try:* \`!bmi 70 1.75\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const bmi = weightKg / (heightM * heightM);
        let category = '';
        
        if (bmi < 18.5) category = 'Underweight';
        else if (bmi < 25) category = 'Normal weight';
        else if (bmi < 30) category = 'Overweight';
        else category = 'Obese';
        
        const bmiInfo = `${BOT_STYLES.header}⚖️ *BMI CALCULATOR*\n${BOT_STYLES.divider}\n\n⚖️ *Weight:* ${weightKg} kg\n📏 *Height:* ${heightM} m\n📊 *BMI:* ${bmi.toFixed(1)}\n📋 *Category:* ${category}\n\n💫 *BMI Categories:*\n• Under 18.5: Underweight\n• 18.5-24.9: Normal weight\n• 25-29.9: Overweight\n• 30+: Obese\n\n💫 *Try:* \`!bmi 70 1.75\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
        await reply(sock, msg, bmiInfo);
    } catch (error) {
        console.error('BMI calculator error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *CALCULATION ERROR*\n${BOT_STYLES.divider}\n\nFailed to calculate BMI.\n\n💡 *Try:* \`!bmi 70 1.75\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

// === PRODUCTIVITY FEATURES ===
async function handlePomodoro(sock, msg) {
    try {
        const pomodoroInfo = `${BOT_STYLES.header}🍅 *POMODORO TIMER*\n${BOT_STYLES.divider}\n\n🍅 *Pomodoro Technique:*\n• 25 minutes of focused work\n• 5 minutes break\n• Repeat 4 times\n• Take a 15-30 minute break\n\n⏰ *Timer Started:* 25 minutes\n🔄 *Next Break:* 5 minutes\n\n💫 *Focus on your task!*\n⏰ *Timer will notify you*\n\n💫 *Productivity tip:* Stay focused!${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
        await reply(sock, msg, pomodoroInfo);
        
        // Set a reminder for 25 minutes
        setTimeout(async () => {
            await reply(sock, msg, `${BOT_STYLES.header}⏰ *POMODORO BREAK TIME!*\n${BOT_STYLES.divider}\n\n🍅 *25 minutes completed!*\n⏰ *Take a 5-minute break*\n\n💫 *Great work! Time to rest.*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }, 25 * 60 * 1000); // 25 minutes
    } catch (error) {
        console.error('Pomodoro error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *TIMER ERROR*\n${BOT_STYLES.divider}\n\nFailed to start Pomodoro timer.\n\n💡 *Try again*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

// === FUN GAMES FEATURES ===
async function handleDadJoke(sock, msg) {
    try {
        const response = await fetch('https://icanhazdadjoke.com/', {
            headers: {
                'Accept': 'application/json'
            }
        });
        const data = await response.json();
        
        const jokeInfo = `${BOT_STYLES.header}👨 *DAD JOKE*\n${BOT_STYLES.divider}\n\n😄 *Joke:* ${data.joke}\n\n💫 *Powered by icanhazdadjoke.com*\n🎭 *Category:* Dad Humor${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
        await reply(sock, msg, jokeInfo);
    } catch (error) {
        console.error('Dad joke API error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *JOKE ERROR*\n${BOT_STYLES.divider}\n\nFailed to fetch dad joke.\n\n💡 *Try again later*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handleRiddle(sock, msg) {
    try {
        const riddles = [
            { question: "What has keys, but no locks; space, but no room; and you can enter, but not go in?", answer: "A keyboard" },
            { question: "What gets wetter and wetter the more it dries?", answer: "A towel" },
            { question: "What has a head and a tail but no body?", answer: "A coin" },
            { question: "What comes once in a minute, twice in a moment, but never in a thousand years?", answer: "The letter 'M'" },
            { question: "What is always in front of you but can't be seen?", answer: "The future" }
        ];
        
        const randomRiddle = riddles[Math.floor(Math.random() * riddles.length)];
        
        const riddleInfo = `${BOT_STYLES.header}🤔 *RIDDLE*\n${BOT_STYLES.divider}\n\n❓ *Question:* ${randomRiddle.question}\n\n💡 *Think about it...*\n🎯 *Answer will be revealed in 30 seconds*\n\n💫 *Challenge your mind!*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
        await reply(sock, msg, riddleInfo);
        
        // Reveal answer after 30 seconds
        setTimeout(async () => {
            await reply(sock, msg, `${BOT_STYLES.header}💡 *RIDDLE ANSWER*\n${BOT_STYLES.divider}\n\n✅ *Answer:* ${randomRiddle.answer}\n\n💫 *Did you get it right?*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }, 30000);
    } catch (error) {
        console.error('Riddle error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *RIDDLE ERROR*\n${BOT_STYLES.divider}\n\nFailed to generate riddle.\n\n💡 *Try again*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

// === DATA ANALYTICS FEATURES ===
async function handleCryptoPrice(sock, msg, coin) {
    try {
        if (!coin) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!cryptoprice <coin>\`\n🎯 *Example:* \`!cryptoprice bitcoin\`\n\n💫 *Get cryptocurrency price from CoinGecko API*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coin.toLowerCase()}&vs_currencies=usd&include_24hr_change=true`);
        const data = await response.json();
        
        if (data[coin.toLowerCase()]) {
            const crypto = data[coin.toLowerCase()];
            const cryptoInfo = `${BOT_STYLES.header}₿ *CRYPTO PRICE*\n${BOT_STYLES.divider}\n\n₿ *Coin:* ${coin.toUpperCase()}\n💵 *Price:* $${crypto.usd?.toLocaleString() || 'N/A'}\n📈 *24h Change:* ${crypto.usd_24h_change?.toFixed(2) || 'N/A'}%\n\n💫 *Powered by CoinGecko API*\n📊 *Real-time data*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
            await reply(sock, msg, cryptoInfo);
        } else {
            await reply(sock, msg, `${BOT_STYLES.header}❌ *CRYPTO NOT FOUND*\n${BOT_STYLES.divider}\n\nCould not find cryptocurrency: "${coin}"\n\n💡 *Try:* \`!cryptoprice bitcoin\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
    } catch (error) {
        console.error('Crypto API error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *API ERROR*\n${BOT_STYLES.divider}\n\nFailed to fetch cryptocurrency price.\n\n💡 *Try again later*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

// === DEVELOPER TOOLS ===
async function handleCodeFormat(sock, msg, code) {
    try {
        if (!code) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!format <code>\`\n🎯 *Example:* \`!format console.log("hello")\`\n\n💫 *Format code for better readability*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        // Simple code formatting (basic indentation)
        const formattedCode = code.replace(/;/g, ';\n').replace(/\{/g, ' {\n').replace(/\}/g, '\n}');
        
        const formatInfo = `${BOT_STYLES.header}💻 *CODE FORMATTER*\n${BOT_STYLES.divider}\n\n📝 *Original:*\n\`\`\`\n${code}\n\`\`\`\n\n✨ *Formatted:*\n\`\`\`\n${formattedCode}\n\`\`\`\n\n💫 *Basic code formatting*\n🔧 *Developer tool*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
        await reply(sock, msg, formatInfo);
    } catch (error) {
        console.error('Code format error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *FORMAT ERROR*\n${BOT_STYLES.divider}\n\nFailed to format code.\n\n💡 *Try again*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handleHash(sock, msg, text) {
    try {
        if (!text) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!hash <text>\`\n🎯 *Example:* \`!hash hello world\`\n\n💫 *Generate hash of text*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const crypto = require('crypto');
        const md5 = crypto.createHash('md5').update(text).digest('hex');
        const sha1 = crypto.createHash('sha1').update(text).digest('hex');
        const sha256 = crypto.createHash('sha256').update(text).digest('hex');
        
        const hashInfo = `${BOT_STYLES.header}🔐 *HASH GENERATOR*\n${BOT_STYLES.divider}\n\n📝 *Text:* ${text}\n\n🔐 *Hashes:*\n• MD5: \`${md5}\`\n• SHA1: \`${sha1}\`\n• SHA256: \`${sha256}\`\n\n💫 *Cryptographic hashes*\n🔧 *Developer tool*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
        await reply(sock, msg, hashInfo);
    } catch (error) {
        console.error('Hash generator error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *HASH ERROR*\n${BOT_STYLES.divider}\n\nFailed to generate hash.\n\n💡 *Try again*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

// === SPECIAL FEATURES ===
async function handleHoroscope(sock, msg, sign) {
    try {
        if (!sign) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!horoscope <sign>\`\n🎯 *Example:* \`!horoscope aries\`\n\n💫 *Get daily horoscope from Horoscope API*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const response = await fetch(`https://horoscope-api.herokuapp.com/horoscope/today/${sign.toLowerCase()}`);
        const data = await response.json();
        
        if (data.horoscope) {
            const horoscopeInfo = `${BOT_STYLES.header}⭐ *HOROSCOPE*\n${BOT_STYLES.divider}\n\n⭐ *Sign:* ${sign.toUpperCase()}\n📅 *Date:* ${data.date}\n💫 *Horoscope:* ${data.horoscope}\n\n💫 *Powered by Horoscope API*\n✨ *Daily guidance*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
            await reply(sock, msg, horoscopeInfo);
        } else {
            await reply(sock, msg, `${BOT_STYLES.header}❌ *SIGN NOT FOUND*\n${BOT_STYLES.divider}\n\nCould not find horoscope for: "${sign}"\n\n💡 *Try:* \`!horoscope aries\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
    } catch (error) {
        console.error('Horoscope API error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *API ERROR*\n${BOT_STYLES.divider}\n\nFailed to fetch horoscope.\n\n💡 *Try again later*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handlePetFact(sock, msg) {
    try {
        const petFacts = [
            "Cats spend 70% of their lives sleeping.",
            "Dogs have a sense of smell 40 times greater than humans.",
            "A group of lions is called a pride.",
            "Elephants are the only mammals that can't jump.",
            "A cat's purr vibrates at a frequency that promotes bone healing.",
            "Dogs have three eyelids.",
            "A goldfish has a memory span of three seconds.",
            "Cats can make over 100 vocal sounds.",
            "Dogs can understand up to 250 words and gestures.",
            "A cat's whiskers help them determine if they can fit through a space."
        ];
        
        const randomFact = petFacts[Math.floor(Math.random() * petFacts.length)];
        
        const petFactInfo = `${BOT_STYLES.header}🐾 *PET FACT*\n${BOT_STYLES.divider}\n\n🐾 *Fact:* ${randomFact}\n\n💫 *Learn something new about pets!*\n🐕 *Animal knowledge*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
        await reply(sock, msg, petFactInfo);
    } catch (error) {
        console.error('Pet fact error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *FACT ERROR*\n${BOT_STYLES.divider}\n\nFailed to generate pet fact.\n\n💡 *Try again*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

// === ADVANCED LOGICAL FEATURES ===

// === AI & MACHINE LEARNING FEATURES ===
async function handleNeuralNetwork(sock, msg, input) {
    try {
        if (!input) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!neural <input>\`\n🎯 *Example:* \`!neural 1010\`\n\n💫 *Neural network simulation*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        // Simple neural network simulation
        const weights = [0.5, 0.3, 0.8, 0.2];
        const bias = 0.1;
        let output = 0;
        
        for (let i = 0; i < Math.min(input.length, weights.length); i++) {
            output += parseInt(input[i]) * weights[i];
        }
        output += bias;
        
        const activation = output > 0.5 ? 1 : 0;
        
        const neuralInfo = `${BOT_STYLES.header}🧠 *NEURAL NETWORK*\n${BOT_STYLES.divider}\n\n📥 *Input:* ${input}\n⚖️ *Weights:* ${weights.join(', ')}\n🎯 *Bias:* ${bias}\n📊 *Raw Output:* ${output.toFixed(3)}\n🎯 *Activation:* ${activation}\n\n💫 *Simple neural network simulation*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
        await reply(sock, msg, neuralInfo);
    } catch (error) {
        console.error('Neural network error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *NEURAL ERROR*\n${BOT_STYLES.divider}\n\nFailed to process neural network.\n\n💡 *Try:* \`!neural 1010\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handleDeepLearning(sock, msg, data) {
    try {
        if (!data) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!deeplearn <data>\`\n🎯 *Example:* \`!deeplearn 1,2,3,4,5\`\n\n💫 *Deep learning analysis*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const numbers = data.split(',').map(n => parseFloat(n.trim()));
        const avg = numbers.reduce((a, b) => a + b, 0) / numbers.length;
        const variance = numbers.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / numbers.length;
        const stdDev = Math.sqrt(variance);
        
        const deepInfo = `${BOT_STYLES.header}🎯 *DEEP LEARNING ANALYSIS*\n${BOT_STYLES.divider}\n\n📊 *Data:* ${numbers.join(', ')}\n📈 *Mean:* ${avg.toFixed(2)}\n📊 *Variance:* ${variance.toFixed(2)}\n📈 *Std Deviation:* ${stdDev.toFixed(2)}\n\n💫 *Statistical deep learning analysis*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
        await reply(sock, msg, deepInfo);
    } catch (error) {
        console.error('Deep learning error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *DEEP LEARNING ERROR*\n${BOT_STYLES.divider}\n\nFailed to analyze data.\n\n💡 *Try:* \`!deeplearn 1,2,3,4,5\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handleComputerVision(sock, msg, description) {
    try {
        if (!description) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!vision <description>\`\n🎯 *Example:* \`!vision red car\`\n\n💫 *Computer vision analysis*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const objects = ['car', 'person', 'building', 'tree', 'animal', 'object'];
        const colors = ['red', 'blue', 'green', 'yellow', 'black', 'white'];
        const detected = objects.filter(obj => description.toLowerCase().includes(obj));
        const detectedColors = colors.filter(color => description.toLowerCase().includes(color));
        
        const visionInfo = `${BOT_STYLES.header}🔍 *COMPUTER VISION*\n${BOT_STYLES.divider}\n\n📸 *Description:* ${description}\n🎯 *Detected Objects:* ${detected.length > 0 ? detected.join(', ') : 'None'}\n🎨 *Detected Colors:* ${detectedColors.length > 0 ? detectedColors.join(', ') : 'None'}\n📊 *Confidence:* ${Math.random() * 100 + 50}%\n\n💫 *Computer vision analysis simulation*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
        await reply(sock, msg, visionInfo);
    } catch (error) {
        console.error('Computer vision error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *VISION ERROR*\n${BOT_STYLES.divider}\n\nFailed to analyze image.\n\n💡 *Try:* \`!vision red car\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

// === SPACE & ASTRONOMY FEATURES ===
async function handlePlanet(sock, msg, name) {
    try {
        if (!name) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!planet <name>\`\n🎯 *Example:* \`!planet Mars\`\n\n💫 *Planet information*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const planets = {
            'mercury': { distance: '57.9M km', diameter: '4,879 km', moons: 0 },
            'venus': { distance: '108.2M km', diameter: '12,104 km', moons: 0 },
            'earth': { distance: '149.6M km', diameter: '12,756 km', moons: 1 },
            'mars': { distance: '227.9M km', diameter: '6,792 km', moons: 2 },
            'jupiter': { distance: '778.5M km', diameter: '142,984 km', moons: 79 },
            'saturn': { distance: '1.4B km', diameter: '120,536 km', moons: 82 },
            'uranus': { distance: '2.9B km', diameter: '51,118 km', moons: 27 },
            'neptune': { distance: '4.5B km', diameter: '49,528 km', moons: 14 }
        };
        
        const planet = planets[name.toLowerCase()];
        if (planet) {
            const planetInfo = `${BOT_STYLES.header}🌍 *PLANET INFO*\n${BOT_STYLES.divider}\n\n🌍 *Planet:* ${name.charAt(0).toUpperCase() + name.slice(1)}\n📏 *Distance from Sun:* ${planet.distance}\n📐 *Diameter:* ${planet.diameter}\n🌙 *Moons:* ${planet.moons}\n\n💫 *Astronomical data*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
            await reply(sock, msg, planetInfo);
        } else {
            await reply(sock, msg, `${BOT_STYLES.header}❌ *PLANET NOT FOUND*\n${BOT_STYLES.divider}\n\nCould not find planet: "${name}"\n\n💡 *Try:* \`!planet Mars\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
    } catch (error) {
        console.error('Planet error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *PLANET ERROR*\n${BOT_STYLES.divider}\n\nFailed to fetch planet data.\n\n💡 *Try:* \`!planet Mars\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handleStar(sock, msg, name) {
    try {
        if (!name) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!star <name>\`\n🎯 *Example:* \`!star Sirius\`\n\n💫 *Star information*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const stars = {
            'sirius': { distance: '8.6 ly', magnitude: -1.46, type: 'Binary Star' },
            'polaris': { distance: '433 ly', magnitude: 1.97, type: 'Yellow Supergiant' },
            'vega': { distance: '25 ly', magnitude: 0.03, type: 'White Dwarf' },
            'betelgeuse': { distance: '642 ly', magnitude: 0.42, type: 'Red Supergiant' },
            'rigel': { distance: '860 ly', magnitude: 0.12, type: 'Blue Supergiant' }
        };
        
        const star = stars[name.toLowerCase()];
        if (star) {
            const starInfo = `${BOT_STYLES.header}⭐ *STAR INFO*\n${BOT_STYLES.divider}\n\n⭐ *Star:* ${name.charAt(0).toUpperCase() + name.slice(1)}\n📏 *Distance:* ${star.distance}\n🌟 *Magnitude:* ${star.magnitude}\n🔭 *Type:* ${star.type}\n\n💫 *Astronomical data*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
            await reply(sock, msg, starInfo);
        } else {
            await reply(sock, msg, `${BOT_STYLES.header}❌ *STAR NOT FOUND*\n${BOT_STYLES.divider}\n\nCould not find star: "${name}"\n\n💡 *Try:* \`!star Sirius\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
    } catch (error) {
        console.error('Star error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *STAR ERROR*\n${BOT_STYLES.divider}\n\nFailed to fetch star data.\n\n💡 *Try:* \`!star Sirius\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

// === QUANTUM COMPUTING FEATURES ===
async function handleQuantumCircuit(sock, msg, circuit) {
    try {
        if (!circuit) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!quantum <circuit>\`\n🎯 *Example:* \`!quantum H-X-H\`\n\n💫 *Quantum circuit simulation*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const gates = circuit.split('-');
        let state = [1, 0]; // Initial state |0⟩
        
        gates.forEach(gate => {
            switch(gate.toUpperCase()) {
                case 'H': // Hadamard gate
                    state = [(state[0] + state[1])/Math.sqrt(2), (state[0] - state[1])/Math.sqrt(2)];
                    break;
                case 'X': // Pauli-X gate
                    state = [state[1], state[0]];
                    break;
                case 'Z': // Pauli-Z gate
                    state = [state[0], -state[1]];
                    break;
            }
        });
        
        const quantumInfo = `${BOT_STYLES.header}⚛️ *QUANTUM CIRCUIT*\n${BOT_STYLES.divider}\n\n⚛️ *Circuit:* ${circuit}\n🎯 *Gates:* ${gates.join(' → ')}\n📊 *Final State:* [${state[0].toFixed(3)}, ${state[1].toFixed(3)}]\n📈 *Probability |0⟩:* ${(state[0]**2 * 100).toFixed(1)}%\n📈 *Probability |1⟩:* ${(state[1]**2 * 100).toFixed(1)}%\n\n💫 *Quantum circuit simulation*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
        await reply(sock, msg, quantumInfo);
    } catch (error) {
        console.error('Quantum circuit error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *QUANTUM ERROR*\n${BOT_STYLES.divider}\n\nFailed to simulate quantum circuit.\n\n💡 *Try:* \`!quantum H-X-H\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handleQubit(sock, msg, state) {
    try {
        if (!state) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!qubit <state>\`\n🎯 *Example:* \`!qubit 0\`\n\n💫 *Qubit state analysis*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const states = {
            '0': { ket: '|0⟩', vector: [1, 0], description: 'Ground state' },
            '1': { ket: '|1⟩', vector: [0, 1], description: 'Excited state' },
            '+': { ket: '|+⟩', vector: [1/Math.sqrt(2), 1/Math.sqrt(2)], description: 'Superposition +' },
            '-': { ket: '|-⟩', vector: [1/Math.sqrt(2), -1/Math.sqrt(2)], description: 'Superposition -' }
        };
        
        const qubitState = states[state];
        if (qubitState) {
            const qubitInfo = `${BOT_STYLES.header}⚛️ *QUBIT STATE*\n${BOT_STYLES.divider}\n\n⚛️ *State:* ${qubitState.ket}\n📊 *Vector:* [${qubitState.vector[0].toFixed(3)}, ${qubitState.vector[1].toFixed(3)}]\n📝 *Description:* ${qubitState.description}\n📈 *Probability |0⟩:* ${(qubitState.vector[0]**2 * 100).toFixed(1)}%\n📈 *Probability |1⟩:* ${(qubitState.vector[1]**2 * 100).toFixed(1)}%\n\n💫 *Qubit state analysis*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
            await reply(sock, msg, qubitInfo);
        } else {
            await reply(sock, msg, `${BOT_STYLES.header}❌ *INVALID STATE*\n${BOT_STYLES.divider}\n\nInvalid qubit state: "${state}"\n\n💡 *Try:* \`!qubit 0\` or \`!qubit +\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
    } catch (error) {
        console.error('Qubit error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *QUBIT ERROR*\n${BOT_STYLES.divider}\n\nFailed to analyze qubit state.\n\n💡 *Try:* \`!qubit 0\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

// === PREDICTIVE LOGIC FEATURES ===
async function handlePredict(sock, msg, type, data) {
    try {
        if (!type || !data) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!predict <type> <data>\`\n🎯 *Example:* \`!predict weather sunny\`\n\n💫 *Predictive analysis*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const predictions = {
            'weather': {
                'sunny': 'High chance of clear skies tomorrow',
                'rainy': 'Expect precipitation in the next 24 hours',
                'cloudy': 'Overcast conditions likely to continue'
            },
            'market': {
                'bull': 'Market likely to trend upward',
                'bear': 'Market may experience downward pressure',
                'stable': 'Market expected to remain stable'
            },
            'trend': {
                'up': 'Trend analysis shows upward movement',
                'down': 'Trend analysis shows downward movement',
                'sideways': 'Trend expected to remain horizontal'
            }
        };
        
        const prediction = predictions[type.toLowerCase()]?.[data.toLowerCase()];
        if (prediction) {
            const predictInfo = `${BOT_STYLES.header}🔮 *PREDICTION*\n${BOT_STYLES.divider}\n\n🔮 *Type:* ${type.toUpperCase()}\n📊 *Input:* ${data.toUpperCase()}\n🎯 *Prediction:* ${prediction}\n📈 *Confidence:* ${Math.floor(Math.random() * 30 + 70)}%\n\n💫 *Predictive analysis*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
            await reply(sock, msg, predictInfo);
        } else {
            await reply(sock, msg, `${BOT_STYLES.header}❌ *PREDICTION ERROR*\n${BOT_STYLES.divider}\n\nInvalid prediction type or data.\n\n💡 *Try:* \`!predict weather sunny\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
    } catch (error) {
        console.error('Prediction error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *PREDICTION ERROR*\n${BOT_STYLES.divider}\n\nFailed to generate prediction.\n\n💡 *Try:* \`!predict weather sunny\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

// === ADVANCED ANALYTICS FEATURES ===
async function handleBigData(sock, msg, dataset) {
    try {
        if (!dataset) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!bigdata <dataset>\`\n🎯 *Example:* \`!bigdata 1,2,3,4,5,6,7,8,9,10\`\n\n💫 *Big data analysis*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const numbers = dataset.split(',').map(n => parseFloat(n.trim()));
        const sum = numbers.reduce((a, b) => a + b, 0);
        const mean = sum / numbers.length;
        const sorted = numbers.sort((a, b) => a - b);
        const median = sorted.length % 2 === 0 ? 
            (sorted[sorted.length/2 - 1] + sorted[sorted.length/2]) / 2 : 
            sorted[Math.floor(sorted.length/2)];
        
        const bigDataInfo = `${BOT_STYLES.header}📊 *BIG DATA ANALYSIS*\n${BOT_STYLES.divider}\n\n📊 *Dataset Size:* ${numbers.length} values\n📈 *Sum:* ${sum}\n📊 *Mean:* ${mean.toFixed(2)}\n📈 *Median:* ${median.toFixed(2)}\n📊 *Min:* ${Math.min(...numbers)}\n📈 *Max:* ${Math.max(...numbers)}\n\n💫 *Big data statistical analysis*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
        await reply(sock, msg, bigDataInfo);
    } catch (error) {
        console.error('Big data error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *BIG DATA ERROR*\n${BOT_STYLES.divider}\n\nFailed to analyze dataset.\n\n💡 *Try:* \`!bigdata 1,2,3,4,5\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handleRealtime(sock, msg, data) {
    try {
        if (!data) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!realtime <data>\`\n🎯 *Example:* \`!realtime 100,200,300\`\n\n💫 *Real-time analytics*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const numbers = data.split(',').map(n => parseFloat(n.trim()));
        const latest = numbers[numbers.length - 1];
        const previous = numbers[numbers.length - 2] || 0;
        const change = latest - previous;
        const changePercent = previous !== 0 ? (change / previous * 100) : 0;
        
        const realtimeInfo = `${BOT_STYLES.header}📊 *REAL-TIME ANALYTICS*\n${BOT_STYLES.divider}\n\n📊 *Latest Value:* ${latest}\n📈 *Previous Value:* ${previous}\n📊 *Change:* ${change > 0 ? '+' : ''}${change.toFixed(2)}\n📈 *Change %:* ${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%\n⏰ *Timestamp:* ${new Date().toISOString()}\n\n💫 *Real-time data analysis*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
        await reply(sock, msg, realtimeInfo);
    } catch (error) {
        console.error('Real-time analytics error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *REAL-TIME ERROR*\n${BOT_STYLES.divider}\n\nFailed to analyze real-time data.\n\n💡 *Try:* \`!realtime 100,200,300\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

// === CRYPTOGRAPHY FEATURES ===
async function handleEncrypt(sock, msg, message) {
    try {
        if (!message) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!encrypt <message>\`\n🎯 *Example:* \`!encrypt Hello World\`\n\n💫 *Message encryption*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        // Simple Caesar cipher encryption
        const shift = 3;
        const encrypted = message.split('').map(char => {
            if (char.match(/[a-zA-Z]/)) {
                const code = char.charCodeAt(0);
                const isUpperCase = code >= 65 && code <= 90;
                const base = isUpperCase ? 65 : 97;
                return String.fromCharCode(((code - base + shift) % 26) + base);
            }
            return char;
        }).join('');
        
        const encryptInfo = `${BOT_STYLES.header}🔐 *ENCRYPTION*\n${BOT_STYLES.divider}\n\n📝 *Original:* ${message}\n🔐 *Encrypted:* ${encrypted}\n🔑 *Method:* Caesar Cipher (shift ${shift})\n🔒 *Security:* Basic encryption\n\n💫 *Message encryption*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
        await reply(sock, msg, encryptInfo);
    } catch (error) {
        console.error('Encryption error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *ENCRYPTION ERROR*\n${BOT_STYLES.divider}\n\nFailed to encrypt message.\n\n💡 *Try:* \`!encrypt Hello World\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

async function handleDecrypt(sock, msg, message) {
    try {
        if (!message) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!decrypt <message>\`\n🎯 *Example:* \`!decrypt Khoor Zruog\`\n\n💫 *Message decryption*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        // Simple Caesar cipher decryption
        const shift = 3;
        const decrypted = message.split('').map(char => {
            if (char.match(/[a-zA-Z]/)) {
                const code = char.charCodeAt(0);
                const isUpperCase = code >= 65 && code <= 90;
                const base = isUpperCase ? 65 : 97;
                return String.fromCharCode(((code - base - shift + 26) % 26) + base);
            }
            return char;
        }).join('');
        
        const decryptInfo = `${BOT_STYLES.header}🔓 *DECRYPTION*\n${BOT_STYLES.divider}\n\n🔐 *Encrypted:* ${message}\n📝 *Decrypted:* ${decrypted}\n🔑 *Method:* Caesar Cipher (shift ${shift})\n🔓 *Security:* Basic decryption\n\n💫 *Message decryption*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
        await reply(sock, msg, decryptInfo);
    } catch (error) {
        console.error('Decryption error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *DECRYPTION ERROR*\n${BOT_STYLES.divider}\n\nFailed to decrypt message.\n\n💡 *Try:* \`!decrypt Khoor Zruog\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

// === GENETIC & BIOLOGICAL FEATURES ===
async function handleDNA(sock, msg, sequence) {
    try {
        if (!sequence) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!dna <sequence>\`\n🎯 *Example:* \`!dna ATGC\`\n\n💫 *DNA analysis*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const validBases = ['A', 'T', 'G', 'C'];
        const sequenceUpper = sequence.toUpperCase();
        const isValid = sequenceUpper.split('').every(base => validBases.includes(base));
        
        if (isValid) {
            const length = sequenceUpper.length;
            const aCount = (sequenceUpper.match(/A/g) || []).length;
            const tCount = (sequenceUpper.match(/T/g) || []).length;
            const gCount = (sequenceUpper.match(/G/g) || []).length;
            const cCount = (sequenceUpper.match(/C/g) || []).length;
            
            const dnaInfo = `${BOT_STYLES.header}🧬 *DNA ANALYSIS*\n${BOT_STYLES.divider}\n\n🧬 *Sequence:* ${sequenceUpper}\n📏 *Length:* ${length} bases\n\n📊 *Base Counts:*\n• Adenine (A): ${aCount}\n• Thymine (T): ${tCount}\n• Guanine (G): ${gCount}\n• Cytosine (C): ${cCount}\n\n💫 *DNA sequence analysis*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
            await reply(sock, msg, dnaInfo);
        } else {
            await reply(sock, msg, `${BOT_STYLES.header}❌ *INVALID DNA*\n${BOT_STYLES.divider}\n\nInvalid DNA sequence. Only A, T, G, C allowed.\n\n💡 *Try:* \`!dna ATGC\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
    } catch (error) {
        console.error('DNA analysis error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *DNA ERROR*\n${BOT_STYLES.divider}\n\nFailed to analyze DNA sequence.\n\n💡 *Try:* \`!dna ATGC\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

// === ENGINEERING FEATURES ===
async function handleStructure(sock, msg, design) {
    try {
        if (!design) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!structure <design>\`\n🎯 *Example:* \`!structure bridge\`\n\n💫 *Structural analysis*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const structures = {
            'bridge': { type: 'Suspension Bridge', load: 'High', materials: 'Steel, Concrete' },
            'building': { type: 'Skyscraper', load: 'Very High', materials: 'Steel, Glass, Concrete' },
            'tower': { type: 'Communication Tower', load: 'Medium', materials: 'Steel, Aluminum' },
            'dam': { type: 'Hydroelectric Dam', load: 'Extreme', materials: 'Concrete, Steel' }
        };
        
        const structure = structures[design.toLowerCase()];
        if (structure) {
            const structureInfo = `${BOT_STYLES.header}🏗️ *STRUCTURAL ANALYSIS*\n${BOT_STYLES.divider}\n\n🏗️ *Design:* ${design.toUpperCase()}\n📐 *Type:* ${structure.type}\n⚖️ *Load Capacity:* ${structure.load}\n🔧 *Materials:* ${structure.materials}\n📊 *Safety Factor:* ${Math.floor(Math.random() * 20 + 80)}%\n\n💫 *Structural engineering analysis*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
            await reply(sock, msg, structureInfo);
        } else {
            await reply(sock, msg, `${BOT_STYLES.header}❌ *STRUCTURE NOT FOUND*\n${BOT_STYLES.divider}\n\nCould not analyze structure: "${design}"\n\n💡 *Try:* \`!structure bridge\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
    } catch (error) {
        console.error('Structural analysis error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *STRUCTURE ERROR*\n${BOT_STYLES.divider}\n\nFailed to analyze structure.\n\n💡 *Try:* \`!structure bridge\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

// === COGNITIVE SCIENCE FEATURES ===
async function handleBrain(sock, msg, region) {
    try {
        if (!region) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!brain <region>\`\n🎯 *Example:* \`!brain frontal\`\n\n💫 *Brain function analysis*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const regions = {
            'frontal': { function: 'Decision Making, Planning', activity: 'High', importance: 'Critical' },
            'temporal': { function: 'Memory, Language', activity: 'High', importance: 'Critical' },
            'parietal': { function: 'Sensory Processing', activity: 'Medium', importance: 'Important' },
            'occipital': { function: 'Visual Processing', activity: 'High', importance: 'Critical' },
            'cerebellum': { function: 'Motor Control, Balance', activity: 'Medium', importance: 'Important' }
        };
        
        const brainRegion = regions[region.toLowerCase()];
        if (brainRegion) {
            const brainInfo = `${BOT_STYLES.header}🧠 *BRAIN REGION*\n${BOT_STYLES.divider}\n\n🧠 *Region:* ${region.toUpperCase()} Lobe\n⚡ *Function:* ${brainRegion.function}\n📊 *Activity Level:* ${brainRegion.activity}\n⭐ *Importance:* ${brainRegion.importance}\n📈 *Neural Density:* ${Math.floor(Math.random() * 50 + 50)}M neurons\n\n💫 *Brain function analysis*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
            await reply(sock, msg, brainInfo);
        } else {
            await reply(sock, msg, `${BOT_STYLES.header}❌ *REGION NOT FOUND*\n${BOT_STYLES.divider}\n\nCould not find brain region: "${region}"\n\n💡 *Try:* \`!brain frontal\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
    } catch (error) {
        console.error('Brain analysis error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *BRAIN ERROR*\n${BOT_STYLES.divider}\n\nFailed to analyze brain region.\n\n💡 *Try:* \`!brain frontal\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

// === ENVIRONMENTAL FEATURES ===
async function handleClimate(sock, msg, region) {
    try {
        if (!region) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!climate <region>\`\n🎯 *Example:* \`!climate tropical\`\n\n💫 *Climate analysis*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const climates = {
            'tropical': { temp: '25-30°C', rainfall: 'High', vegetation: 'Rainforest' },
            'desert': { temp: '20-45°C', rainfall: 'Low', vegetation: 'Cactus, Shrubs' },
            'temperate': { temp: '10-20°C', rainfall: 'Moderate', vegetation: 'Deciduous Forest' },
            'arctic': { temp: '-40-10°C', rainfall: 'Low', vegetation: 'Tundra' }
        };
        
        const climate = climates[region.toLowerCase()];
        if (climate) {
            const climateInfo = `${BOT_STYLES.header}🌍 *CLIMATE ANALYSIS*\n${BOT_STYLES.divider}\n\n🌍 *Region:* ${region.toUpperCase()}\n🌡️ *Temperature:* ${climate.temp}\n🌧️ *Rainfall:* ${climate.rainfall}\n🌱 *Vegetation:* ${climate.vegetation}\n📊 *Climate Change Risk:* ${Math.floor(Math.random() * 30 + 20)}%\n\n💫 *Climate data analysis*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
            await reply(sock, msg, climateInfo);
        } else {
            await reply(sock, msg, `${BOT_STYLES.header}❌ *CLIMATE NOT FOUND*\n${BOT_STYLES.divider}\n\nCould not find climate data for: "${region}"\n\n💡 *Try:* \`!climate tropical\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
    } catch (error) {
        console.error('Climate analysis error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *CLIMATE ERROR*\n${BOT_STYLES.divider}\n\nFailed to analyze climate.\n\n💡 *Try:* \`!climate tropical\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

// === MEDICAL FEATURES ===
async function handleSymptom(sock, msg, symptoms) {
    try {
        if (!symptoms) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!symptom <symptoms>\`\n🎯 *Example:* \`!symptom headache fever\`\n\n💫 *Symptom analysis*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const symptomDatabase = {
            'headache': ['Tension', 'Migraine', 'Sinus'],
            'fever': ['Viral Infection', 'Bacterial Infection', 'Inflammation'],
            'cough': ['Common Cold', 'Bronchitis', 'Allergies'],
            'fatigue': ['Stress', 'Anemia', 'Sleep Disorder']
        };
        
        const symptomList = symptoms.toLowerCase().split(' ');
        const possibleConditions = [];
        
        symptomList.forEach(symptom => {
            if (symptomDatabase[symptom]) {
                possibleConditions.push(...symptomDatabase[symptom]);
            }
        });
        
        const uniqueConditions = [...new Set(possibleConditions)];
        
        const symptomInfo = `${BOT_STYLES.header}🏥 *SYMPTOM ANALYSIS*\n${BOT_STYLES.divider}\n\n🏥 *Symptoms:* ${symptoms}\n🔍 *Possible Conditions:* ${uniqueConditions.length > 0 ? uniqueConditions.join(', ') : 'No matches found'}\n⚠️ *Severity:* ${Math.floor(Math.random() * 3 + 1)}/5\n💡 *Recommendation:* Consult a healthcare professional\n\n💫 *Medical symptom analysis*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
        await reply(sock, msg, symptomInfo);
    } catch (error) {
        console.error('Symptom analysis error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *SYMPTOM ERROR*\n${BOT_STYLES.divider}\n\nFailed to analyze symptoms.\n\n💡 *Try:* \`!symptom headache fever\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

// === FUTURISTIC FEATURES ===
async function handleTimeTravel(sock, msg, scenario) {
    try {
        if (!scenario) {
            return await reply(sock, msg, `${BOT_STYLES.header}❌ *USAGE ERROR*\n${BOT_STYLES.divider}\n\n💡 *Usage:* \`!timetravel <scenario>\`\n🎯 *Example:* \`!timetravel past\`\n\n💫 *Time travel scenario analysis*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
        
        const scenarios = {
            'past': { destination: 'Historical Era', paradox: 'High Risk', energy: 'Massive' },
            'future': { destination: 'Advanced Civilization', paradox: 'Medium Risk', energy: 'Enormous' },
            'parallel': { destination: 'Alternate Universe', paradox: 'Low Risk', energy: 'Infinite' }
        };
        
        const timeScenario = scenarios[scenario.toLowerCase()];
        if (timeScenario) {
            const timeTravelInfo = `${BOT_STYLES.header}⏰ *TIME TRAVEL ANALYSIS*\n${BOT_STYLES.divider}\n\n⏰ *Scenario:* ${scenario.toUpperCase()}\n🌍 *Destination:* ${timeScenario.destination}\n⚠️ *Paradox Risk:* ${timeScenario.paradox}\n⚡ *Energy Required:* ${timeScenario.energy}\n📊 *Success Probability:* ${Math.floor(Math.random() * 20 + 10)}%\n\n💫 *Time travel scenario analysis*${BOT_STYLES.creator}\n${BOT_STYLES.footer}`;
            await reply(sock, msg, timeTravelInfo);
        } else {
            await reply(sock, msg, `${BOT_STYLES.header}❌ *SCENARIO NOT FOUND*\n${BOT_STYLES.divider}\n\nCould not analyze scenario: "${scenario}"\n\n💡 *Try:* \`!timetravel past\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
        }
    } catch (error) {
        console.error('Time travel error:', error);
        await reply(sock, msg, `${BOT_STYLES.header}❌ *TIME TRAVEL ERROR*\n${BOT_STYLES.divider}\n\nFailed to analyze time travel scenario.\n\n💡 *Try:* \`!timetravel past\`${BOT_STYLES.creator}\n${BOT_STYLES.footer}`);
    }
}

// === TOOL COMMANDS ===

// JSON Formatter/Validator
async function handleJson(sock, msg, text) {
    if (!text) return await reply(sock, msg, 'Usage: !json <json string>');
    try {
        const obj = JSON.parse(text);
        await reply(sock, msg, '```json\n' + JSON.stringify(obj, null, 2) + '\n```');
    } catch (e) {
        await reply(sock, msg, '❌ Invalid JSON.');
    }
}

// Base64 Encode/Decode
async function handleBase64(sock, msg, mode, text) {
    if (!mode || !text) return await reply(sock, msg, 'Usage: !base64 <encode|decode> <text>');
    try {
        if (mode === 'encode') {
            await reply(sock, msg, Buffer.from(text).toString('base64'));
        } else if (mode === 'decode') {
            await reply(sock, msg, Buffer.from(text, 'base64').toString('utf8'));
        } else {
            await reply(sock, msg, 'Usage: !base64 <encode|decode> <text>');
        }
    } catch {
        await reply(sock, msg, '❌ Error processing base64.');
    }
}

// URL Encode/Decode
async function handleUrl(sock, msg, mode, text) {
    if (!mode || !text) return await reply(sock, msg, 'Usage: !url <encode|decode> <text>');
    try {
        if (mode === 'encode') {
            await reply(sock, msg, encodeURIComponent(text));
        } else if (mode === 'decode') {
            await reply(sock, msg, decodeURIComponent(text));
        } else {
            await reply(sock, msg, 'Usage: !url <encode|decode> <text>');
        }
    } catch {
        await reply(sock, msg, '❌ Error processing URL.');
    }
}

// UUID Generator
async function handleUuid(sock, msg) {
    const uuid = ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.randomBytes(1)[0] & 15 >> c / 4).toString(16)
    );
    await reply(sock, msg, `🆔 *UUID:*

${uuid}`);
}

// Timestamp
async function handleTimestamp(sock, msg) {
    await reply(sock, msg, `⏰ *Current UNIX Timestamp:*

${Math.floor(Date.now() / 1000)}`);
}

// QR Code Generator
// QR Code Generator

async function handleQrcode(sock, msg, text) {
    if (!text) return reply(sock, msg, 'Usage: !qrcode <text>');

    const buffer = await QRCode.toBuffer(text);

    await sock.sendMessage(msg.key.remoteJid, {
        image: buffer,
        caption: '📱 Scan your QR code'
    });
}
