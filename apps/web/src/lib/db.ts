import { loadEnv } from "@bookly/config";
import { createDb } from "@bookly/db";

export const db = () => createDb(loadEnv().DATABASE_URL);
export { schema } from "@bookly/db";
