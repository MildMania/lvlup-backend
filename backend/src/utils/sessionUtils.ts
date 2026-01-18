/**
 * Session utility functions for calculating accurate session metrics
 */

/**
 * Calculate the actual end time for a session, using the later of endTime or lastHeartbeat
 * This handles cases where heartbeats were received after the session was marked as ended
 */
export function getActualSessionEndTime(session: {
    endTime: Date | null;
    lastHeartbeat: Date | null;
    startTime: Date;
}): Date {
    // If session is still open (no endTime), use lastHeartbeat or startTime
    if (!session.endTime) {
        return session.lastHeartbeat || session.startTime;
    }

    // If we have both endTime and lastHeartbeat, use the later one
    if (session.lastHeartbeat && session.lastHeartbeat > session.endTime) {
        return session.lastHeartbeat;
    }

    // Otherwise use endTime
    return session.endTime;
}

/**
 * Calculate the actual duration for a session in seconds
 * Uses the later of endTime or lastHeartbeat to account for late heartbeats
 */
export function calculateActualSessionDuration(session: {
    endTime: Date | null;
    lastHeartbeat: Date | null;
    startTime: Date;
}): number {
    const actualEndTime = getActualSessionEndTime(session);
    const durationMs = actualEndTime.getTime() - session.startTime.getTime();
    return Math.max(Math.floor(durationMs / 1000), 0);
}

