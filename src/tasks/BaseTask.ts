import { logStructured } from "../lib/local-logging";

export abstract class BaseTask<TOptions, TResult> {
  constructor(protected readonly options: TOptions) {}

  abstract run(): Promise<TResult>;

  protected log(message: string): void {
    const stamp = new Date().toISOString();
    console.log(`[${stamp}] ${message}`);
    logStructured(this.constructor.name, message);
  }
}
