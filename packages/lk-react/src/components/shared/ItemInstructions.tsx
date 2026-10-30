'use client';

/**
 * An item's own instructions as the learner reads them: trimmed, and nothing
 * for none, or for blank ones — what lk-core's AI help reads too, so a model
 * is told the task the screen shows.
 */
export function instructionsOf(data: { readonly instructions?: unknown }): string | undefined {
  const text = data.instructions;
  return typeof text === 'string' && text.trim() !== '' ? text.trim() : undefined;
}

/**
 * The task, drawn before the media and the question: a learner reads what to
 * do before listening or answering. The question's fieldset names it with
 * `aria-describedby`, so a screen reader announces it on entering the
 * question, once.
 */
export function ItemInstructions({
  id,
  className,
  text,
}: {
  id: string;
  className: string;
  text: string | undefined;
}): React.JSX.Element | null {
  return text === undefined ? null : (
    <p id={id} className={className}>
      {text}
    </p>
  );
}
