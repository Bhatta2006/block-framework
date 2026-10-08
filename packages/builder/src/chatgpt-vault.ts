import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, rmdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Entry } from '@napi-rs/keyring';
import { replaceCatalogFile } from './apps.js';

export interface ConnectionVault {
  read(): unknown;
  write(value: unknown): void;
  close(): void;
}

/** Tokens stay outside the repository, encrypted with an OS credential-store key. */
export class ChatGPTVault implements ConnectionVault {
  private key?: Buffer;
  private locked = false;
  private readonly directory: string;
  private readonly file: string;
  private readonly lock: string;
  constructor(
    private readonly options: {
      directory?: string;
      keyStore?: Pick<Entry, 'getPassword' | 'setPassword'>;
    } = {},
  ) {
    this.directory =
      options.directory ??
      join(
        process.platform === 'win32'
          ? (process.env.LOCALAPPDATA ?? homedir())
          : process.platform === 'darwin'
            ? join(homedir(), 'Library', 'Application Support')
            : (process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')),
        'BlockStudio',
      );
    this.file = join(this.directory, 'chatgpt.enc');
    this.lock = join(this.directory, 'chatgpt.lock');
  }

  private prepare() {
    if (this.key) return;
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    try {
      mkdirSync(this.lock, { mode: 0o700 });
    } catch {
      // Another Studio process must not race a rotating refresh token.
      let owner: number;
      try {
        owner = Number(readFileSync(join(this.lock, 'pid'), 'utf8'));
      } catch {
        throw new Error('ChatGPT storage is busy. Close the other Studio instance.');
      }
      if (!Number.isInteger(owner) || owner <= 0) throw new Error('ChatGPT storage is busy.');
      try {
        process.kill(owner, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
          throw new Error('ChatGPT storage is busy.', { cause: error });
        rmSync(join(this.lock, 'pid'));
        rmdirSync(this.lock);
        mkdirSync(this.lock, { mode: 0o700 });
        owner = 0;
      }
      if (owner !== 0) throw new Error('ChatGPT storage is busy. Close the other Studio instance.');
    }
    this.locked = true;
    writeFileSync(join(this.lock, 'pid'), String(process.pid), { mode: 0o600 });
    try {
      const entry =
        this.options.keyStore ??
        new Entry('BlockStudio.ChatGPT', 'credential-encryption-key', {
          linux: { store: 'secret-service' },
        });
      const saved = entry.getPassword();
      if (!saved && existsSync(this.file)) throw new Error('Encryption key is unavailable.');
      this.key = saved ? Buffer.from(saved, 'base64') : randomBytes(32);
      if (this.key.length !== 32) throw new Error('Invalid encryption key.');
      if (!saved) entry.setPassword(this.key.toString('base64'));
    } catch {
      this.close();
      throw new Error(
        'Unlock your operating system credential store, then try ChatGPT sign-in again.',
      );
    }
  }

  read(): unknown {
    if (!existsSync(this.file)) return undefined;
    this.prepare();
    try {
      const bytes = readFileSync(this.file);
      const decipher = createDecipheriv('aes-256-gcm', this.key!, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return JSON.parse(
        Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'),
      );
    } catch {
      throw new Error(
        'Saved ChatGPT connection could not be read. Restore its credential-store key.',
      );
    }
  }

  write(value: unknown) {
    this.prepare();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key!, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    writeFileSync(this.file + '.tmp', Buffer.concat([iv, cipher.getAuthTag(), encrypted]), {
      mode: 0o600,
    });
    replaceCatalogFile(this.file + '.tmp', this.file);
  }

  close() {
    this.key = undefined;
    if (!this.locked) return;
    this.locked = false;
    rmSync(join(this.lock, 'pid'), { force: true });
    // Remove only our known, empty lock directory.
    rmdirSync(this.lock);
  }
}
