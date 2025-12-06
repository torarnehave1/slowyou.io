# User Routes Documentation

## Overview
The `user_routes.js` file implements authentication and email management endpoints for the Vegvisr application. It handles user registration, email verification, and custom email sending with multi-sender support.

## Table of Contents
- [Configuration](#configuration)
- [Middleware](#middleware)
- [Helper Functions](#helper-functions)
- [API Endpoints](#api-endpoints)
- [Error Handling](#error-handling)
- [Usage Examples](#usage-examples)
- [Integration Notes](#integration-notes)
- [Testing the Custom Email Endpoint](#testing-the-custom-email-endpoint)
- [Security Information](#security-information)
- [Future Improvements](#future-improvements)

---

## Configuration

### Environment Variables Required
- `APPROVED_SENDERS` - Comma-separated list of approved email senders in format: `email:password,email:password`
- `EMAIL_USERNAME` - Default email sender (Gmail account)
- `EMAIL_PASSWORD` - Password for default email sender
- `VEGVISR_API_TOKEN` - Bearer token for API authentication

### Dependencies
- `express` - Web framework
- `crypto` - Token generation
- `nodemailer` - Email sending
- `dotenv` - Environment variable management
- Custom services: `apiCallLogService`, email templates from `nb.json`
- Custom models: `EmailVerificationToken`

---

## Middleware

### Content-Type Validation
Validates that POST/PUT requests have `application/json` content type.

```javascript
// Returns 400 if Content-Type is not application/json
```

### JSON Parsing
Strict JSON parsing with error handling for malformed JSON payloads.

### Error Handler
Catches JSON syntax errors and returns appropriate 400 responses.

---

## Helper Functions

### `parseApprovedSenders()`
Parses the `APPROVED_SENDERS` environment variable into a configuration object.

**Returns:** Object mapping email addresses to passwords

### `isApprovedSender(email)`
Checks if an email is in the approved senders list.

**Parameters:**
- `email` (string) - Email address to check

**Returns:** Boolean

### `getPasswordForSender(email)`
Retrieves the password for a specific approved sender.

**Parameters:**
- `email` (string) - Email address

**Returns:** String (password) or undefined

### `createTransporterForSender(email)`
Creates a nodemailer transporter for a specific approved sender.

**Parameters:**
- `email` (string) - Approved sender email

**Returns:** Nodemailer transporter object

**Throws:** Error if sender not approved

---

## API Endpoints

### 1. Health Check

**Endpoint:** `GET /api/health`

**Description:** Simple health check endpoint

**Response:**
```
200 OK
"I am feeling good"
```

---

### 2. List Available Senders

**Endpoint:** `GET /api/available-senders`

**Description:** Lists all approved email senders configured in the system

**Authentication:** Bearer token required

**Headers:**
```
Authorization: Bearer <VEGVISR_API_TOKEN>
```

**Response:**
```json
{
  "defaultSender": "vegvisr.org@gmail.com",
  "availableSenders": [
    {
      "email": "sender1@gmail.com",
      "isDefault": true
    },
    {
      "email": "sender2@gmail.com",
      "isDefault": false
    }
  ],
  "totalSenders": 2
}
```

**Status Codes:**
- `200` - Success
- `401` - Unauthorized (missing or invalid token)

---

### 3. Verify Email

**Endpoint:** `GET /api/verify-email`

**Description:** Verifies a user's email address using a verification token

**Query Parameters:**
- `token` (required) - Email verification token

**Example:**
```
GET /api/verify-email?token=abc123def456
```

**Response Success:**
```json
{
  "message": "Email verified successfully.",
  "email": "user@example.com",
  "emailVerificationToken": "abc123def456"
}
```

**Status Codes:**
- `200` - Email verified successfully
- `400` - Token is required
- `404` - Token not found

**Database Changes:**
- Sets `verified` field to `true` in EmailVerificationToken document

---

### 4. Resend Verification Email

**Endpoint:** `POST /api/resend-verification-email`

**Description:** Resends verification email to a user

**Authentication:** Bearer token required

**Headers:**
```
Authorization: Bearer <VEGVISR_API_TOKEN>
Content-Type: application/json
```

**Query Parameters:**
- `email` (required) - Email address to resend verification to
- `senderEmail` (optional) - Specific sender to use

**Body (optional):**
```json
{
  "senderEmail": "sender@gmail.com"
}
```

**Response Success:**
```json
{
  "message": "Verification email resent successfully.",
  "sentFrom": "vegvisr.org@gmail.com"
}
```

**Status Codes:**
- `200` - Email sent successfully
- `400` - Email required or invalid sender
- `401` - Unauthorized
- `404` - No verification token found
- `500` - Error sending email

**Email Details:**
- **From:** Specified sender or default
- **To:** User email
- **CC:** slowyou.net@gmail.com
- **Template:** Norwegian verification template from `nb.json`

---

### 5. Register User (Vegvisr)

**Endpoint:** `POST /api/reg-user-vegvisr`

**Description:** Registers a new user and sends verification email

**Authentication:** Bearer token required

**Headers:**
```
Authorization: Bearer <VEGVISR_API_TOKEN>
Content-Type: application/json
```

**Query Parameters:**
- `email` (required) - User's email address
- `role` (optional) - User role: `user` (default) or `subscriber`
- `senderEmail` (optional) - Specific sender to use

**Body (optional):**
```json
{
  "senderEmail": "sender@gmail.com"
}
```

**Response Success:**
```json
{
  "message": "Verification email sent successfully.",
  "sentFrom": "vegvisr.org@gmail.com"
}
```

**Status Codes:**
- `200` - Email sent successfully
- `400` - Invalid sender
- `401` - Unauthorized
- `500` - Error sending email

**Functionality:**
1. Generates random 20-byte hex verification token
2. Logs API call with email, role, token
3. Selects email template based on role (subscriber vs. verification)
4. Sends email with verification link: `https://test.vegvisr.org/verify-email?token={token}`

**Email Templates:**
- **user role:** `emailvegvisrorg.verification`
- **subscriber role:** `emailvegvisrorg.subscription`

---

### 6. Send Custom Vegvisr Email

**Endpoint:** `POST /api/send-vegvisr-email`

**Description:** Sends customizable emails with template variable substitution

**Authentication:** Bearer token required

**Headers:**
```
Authorization: Bearer <VEGVISR_API_TOKEN>
Content-Type: application/json
```

**Body:**
```json
{
  "email": "recipient@example.com",
  "template": "<html>Hello {firstName}, your code is {verificationCode}</html>",
  "subject": "Welcome {firstName}!",
  "senderEmail": "sender@gmail.com",
  "variables": {
    "firstName": "John",
    "verificationCode": "123456",
    "affiliateRegistrationUrl": "https://example.com/register?ref=abc"
  },
  "callbackUrl": "https://example.com/callback"
}
```

**Required Fields:**
- `email` - Recipient email address
- `template` - HTML email template
- `subject` - Email subject line

**Optional Fields:**
- `senderEmail` - Specific sender to use
- `variables` - Object with key-value pairs for template substitution
- `callbackUrl` - Callback URL (reserved for future use)

**Response Success:**
```json
{
  "message": "Custom email sent successfully.",
  "processedTemplate": "<html>Hello John, your code is 123456</html>",
  "processedSubject": "Welcome John!",
  "emailVerificationToken": "def789ghi012",
  "sentFrom": "sender@gmail.com"
}
```

**Status Codes:**
- `200` - Email sent successfully
- `400` - Missing required fields or invalid sender
- `401` - Unauthorized
- `500` - Error sending email

**Template Processing:**
1. Generates new email verification token (20-byte hex)
2. If `variables.affiliateRegistrationUrl` exists, appends `&token={emailVerificationToken}`
3. Replaces `{variableName}` placeholders with values from `variables` object
4. Applies variable substitution to both template and subject

**Special Handling:**
- Affiliate registration URLs automatically get the verification token appended
- All API calls are logged with token, email, and metadata

---

### 7. Send Email with Custom Credentials

**Endpoint:** `POST /api/send-email-custom-credentials`

**Description:** Sends an email using custom Gmail credentials provided in the request. This endpoint allows sending emails without pre-configuring the sender in environment variables. Requires both API token and Basic authentication.

**Authentication:** 
- API Token in custom header (`X-API-Token` or `X-App-Token`)
- Basic authentication with email and app password in Authorization header

**Headers:**
```
Content-Type: application/json
X-API-Token: YOUR_API_TOKEN
Authorization: Basic base64(email:appPassword)
```

**Body:**
```json
{
  "senderEmail": "sender@example.com",
  "toEmail": "recipient@example.com",
  "subject": "Your Email Subject",
  "body": "<html><h1>Your HTML Email Body</h1><p>Email content here</p></html>"
}
```

**Required Fields:**
- **Headers:** 
  - `X-API-Token` or `X-App-Token` - API token for endpoint access (must match `VEGVISR_API_TOKEN`)
  - `Authorization` - Basic auth with senderEmail:appPassword (base64 encoded)
- **Body:**
  - `senderEmail` - Gmail address to send from (must match email in Authorization header)
  - `toEmail` - Recipient email address (must be valid email format)
  - `subject` - Email subject line
  - `body` - HTML email body content

**Response Success:**
```json
{
  "message": "Email sent successfully.",
  "messageId": "<unique-message-id@gmail.com>",
  "sentFrom": "sender@example.com",
  "sentTo": "recipient@example.com"
}
```

**Status Codes:**
- `200` - Email sent successfully
- `400` - Missing required fields or invalid email format
- `401` - Missing/invalid Authorization header or authentication failed
- `500` - Error sending email

**Error Responses:**

Missing API token:
```json
{
  "message": "API token required. Include X-API-Token or X-App-Token header."
}
```

Invalid API token:
```json
{
  "message": "Invalid API token."
}
```

Missing Authorization header:
```json
{
  "message": "Authorization header required. Use Basic authentication with app password."
}
```

Invalid Authorization format:
```json
{
  "message": "Invalid Authorization header format. Use Basic authentication."
}
```

Email mismatch:
```json
{
  "message": "Email in Authorization header must match senderEmail in request body"
}
```

Missing fields:
```json
{
  "message": "All fields are required: senderEmail, toEmail, subject, body"
}
```

Invalid email format:
```json
{
  "message": "Invalid sender email format"
}
```
```json
{
  "message": "Invalid recipient email format"
}
```

Authentication failure:
```json
{
  "message": "Authentication failed. Please check your email and app password."
}
```

**Important Notes:**
- Requires BOTH API token AND Basic authentication (dual authentication)
- API token can be provided as `X-API-Token` or `X-App-Token` header
- App password is sent in Authorization header using Basic authentication (more secure than body)
- The email in the Authorization header must match the `senderEmail` in the request body
- Use Gmail App Passwords, not your regular Gmail password
- To generate an App Password: Google Account → Security → 2-Step Verification → App passwords
- The `body` parameter expects HTML formatted content
- No logging to database (unlike other endpoints)
- No CC to slowyou.net@gmail.com (direct send only)

**Security Considerations:**
- ✅ Dual authentication: API token + Basic auth for enhanced security
- ✅ App password transmitted in Authorization header (more secure than body)
- ✅ Uses HTTPS in production to encrypt credentials in transit
- ✅ Email validation ensures credentials match sender
- ✅ API token prevents unauthorized access to the endpoint
- ⚠️ Consider rate limiting this endpoint to prevent abuse
- ⚠️ App passwords can be revoked from Google Account settings

---

## Error Handling

### Common Error Responses

#### 400 Bad Request
```json
{
  "message": "Invalid Content-Type. Expected application/json."
}
```
```json
{
  "message": "Invalid JSON payload."
}
```
```json
{
  "message": "Email, template, and subject are required."
}
```

#### 401 Unauthorized
```
"Unauthorized"
```
Returned when:
- Missing Authorization header
- Invalid Bearer token format
- Token doesn't match `VEGVISR_API_TOKEN`

#### 404 Not Found
```json
{
  "message": "Token not found."
}
```

#### 500 Internal Server Error
```json
{
  "message": "Error sending verification email."
}
```

---

## Email Configuration

### Default Sender
- Service: Gmail
- Username: `process.env.EMAIL_USERNAME`
- Password: `process.env.EMAIL_PASSWORD`

### Multi-Sender Support
Configure multiple approved senders via `APPROVED_SENDERS` environment variable:
```
APPROVED_SENDERS=sender1@gmail.com:password1,sender2@gmail.com:password2
```

### Email Format
- **CC:** All emails CC slowyou.net@gmail.com
- **Service:** Gmail
- **Format:** HTML

---

## Security Considerations

1. **Authentication:** All endpoints (except `/health` and `/verify-email`) require Bearer token authentication
2. **Approved Senders:** Only pre-configured email addresses can send emails
3. **Token Generation:** Uses cryptographically secure random bytes for verification tokens
4. **Content Validation:** Strict JSON parsing and Content-Type validation
5. **Logging:** All API calls are logged for audit purposes

---

## Database Models

### EmailVerificationToken
Used to store and verify email verification tokens.

**Fields:**
- `emailVerificationToken` - Unique token string
- `email` - User's email address
- `verified` - Boolean indicating verification status
- Additional fields logged via `apiCallLogService`

---

## Usage Examples

### Example 1: Register New User
```bash
curl -X POST 'https://api.example.com/api/reg-user-vegvisr?email=user@example.com&role=user' \
  -H 'Authorization: Bearer YOUR_API_TOKEN' \
  -H 'Content-Type: application/json'
```

### Example 2: Send Custom Email with Variables
```bash
curl -X POST 'https://api.example.com/api/send-vegvisr-email' \
  -H 'Authorization: Bearer YOUR_API_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "customer@example.com",
    "subject": "Welcome {name}!",
    "template": "<h1>Hello {name}</h1><p>Your account is ready.</p>",
    "variables": {
      "name": "Alice"
    }
  }'
```

### Example 3: Verify Email
```bash
curl 'https://api.example.com/api/verify-email?token=VERIFICATION_TOKEN'
```

### Example 4: Send Email with Custom Credentials
```bash
# Create base64 encoded credentials
AUTH=$(echo -n "EMAIL_ADDRESS:APP_PASSWORD" | base64)

# Send email request
curl -X POST 'http://localhost:3001/api/send-email-custom-credentials' \
  -H 'Content-Type: application/json' \
  -H 'X-API-Token: YOUR_API_TOKEN' \
  -H "Authorization: Basic $AUTH" \
  -d '{
    "senderEmail": "EMAIL_ADDRESS",
    "toEmail": "recipient@example.com",
    "subject": "Test Email",
    "body": "<html><body><h1>Hello!</h1><p>This is a test email.</p></body></html>"
  }'
```

---

## Integration Notes

- Email templates are stored in `/public/languages/nb.json`
- API call logging uses `apiCallLogService.js`
- Token model is defined in `/models/apiCallLogs.js`
- Verification links point to `https://test.vegvisr.org/verify-email`

---

## Testing the Custom Email Endpoint

### Prerequisites
1. A Gmail account
2. A Gmail App Password
3. API Token (VEGVISR_API_TOKEN from your environment variables)

### How to Generate Gmail App Password

1. Go to your Google Account: https://myaccount.google.com/
2. Click on **Security** in the left sidebar
3. Enable **2-Step Verification** if not already enabled
4. Under "2-Step Verification", scroll down to **App passwords**
5. Click **App passwords**
6. Select "Mail" and "Other (Custom name)"
7. Give it a name like "SlowYou API"
8. Click **Generate**
9. Copy the 16-character password (spaces don't matter)

### How to Create Basic Auth Header

Basic authentication requires base64 encoding of `email:password`:

**Command Line (macOS/Linux):**
```bash
echo -n "EMAIL_ADDRESS:APP_PASSWORD" | base64
```

**JavaScript (Browser):**
```javascript
const credentials = btoa('EMAIL_ADDRESS:APP_PASSWORD');
```

**Node.js:**
```javascript
const credentials = Buffer.from('EMAIL_ADDRESS:APP_PASSWORD').toString('base64');
```

### Test with cURL

```bash
# Create the base64 encoded credentials
AUTH=$(echo -n "EMAIL_ADDRESS:APP_PASSWORD" | base64)

# Make the request
curl -X POST 'http://localhost:3001/api/send-email-custom-credentials' \
  -H 'Content-Type: application/json' \
  -H 'X-API-Token: YOUR_API_TOKEN' \
  -H "Authorization: Basic $AUTH" \
  -d '{
    "senderEmail": "EMAIL_ADDRESS",
    "toEmail": "RECIPIENT_EMAIL",
    "subject": "Test Email from SlowYou API",
    "body": "<html><body><h1>Hello!</h1><p>This is a test email.</p></body></html>"
  }'
```

### Test with JavaScript

```javascript
const credentials = btoa('EMAIL_ADDRESS:APP_PASSWORD');

fetch('http://localhost:3001/api/send-email-custom-credentials', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Token': 'YOUR_API_TOKEN',
    'Authorization': `Basic ${credentials}`
  },
  body: JSON.stringify({
    senderEmail: 'EMAIL_ADDRESS',
    toEmail: 'RECIPIENT_EMAIL',
    subject: 'Test Email from SlowYou API',
    body: '<html><body><h1>Hello!</h1><p>This is a test email.</p></body></html>'
  })
})
.then(response => response.json())
.then(data => console.log('Success:', data))
.catch(error => console.error('Error:', error));
```

### Test with Postman

1. Create a new POST request
2. URL: `http://localhost:3001/api/send-email-custom-credentials`
3. **Headers Tab:**
   - `Content-Type`: `application/json`
   - `X-API-Token`: `YOUR_API_TOKEN`
4. **Authorization Tab:**
   - Type: `Basic Auth`
   - Username: `EMAIL_ADDRESS`
   - Password: `APP_PASSWORD`
5. **Body Tab (raw JSON):**
```json
{
  "senderEmail": "EMAIL_ADDRESS",
  "toEmail": "RECIPIENT_EMAIL",
  "subject": "Test Email from SlowYou API",
  "body": "<html><body><h1>Hello!</h1><p>This is a test email.</p></body></html>"
}
```

### Expected Success Response

```json
{
  "message": "Email sent successfully.",
  "messageId": "<unique-message-id@gmail.com>",
  "sentFrom": "EMAIL_ADDRESS",
  "sentTo": "RECIPIENT_EMAIL"
}
```

### Common Test Errors

**401 - Missing API Token:**
```json
{ "message": "API token required. Include X-API-Token or X-App-Token header." }
```
**Solution:** Add `X-API-Token` header

**401 - Invalid API Token:**
```json
{ "message": "Invalid API token." }
```
**Solution:** Verify token matches `VEGVISR_API_TOKEN` environment variable

**401 - Missing Authorization:**
```json
{ "message": "Authorization header required. Use Basic authentication with app password." }
```
**Solution:** Add Basic auth header

**401 - Email Mismatch:**
```json
{ "message": "Email in Authorization header must match senderEmail in request body" }
```
**Solution:** Ensure email in Basic auth matches `senderEmail` in body

---

## Security Information

### Dual Authentication Architecture

The custom email endpoint uses **two layers of authentication**:

1. **API Token** (Endpoint Access Control)
   - Header: `X-API-Token` or `X-App-Token`
   - Purpose: Controls who can access the endpoint
   - Validates against `VEGVISR_API_TOKEN` environment variable

2. **Basic Authentication** (Gmail Credentials)
   - Header: `Authorization: Basic base64(email:password)`
   - Purpose: Authenticates the Gmail account for sending
   - Credentials provided per-request

### Security Benefits

- ✅ **Layered Security:** Two independent authentication mechanisms
- ✅ **Access Control:** API token prevents unauthorized endpoint access
- ✅ **User Verification:** Basic auth validates Gmail credentials
- ✅ **Defense in Depth:** Both credentials required
- ✅ **Standard Protocols:** Uses well-established HTTP authentication
- ✅ **Header-based:** Credentials in headers, not request body
- ✅ **Email Validation:** Ensures authenticated email matches sender

### Security Best Practices

**Production Requirements:**
- ✅ Always use HTTPS to encrypt both API token and Authorization header
- ✅ Never commit API tokens or app passwords to version control
- ✅ Store secrets securely (environment variables, secret managers)
- ✅ Implement rate limiting to prevent abuse
- ✅ Monitor for suspicious authentication patterns

**Credential Management:**
- App passwords can be revoked anytime from Google Account settings
- Each app password is unique and traceable to your account
- API token can be rotated independently of Gmail credentials
- Use different app passwords for different applications

### Authentication Flow

```
Request
  ↓
Check API Token → Invalid? → 401 "Invalid API token"
  ↓ Valid
Check Basic Auth → Missing? → 401 "Authorization header required"
  ↓ Present
Decode Credentials → Invalid format? → 401 "Invalid format"
  ↓ Valid
Email Match Check → Mismatch? → 401 "Email must match senderEmail"
  ↓ Match
Gmail Authentication → Failed? → 401 "Authentication failed"
  ↓ Success
Send Email → Success! → 200 "Email sent successfully"
```

### Why Dual Authentication?

**Traditional Approach (Single Auth):**
- Only one credential needed
- If compromised, full access granted
- No separation between endpoint access and email sending

**Dual Authentication Approach:**
- Two separate credentials required
- If one is compromised, attacker still can't proceed
- Endpoint access separate from email credentials
- Can audit both WHO accessed and WHAT account was used
- Can rotate credentials independently

---

## Future Improvements

- [ ] Support for additional email service providers beyond Gmail
- [ ] Rate limiting for email sending
- [ ] Template management system
- [ ] Webhook support for email delivery status
- [ ] Multi-language template support
- [ ] Token expiration mechanism
- [ ] Request throttling per sender
- [ ] Email delivery status tracking
