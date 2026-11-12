<?php
/**
 * contact_validate.php
 *
 * Backend processor for MLR Infra project quote forms.
 * Validates incoming POST/JSON data, verifies Google reCAPTCHA v2,
 * sends a confirmation email to the visitor's email ID, and sends the
 * full project quote enquiry (with Reply-To set to the visitor's email)
 * to the MLR Infra team.
 *
 * Requires PHPMailer at:
 *   PHPMailer/src/PHPMailer.php
 *   PHPMailer/src/SMTP.php
 *   PHPMailer/src/Exception.php
 */

declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

// =============================================================================
// 1. CONFIGURATION — MLR INFRA SMTP & BRAND SETTINGS
// =============================================================================
define('SMTP_HOST', 'smtp.gmail.com');
define('SMTP_USERNAME', 'jayaramcm.envizon@gmail.com');
define('SMTP_PASSWORD', 'Pradeep@143');
define('SMTP_PORT', 587);
define('SMTP_SECURE', 'tls');              // 'tls' (587) with automatic fallback to 'ssl' (465)
define('FROM_EMAIL', 'jayaramcm.envizon@gmail.com');
define('FROM_NAME', 'MLR Infra');
define('FOUNDER_EMAIL', 'jayaramcm.envizon@gmail.com');

define('COMPANY_NAME', 'MLR Infra');
define('COMPANY_TAGLINE', 'We bring the factory to your site');
define('COMPANY_PHONE', '+91 94905 57886 / +91 93475 57886');

// Google reCAPTCHA v2 keys
define('RECAPTCHA_SITE_KEY', '6LcRvfMtAAAAABNDcW2234EWZwkxF92icVYCZIUs');
define('RECAPTCHA_SECRET_KEY', '6LcRvfMtAAAAABEUnxF_1qUJuoZ0y-EknmZt5euB');

// =============================================================================
// 2. BOOTSTRAP & CORS
// =============================================================================
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!function_exists('mb_strlen')) {
    function mb_strlen($string, $encoding = null): int
    {
        $count = preg_match_all('/./us', (string) $string);
        return $count === false ? strlen((string) $string) : $count;
    }
}

function respond(bool $success, string $message, int $httpCode = 200, array $extra = []): void
{
    http_response_code($httpCode);
    echo json_encode(array_merge(['success' => $success, 'message' => $message], $extra));
    exit;
}

function logServerError(string $context, string $error): void
{
    $logDir = __DIR__ . '/logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    $line = '[' . date('Y-m-d H:i:s') . "] {$context}: {$error}" . PHP_EOL;
    @file_put_contents($logDir . '/mail-errors.log', $line, FILE_APPEND);

    $htaccess = $logDir . '/.htaccess';
    if (!file_exists($htaccess)) {
        @file_put_contents($htaccess, "Require all denied\nDeny from all\n");
    }
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(false, 'Invalid request method.', 405);
}

// Support both application/x-www-form-urlencoded, multipart/form-data, and application/json
$inputData = $_POST;
if (empty($inputData)) {
    $rawBody = file_get_contents('php://input');
    if (is_string($rawBody) && trim($rawBody) !== '') {
        $decoded = json_decode($rawBody, true);
        if (is_array($decoded)) {
            $inputData = $decoded;
        }
    }
}

// Honeypot spam trap
if (!empty($inputData['website'])) {
    respond(true, 'Your project quote request has been submitted successfully.');
}

// Google reCAPTCHA v2 verification
function verifyRecaptcha(string $token): bool
{
    if ($token === '') {
        return false;
    }

    $postData = http_build_query([
        'secret'   => RECAPTCHA_SECRET_KEY,
        'response' => $token,
        'remoteip' => $_SERVER['REMOTE_ADDR'] ?? '',
    ]);

    $response = false;

    if (function_exists('curl_init')) {
        $ch = curl_init('https://www.google.com/recaptcha/api/siteverify');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $postData,
            CURLOPT_TIMEOUT        => 10,
        ]);
        $response = curl_exec($ch);
        curl_close($ch);
    } else {
        $context = stream_context_create([
            'http' => [
                'method'  => 'POST',
                'header'  => 'Content-Type: application/x-www-form-urlencoded',
                'content' => $postData,
                'timeout' => 10,
            ],
        ]);
        $response = @file_get_contents('https://www.google.com/recaptcha/api/siteverify', false, $context);
    }

    if (!is_string($response)) {
        return false;
    }

    $result = json_decode($response, true);
    return is_array($result) && !empty($result['success']);
}

$recaptchaToken = trim((string) ($inputData['g-recaptcha-response'] ?? $inputData['token'] ?? ''));
if (!verifyRecaptcha($recaptchaToken)) {
    respond(false, 'reCAPTCHA verification failed. Please confirm you are not a robot and try again.', 422);
}

// =============================================================================
// 3. COLLECT & SANITIZE MLR FORM INPUTS
// =============================================================================
function cleanInput(?string $value): string
{
    $value = trim((string) ($value ?? ''));
    $value = strip_tags($value);
    $value = preg_replace('/[\r\n]+/', ' ', $value);
    return trim((string) $value);
}

function cleanMultiline(?string $value): string
{
    $value = trim((string) ($value ?? ''));
    $value = strip_tags($value);
    return trim($value);
}

$fullName        = cleanInput($inputData['full_name'] ?? $inputData['name'] ?? '');
$email           = cleanInput($inputData['email'] ?? '');
$phone           = cleanInput($inputData['phone'] ?? $inputData['mobile'] ?? '');
$contactInfo     = cleanInput($inputData['contact_info'] ?? $inputData['contact'] ?? '');
$productInterest = cleanInput($inputData['product_interest'] ?? $inputData['product'] ?? '');
$estimatedQty    = cleanInput($inputData['estimated_quantity'] ?? $inputData['quantity'] ?? '');
$projectLocation = cleanInput($inputData['project_location'] ?? $inputData['location'] ?? '');
$projectParams   = cleanMultiline($inputData['project_parameters'] ?? $inputData['requirement'] ?? $inputData['message'] ?? '');

// If contact_info was supplied instead of separate email/phone, extract email if present
if ($email === '' && filter_var($contactInfo, FILTER_VALIDATE_EMAIL)) {
    $email = $contactInfo;
}
if ($phone === '' && $contactInfo !== '' && !filter_var($contactInfo, FILTER_VALIDATE_EMAIL)) {
    $phone = $contactInfo;
}
$combinedContact = trim(($phone !== '' ? $phone : '') . ($phone !== '' && $email !== '' ? ' | ' : '') . ($email !== '' ? $email : ''));
if ($combinedContact === '') {
    $combinedContact = $contactInfo;
}

// =============================================================================
// 4. SERVER-SIDE VALIDATION
// =============================================================================
$errors = [];

if (mb_strlen($fullName) < 2) {
    $errors['full_name'] = 'Please enter your full name (at least 2 characters).';
}

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors['email'] = 'Please enter a valid email address so we can reply to you.';
}

if ($phone === '' || !preg_match('/^[0-9+\-\s()]{7,18}$/', $phone)) {
    $errors['phone'] = 'Please enter a valid phone number.';
}

if ($productInterest === '') {
    $errors['product_interest'] = 'Please select a product interest.';
}

if ($projectLocation === '') {
    $errors['project_location'] = 'Project location is required.';
}

// Optional file/photo upload validation
$uploadedFiles = [];
$uploadDir = __DIR__ . '/uploads/';
if (isset($_FILES['project_photos']) && !empty($_FILES['project_photos']['name'][0])) {
    if (!is_dir($uploadDir)) {
        @mkdir($uploadDir, 0755, true);
    }
    $allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    $maxFileSize = 5 * 1024 * 1024; // 5MB limit per file

    $fileCount = count($_FILES['project_photos']['name']);
    for ($i = 0; $i < $fileCount; $i++) {
        if ($_FILES['project_photos']['error'][$i] === UPLOAD_ERR_OK) {
            $fileTmpPath = $_FILES['project_photos']['tmp_name'][$i];
            $fileName = $_FILES['project_photos']['name'][$i];
            $fileSize = $_FILES['project_photos']['size'][$i];

            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $mimeType = finfo_file($finfo, $fileTmpPath);
            finfo_close($finfo);

            if (!in_array($mimeType, $allowedTypes, true)) {
                $errors['project_photos'] = "Invalid file type for: {$fileName}. Only JPG, PNG, WEBP, and PDF are allowed.";
                continue;
            }

            if ($fileSize > $maxFileSize) {
                $errors['project_photos'] = "File too large: {$fileName}. Maximum size allowed is 5MB.";
                continue;
            }

            $safeFileName = uniqid('proj_', true) . '_' . preg_replace('/[^a-zA-Z0-9\._-]/', '', $fileName);
            $destination = $uploadDir . $safeFileName;

            if (move_uploaded_file($fileTmpPath, $destination)) {
                $uploadedFiles[] = $destination;
            }
        }
    }
}

if (!empty($errors)) {
    respond(false, implode(' ', array_values($errors)), 422, ['errors' => $errors]);
}

// =============================================================================
// 5. REQUEST METADATA & HTML ESCAPING
// =============================================================================
$submissionTime = date('d M Y, h:i A');
$ipAddress      = $_SERVER['REMOTE_ADDR'] ?? 'Unknown';
$userAgent      = $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown';
$referrer       = $_SERVER['HTTP_REFERER'] ?? 'Direct';
$scheme         = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https://' : 'http://';
$websiteUrl     = $scheme . ($_SERVER['HTTP_HOST'] ?? 'mlrinfra.com');

function esc(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

$safeName      = esc($fullName);
$safeEmail     = esc($email);
$safePhone     = esc($phone);
$safeContact   = esc($combinedContact);
$safeInterest  = esc($productInterest);
$safeQty       = esc($estimatedQty !== '' ? $estimatedQty : 'Not specified');
$safeLocation  = esc($projectLocation);
$safeParams    = $projectParams !== '' ? nl2br(esc($projectParams)) : '<em>None provided</em>';
$safeIp        = esc($ipAddress);
$safeAgent     = esc($userAgent);
$safeReferrer  = esc($referrer);
$safeUrl       = esc($websiteUrl);
$safeSubmitted = esc($submissionTime);

// =============================================================================
// 6. EMAIL TEMPLATES
// =============================================================================
function summaryRow(string $label, string $valueHtml, bool $highlight = false): string
{
    $labelStyle = 'padding:10px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#475569;font-weight:600;width:38%;border-bottom:1px solid #D9EAF4;';
    $valueStyle = 'padding:10px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0B1220;border-bottom:1px solid #D9EAF4;';
    if ($highlight) {
        $valueStyle .= 'background:#EEF8FD;font-weight:700;color:#0056A7;';
    }
    return "<tr><td style=\"{$labelStyle}\">{$label}</td><td style=\"{$valueStyle}\">{$valueHtml}</td></tr>";
}

function emailShell(string $headerTitle, string $bodyHtml): string
{
    $companyName = esc(COMPANY_NAME);
    $tagline = esc(COMPANY_TAGLINE);
    return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>{$companyName}</title></head>
<body style="margin:0;padding:0;background:#F4F7FA;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7FA;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid #D9EAF4;">
          <tr>
            <td style="background:#0056A7;padding:26px 32px;border-bottom:4px solid #8DC63F;">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;color:#FFFFFF;letter-spacing:0.02em;">{$companyName}</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#D9EAF4;margin-top:4px;">{$tagline}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:19px;color:#0B1F33;">{$headerTitle}</h1>
              {$bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="background:#F1F5F9;padding:18px 32px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#475569;">
              &copy; {$companyName} &middot; {$tagline} &middot; Hyderabad, Telangana
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
HTML;
}

function buildClientEmail(string $safeName, string $safeEmail, string $safePhone, string $safeInterest, string $safeLocation, string $safeQty, string $safeParams): string
{
    $companyName  = esc(COMPANY_NAME);
    $companyPhone = esc(COMPANY_PHONE);
    $rows = summaryRow('Full Name', $safeName)
        . summaryRow('Email Address', $safeEmail)
        . summaryRow('Phone Number', $safePhone)
        . summaryRow('Product Interest', $safeInterest, true)
        . summaryRow('Estimated Qty / Area', $safeQty)
        . summaryRow('Project Location', $safeLocation)
        . summaryRow('Project Parameters', $safeParams);

    $body = <<<HTML
      <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0B1F33;line-height:1.6;">
        Hello {$safeName},<br><br>
        Thank you for reaching out to <strong>{$companyName}</strong>. We have received your project quote request. Our technical &amp; dispatch team will review your requirements and respond to you shortly with an indicative quote and mobilisation schedule.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #D9EAF4;border-radius:8px;overflow:hidden;margin:20px 0;">
        {$rows}
      </table>
      <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#475569;line-height:1.6;">
        For immediate assistance, call us at <strong>{$companyPhone}</strong> or simply reply to this email.
      </p>
HTML;

    return emailShell('Project Quote Request Received', $body);
}

function buildTeamEmail(string $safeName, string $safeEmail, string $safePhone, string $safeInterest, string $safeQty, string $safeLocation, string $safeParams, string $safeSubmitted, string $safeIp, string $safeAgent, string $safeReferrer, string $safeUrl): string
{
    $emailLink = "<a href=\"mailto:{$safeEmail}\" style=\"color:#0056A7;font-weight:700;text-decoration:none;\">{$safeEmail}</a>";
    $phoneLink = "<a href=\"tel:{$safePhone}\" style=\"color:#0056A7;font-weight:700;text-decoration:none;\">{$safePhone}</a>";

    $rows = summaryRow('Full Name', $safeName)
        . summaryRow('Visitor Email (Reply-To)', $emailLink, true)
        . summaryRow('Phone Number', $phoneLink)
        . summaryRow('Product Interest', $safeInterest, true)
        . summaryRow('Estimated Qty / Area', $safeQty)
        . summaryRow('Project Location', $safeLocation)
        . summaryRow('Parameters & Target Dates', $safeParams)
        . summaryRow('Submission Time', $safeSubmitted)
        . summaryRow('User IP Address', $safeIp)
        . summaryRow('Referring Page', $safeReferrer);

    $body = <<<HTML
      <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0B1F33;line-height:1.6;">
        A new project quote enquiry has been submitted on the <strong>MLR Infra</strong> website. You can click <strong>Reply</strong> directly in your email client to respond to <strong>{$safeName} ({$safeEmail})</strong>.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #D9EAF4;border-radius:8px;overflow:hidden;margin:20px 0;">
        {$rows}
      </table>
HTML;

    return emailShell('New Project Quote Enquiry — ' . $safeName, $body);
}

// =============================================================================
// 7. PHPMAILER — SEND EMAILS
// =============================================================================
$phpMailerDir = __DIR__ . '/PHPMailer/src/';
if (!file_exists($phpMailerDir . 'PHPMailer.php')) {
    logServerError('PHPMailer', 'Library not found at ' . $phpMailerDir);
    respond(false, 'Mail library missing on server. Please contact us by phone.', 500);
}

require_once $phpMailerDir . 'Exception.php';
require_once $phpMailerDir . 'PHPMailer.php';
require_once $phpMailerDir . 'SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as PHPMailerException;

function buildMailer(?int $port = null, ?string $secure = null): PHPMailer
{
    $port   = $port   ?? SMTP_PORT;
    $secure = $secure ?? SMTP_SECURE;

    $mail = new PHPMailer(true);
    $mail->isSMTP();
    $mail->Host        = SMTP_HOST;
    $mail->SMTPAuth    = true;
    $mail->Username    = SMTP_USERNAME;
    $mail->Password    = SMTP_PASSWORD;
    $mail->SMTPSecure  = $secure === 'ssl' ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Port        = $port;
    $mail->CharSet     = 'UTF-8';
    $mail->SMTPAutoTLS = true;

    $mail->SMTPOptions = [
        'ssl' => [
            'verify_peer'       => false,
            'verify_peer_name'  => false,
            'allow_self_signed' => true,
        ],
    ];

    $mail->setFrom(FROM_EMAIL, FROM_NAME);
    return $mail;
}

function sendWithFallback(string $context, callable $configure): bool
{
    $attempts = [[SMTP_PORT, SMTP_SECURE]];
    if (SMTP_SECURE === 'ssl' || (int) SMTP_PORT === 465) {
        $attempts[] = [587, 'tls'];
    } else {
        $attempts[] = [465, 'ssl'];
    }

    foreach ($attempts as $i => [$port, $secure]) {
        try {
            $mail = buildMailer($port, $secure);
            $configure($mail);
            $mail->send();
            return true;
        } catch (PHPMailerException $e) {
            $detail = isset($mail) ? ($mail->ErrorInfo ?: $e->getMessage()) : $e->getMessage();
            logServerError($context, 'Attempt ' . ($i + 1) . " (port {$port}/{$secure}) failed: {$detail}");
        }
    }
    return false;
}

// 1) Send Team notification email to jayaramcm.envizon@gmail.com with Reply-To = visitor's email
$teamSent = sendWithFallback('Team email', function (PHPMailer $mail) use (
    $email, $fullName, $productInterest, $safeName, $safeEmail, $safePhone,
    $safeInterest, $safeQty, $safeLocation, $safeParams, $safeSubmitted,
    $safeIp, $safeAgent, $safeReferrer, $safeUrl, $uploadedFiles
) {
    $mail->addAddress(FOUNDER_EMAIL, COMPANY_NAME);
    if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $mail->addReplyTo($email, $fullName);
    }
    $mail->isHTML(true);
    $mail->Subject = 'New Project Quote: ' . $productInterest . ' (' . $fullName . ')';
    $mail->Body    = buildTeamEmail($safeName, $safeEmail, $safePhone, $safeInterest, $safeQty, $safeLocation, $safeParams, $safeSubmitted, $safeIp, $safeAgent, $safeReferrer, $safeUrl);

    foreach ($uploadedFiles as $filePath) {
        if (file_exists($filePath)) {
            $mail->addAttachment($filePath);
        }
    }
});

// 2) Send Client confirmation email to the visitor's email ID
$clientSent = true;
if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $clientSent = sendWithFallback('Client email', function (PHPMailer $mail) use (
        $email, $fullName, $safeName, $safeEmail, $safePhone, $safeInterest, $safeLocation, $safeQty, $safeParams
    ) {
        $mail->addAddress($email, $fullName);
        $mail->addReplyTo(FOUNDER_EMAIL, COMPANY_NAME);
        $mail->isHTML(true);
        $mail->Subject = 'Project Quote Request Received - ' . COMPANY_NAME;
        $mail->Body    = buildClientEmail($safeName, $safeEmail, $safePhone, $safeInterest, $safeLocation, $safeQty, $safeParams);
    });
}

if (!$teamSent) {
    respond(false, 'Unable to send your enquiry email right now. Please check SMTP/App Password settings or call +91 94905 57886.', 500);
}

respond(true, 'Your project quote request has been submitted successfully.');
