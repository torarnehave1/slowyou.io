import express from 'express'
import nodemailer from 'nodemailer'
import dotenv from 'dotenv'

dotenv.config()

const router = express.Router()

function createTransporterViaPostfix(smtpUser, smtpPass) {
  return nodemailer.createTransport({
    host: process.env.SMTP_RELAY_HOST || 'smtp.vegvisr.org',
    port: Number(process.env.SMTP_RELAY_PORT || 587),
    secure: false,
    requireTLS: true,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    tls: {
      servername: process.env.SMTP_RELAY_HOST || 'smtp.vegvisr.org',
    },
  })
}

function assertFromDomainAllowed(from) {
  const allowedDomain = process.env.SMTP_RELAY_FROM_DOMAIN || 'vegvisr.org'
  const m = String(from || '').match(/<([^>]+)>/)
  const addr = (m ? m[1] : from || '').trim().toLowerCase()
  if (!addr.endsWith(`@${allowedDomain}`)) {
    throw new Error(`from must be @${allowedDomain}`)
  }
}

router.post('/send-domain-email', async (req, res) => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send('Unauthorized')
  }

  const token = authHeader.split(' ')[1]
  if (token !== process.env.VEGVISR_API_TOKEN) {
    return res.status(401).send('Unauthorized')
  }

  const { from, to, subject, text, html, replyTo, smtpUser, smtpPass } = req.body || {}

  if (!from || !to || !subject) {
    return res.status(400).json({ message: 'from, to, subject are required' })
  }

  // Per-user SMTP credentials from request body, fall back to env vars
  const user = smtpUser || process.env.SMTP_RELAY_USER
  const pass = smtpPass || process.env.SMTP_RELAY_PASS

  if (!user || !pass) {
    return res.status(400).json({ message: 'SMTP credentials required (smtpUser/smtpPass or server env)' })
  }

  try {
    assertFromDomainAllowed(from)

    const transporter = createTransporterViaPostfix(user, pass)

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text: text || undefined,
      html: html || undefined,
      replyTo: replyTo || undefined,
    })

    console.log('[send-domain-email] success', {
      messageId: info.messageId,
      from,
      to,
      subject,
    })

    return res.status(200).json({
      message: 'Sent via domain SMTP.',
      messageId: info.messageId,
      response: info.response,
      envelope: info.envelope,
    })
  } catch (err) {
    console.error('[send-domain-email] error', err)
    return res.status(500).json({ message: 'Failed to send.', error: err.message })
  }
})

export default router
