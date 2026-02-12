const axios = require('axios');
const cheerio = require('cheerio');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const URL = 'https://github.com/Monkfishare/New_Yorker/tree/main/NY/2026';
const TRACKING_FILE = path.join(__dirname, 'downloaded_files.json');

// Ensure tracking file exists
if (!fs.existsSync(TRACKING_FILE)) {
    fs.writeFileSync(TRACKING_FILE, JSON.stringify([]));
}

const downloadedFiles = JSON.parse(fs.readFileSync(TRACKING_FILE));

async function main() {
    console.log(`Checking ${URL} for new .epub issues...`);
    
    try {
        const response = await axios.get(URL);
        const $ = cheerio.load(response.data);
        const links = [];

        // Updated selector for GitHub's latest UI (sometimes it's tricky)
        // Usually href ends with .epub
        $('a[href$=".epub"]').each((i, el) => {
            let href = $(el).attr('href');
            if (href) {
                // If it's a blob link, convert to raw
                // /User/Repo/blob/main/path/file.epub -> https://raw.githubusercontent.com/User/Repo/main/path/file.epub
                const rawUrl = 'https://raw.githubusercontent.com' + href.replace('/blob/', '/');
                const filename = path.basename(href);
                links.push({ filename, url: rawUrl });
            }
        });

        const newFiles = links.filter(file => !downloadedFiles.includes(file.filename));

        if (newFiles.length === 0) {
            console.log('No new issues found.');
            return;
        }

        console.log(`Found ${newFiles.length} new issue(s): ${newFiles.map(f => f.filename).join(', ')}`);

        // Configure Nodemailer
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GOOGLE_EMAIL,
                pass: process.env.GOOGLE_PASSWORD
            }
        });

        for (const file of newFiles) {
            console.log(`Downloading ${file.filename}...`);
            try {
                const response = await axios.get(file.url, { responseType: 'arraybuffer' });
                
                console.log(`Sending ${file.filename} to Kindle (${process.env.KINDLE_EMAIL})...`);
                await transporter.sendMail({
                    from: process.env.GOOGLE_EMAIL,
                    to: process.env.KINDLE_EMAIL,
                    subject: 'New Yorker Issue',
                    text: 'Here is the latest issue.',
                    attachments: [
                        {
                            filename: file.filename,
                            content: response.data
                        }
                    ]
                });

                console.log(`Sent: ${file.filename}`);
                downloadedFiles.push(file.filename);
                fs.writeFileSync(TRACKING_FILE, JSON.stringify(downloadedFiles, null, 2));
            } catch (err) {
                console.error(`Failed to process ${file.filename}: ${err.message}`);
            }
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

main();