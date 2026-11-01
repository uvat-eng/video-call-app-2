import { b64, unb64, type Vault } from "@/lib/e2e";

type Bio = { id: string };

export async function biometricAvailable() {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function biometricLabel() {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "Face ID / Touch ID";
  if (/mac os/i.test(ua)) return "Touch ID";
  if (/android/i.test(ua)) return "отпечаток пальца";
  return "биометрию";
}

export async function biometricEnabled(vault: Vault) {
  return !!(await vault.get<Bio>("biometric"));
}

export async function enableBiometric(vault: Vault, user: { id: number; name: string; phone: string }) {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "RuChat" },
      user: {
        id: new TextEncoder().encode(`rusapp-${user.id}`),
        name: user.phone,
        displayName: user.name,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "discouraged",
      },
      timeout: 60000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Не удалось включить");
  await vault.set("biometric", { id: b64(cred.rawId) });
}

export async function disableBiometric(vault: Vault) {
  await vault.set("biometric", null);
}

export async function verifyBiometric(vault: Vault) {
  const bio = await vault.get<Bio>("biometric");
  if (!bio) return false;
  const res = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: "public-key", id: unb64(bio.id), transports: ["internal"] }],
      userVerification: "required",
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;
  if (!res) return false;
  const flags = new Uint8Array((res.response as AuthenticatorAssertionResponse).authenticatorData)[32];
  return (flags & 0x04) !== 0;
}
