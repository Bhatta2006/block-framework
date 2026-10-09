import { describe, expect, it } from 'vitest';
import { workspaceTheme } from '../src/workspace-theme.js';
import { buildTheme } from '../src/theme-build.js';

const theme = { primaryColor: '#345E4F', backgroundColor: '#F8F9F5', textColor: '#26372F' };
describe('shared workspace theme', () => {
  it('resolves portable tokens deterministically for CSS and native consumers', async () => {
    const files = await workspaceTheme(theme);
    expect(await workspaceTheme(theme)).toEqual(files);
    const content = (path: string) =>
      files.find((file) => file.path === 'packages/theme/' + path)!.content;
    const source = JSON.parse(content('tokens.json'));
    expect(source.color.light.primary.$value.components).toEqual([52 / 255, 94 / 255, 79 / 255]);
    expect(source.color.light.success.$value).toBe('{palette.success.40}');
    expect(content('tokens.css')).toContain('--motion-fast: 120ms');
    expect(content('tokens.css')).toContain('--space-4: 16px');
    expect(content('tokens.css')).not.toMatch(/\[object Object\]|\{palette\./);
    expect(content('index.ts')).toContain('space4: 16');
    expect(content('index.ts')).toContain('motionFast: 120');
    expect(content('index.ts')).not.toContain('{palette.');
    expect(content('web.css')).toContain("[data-theme='dark']");
    expect(content('web.css')).toContain('prefers-reduced-motion');
    for (const file of await buildTheme(source)) expect(content(file.path)).toBe(file.content);
    expect(JSON.parse(content('package.json')).scripts.build).toBe('node build.mjs');
    expect(content('theme-build.ts')).not.toContain('@blockfw/');
    const seconds = structuredClone(source);
    seconds.motion.fast.$value = { value: 0.12, unit: 's' };
    expect((await buildTheme(seconds)).find((file) => file.path === 'index.ts')!.content).toContain(
      'motionFast: 120',
    );
    seconds.space['4'].$value.unit = 'rem';
    await expect(buildTheme(seconds)).rejects.toThrow('token transformations');
    source.color.light.success.$value = '{missing.token}';
    await expect(buildTheme(source)).rejects.toThrow();
    const changed = await workspaceTheme({ ...theme, primaryColor: '#ff6600' });
    expect(changed).not.toEqual(files);
    expect(files.map((file) => file.path)).toEqual(changed.map((file) => file.path));
  });
  it('rejects invalid colors and keeps readable foregrounds on light brands', async () => {
    await expect(workspaceTheme({ ...theme, primaryColor: 'invalid' })).rejects.toThrow(
      'six-digit hex',
    );
    const files = await workspaceTheme({ ...theme, primaryColor: '#ffff00' });
    expect(files.find((file) => file.path.endsWith('/index.ts'))!.content).toContain(
      "colorLightOnPrimary: '#000000'",
    );
  });
});
