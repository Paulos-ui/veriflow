// =============================================================================
// Base58, the Bitcoin alphabet — the encoding Solana uses for every address,
// keypair and transaction signature.
//
// Hand-written because `@solana/web3.js` is not a dependency of this project and
// pulling a whole SDK in to get thirty lines of arithmetic would be a poor trade.
// The algorithm is the standard one: treat the bytes as a big base-256 number
// and repeatedly divide by 58, then re-attach one leading '1' per leading zero
// byte, which base conversion would otherwise lose.
//
// Pure module. No credentials, no I/O, no node built-ins — the client imports
// `shorten` to display an address, and gets no crypto in the bundle with it.
// =============================================================================

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const INDEX: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) INDEX[ALPHABET[i]] = i;

export function encodeBase58(bytes: Uint8Array): string {
  if (!bytes.length) return "";

  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  // Leading zero bytes carry no value but do carry meaning in an address.
  let out = "";
  for (const byte of bytes) {
    if (byte !== 0) break;
    out += ALPHABET[0];
  }
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]];
  return out;
}

/** Returns null on any character outside the alphabet — never a partial decode. */
export function decodeBase58(text: string): Uint8Array | null {
  if (!text.length) return new Uint8Array(0);

  const bytes: number[] = [0];
  for (const char of text) {
    const value = INDEX[char];
    if (value === undefined) return null;

    let carry = value;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  let zeros = 0;
  for (const char of text) {
    if (char !== ALPHABET[0]) break;
    zeros++;
  }

  const out = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) out[zeros + i] = bytes[bytes.length - 1 - i];
  return out;
}

/** `9WzDXw…mRUWq` — addresses and signatures, short enough to read. */
export function shorten(value: string, head = 6, tail = 5): string {
  return value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
}
