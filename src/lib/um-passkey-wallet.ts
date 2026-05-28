/**
 * UnitMetal Passkey Wallet
 *
 */

// evm
import { mnemonicToAccount } from "viem/accounts"
import { Mnemonic, Keystore, Bytes } from "ox"
import type { UmKeystore } from "@/types/wallet"

/**
 * Use WebAuthn to store authentication-protected arbitrary bytes
 *
 * @param name user-friendly name for the data
 * @param data arbitrary data of 64 bytes or less
 * @returns handle to the data
 */
async function createOrThrow(name: string, data: Uint8Array<ArrayBuffer>) {
  try {
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: new Uint8Array([117, 61, 252, 231, 191, 241]),
        rp: {
          id: location.hostname,
          name: location.hostname,
        },
        user: {
          id: data,
          name: name,
          displayName: name,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -8 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          residentKey: "required",
          requireResidentKey: true,
        },
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Uint8Array((credential as any).rawId)
  } catch (error) {
    console.error(error)
    return null
  }
}

/**
 * Use WebAuthn to retrieve authentication-protected arbitrary bytes
 *
 * @param id handle to the data
 * @returns data
 */
async function getOrThrow(id: Uint8Array<ArrayBuffer>) {
  try {
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: new Uint8Array([117, 61, 252, 231, 191, 241]),
        allowCredentials: [{ type: "public-key", id }],
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Uint8Array((credential as any).response.userHandle)
  } catch (error) {
    console.error(error)
    return null
  }
}

/**
 * Check if WebAuthn is supported
 *
 * @returns boolean
 */
function checkBrowserWebAuthnSupport(): boolean {
  if (!navigator.credentials) {
    return false
  }

  return true
}

async function createUmPasskeyWallet(name: string) {
  // Generate a unique password
  const bytes = crypto.getRandomValues(new Uint8Array(32))

  // Generate a random mnemonic phrase.
  const mnemonic = Mnemonic.random(Mnemonic.english)

  // Derive the public address
  const address = mnemonicToAccount(mnemonic).address

  // Convert the mnemonic phrase to bytes.
  const mnemonicBytes = Bytes.fromString(mnemonic)

  // Derive the key using the provided password.
  const [key, opts] = Keystore.pbkdf2({ password: Bytes.toHex(bytes) })

  // Encrypt the mnemonic phrase.
  const encrypted = Keystore.encrypt(mnemonicBytes, key, opts)

  // Store the password into the biometric authenticated storage
  const handle = await createOrThrow(name, bytes)

  // Store the handle to the password into some unauthenticated storage
  if (!handle) {
    return null
  }

  // Add the metadata to the encrypted keystore.
  const encryptedWithMeta = {
    ...encrypted,
    meta: {
      type: "secret-phrase + passkey password",
      note: "the 12 words secret phrase (aka mnemonic phrase) is encrypted with the password using the keystore encryption process",
      umVersion: "0.1.0"
    },
    handle: Bytes.toHex(handle),
    name: name,
    address: address,
  } as UmKeystore

  return { success: true, wallet: encryptedWithMeta }
}

async function checkUmPasskeyWallet() {
  /**
   * Retrieve the handle to the private key from some unauthenticated storage
   */
  const status: string | null = localStorage.getItem("wallets")

  if (status) {
    return true
  } else {
    return false
  }
}

async function getUmPasskeyWallet(name: string) {
  // Get the wallets list from localStorage
  const raw = localStorage.getItem("wallets")
  if (!raw) return null

  const wallets: UmKeystore[] = JSON.parse(raw)
  const wallet = wallets.find((wallet) => wallet.name === name)
  if (!wallet) return null

  // Convert the stored handle hex back to Uint8Array
  const handle = Bytes.fromHex(wallet.handle as `0x${string}`) as Uint8Array<ArrayBuffer>

  /**
   * Retrieve the password from biometric authenticated storage
   */
  const bytes = await getOrThrow(handle)
  if (!bytes) {
    return null
  }

  // Derive the key using the retrieved password
  const key = Keystore.toKey(wallet, { password: Bytes.toHex(bytes) })

  // Decrypt the mnemonic
  const mnemonicHex = Keystore.decrypt(wallet, key)

  // Convert the mnemonicHex to mnemonicBytes
  const mnemonicBytes = Bytes.fromHex(mnemonicHex)

  // Convert the mnemonicBytes to a mnemonic phrase
  const mnemonic = Bytes.toString(mnemonicBytes)

  // derive the EVM account from mnemonic
  const evmAccount = mnemonicToAccount(mnemonic, {
    accountIndex: 0,
    addressIndex: 0,
  })

  // Derive the EVM account from the mnemonic
  return evmAccount
}

import type { TransactionSerializable } from "viem"

async function signWithUmPasskeyWallet(wallet: UmKeystore, tx: TransactionSerializable) {
  // Convert the stored handle hex back to Uint8Array
  const handle = Bytes.fromHex(wallet.handle as `0x${string}`) as Uint8Array<ArrayBuffer>

  // Retrieve the password from biometric authenticated storage
  const bytes = await getOrThrow(handle)
  if (!bytes) return null

  // Derive the key using the retrieved password
  const key = Keystore.toKey(wallet, { password: Bytes.toHex(bytes) })

  // Decrypt the mnemonic
  const mnemonicHex = Keystore.decrypt(wallet, key)

  // Convert the mnemonicHex to mnemonicBytes
  const mnemonicBytes = Bytes.fromHex(mnemonicHex)

  // Convert the mnemonicBytes to a mnemonic phrase
  const mnemonic = Bytes.toString(mnemonicBytes)

  // Derive the EVM account from mnemonic
  const evmAccount = mnemonicToAccount(mnemonic, {
    accountIndex: 0,
    addressIndex: 0,
  })

  // Sign the transaction
  const signedTx = await evmAccount.signTransaction(tx)

  return signedTx
}

export {
  createOrThrow,
  getOrThrow,
  checkBrowserWebAuthnSupport,
  createUmPasskeyWallet,
  getUmPasskeyWallet,
  checkUmPasskeyWallet,
  signWithUmPasskeyWallet,
}