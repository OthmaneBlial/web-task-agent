import { logStructured } from "../lib/local-logging";
import { redactSensitiveText } from "../lib/redaction";

export abstract class BaseTask<TOptions, TResult> {
  constructor(protected readonly options: TOptions) {}

  abstract run(): Promise<TResult>;

  protected log(message: string): void {
    const stamp = new Date().toISOString();
    const safeMessage = redactSensitiveText(message);
    console.log(`[${stamp}] ${safeMessage}`);
    logStructured(this.constructor.name, safeMessage);
  }
}
