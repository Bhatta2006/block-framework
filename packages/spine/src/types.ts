/**
 * Entity Spine v0: one typed data model that generates the Supabase
 * migration SQL and the TypeScript Database type. Pure functions —
 * same spine in, byte-identical SQL and types out.
 */

export type SpineFieldType =
  'uuid' | 'text' | 'int' | 'bigint' | 'bool' | 'timestamptz' | 'date' | 'jsonb' | 'numeric';

export interface SpineField {
  name: string;
  type: SpineFieldType;
  /** NULL allowed. Default false (NOT NULL). */
  nullable?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  /** SQL default expression, e.g. "gen_random_uuid()" or "now()". */
  default?: string;
  /** Foreign key target as "table.column". */
  references?: string;
  /** ON DELETE action for foreign keys. Default "CASCADE" for references. */
  onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT';
}

export interface SpineEntity {
  name: string;
  /** Human description (docs only). */
  description?: string;
  fields: SpineField[];
}

export interface SpineFile {
  entities: SpineEntity[];
}

/** Validate a parsed spine file. Throws on the first problem. */
export function validateSpine(spine: unknown): asserts spine is SpineFile {
  if (spine === null || typeof spine !== 'object') {
    throw new Error('Spine must be an object with an "entities" array.');
  }
  const entities = (spine as { entities?: unknown }).entities;
  if (!Array.isArray(entities) || entities.length === 0) {
    throw new Error('Spine must declare a non-empty "entities" array.');
  }
  const seen = new Set<string>();
  const validTypes: SpineFieldType[] = [
    'uuid',
    'text',
    'int',
    'bigint',
    'bool',
    'timestamptz',
    'date',
    'jsonb',
    'numeric',
  ];
  for (const e of entities) {
    if (e === null || typeof e !== 'object') throw new Error('Each entity must be an object.');
    const ent = e as Partial<SpineEntity>;
    if (!ent.name || typeof ent.name !== 'string')
      throw new Error('Each entity needs a string "name".');
    if (!/^[a-z][a-z0-9_]*$/.test(ent.name)) {
      throw new Error(`Entity name "${ent.name}" must be snake_case.`);
    }
    if (seen.has(ent.name)) throw new Error(`Duplicate entity name: "${ent.name}".`);
    seen.add(ent.name);
    if (!Array.isArray(ent.fields) || ent.fields.length === 0) {
      throw new Error(`Entity "${ent.name}" needs a non-empty "fields" array.`);
    }
    const fieldSeen = new Set<string>();
    let pkCount = 0;
    for (const f of ent.fields) {
      const field = f as Partial<SpineField>;
      if (!field.name || typeof field.name !== 'string') {
        throw new Error(`Entity "${ent.name}": each field needs a string "name".`);
      }
      if (!/^[a-z][a-z0-9_]*$/.test(field.name)) {
        throw new Error(`Entity "${ent.name}": field "${field.name}" must be snake_case.`);
      }
      if (fieldSeen.has(field.name)) {
        throw new Error(`Entity "${ent.name}": duplicate field "${field.name}".`);
      }
      fieldSeen.add(field.name);
      if (!validTypes.includes(field.type as SpineFieldType)) {
        throw new Error(
          `Entity "${ent.name}".${field.name}: unknown type "${field.type}". ` +
            `Valid: ${validTypes.join(', ')}.`,
        );
      }
      if (field.primaryKey) pkCount++;
      if (field.references && !/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(field.references)) {
        throw new Error(
          `Entity "${ent.name}".${field.name}: references must be "table.column", got "${field.references}".`,
        );
      }
    }
    if (pkCount !== 1) {
      throw new Error(`Entity "${ent.name}" must have exactly one primary key field.`);
    }
  }
  // Foreign keys must target entities defined in the spine (order-independent).
  for (const e of entities) {
    const ent = e as SpineEntity;
    for (const f of ent.fields) {
      if (f.references) {
        const [table] = f.references.split('.');
        if (!seen.has(table as string)) {
          throw new Error(`Entity "${ent.name}".${f.name}: references unknown table "${table}".`);
        }
      }
    }
  }
}
