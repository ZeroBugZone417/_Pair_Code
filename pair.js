const express = require('express');
const fs = require('fs');
const { exec } = require("child_process");
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser
} = require("@whiskeysockets/baileys");
const { upload } = require('./mega');

let router = express.Router();

// --- Helper: remove file/folder safely ---
function removeFile(FilePath) {
    if (fs.existsSync(FilePath)) {
        fs.rmSync(FilePath, { recursive: true, force: true });
    }
}

// --- Helper: random MEGA filename ---
function randomMegaId(len = 6, numLen = 4) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const str = Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const num = Math.floor(Math.random() * Math.pow(10, numLen));
    return `${str}${num}`;
}

// --- Router endpoint ---
router.get('/', async (req, res) => {
    let num = req.query.number;

    async function DanuwaPair() {
        const { state, saveCreds } = await useMultiFileAuthState(`./session`);

        try {
            let DanuwaPairWeb = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.macOS("Safari"),
            });

            // --- Request pairing code ---
            if (!DanuwaPairWeb.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                const code = await DanuwaPairWeb.requestPairingCode(num);
                if (!res.headersSent) {
                    res.send({ code });
                }
            }

            // --- Save creds when updated ---
            DanuwaPairWeb.ev.on('creds.update', saveCreds);

            // --- Connection handler ---
            DanuwaPairWeb.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    try {
                        await delay(10000);

                        const auth_path = './session/';
                        const user_jid = jidNormalizedUser(DanuwaPairWeb.user.id);

                        const mega_url = await upload(
                            fs.createReadStream(auth_path + 'creds.json'),
                            `${randomMegaId()}.json`
                        );

                        const sid = mega_url.replace('https://mega.nz/file/', '');

                        await DanuwaPairWeb.sendMessage(user_jid, { text: sid });

                    } catch (e) {
                        console.error("Error in open connection:", e);
                        exec('pm2 restart danuwa');
                    }

                    await delay(100);
                    removeFile('./session'); // cleanup session safely
                    return;
                }

                // --- Reconnect if closed (except 401 unauthorized) ---
                if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
                    await delay(10000);
                    DanuwaPair();
                }
            });

        } catch (err) {
            console.error("Main error:", err);
            exec('pm2 restart danuwa-md');
            DanuwaPair();
            removeFile('./session');
            if (!res.headersSent) {
                res.send({ code: "Service Unavailable" });
            }
        }
    }

    return await DanuwaPair();
});

// --- Global error catcher ---
process.on('uncaughtException', function (err) {
    console.error('Caught exception:', err);
    exec('pm2 restart danuwa');
});

module.exports = router;
