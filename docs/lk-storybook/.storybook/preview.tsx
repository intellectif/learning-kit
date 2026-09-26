import '@intellectif/lk-react/theme/defaults.css';
import '@intellectif/lk-react/theme/skin.css';
import {
  type ActivityType,
  assertRedacted,
  assertRedactedItemGroup,
  isItemGroup,
  type ValidationResult,
  validateActivity,
  validateItemGroup,
} from '@intellectif/lk-core';
import { ThemeProvider } from '@intellectif/lk-react/theme/ThemeProvider';
import type { Decorator, Preview } from '@storybook/react-vite';

/** `where: path code, …` for each error, or nothing when the content is valid. */
function problems(where: string, result: ValidationResult<unknown>): string[] {
  return result.success
    ? []
    : [
        `${where}: ${result.errors.map((e) => `${e.path.join('.') || '(root)'} ${e.code}`).join(', ')}`,
      ];
}

/**
 * A projection a learner is sent (`redacted: true`) is valid if it is a
 * redacted one, or a revealed one — which keeps the key, so the full schema
 * reads it. Anything else is held to the full schema.
 */
function contentProblems(where: string, value: unknown, full: () => ValidationResult<unknown>) {
  if ((value as { redacted?: unknown }).redacted === true) {
    try {
      if (isItemGroup(value as never)) {
        assertRedactedItemGroup(value);
      } else {
        assertRedacted(value);
      }
      return [];
    } catch {
      // Not a redacted projection: a revealed one passes the full schema.
    }
  }
  return problems(where, full());
}

/**
 * Every story's content is valid, or the story fails to render. A built
 * Storybook is a production build, where the components skip their
 * development-only checks and draw invalid content as best they can — so
 * without this a story with a broken item looked fine, here and in the smoke
 * run (`pnpm smoke`). An `ActivityPreview` story's `draft` is left alone: an
 * unfinished draft is what it shows.
 */
const validContent: Decorator = (Story, context) => {
  const args = context.args as {
    data?: { type?: unknown };
    group?: unknown;
    activities?: readonly unknown[];
  };
  const found: string[] = [];
  const { data, group } = args;
  if (typeof data?.type === 'string') {
    const type = data.type as ActivityType;
    found.push(...contentProblems('data', data, () => validateActivity(type, data)));
  }
  if (group !== undefined) {
    found.push(...contentProblems('group', group, () => validateItemGroup(group)));
  }
  for (const [index, entry] of (args.activities ?? []).entries()) {
    const type = (entry as { type?: unknown }).type;
    if (typeof type !== 'string') {
      continue;
    }
    found.push(
      ...contentProblems(`activities[${index}]`, entry, () =>
        isItemGroup(entry as never)
          ? validateItemGroup(entry)
          : validateActivity(type as ActivityType, entry),
      ),
    );
  }
  if (found.length > 0) {
    throw new Error(`Invalid content in story "${context.id}": ${found.join('; ')}`);
  }
  return <Story />;
};

const preview: Preview = {
  parameters: {
    controls: { expanded: true },
  },
  decorators: [
    validContent,
    (Story) => (
      <ThemeProvider>
        <div style={{ maxWidth: 680, padding: 24 }}>
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
};

export default preview;
