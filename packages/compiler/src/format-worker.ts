import { runAsWorker } from 'synckit';
import { format } from 'prettier';

runAsWorker((source: string) =>
  format(source, { parser: 'typescript', singleQuote: true, printWidth: 100 }),
);
