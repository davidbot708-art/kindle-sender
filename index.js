const axios = require('axios');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const OWNER = 'Monkfishare';
const REPO = 'New_Yorker';
const PATH = 'NY/2026';
const TRACKING_FILE = path.join(__dirname, 'downloaded_files.json');

// Ensure tracking file exists
if (!fs.existsSync(TRACKING_FILE)) {
    fs.writeFileSync(TRACKING_FILE, JSON.stringify([]));
}

const downloadedFiles = JSON.parse(fs.readFileSync(TRACKING_FILE));

async function main() {
    console.log(`Checking GitHub API for new issues in ${PATH}...`);
    
    try {
        // Step 1: List folders (dates) in NY/2026
        const apiUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`;
        const response = await axios.get(apiUrl, {
            headers: { 'User-Agent': 'KindleSender/1.0' }
        });

        // Filter for directories (subfolders)
        const dateFolders = response.data
            .filter(item => item.type === 'dir')
            .map(item => item.name)
            .sort() // Dates sort correctly as strings: 2026-02-09
            .reverse(); // Latest first

        if (dateFolders.length === 0) {
            console.log('No date folders found in 2026.');
            return;
        }

        console.log(`Found ${dateFolders.length} folders. Latest: ${dateFolders[0]}`);

        // Step 2: Check each folder (starting with latest) for new .epub files
        for (const folderDate of dateFolders) {
            // Optimization: If we've already processed this folder's EPUB, we might skip it?
            // But let's check inside just in case (filenames might differ).
            
            const folderUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}/${folderDate}`;
            const folderResponse = await axios.get(folderUrl, {
                headers: { 'User-Agent': 'KindleSender/1.0' }
            });

            const epubFiles = folderResponse.data.filter(file => file.name.endsWith('.epub'));

            for (const file of epubFiles) {
                if (downloadedFiles.includes(file.name)) {
                    console.log(`Skipping already downloaded: ${file.name}`);
                    continue;
                }

                console.log(`Found new issue: ${file.name} in ${folderDate}`);

                // Step 3: Download and Send
                await downloadAndSend(file);
            }
        }

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response && error.response.status === 403) {
            console.log("Rate limited by GitHub API.");
        }
    }
}

async function downloadAndSend(file) {
    // Configure Nodemailer
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GOOGLE_EMAIL,
            pass: process.env.GOOGLE_PASSWORD
        }
    });

    console.log(`Downloading ${file.name}...`);
    try {
        const fileResponse = await axios.get(file.download_url, { responseType: 'arraybuffer' });
        
        console.log(`Sending ${file.name} to Kindle (${process.env.KINDLE_EMAIL})...`);
        await transporter.sendMail({
            from: process.env.GOOGLE_EMAIL,
            to: process.env.KINDLE_EMAIL,
            subject: 'New Yorker Issue',
            text: 'Here is the latest issue.',
            attachments: [
                {
                    filename: file.name,
                    content: fileResponse.data
                }
            ]
        });

        console.log(`Sent: ${file.name}`);
        downloadedFiles.push(file.name);
        fs.writeFileSync(TRACKING_FILE, JSON.stringify(downloadedFiles, null, 2));
    } catch (err) {
        console.error(`Failed to send ${file.name}: ${err.message}`);
    }
}

main();