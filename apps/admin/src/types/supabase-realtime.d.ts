declare module '@supabase/phoenix/priv/static/types/timer' {
  export class Timer {
    constructor(callback: () => void, timerCalc: (tries: number) => number);
    reset(): void;
    scheduleTimeout(): void;
  }
}

declare module '@supabase/phoenix/priv/static/types/types' {
  export type RealtimeLogLevel = 'debug' | 'info' | 'warn' | 'error';
}
