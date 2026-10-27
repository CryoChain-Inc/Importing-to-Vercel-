// Email copy for the send-auth-email hook. Each builder returns { subject, html }.
const BRAND = '#1f7a45';

const layout = (body: string) =>
  `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">` +
  `<p style="font-size:18px;font-weight:700;color:${BRAND};margin:0 0 16px">CryoChain</p>${body}` +
  `<p style="font-size:12px;color:#666;margin-top:24px">If you didn't request this, you can ignore this email. CryoChain will never ask you for this code.</p></div>`;

export const codeEmail = (code: string, purpose: 'sign-in' | 'confirmation') => ({
  subject: purpose === 'sign-in' ? 'Your CryoChain sign-in code' : 'Your CryoChain confirmation code',
  html: layout(
    `<p>Use this code to ${purpose === 'sign-in' ? 'sign in to' : 'confirm your email on'} your CryoChain account:</p>` +
      `<p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:12px 0">${code}</p><p>It expires shortly.</p>`,
  ),
});

export const confirmEmail = (link: string) => ({
  subject: 'Confirm your CryoChain email',
  html: layout(
    `<p>Tap the button to confirm this email for your CryoChain account.</p>` +
      `<p><a href="${link}" clicktracking="off" style="display:inline-block;padding:12px 20px;background:${BRAND};color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Confirm email</a></p>` +
      `<p style="font-size:12px;color:#666">Button not working? Paste this into your browser:<br>${link}</p>`,
  ),
});
