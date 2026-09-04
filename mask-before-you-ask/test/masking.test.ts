import { describe, expect, it } from "vitest";

import {
  MAX_INPUT_CODE_UNITS,
  MAX_NAME_CODE_UNITS,
  MAX_NAMES_TO_HIDE,
  type Finding,
  type FindingKind,
} from "../src/shared/contracts";
import { maskSelectedFindings, scanSensitiveText } from "../src/shared/masking";

function findingsOfKind(
  text: string,
  kind: FindingKind,
  namesToHide: readonly string[] = [],
): Finding[] {
  return scanSensitiveText(text, namesToHide).filter((finding) => finding.kind === kind);
}

function maskAll(text: string, namesToHide: readonly string[] = []): string {
  const findings = scanSensitiveText(text, namesToHide);
  return maskSelectedFindings(text, findings, new Set(findings.map((finding) => finding.id)));
}

describe("scanSensitiveText", () => {
  describe("email addresses", () => {
    it("finds common addresses while preserving surrounding punctuation", () => {
      const text = "Email ana+jobs@example.co.uk, then try ADMIN@EXAMPLE.COM.";
      const findings = findingsOfKind(text, "email");

      expect(findings).toHaveLength(2);
      expect(findings.map((finding) => text.slice(finding.start, finding.end))).toEqual([
        "ana+jobs@example.co.uk",
        "ADMIN@EXAMPLE.COM",
      ]);
      expect(maskAll(text)).toBe("Email [EMAIL 1], then try [EMAIL 2].");
    });

    it.each(["a..b@example.com", "foo@localhost", ".ana@example.com"])(
      "rejects the invalid candidate %s",
      (text) => {
        expect(findingsOfKind(text, "email")).toEqual([]);
      },
    );

    it("does not extract an ASCII-looking address from a larger Unicode word", () => {
      expect(findingsOfKind("éana@example.com", "email")).toEqual([]);
    });

    it("preserves quotation marks around an address", () => {
      expect(maskAll("Email 'ana@example.com'.")).toBe("Email '[EMAIL 1]'.");
      expect(maskAll("Email `ana@example.com`.")).toBe("Email `[EMAIL 1]`.");
    });
  });

  describe("U.S. phone numbers", () => {
    it.each(["(312) 555-0198", "312.555.0198", "+1 312-555-0198 ext. 204", "3125550198"])(
      "finds %s",
      (text) => {
        const finding = findingsOfKind(text, "phone")[0];
        expect(finding).toBeDefined();
        expect(maskAll(text)).toBe("[PHONE 1]");
      },
    );

    it.each(["123-456-7890", "555-0198", "A3125550198B"])(
      "rejects the ambiguous or invalid candidate %s",
      (text) => {
        expect(findingsOfKind(text, "phone")).toEqual([]);
      },
    );

    it("marks an unformatted ten-digit candidate for review", () => {
      expect(findingsOfKind("3125550198", "phone")[0]?.confidence).toBe("review_suggested");
    });
  });

  describe("IP addresses", () => {
    it.each(["192.168.1.42", "127.0.0.1", "255.255.255.255"])(
      "finds the valid IPv4 address %s",
      (text) => {
        expect(findingsOfKind(text, "ipv4")).toHaveLength(1);
      },
    );

    it.each(["256.1.2.3", "v1.2.3.4"])("rejects the invalid IPv4 candidate %s", (text) => {
      expect(findingsOfKind(text, "ipv4")).toEqual([]);
    });

    it.each(["2001:db8::1", "::1", "fe80::1%en0", "2001:0db8:85a3:0000:0000:8a2e:0370:7334"])(
      "finds the valid IPv6 address %s",
      (text) => {
        expect(findingsOfKind(text, "ipv6")).toHaveLength(1);
        expect(maskAll(text)).toBe("[IP ADDRESS 1]");
      },
    );

    it.each(["12:30", "2001:::1", "1:2:3:4:5:6:7:8:9"])(
      "rejects the invalid IPv6 candidate %s without accepting a partial address",
      (text) => {
        expect(findingsOfKind(text, "ipv6")).toEqual([]);
      },
    );

    it("treats an IPv4-mapped address as one IPv6 finding", () => {
      const findings = scanSensitiveText("::ffff:192.0.2.128");
      expect(findings).toHaveLength(1);
      expect(findings[0]?.kind).toBe("ipv6");
      expect(maskAll("::ffff:192.0.2.128")).toBe("[IP ADDRESS 1]");
    });
  });

  describe("dates", () => {
    it.each([
      "09/03/2026",
      "9/3/26",
      "2026-09-03",
      "September 3, 2026",
      "3 Sep 2026",
      "September 3",
    ])("finds the valid date %s as a review suggestion", (text) => {
      const finding = findingsOfKind(text, "date")[0];
      expect(finding).toBeDefined();
      expect(finding?.confidence).toBe("review_suggested");
    });

    it.each(["02/30/2026", "02/29/2023", "13/01/2026", "12:30", "2026"])(
      "rejects the invalid or unsupported date %s",
      (text) => {
        expect(findingsOfKind(text, "date")).toEqual([]);
      },
    );

    it("validates leap days and recognizes explicit birth-date context", () => {
      const finding = findingsOfKind("DOB: 02/29/2024", "date")[0];
      expect(finding).toMatchObject({
        label: "Possible date of birth",
        confidence: "strong_match",
        replacement: "[DATE OF BIRTH 1]",
      });
    });

    it("masks only the date portion of an ISO timestamp", () => {
      expect(maskAll("At 2026-09-03T14:30")).toBe("At [DATE 1]T14:30");
    });
  });

  describe("account, order, and reference identifiers", () => {
    it.each([
      ["Account #: 000123456789", "[ACCOUNT NUMBER 1]"],
      ["Order ID AB-12345", "[ORDER NUMBER 1]"],
      ["Reference: ZX9-44", "[REFERENCE NUMBER 1]"],
      ["Invoice #123", "[INVOICE NUMBER 1]"],
      ["Confirmation code X7Q9AB", "[CONFIRMATION CODE 1]"],
      ["Account number: 12 3456 7890", "[ACCOUNT NUMBER 1]"],
    ])("finds the contextual value in %s", (text, replacement) => {
      const finding = findingsOfKind(text, "account_reference")[0];
      expect(finding).toBeDefined();
      expect(maskAll(text)).toContain(replacement);
      expect(maskAll(text)).toContain(text.slice(0, finding?.start));
    });

    it.each(["My account is active", "Order today", "Reference material", "9384756"])(
      "does not guess an identifier in %s",
      (text) => {
        expect(findingsOfKind(text, "account_reference")).toEqual([]);
      },
    );
  });

  describe("payment-card-like candidates", () => {
    it.each(["4111 1111 1111 1111", "378282246310005", "5555-5555-5555-4444"])(
      "finds the Luhn-valid candidate %s",
      (text) => {
        const finding = findingsOfKind(text, "payment_card")[0];
        expect(finding).toMatchObject({
          label: "Possible payment-card number",
          replacement: "[PAYMENT CARD 1]",
        });
      },
    );

    it.each([
      "4111111111111112",
      "0000000000000000",
      "411111111111",
      "41111111111111111111",
      "X4111111111111111Y",
    ])("rejects the non-card candidate %s", (text) => {
      expect(findingsOfKind(text, "payment_card")).toEqual([]);
    });
  });

  describe("user-selected names", () => {
    it("matches names literally, case-insensitively, and at Unicode-aware boundaries", () => {
      const text = "Ann met ANN, Anna, José, JOSÉ, and A+B.";
      const findings = findingsOfKind(text, "custom_name", ["Ann", "José", "A+B"]);

      expect(findings).toHaveLength(5);
      expect(maskAll(text, ["Ann", "José", "A+B"])).toBe(
        "[NAME 1] met [NAME 1], Anna, [NAME 2], [NAME 2], and [NAME 3].",
      );
    });

    it("accepts ordinary spacing differences in a multiword name", () => {
      expect(maskAll("Mary\tJane arrived.", ["Mary Jane"])).toBe("[NAME 1] arrived.");
    });

    it("ignores empty and duplicate name entries", () => {
      const findings = findingsOfKind("Ana met ANA.", "custom_name", ["", " Ana ", "ana"]);
      expect(findings).toHaveLength(2);
      expect(new Set(findings.map((finding) => finding.replacement))).toEqual(
        new Set(["[NAME 1]"]),
      );
    });
  });

  describe("links with possible private data", () => {
    it.each([
      "https://example.com/reset?token=abc&page=2",
      "https://example.com/?q=ana%40example.com",
      "https://example.com/#access_token=abc&state=xyz",
      "https://user:password@example.com/private",
      "www.example.com/path?card_number=4111111111111111",
    ])("masks the complete private link %s", (text) => {
      const finding = findingsOfKind(text, "private_url")[0];
      expect(finding).toBeDefined();
      expect(maskAll(text)).toBe("[PRIVATE LINK 1]");
    });

    it("uses user-selected names when checking decoded query values", () => {
      const text = "https://example.com/?q=Ana%20Garza";
      expect(findingsOfKind(text, "private_url", ["Ana Garza"])).toHaveLength(1);
    });

    it.each([
      "https://example.com/?page=2&theme=dark",
      "https://example.com/?monkey=abc",
      "https://example.com/?utm_source=newsletter",
    ])("leaves the ordinary link %s alone", (text) => {
      expect(findingsOfKind(text, "private_url")).toEqual([]);
      expect(maskAll(text)).toBe(text);
    });

    it("does not include sentence punctuation in a private-link range", () => {
      expect(maskAll("Open https://example.com/?token=abc, then continue.")).toBe(
        "Open [PRIVATE LINK 1], then continue.",
      );
    });

    it("handles malformed percent escapes without throwing", () => {
      const text = "https://example.com/?token=%E0%A4%A";
      expect(() => scanSensitiveText(text)).not.toThrow();
      expect(maskAll(text)).toBe("[PRIVATE LINK 1]");
    });

    it("marks ambiguous code parameters for review without asserting certainty", () => {
      const finding = findingsOfKind("https://example.com/?code=spring-sale", "private_url")[0];
      expect(finding?.confidence).toBe("review_suggested");
    });
  });

  describe("overlap resolution", () => {
    it("prefers a complete email over a selected name inside it", () => {
      const findings = scanSensitiveText("ana@example.com", ["Ana"]);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.kind).toBe("email");
    });

    it("prefers a Luhn-valid card over an account-number interpretation", () => {
      const findings = scanSensitiveText("Account: 4111111111111111");
      expect(findings).toHaveLength(1);
      expect(findings[0]?.kind).toBe("payment_card");
      expect(maskAll("Account: 4111111111111111")).toBe("Account: [PAYMENT CARD 1]");
    });

    it("prefers an immediate account cue over an unformatted phone interpretation", () => {
      const findings = scanSensitiveText("Account: 3125550198");
      expect(findings).toHaveLength(1);
      expect(findings[0]?.kind).toBe("account_reference");
    });

    it("prefers a complete order identifier over a date inside it", () => {
      const findings = scanSensitiveText("Order ID 2026-09-03-ABC");
      expect(findings).toHaveLength(1);
      expect(findings[0]?.kind).toBe("account_reference");
      expect(maskAll("Order ID 2026-09-03-ABC")).toBe("Order ID [ORDER NUMBER 1]");
    });

    it("prefers a complete private link over nested findings", () => {
      const text = "https://192.168.1.5/?email=ana@example.com";
      const findings = scanSensitiveText(text);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.kind).toBe("private_url");
    });
  });

  describe("placeholder assignment", () => {
    it("reuses a placeholder for repeated normalized values", () => {
      const text = "ANA@EXAMPLE.COM then ana@example.com";
      const findings = findingsOfKind(text, "email");
      expect(findings.map((finding) => finding.replacement)).toEqual(["[EMAIL 1]", "[EMAIL 1]"]);
    });

    it("reserves placeholders already present in the original text", () => {
      const text = "Prior: [EMAIL 1]. New: ana@example.com";
      expect(findingsOfKind(text, "email")[0]?.replacement).toBe("[EMAIL 2]");
      expect(maskAll(text)).toBe("Prior: [EMAIL 1]. New: [EMAIL 2]");
    });

    it("returns deterministic, ordered, non-overlapping findings", () => {
      const text = "Ana, 312-555-0198, ana@example.com";
      const first = scanSensitiveText(text, ["Ana"]);
      const second = scanSensitiveText(text, ["Ana"]);

      expect(second).toEqual(first);
      for (let index = 1; index < first.length; index += 1) {
        expect(first[index]?.start).toBeGreaterThanOrEqual(first[index - 1]?.end ?? 0);
      }
    });
  });
});

describe("maskSelectedFindings", () => {
  it("applies only selected findings without changing punctuation or spacing", () => {
    const text = "Email ana@example.com; call 312-555-0198.";
    const findings = scanSensitiveText(text);
    const email = findings.find((finding) => finding.kind === "email");
    expect(email).toBeDefined();

    const output = maskSelectedFindings(text, findings, new Set(email ? [email.id] : []));
    expect(output).toBe("Email [EMAIL 1]; call 312-555-0198.");
  });

  it("removes every selected raw value in a representative privacy pass", () => {
    const text = [
      "Ana Garza",
      "ana@example.com",
      "312-555-0198",
      "192.168.1.42",
      "DOB: 09/03/1990",
      "Order ID RG-90210",
      "4111 1111 1111 1111",
      "https://example.com/reset?token=secret",
    ].join(" | ");

    const output = maskAll(text, ["Ana Garza"]);
    for (const privateValue of [
      "Ana Garza",
      "ana@example.com",
      "312-555-0198",
      "192.168.1.42",
      "09/03/1990",
      "RG-90210",
      "4111 1111 1111 1111",
      "token=secret",
    ]) {
      expect(output).not.toContain(privateValue);
    }

    expect(output).toContain("[NAME 1]");
    expect(output).toContain("[EMAIL 1]");
    expect(output).toContain("[PHONE 1]");
    expect(output).toContain("[IP ADDRESS 1]");
    expect(output).toContain("[DATE OF BIRTH 1]");
    expect(output).toContain("[ORDER NUMBER 1]");
    expect(output).toContain("[PAYMENT CARD 1]");
    expect(output).toContain("[PRIVATE LINK 1]");
  });

  it("is idempotent after rescanning an already masked result", () => {
    const first = maskAll("Ana: ana@example.com, 312-555-0198", ["Ana"]);
    const second = maskAll(first, ["Ana"]);
    expect(second).toBe(first);
  });

  it("uses UTF-16 offsets safely around emoji and leaves HTML-looking text inert", () => {
    const text = "😀 Ana, ana@example.com. <script>alert(1)</script>";
    expect(maskAll(text, ["Ana"])).toBe("😀 [NAME 1], [EMAIL 1]. <script>alert(1)</script>");
  });

  it("rejects forged overlapping or out-of-range findings", () => {
    const finding: Finding = {
      id: "forged",
      start: 0,
      end: 99,
      kind: "custom_name",
      label: "Name you asked us to hide",
      replacement: "[NAME 1]",
      confidence: "strong_match",
      normalizedValue: "ana",
      reason: "test",
    };

    expect(() => maskSelectedFindings("Ana", [finding], new Set([finding.id]))).toThrow(RangeError);
  });
});

describe("bounded and robust processing", () => {
  it("accepts exactly 50,000 UTF-16 code units and scans the end", () => {
    const suffix = " ana@example.com";
    const text = `${"x".repeat(MAX_INPUT_CODE_UNITS - suffix.length)}${suffix}`;
    expect(text).toHaveLength(MAX_INPUT_CODE_UNITS);
    expect(findingsOfKind(text, "email")).toHaveLength(1);
  });

  it("rejects over-limit text instead of returning an unsafe partial scan", () => {
    const text = "x".repeat(MAX_INPUT_CODE_UNITS + 1);
    expect(() => scanSensitiveText(text)).toThrow(RangeError);
    expect(() => maskSelectedFindings(text, [], new Set())).toThrow(RangeError);
  });

  it("bounds custom-name count and length instead of silently ignoring names", () => {
    expect(() =>
      scanSensitiveText(
        "text",
        Array.from({ length: MAX_NAMES_TO_HIDE + 1 }, (_, index) => `Person ${index}`),
      ),
    ).toThrow(RangeError);
    expect(() => scanSensitiveText("text", ["x".repeat(MAX_NAME_CODE_UNITS + 1)])).toThrow(
      RangeError,
    );
  });

  it.each(["1", ":", "@", "a"])(
    "handles a maximum-length run of %s without throwing or inventing a partial finding",
    (character) => {
      const text = character.repeat(MAX_INPUT_CODE_UNITS);
      expect(() => scanSensitiveText(text)).not.toThrow();
    },
  );
});
