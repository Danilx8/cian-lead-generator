// notification.service.ts
// Подсистема уведомлений и алертов (ВКР §1.6/§1.7): информирование пользователей о
// событиях системы через email-канал (SMTP-шлюз). Если SMTP не настроен (нет SMTP_HOST),
// уведомления только логируются — система остаётся работоспособной.
import nodemailer, { Transporter } from "nodemailer";
import { ENV, logger } from "../../config";

export interface EmailMessage {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

class NotificationServiceImpl {
  private transporter: Transporter | null = null;
  private initialized = false;

  private getTransporter(): Transporter | null {
    if (this.initialized) return this.transporter;
    this.initialized = true;

    if (!ENV.SMTP_HOST) {
      logger.info("[notifications] SMTP not configured — email notifications are logged only");
      this.transporter = null;
      return null;
    }

    this.transporter = nodemailer.createTransport({
      host: ENV.SMTP_HOST,
      port: ENV.SMTP_PORT,
      secure: ENV.SMTP_SECURE,
      auth: ENV.SMTP_USER ? { user: ENV.SMTP_USER, pass: ENV.SMTP_PASSWORD } : undefined,
    });
    logger.info(`[notifications] SMTP configured: ${ENV.SMTP_HOST}:${ENV.SMTP_PORT}`);
    return this.transporter;
  }

  /** Настроен ли реальный email-канал. */
  isEmailEnabled(): boolean {
    return !!ENV.SMTP_HOST;
  }

  /** Отправляет email; при отсутствии SMTP — логирует. Не бросает наружу. */
  async sendEmail(message: EmailMessage): Promise<void> {
    const transporter = this.getTransporter();
    if (!transporter) {
      logger.info(`[notifications] (no SMTP) → ${message.to}: ${message.subject}`);
      return;
    }
    try {
      await transporter.sendMail({
        from: ENV.SMTP_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      logger.info(`[notifications] email sent → ${message.to}: ${message.subject}`);
    } catch (e) {
      logger.error(`[notifications] failed to send email to ${message.to}: ${(e as Error).message}`);
    }
  }

  // ── Доменные уведомления ────────────────────────────────────────────────────

  /** Заявка на регистрацию одобрена администратором. */
  async notifyRegistrationApproved(email: string, username?: string): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: "Доступ к системе лидогенерации одобрен",
      text:
        `Здравствуйте${username ? ", " + username : ""}!\n\n` +
        "Ваша заявка на регистрацию одобрена администратором. Теперь вы можете войти в систему.",
    });
  }

  /** Заявка на регистрацию отклонена администратором. */
  async notifyRegistrationRejected(email: string, username?: string): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: "Заявка на регистрацию отклонена",
      text:
        `Здравствуйте${username ? ", " + username : ""}!\n\n` +
        "К сожалению, ваша заявка на регистрацию была отклонена администратором.",
    });
  }

  /** Уведомление о новом ответе продавца в диалоге. */
  async notifySellerReply(email: string, itemName: string): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: "Новый ответ продавца",
      text: `По объявлению «${itemName}» получен новый ответ от продавца.`,
    });
  }
}

export const NotificationService = new NotificationServiceImpl();
export default NotificationService;
