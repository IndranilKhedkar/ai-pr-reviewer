import axios from "axios";
import { GoogleAuth } from "google-auth-library";

export async function fetchPrReviewComments(prompt, genCfg = {}) {
  const token = await getToken();

  const resp = await axios.post(
    `https://${process.env.GCP_REGION}-aiplatform.googleapis.com/v1/projects/${process.env.GCP_PROJECT_ID}/locations/${process.env.GCP_REGION}/publishers/google/models/${process.env.VERTEX_AI_MODEL}:streamGenerateContent`,
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: genCfg,
    },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const text = resp.data
    .flatMap((r) => r.candidates || [])
    .flatMap((c) => c.content?.parts || [])
    .map((p) => p.text || "")
    .join("");

  return JSON.parse(
    text
      .replace(/^```json/, "")
      .replace(/```$/, "")
      .trim()
  );
}

// async function getToken() {
//   const auth = new GoogleAuth({
//     keyFile: "service-account.json",
//     scopes: ["https://www.googleapis.com/auth/cloud-platform"],
//   });
//   const client = await auth.getClient();
//   const token = await client.getAccessToken();
//   return token.token;
// }

export async function getToken() {
  const auth = new GoogleAuth({
    credentials: JSON.parse(process.env.GCP_KEY),
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });

  const client = await auth.getClient();
  const token = await client.getAccessToken();

  return token.token;
}
