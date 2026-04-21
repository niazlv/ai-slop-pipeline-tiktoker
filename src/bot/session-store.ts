import { UserSession, DialogState } from './types.js';

export class SessionStore {
  private sessions = new Map<number, UserSession>();

  get(userId: number): UserSession {
    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, { userId, state: 'IDLE', params: {} });
    }
    return this.sessions.get(userId)!;
  }

  set(userId: number, session: UserSession): void {
    this.sessions.set(userId, session);
  }

  clear(userId: number): void {
    this.sessions.set(userId, { userId, state: 'IDLE', params: {} });
  }

  has(userId: number): boolean {
    return this.sessions.has(userId);
  }

  setState(userId: number, state: DialogState): void {
    const session = this.get(userId);
    this.sessions.set(userId, { ...session, state });
  }
}
