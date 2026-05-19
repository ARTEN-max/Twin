declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void | Promise<void>) => void;
declare const expect: (value: unknown) => {
  not: {
    toBeNull(): void;
  };
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toHaveLength(expected: number): void;
  toBeNull(): void;
  toBeUndefined(): void;
  toMatch(pattern: RegExp | string): void;
};
