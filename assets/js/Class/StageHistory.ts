// What was done on a stage, to be undone and done again.
//
// Kept as the states the stage passed through rather than as commands: a
// state is plain data the stage already knows how to draw, so any change —
// a drag, a deletion, an edit made by the page itself — is undone the same
// way, and nothing has to know how to reverse what it did. A stage holds
// few enough elements for a copy per step to cost nothing worth a command
// system.
export default class StageHistory<T> {
  private past: string[] = [];

  private future: string[] = [];

  constructor(private readonly depth: number = 100) {
  }

  // The state as it stood before a change, written down before the change is
  // made. What was undone and not yet done again is forgotten: a new change
  // starts a new line.
  record(state: T): void {
    this.past.push(JSON.stringify(state));

    if (this.past.length > this.depth) {
      this.past.shift();
    }

    this.future = [];
  }

  // The state to go back to, given the one being left — or null when there is
  // nothing to undo.
  undo(current: T): T | null {
    const previous = this.past.pop();

    if (previous === undefined) {
      return null;
    }

    this.future.push(JSON.stringify(current));

    return JSON.parse(previous);
  }

  redo(current: T): T | null {
    const next = this.future.pop();

    if (next === undefined) {
      return null;
    }

    this.past.push(JSON.stringify(current));

    return JSON.parse(next);
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}
