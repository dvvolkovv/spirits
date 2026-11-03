import type { KeyboardEvent } from 'react';

export function openableRow(onOpen: () => void, ariaLabel?: string) {
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': ariaLabel,
    onClick: onOpen,
    onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onOpen();
    },
  };
}
