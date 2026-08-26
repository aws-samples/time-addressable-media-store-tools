// Minimal type declarations for the `t-a-i` package (nanoseconds entry point),
// which ships no TypeScript types. Only the surface we use is declared.
declare module "t-a-i/nanos" {
  export const MODELS: Record<"STALL" | "OVERRUN" | "BREAK", unknown>;
  export function TaiConverter(model: unknown): {
    // BigInt in → BigInt out; returns NaN (number) for values before TAI start.
    atomicToUnix(atomic: bigint): bigint | number;
    unixToAtomic(unix: bigint): bigint | number;
  };
}
