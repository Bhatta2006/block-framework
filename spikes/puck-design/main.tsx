import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Puck, type Config, type Data } from '@puckeditor/core';
import '@puckeditor/core/puck.css';
import { Hero } from '../../packages/blocks/src/blocks/content.hero/web/Hero.js';
import {
  DataCollection,
  DataProvider,
} from '../../packages/blocks/src/blocks/data.collection/web/DataCollection.js';
import {
  CloudAuth,
  CloudProvider,
} from '../../packages/blocks/src/blocks/auth.account/web/CloudRuntime.js';
import { referenceGraph, graphToDesign, designToOperations, type DesignData } from './adapter.ts';
import './.generated/styles.css';

type Props = {
  title: string;
  subtitle?: string;
  body?: string;
  ctaText?: string;
  eyebrow?: string;
};
type Components = { Hero: Props; Collection: Props; Account: Props };
const config: Config<Components> = {
  components: {
    Hero: {
      fields: {
        title: { type: 'text' },
        body: { type: 'text' },
        ctaText: { type: 'text' },
        eyebrow: { type: 'text' },
      },
      defaultProps: { title: 'Hero' },
      render: (props) => <Hero config={props} emit={() => {}} />,
    },
    Collection: {
      fields: { title: { type: 'text' }, subtitle: { type: 'text' } },
      defaultProps: { title: 'Collection' },
      render: (props) => (
        <DataProvider
          namespace="puck-spike"
          transient
          seeds={{ notes: [{ title: 'Preview note' }] }}
        >
          <DataCollection config={props} emit={() => {}} />
        </DataProvider>
      ),
    },
    Account: {
      fields: { title: { type: 'text' }, subtitle: { type: 'text' } },
      defaultProps: { title: 'Account' },
      render: (props) => (
        <CloudProvider disabled>
          <CloudAuth config={props} />
        </CloudProvider>
      ),
    },
  },
};
function Evaluation() {
  const [result, setResult] = useState('Use the editor, then Publish to inspect graph operations.');
  return (
    <>
      <h1 style={{ fontSize: 18 }}>Block Studio Design — Puck evaluation</h1>
      <Puck
        config={config}
        data={graphToDesign(referenceGraph) as Data<Components>}
        iframe={{ enabled: false }}
        permissions={{ insert: false, duplicate: false, delete: false }}
        onPublish={(data) => {
          try {
            setResult(JSON.stringify(designToOperations(data as DesignData), null, 2));
          } catch (error) {
            setResult((error as Error).message);
          }
        }}
      />
      <pre role="status" data-testid="operations">
        {result}
      </pre>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Evaluation />);
