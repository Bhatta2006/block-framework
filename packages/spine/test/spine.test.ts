import { describe, expect, it } from 'vitest';
import { validateSpine, spineToSql, spineToTypes, type SpineFile } from '@blockfw/spine';

function baseSpine(): SpineFile {
  return {
    entities: [
      {
        name: 'profiles',
        fields: [
          { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
          { name: 'email', type: 'text', unique: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
        ],
      },
      {
        name: 'habits',
        fields: [
          { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
          { name: 'user_id', type: 'uuid', references: 'profiles.id' },
          { name: 'title', type: 'text' },
        ],
      },
    ],
  };
}

describe('validateSpine', () => {
  it('accepts a valid spine', () => {
    expect(() => validateSpine(baseSpine())).not.toThrow();
  });

  it('rejects duplicate entity names', () => {
    const s = baseSpine();
    s.entities.push({ name: 'profiles', fields: [{ name: 'id', type: 'uuid', primaryKey: true }] });
    expect(() => validateSpine(s)).toThrow(/Duplicate entity/);
  });

  it('rejects unknown field types', () => {
    const s = baseSpine();
    (s.entities[0]!.fields[1] as { type: string }).type = 'varchar';
    expect(() => validateSpine(s)).toThrow(/unknown type/);
  });

  it('rejects references to unknown tables', () => {
    const s = baseSpine();
    s.entities[1]!.fields[1]!.references = 'nope.id';
    expect(() => validateSpine(s)).toThrow(/unknown table/);
  });

  it('requires exactly one primary key', () => {
    const s = baseSpine();
    s.entities[0]!.fields[0]!.primaryKey = false;
    expect(() => validateSpine(s)).toThrow(/exactly one primary key/);
  });
});

describe('spineToSql', () => {
  it('generates deterministic migration SQL', () => {
    const a = spineToSql(baseSpine());
    const b = spineToSql(baseSpine());
    expect(a).toBe(b);
    expect(a).toContain('CREATE TABLE IF NOT EXISTS "profiles"');
    expect(a).toContain('"id" UUID PRIMARY KEY DEFAULT gen_random_uuid()');
    expect(a).toContain('"email" TEXT NOT NULL UNIQUE');
    expect(a).toContain('REFERENCES "profiles" ("id") ON DELETE CASCADE');
    // Regression: dot notation (REFERENCES profiles.id) is parsed by
    // Postgres as schema "profiles", table "id" -> 3F000. Never emit it.
    expect(a).not.toMatch(/REFERENCES [a-z_]+\.[a-z_]+ ON DELETE/);
  });

  it('regenerates cleanly when a field is added', () => {
    const before = spineToSql(baseSpine());
    const s = baseSpine();
    s.entities[0]!.fields.push({ name: 'handle', type: 'text', nullable: true });
    const after = spineToSql(s);
    expect(after).toContain('"handle" TEXT');
    expect(after.length).toBeGreaterThan(before.length);
    // Unchanged tables are byte-identical.
    const beforeHabits = before.split('CREATE TABLE IF NOT EXISTS "habits"')[1];
    const afterHabits = after.split('CREATE TABLE IF NOT EXISTS "habits"')[1];
    expect(afterHabits).toBe(beforeHabits);
  });
});

describe('spineToTypes', () => {
  it('generates the Database interface', () => {
    const ts = spineToTypes(baseSpine());
    expect(ts).toContain('export interface Database');
    expect(ts).toContain('"profiles"');
    expect(ts).toContain('"id": string;');
    expect(ts).toContain('"email": string;');
    // Insert makes defaulted fields optional.
    expect(ts).toContain('"id"?: string;');
  });

  it('is deterministic', () => {
    expect(spineToTypes(baseSpine())).toBe(spineToTypes(baseSpine()));
  });
});
