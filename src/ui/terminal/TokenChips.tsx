import { help } from '../../instruments/cli';
import type { CliSession } from '../../instruments/cli';
import type { UiSessionState } from '../../session/runner';
import type { WorldState } from '../../world';
import { Chip } from '../components/Chip';

/** Tap-token suggestions built from item 3's help(), so the terminal never invites free-typed guessing over what the vendor CLI actually accepts. */
export function TokenChips({ ui, session, input, onAppend, onQuestionMark }: { ui: UiSessionState; session: CliSession; input: string; onAppend(token: string): void; onQuestionMark(): void }) {
  const result = help(ui.world as WorldState, ui.profiles, session, input);

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '4px 0' }}>
      {result.candidates.map((c) => (
        <Chip key={c.token} onClick={() => onAppend(c.token)} title={c.description}>
          {c.token}
        </Chip>
      ))}
      <Chip onClick={onQuestionMark} title="Show all options">
        ?
      </Chip>
    </div>
  );
}
