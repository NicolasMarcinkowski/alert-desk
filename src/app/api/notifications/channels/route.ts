import { prisma } from "@/lib/db/client";
import { seal } from "@/lib/crypto";
import {
  badRequest,
  requireSession,
  unauthorized,
} from "@/lib/api/validation";

/** Config des canaux — on ne renvoie JAMAIS les secrets, juste leur présence. */
export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();

  const channels = await prisma.notificationChannel.findMany({
    where: { userId: session.user.id },
    select: { type: true, enabled: true },
  });
  return Response.json({
    telegram: {
      configured: channels.some((c) => c.type === "TELEGRAM"),
      enabled: channels.find((c) => c.type === "TELEGRAM")?.enabled ?? false,
      botConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    },
    discord: {
      configured: channels.some((c) => c.type === "DISCORD"),
      enabled: channels.find((c) => c.type === "DISCORD")?.enabled ?? false,
    },
  });
}

/** Body : { telegramChatId?: string, discordWebhookUrl?: string } — "" pour supprimer. */
export async function PUT(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const body = await request.json().catch(() => null);
  if (!body) return badRequest("corps JSON attendu");

  if (typeof body.telegramChatId === "string") {
    const chatId = body.telegramChatId.trim();
    if (chatId === "") {
      await prisma.notificationChannel.deleteMany({
        where: { userId: session.user.id, type: "TELEGRAM" },
      });
    } else {
      await prisma.notificationChannel.upsert({
        where: {
          userId_type: { userId: session.user.id, type: "TELEGRAM" },
        },
        create: {
          userId: session.user.id,
          type: "TELEGRAM",
          configEncrypted: seal(JSON.stringify({ chatId })),
        },
        update: { configEncrypted: seal(JSON.stringify({ chatId })), enabled: true },
      });
    }
  }

  if (typeof body.discordWebhookUrl === "string") {
    const webhookUrl = body.discordWebhookUrl.trim();
    if (webhookUrl === "") {
      await prisma.notificationChannel.deleteMany({
        where: { userId: session.user.id, type: "DISCORD" },
      });
    } else {
      if (!webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
        return badRequest("URL de webhook Discord invalide");
      }
      await prisma.notificationChannel.upsert({
        where: { userId_type: { userId: session.user.id, type: "DISCORD" } },
        create: {
          userId: session.user.id,
          type: "DISCORD",
          configEncrypted: seal(JSON.stringify({ webhookUrl })),
        },
        update: {
          configEncrypted: seal(JSON.stringify({ webhookUrl })),
          enabled: true,
        },
      });
    }
  }

  return Response.json({ ok: true });
}
