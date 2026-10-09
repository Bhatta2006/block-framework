/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Hero } from '../src/blocks/content.hero/web/Hero.js';
import { DataCollection, DataProvider } from '../src/blocks/data.collection/web/DataCollection.js';
import { CloudAuth, CloudProvider } from '../src/blocks/auth.account/web/CloudRuntime.js';

afterEach(cleanup);
describe('authored v2 web blocks', () => {
  it('renders Hero typed config and keeps the event/decorate contract', () => {
    const emit = vi.fn();
    render(
      <Hero
        config={{ title: 'Hello', ctaText: 'Continue' }}
        variant="compact"
        emit={emit}
        decorate={(tree) => <div data-testid="decorated">{tree}</div>}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    expect(emit).toHaveBeenCalledWith('action.pressed', {});
    expect(screen.getByTestId('decorated').querySelector('.compact-hero')).not.toBeNull();
  });
  it('shares the existing persistent store and emits the selected record payload', async () => {
    const emit = vi.fn();
    render(
      <DataProvider
        namespace="reference-test"
        transient
        seeds={{ notes: [{ id: 'note-1', title: 'A real record', body: 'hello' }] }}
      >
        <DataCollection config={{ enableBackup: false }} emit={emit} />
      </DataProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Inbox A real record hello$/ })).toBeDefined(),
    );
    fireEvent.click(screen.getByRole('button', { name: /^Inbox A real record hello$/ }));
    expect(emit).toHaveBeenCalledWith('data.recordSelected', {
      collection: 'notes',
      recordId: 'note-1',
    });
  });
  it('renders account input under the real provider and rejects an absent provider', () => {
    render(
      <CloudProvider disabled>
        <CloudAuth config={{ title: 'Your account' }} />
      </CloudProvider>,
    );
    expect(screen.getByRole('textbox', { name: /Email/ })).toBeDefined();
    cleanup();
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<CloudAuth />)).toThrow(/Configure cloud services/);
    quiet.mockRestore();
  });
});
