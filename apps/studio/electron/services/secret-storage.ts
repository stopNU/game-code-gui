import { createRequire as createNodeRequire } from 'module';

const nodeRequire = createNodeRequire(import.meta.url);

function getSafeStorage() {
  const electronModule = nodeRequire('electron') as {
    safeStorage: {
      isEncryptionAvailable: () => boolean;
      encryptString: (plainText: string) => Buffer;
      decryptString: (cipherText: Buffer) => string;
    };
  };

  return electronModule.safeStorage;
}

export interface SecretStorage {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): string;
  decryptString(cipherText: string): string;
}

export class ElectronSafeStorageSecretStorage implements SecretStorage {
  public isEncryptionAvailable(): boolean {
    return getSafeStorage().isEncryptionAvailable();
  }

  public encryptString(plainText: string): string {
    const buffer = getSafeStorage().encryptString(plainText);
    return buffer.toString('base64');
  }

  public decryptString(cipherText: string): string {
    const decrypted = getSafeStorage().decryptString(Buffer.from(cipherText, 'base64'));
    return decrypted;
  }
}

export class Base64SecretStorage implements SecretStorage {
  public isEncryptionAvailable(): boolean {
    return true;
  }

  public encryptString(plainText: string): string {
    return Buffer.from(plainText, 'utf8').toString('base64');
  }

  public decryptString(cipherText: string): string {
    return Buffer.from(cipherText, 'base64').toString('utf8');
  }
}
