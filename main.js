import { Boom } from '@hapi/boom';
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from '@whiskeysockets/baileys';
import chalk from 'chalk';
import fs from 'fs';
import { join } from 'path';

// ===========================
// CONFIG PARA RENDER
// ===========================

// No usar QR.
// No usar readline.
// No preguntar nada.
// Siempre generar código de emparejamiento.

const PHONE_NUMBER = process.env.WHATSAPP_NUMBER || ""; 
// Ejemplo en Render:  +5214770000000

if (!PHONE_NUMBER.startsWith("+")) {
  console.log(chalk.red("⚠ Debes configurar WHATSAPP_NUMBER en Render con formato internacional: +521XXXXXXXXXX"));
  process.exit(1);
}

// Carpeta de sesión
const AUTH_DIR = join(process.cwd(), "auth");

if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

// ===========================
// INICIO DEL BOT
// ===========================

async function startBot() {
  console.log(chalk.cyan("🚀 Iniciando Luna-botv6 en modo RENDER (Pairing Code)…"));

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,   // IMPORTANTE → Render no soporta QR
    browser: ["Luna-botv6", "Chrome", "6.0"]
  });

  // ===============================
  // SI NO EXISTE CREDENCIAL → PEDIR CÓDIGO AUTOMÁTICO
  // ===============================
  if (!fs.existsSync(join(AUTH_DIR, "creds.json"))) {
    console.log(chalk.yellow("\n📌 No existe sesión, generando código de emparejamiento…"));

    const code = await sock.requestPairingCode(PHONE_NUMBER.trim());
    console.log(chalk.magenta("\n🔐 TU CÓDIGO DE EMPAREJAMIENTO ES:\n"));
    console.log(chalk.green.bold(`👉 ${code}\n`));
    console.log(chalk.yellow("📲 Ve a WhatsApp → Vincular Dispositivo → Ingresa ese código.\n"));
  }

  // ===============================
  // MANEJO DE EVENTOS
  // ===============================

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;

      console.log(chalk.red("❌ Conexión cerrada:"), reason);

      if (reason === DisconnectReason.loggedOut) {
        console.log(chalk.red("⛔ La sesión fue cerrada. Borrando auth y reiniciando."));
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        startBot();
      } else {
        console.log(chalk.yellow("🔁 Reconectando…"));
        startBot();
      }
    }

    if (connection === "open") {
      console.log(chalk.green("✅ Bot conectado correctamente a WhatsApp."));
    }
  });

  // ===============================
  // MANEJO DE MENSAJES
  // ===============================

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    const msg = messages[0];
    const from = msg.key.remoteJid;
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

    if (!text) return;

    console.log(chalk.blue(`📩 Mensaje de ${from}: ${text}`));

    // Respuesta básica (tú pones tu lógica aquí)
    await sock.sendMessage(from, { text: "Hola! Soy tu bot en Render 😄" });
  });

}

// Iniciar bot
startBot();
