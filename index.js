// Import the required libraries
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const fetch = require('node-fetch');

const TOKEN = '7760242583:AAGxFwcOXoNNybnmHMlMOftcrSe2zOE8s70';

const bot = new TelegramBot(TOKEN, { polling: true });
const ADMIN_ID = 1489381549;

let premiumUsers = new Set();
let temporaryPremiumUsers = new Map();
try {
    const data = fs.readFileSync('users.json', 'utf8');
    const users = JSON.parse(data);
    premiumUsers = new Set(users.premiumUsers || []);
    temporaryPremiumUsers = new Map(users.temporaryPremiumUsers || []);
} catch (error) {
    console.error('Error loading premium users:', error);
}

const saveUsers = () => {
    fs.writeFileSync(
        'users.json',
        JSON.stringify({
            premiumUsers: Array.from(premiumUsers),
            temporaryPremiumUsers: Array.from(temporaryPremiumUsers.entries()),
        })
    );
};

const parseTimeLimit = (timeString) => {
    const match = timeString.match(/^\d+(d|min|m)$/i);
    if (!match) return null;

    const value = parseInt(timeString.slice(0, -1), 10);
    const unit = timeString.slice(-1).toLowerCase(); 

    switch (unit) {
        case 'd':
            return value * 24 * 60 * 60 * 1000; 
        case 'm':
            return value * 30 * 24 * 60 * 60 * 1000; 
        case 'min':
            return value * 60 * 1000;
        default:
            return null;
    }
};


setInterval(() => {
    const currentTime = Date.now();
    temporaryPremiumUsers.forEach((expiryTime, userId) => {
        if (currentTime > expiryTime) {
            premiumUsers.delete(userId);
            temporaryPremiumUsers.delete(userId);
            bot.sendMessage(userId, 'Your premium status has ended. Upgrade again to continue enjoying premium features!');
        }
    });
    saveUsers();
}, 60000); 


bot.onText(/\/premium (\d+) (\S+)/, (msg, match) => {
    const chatId = msg.chat.id;

    if (chatId !== ADMIN_ID) {
        bot.sendMessage(chatId, 'You are not authorized to use this command.');
        return;
    }

    const userId = parseInt(match[1], 10);
    const timeLimit = match[2];
    console.log('Received Command:', { userId, timeLimit });

    const duration = parseTimeLimit(timeLimit);
    console.log('Parsed Duration:', duration);

    if (!duration) {
        bot.sendMessage(chatId, 'Invalid time format. Use 1d (day), 1min (minute), or 1m (month).');
        return;
    }

    premiumUsers.add(userId);
    temporaryPremiumUsers.set(userId, Date.now() + duration);
    saveUsers();

    bot.sendMessage(chatId, `User ${userId} has been promoted to premium for ${timeLimit}.`);
    bot.sendMessage(userId, `Congratulations! You have been promoted to premium status for ${timeLimit}. Enjoy premium features!`);
});


const userStates = {};


bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const isPremium = premiumUsers.has(chatId);

    const message = isPremium
        ? `Welcome back, *Premium User*!\n\nSend me any link to shorten, or edit an existing short URL.`
        : `Welcome to the *Link Shortener Bot*!\n\nSend a link to shorten or click the button below to learn more.`;

    const keyboard = {
        reply_markup: {
            inline_keyboard: isPremium
                ? [
                    [{ text: 'Shorten Link Now', callback_data: 'shorten_link' }],
                    [{ text: 'Edit URL', callback_data: 'edit_url' }]
                  ]
                : [
                    [{ text: 'Buy Premium', url: 'https://t.me/Owner6x' }],
                    [{ text: 'Shorten Link Now', callback_data: 'shorten_link' }]
                  ],
        },
        parse_mode: 'Markdown',
    };

    bot.sendMessage(chatId, message, keyboard);
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    const isPremium = premiumUsers.has(chatId);

    if (userStates[chatId]?.state === 'awaiting_new_url') {
        const shortCode = userStates[chatId].shortCode;
        const newUrl = text;

        const apiUrl = 'https://api.udayscripts.in/edit_link.php';
        fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ short_code: shortCode, new_url: newUrl, chat_id: chatId }),
        })
            .then((res) => res.json())
            .then((data) => {
                bot.sendMessage(chatId, data.message || 'URL updated successfully!');
            })
            .catch((error) => {
                bot.sendMessage(chatId, 'Error updating URL. Please try again later.');
                console.error(error);
            });

        userStates[chatId] = null;
        return;
    }

    const urlRegex = /https?:\/\/[^\s]+/;
    if (urlRegex.test(text)) {
        if (isPremium) {
            const apiUrl = 'https://api.udayscripts.in/link.php';
            fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: text, chat_id: chatId }),
            })
                .then((res) => res.json())
                .then((data) => {
                    bot.sendMessage(chatId, data.short_link ? `Your shortened link: ${data.short_link}` : 'Error shortening link.');
                })
                .catch((error) => {
                    bot.sendMessage(chatId, 'Error shortening link. Please try again later.');
                    console.error(error);
                });
        } else {
            bot.sendMessage(chatId, 'This feature is available for premium users only.');
        }
    }
});

bot.on('callback_query', (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;

    if (callbackQuery.data === 'shorten_link') {
        if (premiumUsers.has(chatId)) {
            bot.sendMessage(chatId, 'Send me the link you want to shorten!');
        } else {
            bot.sendMessage(chatId, 'This feature is available for premium users only.');
        }
    } else if (callbackQuery.data === 'edit_url') {
        if (premiumUsers.has(chatId)) {
            bot.sendMessage(chatId, 'Please send the shortcode for the URL you want to edit.');
            userStates[chatId] = { state: 'awaiting_shortcode' };
        } else {
            bot.sendMessage(chatId, 'This feature is available for premium users only.');
        }
    } else if (callbackQuery.data === 'buy_premium') {
        bot.sendMessage(chatId, 'Contact @Owner6x for buying premium.');
    }
});

bot.on('polling_error', (error) => {
    console.error('Polling Error:', error.code, error.message);
});

console.log('Bot is running...');
