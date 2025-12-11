import { join, dirname } from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { setupMaster, fork } from 'cluster';
import cfonts from 'cfonts';
import readline from 'readline';
import yargs from 'yargs';
import chalk from 'chalk';
import fs from 'fs/promises';
import fsSync from 'fs';
import './config.js';
import { PHONENUMBER_MCC } from '@whiskeysockets/baileys';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(__dirname);
const { say } = cfonts;

// ===========================
// FIX Render → evitar readline
// ===========================
const isTTY = process.stdout.isTTY;   // ← Render = false
let rl = null;

if (isTTY) {
  rl = readline.createInterface({ input: process.stdin, output: process.stdout });
}

// wrapper seguro
const question = (texto) => {
  if (!isTTY) {
    console.log(chalk.yellow(`(Render detectado → pregunta omitida: ${texto})`));

    // MODO AUTOMÁTICO EN RENDER
    if (texto.includes("Seleccione una opción")) return Promise.resolve("1"); // QR
    if (texto.includes("Escriba su número")) return Promise.resolve("+5210000000000");

    return Promise.resolve("");
  }

  return new Promise((resolver) => rl.question(texto, resolver));
};

// =====================================================
// VISUAL
// =====================================================

say('Iniciando...', {
  font: 'simple',
  align: 'center',
  gradient: ['yellow', 'cyan'],
});

say('Luna-botv6', {
  font: 'block',
  align: 'center',
  gradient: ['blue', 'magenta'],
});

process.stdout.write('\x07');

console.log(chalk.hex('#00FFFF').bold('─◉ Bienvenido al sistema Luna-botv6'));
console.log(chalk.hex('#FF00FF')('─◉ Preparando entorno y verificaciones necesarias...'));

// =====================================================
// CONFIG tmp
// =====================================================

const rutaTmp = join(__dirname, 'src/tmp');
try {
  await fs.mkdir(rutaTmp, { recursive: true });
  await fs.chmod(rutaTmp, 0o777);
  console.log(chalk.hex('#39FF14')('✓ Carpeta src/tmp configurada correctamente.'));
} catch (err) {
  console.warn(chalk.hex('#FFA500')('⚠ Error configurando src/tmp:'), err.message);
}

// … (NO MOVER NADA AQUÍ) …

// =====================================================
// FUNCIÓN START (ARREGLADA)
// =====================================================

async function start(file) {
  if (isRunning) return;
  isRunning = true;

  await verificarOCrearCarpetaAuth();

  // Si ya hay creds.json, no preguntar nada
  if (verificarCredsJson()) {
    const args = [join(__dirname, file), ...process.argv.slice(2)];
    setupMaster({ exec: args[0], args: args.slice(1) });
    fork();
    return;
  }

  // ===============================================
  // Aquí estaban tus preguntas (FIX Render aplicado)
  // ===============================================

  const opcion = await question(
    chalk.hex('#FFD700').bold('─◉　Seleccione una opción (solo el numero):\n') +
    chalk.hex('#E0E0E0').bold('1. Con código QR\n2. Con código de texto de 8 dígitos\n─> ')
  );

  let numeroTelefono = '';

  if (opcion === '2') {
    const phoneNumber = await question(
      chalk.hex('#FFD700').bold('\n─◉　Escriba su número de WhatsApp:\n') +
      chalk.hex('#E0E0E0').bold('◉　Ejemplo: +5493483466763\n─> ')
    );

    numeroTelefono = formatearNumeroTelefono(phoneNumber);

    if (!esNumeroValido(numeroTelefono)) {
      console.log(chalk.bgHex('#FF1493')(chalk.white.bold('[ ERROR ] Número inválido.\n')));
      process.exit(0);
    }
    process.argv.push(numeroTelefono);
  }

  if (opcion === '1') process.argv.push('qr');
  if (opcion === '2') process.argv.push('code');

  const args = [join(__dirname, file), ...process.argv.slice(2)];
  setupMaster({ exec: args[0], args: args.slice(1) });

  const p = fork();

  p.on('message', (data) => {
    console.log(chalk.hex('#39FF14').bold('─◉　RECIBIDO:'), data);
    switch (data) {
      case 'reset':
        p.process.kill();
        isRunning = false;
        start.apply(this, arguments);
        break;
      case 'uptime':
        p.send(process.uptime());
        break;
    }
  });

  p.on('exit', (_, code) => {
    isRunning = false;
    console.error(chalk.hex('#FF1493').bold('[ ERROR ] Ocurrió un error inesperado:'), code);
    p.process.kill();
    isRunning = false;
    start.apply(this, arguments);
    if (process.env.pm_id) process.exit(1);
    else process.exit();
  });

  const opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse());
  if (!opts['test']) {
    if (rl && !rl.listenerCount()) {
      rl.on('line', (line) => {
        p.emit('message', line.trim());
      });
    }
  }
}

start('main.js');
