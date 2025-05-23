const { Telegraf } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// Create a new instance of the Telegraf bot
const bot = new Telegraf(config.TELEGRAM_TOKEN);

// Base URL for UserAPI.ai
const API_BASE_URL = 'https://api.userapi.ai';

// Store tasks in memory for user interactions
const userTasks = {};

// Helper function for API requests
async function apiRequest(endpoint, data) {
  try {
    if (config.DEBUG) {
      console.log(`API Request to ${endpoint}:`, JSON.stringify(data));
    }
    
    const response = await axios({
      method: 'POST',
      url: `${API_BASE_URL}${endpoint}`,
      headers: {
        'api-key': config.USERAPI_KEY,
        'Content-Type': 'application/json'
      },
      data
    });
    
    if (config.DEBUG) {
      console.log(`API Response from ${endpoint}:`, JSON.stringify(response.data));
    }
    
    return response.data;
  } catch (error) {
    console.error('API request error:', error.response?.data || error.message);
    throw error;
  }
}

// Helper function to download images
async function downloadImage(url) {
  try {
    const response = await axios({
      method: 'GET',
      url,
      responseType: 'arraybuffer'
    });
    
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }
    
    const fileName = `image_${Date.now()}.png`;
    const filePath = path.join(tempDir, fileName);
    
    fs.writeFileSync(filePath, response.data);
    return filePath;
  } catch (error) {
    console.error('Error downloading image:', error);
    throw error;
  }
}

// Setup webhook server for receiving results
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;

// Map to store pending tasks
const pendingTasks = {};

// Configure Express
app.use(bodyParser.json());

// Webhook endpoint to receive task updates
app.post('/webhook', async (req, res) => {
  try {
    const webhookData = req.body;
    console.log('Received webhook:', JSON.stringify(webhookData));
    
    // Get task info from pendingTasks
    const taskInfo = pendingTasks[webhookData.hash];
    
    if (!taskInfo) {
      console.log(`No pending task found for hash: ${webhookData.hash}`);
      return res.status(200).send('OK');
    }
    
    const { ctx, messageId } = taskInfo;
    
    // Handle different statuses
    if (webhookData.status === 'done') {
      // Task is complete, download and send the image
      const imageUrl = webhookData.result.url;
      const imagePath = await downloadImage(imageUrl);
      
      // Store task info for user
      const userId = ctx.from.id;
      if (!userTasks[userId]) {
        userTasks[userId] = {};
      }
      userTasks[userId][webhookData.hash] = {
        type: webhookData.type,
        imageUrl,
        prompt: webhookData.prompt
      };
      
      // Send the image with action buttons
      await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
      const photo = { source: fs.createReadStream(imagePath) };
      
      let caption = `✅ Generated: ${webhookData.prompt || 'No prompt'}\n`;
      caption += `Type: ${webhookData.type}\n`;
      caption += `Hash: ${webhookData.hash}`;
      
      const keyboard = {
        inline_keyboard: [
          [
            { text: 'U1', callback_data: `upscale:${webhookData.hash}:1` },
            { text: 'U2', callback_data: `upscale:${webhookData.hash}:2` },
            { text: 'U3', callback_data: `upscale:${webhookData.hash}:3` },
            { text: 'U4', callback_data: `upscale:${webhookData.hash}:4` }
          ],
          [
            { text: 'V1', callback_data: `variation:${webhookData.hash}:1` },
            { text: 'V2', callback_data: `variation:${webhookData.hash}:2` },
            { text: 'V3', callback_data: `variation:${webhookData.hash}:3` },
            { text: 'V4', callback_data: `variation:${webhookData.hash}:4` }
          ],
          [
            { text: '🔄 Reroll', callback_data: `reroll:${webhookData.hash}` },
            { text: '2x Subtle', callback_data: `upsample:${webhookData.hash}:v6_2x_subtle` },
            { text: '2x Creative', callback_data: `upsample:${webhookData.hash}:v6_2x_creative` }
          ]
        ]
      };
      
      await ctx.replyWithPhoto(photo, {
        caption,
        reply_markup: keyboard
      });
      
      // Clean up temp file
      fs.unlinkSync(imagePath);
      
      // Remove from pending tasks
      delete pendingTasks[webhookData.hash];
      
    } else if (webhookData.status === 'error') {
      // Task encountered an error
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        undefined,
        `❌ Error: ${webhookData.status_reason || 'Unknown error'}`
      );
      
      // Remove from pending tasks
      delete pendingTasks[webhookData.hash];
      
    } else if (webhookData.status === 'progress') {
      // Task is still processing, update the message
      const progressText = webhookData.progress ? ` - ${webhookData.progress}%` : '';
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        messageId,
        undefined,
        `⏳ Processing ${webhookData.type || 'task'}${progressText}...`
      );
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).send('Error');
  }
});

// Start the webhook server
app.listen(PORT, () => {
  console.log(`Webhook server started on port ${PORT}`);
});

// Function to generate public URL for webhook using ngrok or similar service
async function getPublicUrl() {
  // In production, this would be your actual public URL
  // For development, you might use ngrok or other tunneling services
  
  // For now, we'll return a placeholder
  // In real usage, either set a fixed URL or use a dynamic one from a service like ngrok
  return process.env.WEBHOOK_URL || `https://your-public-url.ngrok.io/webhook`;
}

// Helper function to register a task and wait for webhook response
async function registerTaskAndWait(hash, ctx, messageId) {
  try {
    // Store task info for webhook
    pendingTasks[hash] = { ctx, messageId };
    
    // Update message to show waiting
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      messageId,
      undefined,
      `⏳ Task submitted with ID: ${hash}\nWaiting for processing...`
    );
    
    // In a real implementation with webhooks, the webhook handler would
    // process the results when they come in
  } catch (error) {
    console.error('Error registering task:', error);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      messageId,
      undefined,
      `⚠️ Error registering task: ${error.message}`
    );
  }
}

// Start command handler
bot.start((ctx) => {
  ctx.reply(
    'Welcome to Midjourney Telegram Bot! 🎨\n\n' +
    'Commands:\n' +
    '/imagine [prompt] - Generate an image\n' +
    '/help - Show this help message'
  );
});

// Help command handler
bot.help((ctx) => {
  ctx.reply(
    'Midjourney Bot Commands: 🎨\n\n' +
    '/imagine [prompt] - Generate an image with your prompt\n' +
    '/status [hash] - Check status of a generation by hash\n\n' +
    'After generation, you can use buttons to:\n' +
    '• U1-U4: Upscale a specific quadrant\n' +
    '• V1-V4: Create variation of a specific quadrant\n' +
    '• 🔄 Reroll: Generate a new image with the same prompt\n' +
    '• 2x Subtle/Creative: Apply different upscale styles'
  );
});

// Imagine command handler
bot.command('imagine', async (ctx) => {
  try {
    const prompt = ctx.message.text.replace('/imagine', '').trim();
    
    if (!prompt) {
      return ctx.reply('Please provide a prompt. Example: /imagine a beautiful sunset over mountains');
    }
    
    // Send processing message
    const processingMsg = await ctx.reply('🔄 Processing your request...');
    
    // Get webhook URL
    const webhookUrl = await getPublicUrl();
    
    // Send imagine request to API
    const response = await apiRequest('/midjourney/v2/imagine', {
      prompt,
      webhook_url: webhookUrl,
      webhook_type: 'progress',
      is_disable_prefilter: false
    });
    
    // Register task for webhook handling
    await registerTaskAndWait(response.hash, ctx, processingMsg.message_id);
    
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
});

// Status command handler - modified to show just info about tasks
bot.command('status', async (ctx) => {
  try {
    const hash = ctx.message.text.replace('/status', '').trim();
    
    if (!hash) {
      // Show pending tasks if hash not provided
      const pendingTasksCount = Object.keys(pendingTasks).length;
      return ctx.reply(`Currently monitoring ${pendingTasksCount} tasks. Please wait for webhook notifications.`);
    }
    
    // Check if task is being monitored
    if (pendingTasks[hash]) {
      ctx.reply(`Task ${hash} is being monitored. Waiting for webhook notifications.`);
    } else {
      ctx.reply(`Task ${hash} is not currently being monitored. It may be completed or never started.`);
    }
    
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
});

// Handle callback queries (button clicks)
bot.on('callback_query', async (ctx) => {
  try {
    const callbackData = ctx.callbackQuery.data;
    const [action, hash, choice] = callbackData.split(':');
    
    // Send processing message
    await ctx.answerCbQuery('Processing your request...');
    const processingMsg = await ctx.reply('🔄 Processing...');
    
    // Get webhook URL
    const webhookUrl = await getPublicUrl();
    
    let response;
    let requestData = { hash };
    
    // Add webhook info to all requests
    requestData.webhook_url = webhookUrl;
    requestData.webhook_type = action === 'upscale' || action === 'variation' ? 'result' : 'progress';
    
    // Add choice parameter if needed
    if (choice) {
      requestData.choice = action === 'upsample' ? choice : parseInt(choice);
    }
    
    // Send the appropriate request based on action
    response = await apiRequest(`/midjourney/v2/${action}`, requestData);
    
    // Register task for webhook handling
    await registerTaskAndWait(response.hash, ctx, processingMsg.message_id);
    
  } catch (error) {
    ctx.reply(`❌ Error: ${error.message}`);
  }
});

// Handle all other messages
bot.on('text', (ctx) => {
  ctx.reply(
    'To generate an image, use the /imagine command followed by your prompt.\n' +
    'Example: /imagine a beautiful sunset over mountains\n\n' +
    'For more help, type /help'
  );
});

// Error handler
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply(`An error occurred: ${err.message}`);
});

// Start the bot
bot.launch()
  .then(() => console.log('Bot started successfully!'))
  .catch((err) => console.error('Error starting bot:', err));

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
