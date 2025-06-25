import dotenv from 'dotenv';
import * as path from 'path';
import express from 'express';
import bodyParser from 'body-parser';
import multer from 'multer';
import axios from 'axios';
import FormData from 'form-data';

const envFile = process.env.ENV_FILE || '.env.prod';
dotenv.config({
    path: path.resolve(process.cwd(), envFile),
});

const app = express();
const PORT = process.env.PORT || 3666;

// Set up multer for parsing multipart/form-data
const upload = multer();

// Middleware to parse incoming JSON requests
app.use(bodyParser.json());

if (!process.env.VERSION)
{
    throw new Error('Missing VERSION environment variable!');
}
const VERSION = process.env.VERSION;

if (!process.env.DISCORD_WEBHOOK) {
    throw new Error('Missing DISCORD_WEBHOOK environment variable!');
}
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK;

if (!process.env.PLEX_URL_WITH_TOKEN) {
    throw new Error('Missing PLEX_URL_WITH_TOKEN environment variable!');
}
const PLEX_URL_WITH_TOKEN = process.env.PLEX_URL_WITH_TOKEN;

if (!process.env.ONLINE_STATUS_CHECK_INTERVAL_IN_SECONDS) {
    throw new Error('Missing ONLINE_STATUS_CHECK_INTERVAL_IN_SECONDS environment variable!');
}
const ONLINE_STATUS_CHECK_INTERVAL_IN_SECONDS = Number.parseInt(process.env.ONLINE_STATUS_CHECK_INTERVAL_IN_SECONDS, 10);

if (!process.env.ONLINE_STATUS_CHECK_NOTIFY_AFTER_RETRIES)
{
    throw new Error('Missing ONLINE_STATUS_CHECK_NOTIFY_AFTER_RETRIES environment variable!');
}
const ONLINE_STATUS_CHECK_NOTIFY_AFTER_RETRIES = Number.parseInt(process.env.ONLINE_STATUS_CHECK_NOTIFY_AFTER_RETRIES);

let isOnline = true;
let lastCheck = new Date(0);
let lastOffline = new Date(0);

app.get('', (req, res) => {
    res.status(200).send(`<strong>plex-2-discord service</strong><br />Author <strong>Damjan Kovačič</strong><br />Version <strong>${VERSION}</strong><br />Port <strong>${PORT}</strong><br />PLEX status <strong>${isOnline ? '✅ ONLINE' : '❌ OFFLINE'}</strong><br />Last check <strong>${lastCheck.toISOString()}</strong><br />Last offline <strong>${lastOffline.toISOString()}</strong>`);
});

app.post('/webhook', upload.any(), (req, res) => {
    const payload = JSON.parse(req.body.payload);

    if (payload.event !== 'library.new') {
        return;
    }

    const form = new FormData();

    var mediaType = payload.Metadata.type;
    var libraryTitle = payload.Metadata.librarySectionTitle;
    var title = payload.Metadata.title;
    var summary = payload.Metadata.summary;
    const maxSummaryLength = 400;
    if (summary.length > maxSummaryLength) {
        summary = summary.substring(0, maxSummaryLength - 3) + ' ...';
    }

    var discordMessage = {
        content: `New ${mediaType} was just uploaded to ${libraryTitle} library!`,
        embeds: [
            {
                title: title,
                description: summary,
                color: 0xe5a00d,
                image: {
                    url: 'attachment://thumb.jpg',
                },
            },
        ],
    };

    form.append('payload_json', JSON.stringify(discordMessage));

    if (!!req.files) {
        var files = req.files as Express.Multer.File[];
        const file = files.find((f) => f.fieldname === 'thumb');
        if (!!file) {
            form.append('files[0]', file.buffer, {
                filename: 'thumb.jpg',
                contentType: file.mimetype,
            });
        }
    }

    axios.post(DISCORD_WEBHOOK, form, {
        headers: form.getHeaders(),
    });

    res.status(200).send('Webhook received successfully');
});

let retries = 0;
let notifiedOffline = false;

const checkPlexStatus = () => {
    lastCheck = new Date();
    axios
        .head(PLEX_URL_WITH_TOKEN, {
            timeout: 5000,
        })
        .then(() => {
            isOnline = true;
            if (notifiedOffline) {
                console.log('notify online!');
                notifyPlexStatus('✅ Plex server is now **online**!');
            }
            notifiedOffline = false;
            retries = 0;
        })
        .catch((err) => {
            if (isOnline)
            {
                lastOffline = new Date();
            }
            isOnline = false;
            retries++;
            if (!notifiedOffline && retries >= ONLINE_STATUS_CHECK_NOTIFY_AFTER_RETRIES) {
                console.log('notify offline!');
                notifiedOffline = true;
                notifyPlexStatus('❌ Plex server is **offline**!');
            }
        });
};

const notifyPlexStatus = (content: string) => {
    axios.post(DISCORD_WEBHOOK, { content: content });
};

setInterval(checkPlexStatus, ONLINE_STATUS_CHECK_INTERVAL_IN_SECONDS * 1000);

app.listen(PORT, () => {
    console.log(`plex-2-discord id running on port ${PORT}!`);
});
