// src/bot/access-guard.ts
export class AccessGuard {
  private allowedIds: Set<number> | null;

  constructor() {
    const raw = process.env.TELEGRAM_ALLOWED_USER_IDS;
    if (raw && raw.trim()) {
      this.allowedIds = new Set(
        raw.split(',')
           .map(id => parseInt(id.trim(), 10))
           .filter(id => !isNaN(id))
      );
    } else {
      this.allowedIds = null; // null = all users allowed
    }
  }

  isAllowed(userId: number): boolean {
    return this.allowedIds === null || this.allowedIds.has(userId);
  }

  getAllowedIds(): Set<number> | null {
    return this.allowedIds;
  }
}
