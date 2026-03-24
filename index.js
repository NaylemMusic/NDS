const {
    Client,
    Intents,
    MessageEmbed,
    MessageAttachment,
} = require("discord.js");
const fs = require("fs");
const https = require("https");
const { createCanvas, loadImage, registerFont } = require("canvas");
const { execSync } = require("child_process");

// Libère le port 3000 si un ancien processus l'occupe encore
try {
    execSync("fuser -k 3000/tcp 2>/dev/null");
} catch (e) {}

// ==========================================
// 🔤 CHARGEMENT DES POLICES CUSTOM
// ==========================================
if (fs.existsSync("./Montserrat-Black.ttf")) {
    registerFont("./Montserrat-Black.ttf", {
        family: "Montserrat",
        weight: "900",
    });
    console.log("✅ Police Montserrat chargée !");
}
if (fs.existsSync("./Inter-Bold.ttf")) {
    registerFont("./Inter-Bold.ttf", { family: "Inter", weight: "700" });
    console.log("✅ Police Inter chargée !");
}

// ==========================================
// 📡 LE SERVEUR WEB (POUR REPLIT & OBS)
// ==========================================
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.get("/", (req, res) => {
    res.send("🟢 Cerveau NDS : Bot Discord et Serveur Temps Réel en ligne !");
});

let currentLiveState = {
    isLive: false,
    bracketData: null,
    viewMode: "bracket",
    scoreVisible: false,
};

// TON ID UNIQUE POUR LES ANNONCES ET LE STREAM
const CHANNEL_ID = "1479330667606179862";
const TWITCH_LINK = "https://www.twitch.tv/nysos_wav";

io.on("connection", (socket) => {
    socket.emit("init_state", currentLiveState);

    socket.on("toggle_live", (isLive) => {
        currentLiveState.isLive = isLive;
        io.emit("live_status_changed", isLive);
    });

    socket.on("update_bracket", (data) => {
        currentLiveState.bracketData = data;
        socket.broadcast.emit("bracket_updated", data);
    });

    socket.on("switch_view", (data) => {
        currentLiveState.viewMode = data.mode;
        socket.broadcast.emit("view_switched", data);
    });

    // 🔴 ANNONCE : SCOREBOARD (AVEC LIEN CLIQUABLE)
    socket.on("update_score", async (data) => {
        socket.broadcast.emit("score_updated", data);
        if (data.show && !currentLiveState.scoreVisible) {
            try {
                const streamChannel = await client.channels.fetch(CHANNEL_ID);
                if (streamChannel) {
                    await streamChannel.send(
                        `⚔️ **LE MATCH COMMENCE !**\n🔴 En direct : **${data.p1}** 🆚 **${data.p2}**\n📺 *[Rejoignez le live !](${TWITCH_LINK})*`,
                    );
                }
            } catch (err) {
                console.log("❌ Erreur annonce score:", err.message);
            }
        }
        currentLiveState.scoreVisible = data.show;
    });

    // 🔴 ANNONCE : A SUIVRE
    socket.on("update_upnext", async (data) => {
        socket.broadcast.emit("upnext_updated", data);
        if (data.show) {
            try {
                const streamChannel = await client.channels.fetch(CHANNEL_ID);
                if (streamChannel) {
                    await streamChannel.send(
                        `👀 **À SUIVRE SUR LE STREAM** : ${data.text}`,
                    );
                }
            } catch (err) {
                console.log("❌ Erreur annonce upnext:", err.message);
            }
        }
    });

    // 🔴 ANNONCE : CHAMPION
    socket.on("trigger_champion", async (data) => {
        socket.broadcast.emit("champion_triggered", data);
        if (data.show) {
            try {
                const streamChannel = await client.channels.fetch(CHANNEL_ID);
                if (streamChannel) {
                    await streamChannel.send(
                        `🏆 **INCROYABLE !**\n👑 **${data.name.toUpperCase()}** EST LE CHAMPION DU TOURNOI ! Félicitations à lui !`,
                    );
                }
            } catch (err) {
                console.log("❌ Erreur annonce champion:", err.message);
            }
        }
    });

    // 🚨 LE RELAIS UPSET / FRAUD WATCH (OBS + DISCORD)
    socket.on("trigger_upset", async (data) => {
        socket.broadcast.emit("trigger_upset", data); // Envoie l'ordre à OBS
        try {
            const streamChannel = await client.channels.fetch(CHANNEL_ID);
            if (streamChannel) {
                if (data.type === "braquage") {
                    await streamChannel.send(
                        `🚨 **UPSET ALERT !!**\nLe braquage du siècle ! **${data.winner.toUpperCase()}** vient d'abattre **${data.loser.toUpperCase()}** ! 🤯\n📺 *[Venez voir ça en live !](${TWITCH_LINK})*`,
                    );
                } else if (data.type === "fraude") {
                    await streamChannel.send(
                        `📉 **FRAUD WATCH DÉCLENCHÉ !**\nSkill Issue : **${data.loser.toUpperCase()}** vient de se faire laver par **${data.winner.toUpperCase()}**. Le sel est colossal. 🧂`,
                    );
                }
            }
        } catch (err) {
            console.log("❌ Erreur annonce Upset:", err.message);
        }
    });

    // 🎥 GESTION DES DÉCALAGES CAMÉRA (OFFSETS)
    socket.on("update_camera", (data) => {
        // Renvoie exactement les coordonnées (px, py, sc) reçues par la régie vers l'overlay
        socket.broadcast.emit("camera_updated", data);
    });

    socket.on("update_bracket_view", (data) =>
        socket.broadcast.emit("bracket_view_updated", data),
    );
    socket.on("update_casters", (data) =>
        socket.broadcast.emit("casters_updated", data),
    );
    socket.on("show_player_card", (data) =>
        socket.broadcast.emit("playercard_triggered", data),
    );
});

server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
        console.log("⚠️ Port 3000 occupé, nouvelle tentative dans 3s...");
        setTimeout(() => {
            server.close();
            server.listen(3000);
        }, 3000);
    }
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`🌐 Serveur Web allumé sur le port ${port} !`);
});

// ==========================================
// 🤖 CONFIGURATION DU BOT DISCORD
// ==========================================
const client = new Client({
    intents: [
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MESSAGES,
        Intents.FLAGS.MESSAGE_CONTENT,
    ],
});

const SITE_URL = "https://nds-tournament.fr/classement/data.json";
const LOGO_URL = "https://nds-tournament.fr/logos_smash.png";

// ==========================================
// OUTILS DE CONTOURNEMENT ET DE DESSIN
// ==========================================
function fetchImageBuffer(url) {
    return new Promise((resolve, reject) => {
        https
            .get(
                url,
                {
                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                        Accept: "image/png, image/jpeg, image/*;q=0.8",
                    },
                },
                (res) => {
                    if (
                        res.statusCode >= 300 &&
                        res.statusCode < 400 &&
                        res.headers.location
                    ) {
                        return fetchImageBuffer(res.headers.location)
                            .then(resolve)
                            .catch(reject);
                    }
                    if (res.statusCode !== 200)
                        return reject(
                            new Error("Erreur HTTP " + res.statusCode),
                        );
                    const data = [];
                    res.on("data", (chunk) => data.push(chunk));
                    res.on("end", () => resolve(Buffer.concat(data)));
                },
            )
            .on("error", reject);
    });
}

async function getSafeImage(url) {
    if (!url) return null;

    if (url.startsWith("data:")) {
        try {
            return await loadImage(url);
        } catch (e) {
            return null;
        }
    }

    if (!url.startsWith("http")) return null;

    if (url.includes("wikia.nocookie.net")) {
        url += (url.includes("?") ? "&" : "?") + "format=original";
    }

    try {
        const buffer = await fetchImageBuffer(url);
        return await loadImage(buffer);
    } catch (e) {
        console.log(`[Erreur Image] ${url} : ${e.message}`);
        return null;
    }
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
}

function drawTag(ctx, text, x, y) {
    ctx.font = "600 13px Inter, sans-serif";
    const textWidth = ctx.measureText(text).width;
    const tagWidth = textWidth + 24;
    const tagHeight = 26;

    ctx.fillStyle = "#111111";
    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 1;
    roundRect(ctx, x, y - 17, tagWidth, tagHeight, 13, true, true);

    ctx.fillStyle = "#dddddd";
    ctx.fillText(text, x + 12, y);
    return tagWidth + 8;
}

// ==========================================
// SYSTÈME DE SYNCHRONISATION
// ==========================================
function telechargerClassement() {
    const urlAntiCache = SITE_URL + "?t=" + Date.now();
    https
        .get(urlAntiCache, (reponse) => {
            let donnees = "";
            reponse.on("data", (morceau) => {
                donnees += morceau;
            });
            reponse.on("end", async () => {
                try {
                    JSON.parse(donnees);
                    fs.writeFileSync("./data.json", donnees);
                } catch (e) {
                    console.log(`❌ Erreur JSON : ${e.message}`);
                }
            });
        })
        .on("error", (erreur) => {});
}

client.once("ready", async () => {
    console.log(`✅ Le bot ${client.user.tag} est en ligne !`);
    client.user.setActivity("les brackets de la NDS 🏆", { type: "WATCHING" });

    const slashCommands = [
        { name: "ping", description: "Vérifie si le bot est réveillé" },
        {
            name: "top",
            description: "Affiche le classement NDS",
            options: [
                {
                    name: "nombre",
                    type: 4,
                    description: "Combien de joueurs afficher ?",
                    required: false,
                },
            ],
        },
        {
            name: "profil",
            description: "Génère la Carte Joueur officielle en HD",
            options: [
                {
                    name: "joueur",
                    type: 3,
                    description: "Pseudo du joueur",
                    required: true,
                    autocomplete: true,
                },
            ],
        },
    ];

    await client.application.commands.set(slashCommands);
    telechargerClassement();
    setInterval(telechargerClassement, 10 * 60 * 1000);
});

// ==========================================
// GESTION DES COMMANDES
// ==========================================
client.on("interactionCreate", async (interaction) => {
    if (interaction.isAutocomplete()) {
        try {
            const dataBrute = fs.readFileSync("./data.json", "utf8");
            const players = JSON.parse(dataBrute);
            const saisie = interaction.options.getFocused().toLowerCase();
            const choixFiltres = players.filter((p) =>
                p.name.toLowerCase().startsWith(saisie),
            );
            const resultats = choixFiltres
                .slice(0, 25)
                .map((p) => ({ name: p.name, value: p.name }));
            await interaction.respond(resultats);
        } catch (error) {
            await interaction.respond([]);
        }
        return;
    }

    if (!interaction.isCommand()) return;

    if (interaction.commandName === "ping") {
        await interaction.reply("Pong ! 🏓");
    }

    if (interaction.commandName === "top") {
        try {
            const dataBrute = fs.readFileSync("./data.json", "utf8");
            const players = JSON.parse(dataBrute);
            players.sort((a, b) => b.points - a.points);
            let limite = interaction.options.getInteger("nombre") || 5;
            if (limite > 20) limite = 20;
            const topX = players.slice(0, limite);
            let reponse = `🏆 **CLASSEMENT GÉNÉRAL NDS - TOP ${limite}** 🏆\n\n`;
            topX.forEach((joueur, index) => {
                let medaille = "🏅";
                if (index === 0) medaille = "🥇";
                if (index === 1) medaille = "🥈";
                if (index === 2) medaille = "🥉";
                reponse += `${medaille} **#${index + 1} | ${joueur.name}** - ${joueur.points} pts *(Main: ${joueur.main || "?"})*\n`;
            });
            await interaction.reply(reponse);
        } catch (erreur) {
            await interaction.reply({
                content: "Aïe, erreur de données.",
                ephemeral: true,
            });
        }
    }

    // ==========================================
    // 🎨 LE GÉNÉRATEUR DE CARTE (CANVAS)
    // ==========================================
    if (interaction.commandName === "profil") {
        const pseudoRecherche = interaction.options
            .getString("joueur")
            .toLowerCase();
        await interaction.deferReply();

        try {
            const dataBrute = fs.readFileSync("./data.json", "utf8");
            const players = JSON.parse(dataBrute);

            players.sort((a, b) => {
                if (b.points !== a.points) return b.points - a.points;
                return a.participations - b.participations;
            });
            const pIndex = players.findIndex(
                (p) => p.name.toLowerCase() === pseudoRecherche,
            );

            if (pIndex === -1) {
                return await interaction.editReply({
                    content: `❌ Joueur **${interaction.options.getString("joueur")}** introuvable.`,
                });
            }

            const joueur = players[pIndex];
            const rank = pIndex + 1;

            const canvasWidth = 850;
            const canvasHeight = 490;
            const canvas = createCanvas(canvasWidth, canvasHeight);
            const ctx = canvas.getContext("2d");

            // FOND ET BORDURE
            const bgGradiant = ctx.createLinearGradient(
                0,
                0,
                canvasWidth,
                canvasHeight,
            );
            bgGradiant.addColorStop(0, "#0f0f0f");
            bgGradiant.addColorStop(1, "#050505");
            ctx.fillStyle = bgGradiant;
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);

            const glow = ctx.createRadialGradient(
                canvasWidth * 0.8,
                canvasHeight * 0.5,
                0,
                canvasWidth * 0.8,
                canvasHeight * 0.5,
                500,
            );
            glow.addColorStop(0, "rgba(237, 28, 36, 0.15)");
            glow.addColorStop(1, "transparent");
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);

            ctx.strokeStyle = "#333333";
            ctx.lineWidth = 2;
            roundRect(
                ctx,
                1,
                1,
                canvasWidth - 2,
                canvasHeight - 2,
                20,
                false,
                true,
            );

            // RENDER (MAIN URL)
            const renderImg = await getSafeImage(joueur.mainUrl);
            if (renderImg) {
                ctx.globalAlpha = 0.5;
                const rHeight = 480;
                const rWidth = (renderImg.width / renderImg.height) * rHeight;
                ctx.drawImage(
                    renderImg,
                    canvasWidth - rWidth + 40,
                    canvasHeight - rHeight + 10,
                    rWidth,
                    rHeight,
                );
                ctx.globalAlpha = 1.0;
            }

            // PFP
            const pfpSize = 90;
            const pfpX = 40;
            const pfpY = 40;
            let pfpUrl =
                joueur.pfp &&
                joueur.pfp.length > 100 &&
                !joueur.pfp.includes("svg+xml")
                    ? joueur.pfp
                    : LOGO_URL;

            const pfpImg = await getSafeImage(pfpUrl);
            if (pfpImg) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(
                    pfpX + pfpSize / 2,
                    pfpY + pfpSize / 2,
                    pfpSize / 2,
                    0,
                    Math.PI * 2,
                    true,
                );
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(pfpImg, pfpX, pfpY, pfpSize, pfpSize);
                ctx.restore();

                ctx.beginPath();
                ctx.arc(
                    pfpX + pfpSize / 2,
                    pfpY + pfpSize / 2,
                    pfpSize / 2,
                    0,
                    Math.PI * 2,
                    true,
                );
                ctx.strokeStyle = "#ed1c24";
                ctx.lineWidth = 3;
                ctx.stroke();
            }

            // TEXTES PRINCIPAUX
            ctx.fillStyle = "#ffffff";
            ctx.font = "900 48px Montserrat, sans-serif";
            ctx.fillText(joueur.name.toUpperCase(), 155, 85);

            // RANG
            ctx.fillStyle = "#ed1c24";
            ctx.font = "900 22px Montserrat, sans-serif";
            const rankText = `Rang #${rank}`;
            ctx.fillText(rankText, 155, 125);

            const rankWidth = ctx.measureText(rankText).width;
            let mainTextX = 155 + rankWidth + 20;

            // STOCK ICON
            const stockImg = await getSafeImage(joueur.stockUrl);
            if (stockImg) {
                ctx.drawImage(stockImg, mainTextX, 106, 22, 22);
                mainTextX += 30;
            }

            ctx.fillStyle = "#aaaaaa";
            ctx.font = "italic 600 18px Inter, sans-serif";
            ctx.fillText(`Main: ${joueur.main || "Inconnu"}`, mainTextX, 125);

            // STATS BOXES
            ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
            ctx.strokeStyle = "#222222";
            ctx.lineWidth = 1;

            roundRect(ctx, 40, 150, 150, 75, 12, true, true);
            ctx.fillStyle = "#ffffff";
            ctx.font = "900 32px Montserrat, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(joueur.points || "0", 115, 195);
            ctx.fillStyle = "#888888";
            ctx.font = "bold 13px Inter, sans-serif";
            ctx.fillText("POINTS", 115, 215);

            ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
            roundRect(ctx, 205, 150, 150, 75, 12, true, true);
            ctx.fillStyle = "#ffffff";
            ctx.font = "900 32px Montserrat, sans-serif";
            ctx.fillText(joueur.participations || "0", 280, 195);
            ctx.fillStyle = "#888888";
            ctx.font = "bold 13px Inter, sans-serif";
            ctx.fillText("TOURNOIS", 280, 215);

            ctx.textAlign = "left";

            // BIO BOX
            if (joueur.bio && joueur.bio.trim() !== "") {
                const bioGlow = ctx.createLinearGradient(40, 0, 340, 0);
                bioGlow.addColorStop(0, "rgba(237, 28, 36, 0.1)");
                bioGlow.addColorStop(1, "transparent");

                ctx.fillStyle = bioGlow;
                roundRect(ctx, 40, 240, 450, 40, 8, true, false);

                ctx.fillStyle = "#ed1c24";
                ctx.fillRect(40, 240, 3, 40);

                ctx.fillStyle = "#cccccc";
                ctx.font = "italic 16px Inter, sans-serif";
                ctx.fillText(`"${joueur.bio}"`, 55, 265);
            }

            // HISTORIQUE WINS
            ctx.fillStyle = "rgba(20, 20, 20, 0.8)";
            ctx.strokeStyle = "#222222";

            roundRect(ctx, 40, 295, 450, 75, 10, true, true);
            ctx.fillStyle = "#00e676";
            ctx.font = "900 12px Montserrat, sans-serif";
            ctx.fillText("🟢 VICTOIRES", 55, 320);

            let tagX = 55;
            if (joueur.wins && joueur.wins.trim() !== "") {
                const wins = joueur.wins.split(",");
                wins.forEach((w) => {
                    tagX += drawTag(ctx, w.trim(), tagX, 350);
                });
            } else {
                ctx.fillStyle = "#666666";
                ctx.font = "italic 14px Inter, sans-serif";
                ctx.fillText("Aucune donnée", 55, 350);
            }

            // HISTORIQUE LOSES
            ctx.fillStyle = "rgba(20, 20, 20, 0.8)";
            roundRect(ctx, 40, 385, 450, 75, 10, true, true);
            ctx.fillStyle = "#ed1c24";
            ctx.font = "900 12px Montserrat, sans-serif";
            ctx.fillText("🔴 DÉFAITES", 55, 410);

            let tagX2 = 55;
            if (joueur.loses && joueur.loses.trim() !== "") {
                const loses = joueur.loses.split(",");
                loses.forEach((l) => {
                    tagX2 += drawTag(ctx, l.trim(), tagX2, 440);
                });
            } else {
                ctx.fillStyle = "#666666";
                ctx.font = "italic 14px Inter, sans-serif";
                ctx.fillText("Aucune donnée", 55, 440);
            }

            const attachment = new MessageAttachment(
                canvas.toBuffer(),
                `carte_nds_${joueur.name}.png`,
            );

            await interaction.editReply({ files: [attachment] });
        } catch (erreur) {
            console.error(erreur);
            await interaction.editReply({
                content: "Aïe, impossible de générer l'image. 😭",
            });
        }
    }
});

const TOKEN = process.env.TOKEN;
if (!TOKEN) {
    console.log("❌ ERREUR CRITIQUE : Aucun Token trouvé !");
} else {
    client.login(TOKEN);
}
