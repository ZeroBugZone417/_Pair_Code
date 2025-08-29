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
const PM2_NAME = "DANUWA-MD";

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
    return ${str}${num};
}

// --- Router endpoint ---
router.get('/', async (req, res) => {
    let num = req.query.number;

    async function DanuwaPair() {
        const { state, saveCreds } = await useMultiFileAuthState(./session);

        try {
            let DanuwaPairWeb = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(
                        state.keys,
                        pino({ level: "fatal" }).child({ level: "fatal" })
                    ),
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
                    return res.send({ code });
                }
            }

            // --- Save creds when updated ---
            DanuwaPairWeb.ev.on('creds.update', saveCreds);

            // --- Connection handler ---
            DanuwaPairWeb.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    try {
                        await delay(8000);

                        const auth_path = './session/';
                        const user_jid = jidNormalizedUser(DanuwaPairWeb.user.id);

                        const mega_url = await upload(
                            fs.createReadStream(auth_path + 'creds.json'),
                            ${randomMegaId()}.json
                        );

                        const sid = mega_url.replace('https://mega.nz/file/', '');

                        // --- Styled Session Message with Owner Contact Button ---
                        await DanuwaPairWeb.sendMessage(user_jid, {
                            text: `╔════◇🔑 Pairing Complete ◇════╗
1️⃣ Your session is now active!
2️⃣ Session ID: ${sid}
3️⃣ Keep it safe & do not share
━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 Need help? Contact the owner directly
╚════════════════════════════╝`,
                            footer: "⚡ Powered by Dineth ⚡",
                            buttons: [
                                { 
                                  buttonId: "owner_contact", 
                                  buttonText: { displayText: "📞 Contact Owner" }, 
                                  type: 1 
                                }
                            ],
                            headerType: 4
                        }, { quoted: s });

                        // --- Button click listener ---
                        DanuwaPairWeb.ev.on('messages.upsert', async ({ messages }) => {
                            const m = messages[0];
                            const text = m.message?.buttonsResponseMessage?.selectedButtonId;
                            if (text === "owner_contact") {
                                await DanuwaPairWeb.sendMessage(user_jid, {
                                    text: "👤 Contact Dineth:\nwa.me/94769983151\nor reply here!"
                                }, { quoted: m });
                            }
                        });

                        // cleanup session after success
                        removeFile('./session');

                    } catch (e) {
                        console.error("Error in open connection:", e);
                        exec(pm2 restart ${PM2_NAME});
                    }
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
            exec(pm2 restart ${PM2_NAME});
            removeFile('./session');
            if (!res.headersSent) {
                res.status(503).send({ code: "Service Unavailable" });
            }
        }
    }

    return await DanuwaPair();
});

// --- Global error catcher ---
process.on('uncaughtException', function (err) {
    console.error('Caught exception:', err);
    exec(pm2 restart ${PM2_NAME});
});

module.exports = router;
                    return res.send({ code });
                }
            }

            // --- Save creds when updated ---
            DanuwaPairWeb.ev.on('creds.update', saveCreds);

            // --- Connection handler ---
            DanuwaPairWeb.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    try {
                        await delay(8000);

                        const auth_path = './session/';
                        const user_jid = jidNormalizedUser(DanuwaPairWeb.user.id);

                        const mega_url = await upload(
                            fs.createReadStream(auth_path + 'creds.json'),
                            `${randomMegaId()}.json`
                        );

                        const sid = mega_url.replace('https://mega.nz/file/', '');

                        await DanuwaPairWeb.sendMessage(user_jid, { text: sid });

                        // cleanup session after success
                        removeFile('./session');

                    } catch (e) {
                        console.error("Error in open connection:", e);
                        exec(`pm2 restart ${PM2_NAME}`);
                    }
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
            exec(`pm2 restart ${PM2_NAME}`);
            removeFile('./session');
            if (!res.headersSent) {
                res.status(503).send({ code: "Service Unavailable" });
            }
        }
    }

    return await DanuwaPair();
});

// --- Global error catcher ---
process.on('uncaughtException', function (err) {
    console.error('Caught exception:', err);
    exec(`pm2 restart ${PM2_NAME}`);
});

module.exports = router;
