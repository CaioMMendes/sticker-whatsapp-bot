import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import path from "path";
import P from "pino";
import { Boom } from "./../node_modules/@hapi/boom/lib/index.d";
import {
  baileysIs,
  downloadContent,
  generateRandomFileName,
  getContent,
  tempPath,
} from "./utils";
import { exec } from "child_process";
import fs from "fs";
import "dotenv/config";

const logger = P({ level: "debug" });
const groupId = process.env.whatsapp_group_id;
async function connectionWhatsapp() {
  const { state, saveCreds } = await useMultiFileAuthState(
    path.resolve(__dirname, "..", "auth")
  );
  const socket = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: true,
  });

  socket.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !==
        DisconnectReason.loggedOut;

      if (shouldReconnect) {
        connectionWhatsapp();
      }
    }
  });
  socket.ev.on("creds.update", saveCreds);
  socket.ev.on("messages.upsert", async (data) => {
    const [webMessage] = data.messages;
    console.log(webMessage);
    if (!webMessage || webMessage?.key?.remoteJid !== groupId) {
      return;
    }

    const {
      key: { remoteJid },
      message,
    } = webMessage;
    if (!message) {
      return;
    }

    const isImageMessage = baileysIs(webMessage, "image");
    const isVideoMessage = baileysIs(webMessage, "video");

    const body =
      message?.conversation ||
      message?.extendedTextMessage?.text ||
      getContent(webMessage, "image")?.caption ||
      getContent(webMessage, "video")?.caption;

    if (!body || remoteJid !== groupId) {
      return;
    }

    //larissa cabeçuda
    const text = message.conversation;
    if (text.toLocaleLowerCase() === "larissa") {
      socket.sendMessage(groupId, { text: "É cabeçuda" });
    }

    if (body.toLocaleUpperCase() === "/FIG") {
      console.log("first");
      if (!isImageMessage && !isVideoMessage) {
        await socket.sendMessage(groupId, {
          react: { key: webMessage.key, text: "❌" },
        });

        await socket.sendMessage(groupId, {
          text: "Erro! ❌ Envie uma imagem ou vídeo!",
        });

        return;
      }

      await socket.sendMessage(groupId, {
        react: { key: webMessage.key, text: "⏳" },
      });

      const type = isImageMessage ? "image" : "video";

      const inputFile = await downloadContent({ webMessage, type });

      const outputFile = path.join(
        tempPath(),
        `${generateRandomFileName()}.webp`
      );

      exec(
        `ffmpeg -i ${inputFile} -vf scale=512:512 ${outputFile}`,
        async (error) => {
          if (error) {
            await socket.sendMessage(groupId, {
              react: { key: webMessage.key, text: "❌" },
            });

            await socket.sendMessage(groupId, {
              text: "Erro! ❌ Ocorreu um erro ao tentar converter o arquivo!",
            });

            console.log(error);
            return;
          }

          await socket.sendMessage(groupId, {
            react: { key: webMessage.key, text: "✅" },
          });

          await socket.sendMessage(groupId, {
            sticker: fs.readFileSync(outputFile),
          });
          fs.unlinkSync(inputFile);
          fs.unlinkSync(outputFile);
        }
      );
    }
  });
}

connectionWhatsapp();
console.log(groupId);
