/**
 * M4: ZIP export audit rules.
 *
 * The exported ZIP must be safe to share and must work from a clean machine
 * using only the README. This module defines what goes in and what stays out.
 */

/** Files/dirs that must NEVER be in the export (secrets, scratch, junk). */
export const EXCLUDE_PATTERNS = [
  // Dependencies (reinstalled via README)
  'node_modules/**',
  // Version control
  '.git/**',
  // Secrets (belt and suspenders — the compiler never emits these, but audit anyway)
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  // Scratch / build artifacts
  '.builder-cache/**',
  '.ci-work/**',
  'dist/**',
  'dist-ui/**',
  '__render_out__/**',
  // OS junk
  '.DS_Store',
  'Thumbs.db',
  // Absolute paths (we check content, not just names)
];

/** File extensions that are audited for secret-like content. */
const AUDIT_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.sql', '.example'];

/** Patterns that look like leaked secrets. */
const SECRET_PATTERNS = [
  /sk-or-v1-[a-zA-Z0-9_-]{10,}/, // OpenRouter
  /sk-ant-[a-zA-Z0-9_-]{10,}/, // Anthropic
  /xox[bap]-[a-zA-Z0-9-]{10,}/, // Slack
  /ghp_[a-zA-Z0-9]{20,}/, // GitHub PAT
  /github_pat_[a-zA-Z0-9_]{20,}/, // GitHub fine-grained PAT
  /AIza[a-zA-Z0-9_-]{20,}/, // Google API key
  /GOCSPX-[a-zA-Z0-9_-]{15,}/, // Google OAuth client secret
  /sb_secret_[a-zA-Z0-9_-]{15,}/, // Supabase privileged key
  /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/, // Embedded JWT
];

export interface AuditResult {
  ok: boolean;
  violations: string[];
}

/**
 * Audit file contents for secrets and absolute paths.
 * Returns violations (empty = clean).
 */
export function auditFileContent(path: string, content: string): string[] {
  const violations: string[] = [];
  const ext = path.slice(path.lastIndexOf('.'));

  if (AUDIT_EXTENSIONS.includes(ext)) {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(content)) {
        violations.push(`${path}: possible secret (matches ${pattern.source.slice(0, 30)}...)`);
      }
    }
    // Absolute paths (Unix and Windows)
    if (/\/home\/|\/tmp\/|C:\\|D:\\/.test(content)) {
      // Allowlist: comments explaining paths are OK, actual path references are not.
      // For now, flag them all and let a human review.
      violations.push(`${path}: contains absolute path`);
    }
  }

  return violations;
}

/**
 * Check if a file path should be excluded from the export.
 */
export function shouldExclude(relativePath: string): boolean {
  // The compiler emits a blank credential template, audited just like source.
  if (relativePath === '.env.example') return false;
  // Simple glob matching for our patterns
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.endsWith('/**')) {
      const prefix = pattern.slice(0, -3);
      if (relativePath === prefix || relativePath.startsWith(prefix + '/')) {
        return true;
      }
    } else if (pattern.includes('*')) {
      // Basic wildcard: convert to regex
      const regex = new RegExp('^' + pattern.replace(/\*/g, '[^/]*') + '$');
      if (regex.test(relativePath)) {
        return true;
      }
    } else if (relativePath === pattern) {
      return true;
    }
  }
  return false;
}
