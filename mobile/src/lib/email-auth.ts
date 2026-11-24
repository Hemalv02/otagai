export const maxAuthCodeLength = 10;

export function codeInput(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6))
    .replace(/\D/g, "")
    .slice(0, maxAuthCodeLength);
}

export function validCode(value: string) {
  return /^\d{6,10}$/.test(value);
}

export function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validNewPassword(password: string, confirmation = password) {
  return password.length >= 8 && password === confirmation;
}

export function authErrorKey(code?: string) {
  switch (code) {
    case "email_address_invalid":
      return "invalidEmail";
    case "invalid_credentials":
      return "invalidCredentials";
    case "email_not_confirmed":
      return "emailUnconfirmed";
    case "weak_password":
      return "weakPassword";
    case "same_password":
      return "samePassword";
    case "otp_expired":
      return "invalidAuthCode";
    case "user_already_exists":
    case "email_exists":
      return "accountExists";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "authRateLimited";
    default:
      return "authFailed";
  }
}
