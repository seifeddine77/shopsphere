const nodemailer = require('nodemailer');
const config = require('../config/environment');
const logger = require('../config/logger');

/**
 * Email service.
 * - SMTP transport when SMTP_HOST is configured
 * - JSON console transport otherwise (development friendly)
 * - In test mode messages are captured in `sentEmails` for assertions
 */

const sentEmails = [];

let transporter;
if (config.smtp.host) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user
      ? { user: config.smtp.user, pass: config.smtp.password }
      : undefined,
  });
} else {
  // No SMTP configured: emit the message through winston instead of failing
  transporter = nodemailer.createTransport({ jsonTransport: true });
}

async function send({ to, subject, html, text }) {
  const mailOptions = {
    from: config.smtp.from,
    to,
    subject,
    text,
    html,
  };

  if (config.isTest) {
    sentEmails.push(mailOptions);
    logger.debug(`[test] email captured -> ${to}: ${subject}`);
    return { captured: true };
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    if (!config.smtp.host) {
      logger.info(`Email (console transport) -> ${to}: ${subject}`);
    } else {
      logger.info(`Email sent -> ${to}: ${subject} (${info.messageId})`);
    }
    return info;
  } catch (error) {
    // Email failures must never crash a request (e.g. registration)
    logger.error(`Email delivery failed for ${to}: ${error.message}`);
    return null;
  }
}

/* ------------------------------ Templates ------------------------------- */

const layout = (title, bodyHtml) => `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px;">
    <h2 style="color:#4f46e5;margin:0 0 16px;">ShopSphere</h2>
    <div style="background:#ffffff;border-radius:8px;padding:24px;">
      <h3 style="margin-top:0;color:#111827;">${title}</h3>
      ${bodyHtml}
      <p style="color:#6b7280;font-size:12px;margin-bottom:0;">
        If you did not request this email, you can safely ignore it.
      </p>
    </div>
  </div>`;

function sendWelcomeEmail(user) {
  return send({
    to: user.email,
    subject: 'Welcome to ShopSphere!',
    text: `Hi ${user.firstName}, welcome to ShopSphere. Your account is ready.`,
    html: layout(
      'Welcome aboard!',
      `<p>Hi <strong>${user.firstName}</strong>,</p>
       <p>Your account has been created successfully. Happy shopping!</p>`,
    ),
  });
}

function sendPasswordResetEmail(user, resetUrl, expiresInMinutes) {
  return send({
    to: user.email,
    subject: 'Reset your password',
    text: `Reset your password using this link (valid ${expiresInMinutes} minutes): ${resetUrl}`,
    html: layout(
      'Password reset requested',
      `<p>Hi <strong>${user.firstName}</strong>,</p>
       <p>We received a request to reset your password.</p>
       <p style="margin:24px 0;">
         <a href="${resetUrl}" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;">
           Choose a new password
         </a>
       </p>
       <p>This link expires in <strong>${expiresInMinutes} minutes</strong>.</p>`,
    ),
  });
}

/* ---------------------------- Order lifecycle ----------------------------- */

const ORDER_EMAILS = {
  placed: (order) => ({
    title: 'Thank you for your order!',
    body: `<p>Your order <strong>${order.orderNumber}</strong> has been received.</p>
           <p>Total: <strong>$${order.total.toFixed(2)}</strong></p>`,
  }),
  confirmed: (order) => ({
    title: 'Your order is confirmed',
    body: `<p>Good news - order <strong>${order.orderNumber}</strong> has been confirmed and is being prepared.</p>`,
  }),
  shipped: (order) => ({
    title: 'Your order has shipped!',
    body: `<p>Order <strong>${order.orderNumber}</strong> is on its way.</p>
           ${order.trackingNumber ? `<p>Tracking number: <strong>${order.trackingNumber}</strong></p>` : ''}`,
  }),
  delivered: (order) => ({
    title: 'Your order was delivered',
    body: `<p>Order <strong>${order.orderNumber}</strong> has been delivered. We hope you love it!</p>`,
  }),
  cancelled: (order) => ({
    title: 'Your order was cancelled',
    body: `<p>Order <strong>${order.orderNumber}</strong> has been cancelled.</p>
           <p>${order.paymentStatus === 'REFUNDED' ? 'A refund has been issued to your original payment method.' : 'If you were charged, any pending amount will not be collected.'}</p>`,
  }),
};

function sendOrderEmail(user, order, event) {
  const builder = ORDER_EMAILS[event];
  if (!builder) throw new Error(`Unknown order email event: ${event}`);

  const { title, body } = builder(order);
  const url = `${config.appUrl}/orders/${order._id}`;

  return send({
    to: user.email,
    subject: `${title} - ${order.orderNumber}`,
    text: `${title}. Track your order: ${url}`,
    html: layout(
      title,
      `${body}
       <p style="margin-top:20px;">
         <a href="${url}" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:8px;display:inline-block;">
           View my order
         </a>
       </p>`,
    ),
  });
}

module.exports = {
  sentEmails,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendOrderEmail,
};
