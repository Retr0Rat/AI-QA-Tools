import { Storage } from '@google-cloud/storage';
import { Course } from './types';

let storage: Storage | null = null;

function getStorage(): Storage {
  if (!storage) {
    const raw = process.env.GCP_SERVICE_ACCOUNT_KEY;
    if (!raw) throw new Error('GCP_SERVICE_ACCOUNT_KEY is not set');
    const credentials = typeof raw === 'string' ? JSON.parse(raw) : raw;
    storage = new Storage({ credentials });
  }
  return storage;
}

// Simple in-memory cache so we don't hit GCS on every request
let cache: Course[] | null = null;
let cacheAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function fetchCourses(): Promise<Course[]> {
  if (cache && Date.now() - cacheAt < CACHE_TTL_MS) return cache;

  const bucketName = process.env.GCP_BUCKET_NAME;
  if (!bucketName) throw new Error('GCP_BUCKET_NAME is not set');

  const bucket = getStorage().bucket(bucketName);
  const [files] = await bucket.getFiles({ prefix: 'courses/' });

  const courses = await Promise.all(
    files
      .filter((f) => f.name.endsWith('.json'))
      .map(async (file) => {
        const [buf] = await file.download();
        return JSON.parse(buf.toString('utf-8')) as Course;
      })
  );

  cache = courses;
  cacheAt = Date.now();
  return courses;
}
