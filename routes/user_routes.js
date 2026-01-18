// routes/auth.js

import express from 'express'
import crypto from 'crypto'
import nodemailer from 'nodemailer'
import dotenv from 'dotenv'
import emailTemplates from '../public/languages/nb.json' with { type: 'json' } // Adjust the import if necessary
import { logApiCall } from '../services/apiCallLogService.js'
import EmailVerificationToken from '../models/apiCallLogs.js'

dotenv.config()

const router = express.Router()

// Helper functions for multi-sender email support
function parseApprovedSenders() {
  const senderConfigs = {}
  const sendersString = process.env.APPROVED_SENDERS || ''
  
  sendersString.split(',').forEach(pair => {
    const [email, password] = pair.trim().split(':')
    if (email && password) {
      senderConfigs[email] = password
    }
  })
  
  return senderConfigs
}

function isApprovedSender(email) {
  const configs = parseApprovedSenders()
  return configs.hasOwnProperty(email)
}

function getPasswordForSender(email) {
  const configs = parseApprovedSenders()
  return configs[email]
}

function createTransporterForSender(email) {
  if (!isApprovedSender(email)) {
    throw new Error(`Sender '${email}' not found in approved list`)
  }
  
  return nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: email,
      pass: getPasswordForSender(email),
    },
  })
}

function buildOnboardingSummaryHtml(summary) {
  if (!summary || typeof summary !== 'object') {
    return '<p style="margin: 0; color: #666;">No details provided.</p>'
  }

  const rows = Object.entries(summary)
    .map(([key, value]) => {
      const safeKey = String(key)
      const displayValue = Array.isArray(value) ? value.join(', ') : String(value ?? '').trim()
      if (!displayValue) return ''
      return `<li><strong>${safeKey}:</strong> ${displayValue}</li>`
    })
    .filter(Boolean)
    .join('')

  return rows
    ? `<ul style="margin: 0; padding-left: 18px; color: #222;">${rows}</ul>`
    : '<p style="margin: 0; color: #666;">No details provided.</p>'
}

const DEFAULT_LOGIN_BASE_URL = process.env.LOGIN_VERIFY_URL || 'https://login.vegvisr.org'
const DEFAULT_LOGIN_REDIRECT_URL =
  process.env.LOGIN_REDIRECT_URL || 'https://aichat.vegvisr.org'
const LOGIN_LINK_EXPIRY_MINUTES = Number.parseInt(
  process.env.LOGIN_LINK_EXPIRY_MINUTES || '30',
  10,
)

const appendQueryParam = (url, key, value) => {
  try {
    const parsed = new URL(url)
    parsed.searchParams.set(key, value)
    return parsed.toString()
  } catch {
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`
  }
}

// Middleware to validate Content-Type and handle JSON parsing errors
router.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT') {
    if (!req.is('application/json')) {
      return res.status(400).json({ message: 'Invalid Content-Type. Expected application/json.' })
    }
  }
  next()
})

router.use(
  express.json({
    strict: true,
    verify: (req, res, buf) => {
      try {
        JSON.parse(buf.toString())
      } catch (err) {
        throw new SyntaxError('Invalid JSON payload.')
      }
    },
  }),
)

router.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.message.includes('JSON')) {
    return res.status(400).json({ message: 'Invalid JSON payload.' })
  }
  next(err)
})

router.get('/health', (req, res) => {
  res.send('I am feeling good')
})

// New endpoint to list available senders
router.get('/available-senders', (req, res) => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send('Unauthorized')
  }

  const token = authHeader.split(' ')[1]

  if (token !== process.env.VEGVISR_API_TOKEN) {
    console.log('Unauthorized access attempt', token)
    return res.status(401).send('Unauthorized')
  }

  const configs = parseApprovedSenders()
  const availableSenders = Object.keys(configs).map(email => ({
    email: email,
    isDefault: email === process.env.EMAIL_USERNAME
  }))

  res.json({
    defaultSender: process.env.EMAIL_USERNAME,
    availableSenders: availableSenders,
    totalSenders: availableSenders.length
  })
})

//New enpoing GET /api/user/verify-email
// Get the token from the mongdb field emailVerificationToken
// If the token is found, set the field verified to true
// Return a message to the user
router.get('/verify-email', async (req, res) => {
  const token = req.query.token

  // Validate the token parameter
  if (!token) {
    return res.status(400).json({ message: 'Token is required.' })
  }

  // Find the email verification token in the database
  const emailVerificationToken = await EmailVerificationToken.findOne({
    emailVerificationToken: token,
  })

  // If the token is not found, return an error message
  if (!emailVerificationToken) {
    return res.status(404).json({ message: 'Token not found.' })
  }

  // If the token is found, set the verified field to true
  emailVerificationToken.verified = true
  await emailVerificationToken.save()

  // Return a success message to the user
  console.log('Email verified successfully.', emailVerificationToken.email, token)

  res.status(200).json({
    message: 'Email verified successfully.',
    email: emailVerificationToken.email,
    emailVerificationToken: token,
  })
})

router.post('/resend-verification-email', async (req, res) => {
  const email = req.query.email
  const senderEmail = req.body.senderEmail || req.query.senderEmail
  const redirectUrl = req.body.redirectUrl || req.query.redirectUrl || DEFAULT_LOGIN_REDIRECT_URL
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send('Unauthorized')
  }

  const token = authHeader.split(' ')[1]

  if (token !== process.env.VEGVISR_API_TOKEN) {
    console.log('Unauthorized access attempt', token)
    return res.status(401).send('Unauthorized')
  }

  if (!email) {
    return res.status(400).json({ message: 'Email is required.' })
  }

  // Find the email verification token in the database
  const emailVerificationToken = await EmailVerificationToken.findOne({ email })

  if (!emailVerificationToken) {
    return res.status(404).json({ message: 'No verification token found for this email.' })
  }

  // Create transporter based on sender preference
  let transporter
  let fromEmail = 'vegvisr.org@gmail.com' // default

  if (senderEmail) {
    if (!isApprovedSender(senderEmail)) {
      return res.status(400).json({ message: `Sender '${senderEmail}' not found in approved list` })
    }
    transporter = createTransporterForSender(senderEmail)
    fromEmail = senderEmail
  } else {
    // Use default configuration
    transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    })
  }

  // Prepare the mail options (adjust the template paths as necessary)
  const mailOptions = {
    from: fromEmail,
    to: email,
    cc: 'slowyou.net@gmail.com',
    subject: emailTemplates.emailvegvisrorg.verification.subject,
    html: emailTemplates.emailvegvisrorg.verification.body.replace(
      '{verificationLink}',
      `${DEFAULT_LOGIN_BASE_URL}?magic=${encodeURIComponent(
        emailVerificationToken.emailVerificationToken,
      )}&redirect=${encodeURIComponent(redirectUrl)}`,
    ),
  }

  try {
    const info = await transporter.sendMail(mailOptions)
    // Optionally log info.response if needed
    res.status(200).json({ 
      message: 'Verification email resent successfully.',
      sentFrom: fromEmail
    })
    console.log('Verification email resent successfully.', info.response)
  } catch (mailError) {
    // Log the error if needed
    res.status(500).json({ message: 'Error resending verification email.' })
  }
})

router.post('/reg-user-vegvisr', async (req, res) => {
  const email = req.query.email
  const role = req.query.role || 'user'
  const senderEmail = req.body.senderEmail || req.query.senderEmail
  const redirectUrl = req.body.redirectUrl || req.query.redirectUrl || DEFAULT_LOGIN_REDIRECT_URL
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send('Unauthorized')
  }

  const token = authHeader.split(' ')[1]

  if (token !== process.env.VEGVISR_API_TOKEN) {
    console.log('Unauthorized access attempt', token)
    return res.status(401).send('Unauthorized')
  }

  const emailVerificationToken = crypto.randomBytes(20).toString('hex')

  // Log the API call
  await logApiCall({
    emailVerificationToken: emailVerificationToken,
    email: email,
    role: role,
    endpoint: '/reg-user-vegvisr',
    method: 'POST',
    params: req.body,
    headers: req.headers,
    timestamp: new Date(),
  })

  // Create transporter based on sender preference
  let transporter
  let fromEmail = 'vegvisr.org@gmail.com' // default

  if (senderEmail) {
    if (!isApprovedSender(senderEmail)) {
      return res.status(400).json({ message: `Sender '${senderEmail}' not found in approved list` })
    }
    transporter = createTransporterForSender(senderEmail)
    fromEmail = senderEmail
  } else {
    // Use default configuration
    transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    })
  }

  // Select email template based on role
  const template =
    role === 'subscriber'
      ? emailTemplates.emailvegvisrorg.subscription
      : emailTemplates.emailvegvisrorg.verification

  // Prepare the mail options (adjust the template paths as necessary)
  const mailOptions = {
    from: fromEmail,
    to: email,
    cc: 'slowyou.net@gmail.com',
    subject: template.subject,
    html: template.body.replace(
      '{verificationLink}',
      `${DEFAULT_LOGIN_BASE_URL}?magic=${encodeURIComponent(
        emailVerificationToken,
      )}&redirect=${encodeURIComponent(redirectUrl)}`,
    ),
  }

  try {
    const info = await transporter.sendMail(mailOptions)
    // Optionally log info.response if needed
    res.status(200).json({ 
      message: 'Verification email sent successfully.',
      sentFrom: fromEmail
    })
    console.log('Verification email sent successfully.', info.response)
  } catch (mailError) {
    // Log the error if needed
    res.status(500).json({ message: 'Error sending verification email.' })
  }
})

router.post('/onboarding', async (req, res) => {
  const email = req.body.email || req.query.email
  const role = req.query.role || 'user'
  const senderEmail = req.body.senderEmail || req.query.senderEmail
  const magicLink = req.body.magicLinkUrl || req.body.magicLink || req.query.magicLink
  const inboundToken = req.body.token
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send('Unauthorized')
  }

  const token = authHeader.split(' ')[1]

  if (token !== process.env.VEGVISR_API_TOKEN) {
    console.log('Unauthorized access attempt', token)
    return res.status(401).send('Unauthorized')
  }

  if (!email) {
    return res.status(400).json({ message: 'Email is required.' })
  }

  const magicCode =
    typeof inboundToken === 'string' && inboundToken.trim().length > 0
      ? inboundToken.trim()
      : crypto.randomInt(0, 1000000).toString().padStart(6, '0')
  const verificationLink =
    typeof magicLink === 'string' && magicLink.trim().length > 0
      ? magicLink.trim()
      : `https://test.vegvisr.org/verify-email?token=${magicCode}`

  await logApiCall({
    emailVerificationToken: magicCode,
    email: email,
    role: role,
    endpoint: '/onboarding',
    method: 'POST',
    params: req.body,
    headers: req.headers,
    timestamp: new Date(),
  })

  let transporter
  let fromEmail = 'vegvisr.org@gmail.com' // default

  if (senderEmail) {
    if (!isApprovedSender(senderEmail)) {
      return res.status(400).json({ message: `Sender '${senderEmail}' not found in approved list` })
    }
    transporter = createTransporterForSender(senderEmail)
    fromEmail = senderEmail
  } else {
    transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    })
  }

  const mailOptions = {
    from: fromEmail,
    to: email,
    cc: 'slowyou.net@gmail.com',
    subject: 'Verify your email to start onboarding',
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.5; color: #222;">
        <h2 style="margin: 0 0 12px; font-size: 20px;">Verify your email</h2>
        <p style="margin: 0 0 12px;">
          Click this link to verify it is you and start the onboarding process:
        </p>
        <p style="margin: 0 0 16px;">
          <a href="${verificationLink}" style="color: #1a73e8;">
            Verify and start onboarding
          </a>
        </p>
        <p style="margin: 0; font-size: 12px; color: #666;">
          If you did not request this, you can ignore this email.
        </p>
      </div>
    `,
  }

  try {
    const info = await transporter.sendMail(mailOptions)
    res.status(200).json({
      message: 'Onboarding verification email sent successfully.',
      sentFrom: fromEmail
    })
    console.log('Onboarding verification email sent successfully.', info.response)
  } catch (mailError) {
    res.status(500).json({ message: 'Error sending onboarding verification email.' })
  }
})

router.post('/onboarding-review', async (req, res) => {
  const email = req.body.email || req.query.email
  const reviewLink = req.body.reviewLink || req.query.reviewLink
  const summaryHtml = req.body.summaryHtml
  const summary = req.body.summary
  const version = req.body.version
  const submittedAt = req.body.submittedAt
  const reviewToken = req.body.reviewToken
  const senderEmail = req.body.senderEmail || req.query.senderEmail
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send('Unauthorized')
  }

  const token = authHeader.split(' ')[1]

  if (token !== process.env.VEGVISR_API_TOKEN) {
    console.log('Unauthorized access attempt', token)
    return res.status(401).send('Unauthorized')
  }

  if (!email || !reviewLink) {
    return res.status(400).json({ message: 'Email and reviewLink are required.' })
  }

  await logApiCall({
    emailVerificationToken: reviewToken || 'review',
    email: email,
    role: 'user',
    endpoint: '/onboarding-review',
    method: 'POST',
    params: req.body,
    headers: req.headers,
    timestamp: new Date(),
  })

  let transporter
  let fromEmail = 'vegvisr.org@gmail.com'

  if (senderEmail) {
    if (!isApprovedSender(senderEmail)) {
      return res.status(400).json({ message: `Sender '${senderEmail}' not found in approved list` })
    }
    transporter = createTransporterForSender(senderEmail)
    fromEmail = senderEmail
  } else {
    transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    })
  }

  const subjectVersion = version ? ` (v${version})` : ''
  const htmlSummary = summaryHtml || buildOnboardingSummaryHtml(summary)

  const mailOptions = {
    from: fromEmail,
    to: email,
    cc: 'slowyou.net@gmail.com',
    subject: `Review your Vegvisr onboarding${subjectVersion}`,
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.5; color: #222;">
        <h2 style="margin: 0 0 12px; font-size: 20px;">Review your onboarding responses</h2>
        <p style="margin: 0 0 12px;">
          Submitted at: ${submittedAt || 'Recently'}
        </p>
        <div style="margin: 12px 0 18px;">
          ${htmlSummary}
        </div>
        <p style="margin: 0 0 16px;">
          <a href="${reviewLink}" style="color: #1a73e8;">
            Review or update your answers
          </a>
        </p>
        <p style="margin: 0; font-size: 12px; color: #666;">
          If you did not request this, you can ignore this email.
        </p>
      </div>
    `,
  }

  try {
    const info = await transporter.sendMail(mailOptions)
    res.status(200).json({
      message: 'Onboarding review email sent successfully.',
      sentFrom: fromEmail
    })
    console.log('Onboarding review email sent successfully.', info.response)
  } catch (mailError) {
    res.status(500).json({ message: 'Error sending onboarding review email.' })
  }
})

router.post('/send-vegvisr-email', async (req, res) => {
  const { email, template, subject, callbackUrl, variables, senderEmail } = req.body
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send('Unauthorized')
  }

  const token = authHeader.split(' ')[1]

  if (token !== process.env.VEGVISR_API_TOKEN) {
    console.log('Unauthorized access attempt', token)
    return res.status(401).send('Unauthorized')
  }


  const emailVerificationToken = crypto.randomBytes(20).toString('hex');
  
  // Only process affiliateRegistrationUrl if variables exists and has the property
  if (variables && variables.affiliateRegistrationUrl) {
    const completeUrl = `${variables.affiliateRegistrationUrl}&token=${emailVerificationToken}`;
    variables.affiliateRegistrationUrl = completeUrl;
  }

  if (!email || !template || !subject) {
    return res.status(400).json({ message: 'Email, template, and subject are required.' })
  }  // Log the API call
  await logApiCall({
    emailVerificationToken: emailVerificationToken,
    email: email,
    role: 'custom',
    endpoint: '/send-vegvisr-email',
    method: 'POST',
    params: req.body,
    headers: req.headers,
    timestamp: new Date(),
  })

  // Create transporter based on sender preference
  let transporter
  let fromEmail = 'vegvisr.org@gmail.com' // default

  if (senderEmail) {
    if (!isApprovedSender(senderEmail)) {
      return res.status(400).json({ message: `Sender '${senderEmail}' not found in approved list` })
    }
    transporter = createTransporterForSender(senderEmail)
    fromEmail = senderEmail
  } else {
    // Use default configuration
    transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    })
  }

  // Build callback URL with email verification token and affiliate token
 // const affiliateToken = variables?.invitationToken || variables?.affiliateToken || ''
//  const callbackUrlWithParams = `https://www.vegvisr.org/verify-email/?token=${emailVerificationToken}&affiliateToken=${affiliateToken}`
  
  // Process template with variables if provided
  let processedTemplate = template
  let processedSubject = subject
  
  // Replace double-brace placeholders with actual email verification token (if any)
 // processedTemplate = processedTemplate.replace(/\{\{EMAIL_VERIFICATION_TOKEN\}\}/g, emailVerificationToken)
 // processedSubject = processedSubject.replace(/\{\{EMAIL_VERIFICATION_TOKEN\}\}/g, emailVerificationToken)
  
  if (variables && typeof variables === 'object') {
    
    // Replace variables in template: {variableName} -> value
    Object.keys(variables).forEach(key => {
      const placeholder = `{${key}}`
      processedTemplate = processedTemplate.replace(new RegExp(placeholder, 'g'), variables[key])
      processedSubject = processedSubject.replace(new RegExp(placeholder, 'g'), variables[key])
    })
  }

  // Prepare the mail options using processed template
  const mailOptions = {
    from: fromEmail,
    to: email,
    cc: 'slowyou.net@gmail.com',
    subject: processedSubject,
    html: processedTemplate,
  }

  try {
    const info = await transporter.sendMail(mailOptions)
    // Optionally log info.response if needed
    res.status(200).json({ 
      message: 'Custom email sent successfully.',
      processedTemplate: processedTemplate, // For debugging
      processedSubject: processedSubject,     // For debugging
      emailVerificationToken: emailVerificationToken, // For debugging
      sentFrom: fromEmail
    })
    console.log('Custom email sent successfully.', info.response)
  } catch (mailError) {
    // Log the error if needed
    console.error('Email sending error:', mailError)
    res.status(500).json({ message: 'Error sending custom email.' })
  }
})

router.post('/send-email-custom-credentials', async (req, res) => {
  const { senderEmail, authEmail, fromEmail, toEmail, subject, body } = req.body
  
  // Check for API token first
  const apiToken = req.headers['x-api-token'] || req.headers['x-app-token']
  
  if (!apiToken) {
    return res.status(401).json({ 
      message: 'API token required. Include X-API-Token or X-App-Token header.' 
    })
  }
  
  if (apiToken !== process.env.VEGVISR_API_TOKEN) {
    return res.status(401).json({ 
      message: 'Invalid API token.' 
    })
  }
  
  // Get app password from Authorization header
  const authHeader = req.headers.authorization
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return res.status(401).json({ 
      message: 'Authorization header required. Use Basic authentication with app password.' 
    })
  }

  // Extract app password from Basic auth (format: Basic base64(email:appPassword))
  let appPassword
  const smtpUser = authEmail || senderEmail
  let authUserFromHeader = null
  try {
    const base64Credentials = authHeader.split(' ')[1]
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8')
    const [authEmail, authPassword] = credentials.split(':')
    authUserFromHeader = authEmail
    
    // Verify that the email in auth matches the SMTP user
    if (authEmail !== smtpUser) {
      return res.status(401).json({ 
        message: 'Email in Authorization header must match authEmail/senderEmail in request body' 
      })
    }
    
    appPassword = authPassword
  } catch (error) {
    return res.status(401).json({ 
      message: 'Invalid Authorization header format. Use Basic authentication.' 
    })
  }

  // Validate required fields
  if (!smtpUser || !toEmail || !subject || !body) {
    return res.status(400).json({ 
      message: 'All fields are required: senderEmail (or authEmail), toEmail, subject, body' 
    })
  }

  if (!appPassword) {
    return res.status(401).json({ 
      message: 'App password is required in Authorization header' 
    })
  }

  // Validate email formats
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(smtpUser)) {
    return res.status(400).json({ message: 'Invalid sender email format' })
  }
  if (!emailRegex.test(toEmail)) {
    return res.status(400).json({ message: 'Invalid recipient email format' })
  }
  if (fromEmail && !emailRegex.test(fromEmail)) {
    return res.status(400).json({ message: 'Invalid from email format' })
  }

  try {
    // Create transporter with provided credentials
    const transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: smtpUser,
        pass: appPassword,
      },
    })

    const redactedPass = appPassword ? `${appPassword.slice(0, 2)}***${appPassword.slice(-2)}` : 'none'
    console.log('[send-email-custom-credentials] request', {
      smtpUser,
      senderEmail,
      authEmail,
      authUserFromHeader,
      fromEmail: fromEmail || smtpUser,
      toEmail,
      subject,
      apiTokenPresent: !!apiToken,
      authHeaderPresent: !!authHeader,
      appPasswordLength: appPassword ? appPassword.length : 0,
      appPasswordRedacted: redactedPass,
    })

    // Prepare mail options
    const mailOptions = {
      from: fromEmail || smtpUser,
      to: toEmail,
      subject: subject,
      html: body,
    }

    console.log('[send-email-custom-credentials] mailOptions', {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject,
      htmlLength: mailOptions.html ? mailOptions.html.length : 0,
    })

    // Send email
    const info = await transporter.sendMail(mailOptions)
    
    // Log successful send
    console.log('[send-email-custom-credentials] success', {
      response: info.response,
      messageId: info.messageId,
      envelope: info.envelope,
      accepted: info.accepted,
      rejected: info.rejected,
    })
    
    res.status(200).json({ 
      message: 'Email sent successfully.',
      messageId: info.messageId,
      sentFrom: fromEmail || smtpUser,
      sentTo: toEmail
    })
  } catch (error) {
    console.error('Error sending email with custom credentials:', error)
    
    // Provide more specific error messages
    if (error.code === 'EAUTH') {
      return res.status(401).json({ 
        message: 'Authentication failed. Please check your email and app password.' 
      })
    }
    
    res.status(500).json({ 
      message: 'Error sending email.',
      error: error.message 
    })
  }
})

router.post('/login/magic/send', async (req, res) => {
  const { email, redirectUrl, senderEmail } = req.body || {}

  if (!email) {
    return res.status(400).json({ error: 'Email is required.' })
  }

  const token = crypto.randomBytes(20).toString('hex')
  const loginRedirect =
    redirectUrl ||
    `${DEFAULT_LOGIN_BASE_URL}?redirect=${encodeURIComponent(DEFAULT_LOGIN_REDIRECT_URL)}`
  const verificationLink = appendQueryParam(loginRedirect, 'magic', token)

  await logApiCall({
    emailVerificationToken: token,
    email: email,
    role: 'user',
    endpoint: '/login/magic/send',
    method: 'POST',
    params: req.body,
    headers: req.headers,
    timestamp: new Date(),
  })

  let transporter
  let fromEmail = 'vegvisr.org@gmail.com'

  if (senderEmail) {
    if (!isApprovedSender(senderEmail)) {
      return res.status(400).json({ error: `Sender '${senderEmail}' not found in approved list` })
    }
    transporter = createTransporterForSender(senderEmail)
    fromEmail = senderEmail
  } else {
    transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    })
  }

  const mailOptions = {
    from: fromEmail,
    to: email,
    cc: 'slowyou.net@gmail.com',
    subject: 'Sign in to Vegvisr',
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.5; color: #222;">
        <h2 style="margin: 0 0 12px; font-size: 20px;">Sign in to Vegvisr</h2>
        <p style="margin: 0 0 12px;">
          Click the button below to finish signing in. This link expires in ${LOGIN_LINK_EXPIRY_MINUTES} minutes.
        </p>
        <p style="margin: 0 0 16px;">
          <a href="${verificationLink}" style="display: inline-block; padding: 12px 20px; background: #2563eb; color: #fff; border-radius: 10px; text-decoration: none;">
            Continue to Vegvisr
          </a>
        </p>
        <p style="margin: 0; font-size: 12px; color: #666;">
          If you did not request this, you can ignore this email.
        </p>
        <p style="margin: 12px 0 0; font-size: 12px; color: #666;">
          Link: <a href="${verificationLink}" style="color: #2563eb;">${verificationLink}</a>
        </p>
      </div>
    `,
  }

  try {
    const info = await transporter.sendMail(mailOptions)
    res.status(200).json({ success: true, sentFrom: fromEmail })
    console.log('Magic link email sent successfully.', info.response)
  } catch (mailError) {
    res.status(500).json({ error: 'Error sending magic link email.' })
  }
})

router.get('/login/magic/verify', async (req, res) => {
  const token = req.query.token

  if (!token) {
    return res.status(400).json({ error: 'Token is required.' })
  }

  const emailVerificationToken = await EmailVerificationToken.findOne({
    emailVerificationToken: token,
  })

  if (!emailVerificationToken) {
    return res.status(404).json({ error: 'Token not found.' })
  }

  emailVerificationToken.verified = true
  await emailVerificationToken.save()

  res.status(200).json({
    success: true,
    email: emailVerificationToken.email,
    token: token,
  })
})

export default router
