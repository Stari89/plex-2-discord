import dotenv from 'dotenv';
import * as path from 'path';
import express from 'express';
import bodyParser from 'body-parser';
import multer from 'multer';
import axios from 'axios';
import FormData from 'form-data';

const envFile = process.env.ENV_FILE || '.env';
dotenv.config({
    path: path.resolve(process.cwd(), envFile),
});

const app = express();
const PORT = process.env.PORT || 3666;

// Set up multer for parsing multipart/form-data
const upload = multer();

// Middleware to parse incoming JSON requests
app.use(bodyParser.json());

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK;
if (!DISCORD_WEBHOOK) {
    throw new Error('Missing DISCORD_WEBHOOK environment variable!');
}

const PLEX_URL_WITH_TOKEN = process.env.PLEX_URL_WITH_TOKEN;
if (!PLEX_URL_WITH_TOKEN) {
    throw new Error('Missing PLEX_URL_WITH_TOKEN environment variable!');
}

app.get('', (req, res) => {
    res.status(200).send(`plex-2-discord is running on port ${PORT}`);
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
    const maxSummaryLength = 200;
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
                thumbnail: {
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

let isOnline: boolean | null = null;

const checkPlexStatus = () => {
    axios
        .head(PLEX_URL_WITH_TOKEN, {
            timeout: 5000,
        })
        .then(() => {
            if (!isOnline) {
                console.log('notify online!');
                notifyPlexStatus('✅ Plex server is now **online**!');
            }
            isOnline = true;
        })
        .catch((err) => {
            if (isOnline) {
                console.log('notify offline!');
                notifyPlexStatus('❌ Plex server is **offline**!');
            }
            isOnline = false;
        });
};

const notifyPlexStatus = (content: string) => {
    axios.post(DISCORD_WEBHOOK, { content: content });
};

setInterval(checkPlexStatus, 60 * 1000);
