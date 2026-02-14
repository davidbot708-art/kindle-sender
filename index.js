const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '.secrets.env') });

const OWNER = 'Monkfishare';
const REPO = 'New_Yorker';
const PATH = 'NY/2026';
const TRACKING_FILE = path.join(__dirname, 'downloaded_files.json');
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');

if (!fs.existsSync(TRACKING_FILE)) {
    fs.writeFileSync(TRACKING_FILE, JSON.stringify([]));
}
if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR);
}

const downloadedFiles = JSON.parse(fs.readFileSync(TRACKING_FILE));

async function main() {
    console.log(`[${new Date().toISOString()}] Checking GitHub API...`);
    
    try {
        const apiUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`;
        const response = await axios.get(apiUrl, { headers: { 'User-Agent': 'KindleSender/1.0' } });

        const dateFolders = response.data
            .filter(item => item.type === 'dir')
            .map(item => item.name)
            .sort()
            .reverse();

        if (dateFolders.length === 0) {
            console.log('No date folders found.');
            return;
        }

        for (const folderDate of dateFolders) {
            const folderUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}/${folderDate}`;
            const folderResponse = await axios.get(folderUrl, { headers: { 'User-Agent': 'KindleSender/1.0' } });
            const epubFiles = folderResponse.data.filter(file => file.name.endsWith('.epub'));

            for (const file of epubFiles) {
                const localPath = path.join(DOWNLOADS_DIR, file.name);
                const isTracked = downloadedFiles.includes(file.name);
                const existsLocally = fs.existsSync(localPath);

                if (isTracked) {
                    continue; // Skip silently if tracked
                }

                console.log(`Found new issue: ${file.name}`);
                await downloadAndSend(file, localPath);
            }
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

async function downloadAndSend(file, localPath) {
    console.log(`Downloading ${file.name}...`);
    try {
        const fileResponse = await axios.get(file.download_url, { responseType: 'arraybuffer' });
        fs.writeFileSync(localPath, fileResponse.data);
        
        await sendViaMacMail(file.name, localPath);
        await sendTelegramNotification(`📚 Sent New Yorker to Kindle: ${file.name}`);

        downloadedFiles.push(file.name);
        fs.writeFileSync(TRACKING_FILE, JSON.stringify(downloadedFiles, null, 2));
    } catch (err) {
        console.error(`Failed to process ${file.name}: ${err.message}`);
    }
}

function sendViaMacMail(filename, filePath) {
    return new Promise((resolve, reject) => {
        console.log(`Sending email...`);
        const recipient = process.env.KINDLE_EMAIL || 'liushuanguni_1IPvlo@kindle.com';
        const script = `
            tell application "Mail"
                set theMessage to make new outgoing message with properties {subject:"New Yorker Issue", content:"New issue attached.", visible:false}
                tell theMessage
                    make new to recipient at end of to recipients with properties {address:"${recipient}"}
                    make new attachment with properties {file name:(POSIX file "${filePath}")} at after the last paragraph
                    send
                end tell
            end tell
        `;
        exec(`osascript -e '${script}'`, (error, stdout) => {
            if (error) reject(error);
            else resolve(stdout);
        });
    });
}

async function sendTelegramNotification(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return;

    try {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId,
            text: text
        });
        console.log('Telegram notification sent.');
    } catch (err) {
        console.error('Telegram failed:', err.message);
    }
}

main();