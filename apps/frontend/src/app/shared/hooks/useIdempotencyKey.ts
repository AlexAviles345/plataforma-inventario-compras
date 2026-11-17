import { useCallback, useState } from 'react';

export function useIdempotencyKey(initialKey?: string) {
  const [key, setKey] = useState(() => initialKey ?? crypto.randomUUID());
  const rotate = useCallback(() => {
    const next = crypto.randomUUID();
    setKey(next);
    return next;
  }, []);

  return { key, rotate };
}
