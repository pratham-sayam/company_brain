'use strict';

// ── Shared layout pieces ─────────────────────────────────────

function wrapLayout(bodyContent) {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Orvyn</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"><tr><td><![endif]-->
        <!-- Inner container -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <!-- Green header -->
          <tr>
            <td align="center" style="background:linear-gradient(135deg,#059669 0%,#047857 100%);padding:28px 24px;">
              <p style="margin:0;font-size:24px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">Orvyn</p>
            </td>
          </tr>
          <!-- Body content -->
          <tr>
            <td style="padding:36px 32px 24px;">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:0 32px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-top:1px solid #e4e4e7;padding-top:20px;">
                    <p style="margin:0;font-size:12px;color:#a1a1aa;text-align:center;line-height:18px;">
                      &copy; ${new Date().getFullYear()} Orvyn &mdash; Intelligent Document Management
                    </p>
                    <p style="margin:6px 0 0;font-size:12px;color:#a1a1aa;text-align:center;line-height:18px;">
                      This is an automated message. Please do not reply directly to this email.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function otpBlock(code) {
  const digitCells = String(code)
    .split('')
    .map(d => `<td style="width:44px;height:52px;background-color:#F0FDF4;border:2px solid #BBF7D0;border-radius:8px;text-align:center;vertical-align:middle;font-size:28px;font-weight:700;font-family:'Courier New',Courier,monospace;color:#059669;">${d}</td>`)
    .join('\n            <td style="width:10px;">&nbsp;</td>\n            ');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" style="padding:24px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
            ${digitCells}
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

function expiryNotice(minutes) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" style="padding:0 0 8px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="background-color:#FEF3C7;border-radius:8px;padding:10px 20px;">
            <p style="margin:0;font-size:13px;color:#92400E;text-align:center;">
              &#9200; &nbsp;This code expires in <strong>${minutes} minutes</strong>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

// ── Template: Verification Email ─────────────────────────────

function verificationEmailTemplate(code, expiryMinutes) {
  const html = wrapLayout(`
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#18181b;text-align:center;">
      Verify Your Email
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#52525b;text-align:center;line-height:22px;">
      Welcome to Orvyn! Use the verification code below to confirm your email address and activate your account.
    </p>

    ${otpBlock(code)}
    ${expiryNotice(expiryMinutes)}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:20px 0 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F4F5;border-radius:8px;">
            <tr>
              <td style="padding:14px 18px;">
                <p style="margin:0;font-size:13px;color:#71717a;line-height:19px;">
                  <strong style="color:#52525b;">&#128274; Security tip:</strong> If you didn&rsquo;t create an Orvyn account, you can safely ignore this email. No account will be created.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `);

  const text = [
    'Verify Your Email — Orvyn',
    '',
    'Welcome to Orvyn! Use the verification code below to confirm your email address:',
    '',
    `  ${code}`,
    '',
    `This code expires in ${expiryMinutes} minutes.`,
    '',
    'If you didn\'t create an Orvyn account, you can safely ignore this email.',
  ].join('\n');

  return { html, text };
}

// ── Template: Password Reset Email ───────────────────────────

function passwordResetEmailTemplate(code, expiryMinutes) {
  const html = wrapLayout(`
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#18181b;text-align:center;">
      Reset Your Password
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#52525b;text-align:center;line-height:22px;">
      We received a request to reset your Orvyn password. Enter the code below in the app to set a new password.
    </p>

    ${otpBlock(code)}
    ${expiryNotice(expiryMinutes)}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:20px 0 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F4F5;border-radius:8px;">
            <tr>
              <td style="padding:14px 18px;">
                <p style="margin:0;font-size:13px;color:#71717a;line-height:19px;">
                  <strong style="color:#52525b;">&#128274; Security tip:</strong> If you didn&rsquo;t request a password reset, you can safely ignore this email. Your password will remain unchanged.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `);

  const text = [
    'Reset Your Password — Orvyn',
    '',
    'We received a request to reset your Orvyn password. Use the code below:',
    '',
    `  ${code}`,
    '',
    `This code expires in ${expiryMinutes} minutes.`,
    '',
    'If you didn\'t request this, you can safely ignore this email. Your password will remain unchanged.',
  ].join('\n');

  return { html, text };
}

module.exports = {
  verificationEmailTemplate,
  passwordResetEmailTemplate,
};
