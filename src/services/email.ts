/**
 * Email service abstraction for sending verification, reset, and invite emails
 * Supports pluggable providers - starts with console logging for dev
 */

export interface EmailProvider {
  sendEmail(options: SendEmailOptions): Promise<void>;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface VerificationEmailOptions {
  email: string;
  name: string;
  tenantName: string;
  verificationLink: string;
}

export interface PasswordResetEmailOptions {
  email: string;
  name: string;
  tenantName: string;
  resetLink: string;
}

export interface InviteEmailOptions {
  email: string;
  name: string;
  tenantName: string;
  inviterName: string;
  inviteLink: string;
  role: string;
}

export interface EmailChangeNotificationOptions {
  email: string;
  name: string;
  tenantName: string;
  newEmail: string;
}

class ConsoleEmailProvider implements EmailProvider {
  async sendEmail(options: SendEmailOptions): Promise<void> {
    console.log("=".repeat(60));
    console.log("EMAIL SENT (Console Provider - Development Mode)");
    console.log("=".repeat(60));
    console.log(`To: ${options.to}`);
    console.log(`Subject: ${options.subject}`);
    console.log("-".repeat(60));
    console.log(options.text || options.html);
    console.log("=".repeat(60));
  }
}

/**
 * Email provider using @ugm/desiagent's SendEmailTool
 * Requires SMTP environment variables: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 */
class DesiAgentEmailProvider implements EmailProvider {
  private sendEmailTool: any;
  private initialized = false;

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    const { sendEmailTool } = await import("@ugm/desiagent");
    this.sendEmailTool = sendEmailTool
    this.initialized = true;
  }

  async sendEmail(options: SendEmailOptions): Promise<void> {
    await this.ensureInitialized();

   
    const result = await this.sendEmailTool(
      {
        to: options.to,
        subject: options.subject,
        body: options.html,
        html: true,
      }
    );

    if (!result.success) {
      throw new Error(`Failed to send email: ${result.error ?? "Unknown error"}`);
    }
  }
}

export { DesiAgentEmailProvider };

//let emailProvider: EmailProvider = new ConsoleEmailProvider();
let emailProvider: EmailProvider = new DesiAgentEmailProvider();

export function setEmailProvider(provider: EmailProvider): void {
  emailProvider = provider;
}

export function getEmailProvider(): EmailProvider {
  return emailProvider;
}

export async function sendVerificationEmail(
  options: VerificationEmailOptions
): Promise<void> {
  const subject = `Verify your email for ${options.tenantName}`;
  const html = `
    <h1>Welcome to ${options.tenantName}!</h1>
    <p>Hi ${options.name},</p>
    <p>Please verify your email address by clicking the link below:</p>
    <p><a href="${options.verificationLink}">Verify Email</a></p>
    <p>Or copy and paste this URL into your browser:</p>
    <p>${options.verificationLink}</p>
    <p>This link will expire in 24 hours.</p>
    <p>If you did not create an account, please ignore this email.</p>
  `;
  const text = `
Welcome to ${options.tenantName}!

Hi ${options.name},

Please verify your email address by visiting:
${options.verificationLink}

This link will expire in 24 hours.

If you did not create an account, please ignore this email.
  `.trim();

  await emailProvider.sendEmail({
    to: options.email,
    subject,
    html,
    text,
  });
}

export async function sendPasswordResetEmail(
  options: PasswordResetEmailOptions
): Promise<void> {
  const subject = `Password reset for ${options.tenantName}`;
  const html = `
    <h1>Password Reset Request</h1>
    <p>Hi ${options.name},</p>
    <p>We received a request to reset your password for ${options.tenantName}.</p>
    <p><a href="${options.resetLink}">Reset Password</a></p>
    <p>Or copy and paste this URL into your browser:</p>
    <p>${options.resetLink}</p>
    <p>This link will expire in 1 hour.</p>
    <p>If you did not request a password reset, please ignore this email.</p>
  `;
  const text = `
Password Reset Request

Hi ${options.name},

We received a request to reset your password for ${options.tenantName}.

Reset your password by visiting:
${options.resetLink}

This link will expire in 1 hour.

If you did not request a password reset, please ignore this email.
  `.trim();

  await emailProvider.sendEmail({
    to: options.email,
    subject,
    html,
    text,
  });
}

export async function sendInviteEmail(
  options: InviteEmailOptions
): Promise<void> {
  const subject = `You've been invited to join ${options.tenantName}`;
  const html = `
    <h1>You're Invited!</h1>
    <p>Hi ${options.name},</p>
    <p>${options.inviterName} has invited you to join ${options.tenantName} as a ${options.role}.</p>
    <p><a href="${options.inviteLink}">Accept Invitation</a></p>
    <p>Or copy and paste this URL into your browser:</p>
    <p>${options.inviteLink}</p>
    <p>This invitation will expire in 7 days.</p>
  `;
  const text = `
You're Invited!

Hi ${options.name},

${options.inviterName} has invited you to join ${options.tenantName} as a ${options.role}.

Accept your invitation by visiting:
${options.inviteLink}

This invitation will expire in 7 days.
  `.trim();

  await emailProvider.sendEmail({
    to: options.email,
    subject,
    html,
    text,
  });
}

export async function sendEmailChangeNotification(
  options: EmailChangeNotificationOptions
): Promise<void> {
  const subject = `Email address changed for ${options.tenantName}`;
  const html = `
    <h1>Email Address Changed</h1>
    <p>Hi ${options.name},</p>
    <p>Your email address for ${options.tenantName} has been changed to ${options.newEmail}.</p>
    <p>If you did not make this change, please contact support immediately.</p>
  `;
  const text = `
Email Address Changed

Hi ${options.name},

Your email address for ${options.tenantName} has been changed to ${options.newEmail}.

If you did not make this change, please contact support immediately.
  `.trim();

  await emailProvider.sendEmail({
    to: options.email,
    subject,
    html,
    text,
  });
}
