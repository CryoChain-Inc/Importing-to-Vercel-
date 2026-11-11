// Email copy for the send-auth-email hook. Each builder returns { subject, html }.
// Palette mirrors src/theme/colors.ts. Mail clients only trust tables + inline styles; every gradient has a solid bgcolor fallback.
const INK = '#14201a';
const MUTED = '#56615b';
const BRAND = '#12864b';
const BRAND_DEEP = '#0a3d24';
const TINT = '#e4f5ea';
const HARVEST = '#d98a1f';
const SITE = 'https://www.cryochain.co';
const FONT = `-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

const header =
  `<tr><td bgcolor="${BRAND_DEEP}" style="background-color:${BRAND_DEEP};background-image:linear-gradient(145deg,#12864b 0%,#0b6b3a 55%,#084d2b 100%);padding:36px 32px 32px;border-radius:20px 20px 0 0">` +
  `<table role="presentation" cellpadding="0" cellspacing="0"><tr>` +
  `<td style="font-family:${FONT};font-size:22px;line-height:22px;color:${HARVEST}">&#9679;</td>` +
  `<td style="padding-left:8px;font-family:${FONT};font-size:22px;font-weight:800;letter-spacing:.5px;color:#ffffff">CryoChain</td>` +
  `</tr></table>` +
  `<p style="margin:14px 0 0;font-family:${FONT};font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#a8e6c3">Farm fresh &middot; Kept cold</p>` +
  `</td></tr>`;

// `preheader` is the inbox preview line; the &zwnj;&nbsp; run stops the client pulling body text into it.
const layout = (preheader: string, title: string, body: string, footer: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>` +
  `<body style="margin:0;padding:0;background:#eef3ef">` +
  `<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#eef3ef">${preheader}${'&zwnj;&nbsp;'.repeat(40)}</div>` +
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef3ef" style="background:#eef3ef"><tr><td align="center" style="padding:32px 14px">` +
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">` +
  header +
  `<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:36px 32px 12px;font-family:${FONT};color:${INK}">` +
  `<h1 style="margin:0 0 14px;font-size:26px;line-height:1.25;font-weight:800;letter-spacing:-.3px;color:${INK}">${title}</h1>${body}</td></tr>` +
  `<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:0 32px 28px"><div style="height:1px;background:#e3ebe5;line-height:1px;font-size:0">&nbsp;</div>` +
  `<p style="margin:18px 0 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED}">${footer}</p></td></tr>` +
  `<tr><td bgcolor="${TINT}" style="background:${TINT};padding:18px 32px;border-radius:0 0 20px 20px;font-family:${FONT};font-size:12px;color:${BRAND_DEEP}">` +
  `<a href="${SITE}" style="color:${BRAND_DEEP};font-weight:700;text-decoration:none">cryochain.co</a>` +
  `<span style="color:${MUTED}"> &nbsp;&middot;&nbsp; Cold-chain produce, from farm to table</span></td></tr>` +
  `</table></td></tr></table></body></html>`;

const p = (t: string) => `<p style="margin:0 0 22px;font-size:16px;line-height:1.6;color:${MUTED}">${t}</p>`;

export const codeEmail = (code: string, purpose: 'sign-in' | 'confirmation') => {
  const signIn = purpose === 'sign-in';
  return {
    subject: signIn ? 'Your CryoChain sign-in code' : 'Your CryoChain confirmation code',
    html: layout(
      `Your code is ${code}. It expires shortly.`,
      signIn ? 'Welcome back' : 'Confirm your email',
      p(`Enter this code to ${signIn ? 'sign in to' : 'confirm your email on'} your CryoChain account.`) +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr><td align="center" bgcolor="${TINT}" style="background:${TINT};border:1px solid #bfe6cf;border-radius:16px;padding:22px 12px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:38px;font-weight:700;letter-spacing:10px;color:${BRAND_DEEP}">${code}</td></tr></table>` +
        `<p style="margin:0 0 20px;font-size:13px;color:${MUTED}">This code expires shortly, so use it soon.</p>`,
      `Didn't ask for this? You can safely ignore this email. CryoChain will never ask you to share this code with anyone.`,
    ),
  };
};

export const confirmEmail = (link: string) => ({
  subject: 'Confirm your CryoChain email',
  html: layout(
    'One tap to confirm this email on your CryoChain account.',
    'Confirm your email',
    p(`You're one tap away. Confirm this address and it becomes part of your CryoChain account, so you'll get order and pickup updates here.`) +
      // Bulletproof button: the padding lives on the <td>, so Outlook renders it too.
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 26px"><tr><td align="center" bgcolor="${BRAND}" style="background:${BRAND};border-radius:12px"><a href="${link}" clicktracking="off" style="display:inline-block;padding:16px 36px;font-family:${FONT};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px">Confirm email &rarr;</a></td></tr></table>` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr><td bgcolor="#f4f6f4" style="background:#f4f6f4;border-radius:12px;padding:14px 16px;font-size:12px;line-height:1.6;color:${MUTED}">Button not working? Copy this link into your browser:<br><a href="${link}" clicktracking="off" style="color:${BRAND};word-break:break-all">${link}</a></td></tr></table>`,
    `Didn't request this change? Ignore this email and nothing will change on your account.`,
  ),
});
