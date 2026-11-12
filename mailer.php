<?php
/**
 * mailer.php
 * Handles the MLR Infra "Project Quote / Rapid Enquiry Form" submission:
 * validates incoming POST data (including Google reCAPTCHA v2), sends the
 * project lead to the MLR Infra team with Reply-To set to the visitor's email,
 * and sends an automatic confirmation email back to the visitor.
 */

declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'status' => 'error', 'message' => 'Invalid request method.']);
    exit;
}

// ===========================================================
// PHPMailer
// ===========================================================
if (file_exists(__DIR__ . '/vendor/autoload.php')) {
    require __DIR__ . '/vendor/autoload.php';
} else {
    require __DIR__ . '/PHPMailer/src/Exception.php';
    require __DIR__ . '/PHPMailer/src/PHPMailer.php';
    require __DIR__ . '/PHPMailer/src/SMTP.php';
}

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;
use PHPMailer\PHPMailer\SMTP;

// ===========================================================
// CONFIG — MLR Infra SMTP & Recipient Configuration
// ===========================================================
$SMTP_HOST            = 'smtp.gmail.com';
$SMTP_PORT            = 587;
$SMTP_SECURE          = PHPMailer::ENCRYPTION_STARTTLS;
$SMTP_USERNAME        = 'jayaramcm.envizon@gmail.com';
$SMTP_PASSWORD        = 'Pradeep@143';

$FROM_EMAIL           = 'jayaramcm.envizon@gmail.com';
$FROM_NAME            = 'MLR Infra';

$TO_EMAIL             = 'jayaramcm.envizon@gmail.com';
$TO_NAME              = 'MLR Infra Team';

$COMPANY_NAME         = 'MLR Infra';
$COMPANY_TAGLINE      = 'We bring the factory to your site';
$COMPANY_PHONE        = '+91 94905 57886 / +91 93475 57886';

$SUBJECT_PREFIX       = 'New Project Quote Request — MLR Infra';
$RECAPTCHA_SECRET_KEY = '6LcRvfMtAAAAABEUnxF_1qUJuoZ0y-EknmZt5euB';

// ===========================================================
// 1) COLLECT + SANITIZE INPUT (Supports FormData & JSON)
// ===========================================================
$input = $_POST;
if (empty($input)) {
    $rawBody = file_get_contents('php://input');
    if (!empty($rawBody)) {
        $decoded = json_decode($rawBody, true);
        if (is_array($decoded)) {
            $input = $decoded;
        }
    }
}

function clean(string $value): string {
    return htmlspecialchars(strip_tags(trim($value)), ENT_QUOTES, 'UTF-8');
}

$fullName          = clean((string)($input['full_name'] ?? $input['name'] ?? ''));
$emailRaw          = trim((string)($input['email'] ?? ''));
$phone             = clean((string)($input['phone'] ?? $input['mobile'] ?? $input['contact_info'] ?? $input['contact'] ?? ''));
$productInterest   = clean((string)($input['product_interest'] ?? $input['product'] ?? 'CC Bricks'));
$estimatedQuantity = clean((string)($input['estimated_quantity'] ?? $input['quantity'] ?? ''));
$projectLocation   = clean((string)($input['project_location'] ?? $input['location'] ?? ''));
$projectParams     = clean((string)($input['project_parameters'] ?? $input['requirement'] ?? $input['message'] ?? ''));
$recaptchaToken    = trim((string)($input['g-recaptcha-response'] ?? $input['token'] ?? ''));
$honeypot          = trim((string)($input['website'] ?? ''));

// If email was typed inside the contact field when email field was omitted
if ($emailRaw === '' && filter_var($phone, FILTER_VALIDATE_EMAIL)) {
    $emailRaw = $phone;
}

// ===========================================================
// 2) VALIDATE
// ===========================================================
$errors = [];

if ($honeypot !== '') {
    http_response_code(200);
    echo json_encode(['success' => true, 'status' => 'success', 'message' => 'Thank you!']);
    exit;
}

if ($fullName === '' || mb_strlen($fullName) < 2) {
    $errors['full_name'] = 'Please enter your full name.';
}

if ($phone === '' || !preg_match('/^[0-9+\-\s()]{7,20}$/', $phone)) {
    $errors['phone'] = 'Please enter a valid phone number.';
}

if ($emailRaw === '' || !filter_var($emailRaw, FILTER_VALIDATE_EMAIL)) {
    $errors['email'] = 'Please enter a valid email address so we can respond to you.';
    $email = '';
} else {
    $email = clean($emailRaw);
}

$allowedProducts = [
    'CC Bricks',
    'Concrete Paver Blocks',
    'Precast Fencing',
    'Both CC Bricks & Precast Fencing',
    'Custom Concrete Blocks'
];
if ($productInterest === '' || !in_array($productInterest, $allowedProducts, true)) {
    $productInterest = 'CC Bricks';
}

if ($projectLocation === '' || mb_strlen($projectLocation) < 2) {
    $errors['project_location'] = 'Please specify your project location.';
}

if ($projectParams === '' || mb_strlen($projectParams) < 3) {
    $errors['project_parameters'] = 'Please provide your project parameters or target dates.';
}

if ($recaptchaToken === '') {
    $errors['captcha'] = 'Please complete the reCAPTCHA verification.';
} else {
    $verifyUrl  = 'https://www.google.com/recaptcha/api/siteverify';
    $verifyData = http_build_query([
        'secret'   => $RECAPTCHA_SECRET_KEY,
        'response' => $recaptchaToken,
        'remoteip' => $_SERVER['REMOTE_ADDR'] ?? ''
    ]);
    $verifyResponse = false;
    if (function_exists('curl_init')) {
        $ch = curl_init($verifyUrl);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $verifyData);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        $verifyResponse = curl_exec($ch);
        curl_close($ch);
    } else {
        $opts = [
            'http' => [
                'header'  => "Content-type: application/x-www-form-urlencoded\r\n",
                'method'  => 'POST',
                'content' => $verifyData,
                'timeout' => 10
            ]
        ];
        $context = stream_context_create($opts);
        $verifyResponse = @file_get_contents($verifyUrl, false, $context);
    }

    if ($verifyResponse !== false) {
        $captchaJson = json_decode($verifyResponse, true);
        if (empty($captchaJson['success'])) {
            $errors['captcha'] = 'reCAPTCHA verification failed. Please verify again.';
        }
    }
}

if (!empty($errors)) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'status'  => 'error',
        'message' => reset($errors),
        'errors'  => $errors,
    ]);
    exit;
}

// ===========================================================
// 3) BUILD EMAIL BODY (Team Notification + Visitor Auto-Reply)
// ===========================================================
$submittedAt = date('d M Y, h:i A');
$rows = [
    'Full Name'                         => $fullName,
    'Email Address (Reply-To)'          => $email,
    'Phone Number'                      => $phone,
    'Product Interest'                  => $productInterest,
    'Estimated Quantity or Area'        => $estimatedQuantity !== '' ? $estimatedQuantity : 'Not specified',
    'Project Location'                  => $projectLocation,
    'Project Parameters & Target Dates' => $projectParams,
    'Submitted At'                      => $submittedAt,
];

$htmlRows  = '';
$plainBody = $SUBJECT_PREFIX . "\n====================================\n\n";

foreach ($rows as $label => $value) {
    $safeVal   = $value !== '' ? $value : '—';
    $htmlRows .= "<tr>
        <td style='padding:12px 16px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#0f172a;width:36%;background:#f8fafc;'>{$label}</td>
        <td style='padding:12px 16px;border-bottom:1px solid #e2e8f0;color:#1e293b;'>" . nl2br($safeVal) . "</td>
    </tr>";
    $plainBody .= "{$label}: {$safeVal}\n";
}

$htmlBody = "<!DOCTYPE html>
<html>
<head><meta charset='UTF-8'></head>
<body style='margin:0;padding:24px;background:#f1f5f9;font-family:Arial,sans-serif;'>
  <div style='max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #cbd5e1;border-top:5px solid #0056A7;'>
    <div style='padding:24px 28px;background:#0a192f;color:#ffffff;'>
      <div style='font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8CC63F;font-weight:700;margin-bottom:6px;'>{$COMPANY_NAME} &bull; Lead Notification</div>
      <h2 style='margin:0;font-size:20px;color:#ffffff;'>{$SUBJECT_PREFIX}</h2>
      <p style='margin:6px 0 0;font-size:13px;color:#cbd5e1;'>Hit <strong>Reply</strong> in your email client to respond directly to <strong>{$fullName}</strong> ({$email}).</p>
    </div>
    <div style='padding:24px 28px;'>
      <table width='100%' cellpadding='0' cellspacing='0' style='border-collapse:collapse;font-size:14px;border:1px solid #e2e8f0;'>
        {$htmlRows}
      </table>
      <div style='margin-top:22px;text-align:center;'>
        <a href='mailto:{$email}?subject=" . rawurlencode("Re: Your Project Quote Request with {$COMPANY_NAME}") . "' style='display:inline-block;padding:12px 24px;background:#0056A7;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;margin-right:10px;'>Reply to {$fullName}</a>
        <a href='tel:" . preg_replace('/[^0-9+]/', '', $phone) . "' style='display:inline-block;padding:12px 24px;background:#8CC63F;color:#0a192f;text-decoration:none;font-weight:700;font-size:14px;'>Call {$phone}</a>
      </div>
    </div>
  </div>
</body>
</html>";

$clientSubject = "We've Received Your Project Enquiry — {$COMPANY_NAME}";
$clientHtmlBody = "<!DOCTYPE html>
<html>
<head><meta charset='UTF-8'></head>
<body style='margin:0;padding:24px;background:#f1f5f9;font-family:Arial,sans-serif;'>
  <div style='max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #cbd5e1;border-top:5px solid #8CC63F;'>
    <div style='padding:24px 28px;background:#003B73;color:#ffffff;'>
      <div style='font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8CC63F;font-weight:700;margin-bottom:6px;'>{$COMPANY_NAME}</div>
      <h2 style='margin:0;font-size:20px;color:#ffffff;'>Thank You for Contacting {$COMPANY_NAME}</h2>
      <p style='margin:6px 0 0;font-size:13px;color:#e2e8f0;'>{$COMPANY_TAGLINE}</p>
    </div>
    <div style='padding:24px 28px;color:#1e293b;font-size:14px;line-height:1.6;'>
      <p>Dear <strong>{$fullName}</strong>,</p>
      <p>Thank you for sharing your project requirements with <strong>{$COMPANY_NAME}</strong>. Our engineering and mobilization team has received your enquiry and will get back to you within 24 business hours with an indicative quote and schedule.</p>
      <div style='background:#f8fafc;border-left:4px solid #0056A7;padding:14px 18px;margin:18px 0;'>
        <div><strong>Product Interest:</strong> {$productInterest}</div>
        <div><strong>Estimated Quantity / Area:</strong> " . ($estimatedQuantity !== '' ? $estimatedQuantity : 'To be assessed') . "</div>
        <div><strong>Project Location:</strong> {$projectLocation}</div>
        <div><strong>Contact Phone:</strong> {$phone}</div>
      </div>
      <p>For urgent site discussions, reach us directly at <strong>{$COMPANY_PHONE}</strong> or simply reply to this email.</p>
      <p style='margin-top:20px;margin-bottom:0;'>Warm regards,<br><strong>{$COMPANY_NAME} Team</strong><br><a href='mailto:{$FROM_EMAIL}' style='color:#0056A7;'>{$FROM_EMAIL}</a></p>
    </div>
  </div>
</body>
</html>";

$clientPlainBody = "Dear {$fullName},\n\nThank you for contacting {$COMPANY_NAME} ({$COMPANY_TAGLINE}).\nWe have received your enquiry for {$productInterest} at {$projectLocation}.\nOur team will respond to you shortly.\n\nPhone: {$COMPANY_PHONE}\nEmail: {$FROM_EMAIL}\n";

// ===========================================================
// 4) SEND EMAIL VIA PHPMailer / SMTP (Port 587 TLS + 465 SSL Fallback)
// ===========================================================
function configureMailer(string $host, string $user, string $pass, int $port, string $secure): PHPMailer {
    $m = new PHPMailer(true);
    $m->isSMTP();
    $m->Host       = $host;
    $m->SMTPAuth   = true;
    $m->Username   = $user;
    $m->Password   = $pass;
    $m->SMTPSecure = $secure;
    $m->Port       = $port;
    $m->CharSet    = 'UTF-8';
    $m->Timeout    = 20;
    $m->SMTPOptions = [
        'ssl' => [
            'verify_peer'       => false,
            'verify_peer_name'  => false,
            'allow_self_signed' => true,
        ],
    ];
    return $m;
}

try {
    try {
        $mail = configureMailer($SMTP_HOST, $SMTP_USERNAME, $SMTP_PASSWORD, 587, PHPMailer::ENCRYPTION_STARTTLS);
        $mail->setFrom($FROM_EMAIL, $FROM_NAME);
        $mail->addAddress($TO_EMAIL, $TO_NAME);
        $mail->addReplyTo($email, $fullName);
        $mail->isHTML(true);
        $mail->Subject = "{$SUBJECT_PREFIX} — {$fullName} ({$projectLocation})";
        $mail->Body    = $htmlBody;
        $mail->AltBody = $plainBody;
        $mail->send();
    } catch (Exception $tlsEx) {
        $mail = configureMailer($SMTP_HOST, $SMTP_USERNAME, $SMTP_PASSWORD, 465, PHPMailer::ENCRYPTION_SMTPS);
        $mail->setFrom($FROM_EMAIL, $FROM_NAME);
        $mail->addAddress($TO_EMAIL, $TO_NAME);
        $mail->addReplyTo($email, $fullName);
        $mail->isHTML(true);
        $mail->Subject = "{$SUBJECT_PREFIX} — {$fullName} ({$projectLocation})";
        $mail->Body    = $htmlBody;
        $mail->AltBody = $plainBody;
        $mail->send();
    }

    // Send automatic confirmation email to the visitor's email ID
    try {
        $clientMail = configureMailer($SMTP_HOST, $SMTP_USERNAME, $SMTP_PASSWORD, 587, PHPMailer::ENCRYPTION_STARTTLS);
        $clientMail->setFrom($FROM_EMAIL, $FROM_NAME);
        $clientMail->addAddress($email, $fullName);
        $clientMail->addReplyTo($TO_EMAIL, $TO_NAME);
        $clientMail->isHTML(true);
        $clientMail->Subject = $clientSubject;
        $clientMail->Body    = $clientHtmlBody;
        $clientMail->AltBody = $clientPlainBody;
        $clientMail->send();
    } catch (Exception $clientEx) {
        error_log('Visitor confirmation email error: ' . $clientEx->getMessage());
    }

    echo json_encode([
        'success' => true,
        'status'  => 'success',
        'message' => 'Thank you! Your project enquiry has been received. We have sent a confirmation to your email and will respond shortly.',
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'status'  => 'error',
        'message' => 'Sorry, something went wrong while sending your enquiry. Please call us at ' . $COMPANY_PHONE . ' or email ' . $TO_EMAIL . '.',
        'debug'   => isset($mail) ? $mail->ErrorInfo : $e->getMessage(),
    ]);
}
