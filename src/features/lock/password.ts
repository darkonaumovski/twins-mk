/**
 * The family password, stored only as a salted PBKDF2 hash: the source code is
 * public, so the password itself must not appear in it. To change it, put a
 * new salt and hash here (the README shows the one-line command).
 *
 * This is a privacy screen against someone picking up an unlocked phone. The
 * data in the phone's storage is not encrypted with it.
 */
const SALT = 'f4a88bc392bebd4986288036f70de859';
const HASH = '99f0681655e62423a0ee6ed055ed23429b89687a54fc777b8e81d2cd85d8632c';
const ITERATIONS = 210_000;

const fromHex = (hex: string) => new Uint8Array(hex.match(/../g)!.map((b) => parseInt(b, 16)));
const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

/** WebCrypto only exists on https (and localhost), which is where the app runs. */
export function canCheckPassword() {
  return typeof crypto !== 'undefined' && typeof crypto.subtle?.deriveBits === 'function';
}

export async function checkPassword(input: string): Promise<boolean> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(input), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(SALT), iterations: ITERATIONS }, key, 256);
  return toHex(bits) === HASH;
}
