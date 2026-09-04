import {
  MAX_INPUT_CODE_UNITS,
  MAX_NAME_CODE_UNITS,
  MAX_NAMES_TO_HIDE,
  type Finding,
  type FindingConfidence,
  type FindingKind,
} from "./contracts";

export type { Finding, FindingConfidence, FindingKind } from "./contracts";

interface Candidate {
  start: number;
  end: number;
  kind: FindingKind;
  label: string;
  confidence: FindingConfidence;
  normalizedValue: string;
  reason: string;
  placeholderLabel: string;
  priority: number;
}

interface NameMatcher {
  regex: RegExp;
  normalizedValue: string;
  firstCharacterIsWord: boolean;
  lastCharacterIsWord: boolean;
}

interface UrlAssessment {
  confidence: FindingConfidence;
  reason: string;
}

const WORD_CHARACTER = /[\p{L}\p{N}_]/u;
const ASCII_HEX_CHARACTER = /^[0-9A-Fa-f]$/u;
const URL_STOP_CHARACTER = /[\s<>"'`]/u;

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const STRONG_SENSITIVE_PARAMETER_KEYS = new Set([
  "access_token",
  "account",
  "account_id",
  "address",
  "apikey",
  "api_key",
  "auth",
  "authorization",
  "auth_token",
  "card",
  "card_number",
  "client_secret",
  "confirmation",
  "customer_id",
  "date_of_birth",
  "dob",
  "email",
  "googleaccessid",
  "id_token",
  "jwt",
  "member_id",
  "mobile",
  "order_id",
  "passwd",
  "password",
  "phone",
  "pwd",
  "refresh_token",
  "session",
  "session_id",
  "sessionid",
  "sid",
  "signature",
  "sig",
  "ssn",
  "token",
  "user_id",
  "x_amz_credential",
  "x_amz_security_token",
  "x_amz_signature",
  "x_goog_credential",
  "x_goog_security_token",
  "x_goog_signature",
]);

const REVIEW_SENSITIVE_PARAMETER_KEYS = new Set(["code", "key", "ref", "reference", "state"]);

const STRONG_SENSITIVE_PARAMETER_SUFFIXES = [
  "_access_token",
  "_api_key",
  "_auth_token",
  "_card_number",
  "_client_secret",
  "_credential",
  "_date_of_birth",
  "_email",
  "_password",
  "_phone",
  "_refresh_token",
  "_security_token",
  "_session_id",
  "_signature",
  "_ssn",
  "_token",
] as const;

function assertTextWithinLimit(text: string): void {
  if (text.length > MAX_INPUT_CODE_UNITS) {
    throw new RangeError(
      `Text must be ${MAX_INPUT_CODE_UNITS.toLocaleString("en-US")} characters or fewer.`,
    );
  }
}

function codePointBefore(text: string, index: number): string {
  if (index <= 0) return "";

  const lastUnit = text.charCodeAt(index - 1);
  if (lastUnit >= 0xdc00 && lastUnit <= 0xdfff && index >= 2) {
    const previousUnit = text.charCodeAt(index - 2);
    if (previousUnit >= 0xd800 && previousUnit <= 0xdbff) {
      return text.slice(index - 2, index);
    }
  }

  return text.slice(index - 1, index);
}

function codePointAt(text: string, index: number): string {
  if (index < 0 || index >= text.length) return "";
  const value = text.codePointAt(index);
  return value === undefined ? "" : String.fromCodePoint(value);
}

function isWordCharacter(value: string): boolean {
  return value !== "" && WORD_CHARACTER.test(value);
}

function hasWordBoundaries(text: string, start: number, end: number): boolean {
  return !isWordCharacter(codePointBefore(text, start)) && !isWordCharacter(codePointAt(text, end));
}

function hasAddressBoundaries(text: string, start: number, end: number): boolean {
  const previous = codePointBefore(text, start);
  const next = codePointAt(text, end);

  if (isWordCharacter(previous) || previous === "." || previous === "%") return false;
  if (isWordCharacter(next) || next === "." || next === ":" || next === "%") return false;

  if (previous === ":") {
    const beforeColon = codePointBefore(text, start - 1);
    if (ASCII_HEX_CHARACTER.test(beforeColon) || beforeColon === ":" || beforeColon === ".") {
      return false;
    }
  }

  return true;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function createNameMatchers(namesToHide: readonly string[]): NameMatcher[] {
  const cleanedNames = namesToHide
    .map((name) => name.trim().replace(/\s+/gu, " "))
    .filter((name) => name.length > 0);

  if (cleanedNames.length > MAX_NAMES_TO_HIDE) {
    throw new RangeError(`Enter no more than ${MAX_NAMES_TO_HIDE} names to hide.`);
  }

  const matchers: NameMatcher[] = [];
  const seen = new Set<string>();

  for (const name of cleanedNames) {
    if (name.length > MAX_NAME_CODE_UNITS) {
      throw new RangeError(
        `Each name must be ${MAX_NAME_CODE_UNITS.toLocaleString("en-US")} characters or fewer.`,
      );
    }

    const normalizedValue = name.toLocaleLowerCase("en-US");
    if (seen.has(normalizedValue)) continue;
    seen.add(normalizedValue);

    const pieces = name.split(" ").map(escapeRegex);
    const characters = Array.from(name);
    const firstCharacter = characters[0] ?? "";
    const lastCharacter = characters.at(-1) ?? "";

    matchers.push({
      regex: new RegExp(pieces.join("[ \\t]+"), "giu"),
      normalizedValue,
      firstCharacterIsWord: isWordCharacter(firstCharacter),
      lastCharacterIsWord: isWordCharacter(lastCharacter),
    });
  }

  return matchers;
}

function collectEmails(text: string, candidates: Candidate[], offset = 0): void {
  // Scanning around each @ avoids the quadratic failure mode of a greedy
  // local-part regex on a long string that contains no @ character.
  const localCharacter = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]/iu;
  const domainCharacter = /[A-Z0-9.-]/iu;
  const atPattern = /@/gu;

  for (const atMatch of text.matchAll(atPattern)) {
    const atIndex = atMatch.index;
    let start = atIndex;
    while (start > 0 && atIndex - start < 65 && localCharacter.test(text[start - 1] ?? "")) {
      start -= 1;
    }

    let end = atIndex + 1;
    while (end < text.length && end - atIndex <= 190 && domainCharacter.test(text[end] ?? "")) {
      end += 1;
    }
    while (end > atIndex + 1 && text[end - 1] === ".") end -= 1;

    const surroundingQuote = text[start];
    if ((surroundingQuote === "'" || surroundingQuote === "`") && text[end] === surroundingQuote) {
      start += 1;
    }

    const raw = text.slice(start, end);
    if (!hasWordBoundaries(text, start, end)) continue;
    if (text[start - 1] === "@" || text[end] === "@") continue;
    if (raw.length > 254) continue;

    const relativeAtIndex = raw.lastIndexOf("@");
    const localPart = raw.slice(0, relativeAtIndex);
    const domain = raw.slice(relativeAtIndex + 1);
    if (
      localPart.length === 0 ||
      localPart.length > 64 ||
      localPart.startsWith(".") ||
      localPart.endsWith(".") ||
      localPart.includes("..")
    ) {
      continue;
    }

    const domainParts = domain.split(".");
    if (
      domainParts.length < 2 ||
      domainParts.some(
        (part) =>
          part.length === 0 || part.length > 63 || part.startsWith("-") || part.endsWith("-"),
      )
    ) {
      continue;
    }

    candidates.push({
      start: start + offset,
      end: end + offset,
      kind: "email",
      label: "Possible email address",
      confidence: "strong_match",
      normalizedValue: raw.toLocaleLowerCase("en-US"),
      reason: "This text follows a common email-address format.",
      placeholderLabel: "EMAIL",
      priority: 90,
    });
  }
}

function collectPhones(text: string, candidates: Candidate[], offset = 0): void {
  const phonePattern =
    /(?:\+?1[ .-]?)?(?:\([2-9]\d{2}\)|[2-9]\d{2})[ .-]?[2-9]\d{2}[ .-]?\d{4}(?:[ \t]*(?:x|ext\.?|extension)[ \t]*\d{1,6})?/giu;

  for (const match of text.matchAll(phonePattern)) {
    const raw = match[0];
    if (!raw) continue;

    const start = match.index;
    const end = start + raw.length;
    if (!hasWordBoundaries(text, start, end)) continue;

    const isFormatted = /[()+.\s-]/u.test(raw);
    candidates.push({
      start: start + offset,
      end: end + offset,
      kind: "phone",
      label: "Possible U.S. phone number",
      confidence: isFormatted ? "strong_match" : "review_suggested",
      normalizedValue: raw.replace(/\D/gu, ""),
      reason: "This text follows a common ten-digit U.S. phone-number format.",
      placeholderLabel: "PHONE",
      priority: 82,
    });
  }
}

function parseIpv4(value: string): string | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;

  const normalized: string[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/u.test(part)) return null;
    const number = Number(part);
    if (!Number.isInteger(number) || number < 0 || number > 255) return null;
    normalized.push(String(number));
  }

  return normalized.join(".");
}

function collectIpv4Addresses(text: string, candidates: Candidate[], offset = 0): void {
  const ipv4Pattern = /(?:\d{1,3}\.){3}\d{1,3}/gu;

  for (const match of text.matchAll(ipv4Pattern)) {
    const raw = match[0];
    if (!raw) continue;

    const start = match.index;
    const end = start + raw.length;
    if (!hasAddressBoundaries(text, start, end)) continue;

    const normalizedValue = parseIpv4(raw);
    if (!normalizedValue) continue;

    candidates.push({
      start: start + offset,
      end: end + offset,
      kind: "ipv4",
      label: "Possible IP address",
      confidence: "strong_match",
      normalizedValue,
      reason: "This text is a valid four-part IPv4 address.",
      placeholderLabel: "IP ADDRESS",
      priority: 73,
    });
  }
}

function parseIpv6(value: string): string | null {
  let address = value.toLocaleLowerCase("en-US");
  const zoneIndex = address.indexOf("%");
  let zone = "";

  if (zoneIndex >= 0) {
    zone = address.slice(zoneIndex);
    if (!/^%[0-9a-z_.-]{1,32}$/u.test(zone)) return null;
    address = address.slice(0, zoneIndex);
  }

  if (!address.includes(":")) return null;
  if ((address.match(/::/gu) ?? []).length > 1) return null;
  if (address.includes(":::")) return null;

  const hasCompression = address.includes("::");
  const sides = hasCompression ? address.split("::") : [address];
  if (sides.length > 2) return null;

  const left = sides[0] ? sides[0].split(":") : [];
  const right = hasCompression && sides[1] ? sides[1].split(":") : [];
  const groups = [...left, ...right];

  if (groups.some((group) => group.length === 0)) return null;

  let units = 0;
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    if (!group) return null;

    if (group.includes(".")) {
      if (index !== groups.length - 1 || !parseIpv4(group)) return null;
      units += 2;
      continue;
    }

    if (!/^[0-9a-f]{1,4}$/u.test(group)) return null;
    units += 1;
  }

  if (hasCompression ? units >= 8 : units !== 8) return null;
  return `${address}${zone}`;
}

function collectIpv6Addresses(text: string, candidates: Candidate[], offset = 0): void {
  // A simple character-class scan is linear. Validation below decides whether
  // the complete token is IPv6, avoiding partial matches inside invalid tokens.
  const ipv6Pattern = /[0-9A-Fa-f:.]+(?:%[0-9A-Za-z_.-]{1,32})?/gu;

  for (const match of text.matchAll(ipv6Pattern)) {
    let raw = match[0];
    if (!raw?.includes(":")) continue;

    let start = match.index;
    let end = start + raw.length;

    // A prose label such as "IP:2001:db8::1" contributes one leading colon
    // to the candidate. It is not part of the address.
    if (raw.startsWith(":") && !raw.startsWith("::")) {
      raw = raw.slice(1);
      start += 1;
    }
    while (raw.endsWith(".") && raw.length > 0) {
      raw = raw.slice(0, -1);
      end -= 1;
    }
    if (!raw) continue;

    if (!hasAddressBoundaries(text, start, end)) continue;

    const normalizedValue = parseIpv6(raw);
    if (!normalizedValue) continue;

    candidates.push({
      start: start + offset,
      end: end + offset,
      kind: "ipv6",
      label: "Possible IP address",
      confidence: "strong_match",
      normalizedValue,
      reason: "This text is a valid IPv6 address.",
      placeholderLabel: "IP ADDRESS",
      priority: 76,
    });
  }
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isValidDate(month: number, day: number, yearText: string | undefined): boolean {
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1) {
    return false;
  }

  let februaryDays = 29;
  if (yearText?.length === 4) {
    februaryDays = isLeapYear(Number(yearText)) ? 29 : 28;
  }

  const daysByMonth = [31, februaryDays, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (daysByMonth[month - 1] ?? 0);
}

function dateContext(text: string, start: number): { isBirthDate: boolean } {
  const prefix = text.slice(Math.max(0, start - 32), start);
  return {
    isBirthDate: /\b(?:dob|date of birth|birth date|born)[ \t]*[:=-]?[ \t]*$/iu.test(prefix),
  };
}

function addDateCandidate(
  text: string,
  candidates: Candidate[],
  start: number,
  raw: string,
  month: number,
  day: number,
  yearText: string | undefined,
): void {
  if (!isValidDate(month, day, yearText)) return;

  const { isBirthDate } = dateContext(text, start);
  const normalizedYear = yearText ?? "----";
  const normalizedValue = `${normalizedYear.padStart(4, "-")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  candidates.push({
    start,
    end: start + raw.length,
    kind: "date",
    label: isBirthDate ? "Possible date of birth" : "Possible date",
    confidence: isBirthDate ? "strong_match" : "review_suggested",
    normalizedValue,
    reason: isBirthDate
      ? "This valid date appears next to date-of-birth wording."
      : "This text follows a common date format; ordinary dates may also be highlighted.",
    placeholderLabel: isBirthDate ? "DATE OF BIRTH" : "DATE",
    priority: isBirthDate ? 55 : 40,
  });
}

function collectDates(text: string, candidates: Candidate[]): void {
  const isoPattern = /\b((?:1\d{3}|2\d{3}))[-/](\d{1,2})[-/](\d{1,2})(?!\d)/gu;
  for (const match of text.matchAll(isoPattern)) {
    const raw = match[0];
    const year = match[1];
    const month = match[2];
    const day = match[3];
    if (!raw || !year || !month || !day) continue;
    addDateCandidate(text, candidates, match.index, raw, Number(month), Number(day), year);
  }

  const usPattern = /\b(\d{1,2})[/-](\d{1,2})[/-]((?:\d{4}|\d{2}))\b/gu;
  for (const match of text.matchAll(usPattern)) {
    const raw = match[0];
    const month = match[1];
    const day = match[2];
    const year = match[3];
    if (!raw || !month || !day || !year) continue;
    addDateCandidate(text, candidates, match.index, raw, Number(month), Number(day), year);
  }

  const monthFirstPattern =
    /\b(January|February|March|April|May|June|July|August|September|Sept|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[ \t]+(\d{1,2})(?:st|nd|rd|th)?(?:(?:,[ \t]*|[ \t]+)((?:1\d{3}|2\d{3})))?\b/giu;
  for (const match of text.matchAll(monthFirstPattern)) {
    const raw = match[0];
    const monthName = match[1];
    const day = match[2];
    const year = match[3];
    if (!raw || !monthName || !day) continue;
    const month = MONTHS[monthName.toLocaleLowerCase("en-US")];
    if (!month) continue;
    addDateCandidate(text, candidates, match.index, raw, month, Number(day), year);
  }

  const dayFirstPattern =
    /\b(\d{1,2})(?:st|nd|rd|th)?[ \t]+(January|February|March|April|May|June|July|August|September|Sept|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:[ \t]+((?:1\d{3}|2\d{3})))?\b/giu;
  for (const match of text.matchAll(dayFirstPattern)) {
    const raw = match[0];
    const day = match[1];
    const monthName = match[2];
    const year = match[3];
    if (!raw || !day || !monthName) continue;
    const month = MONTHS[monthName.toLocaleLowerCase("en-US")];
    if (!month) continue;
    addDateCandidate(text, candidates, match.index, raw, month, Number(day), year);
  }
}

function passesLuhn(value: string): boolean {
  let sum = 0;
  let shouldDouble = false;

  for (let index = value.length - 1; index >= 0; index -= 1) {
    const digit = Number(value[index]);
    if (!Number.isInteger(digit)) return false;

    let contribution = digit;
    if (shouldDouble) {
      contribution *= 2;
      if (contribution > 9) contribution -= 9;
    }

    sum += contribution;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

function touchesAdjacentDigitSequence(text: string, start: number, end: number): boolean {
  const previous = text[start - 1] ?? "";
  const beforePrevious = text[start - 2] ?? "";
  const next = text[end] ?? "";
  const afterNext = text[end + 1] ?? "";

  const continuesOnLeft =
    /\d/u.test(previous) || (/[ -]/u.test(previous) && /\d/u.test(beforePrevious));
  const continuesOnRight = /\d/u.test(next) || (/[ -]/u.test(next) && /\d/u.test(afterNext));
  return continuesOnLeft || continuesOnRight;
}

function collectPaymentCards(text: string, candidates: Candidate[], offset = 0): void {
  const cardPattern = /\d(?:[ -]?\d){12,18}/gu;

  for (const match of text.matchAll(cardPattern)) {
    const raw = match[0];
    if (!raw) continue;

    const start = match.index;
    const end = start + raw.length;
    if (touchesAdjacentDigitSequence(text, start, end)) continue;
    if (!hasWordBoundaries(text, start, end)) continue;

    const digits = raw.replace(/[ -]/gu, "");
    if (digits.length < 13 || digits.length > 19) continue;
    if (/^(\d)\1+$/u.test(digits)) continue;
    if (!passesLuhn(digits)) continue;

    candidates.push({
      start: start + offset,
      end: end + offset,
      kind: "payment_card",
      label: "Possible payment-card number",
      confidence: "strong_match",
      normalizedValue: digits,
      reason: "This 13–19 digit number passes the payment-card checksum.",
      placeholderLabel: "PAYMENT CARD",
      priority: 95,
    });
  }
}

function accountDescriptor(cue: string): {
  label: string;
  placeholderLabel: string;
} {
  switch (cue) {
    case "account":
    case "acct":
      return { label: "Possible account number", placeholderLabel: "ACCOUNT NUMBER" };
    case "order":
      return { label: "Possible order number", placeholderLabel: "ORDER NUMBER" };
    case "confirmation":
      return { label: "Possible confirmation code", placeholderLabel: "CONFIRMATION CODE" };
    case "reference":
    case "ref":
      return { label: "Possible reference number", placeholderLabel: "REFERENCE NUMBER" };
    case "case":
      return { label: "Possible case number", placeholderLabel: "CASE NUMBER" };
    case "ticket":
      return { label: "Possible ticket number", placeholderLabel: "TICKET NUMBER" };
    case "invoice":
      return { label: "Possible invoice number", placeholderLabel: "INVOICE NUMBER" };
    case "claim":
      return { label: "Possible claim number", placeholderLabel: "CLAIM NUMBER" };
    case "member":
      return { label: "Possible member number", placeholderLabel: "MEMBER NUMBER" };
    case "customer":
      return { label: "Possible customer number", placeholderLabel: "CUSTOMER NUMBER" };
    case "tracking":
      return { label: "Possible tracking number", placeholderLabel: "TRACKING NUMBER" };
    default:
      return { label: "Possible private number", placeholderLabel: "PRIVATE NUMBER" };
  }
}

function collectAccountReferences(text: string, candidates: Candidate[]): void {
  const cuePattern =
    /\b(account|acct|order|confirmation|reference|ref|case|ticket|invoice|claim|member|customer|tracking)[ \t]*(?:(number|no\.?|id|code)[ \t]*)?(?:[:#=-]{1,2}[ \t]*)?/giu;

  for (const cueMatch of text.matchAll(cuePattern)) {
    const fullCue = cueMatch[0];
    const cue = cueMatch[1]?.toLocaleLowerCase("en-US");
    if (!fullCue || !cue) continue;

    const valueStart = cueMatch.index + fullCue.length;
    const remaining = text.slice(valueStart, Math.min(text.length, valueStart + 48));
    const groupedMatch = /^\d{2,6}(?:[ -]\d{2,6}){1,5}/u.exec(remaining)?.[0];
    const compactMatch = /^[A-Z0-9][A-Z0-9_-]{2,31}/iu.exec(remaining)?.[0];
    const matchedValue =
      groupedMatch && groupedMatch.length >= (compactMatch?.length ?? 0)
        ? groupedMatch
        : compactMatch;
    if (!matchedValue) continue;

    const raw = matchedValue.replace(/[ _-]+$/u, "");
    if (raw.length < 3 || !/\d/u.test(raw)) continue;

    const end = valueStart + raw.length;
    const next = text[end] ?? "";
    if (/[\p{L}\p{N}_-]/u.test(next)) continue;

    const descriptor = accountDescriptor(cue);
    candidates.push({
      start: valueStart,
      end,
      kind: "account_reference",
      label: descriptor.label,
      confidence: "strong_match",
      normalizedValue: raw.toLocaleUpperCase("en-US").replace(/[ -]/gu, ""),
      reason: `This identifier appears immediately after the “${cue}” label.`,
      placeholderLabel: descriptor.placeholderLabel,
      priority: 88,
    });
  }
}

function collectCustomNames(
  text: string,
  nameMatchers: readonly NameMatcher[],
  candidates: Candidate[],
  offset = 0,
): void {
  for (const matcher of nameMatchers) {
    for (const match of text.matchAll(matcher.regex)) {
      const raw = match[0];
      if (!raw) continue;

      const start = match.index;
      const end = start + raw.length;
      if (matcher.firstCharacterIsWord && isWordCharacter(codePointBefore(text, start))) continue;
      if (matcher.lastCharacterIsWord && isWordCharacter(codePointAt(text, end))) continue;

      candidates.push({
        start: start + offset,
        end: end + offset,
        kind: "custom_name",
        label: "Name you asked us to hide",
        confidence: "strong_match",
        normalizedValue: matcher.normalizedValue,
        reason: "This text matches a name you explicitly asked the tool to hide.",
        placeholderLabel: "NAME",
        priority: 65,
      });
    }
  }
}

function normalizeParameterKey(key: string): string {
  let decoded = key.replace(/\+/gu, " ");
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // A malformed escape should remain inspectable rather than aborting the scan.
  }

  return decoded
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
}

function parameterKeyConfidence(key: string): FindingConfidence | null {
  const normalized = normalizeParameterKey(key);
  if (!normalized) return null;

  if (
    STRONG_SENSITIVE_PARAMETER_KEYS.has(normalized) ||
    STRONG_SENSITIVE_PARAMETER_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  ) {
    return "strong_match";
  }

  return REVIEW_SENSITIVE_PARAMETER_KEYS.has(normalized) ? "review_suggested" : null;
}

function valueContainsSensitiveData(value: string, nameMatchers: readonly NameMatcher[]): boolean {
  const candidates: Candidate[] = [];
  collectEmails(value, candidates);
  if (candidates.length > 0) return true;
  collectPhones(value, candidates);
  if (candidates.length > 0) return true;
  collectIpv6Addresses(value, candidates);
  if (candidates.length > 0) return true;
  collectIpv4Addresses(value, candidates);
  if (candidates.length > 0) return true;
  collectPaymentCards(value, candidates);
  if (candidates.length > 0) return true;
  collectCustomNames(value, nameMatchers, candidates);
  return candidates.length > 0;
}

function inspectParameters(
  parameters: URLSearchParams,
  nameMatchers: readonly NameMatcher[],
): UrlAssessment | null {
  let assessment: UrlAssessment | null = null;

  parameters.forEach((value, key) => {
    if (!value || assessment?.confidence === "strong_match") return;

    const keyConfidence = parameterKeyConfidence(key);
    if (keyConfidence === "strong_match") {
      assessment = {
        confidence: "strong_match",
        reason: "This link contains a query or fragment field commonly used for private data.",
      };
      return;
    }

    if (valueContainsSensitiveData(value, nameMatchers)) {
      assessment = {
        confidence: "strong_match",
        reason: "This link contains a query or fragment value matching private information.",
      };
      return;
    }

    if (keyConfidence === "review_suggested" && !assessment) {
      assessment = {
        confidence: "review_suggested",
        reason: "This link contains a query or fragment field that may hold a private value.",
      };
    }
  });

  return assessment;
}

function assessUrl(raw: string, nameMatchers: readonly NameMatcher[]): UrlAssessment | null {
  let parsed: URL;
  try {
    parsed = new URL(raw.toLocaleLowerCase("en-US").startsWith("www.") ? `https://${raw}` : raw);
  } catch {
    return null;
  }

  if (parsed.username || parsed.password) {
    return {
      confidence: "strong_match",
      reason: "This link contains sign-in information before its host name.",
    };
  }

  const queryAssessment = inspectParameters(parsed.searchParams, nameMatchers);
  if (queryAssessment?.confidence === "strong_match") return queryAssessment;

  let fragmentAssessment: UrlAssessment | null = null;
  const fragment = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;
  if (fragment.includes("=")) {
    const queryLikeFragment = fragment.includes("?")
      ? fragment.slice(fragment.indexOf("?") + 1)
      : fragment;
    fragmentAssessment = inspectParameters(new URLSearchParams(queryLikeFragment), nameMatchers);
  }

  if (fragmentAssessment?.confidence === "strong_match") return fragmentAssessment;
  return queryAssessment ?? fragmentAssessment;
}

function trimUrlEnd(text: string, start: number, proposedEnd: number): number {
  let end = proposedEnd;

  while (end > start && /[.,;!?]/u.test(text[end - 1] ?? "")) end -= 1;

  const pairs = [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ] as const;

  for (const [opening, closing] of pairs) {
    while (end > start && text[end - 1] === closing) {
      const value = text.slice(start, end);
      const openings = value.split(opening).length - 1;
      const closings = value.split(closing).length - 1;
      if (closings <= openings) break;
      end -= 1;
    }
  }

  return end;
}

function collectPrivateUrls(
  text: string,
  nameMatchers: readonly NameMatcher[],
  candidates: Candidate[],
): void {
  const urlStartPattern = /\b(?:https?:\/\/|www\.)/giu;
  let match = urlStartPattern.exec(text);

  while (match) {
    const start = match.index;
    let end = start + match[0].length;
    while (end < text.length && !URL_STOP_CHARACTER.test(text[end] ?? "")) end += 1;
    end = trimUrlEnd(text, start, end);

    const raw = text.slice(start, end);
    const assessment = assessUrl(raw, nameMatchers);
    if (assessment) {
      candidates.push({
        start,
        end,
        kind: "private_url",
        label: "Link containing possible private data",
        confidence: assessment.confidence,
        normalizedValue: raw,
        reason: assessment.reason,
        placeholderLabel: "PRIVATE LINK",
        priority: 100,
      });
    }

    urlStartPattern.lastIndex = Math.max(urlStartPattern.lastIndex, end);
    match = urlStartPattern.exec(text);
  }
}

function resolveOverlaps(candidates: readonly Candidate[], textLength: number): Candidate[] {
  const uniqueCandidates = new Map<string, Candidate>();
  for (const candidate of candidates) {
    if (candidate.start < 0 || candidate.end <= candidate.start || candidate.end > textLength) {
      continue;
    }
    const key = `${candidate.kind}:${candidate.start}:${candidate.end}`;
    const existing = uniqueCandidates.get(key);
    if (!existing || candidate.priority > existing.priority) uniqueCandidates.set(key, candidate);
  }

  const ranked = [...uniqueCandidates.values()].sort((left, right) => {
    if (left.priority !== right.priority) return right.priority - left.priority;
    if (left.confidence !== right.confidence) {
      return left.confidence === "strong_match" ? -1 : 1;
    }
    const lengthDifference = right.end - right.start - (left.end - left.start);
    if (lengthDifference !== 0) return lengthDifference;
    return left.start - right.start;
  });

  const occupied = new Uint8Array(textLength);
  const accepted: Candidate[] = [];

  for (const candidate of ranked) {
    let intersects = false;
    for (let index = candidate.start; index < candidate.end; index += 1) {
      if (occupied[index] === 1) {
        intersects = true;
        break;
      }
    }
    if (intersects) continue;

    occupied.fill(1, candidate.start, candidate.end);
    accepted.push(candidate);
  }

  return accepted.sort((left, right) => left.start - right.start || left.end - right.end);
}

function reservedPlaceholderNumbers(text: string, label: string): Set<number> {
  const numbers = new Set<number>();
  const pattern = new RegExp(`\\[${escapeRegex(label)} ([1-9]\\d{0,5})\\]`, "giu");

  for (const match of text.matchAll(pattern)) {
    const numberText = match[1];
    if (numberText) numbers.add(Number(numberText));
  }

  return numbers;
}

function findingsFromCandidates(text: string, candidates: readonly Candidate[]): Finding[] {
  const labels = new Set(candidates.map((candidate) => candidate.placeholderLabel));
  const reservedByLabel = new Map<string, Set<number>>();
  const nextNumberByLabel = new Map<string, number>();
  const replacementByValue = new Map<string, string>();

  for (const label of labels) {
    reservedByLabel.set(label, reservedPlaceholderNumbers(text, label));
    nextNumberByLabel.set(label, 1);
  }

  return candidates.map((candidate) => {
    const valueKey = `${candidate.placeholderLabel}\u0000${candidate.normalizedValue}`;
    let replacement = replacementByValue.get(valueKey);

    if (!replacement) {
      const reserved = reservedByLabel.get(candidate.placeholderLabel) ?? new Set<number>();
      let nextNumber = nextNumberByLabel.get(candidate.placeholderLabel) ?? 1;
      while (reserved.has(nextNumber)) nextNumber += 1;
      reserved.add(nextNumber);
      nextNumberByLabel.set(candidate.placeholderLabel, nextNumber + 1);
      replacement = `[${candidate.placeholderLabel} ${nextNumber}]`;
      replacementByValue.set(valueKey, replacement);
    }

    return {
      id: `${candidate.kind}:${candidate.start}:${candidate.end}`,
      start: candidate.start,
      end: candidate.end,
      kind: candidate.kind,
      label: candidate.label,
      replacement,
      confidence: candidate.confidence,
      normalizedValue: candidate.normalizedValue,
      reason: candidate.reason,
    };
  });
}

/**
 * Finds possible private information without sending or storing any input.
 * Generic dates and ambiguous URL fields remain review suggestions rather
 * than claims that the matched text is definitely private.
 */
export function scanSensitiveText(text: string, namesToHide: readonly string[] = []): Finding[] {
  assertTextWithinLimit(text);
  const nameMatchers = createNameMatchers(namesToHide);
  const candidates: Candidate[] = [];

  collectPrivateUrls(text, nameMatchers, candidates);
  collectPaymentCards(text, candidates);
  collectEmails(text, candidates);
  collectAccountReferences(text, candidates);
  collectPhones(text, candidates);
  collectIpv6Addresses(text, candidates);
  collectIpv4Addresses(text, candidates);
  collectCustomNames(text, nameMatchers, candidates);
  collectDates(text, candidates);

  return findingsFromCandidates(text, resolveOverlaps(candidates, text.length));
}

/** Applies only the selected, already-resolved findings to the original text. */
export function maskSelectedFindings(
  text: string,
  findings: readonly Finding[],
  selectedIds: ReadonlySet<string>,
): string {
  assertTextWithinLimit(text);

  const selected = findings
    .filter((finding) => selectedIds.has(finding.id))
    .sort((left, right) => left.start - right.start || left.end - right.end);

  const pieces: string[] = [];
  let cursor = 0;

  for (const finding of selected) {
    if (
      !Number.isInteger(finding.start) ||
      !Number.isInteger(finding.end) ||
      finding.start < cursor ||
      finding.end <= finding.start ||
      finding.end > text.length
    ) {
      throw new RangeError("Findings must be valid, non-overlapping ranges in the original text.");
    }

    pieces.push(text.slice(cursor, finding.start), finding.replacement);
    cursor = finding.end;
  }

  pieces.push(text.slice(cursor));
  return pieces.join("");
}
