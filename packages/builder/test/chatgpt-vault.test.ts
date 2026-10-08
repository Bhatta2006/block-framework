import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { ChatGPTVault } from '../src/chatgpt-vault.js';

const cleanup: Array<{ directory: string; vaults: ChatGPTVault[] }> = [];
afterEach(() => {
  for (const { directory, vaults } of cleanup.splice(0)) {
    for (const vault of vaults) vault.close();
    // Only remove a verified test-owned temporary directory.
    if (
      dirname(resolve(directory)) !== resolve(tmpdir()) ||
      !basename(directory).startsWith('blockstudio-vault-test-')
    )
      throw new Error('Unexpected test cleanup target.');
    rmSync(directory, { recursive: true, force: true });
  }
});
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'blockstudio-vault-test-'));
  let key: string | null = null;
  const keyStore = {
    getPassword: () => key,
    setPassword: (value: string) => {
      key = value;
    },
  };
  const vaults: ChatGPTVault[] = [];
  cleanup.push({ directory, vaults });
  const create = () => {
    const vault = new ChatGPTVault({ directory, keyStore });
    vaults.push(vault);
    return vault;
  };
  return {
    directory,
    create,
    loseKey: () => {
      key = null;
    },
  };
}
describe('protected ChatGPT storage', () => {
  it('encrypts credentials on disk and decrypts them after restart without a plaintext fallback', () => {
    const f = fixture();
    const first = f.create();
    const data = { accessToken: 'private-access', refreshToken: 'private-refresh' };
    first.write(data);
    expect(readFileSync(join(f.directory, 'chatgpt.enc')).toString()).not.toContain('private-');
    first.close();
    expect(f.create().read()).toEqual(data);
  });
  it('refuses concurrent runtimes sharing the credential file', () => {
    const f = fixture();
    f.create().write({ secret: 'test' });
    expect(() => f.create().read()).toThrow('other Studio instance');
  });
  it('rejects modified ciphertext instead of replacing saved credentials', () => {
    const f = fixture();
    const vault = f.create();
    vault.write({ secret: 'test' });
    const path = join(f.directory, 'chatgpt.enc');
    const bytes = readFileSync(path);
    bytes[bytes.length - 1]! ^= 1;
    writeFileSync(path, bytes);
    expect(() => vault.read()).toThrow('could not be read');
  });
  it('does not overwrite encrypted connections if the OS encryption key is missing', () => {
    const f = fixture();
    const first = f.create();
    first.write({ secret: 'test' });
    first.close();
    const before = readFileSync(join(f.directory, 'chatgpt.enc'));
    f.loseKey();
    expect(() => f.create().read()).toThrow('credential store');
    expect(readFileSync(join(f.directory, 'chatgpt.enc'))).toEqual(before);
  });
});
