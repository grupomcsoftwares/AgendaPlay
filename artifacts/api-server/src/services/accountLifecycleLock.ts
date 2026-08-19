import { pool } from "@workspace/db";

export async function withAccountLifecycleLock<T>(
  userId: string,
  callback: () => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  const lockKey = `account-lifecycle:${userId}`;
  try {
    await client.query("select pg_advisory_lock(hashtext($1))", [lockKey]);
    return await callback();
  } finally {
    await client
      .query("select pg_advisory_unlock(hashtext($1))", [lockKey])
      .catch(() => {});
    client.release();
  }
}