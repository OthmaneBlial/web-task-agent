import type { DirectAppMetadata } from "../../tasks/agent/direct-source";

const NANO_CV_APP_ID = "com.nanocv.app";

export function nanoCvMetadata(): DirectAppMetadata {
  return {
    appName: "Resume Builder Offline",
    fullTitle: "Resume Builder Offline - Apps on Google Play",
    shortDescription: "Create professional resumes offline. 100% private, no signup.",
    longDescription:
      "Build a job-winning resume in minutes with NanoCV, the secure offline resume builder. Export clean, ATS-friendly PDF resumes without an account.",
    category: "BUSINESS",
    developer: "Stack Attack",
    appId: NANO_CV_APP_ID,
    normalizedUrl: `https://play.google.com/store/apps/details?id=${NANO_CV_APP_ID}&hl=en&gl=us`
  };
}

export async function fetchNanoCvMetadata(): Promise<DirectAppMetadata> {
  return nanoCvMetadata();
}

export async function fetchBenchmarkAppIds(): Promise<string[]> {
  return [NANO_CV_APP_ID, "com.example.resumepro", "com.example.cvmaker"];
}

export async function fetchBenchmarkMetadata(url: string): Promise<DirectAppMetadata | null> {
  if (url.includes(NANO_CV_APP_ID)) {
    return nanoCvMetadata();
  }

  if (url.includes("com.example.resumepro")) {
    return {
      ...nanoCvMetadata(),
      appName: "Resume Builder Pro",
      fullTitle: "Resume Builder Pro - Apps on Google Play",
      appId: "com.example.resumepro",
      normalizedUrl: "https://play.google.com/store/apps/details?id=com.example.resumepro&hl=en&gl=us"
    };
  }

  if (url.includes("com.example.cvmaker")) {
    return {
      ...nanoCvMetadata(),
      appName: "CV Maker",
      fullTitle: "CV Maker - Apps on Google Play",
      appId: "com.example.cvmaker",
      normalizedUrl: "https://play.google.com/store/apps/details?id=com.example.cvmaker&hl=en&gl=us"
    };
  }

  return null;
}
